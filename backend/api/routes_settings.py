"""
Settings Routes - API key management and app configuration.

Stores API keys in a local JSON file (settings.json) in the vault directory.
Keys are loaded into environment variables at startup so drivers can detect them.
"""

import json
import os
from pathlib import Path
from fastapi import APIRouter, HTTPException, UploadFile, File
from pydantic import BaseModel
from typing import Optional, Dict, List

router = APIRouter()

VAULT_DIR = Path(__file__).parent.parent / "assets"
SETTINGS_FILE = VAULT_DIR / "settings.json"
WORKFLOWS_DIR = Path(__file__).parent.parent / "core" / "workflows"

# Supported API key providers
SUPPORTED_KEYS = {
    "FAL_KEY": {
        "label": "Fal.ai API Key",
        "description": "Enables cloud image and video generation via Fal.ai",
        "url": "https://fal.ai/dashboard/keys",
    },
    "REPLICATE_API_TOKEN": {
        "label": "Replicate API Token",
        "description": "Enables cloud image and audio generation via Replicate",
        "url": "https://replicate.com/account/api-tokens",
    },
}


def _load_settings() -> dict:
    """Load settings from the JSON file."""
    if SETTINGS_FILE.exists():
        try:
            return json.loads(SETTINGS_FILE.read_text(encoding="utf-8-sig"))
        except (json.JSONDecodeError, IOError):
            pass
    return {}


def _save_settings(data: dict):
    """Save settings to the JSON file."""
    VAULT_DIR.mkdir(parents=True, exist_ok=True)
    SETTINGS_FILE.write_text(json.dumps(data, indent=2))


def _auto_detect_models_dir() -> Optional[str]:
    """Try to find a ComfyUI models directory in common install locations."""
    home = Path.home()
    candidates = [
        # Windows common paths
        Path("C:/ComfyUI/models"),
        Path("D:/ComfyUI/models"),
        Path("D:/AI_Master/ComfyUI-Easy-Install/ComfyUI-Easy-Install/ComfyUI/models"),
        # User home
        home / "ComfyUI" / "models",
        home / "Documents" / "ComfyUI" / "models",
        # Relative to backend (portable install)
        Path(__file__).parent.parent.parent / "ComfyUI" / "models",
        Path(__file__).parent.parent / "ComfyUI" / "models",
        # Common drive letters (Windows)
        Path("C:/Users") / os.getenv("USERNAME", "") / "ComfyUI" / "models",
    ]
    # Also check COMFY_DIR env var
    comfy_dir = os.getenv("COMFY_DIR", "")
    if comfy_dir:
        candidates.append(Path(comfy_dir) / "models")
        candidates.append(Path(comfy_dir))

    for candidate in candidates:
        try:
            if candidate.exists() and candidate.is_dir():
                # Verify it has at least one model subdirectory
                if any((candidate / sub).is_dir() for sub in ("loras", "checkpoints", "unet", "diffusion_models")):
                    return str(candidate)
        except (OSError, PermissionError):
            continue
    return None


