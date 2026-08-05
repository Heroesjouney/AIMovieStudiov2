"""
Fal.ai Video Driver - Seedance 2/2.5 + Minimax H3

Cloud video generation via Fal.ai's queue-based async API.
Supports text-to-video (T2V), image-to-video (I2V with first/last frame),
and reference-to-video (R2V with subject/scene/style/motion/voice lock).

Requires:
    FAL_KEY environment variable
"""

import asyncio
import os
import uuid
from datetime import datetime
from pathlib import Path
from typing import List, Optional

import httpx
import fal_client

from .base import (
    VideoDriver, VideoGenerationRequest, VideoGenerationResponse,
    GenerationStatus, DriverCategory, DriverInfo, AspectRatio,
    VideoGenerationMode,
)

MAX_RETRIES = 3
RETRY_DELAY = 2.0


# Camera movement preset → Fal camera params
# Fal Seedance supports camera controls via a "camera" object.
FAL_CAMERA_PRESETS = {
    "static": {"type": "static"},
    "dolly_in": {"type": "zoom_in", "intensity": 1.0},
    "dolly_out": {"type": "zoom_out", "intensity": 1.0},
    "pan_left": {"type": "pan_left", "intensity": 1.0},
    "pan_right": {"type": "pan_right", "intensity": 1.0},
    "tilt_up": {"type": "tilt_up", "intensity": 1.0},
    "tilt_down": {"type": "tilt_down", "intensity": 1.0},
    "crane_up": {"type": "crane_up", "intensity": 1.0},
    "crane_down": {"type": "crane_down", "intensity": 1.0},
    "orbit_left": {"type": "orbit_left", "intensity": 1.0},
    "orbit_right": {"type": "orbit_right", "intensity": 1.0},
    "handheld": {"type": "handheld", "intensity": 1.0},
    "zoom_in": {"type": "zoom_in", "intensity": 1.5},
    "zoom_out": {"type": "zoom_out", "intensity": 1.5},
    "dolly_zoom": {"type": "dolly_zoom", "intensity": 1.0},
}


