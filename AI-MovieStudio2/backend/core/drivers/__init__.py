"""
Driver Registry - Central factory for all AI model drivers.

Maps model IDs to driver instances. The frontend selects a model_id from
a dropdown, and the backend uses this registry to instantiate the correct driver.
"""

import os
from typing import Optional, Dict, List
from .base import (
    ImageDriver, VideoDriver, AudioDriver,
    DriverInfo, DriverCategory,
)

# Singleton cache for local ComfyUI drivers so jobs persist across requests
_comfy_image_cache: Dict[str, ImageDriver] = {}
_comfy_video_cache: Dict[str, object] = {}


def get_image_driver(model_id: str) -> Optional[ImageDriver]:
    """Get an image generation driver by model ID."""
    if model_id in ("qwen_image", "comfy_image", "z_image", "krea2", "flux2", "qwen_image_edit", "qwen_multiangle", "flux2_kontext"):
        if model_id not in _comfy_image_cache:
            from .comfy_image import ComfyImageDriver
            _comfy_image_cache[model_id] = ComfyImageDriver(model_id=model_id)
        return _comfy_image_cache[model_id]
    if model_id.startswith("fal_") and model_id not in ("fal_seedance", "fal_minimax_h3"):
        key = model_id.replace("fal_", "")
        from .fal_image import FalImageDriver
        try:
            return FalImageDriver(model_id=key)
        except ValueError:
            return None
    if model_id.startswith("replicate_"):
        key = model_id.replace("replicate_", "")
        from .replicate_driver import ReplicateImageDriver
        try:
            return ReplicateImageDriver(model_id=key)
        except ValueError:
            return None
    return None


def get_video_driver(model_id: str) -> Optional[VideoDriver]:
    """Get a video generation driver by model ID."""
    if model_id in ("ltx_video_2_3", "wan_video", "minimax_h3"):
        if model_id not in _comfy_video_cache:
            from .comfy_video import ComfyVideoDriver
            _comfy_video_cache[model_id] = ComfyVideoDriver(model_id=model_id)
        return _comfy_video_cache[model_id]
    if model_id in ("fal_seedance", "fal_seedance_2", "fal_seedance_2_5", "fal_minimax_h3"):
        key = model_id.replace("fal_", "")
        from .fal_video import FalVideoDriver
        try:
            return FalVideoDriver(model_id=key)
        except ValueError:
            return None
    return None


def get_audio_driver(model_id: str = "fish_speech") -> Optional[AudioDriver]:
    """Get an audio generation driver by model ID."""
    if model_id == "fish_speech":
        from .fish_speech import FishSpeechDriver
        return FishSpeechDriver()
    return None


def list_image_drivers() -> List[DriverInfo]:
    """List all available image drivers with their metadata."""
    drivers = []
    # Local - ComfyUI
    drivers.append(DriverInfo(
        driver_id="qwen_image",
        display_name="Qwen Image (ComfyUI)",
        category=DriverCategory.LOCAL,
        supported_features=["text_to_image", "image_to_image", "inpainting"],
    ))
    drivers.append(DriverInfo(
        driver_id="z_image",
        display_name="Z-Image (ComfyUI)",
        category=DriverCategory.LOCAL,
        supported_features=["text_to_image", "image_to_image"],
    ))
    drivers.append(DriverInfo(
        driver_id="krea2",
        display_name="Krea 2 (ComfyUI)",
        category=DriverCategory.LOCAL,
        supported_features=["text_to_image", "image_to_image"],
    ))
    drivers.append(DriverInfo(
        driver_id="flux2",
        display_name="Flux 2 (ComfyUI)",
        category=DriverCategory.LOCAL,
        supported_features=["text_to_image", "image_to_image"],
    ))
    # Storyboard - ComfyUI
    drivers.append(DriverInfo(
        driver_id="qwen_image_edit",
        display_name="Qwen Image Edit (ComfyUI)",
        category=DriverCategory.LOCAL,
        supported_features=["image_to_image", "multi_reference", "storyboard"],
    ))
    drivers.append(DriverInfo(
        driver_id="qwen_multiangle",
        display_name="Qwen Multiangle (ComfyUI)",
        category=DriverCategory.LOCAL,
        supported_features=["image_to_image", "multi_angle", "multi_reference", "storyboard"],
    ))
    drivers.append(DriverInfo(
        driver_id="flux2_kontext",
        display_name="Flux 2 Kontext (ComfyUI)",
        category=DriverCategory.LOCAL,
        supported_features=["image_to_image", "multi_reference", "storyboard"],
    ))
    # Cloud - Fal.ai
    for mid, name in [("nano_banana", "Nano Banana (Fal.ai)"), ("krea", "Krea (Fal.ai)"), ("flux_dev", "Flux Dev (Fal.ai)"), ("flux_2", "Flux 2 (Fal.ai)")]:
        if os.getenv("FAL_KEY"):
            drivers.append(DriverInfo(
                driver_id=f"fal_{mid}",
                display_name=name,
                category=DriverCategory.CLOUD,
                supported_features=["text_to_image", "image_to_image"],
                requires_api_key=True,
                api_key_env_var="FAL_KEY",
            ))
    # Cloud - Replicate
    for mid, name in [("metaai", "MetaAI (Replicate)"), ("flux_schnell", "Flux Schnell (Replicate)"), ("sd_xl", "SDXL (Replicate)")]:
        if os.getenv("REPLICATE_API_TOKEN"):
            drivers.append(DriverInfo(
                driver_id=f"replicate_{mid}",
                display_name=name,
                category=DriverCategory.CLOUD,
                supported_features=["text_to_image", "image_to_image"],
                requires_api_key=True,
                api_key_env_var="REPLICATE_API_TOKEN",
            ))
    return drivers


