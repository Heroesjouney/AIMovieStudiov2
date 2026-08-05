"""
Fish Speech Audio Driver - TTS with voice cloning

Supports text-to-speech generation with optional voice cloning
from reference audio samples.

Can run locally via Gradio API or via Replicate cloud.
"""

import asyncio
import os
import uuid
import time
from typing import List, Optional

import aiohttp

from .base import (
    AudioDriver, AudioGenerationRequest, AudioGenerationResponse,
    SFXGenerationRequest, GenerationStatus, DriverCategory, DriverInfo,
)


class FishSpeechDriver(AudioDriver):
    """
    Fish Speech TTS driver.
    
    Uses Replicate-hosted Fish Speech for cloud inference,
    or local Gradio API if available.
    """

    REPLICATE_MODEL = "fishaudio/fish-speech-1.4"

    def __init__(self, api_token: Optional[str] = None, local_url: Optional[str] = None):
        self._api_token = api_token or os.getenv("REPLICATE_API_TOKEN")
        self._local_url = local_url or os.getenv("FISH_SPEECH_URL")
        self._jobs: dict[str, dict] = {}

    @property
    def driver_id(self) -> str:
        return "fish_speech"

    @property
    def driver_name(self) -> str:
        return "Fish Speech"

    @property
    def category(self) -> DriverCategory:
        return DriverCategory.CLOUD if self._api_token else DriverCategory.LOCAL

    @property
    def supports_voice_cloning(self) -> bool:
        return True

    @property
    def supported_languages(self) -> List[str]:
        return ["en", "zh", "ja", "ko", "fr", "de", "es", "pt", "ru", "ar"]

    async def generate_speech(self, request: AudioGenerationRequest) -> AudioGenerationResponse:
        job_id = str(uuid.uuid4())

        if not self._api_token and not self._local_url:
            return AudioGenerationResponse(
                job_id=job_id,
                status=GenerationStatus.FAILED,
                error_message="No Fish Speech backend configured (set REPLICATE_API_TOKEN or FISH_SPEECH_URL)",
            )

        if self._local_url:
            return await self._generate_local(job_id, request)
        return await self._generate_replicate(job_id, request)

    async def _generate_replicate(self, job_id: str, request: AudioGenerationRequest) -> AudioGenerationResponse:
        input_data = {
            "text": request.text,
            "language": request.language,
        }
        if request.reference_audio_path:
            input_data["reference_audio"] = request.reference_audio_path

        headers = {
            "Authorization": f"Bearer {self._api_token}",
            "Content-Type": "application/json",
        }

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
                    return AudioGenerationResponse(
                        job_id=prediction_id,
                        status=GenerationStatus.IN_QUEUE,
                        metadata={"provider": "replicate"},
                    )
        except Exception as e:
            return AudioGenerationResponse(
                job_id=job_id,
                status=GenerationStatus.FAILED,
                error_message=str(e),
            )

    async def _generate_local(self, job_id: str, request: AudioGenerationRequest) -> AudioGenerationResponse:
        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    f"{self._local_url}/api/v1/tts",
                    json={
                        "text": request.text,
                        "language": request.language,
                        "reference_audio": request.reference_audio_path,
                    },
                ) as resp:
                    if resp.status != 200:
                        return AudioGenerationResponse(
                            job_id=job_id,
                            status=GenerationStatus.FAILED,
                            error_message=f"Local Fish Speech error: {await resp.text()}",
                        )
                    result = await resp.json()
                    audio_url = result.get("audio_url")
                    self._jobs[job_id] = {"status": GenerationStatus.COMPLETED, "audio_url": audio_url}
                    return AudioGenerationResponse(
                        job_id=job_id,
                        status=GenerationStatus.COMPLETED,
                        audio_url=audio_url,
                        metadata={"provider": "local"},
                    )
        except Exception as e:
            return AudioGenerationResponse(
                job_id=job_id,
                status=GenerationStatus.FAILED,
                error_message=str(e),
            )

    async def check_status(self, job_id: str) -> AudioGenerationResponse:
        job = self._jobs.get(job_id)
        if not job:
            return AudioGenerationResponse(
                job_id=job_id,
                status=GenerationStatus.FAILED,
                error_message="Job not found",
            )

        if "status" in job and job["status"] == GenerationStatus.COMPLETED:
            return AudioGenerationResponse(
                job_id=job_id,
                status=GenerationStatus.COMPLETED,
                audio_url=job.get("audio_url"),
            )

        headers = {"Authorization": f"Bearer {self._api_token}"} if self._api_token else {}

        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(
                    f"https://api.replicate.com/v1/predictions/{job_id}",
                    headers=headers,
                ) as resp:
                    if resp.status != 200:
                        return AudioGenerationResponse(
                            job_id=job_id,
                            status=GenerationStatus.FAILED,
                            error_message=f"Replicate error: {await resp.text()}",
                        )
                    result = await resp.json()
                    status = result.get("status")

                    if status == "succeeded":
                        output = result.get("output", "")
                        if isinstance(output, list):
                            output = output[0] if output else ""
                        return AudioGenerationResponse(
                            job_id=job_id,
                            status=GenerationStatus.COMPLETED,
                            audio_url=output,
                        )
                    elif status == "failed":
                        return AudioGenerationResponse(
                            job_id=job_id,
                            status=GenerationStatus.FAILED,
                            error_message=result.get("error", "Unknown error"),
                        )
                    elif status == "processing":
                        return AudioGenerationResponse(
                            job_id=job_id,
                            status=GenerationStatus.PROCESSING,
                        )
                    else:
                        return AudioGenerationResponse(
                            job_id=job_id,
                            status=GenerationStatus.IN_QUEUE,
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
            supported_features=["tts", "voice_cloning"],
            requires_api_key=self.category == DriverCategory.CLOUD,
            api_key_env_var="REPLICATE_API_TOKEN" if self.category == DriverCategory.CLOUD else None,
        )
