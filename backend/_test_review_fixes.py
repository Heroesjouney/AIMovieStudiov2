import copy
import time
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock

import pytest
from fastapi import HTTPException

from api import routes_shots
from core import drivers
from core.drivers.base import ImageGenerationRequest, ImageGenerationResponse, GenerationStatus
from core.drivers.comfy_image import ComfyImageDriver
from core.schemas.shot import ShotVariationRequest


class Response:
    def __init__(self, data, status=200):
        self.data = data
        self.status = status

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        return False

    async def json(self):
        return self.data

    async def text(self):
        return str(self.data)

    def raise_for_status(self):
        if self.status >= 400:
            raise RuntimeError(f"HTTP {self.status}")


class Session:
    def __init__(self, history=None):
        self.history = history or {}
        self.submissions = []

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        return False

    def get(self, url):
        return Response(self.history)

    def post(self, url, **kwargs):
        self.submissions.append((url, kwargs))
        return Response({"prompt_id": "test-prompt"})


def assert_graph(workflow):
    for node_id, node in workflow.items():
        for key, value in node.get("inputs", {}).items():
            if isinstance(value, list) and len(value) == 2 and isinstance(value[0], str):
                assert value[0] in workflow, (node_id, key, value)
            if isinstance(value, str):
                assert not (value.startswith("{") and value.endswith("}")), (node_id, key, value)


def test_qwen_text_workflow_does_not_load_z_image():
    workflow = ComfyImageDriver("qwen_image")._load_workflow("qwen_image")
    models = [node["inputs"]["unet_name"] for node in workflow.values() if node["class_type"] == "UNETLoader"]
    assert models and all(name.startswith("qwen_image") and "edit" not in name for name in models)


@pytest.mark.asyncio
async def test_qwen_edit_without_references_does_not_submit(monkeypatch):
    driver = ComfyImageDriver("qwen_image_edit")
    session = Session()
    monkeypatch.setattr(driver, "_get_session", lambda: session)
    response = await driver.generate(ImageGenerationRequest(prompt="A cockpit"))
    assert response.status == GenerationStatus.FAILED
    assert "reference" in response.error_message.lower()
    assert not session.submissions


@pytest.mark.parametrize("count", [1, 2, 3, 4])
def test_flux_reference_graphs_are_valid(count):
    driver = ComfyImageDriver("flux2_kontext")
    workflow = driver._inject_params(driver._load_workflow("flux2_kontext"), "action", "blur", 1344, 768, 42,
                                     reference_image_paths=[f"ref-{i}.png" for i in range(count)])
    assert_graph(workflow)
    assert all(isinstance(node["inputs"]["match_image_size"], bool)
               for node in workflow.values() if node["class_type"] == "ImageStitch")


@pytest.mark.parametrize("workflow_name", ["qwen_image_edit", "qwen_image_edit_establishing", "qwen_multiangle"])
@pytest.mark.parametrize("count", [1, 2, 3])
def test_qwen_reference_graphs_are_valid(workflow_name, count):
    driver = ComfyImageDriver("qwen_image_edit" if workflow_name != "qwen_multiangle" else "qwen_multiangle")
    workflow = driver._inject_params(driver._load_workflow(workflow_name), "action", "blur", 1344, 768, 42,
                                     reference_image_paths=[f"ref-{i}.png" for i in range(count)])
    assert_graph(workflow)
    encoders = [node["inputs"] for node in workflow.values() if node["class_type"] == "TextEncodeQwenImageEditPlus"]
    assert len(encoders) == 2
    for inputs in encoders:
        assert sum(f"image{i}" in inputs for i in range(1, 4)) == count
    if workflow_name != "qwen_multiangle":
        assert workflow["142"]["inputs"]["width"] == 1344
        assert workflow["142"]["inputs"]["height"] == 768
        assert encoders[0]["image1"] == ["78", 0]


def test_registry_reports_workflow_capabilities(monkeypatch):
    monkeypatch.setattr("api.routes_settings.get_custom_workflows", lambda: [])
    monkeypatch.setenv("FAL_KEY", "")
    monkeypatch.setenv("REPLICATE_API_TOKEN", "")
    infos = {info.driver_id: info for info in drivers.list_image_drivers()}
    assert "image_to_image" not in infos["z_image"].supported_features
    assert "image_to_image" not in infos["qwen_image"].supported_features
    assert infos["z_image"].max_reference_images == 0
    assert infos["qwen_image_edit"].max_reference_images == 3
    assert infos["flux2_kontext"].max_reference_images == 4
    for model_id in ["z_image", "qwen_image", "qwen_image_edit", "qwen_multiangle", "flux2_kontext"]:
        assert infos[model_id].supported_features == drivers.get_image_driver(model_id).supported_features


@pytest.mark.parametrize("timed_out", [False, True])
@pytest.mark.asyncio
async def test_all_failed_turnaround_is_terminal(monkeypatch, timed_out):
    driver = ComfyImageDriver("qwen_image_edit")
    job = {"type": "turnaround", "status": GenerationStatus.PROCESSING,
           "child_prompt_ids": ["a", "b"], "child_results": {"a": None, "b": None},
           "view_labels": ["front", "back"], "view_images": [], "output_images": [],
           "created_at": time.time() - (1801 if timed_out else 0)}
    driver._jobs["job"] = job
    history = {} if timed_out else {pid: {"status": {"status_str": "error"}, "outputs": {}} for pid in ["a", "b"]}
    monkeypatch.setattr(driver, "_get_session", lambda: Session(history))
    response = await driver.check_status("job")
    assert response.status == GenerationStatus.FAILED
    assert response.error_message
    repeated = await driver.check_status("job")
    assert repeated.status == GenerationStatus.FAILED
    assert repeated.error_message == response.error_message