def load_api_keys_into_env():
    """Load saved API keys and ComfyUI config into environment variables at startup."""
    settings = _load_settings()
    api_keys = settings.get("api_keys", {})
    for key_name, value in api_keys.items():
        if value and key_name not in os.environ:
            os.environ[key_name] = value
            print(f"[Settings] Loaded API key '{key_name}' from settings.json")

    comfy_config = settings.get("comfy_config", {})
    if comfy_config.get("url"):
        os.environ["COMFY_URL"] = comfy_config["url"]
        print(f"[Settings] Loaded ComfyUI URL from settings.json: {comfy_config['url']}")
    if comfy_config.get("auth_token"):
        os.environ["COMFY_AUTH_TOKEN"] = comfy_config["auth_token"]

    # Models directory — use saved value, then env var, then auto-detect
    models_dir = comfy_config.get("models_dir") or os.getenv("COMFY_MODELS_DIR", "")
    if not models_dir:
        detected = _auto_detect_models_dir()
        if detected:
            models_dir = detected
            print(f"[Settings] Auto-detected ComfyUI models dir: {models_dir}")
    if models_dir:
        os.environ["COMFY_MODELS_DIR"] = models_dir
        if not comfy_config.get("models_dir"):
            print(f"[Settings] Using models dir: {models_dir} (auto-detected — set in Settings to override)")
        else:
            print(f"[Settings] Loaded ComfyUI models dir from settings.json: {models_dir}")
    if comfy_config.get("loras_dir"):
        os.environ["COMFY_LORAS_DIR"] = comfy_config["loras_dir"]
        print(f"[Settings] Loaded ComfyUI loras dir from settings.json: {comfy_config['loras_dir']}")
    if comfy_config.get("checkpoints_dir"):
        os.environ["COMFY_CHECKPOINTS_DIR"] = comfy_config["checkpoints_dir"]
        print(f"[Settings] Loaded ComfyUI checkpoints dir from settings.json: {comfy_config['checkpoints_dir']}")
    # Extra model directories — stored as JSON string in env for the scan code to read
    extra_dirs = comfy_config.get("extra_model_dirs", [])
    if extra_dirs:
        os.environ["COMFY_EXTRA_MODEL_DIRS"] = json.dumps(extra_dirs)
        print(f"[Settings] Loaded {len(extra_dirs)} extra model dir(s) from settings.json")


@router.get("/api-keys")
async def get_api_keys():
    """Return the current API key configuration (values masked)."""
    settings = _load_settings()
    api_keys = settings.get("api_keys", {})

    result = {}
    for key_name, info in SUPPORTED_KEYS.items():
        value = api_keys.get(key_name, "")
        result[key_name] = {
            "label": info["label"],
            "description": info["description"],
            "url": info["url"],
            "is_set": bool(value),
            "masked_value": value[:8] + "..." + value[-4:] if len(value) > 12 else ("***" if value else ""),
        }
    return result


class SaveApiKeyRequest(BaseModel):
    key_name: str
    value: str


@router.post("/api-keys")
async def save_api_key(req: SaveApiKeyRequest):
    """Save or update an API key."""
    if req.key_name not in SUPPORTED_KEYS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported key: {req.key_name}. Supported: {list(SUPPORTED_KEYS.keys())}",
        )

    settings = _load_settings()
    if "api_keys" not in settings:
        settings["api_keys"] = {}

    settings["api_keys"][req.key_name] = req.value
    _save_settings(settings)

    # Update env var immediately
    os.environ[req.key_name] = req.value
    print(f"[Settings] Saved API key '{req.key_name}'")

    return {"status": "ok", "key_name": req.key_name}


@router.delete("/api-keys/{key_name}")
async def delete_api_key(key_name: str):
    """Remove an API key."""
    if key_name not in SUPPORTED_KEYS:
        raise HTTPException(status_code=400, detail=f"Unsupported key: {key_name}")

    settings = _load_settings()
    api_keys = settings.get("api_keys", {})

    if key_name in api_keys:
        del api_keys[key_name]
        settings["api_keys"] = api_keys
        _save_settings(settings)

    # Remove from env
    if key_name in os.environ:
        del os.environ[key_name]

    print(f"[Settings] Deleted API key '{key_name}'")
    return {"status": "ok", "key_name": key_name}


# =============================================================================
# ComfyUI Server Configuration
# =============================================================================


