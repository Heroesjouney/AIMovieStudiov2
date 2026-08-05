"""
Fal.ai Image Driver - Nano Banana + Krea

Cloud image generation via Fal.ai API.
Supports text-to-image and image-to-image.

Requires:
    FAL_KEY environment variable
"""

import asyncio
import os
import uuid
from typing import List, Optional

import httpx
import fal_client

from .base import (
    ImageDriver, ImageGenerationRequest, ImageGenerationResponse,
    GenerationStatus, DriverCategory, DriverInfo,
)

MAX_RETRIES = 3
RETRY_DELAY = 2.0


class FalImageDriver(ImageDriver):
    """
    Cloud image generation driver via Fal.ai.
    
    Supports: Nano Banana, Krea, and other Fal-hosted image models.
    """

    MODEL_IDS = {
        "nano_banana": "fal-ai/qwen-image-edit/nano-banana",
        "krea": "fal-ai/krea-image",
        "flux_dev": "fal-ai/flux/dev",
        "flux_pro": "fal-ai/flux-pro",
        "flux_2": "fal-ai/flux-2",
    }

    def __init__(self, model_id: str = "nano_banana", api_key: Optional[str] = None):
        self._model_key = model_id
        self._fal_model_id = self.MODEL_IDS.get(model_id, model_id)
        self._api_key = api_key or os.getenv("FAL_KEY")
        if not self._api_key:
            raise ValueError("FAL_KEY environment variable required for Fal.ai image driver")
        os.environ["FAL_KEY"] = self._api_key
        self._job_cache: dict[str, dict] = {}

    @property
    def driver_id(self) -> str:
        return f"fal_{self._model_key}"

    @property
    def driver_name(self) -> str:
        names = {
            "nano_banana": "Nano Banana (Fal.ai)",
            "krea": "Krea (Fal.ai)",
            "flux_dev": "Flux Dev (Fal.ai)",
            "flux_pro": "Flux Pro (Fal.ai)",
            "flux_2": "Flux 2 (Fal.ai)",
        }
        return names.get(self._model_key, f"Fal.ai ({self._model_key})")

    @property
    def category(self) -> DriverCategory:
        return DriverCategory.CLOUD

    @property
    def supported_features(self) -> List[str]:
        features = ["text_to_image"]
        if self._model_key in ("nano_banana", "krea"):
            features.append("image_to_image")
        return features

    async def generate(self, request: ImageGenerationRequest) -> ImageGenerationResponse:
        job_id = str(uuid.uuid4())

        fal_request = {
            "prompt": request.prompt,
        }
        if request.negative_prompt:
            fal_request["negative_prompt"] = request.negative_prompt
        if request.seed is not None:
            fal_request["seed"] = request.seed
        if request.width and request.height:
            fal_request["image_size"] = {"width": request.width, "height": request.height}
        if request.reference_image_paths:
            fal_request["image_url"] = request.reference_image_paths[0]
        fal_request.update(request.extra_params)

        for attempt in range(MAX_RETRIES):
            try:
                handle = await asyncio.to_thread(
                    fal_client.submit,
                    self._fal_model_id,
                    arguments=fal_request,
                )
                request_id = handle.request_id
                self._job_cache[request_id] = {"handle": handle}
                return ImageGenerationResponse(
                    job_id=request_id,
                    status=GenerationStatus.IN_QUEUE,
                    metadata={"provider": "fal.ai", "model": self._fal_model_id},
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
        job = self._job_cache.get(job_id)
        if not job:
            return ImageGenerationResponse(
                job_id=job_id,
                status=GenerationStatus.FAILED,
                error_message="Job not found",
            )

        try:
            handle = job["handle"]
            status = await asyncio.to_thread(lambda: handle.status())

            if status == "COMPLETED":
                result = await asyncio.to_thread(lambda: handle.get())
                image_urls = []
                if isinstance(result, dict):
                    img = result.get("image", {})
                    if isinstance(img, dict) and "url" in img:
                        image_urls.append(img["url"])
                    elif isinstance(img, list):
                        for i in img:
                            if isinstance(i, dict) and "url" in i:
                                image_urls.append(i["url"])
                    elif "images" in result:
                        for i in result["images"]:
                            if isinstance(i, dict) and "url" in i:
                                image_urls.append(i["url"])
                return ImageGenerationResponse(
                    job_id=job_id,
                    status=GenerationStatus.COMPLETED,
                    image_urls=image_urls,
                    metadata={"provider": "fal.ai"},
                )
            elif status == "FAILED":
                return ImageGenerationResponse(
                    job_id=job_id,
                    status=GenerationStatus.FAILED,
                    error_message="Generation failed on Fal.ai",
                )
            elif status == "IN_QUEUE":
                return ImageGenerationResponse(
                    job_id=job_id,
                    status=GenerationStatus.IN_QUEUE,
                )
            else:
                return ImageGenerationResponse(
                    job_id=job_id,
                    status=GenerationStatus.PROCESSING,
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
            api_key_env_var="FAL_KEY",
        )
