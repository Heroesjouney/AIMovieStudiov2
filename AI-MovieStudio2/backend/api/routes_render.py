"""
Render Routes - Video generation and clip management.

Handles image-to-video, text-to-video, and video-to-video generation
through the driver system.
"""

from fastapi import APIRouter, HTTPException
from typing import Optional

from core.drivers import get_video_driver
from core.drivers.base import VideoGenerationRequest

router = APIRouter()


@router.post("/video")
async def render_video(
    prompt: str,
    model_id: str = "ltx_video_2_3",
    negative_prompt: Optional[str] = None,
    duration_seconds: float = 5.0,
    seed: Optional[int] = None,
    first_frame_path: Optional[str] = None,
    last_frame_path: Optional[str] = None,
    reference_video_path: Optional[str] = None,
):
    """Submit a video generation job."""
    driver = get_video_driver(model_id)
    if not driver:
        raise HTTPException(status_code=400, detail=f"Unknown video model: {model_id}")

    req = VideoGenerationRequest(
        prompt=prompt,
        negative_prompt=negative_prompt,
        duration_seconds=duration_seconds,
        seed=seed,
        first_frame_path=first_frame_path,
        last_frame_path=last_frame_path,
        reference_video_path=reference_video_path,
    )
    response = await driver.generate(req)
    return response.model_dump()


@router.get("/status/{job_id}")
async def check_render_status(job_id: str, model_id: str = "ltx_video_2_3"):
    """Check video render status."""
    driver = get_video_driver(model_id)
    if not driver:
        raise HTTPException(status_code=400, detail=f"Unknown model: {model_id}")
    response = await driver.check_status(job_id)
    return response.model_dump()


@router.post("/download/{job_id}")
async def download_video(job_id: str, model_id: str = "ltx_video_2_3", output_dir: str = "assets/videos"):
    """Download a completed video."""
    driver = get_video_driver(model_id)
    if not driver:
        raise HTTPException(status_code=400, detail=f"Unknown model: {model_id}")
    try:
        from pathlib import Path
        out = Path(__file__).parent.parent / output_dir
        out.mkdir(parents=True, exist_ok=True)
        path = await driver.download(job_id, str(out))
        return {"status": "downloaded", "path": path}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