@router.get("/comfy-config")
async def get_comfy_config():
    """Return the current ComfyUI server configuration."""
    settings = _load_settings()
    comfy = settings.get("comfy_config", {})
    # If models_dir not saved, check env (may be auto-detected) or auto-detect now
    models_dir = comfy.get("models_dir", "")
    if not models_dir:
        models_dir = os.getenv("COMFY_MODELS_DIR", "")
    if not models_dir:
        detected = _auto_detect_models_dir()
        if detected:
            models_dir = detected
    return {
        "url": comfy.get("url", os.getenv("COMFY_URL", "http://127.0.0.1:8188")),
        "auth_token": comfy.get("auth_token", ""),
        "is_remote": comfy.get("is_remote", False),
        "models_dir": models_dir,
        "loras_dir": comfy.get("loras_dir", os.getenv("COMFY_LORAS_DIR", "")),
        "checkpoints_dir": comfy.get("checkpoints_dir", os.getenv("COMFY_CHECKPOINTS_DIR", "")),
        "extra_model_dirs": comfy.get("extra_model_dirs", []),
        "models_dir_auto_detected": not bool(comfy.get("models_dir")) and bool(models_dir),
    }


class SaveComfyConfigRequest(BaseModel):
    url: str
    auth_token: Optional[str] = ""
    is_remote: bool = False
    models_dir: Optional[str] = ""
    loras_dir: Optional[str] = ""
    checkpoints_dir: Optional[str] = ""
    extra_model_dirs: Optional[List[str]] = []


@router.post("/comfy-config")
async def save_comfy_config(req: SaveComfyConfigRequest):
    """Save ComfyUI server configuration."""
    settings = _load_settings()
    extra_dirs = [d for d in (req.extra_model_dirs or []) if d.strip()]
    settings["comfy_config"] = {
        "url": req.url,
        "auth_token": req.auth_token or "",
        "is_remote": req.is_remote,
        "models_dir": req.models_dir or "",
        "loras_dir": req.loras_dir or "",
        "checkpoints_dir": req.checkpoints_dir or "",
        "extra_model_dirs": extra_dirs,
    }
    _save_settings(settings)

    # Update env immediately
    os.environ["COMFY_URL"] = req.url
    if req.auth_token:
        os.environ["COMFY_AUTH_TOKEN"] = req.auth_token
    elif "COMFY_AUTH_TOKEN" in os.environ:
        del os.environ["COMFY_AUTH_TOKEN"]
    if req.models_dir:
        os.environ["COMFY_MODELS_DIR"] = req.models_dir
        os.environ["COMFY_DIR"] = req.models_dir.replace("/models", "") if req.models_dir.endswith("/models") else req.models_dir
    elif "COMFY_MODELS_DIR" in os.environ:
        del os.environ["COMFY_MODELS_DIR"]
    if req.loras_dir:
        os.environ["COMFY_LORAS_DIR"] = req.loras_dir
    elif "COMFY_LORAS_DIR" in os.environ:
        del os.environ["COMFY_LORAS_DIR"]
    if req.checkpoints_dir:
        os.environ["COMFY_CHECKPOINTS_DIR"] = req.checkpoints_dir
    elif "COMFY_CHECKPOINTS_DIR" in os.environ:
        del os.environ["COMFY_CHECKPOINTS_DIR"]
    if extra_dirs:
        os.environ["COMFY_EXTRA_MODEL_DIRS"] = json.dumps(extra_dirs)
    elif "COMFY_EXTRA_MODEL_DIRS" in os.environ:
        del os.environ["COMFY_EXTRA_MODEL_DIRS"]

    print(f"[Settings] Saved ComfyUI config: url={req.url}, remote={req.is_remote}, models_dir={req.models_dir or '(not set)'}, loras_dir={req.loras_dir or '(not set)'}, extra_dirs={len(extra_dirs)}")
    return {"status": "ok"}


# =============================================================================
# Custom Workflows
# =============================================================================


def get_custom_workflows() -> List[dict]:
    """Return list of custom workflow registrations from settings.json."""
    settings = _load_settings()
    return settings.get("custom_workflows", [])


def get_custom_workflow_by_id(driver_id: str) -> Optional[dict]:
    """Find a custom workflow by its driver_id."""
    for wf in get_custom_workflows():
        if wf.get("driver_id") == driver_id:
            return wf
    return None


@router.get("/workflows")
async def list_workflows():
    """List all custom workflows registered via the UI."""
    return {"workflows": get_custom_workflows()}


