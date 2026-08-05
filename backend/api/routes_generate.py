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
from core.drivers.base import ImageGenerationRequest, ImageGenerationResponse

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

    # Use the qwen_image_edit driver (same ComfyUI connection, supports check_status)
    driver = get_image_driver("qwen_image_edit")
    if not driver:
        raise HTTPException(status_code=500, detail="ComfyUI image driver not available")

    response = await driver.generate_asset_sheet(
        asset_image_path=asset["primary_image"],
        asset_type=asset.get("type", "character"),
        prompt=req.prompt or "",
        negative_prompt=req.negative_prompt or "",
        seed=req.seed,
    )
    return response.model_dump()


# Keep old endpoint name as alias for backwards compatibility
@router.post("/character-sheet")
async def generate_character_sheet(req: AssetSheetRequest):
    """Alias for /generate/asset-sheet (backwards compatible)."""
    return await generate_asset_sheet(req)
