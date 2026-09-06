"""
Generate Routes - Direct image generation (not shot-bound) + driver listing.

Used by the Asset generation panel and the model selector dropdown.
"""

import json
import os
from pathlib import Path
from fastapi import APIRouter, HTTPException, UploadFile, File
from pydantic import BaseModel
from typing import Optional, List

from core.drivers import (
    get_image_driver, list_image_drivers, list_video_drivers, list_audio_drivers,
)
from core.drivers.base import ImageGenerationRequest, ImageGenerationResponse, GenerationStatus
from core.drivers.lora_utils import fetch_lora_list

router = APIRouter()

VAULT_DIR = Path(__file__).parent.parent / "assets"


@router.get("/drivers")
async def get_all_drivers():
    """List all available drivers (image, video, audio) for frontend dropdowns."""
    return {
        "image": [d.model_dump() for d in list_image_drivers()],
        "video": [d.model_dump() for d in list_video_drivers()],
        "audio": [d.model_dump() for d in list_audio_drivers()],
    }


@router.get("/drivers/image")
async def get_image_drivers():
    return [d.model_dump() for d in list_image_drivers()]


@router.get("/drivers/video")
async def get_video_drivers():
    return [d.model_dump() for d in list_video_drivers()]


@router.get("/drivers/audio")
async def get_audio_drivers():
    return [d.model_dump() for d in list_audio_drivers()]


@router.get("/loras")
async def list_loras():
    """List available LoRA models from the local ComfyUI instance."""
    comfy_url = os.getenv("COMFY_URL", "http://127.0.0.1:8188")
    loras = await fetch_lora_list(comfy_url)
    return {"loras": loras, "comfy_url": comfy_url}


@router.post("/loras/upload")
async def upload_lora(file: UploadFile = File(...)):
    """Upload a LoRA file (.safetensors) to ComfyUI's models/loras directory.

    The target directory is determined by (in order):
    1. COMFY_LORAS_DIR env var
    2. COMFY_MODELS_DIR env var + /loras
    3. COMFY_DIR env var + /models/loras
    4. Fallback: ./ComfyUI/models/loras relative to CWD
    """
    loras_dir = (
        os.getenv("COMFY_LORAS_DIR")
        or (os.path.join(os.getenv("COMFY_MODELS_DIR", ""), "loras") if os.getenv("COMFY_MODELS_DIR") else None)
        or (os.path.join(os.getenv("COMFY_DIR", ""), "models", "loras") if os.getenv("COMFY_DIR") else None)
        or os.path.join(os.getcwd(), "ComfyUI", "models", "loras")
    )

    loras_path = Path(loras_dir)
    if not loras_path.exists():
        raise HTTPException(
            status_code=400,
            detail=f"ComfyUI loras directory not found: {loras_path}. Set COMFY_LORAS_DIR or COMFY_DIR env var.",
        )

    # Validate file extension
    filename = file.filename or "uploaded.safetensors"
    if not filename.lower().endswith((".safetensors", ".pt", ".pth", ".ckpt", ".gguf")):
        raise HTTPException(
            status_code=400,
            detail="Only .safetensors, .pt, .pth, .ckpt, or .gguf files are allowed.",
        )

    dest = loras_path / filename
    if dest.exists():
        raise HTTPException(
            status_code=409,
            detail=f"A LoRA named '{filename}' already exists.",
        )

    # Write the file
    content = await file.read()
    dest.write_bytes(content)
    print(f"[LoRA] Uploaded '{filename}' ({len(content)} bytes) to {dest}")

    return {"name": filename, "size_bytes": len(content), "path": str(dest)}


@router.get("/models")
async def list_models():
    """List available checkpoint models from the local ComfyUI instance."""
    comfy_url = os.getenv("COMFY_URL", "http://127.0.0.1:8188")
    import aiohttp

    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(
                f"{comfy_url}/object_info/CheckpointLoaderSimple",
                timeout=aiohttp.ClientTimeout(total=10),
            ) as resp:
                if resp.status != 200:
                    return {"models": [], "comfy_url": comfy_url}
                data = await resp.json()
                ckpt_info = data.get("CheckpointLoaderSimple", {})
                input_spec = ckpt_info.get("input", {})
                ckpt_input = input_spec.get("ckpt_name", {})
                if isinstance(ckpt_input, dict):
                    filenames = ckpt_input.get("values", [])
                elif isinstance(ckpt_input, list):
                    filenames = ckpt_input
                else:
                    filenames = []
                return {"models": [{"name": fn} for fn in filenames], "comfy_url": comfy_url}
    except Exception as e:
        print(f"[Models] Failed to fetch checkpoint list from ComfyUI: {e}")
        return {"models": [], "comfy_url": comfy_url}