class RegisterWorkflowRequest(BaseModel):
    driver_id: str
    display_name: str
    category: str  # "image" or "video"
    workflow_json: dict
    supported_features: List[str] = ["text_to_image"]


@router.post("/workflows")
async def register_workflow(req: RegisterWorkflowRequest):
    """Register a custom ComfyUI workflow.

    Saves the workflow JSON to core/workflows/ and adds a driver entry to settings.json.
    """
    driver_id = req.driver_id.strip()
    if not driver_id or not driver_id.replace("_", "").isalnum():
        raise HTTPException(status_code=400, detail="driver_id must be alphanumeric with underscores only")

    if req.category not in ("image", "video", "audio"):
        raise HTTPException(status_code=400, detail="category must be 'image', 'video', or 'audio'")

    # Check for conflicts with built-in drivers
    from core.drivers import list_image_drivers, list_video_drivers, list_audio_drivers
    existing_ids = {d.driver_id for d in list_image_drivers() + list_video_drivers() + list_audio_drivers()}
    # Allow re-uploading (updating) existing custom ones
    custom_ids = {wf["driver_id"] for wf in get_custom_workflows()}
    if driver_id in existing_ids and driver_id not in custom_ids:
        raise HTTPException(status_code=409, detail=f"driver_id '{driver_id}' conflicts with a built-in driver")

    # Save workflow JSON file
    WORKFLOWS_DIR.mkdir(parents=True, exist_ok=True)
    workflow_path = WORKFLOWS_DIR / f"{driver_id}.json"
    workflow_path.write_text(json.dumps(req.workflow_json, indent=2))
    print(f"[Workflows] Saved workflow JSON to {workflow_path}")

    # Auto-detect capabilities from workflow JSON
    wf_json = req.workflow_json
    supports_megapixels = False
    if isinstance(wf_json, dict):
        for nid, nd in wf_json.items():
            if not isinstance(nd, dict):
                continue
            ct = nd.get("class_type", "")
            if ct in ("ImageScaleToTotalPixels", "ResolutionSelector"):
                supports_megapixels = True
                break
            inputs = nd.get("inputs", {})
            if isinstance(inputs, dict) and "megapixels" in inputs:
                supports_megapixels = True
                break

    # Register in settings.json
    settings = _load_settings()
    if "custom_workflows" not in settings:
        settings["custom_workflows"] = []

    entry = {
        "driver_id": driver_id,
        "display_name": req.display_name,
        "category": req.category,
        "supported_features": req.supported_features,
        "workflow_file": f"{driver_id}.json",
        "supports_loras": True,
        "supports_megapixels": supports_megapixels,
    }

    # Update or append
    existing_idx = None
    for i, wf in enumerate(settings["custom_workflows"]):
        if wf["driver_id"] == driver_id:
            existing_idx = i
            break
    if existing_idx is not None:
        settings["custom_workflows"][existing_idx] = entry
    else:
        settings["custom_workflows"].append(entry)

    _save_settings(settings)
    print(f"[Workflows] Registered custom driver '{driver_id}' ({req.display_name})")

    return {"status": "ok", "driver_id": driver_id, "entry": entry}


@router.delete("/workflows/{driver_id}")
async def delete_workflow(driver_id: str):
    """Remove a custom workflow."""
    settings = _load_settings()
    custom = settings.get("custom_workflows", [])

    original_len = len(custom)
    custom = [wf for wf in custom if wf["driver_id"] != driver_id]

    if len(custom) == original_len:
        raise HTTPException(status_code=404, detail=f"Custom workflow '{driver_id}' not found")

    settings["custom_workflows"] = custom
    _save_settings(settings)

    # Optionally delete the workflow JSON file
    workflow_path = WORKFLOWS_DIR / f"{driver_id}.json"
    if workflow_path.exists():
        workflow_path.unlink()

    print(f"[Workflows] Deleted custom workflow '{driver_id}'")
    return {"status": "ok", "driver_id": driver_id}