def list_video_drivers() -> List[DriverInfo]:
    """List all available video drivers with their metadata."""
    drivers = []
    # Local - ComfyUI
    drivers.append(DriverInfo(
        driver_id="ltx_video_2_3",
        display_name="LTX Video 2.3 (ComfyUI)",
        category=DriverCategory.LOCAL,
        supported_features=["text_to_video", "image_to_video", "first_last_frame", "image_audio_to_video"],
        max_duration_seconds=10.0,
    ))
    drivers.append(DriverInfo(
        driver_id="wan_video",
        display_name="Wan Video (ComfyUI)",
        category=DriverCategory.LOCAL,
        supported_features=["text_to_video", "image_to_video", "first_last_frame"],
        max_duration_seconds=10.0,
    ))
    drivers.append(DriverInfo(
        driver_id="minimax_h3",
        display_name="MiniMax H3 (ComfyUI)",
        category=DriverCategory.LOCAL,
        supported_features=["text_to_video", "image_to_video", "reference_to_video", "first_last_frame", "audio_lock", "motion_lock"],
        max_duration_seconds=15.0,
    ))
    # Cloud - Fal.ai
    if os.getenv("FAL_KEY"):
        drivers.append(DriverInfo(
            driver_id="fal_seedance",
            display_name="Seedance v1 (Fal.ai)",
            category=DriverCategory.CLOUD,
            supported_features=["text_to_video", "image_to_video", "first_last_frame", "camera_control"],
            max_duration_seconds=10.0,
            requires_api_key=True,
            api_key_env_var="FAL_KEY",
        ))
        drivers.append(DriverInfo(
            driver_id="fal_seedance_2",
            display_name="Seedance 2 (Fal.ai)",
            category=DriverCategory.CLOUD,
            supported_features=["text_to_video", "image_to_video", "first_last_frame", "camera_control"],
            max_duration_seconds=10.0,
            requires_api_key=True,
            api_key_env_var="FAL_KEY",
        ))
        drivers.append(DriverInfo(
            driver_id="fal_seedance_2_5",
            display_name="Seedance 2.5 (Fal.ai)",
            category=DriverCategory.CLOUD,
            supported_features=["text_to_video", "image_to_video", "first_last_frame", "camera_control"],
            max_duration_seconds=10.0,
            requires_api_key=True,
            api_key_env_var="FAL_KEY",
        ))
        drivers.append(DriverInfo(
            driver_id="fal_minimax_h3",
            display_name="Minimax H3 (Fal.ai)",
            category=DriverCategory.CLOUD,
            supported_features=["text_to_video", "image_to_video"],
            max_duration_seconds=6.0,
            requires_api_key=True,
            api_key_env_var="FAL_KEY",
        ))
    return drivers


def list_audio_drivers() -> List[DriverInfo]:
    """List all available audio drivers with their metadata."""
    drivers = []
    drivers.append(DriverInfo(
        driver_id="fish_speech",
        display_name="Fish Speech",
        category=DriverCategory.CLOUD if os.getenv("REPLICATE_API_TOKEN") else DriverCategory.LOCAL,
        supported_features=["tts", "voice_cloning"],
        requires_api_key=bool(os.getenv("REPLICATE_API_TOKEN")),
        api_key_env_var="REPLICATE_API_TOKEN",
    ))
    return drivers
