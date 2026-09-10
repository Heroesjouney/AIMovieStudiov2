"""
Fal Audio Driver - Cloud audio generation via Fal.ai

Supports:
- MiniMax Music 3 (text-to-music with lyrics)
- HunyuanVideo Foley (video-to-foley sound effects)

Uses the fal_client SDK for submission and polling.
"""

import asyncio
import os
import uuid
from datetime import datetime
from typing import Optional, Dict, Any

import fal_client

from .base import (
    AudioDriver, AudioGenerationRequest, AudioGenerationResponse,
    GenerationStatus, DriverCategory, DriverInfo,
)

MAX_RETRIES = 3
RETRY_DELAY = 2.0


class FalAudioDriver(AudioDriver):
    """
    Cloud audio generation driver via Fal.ai.

    Supports:
    - Music: MiniMax Music 3
    - Foley: HunyuanVideo Foley
    - TTS: ElevenLabs v3, Chatterbox HD, Chatterbox OSS
    """

    MODEL_INFO = {
        "fal_music": {
            "name": "MiniMax Music 3 (Fal)",
            "fal_model": "minimax/music-3",
            "kind": "music",
        },
        "fal_foley": {
            "name": "HunyuanVideo Foley (Fal)",
            "fal_model": "fal-ai/hunyuan-video-foley",
            "kind": "foley",
        },
        "fal_elevenlabs": {
            "name": "ElevenLabs v3 (Fal)",
            "fal_model": "fal-ai/elevenlabs/tts/eleven-v3",
            "kind": "tts",
            "voice_cloning": False,  # Uses voice IDs, not audio reference
        },
        "fal_chatterbox_hd": {
            "name": "Chatterbox HD (Fal)",
            "fal_model": "resemble-ai/chatterboxhd/text-to-speech",
            "kind": "tts",
            "voice_cloning": True,  # Uses audio_url for zero-shot cloning
        },
        "fal_chatterbox": {
            "name": "Chatterbox OSS (Fal)",
            "fal_model": "fal-ai/chatterbox/text-to-speech",
            "kind": "tts",
            "voice_cloning": True,
        },
    }

    def __init__(self, model_id: str = "fal_music", api_key: Optional[str] = None):
        self._model_id = model_id
        info = self.MODEL_INFO.get(model_id, self.MODEL_INFO["fal_music"])
        self._model_name = info["name"]
        self._fal_model = info["fal_model"]
        self._kind = info["kind"]
        self._api_key = api_key or os.getenv("FAL_KEY")
        if not self._api_key:
            raise ValueError("FAL_KEY environment variable required for Fal.ai audio driver")
        os.environ["FAL_KEY"] = self._api_key
        self._job_cache: Dict[str, dict] = {}

    # --- AudioDriver abstract properties ---

    @property
    def driver_id(self) -> str:
        return self._model_id

    @property
    def driver_name(self) -> str:
        return self._model_name

    @property
    def category(self) -> DriverCategory:
        return DriverCategory.CLOUD

    @property
    def supports_voice_cloning(self) -> bool:
        info = self.MODEL_INFO.get(self._model_id, {})
        return info.get("voice_cloning", False)

    @property
    def supported_languages(self) -> list:
        return ["en", "zh", "ja", "ko"]

    # --- Reference audio upload ---

    async def _upload_reference_audio(self, local_path: str) -> Optional[str]:
        """Upload a local reference audio file to Fal storage and return the public URL."""
        try:
            url = await asyncio.to_thread(fal_client.upload_file, local_path)
            print(f"[FalAudioDriver] uploaded reference audio: {url}")
            return url
        except Exception as e:
            print(f"[FalAudioDriver] failed to upload reference audio: {e}")
            return None

    # --- Request building ---

    async def _build_fal_request(self, request: AudioGenerationRequest) -> dict:
        """Build the Fal API input dict for the selected model."""
        if self._kind == "music":
            fal_req = {
                "prompt": request.text,
            }
            if request.lyrics:
                fal_req["lyrics"] = request.lyrics
            if request.duration_seconds is not None:
                fal_req["duration"] = int(request.duration_seconds)
            return fal_req

        elif self._kind == "foley":
            fal_req = {
                "prompt": request.text,
            }
            if request.video_path:
                # Fal needs a public URL for video input
                # If it's a local path, we can't use it directly with Fal
                # The caller should provide a URL via extra_params["video_url"]
                fal_req["video_url"] = request.video_path
            video_url = request.extra_params.get("video_url")
            if video_url:
                fal_req["video_url"] = video_url
            if request.duration_seconds is not None:
                fal_req["duration"] = int(request.duration_seconds)
            if request.negative_prompt:
                fal_req["negative_prompt"] = request.negative_prompt
            return fal_req

        elif self._kind == "tts":
            fal_req = {
                "text": request.text,
            }
            # ElevenLabs uses voice name/ID, not audio reference
            if self._model_id == "fal_elevenlabs":
                voice = request.extra_params.get("voice") or request.voice_id or "Rachel"
                fal_req["voice"] = voice
                if request.speed is not None:
                    fal_req["speed"] = request.speed
            # Chatterbox HD/OSS uses audio_url for voice cloning
            else:
                audio_url = request.extra_params.get("audio_url")
                if audio_url:
                    fal_req["audio_url"] = audio_url
                elif request.reference_audio_path:
                    # Upload local reference audio to Fal storage
                    uploaded_url = await self._upload_reference_audio(request.reference_audio_path)
                    if uploaded_url:
                        fal_req["audio_url"] = uploaded_url
            return fal_req

        return {"prompt": request.text}

    # --- AudioDriver methods ---

    async def generate_speech(self, request: AudioGenerationRequest) -> AudioGenerationResponse:
        """Submit an audio generation job to Fal.ai."""
        job_id = str(uuid.uuid4())
        fal_request = await self._build_fal_request(request)

        print(f"[FalAudioDriver] starting job={job_id}, model={self._fal_model}, kind={self._kind}")

        for attempt in range(MAX_RETRIES):
            try:
                handle = await asyncio.to_thread(
                    fal_client.submit,
                    self._fal_model,
                    arguments=fal_request,
                )
                request_id = handle.request_id
                self._job_cache[request_id] = {
                    "handle": handle,
                    "request": request.model_dump(),
                    "submitted_at": datetime.utcnow().isoformat(),
                }
                print(f"[FalAudioDriver] submitted request_id={request_id}")
                return AudioGenerationResponse(
                    job_id=request_id,
                    status=GenerationStatus.IN_QUEUE,
                    metadata={"provider": "fal.ai", "model": self._fal_model},
                )
            except Exception as e:
                if attempt < MAX_RETRIES - 1:
                    await asyncio.sleep(RETRY_DELAY * (2 ** attempt))
                    continue
                return AudioGenerationResponse(
                    job_id=job_id,
                    status=GenerationStatus.FAILED,
                    error_message=f"Fal.ai submission failed: {str(e)}",
                )

    async def check_status(self, job_id: str) -> AudioGenerationResponse:
        """Poll Fal.ai for job completion."""
        job = self._job_cache.get(job_id)
        if not job:
            return AudioGenerationResponse(
                job_id=job_id,
                status=GenerationStatus.FAILED,
                error_message="Job not found",
            )

        handle = job["handle"]

        try:
            status = await asyncio.to_thread(lambda: handle.status())
        except Exception as e:
            return AudioGenerationResponse(
                job_id=job_id,
                status=GenerationStatus.PROCESSING,
                error_message=str(e),
            )

        if status == "COMPLETED":
            try:
                result = await asyncio.to_thread(lambda: handle.get())
            except Exception as e:
                return AudioGenerationResponse(
                    job_id=job_id,
                    status=GenerationStatus.FAILED,
                    error_message=f"Failed to get result: {str(e)}",
                )

            # Extract audio URL from Fal response
            audio_url = None
            if isinstance(result, dict):
                # Common Fal audio response patterns
                audio_url = (
                    result.get("audio", {}).get("url")
                    or result.get("audio_url")
                    or result.get("url")
                )
                # Some models return video with audio
                if not audio_url:
                    video_url = result.get("video", {}).get("url") or result.get("video_url")
                    if video_url:
                        audio_url = video_url

            print(f"[FalAudioDriver] completed: audio_url={audio_url}")
            return AudioGenerationResponse(
                job_id=job_id,
                status=GenerationStatus.COMPLETED,
                audio_url=audio_url,
                metadata={"provider": "fal.ai", "result": result},
            )

        elif status == "FAILED":
            return AudioGenerationResponse(
                job_id=job_id,
                status=GenerationStatus.FAILED,
                error_message="Fal.ai generation failed",
            )

        elif status in ("IN_QUEUE", "IN_PROGRESS"):
            return AudioGenerationResponse(
                job_id=job_id,
                status=GenerationStatus.PROCESSING,
                metadata={"provider": "fal.ai"},
            )

        else:
            return AudioGenerationResponse(
                job_id=job_id,
                status=GenerationStatus.PROCESSING,
                metadata={"provider": "fal.ai", "raw_status": status},
            )

    def get_info(self) -> DriverInfo:
        if self._kind == "music":
            features = ["music"]
        elif self._kind == "tts":
            features = ["tts"]
            if self.supports_voice_cloning:
                features.append("voice_cloning")
        else:  # foley
            features = ["foley"]
        return DriverInfo(
            driver_id=self.driver_id,
            display_name=self.driver_name,
            category=self.category,
            supported_features=features,
            requires_api_key=True,
            api_key_env_var="FAL_KEY",
        )