# =============================================================================
# Workflow Model Analysis
# =============================================================================

# Maps ComfyUI node class_type → (input field name, model subdirectory, label)
MODEL_NODE_MAP = {
    "CheckpointLoaderSimple": ("ckpt_name", "checkpoints", "Checkpoint"),
    "CheckpointLoader": ("ckpt_name", "checkpoints", "Checkpoint"),
    "UNETLoader": ("unet_name", "unet", "UNet/Diffusion Model"),
    "LoraLoader": ("lora_name", "loras", "LoRA"),
    "LoraLoaderModelOnly": ("lora_name", "loras", "LoRA"),
    "VAELoader": ("vae_name", "vae", "VAE"),
    "CLIPLoader": ("clip_name", "clip", "CLIP/Text Encoder"),
    "CLIPLoaderGGUF": ("clip_name", "clip", "CLIP/Text Encoder"),
    "ControlNetLoader": ("control_net_name", "controlnet", "ControlNet"),
    "DiffControlNetLoader": ("control_net_name", "controlnet", "ControlNet"),
    "UpscaleModelLoader": ("model_name", "upscale_models", "Upscale Model"),
    "GLIGENLoader": ("gligen_name", "gligen", "GLIGEN Model"),
    "HypernetworkLoader": ("hypernetwork_name", "hypernetworks", "Hypernetwork"),
    "StyleModelLoader": ("style_model_name", "style_models", "Style Model"),
    "UnetLoaderGGUF": ("unet_name", "unet", "UNet (GGUF)"),
    "LoraLoaderGGUF": ("lora_name", "loras", "LoRA (GGUF)"),
}


class AnalyzeWorkflowRequest(BaseModel):
    workflow_json: dict


@router.post("/workflows/analyze")
async def analyze_workflow(req: AnalyzeWorkflowRequest):
    """Analyze a ComfyUI workflow JSON (API format) and extract required models.

    Returns a list of model references with their types, filenames, and target directories.
    """
    workflow = req.workflow_json
    if not isinstance(workflow, dict):
        raise HTTPException(status_code=400, detail="Workflow JSON must be an object")

    # ComfyUI API format: { "node_id": { "class_type": "...", "inputs": {...} } }
    # Or wrapped: { "workflow": { "nodes": [...] } } (UI format — not API format)
    models = []
    seen = set()

    if "nodes" in workflow and isinstance(workflow["nodes"], list):
        # UI format — extract from nodes array
        for node in workflow["nodes"]:
            class_type = node.get("class_type", node.get("type", ""))
            widgets = node.get("widgets_values", [])
            if class_type in MODEL_NODE_MAP:
                field_name, subdir, label = MODEL_NODE_MAP[class_type]
                # In UI format, widget values are positional — try to find the model name
                # This is less reliable, but we can check if any widget value looks like a model file
                for wv in widgets:
                    if isinstance(wv, str) and any(wv.endswith(ext) for ext in
                        (".safetensors", ".pt", ".pth", ".ckpt", ".gguf", ".bin")):
                        key = (subdir, wv)
                        if key not in seen:
                            seen.add(key)
                            models.append({
                                "node_type": class_type,
                                "field": field_name,
                                "filename": wv,
                                "subdirectory": subdir,
                                "label": label,
                            })
                        break
    else:
        # API format — the standard
        for node_id, node in workflow.items():
            if not isinstance(node, dict):
                continue
            class_type = node.get("class_type", "")
            inputs = node.get("inputs", {})
            if class_type in MODEL_NODE_MAP:
                field_name, subdir, label = MODEL_NODE_MAP[class_type]
                filename = inputs.get(field_name)
                if filename and isinstance(filename, str):
                    key = (subdir, filename)
                    if key not in seen:
                        seen.add(key)
                        models.append({
                            "node_type": class_type,
                            "field": field_name,
                            "filename": filename,
                            "subdirectory": subdir,
                            "label": label,
                        })

    return {"models": models}


