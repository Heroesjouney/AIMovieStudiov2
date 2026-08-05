"""
Replicate Image Driver - MetaAI + other Replicate-hosted models

Cloud image generation via Replicate API.
Supports text-to-image and image-to-image.

Requires:
    REPLICATE_API_TOKEN environment variable
"""

import asyncio
import os
import uuid
import time
from typing import List, Optional

import httpx

from .base import (
    ImageDriver, ImageGenerationRequest, ImageGenerationResponse,
    GenerationStatus, DriverCategory, DriverInfo,
)

MAX_RETRIES = 3
RETRY_DELAY = 2.0


class ReplicateImageDriver(ImageDriver):
    """
    Cloud image generation driver via Replicate.
    
    Supports MetaAI and other Replicate-hosted image models.
    """

    MODEL_IDS = {
        "metaai": "meta/meta-ai-image",
        "flux_schnell": "blackforestlabs/flux-schnell",
        "flux_dev": "blackforestlabs/flux-dev",
        "sd_xl": "stability-ai/sdxl",
    }

    def __init__(self, model_id: str = "metaai", api_token: Optional[str] = None):
        self._model_key = model_id
        self._replicate_model = self.MODEL_IDS.get(model_id, model_id)
        self._api_token = api_token or os.getenv("REPLICATE_API_TOKEN")
        if not self._api_token:
            raise ValueError("REPLICATE_API_TOKEN environment variable required")
        self._jobs: dict[str, dict] = {}

    @property
    def driver_id(self) -> str:
        return f"replicate_{self._model_key}"

    @property
    def driver_name(self) -> str:
        names = {
            "metaai": "MetaAI (Replicate)",
            "flux_schnell": "Flux Schnell (Replicate)",
            "flux_dev": "Flux Dev (Replicate)",
            "sd_xl": "SDXL (Replicate)",
        }
        return names.get(self._model_key, f"Replicate ({self._model_key})")

    @property
    def category(self) -> DriverCategory:
        return DriverCategory.CLOUD

    @property
    def supported_features(self) -> List[str]:
        return ["text_to_image", "image_to_image"]

    async def generate(self, request: ImageGenerationRequest) -> ImageGenerationResponse:
        job_id = str(uuid.uuid4())

        input_data = {
            "prompt": request.prompt,
            "width": request.width,
            "height": request.height,
        }
        if request.negative_prompt:
            input_data["negative_prompt"] = request.negative_prompt
        if request.seed is not None:
            input_data["seed"] = request.seed
        if request.reference_image_paths:
            input_data["image"] = request.reference_image_paths[0]
        input_data.update(request.extra_params)

        headers = {
            "Authorization": f"Bearer {self._api_token}",
            "Content-Type": "application/json",
            "Prefer": "wait",
        }

        for attempt in range(MAX_RETRIES):
            try:
                async with httpx.AsyncClient() as client:
                    resp = await client.post(
                        "https://api.replicate.com/v1/predictions",
                        json={
                            "model": self._replicate_model,
                            "input": input_data,
                        },
                        headers=headers,
                        timeout=30.0,
                    )
                    if resp.status_code != 201:
                        error_text = resp.text
                        return ImageGenerationResponse(
                            job_id=job_id,
                            status=GenerationStatus.FAILED,
                            error_message=f"Replicate API error: {error_text}",
                        )
                    result = resp.json()
                    prediction_id = result.get("id")
                    self._jobs[prediction_id] = {
                        "status_url": result.get("urls", {}).get("get"),
                        "created_at": time.time(),
                    }
                    return ImageGenerationResponse(
                        job_id=prediction_id,
                        status=GenerationStatus.IN_QUEUE,
                        metadata={"provider": "replicate", "model": self._replicate_model},
                    )
            except Exception as e:
                if attempt < MAX_RETRIES - 1:
                    await asyncio.sleep(RETRY_DELAY * (2 ** attempt))
                    continue
                return ImageGenerationResponse(
                    job_id=job_id,
                    status=GenerationStatus.FAILED,
                    error_message=f"Failed after {MAX_RETRIES} attempts: {str(e)}",
                )

    async def check_status(self, job_id: str) -> ImageGenerationResponse:
        job = self._jobs.get(job_id)
        if not job:
            return ImageGenerationResponse(
                job_id=job_id,
                status=GenerationStatus.FAILED,
                error_message="Job not found",
            )

        headers = {"Authorization": f"Bearer {self._api_token}"}

        try:
            async with httpx.AsyncClient() as client:
                resp = await client.get(
                    f"https://api.replicate.com/v1/predictions/{job_id}",
                    headers=headers,
                    timeout=15.0,
                )
                if resp.status_code != 200:
                    return ImageGenerationResponse(
                        job_id=job_id,
                        status=GenerationStatus.FAILED,
                        error_message=f"Replicate API error: {resp.text}",
                    )
                result = resp.json()
                status = result.get("status")

                if status == "succeeded":
                    output = result.get("output", [])
                    if isinstance(output, str):
                        output = [output]
                    return ImageGenerationResponse(
                        job_id=job_id,
                        status=GenerationStatus.COMPLETED,
                        image_urls=output,
                        metadata={"provider": "replicate"},
                    )
                elif status == "failed":
                    error = result.get("error", "Unknown error")
                    return ImageGenerationResponse(
                        job_id=job_id,
                        status=GenerationStatus.FAILED,
                        error_message=str(error),
                    )
                elif status == "processing":
                    return ImageGenerationResponse(
                        job_id=job_id,
                        status=GenerationStatus.PROCESSING,
                    )
                else:
                    return ImageGenerationResponse(
                        job_id=job_id,
                        status=GenerationStatus.IN_QUEUE,
                    )
        except Exception as e:
            return ImageGenerationResponse(
                job_id=job_id,
                status=GenerationStatus.FAILED,
                error_message=str(e),
            )

    def get_info(self) -> DriverInfo:
        return DriverInfo(
            driver_id=self.driver_id,
            display_name=self.driver_name,
            category=self.category,
            supported_features=self.supported_features,
            requires_api_key=True,
            api_key_env_var="REPLICATE_API_TOKEN",
        )