class FalVideoDriver(VideoDriver):
    """
    Cloud video generation driver via Fal.ai.
    
    Supports multiple models: Seedance 2, Seedance 2.5, Minimax H3.
    """

    MODEL_IDS = {
        "seedance": "fal-ai/seedance/v1.0/i2v",
        "seedance_2": "fal-ai/seedance/v2/i2v",
        "seedance_2_5": "fal-ai/seedance/v2.5/i2v",
        "minimax_h3": "fal-ai/minimax-video-01",
    }

    def __init__(self, model_id: str = "seedance_2_5", api_key: Optional[str] = None):
        self._model_key = model_id
        self._fal_model_id = self.MODEL_IDS.get(model_id, model_id)
        self._api_key = api_key or os.getenv("FAL_KEY")
        if not self._api_key:
            raise ValueError("FAL_KEY environment variable required for Fal.ai video driver")
        os.environ["FAL_KEY"] = self._api_key
        self._job_cache: dict[str, dict] = {}

    @property
    def driver_id(self) -> str:
        return f"fal_{self._model_key}"

    @property
    def driver_name(self) -> str:
        names = {
            "seedance": "Seedance v1 (Fal.ai)",
            "seedance_2": "Seedance 2 (Fal.ai)",
            "seedance_2_5": "Seedance 2.5 (Fal.ai)",
            "minimax_h3": "Minimax H3 (Fal.ai)",
        }
        return names.get(self._model_key, f"Fal.ai ({self._model_key})")

    @property
    def category(self) -> DriverCategory:
        return DriverCategory.CLOUD

    @property
    def supported_features(self) -> List[str]:
        if self._model_key in ("seedance", "seedance_2", "seedance_2_5"):
            return ["text_to_video", "image_to_video", "first_last_frame", "camera_control"]
        # minimax_h3 (Fal) — T2V + I2V
        return ["text_to_video", "image_to_video"]

    @property
    def max_duration_seconds(self) -> float:
        durations = {
            "seedance": 10.0,
            "seedance_2": 10.0,
            "seedance_2_5": 10.0,
            "minimax_h3": 6.0,
        }
        return durations.get(self._model_key, 10.0)

    def _build_fal_request(self, request: VideoGenerationRequest) -> dict:
        """Build the Fal.ai API arguments dict from a VideoGenerationRequest."""
        fal_request: dict = {"prompt": request.prompt}

        if request.negative_prompt:
            fal_request["negative_prompt"] = request.negative_prompt
        if request.seed is not None:
            fal_request["seed"] = request.seed
        if request.aspect_ratio:
            fal_request["aspect_ratio"] = request.aspect_ratio.value
        if request.duration_seconds:
            # Fal expects "duration" in seconds for Seedance
            fal_request["duration"] = str(int(request.duration_seconds))

        # I2V / R2V: first frame
        if request.first_frame_path:
            fal_request["image_url"] = request.first_frame_path
        # I2V interpolation: last frame
        if request.last_frame_path:
            fal_request["tail_image_url"] = request.last_frame_path

        # R2V: additional reference images (subject/scene/style lock)
        if request.reference_image_paths:
            # Fal Seedance 2/2.5 accept a list of reference image URLs
            fal_request["reference_images"] = request.reference_image_paths

        # R2V: motion/video reference
        if request.reference_video_path:
            fal_request["video_url"] = request.reference_video_path

        # R2V: audio/voice reference (MiniMax H3 voice lock)
        if request.reference_audio_path:
            fal_request["audio_url"] = request.reference_audio_path

        # Camera movement → Fal camera params
        if request.camera_movement:
            preset = request.camera_movement.get("preset", "static")
            intensity = request.camera_movement.get("intensity", 1.0)
            cam = FAL_CAMERA_PRESETS.get(preset, {"type": "static"})
            cam = {**cam, "intensity": intensity}
            fal_request["camera"] = cam

        # Merge any extra params from the caller
        fal_request.update(request.extra_params)
        return fal_request

    async def generate(self, request: VideoGenerationRequest) -> VideoGenerationResponse:
        job_id = str(uuid.uuid4())
        fal_request = self._build_fal_request(request)

        for attempt in range(MAX_RETRIES):
            try:
                handle = await asyncio.to_thread(
                    fal_client.submit,
                    self._fal_model_id,
                    arguments=fal_request,
                )
                request_id = handle.request_id
                self._job_cache[request_id] = {
                    "handle": handle,
                    "request": request.model_dump(),
                    "submitted_at": datetime.utcnow().isoformat(),
                }
                return VideoGenerationResponse(
                    job_id=request_id,
                    status=GenerationStatus.IN_QUEUE,
                    metadata={"provider": "fal.ai", "model": self._fal_model_id},
                )
            except Exception as e:
                if attempt < MAX_RETRIES - 1:
                    await asyncio.sleep(RETRY_DELAY * (2 ** attempt))
                    continue
                return VideoGenerationResponse(
                    job_id=job_id,
                    status=GenerationStatus.FAILED,
                    error_message=f"Failed after {MAX_RETRIES} attempts: {str(e)}",
                )

    async def check_status(self, job_id: str) -> VideoGenerationResponse:
        job = self._job_cache.get(job_id)
        if not job:
            return VideoGenerationResponse(
                job_id=job_id,
                status=GenerationStatus.FAILED,
                error_message="Job not found in cache",
            )

        try:
            handle = job["handle"]
            status = await asyncio.to_thread(lambda: handle.status())

            if status == "COMPLETED":
                result = await asyncio.to_thread(lambda: handle.get())
                video_url = None
                if isinstance(result, dict):
                    video_url = result.get("video", {}).get("url") or result.get("url")
                return VideoGenerationResponse(
                    job_id=job_id,
                    status=GenerationStatus.COMPLETED,
                    video_url=video_url,
                    metadata={"provider": "fal.ai", "result": result},
                )
            elif status == "FAILED":
                return VideoGenerationResponse(
                    job_id=job_id,
                    status=GenerationStatus.FAILED,
                    error_message="Generation failed on Fal.ai",
                )
            elif status == "IN_QUEUE":
                return VideoGenerationResponse(
                    job_id=job_id,
                    status=GenerationStatus.IN_QUEUE,
                )
            else:
                return VideoGenerationResponse(
                    job_id=job_id,
                    status=GenerationStatus.PROCESSING,
                )
        except Exception as e:
            return VideoGenerationResponse(
                job_id=job_id,
                status=GenerationStatus.FAILED,
                error_message=str(e),
            )

    async def download(self, job_id: str, output_dir: str) -> str:
        job = self._job_cache.get(job_id)
        if not job:
            raise ValueError("Job not found")

        result = await asyncio.to_thread(lambda: job["handle"].get())
        video_url = None
        if isinstance(result, dict):
            video_url = result.get("video", {}).get("url") or result.get("url")

        if not video_url:
            raise ValueError("No video URL in result")

        Path(output_dir).mkdir(parents=True, exist_ok=True)
        output_path = Path(output_dir) / f"{job_id}.mp4"

        async with httpx.AsyncClient() as client:
            resp = await client.get(video_url)
            resp.raise_for_status()
            output_path.write_bytes(resp.content)

        return str(output_path)

    def get_info(self) -> DriverInfo:
        return DriverInfo(
            driver_id=self.driver_id,
            display_name=self.driver_name,
            category=self.category,
            supported_features=self.supported_features,
            max_duration_seconds=self.max_duration_seconds,
            requires_api_key=True,
            api_key_env_var="FAL_KEY",
        )
