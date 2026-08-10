"""
Generate Routes - Direct image generation (not shot-bound) + driver listing.

Used by the Asset generation panel and the model selector dropdown.
"""

import json
from pathlib import Path
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, List

from core.drivers import (
    get_image_driver, list_image_drivers, list_video_drivers, list_audio_drivers,
)
from core.drivers.base import ImageGenerationRequest, ImageGenerationResponse, GenerationStatus

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


@router.post("/image")
async def generate_image(
    prompt: str,
    model_id: str = "qwen_image",
    negative_prompt: Optional[str] = None,
    width: int = 1024,
    height: int = 1024,
    seed: Optional[int] = None,
    reference_image_paths: List[str] = None,
):
    """Generate an image using the selected driver."""
    driver = get_image_driver(model_id)
    if not driver:
        raise HTTPException(status_code=400, detail=f"Unknown model: {model_id}")

    req = ImageGenerationRequest(
        prompt=prompt,
        negative_prompt=negative_prompt,
        width=width,
        height=height,
        seed=seed,
        reference_image_paths=reference_image_paths or [],
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