@router.post("/models/upload")
async def upload_model(file: UploadFile = File(...)):
    """Upload a checkpoint model file to ComfyUI's models/checkpoints directory.

    The target directory is determined by (in order):
    1. COMFY_CHECKPOINTS_DIR env var
    2. COMFY_MODELS_DIR env var + /checkpoints
    3. COMFY_DIR env var + /models/checkpoints
    4. Fallback: ./ComfyUI/models/checkpoints relative to CWD
    """
    ckpt_dir = (
        os.getenv("COMFY_CHECKPOINTS_DIR")
        or (os.path.join(os.getenv("COMFY_MODELS_DIR", ""), "checkpoints") if os.getenv("COMFY_MODELS_DIR") else None)
        or (os.path.join(os.getenv("COMFY_DIR", ""), "models", "checkpoints") if os.getenv("COMFY_DIR") else None)
        or os.path.join(os.getcwd(), "ComfyUI", "models", "checkpoints")
    )

    ckpt_path = Path(ckpt_dir)
    if not ckpt_path.exists():
        raise HTTPException(
            status_code=400,
            detail=f"ComfyUI checkpoints directory not found: {ckpt_path}. Set COMFY_CHECKPOINTS_DIR or COMFY_DIR env var.",
        )

    filename = file.filename or "uploaded.safetensors"
    if not filename.lower().endswith((".safetensors", ".pt", ".pth", ".ckpt", ".gguf")):
        raise HTTPException(
            status_code=400,
            detail="Only .safetensors, .pt, .pth, .ckpt, or .gguf files are allowed.",
        )

    dest = ckpt_path / filename
    if dest.exists():
        raise HTTPException(
            status_code=409,
            detail=f"A model named '{filename}' already exists.",
        )

    content = await file.read()
    dest.write_bytes(content)
    print(f"[Models] Uploaded '{filename}' ({len(content)} bytes) to {dest}")

    return {"name": filename, "size_bytes": len(content), "path": str(dest)}


class GenerateImageRequest(BaseModel):
    prompt: str
    model_id: str = "qwen_image"
    negative_prompt: Optional[str] = None
    width: int = 1024
    height: int = 1024
    seed: Optional[int] = None
    reference_image_paths: List[str] = []
    extra_params: Optional[dict] = None


@router.post("/image")
async def generate_image(
    prompt: str,
    model_id: str = "qwen_image",
    negative_prompt: Optional[str] = None,
    width: int = 1024,
    height: int = 1024,
    seed: Optional[int] = None,
    reference_image_paths: List[str] = None,
    extra_params: Optional[str] = None,
):
    """Generate an image using the selected driver.

    extra_params: JSON-encoded string with optional keys like {"loras": [...], "cfg": ..., "steps": ...}
    """
    driver = get_image_driver(model_id)
    if not driver:
        raise HTTPException(status_code=400, detail=f"Unknown model: {model_id}")

    parsed_extra: dict = {}
    if extra_params:
        try:
            parsed_extra = json.loads(extra_params)
        except (json.JSONDecodeError, TypeError):
            parsed_extra = {}

    req = ImageGenerationRequest(
        prompt=prompt,
        negative_prompt=negative_prompt,
        width=width,
        height=height,
        seed=seed,
        reference_image_paths=reference_image_paths or [],
        extra_params=parsed_extra,
    )
    response = await driver.generate(req)
    return response.model_dump()


@router.get("/status/{job_id}")
async def check_status(job_id: str, model_id: str = "qwen_image"):
    """Check generation status."""
    driver = get_image_driver(model_id)
    if not driver:
        raise HTTPException(status_code=400, detail=f"Unknown model: {model_id}")
    response = await driver.check_status(job_id)
    return response.model_dump()


class AssetSheetRequest(BaseModel):
    project_id: str = "default"
    asset_id: str
    prompt: Optional[str] = None
    negative_prompt: Optional[str] = None
    seed: Optional[int] = None
    model_id: Optional[str] = None