# Maps node class_type → the ComfyUI object_info endpoint to query for available models
# Same as MODEL_NODE_MAP but used for checking existence
NODE_TO_OBJECT_INFO = {
    "CheckpointLoaderSimple": "CheckpointLoaderSimple",
    "CheckpointLoader": "CheckpointLoaderSimple",
    "UNETLoader": "UNETLoader",
    "UnetLoaderGGUF": "UnetLoaderGGUF",
    "LoraLoader": "LoraLoader",
    "LoraLoaderModelOnly": "LoraLoader",
    "LoraLoaderGGUF": "LoraLoader",
    "VAELoader": "VAELoader",
    "CLIPLoader": "CLIPLoader",
    "CLIPLoaderGGUF": "CLIPLoaderGGUF",
    "ControlNetLoader": "ControlNetLoader",
    "DiffControlNetLoader": "ControlNetLoader",
    "UpscaleModelLoader": "UpscaleModelLoader",
    "GLIGENLoader": "GLIGENLoader",
    "HypernetworkLoader": "HypernetworkLoader",
    "StyleModelLoader": "StyleModelLoader",
}


class CheckModelsRequest(BaseModel):
    models: List[dict]  # List of model refs from analyze endpoint


@router.post("/workflows/check-models")
async def check_workflow_models(req: CheckModelsRequest):
    """Check which required models already exist in ComfyUI.

    Queries ComfyUI's object_info API for each node type and compares
    the available model names against the required filenames.

    Returns a list with found: true/false for each model.
    """
    import aiohttp

    comfy_url = os.getenv("COMFY_URL", "http://127.0.0.1:8188")
    auth_token = os.getenv("COMFY_AUTH_TOKEN", "")

    # Group models by node_type to batch queries
    # Many models may share the same node type (e.g., multiple LoRAs)
    node_types_needed = set()
    for model in req.models:
        nt = model.get("node_type", "")
        if nt in NODE_TO_OBJECT_INFO:
            node_types_needed.add(NODE_TO_OBJECT_INFO[nt])

    # Query ComfyUI for each node type's available models
    # Key: (node_type, field_name) → set of available filenames
    available_map: Dict[str, set] = {}
    headers = {}
    if auth_token:
        headers["Authorization"] = f"Bearer {auth_token}"

    try:
        async with aiohttp.ClientSession(headers=headers) as session:
            for node_type in node_types_needed:
                try:
                    async with session.get(
                        f"{comfy_url}/object_info/{node_type}",
                        timeout=aiohttp.ClientTimeout(total=5),
                    ) as resp:
                        if resp.status != 200:
                            continue
                        data = await resp.json()
                        node_info = data.get(node_type, {})
                        input_spec = node_info.get("input", {})
                        # Check all possible field names in this node's inputs
                        for field_name in ("ckpt_name", "unet_name", "lora_name",
                                           "vae_name", "clip_name", "control_net_name",
                                           "model_name", "gligen_name",
                                           "hypernetwork_name", "style_model_name"):
                            field_input = input_spec.get(field_name, {})
                            if isinstance(field_input, dict):
                                filenames = field_input.get("values", [])
                            elif isinstance(field_input, list):
                                filenames = field_input
                            else:
                                continue
                            key = f"{node_type}:{field_name}"
                            available_map[key] = set(filenames)
                except Exception:
                    continue
    except Exception as e:
        print(f"[Workflows] Failed to query ComfyUI object_info: {e}")

    # Check each required model against available models
    results = []
    for model in req.models:
        node_type = model.get("node_type", "")
        field = model.get("field", "")
        filename = model.get("filename", "")
        comfy_node = NODE_TO_OBJECT_INFO.get(node_type, node_type)
        key = f"{comfy_node}:{field}"
        available = available_map.get(key, set())
        results.append({
            "filename": filename,
            "subdirectory": model.get("subdirectory", ""),
            "found": filename in available,
        })

    return {"results": results}
