"""
ComfyUI Image Driver - Qwen Image + Qwen Image Edit

Connects to a local ComfyUI instance for image generation using
Qwen Image (text-to-image) and Qwen Image Edit (image-to-image / inpainting).

Requires:
    - ComfyUI running locally (default: http://127.0.0.1:8188)
    - Qwen Image models installed in ComfyUI/models/
"""

import asyncio
import json
import uuid
import os
import time
from pathlib import Path
from typing import List, Optional, Dict, Any

import aiohttp
from PIL import Image as PILImage

from .base import (
    ImageDriver, ImageGenerationRequest, ImageGenerationResponse,
    GenerationStatus, DriverCategory, DriverInfo,
)


class ComfyImageDriver(ImageDriver):
    """
    Local ComfyUI image generation driver.
    
    Supports multiple models: Qwen Image, Z-Image, Krea 2.
    Workflow JSON templates are loaded from core/workflows/.
    """

    MODEL_INFO = {
        "qwen_image": {
            "name": "Qwen Image (ComfyUI)",
            "workflow_t2i": "qwen_image",
            "workflow_i2i": "qwen_image",
        },
        "comfy_image": {
            "name": "Qwen Image (ComfyUI)",
            "workflow_t2i": "qwen_image",
            "workflow_i2i": "qwen_image",
        },
        "z_image": {
            "name": "Z-Image (ComfyUI)",
            "workflow_t2i": "z_image",
            "workflow_i2i": "z_image",
        },
        "krea2": {
            "name": "Krea 2 (ComfyUI)",
            "workflow_t2i": "krea2",
            "workflow_i2i": "krea2",
        },
        "flux2": {
            "name": "Flux 2 (ComfyUI)",
            "workflow_t2i": "flux2",
            "workflow_i2i": "flux2",
        },
        "qwen_image_edit": {
            "name": "Qwen Image Edit (ComfyUI)",
            "workflow_t2i": "qwen_image_edit",
            "workflow_i2i": "qwen_image_edit",
        },
        "qwen_multiangle": {
            "name": "Qwen Multiangle (ComfyUI)",
            "workflow_t2i": "qwen_multiangle",
            "workflow_i2i": "qwen_multiangle",
        },
        "flux2_kontext": {
            "name": "Flux 2 Kontext (ComfyUI)",
            "workflow_t2i": "flux2_kontext",
            "workflow_i2i": "flux2_kontext",
        },
    }

    def __init__(
        self,
        model_id: str = "qwen_image",
        comfy_url: Optional[str] = None,
        output_dir: Optional[str] = None,
    ):
        self._model_id = model_id
        info = self.MODEL_INFO.get(model_id, self.MODEL_INFO["qwen_image"])
        self._model_name = info["name"]
        self._workflow_t2i = info["workflow_t2i"]
        self._workflow_i2i = info["workflow_i2i"]
        self.comfy_url = comfy_url or os.getenv("COMFY_URL", "http://127.0.0.1:8188")
        self.output_dir = output_dir or os.getenv("COMFY_OUTPUT_DIR", "")
        self._jobs: Dict[str, dict] = {}
        self._workflows: Dict[str, dict] = {}

    def _load_workflow(self, name: str) -> dict:
        """Load a workflow JSON template from the workflows directory."""
        if name in self._workflows:
            return self._workflows[name]
        workflow_path = Path(__file__).parent.parent / "workflows" / f"{name}.json"
        if workflow_path.exists():
            with open(workflow_path, "r") as f:
                wf = json.load(f)
                self._workflows[name] = wf
                return wf
        return {}

    def _resolve_local_path(self, image_url: str) -> Optional[str]:
        """Convert a /assets/ URL or absolute path to a local filesystem path."""
        if image_url.startswith("/assets/"):
            vault_dir = Path(__file__).parent.parent.parent / "assets"
            local = vault_dir / image_url[len("/assets/"):]
            if local.exists():
                return str(local)
        elif Path(image_url).exists():
            return image_url
        return None

    async def _upload_to_comfy(self, session: aiohttp.ClientSession, image_path: str) -> str:
        """Upload an image to ComfyUI's /upload endpoint so LoadImage can access it."""
        filename = Path(image_path).name
        with open(image_path, "rb") as f:
            data = aiohttp.FormData()
            data.add_field("image", f, filename=filename)
            async with session.post(f"{self.comfy_url}/upload/image", data=data) as resp:
                if resp.status == 200:
                    result = await resp.json()
                    return result.get("name", filename)
        return filename

    def _resize_to_aspect(self, image_path: str, target_width: int, target_height: int) -> str:
        """Resize an image to target dimensions using cover+crop. Returns new path."""
        img = PILImage.open(image_path).convert("RGB")
        # Cover fit: scale to fill target, then crop center
        ratio = max(target_width / img.width, target_height / img.height)
        new_w, new_h = int(img.width * ratio), int(img.height * ratio)
        img = img.resize((new_w, new_h), PILImage.LANCZOS)
        left = (new_w - target_width) // 2
        top = (new_h - target_height) // 2
        img = img.crop((left, top, left + target_width, top + target_height))
        out_path = str(Path(image_path).parent / f"resized_{int(time.time())}_{Path(image_path).name}")
        img.save(out_path)
        print(f"[ComfyImageDriver]   resized {image_path} -> {target_width}x{target_height} -> {out_path}")
        return out_path

    def _composite_references(self, local_paths: List[str], target_width: int, target_height: int) -> Optional[str]:
        """Composite reference images into a single image for img2img workflows.
        
        The first image (typically the location) is used as the background,
        scaled to fill the target dimensions. Subsequent images (characters, props)
        are overlaid centered on top. This gives the edit model a single coherent
        scene to work with for consistency.
        """
        if not local_paths:
            return None
        if len(local_paths) == 1:
            # Single image — just resize/pad to target aspect ratio
            img = PILImage.open(local_paths[0]).convert("RGB")
            canvas = PILImage.new("RGB", (target_width, target_height), (0, 0, 0))
            img.thumbnail((target_width, target_height), PILImage.LANCZOS)
            x = (target_width - img.width) // 2
            y = (target_height - img.height) // 2
            canvas.paste(img, (x, y))
            output_path = str(Path(local_paths[0]).parent / f"composite_{int(time.time())}.png")
            canvas.save(output_path)
            return output_path

        # Multiple images — first is background (location), rest are overlaid centered
        base = PILImage.open(local_paths[0]).convert("RGB")
        # Scale base to fill target dimensions (cover fit)
        base_ratio = max(target_width / base.width, target_height / base.height)
        base = base.resize((int(base.width * base_ratio), int(base.height * base_ratio)), PILImage.LANCZOS)
        # Crop to target
        left = (base.width - target_width) // 2
        top = (base.height - target_height) // 2
        canvas = base.crop((left, top, left + target_width, top + target_height))

        # Overlay additional images (characters/props) centered, scaled to 40% of canvas width
        overlay_w = int(target_width * 0.4)
        for p in local_paths[1:]:
            overlay = PILImage.open(p).convert("RGBA")
            overlay.thumbnail((overlay_w, target_height), PILImage.LANCZOS)
            x = (target_width - overlay.width) // 2
            y = (target_height - overlay.height) // 2
            canvas = canvas.convert("RGBA")
            canvas.paste(overlay, (x, y), overlay)
            canvas = canvas.convert("RGB")

        output_path = str(Path(local_paths[0]).parent / f"composite_{int(time.time())}.png")
        canvas.save(output_path)
        print(f"[ComfyImageDriver]   composited {len(local_paths)} refs (base+overlay) into {target_width}x{target_height} -> {output_path}")
        return output_path

    def _inject_params(self, workflow: dict, prompt: str, negative: str, width: int, height: int, seed: Optional[int], reference_path: Optional[str] = None, denoise: Optional[float] = None, reference_image_paths: Optional[List[str]] = None) -> dict:
        """Inject generation parameters into a ComfyUI workflow template."""
        wf = json.loads(json.dumps(workflow))  # Deep copy
        actual_seed = seed if seed is not None else int(time.time()) % (2**32)
        ref_paths = reference_image_paths or ([reference_path] if reference_path else [])
        load_image_nodes = []  # Track LoadImage nodes for multi-reference injection

        for node_id, node in wf.items():
            ct = node.get("class_type", "")
            inputs = node.get("inputs", {})

            # Prompt injection — handle CLIPTextEncode nodes
            if ct == "CLIPTextEncode":
                text = inputs.get("text", "")
                if "PROMPT_PLACEHOLDER" in text or "{prompt}" in text or "__PROMPT__" in text:
                    inputs["text"] = prompt
                elif "NEGATIVE_PROMPT_PLACEHOLDER" in text or "__NEGATIVE__" in text:
                    inputs["text"] = negative or ""

            # Prompt injection — handle TextEncodeQwenImageEdit and TextEncodeQwenImageEditPlus
            elif ct in ("TextEncodeQwenImageEdit", "TextEncodeQwenImageEditPlus"):
                p = inputs.get("prompt", "")
                if "{prompt}" in p or "__PROMPT__" in p:
                    inputs["prompt"] = prompt
                elif "{negative_prompt}" in p or "__NEGATIVE__" in p:
                    inputs["prompt"] = negative or ""

            # Width/height — handle all latent image node types
            elif ct in ("EmptyLatentImage", "EmptySD3LatentImage", "EmptyFlux2LatentImage"):
                inputs["width"] = width
                inputs["height"] = height

            # Seed — handle KSampler and RandomNoise
            elif ct == "KSampler":
                inputs["seed"] = actual_seed
                if "denoise" in inputs:
                    dv = inputs["denoise"]
                    if isinstance(dv, str) and ("{denoise}" in dv or "__DENOISE__" in dv):
                        # qwen_image_edit with TextEncodeQwenImageEditPlus uses references
                        # as visual context via Qwen VL encoder, not as a base latent to edit.
                        # denoise=1.0 generates from noise using all images as references.
                        # Lower values (0.55) just reproduce image1 with light edits.
                        if self._model_id == "qwen_image_edit":
                            inputs["denoise"] = denoise if denoise is not None else 1.0
                        else:
                            inputs["denoise"] = denoise if denoise is not None else (0.55 if ref_paths else 1.0)
                    elif denoise is not None:
                        inputs["denoise"] = denoise
            elif ct == "RandomNoise":
                if "noise_seed" in inputs:
                    inputs["noise_seed"] = actual_seed
                elif "seed" in inputs:
                    inputs["seed"] = actual_seed

            # Denoise for Flux2Scheduler
            elif ct == "Flux2Scheduler":
                if "width" in inputs:
                    inputs["width"] = width
                if "height" in inputs:
                    inputs["height"] = height
                if "denoise" in inputs:
                    dv = inputs["denoise"]
                    if isinstance(dv, str) and ("{denoise}" in dv or "__DENOISE__" in dv):
                        if self._model_id == "qwen_image_edit":
                            inputs["denoise"] = denoise if denoise is not None else 1.0
                        else:
                            inputs["denoise"] = denoise if denoise is not None else (0.55 if ref_paths else 1.0)
                    elif denoise is not None:
                        inputs["denoise"] = denoise

            # Reference image for img2img — collect LoadImage nodes
            elif ct == "LoadImage":
                img_val = str(inputs.get("image", ""))
                is_placeholder = any(ph in img_val for ph in [
                    "{reference_image_path}", "__IMAGE__", "{input_image}",
                    "{input_image2}", "{input_image3}",
                    "{reference_image_1}", "{reference_image_2}",
                    "{reference_image_3}", "{reference_image_4}",
                ])
                if is_placeholder:
                    load_image_nodes.append((node_id, img_val))

            # Image scale for Z-Image
            elif ct == "ImageScaleToTotalPixels":
                if "megapixels" in inputs and isinstance(inputs["megapixels"], str):
                    inputs["megapixels"] = 1.0

        # Inject reference images into LoadImage nodes
        if ref_paths:
            for node_id, img_val in load_image_nodes:
                if "{reference_image_1}" in img_val or "{input_image}" in img_val or "__IMAGE__" in img_val:
                    if len(ref_paths) > 0:
                        wf[node_id]["inputs"]["image"] = ref_paths[0]
                elif "{reference_image_2}" in img_val or "{input_image2}" in img_val:
                    if len(ref_paths) > 1:
                        wf[node_id]["inputs"]["image"] = ref_paths[1]
                    else:
                        wf[node_id]["inputs"]["image"] = ref_paths[-1]
                elif "{reference_image_3}" in img_val or "{input_image3}" in img_val:
                    if len(ref_paths) > 2:
                        wf[node_id]["inputs"]["image"] = ref_paths[2]
                    else:
                        wf[node_id]["inputs"]["image"] = ref_paths[-1]
                elif "{reference_image_4}" in img_val:
                    if len(ref_paths) > 3:
                        wf[node_id]["inputs"]["image"] = ref_paths[3]
                    else:
                        wf[node_id]["inputs"]["image"] = ref_paths[-1]
                elif "{reference_image_path}" in img_val:
                    wf[node_id]["inputs"]["image"] = ref_paths[0]

        return wf

    @property
    def driver_id(self) -> str:
        return self._model_id

    @property
    def driver_name(self) -> str:
        return self._model_name

    @property
    def category(self) -> DriverCategory:
        return DriverCategory.LOCAL

    @property
    def supported_features(self) -> List[str]:
        if self._model_id in ("qwen_image", "comfy_image", "z_image", "krea2", "flux2"):
            return ["text_to_image", "image_to_image", "inpainting", "multi_reference"]
        if self._model_id in ("qwen_image_edit", "qwen_multiangle", "flux2_kontext"):
            return ["image_to_image", "multi_reference", "multi_angle", "storyboard"]
        return []

    async def generate(self, request: ImageGenerationRequest) -> ImageGenerationResponse:
        job_id = str(uuid.uuid4())
        is_img2img = bool(request.reference_image_paths)

        print(f"[ComfyImageDriver] generate: model={self._model_id}, prompt={request.prompt[:80]}..., refs={request.reference_image_paths}")

        # Resolve and upload each reference image separately (up to 3 for multi-reference workflows)
        uploaded_refs: List[str] = []
        if request.reference_image_paths:
            target_w = request.width or 1344
            target_h = request.height or 768
            async with aiohttp.ClientSession() as session:
                for idx, ref_url in enumerate(request.reference_image_paths[:3]):
                    local_path = self._resolve_local_path(ref_url)
                    if local_path:
                        print(f"[ComfyImageDriver]   resolved {ref_url} -> {local_path}")
                        # Resize first image to target aspect ratio — it determines the VAE latent size
                        if idx == 0 and self._model_id == "qwen_image_edit":
                            local_path = self._resize_to_aspect(local_path, target_w, target_h)
                        uploaded_name = await self._upload_to_comfy(session, local_path)
                        print(f"[ComfyImageDriver]   uploaded -> {uploaded_name}")
                        uploaded_refs.append(uploaded_name)
                    else:
                        print(f"[ComfyImageDriver]   could NOT resolve {ref_url}")

        # qwen_image_edit requires a reference image; fall back to qwen_image t2i if none provided
        if self._model_id == "qwen_image_edit" and not uploaded_refs:
            print(f"[ComfyImageDriver]   no refs for qwen_image_edit, falling back to qwen_image t2i")
            workflow_name = "qwen_image"
        else:
            workflow_name = self._workflow_i2i if is_img2img else self._workflow_t2i
        print(f"[ComfyImageDriver]   workflow={workflow_name}, uploaded_refs={uploaded_refs}")
        workflow = self._load_workflow(workflow_name)

        if not workflow:
            return ImageGenerationResponse(
                job_id=job_id,
                status=GenerationStatus.FAILED,
                error_message=f"Workflow template '{workflow_name}' not found",
            )

        wf = self._inject_params(
            workflow,
            prompt=request.prompt,
            negative=request.negative_prompt or "",
            width=request.width,
            height=request.height,
            seed=request.seed,
            denoise=request.denoise_strength,
            reference_image_paths=uploaded_refs if uploaded_refs else None,
        )

        # Debug: log injected LoadImage values and denoise
        for nid, nd in wf.items():
            if nd.get("class_type") == "LoadImage":
                print(f"[ComfyImageDriver]   LoadImage node {nid}: image={nd['inputs'].get('image')}")
            if nd.get("class_type") == "KSampler":
                print(f"[ComfyImageDriver]   KSampler denoise={nd['inputs'].get('denoise')}, steps={nd['inputs'].get('steps')}, cfg={nd['inputs'].get('cfg')}")

        self._jobs[job_id] = {
            "workflow": wf,
            "status": GenerationStatus.PENDING,
            "prompt_id": None,
            "created_at": time.time(),
            "output_images": [],
        }

        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    f"{self.comfy_url}/prompt",
                    json={"prompt": wf},
                ) as resp:
                    if resp.status != 200:
                        error_text = await resp.text()
                        self._jobs[job_id]["status"] = GenerationStatus.FAILED
                        return ImageGenerationResponse(
                            job_id=job_id,
                            status=GenerationStatus.FAILED,
                            error_message=f"ComfyUI error: {error_text}",
                        )
                    result = await resp.json()
                    prompt_id = result.get("prompt_id")
                    self._jobs[job_id]["prompt_id"] = prompt_id
                    self._jobs[job_id]["status"] = GenerationStatus.PROCESSING
        except Exception as e:
            self._jobs[job_id]["status"] = GenerationStatus.FAILED
            return ImageGenerationResponse(
                job_id=job_id,
                status=GenerationStatus.FAILED,
                error_message=f"Failed to connect to ComfyUI: {str(e)}",
            )

        return ImageGenerationResponse(
            job_id=job_id,
            status=GenerationStatus.PROCESSING,
            metadata={"prompt_id": prompt_id, "workflow": workflow_name},
        )

    ASSET_SHEET_PROMPTS = {
        "character": (
            "character sheet, multiple views, front view, side view, back view, "
            "three-quarter view, different expressions, full body turnaround, "
            "white background, clean design sheet"
        ),
        "prop": (
            "prop design sheet, multiple angles, front view, side view, top view, "
            "detail close-ups, different orientations, white background, clean design sheet"
        ),
        "vehicle": (
            "vehicle design sheet, multiple angles, front view, side view, rear view, "
            "three-quarter view, top-down view, white background, clean design sheet"
        ),
        "location": (
            "location design sheet, wide establishing shot, different camera angles, "
            "aerial view, ground level view, interior and exterior views, "
            "lighting variations, clean design sheet"
        ),
    }

    async def generate_asset_sheet(
        self,
        asset_image_path: str,
        asset_type: str,
        prompt: str,
        negative_prompt: str = "",
        seed: Optional[int] = None,
    ) -> ImageGenerationResponse:
        """Generate a multi-view design sheet from an existing asset image."""
        job_id = str(uuid.uuid4())
        workflow = self._load_workflow("character_sheet")

        if not workflow:
            return ImageGenerationResponse(
                job_id=job_id,
                status=GenerationStatus.FAILED,
                error_message="Workflow template 'character_sheet' not found",
            )

        sheet_prompt = prompt or self.ASSET_SHEET_PROMPTS.get(
            asset_type, self.ASSET_SHEET_PROMPTS["character"]
        )
        sheet_negative = negative_prompt or (
            "deformed, blurry, low quality, distorted, watermark, text"
        )

        # Resolve the asset image to a local path
        local_path = self._resolve_local_path(asset_image_path)
        if not local_path:
            return ImageGenerationResponse(
                job_id=job_id,
                status=GenerationStatus.FAILED,
                error_message=f"Asset image not found: {asset_image_path}",
            )

        try:
            async with aiohttp.ClientSession() as session:
                # Upload image to ComfyUI so LoadImage can access it
                comfy_filename = await self._upload_to_comfy(session, local_path)

                wf = self._inject_params(
                    workflow,
                    prompt=sheet_prompt,
                    negative=sheet_negative,
                    width=1024,
                    height=1024,
                    seed=seed,
                    reference_image_paths=[comfy_filename],
                )

                self._jobs[job_id] = {
                    "workflow": wf,
                    "status": GenerationStatus.PENDING,
                    "prompt_id": None,
                    "created_at": time.time(),
                    "output_images": [],
                }

                async with session.post(
                    f"{self.comfy_url}/prompt",
                    json={"prompt": wf},
                ) as resp:
                    if resp.status != 200:
                        error_text = await resp.text()
                        self._jobs[job_id]["status"] = GenerationStatus.FAILED
                        return ImageGenerationResponse(
                            job_id=job_id,
                            status=GenerationStatus.FAILED,
                            error_message=f"ComfyUI error: {error_text}",
                        )
                    result = await resp.json()
                    prompt_id = result.get("prompt_id")
                    self._jobs[job_id]["prompt_id"] = prompt_id
                    self._jobs[job_id]["status"] = GenerationStatus.PROCESSING
        except Exception as e:
            self._jobs[job_id]["status"] = GenerationStatus.FAILED
            return ImageGenerationResponse(
                job_id=job_id,
                status=GenerationStatus.FAILED,
                error_message=f"Failed to connect to ComfyUI: {str(e)}",
            )

        return ImageGenerationResponse(
            job_id=job_id,
            status=GenerationStatus.PROCESSING,
            metadata={"prompt_id": prompt_id, "workflow": "character_sheet"},
        )

    async def check_status(self, job_id: str) -> ImageGenerationResponse:
        job = self._jobs.get(job_id)
        if not job:
            return ImageGenerationResponse(
                job_id=job_id,
                status=GenerationStatus.FAILED,
                error_message="Job not found",
            )

        if job["status"] in (GenerationStatus.COMPLETED, GenerationStatus.FAILED):
            return ImageGenerationResponse(
                job_id=job_id,
                status=job["status"],
                image_urls=job.get("output_images", []),
                image_paths=job.get("output_images", []),
                error_message=job.get("error_message"),
            )

        prompt_id = job.get("prompt_id")
        if not prompt_id:
            return ImageGenerationResponse(
                job_id=job_id,
                status=GenerationStatus.PENDING,
            )

        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(
                    f"{self.comfy_url}/history/{prompt_id}"
                ) as resp:
                    if resp.status == 200:
                        history = await resp.json()
                        if prompt_id in history:
                            outputs = history[prompt_id].get("outputs", {})
                            image_paths = []
                            for node_id, node_output in outputs.items():
                                if "images" in node_output:
                                    for img in node_output["images"]:
                                        filename = img["filename"]
                                        subfolder = img.get("subfolder", "")
                                        img_type = img.get("type", "output")

                                        # Download from ComfyUI and save to Vault
                                        view_url = f"{self.comfy_url}/view?filename={filename}&subfolder={subfolder}&type={img_type}"
                                        vault_dir = Path(__file__).parent.parent.parent / "assets" / "generated"
                                        vault_dir.mkdir(parents=True, exist_ok=True)
                                        local_filename = f"{job_id}_{filename}"
                                        local_path = vault_dir / local_filename

                                        async with session.get(view_url) as img_resp:
                                            if img_resp.status == 200:
                                                img_data = await img_resp.read()
                                                local_path.write_bytes(img_data)
                                                # Return backend-served URL
                                                backend_url = f"/assets/generated/{local_filename}"
                                                image_paths.append(backend_url)
                                            else:
                                                # Fallback to direct ComfyUI URL
                                                image_paths.append(view_url)
                            if image_paths:
                                job["status"] = GenerationStatus.COMPLETED
                                job["output_images"] = image_paths
                                return ImageGenerationResponse(
                                    job_id=job_id,
                                    status=GenerationStatus.COMPLETED,
                                    image_urls=image_paths,
                                    image_paths=image_paths,
                                )
        except Exception as e:
            job["status"] = GenerationStatus.FAILED
            job["error_message"] = str(e)
            return ImageGenerationResponse(
                job_id=job_id,
                status=GenerationStatus.FAILED,
                error_message=str(e),
            )

        return ImageGenerationResponse(
            job_id=job_id,
            status=GenerationStatus.PROCESSING,
        )

    def get_info(self) -> DriverInfo:
        return DriverInfo(
            driver_id=self.driver_id,
            display_name=self.driver_name,
            category=self.category,
            supported_features=self.supported_features,
            requires_api_key=False,
        )