@router.post("/asset-sheet")
async def generate_asset_sheet(req: AssetSheetRequest):
    """Generate a multi-view design sheet from an existing asset (character, prop, vehicle, location)."""
    # Look up the asset to get its primary_image and type
    assets_path = VAULT_DIR / req.project_id / "assets.json"
    if not assets_path.exists():
        raise HTTPException(status_code=404, detail=f"No assets found for project: {req.project_id}")

    with open(assets_path, "r") as f:
        assets = json.load(f)

    asset = next((a for a in assets if a["id"] == req.asset_id), None)
    if not asset:
        raise HTTPException(status_code=404, detail=f"Asset not found: {req.asset_id}")

    if not asset.get("primary_image"):
        raise HTTPException(status_code=400, detail="Asset has no primary image to generate sheet from")

    # Determine which driver to use — default to qwen_image_edit (ComfyUI)
    model_id = req.model_id or "qwen_image_edit"
    driver = get_image_driver(model_id)
    if not driver:
        raise HTTPException(status_code=500, detail=f"Driver '{model_id}' not available")

    # ComfyImageDriver has a dedicated generate_asset_sheet method with sheet-specific workflows
    if hasattr(driver, "generate_asset_sheet"):
        response = await driver.generate_asset_sheet(
            asset_image_path=asset["primary_image"],
            asset_type=asset.get("type", "character"),
            prompt=req.prompt or "",
            negative_prompt=req.negative_prompt or "",
            seed=req.seed,
        )
    else:
        # Cloud drivers (Fal, Replicate) — use standard generate() with sheet prompt
        sheet_prompt = req.prompt or "character sheet, multiple views, front view, side view, back view, three-quarter view, full body turnaround, white background, clean design sheet"
        response = await driver.generate(ImageGenerationRequest(
            prompt=sheet_prompt,
            negative_prompt=req.negative_prompt or "",
            width=1024,
            height=1024,
            seed=req.seed,
            reference_image_paths=[asset["primary_image"]],
        ))

    return response.model_dump()


# Keep old endpoint name as alias for backwards compatibility
@router.post("/character-sheet")
async def generate_character_sheet(req: AssetSheetRequest):
    """Alias for /generate/asset-sheet (backwards compatible)."""
    return await generate_asset_sheet(req)


class TurnaroundSheetRequest(BaseModel):
    project_id: str = "default"
    asset_id: str
    character_description: Optional[str] = None
    prompt: Optional[str] = None
    negative_prompt: Optional[str] = None
    seed: Optional[int] = None


@router.post("/turnaround-sheet")
async def generate_turnaround_sheet(req: TurnaroundSheetRequest):
    """Generate a high-detail 4-view turnaround sheet (front, side, back, three-quarter) from a single character image.

    Submits 4 separate generations using the Multiangle LoRA, then composites them side-by-side.
    Returns a job_id that can be polled via /generate/status/{job_id}?model_id=qwen_image_edit.
    The response metadata includes completed_views/total_views progress during polling.
    """
    assets_path = VAULT_DIR / req.project_id / "assets.json"
    if not assets_path.exists():
        raise HTTPException(status_code=404, detail=f"No assets found for project: {req.project_id}")

    with open(assets_path, "r") as f:
        assets = json.load(f)

    asset = next((a for a in assets if a["id"] == req.asset_id), None)
    if not asset:
        raise HTTPException(status_code=404, detail=f"Asset not found: {req.asset_id}")

    if not asset.get("primary_image"):
        raise HTTPException(status_code=400, detail="Asset has no primary image to generate turnaround from")

    driver = get_image_driver("qwen_image_edit")
    if not driver:
        raise HTTPException(status_code=500, detail="ComfyUI image driver not available")

    response = await driver.generate_turnaround_sheet(
        asset_image_path=asset["primary_image"],
        character_description=req.character_description or "",
        prompt=req.prompt or "",
        negative_prompt=req.negative_prompt or "",
        seed=req.seed,
    )
    return response.model_dump()


class AnalyzeCharacterRequest(BaseModel):
    project_id: str = "default"
    asset_id: str


@router.post("/analyze-character")
async def analyze_character(req: AnalyzeCharacterRequest):
    """Analyze a character image using Qwen2.5-VL and return a text description.

    Submits a VLM captioning job to ComfyUI. Poll with /generate/analyze-status/{job_id}.
    Requires ComfyUI-QwenVL custom node installed in ComfyUI.
    """
    assets_path = VAULT_DIR / req.project_id / "assets.json"
    if not assets_path.exists():
        raise HTTPException(status_code=404, detail=f"No assets found for project: {req.project_id}")

    with open(assets_path, "r") as f:
        assets = json.load(f)

    asset = next((a for a in assets if a["id"] == req.asset_id), None)
    if not asset:
        raise HTTPException(status_code=404, detail=f"Asset not found: {req.asset_id}")

    if not asset.get("primary_image"):
        raise HTTPException(status_code=400, detail="Asset has no primary image to analyze")

    driver = get_image_driver("qwen_image_edit")
    if not driver:
        raise HTTPException(status_code=500, detail="ComfyUI image driver not available")

    try:
        response = await driver.analyze_character(asset["primary_image"])
        return response.model_dump()
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"analyze_character failed: {str(e)}")


@router.get("/analyze-status/{job_id}")
async def check_analysis_status(job_id: str):
    """Check the status of a character analysis (VLM captioning) job."""
    driver = get_image_driver("qwen_image_edit")
    if not driver:
        raise HTTPException(status_code=500, detail="ComfyUI image driver not available")

    response = await driver.check_analysis_status(job_id)
    return response.model_dump()