@pytest.mark.asyncio
async def test_partial_turnaround_keeps_successful_views(monkeypatch):
    driver = ComfyImageDriver("qwen_image_edit")
    driver._jobs["job"] = {"type": "turnaround", "status": GenerationStatus.PROCESSING,
                          "child_prompt_ids": ["a", "b"], "child_results": {"a": "front.png", "b": "FAILED"},
                          "view_labels": ["front", "back"], "view_images": [], "output_images": [],
                          "created_at": time.time()}
    composite = Mock(return_value="sheet.png")
    monkeypatch.setattr(driver, "_composite_turnaround_views", composite)
    monkeypatch.setattr(driver, "_get_session", lambda: Session())
    response = await driver.check_status("job")
    assert response.status == GenerationStatus.COMPLETED
    composite.assert_called_once_with(["front.png"], ["front"])
    assert response.metadata["failed_views"] == 1


@pytest.fixture
def variation_state(monkeypatch):
    source = {"id": "source", "name": "Pilot", "scene_id": "scene", "frame_image_path": "source.png",
              "assets": [{"asset_id": "hero", "asset_name": "Arra", "role": "character", "image_path": "old.png"}],
              "generation_recipe": {"model_id": "qwen_image_edit", "seed": 7, "denoise": 0.8,
                                    "resolved_negative_prompt": "watermark",
                                    "reference_paths": ["establishing.png", "old.png", "linked.png"],
                                    "params": {"width": 1344, "height": 768, "cfg": 2, "steps": 8,
                                               "loras": [{"name": "style.safetensors", "strength_model": 0.7}],
                                               "checkpoint_override": "custom.safetensors", "megapixels": 1.5,
                                               "linked_reference_paths": ["linked.png"]}}}
    assets = [{"id": "hero", "name": "Arra", "description": "white hair", "primary_image": "hero.png"}]
    save = Mock()
    async def submit(request):
        return ImageGenerationResponse(job_id="job", status=GenerationStatus.PROCESSING,
                                       metadata={"workflow_hash": "hash", "samplers": [{"cfg": request.extra_params.get("cfg", 1),
                                                                                         "steps": request.extra_params.get("steps", 4)}]})
    driver = SimpleNamespace(generate=AsyncMock(side_effect=submit), get_info=lambda: SimpleNamespace(max_reference_images=3))
    monkeypatch.setattr(routes_shots, "_find_shot", lambda *args: copy.deepcopy(source))
    monkeypatch.setattr(routes_shots, "_load_assets", lambda *args: copy.deepcopy(assets))
    monkeypatch.setattr(routes_shots, "_load_shots", lambda *args: [copy.deepcopy(source)])
    monkeypatch.setattr(routes_shots, "_save_shots", save)
    monkeypatch.setattr(routes_shots, "get_image_driver", lambda model_id: driver if model_id != "unknown" else None)
    return SimpleNamespace(source=source, assets=assets, save=save, driver=driver)


@pytest.mark.asyncio
async def test_variation_inherits_settings_and_linked_images(variation_state):
    request = ShotVariationRequest(source_shot_id="source", name="Reverse", prompt="Arra looks back")
    response = await routes_shots.generate_shot_variation(request)
    generated = variation_state.driver.generate.call_args.args[0]
    assert (generated.width, generated.height) == (1344, 768)
    assert generated.reference_image_paths == ["source.png", "hero.png", "linked.png"]
    assert generated.negative_prompt == "watermark"
    assert generated.denoise_strength == 0.8
    for key in ["cfg", "steps", "loras", "checkpoint_override", "megapixels"]:
        assert generated.extra_params[key] == variation_state.source["generation_recipe"]["params"][key]
    assert "Picture 2 defines the character Arra" in generated.prompt
    recipe = response["shot"]["generation_recipe"]
    assert recipe["params"]["linked_reference_paths"] == ["linked.png"]
    assert recipe["params"]["steps"] == 8
    assert recipe["denoise"] == 0.8
    variation_state.save.assert_called_once()


@pytest.mark.parametrize("failure", ["references", "prompt", "model", "missing_image"])
@pytest.mark.asyncio
async def test_invalid_variation_does_not_create_shot(variation_state, failure):
    kwargs = {"source_shot_id": "source", "name": "Variation", "prompt": "Arra"}
    if failure == "references":
        variation_state.source["assets"].extend([{"asset_id": f"extra-{i}", "asset_name": f"extra-{i}", "image_path": f"extra-{i}.png"} for i in range(3)])
    elif failure == "prompt":
        kwargs["prompt"] = "x" * 4001
    elif failure == "model":
        kwargs["model_id"] = "unknown"
    else:
        variation_state.assets[0]["primary_image"] = None
        variation_state.source["assets"][0]["image_path"] = None
    with pytest.raises(HTTPException):
        await routes_shots.generate_shot_variation(ShotVariationRequest(**kwargs))
    variation_state.save.assert_not_called()
    variation_state.driver.generate.assert_not_called()


@pytest.mark.asyncio
async def test_rejected_variation_submission_does_not_create_shot(variation_state):
    variation_state.driver.generate.side_effect = None
    variation_state.driver.generate.return_value = ImageGenerationResponse(job_id="job", status=GenerationStatus.FAILED, error_message="Upload failed")
    result = await routes_shots.generate_shot_variation(ShotVariationRequest(source_shot_id="source", name="Variation", prompt="Arra"))
    assert result["generation"]["status"] == GenerationStatus.FAILED
    variation_state.save.assert_not_called()
