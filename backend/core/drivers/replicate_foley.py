"""
Replicate Foley Driver - Cloud foley generation via Replicate

Supports HunyuanVideo-Foley for video-to-sound-effects generation.
Uses the Replicate REST API with aiohttp.
"""

import asyncio
import os
import uuid
import time
from typing import Optional, Dict, Any

import aiohttp

from .base import (
    AudioDriver, AudioGenerationRequest, AudioGenerationResponse,
    GenerationStatus, DriverCategory, DriverInfo,
)

MAX_RETRIES = 3
RETRY_DELAY = 2.0


class ReplicateFoleyDriver(AudioDriver):
    """
    Cloud foley generation driver via Replicate.

    Uses HunyuanVideo-Foley for video-to-sound-effects generation.
    Requires REPLICATE_API_TOKEN.
    """

    REPLICATE_MODEL = "tencent/hunyuanvideo-foley"

    def __init__(self, api_key: Optional[str] = None):
        self._api_key = api_key or os.getenv("REPLICATE_API_TOKEN")
        if not self._api_key:
            raise ValueError("REPLICATE_API_TOKEN required for Replicate foley driver")
        self._jobs: Dict[str, dict] = {}

    # --- AudioDriver abstract properties ---

    @property
    def driver_id(self) -> str:
        return "replicate_foley"

    @property
    def driver_name(self) -> str:
        return "HunyuanVideo Foley (Replicate)"

    @property
    def category(self) -> DriverCategory:
        return DriverCategory.CLOUD

    @property
    def supports_voice_cloning(self) -> bool:
        return False

    @property
    def supported_languages(self) -> list:
        return ["en"]

    # --- AudioDriver methods ---

    async def generate_speech(self, request: AudioGenerationRequest) -> AudioGenerationResponse:
        """Submit a foley generation job to Replicate."""
        job_id = str(uuid.uuid4())

        # Replicate needs a public URL for the video input
        video_url = request.video_path or request.extra_params.get("video_url")
        if not video_url:
            return AudioGenerationResponse(
                job_id=job_id,
                status=GenerationStatus.FAILED,
                error_message="Video URL required for Replicate foley generation (must be a public URL)",
            )

        input_data = {
            "video_url": video_url,
            "prompt": request.text,
        }
        if request.duration_seconds is not None:
            input_data["duration"] = int(request.duration_seconds)
        if request.negative_prompt:
            input_data["negative_prompt"] = request.negative_prompt

        headers = {
            "Authorization": f"Bearer {self._api_key}",
            "Content-Type": "application/json",
        }

        print(f"[ReplicateFoleyDriver] starting job={job_id}, model={self.REPLICATE_MODEL}")

        for attempt in range(MAX_RETRIES):
            try:
                async with aiohttp.ClientSession() as session:
                    async with session.post(
                        "https://api.replicate.com/v1/predictions",
                        json={"model": self.REPLICATE_MODEL, "input": input_data},
                        headers=headers,
                    ) as resp:
                        if resp.status != 201:
                            error_text = await resp.text()
                            return AudioGenerationResponse(
                                job_id=job_id,
                                status=GenerationStatus.FAILED,
                                error_message=f"Replicate error: {error_text}",
                            )
                        result = await resp.json()
                        prediction_id = result.get("id")
                        self._jobs[prediction_id] = {"created_at": time.time()}
                        print(f"[ReplicateFoleyDriver] submitted prediction_id={prediction_id}")
                        return AudioGenerationResponse(
                            job_id=prediction_id,
                            status=GenerationStatus.IN_QUEUE,
                            metadata={"provider": "replicate"},
                        )
            except Exception as e:
                if attempt < MAX_RETRIES - 1:
                    await asyncio.sleep(RETRY_DELAY * (2 ** attempt))
                    continue
                return AudioGenerationResponse(
                    job_id=job_id,
                    status=GenerationStatus.FAILED,
                    error_message=f"Replicate submission failed: {str(e)}",
                )

    async def check_status(self, job_id: str) -> AudioGenerationResponse:
        """Poll Replicate for job completion."""
        job = self._jobs.get(job_id)
        if not job:
            return AudioGenerationResponse(
                job_id=job_id,
                status=GenerationStatus.FAILED,
                error_message="Job not found",
            )

        headers = {
            "Authorization": f"Bearer {self._api_key}",
        }

        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(
                    f"https://api.replicate.com/v1/predictions/{job_id}",
                    headers=headers,
                ) as resp:
                    result = await resp.json()
                    status = result.get("status")

                    if status == "succeeded":
                        output = result.get("output", "")
                        # Replicate may return a URL string or a dict
                        if isinstance(output, dict):
                            audio_url = output.get("audio_url") or output.get("url")
                        else:
                            audio_url = output
                        print(f"[ReplicateFoleyDriver] completed: audio_url={audio_url}")
                        return AudioGenerationResponse(
                            job_id=job_id,
                            status=GenerationStatus.COMPLETED,
                            audio_url=audio_url,
                            metadata={"provider": "replicate"},
                        )
                    elif status == "failed":
                        error = result.get("error", "Generation failed")
                        return AudioGenerationResponse(
                            job_id=job_id,
                            status=GenerationStatus.FAILED,
                            error_message=str(error),
                        )
                    elif status == "processing":
                        return AudioGenerationResponse(
                            job_id=job_id,
                            status=GenerationStatus.PROCESSING,
                            metadata={"provider": "replicate"},
                        )
                    else:
                        return AudioGenerationResponse(
                            job_id=job_id,
                            status=GenerationStatus.IN_QUEUE,
                            metadata={"provider": "replicate"},
                        )
        except Exception as e:
            return AudioGenerationResponse(
                job_id=job_id,
                status=GenerationStatus.FAILED,
                error_message=str(e),
            )

    def get_info(self) -> DriverInfo:
        return DriverInfo(
            driver_id=self.driver_id,
            display_name=self.driver_name,
            category=self.category,
            supported_features=["foley"],
            requires_api_key=True,
            api_key_env_var="REPLICATE_API_TOKEN",
        )
