"""
Abstract Base Classes for AI Model Drivers.

These ABCs define the contract that all AI model integrations must follow.
This enables swapping between different providers (ComfyUI, Fal.ai, Replicate, etc.)
without changing business logic.

Driver Types:
    - ImageDriver: Text-to-image, image-to-image, inpainting
    - VideoDriver: Image-to-video, text-to-video, video-to-video
    - AudioDriver: TTS, SFX generation
"""

from abc import ABC, abstractmethod
from enum import Enum
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field


# =============================================================================
# Shared Enums
# =============================================================================

class GenerationStatus(str, Enum):
    PENDING = "pending"
    IN_QUEUE = "in_queue"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"


class AspectRatio(str, Enum):
    LANDSCAPE_16_9 = "16:9"
    PORTRAIT_9_16 = "9:16"
    SQUARE_1_1 = "1:1"
    CINEMASCOPE_21_9 = "21:9"
    ACADEMY_4_3 = "4:3"


class DriverCategory(str, Enum):
    LOCAL = "local"
    CLOUD = "cloud"


# =============================================================================
# Request / Response Schemas
# =============================================================================

class ImageGenerationRequest(BaseModel):
    """Request for image generation."""
    prompt: str = Field(..., min_length=1, max_length=4000)
    negative_prompt: Optional[str] = Field(None, max_length=2000)
    width: int = Field(default=1024, ge=256, le=4096)
    height: int = Field(default=1024, ge=256, le=4096)
    seed: Optional[int] = Field(None, ge=0)
    num_images: int = Field(default=1, ge=1, le=4)
    reference_image_paths: List[str] = Field(default_factory=list)
    denoise_strength: Optional[float] = Field(None, ge=0.0, le=1.0)
    extra_params: Dict[str, Any] = Field(default_factory=dict)


class ImageGenerationResponse(BaseModel):
    """Response for image generation."""
    job_id: str
    status: GenerationStatus = GenerationStatus.PENDING
    image_paths: List[str] = Field(default_factory=list)
    image_urls: List[str] = Field(default_factory=list)
    error_message: Optional[str] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)


class VideoGenerationMode(str, Enum):
    """Video generation mode — determines which reference slots are used."""
    T2V = "t2v"  # text-to-video (prompt only)
    I2V = "i2v"  # image-to-video (first frame, optional last frame)
    R2V = "r2v"  # reference-to-video (subject/scene image + motion/video ref + optional audio ref)
    IA2V = "ia2v"  # image+audio-to-video (first frame + audio clip for lip-sync/dialogue)


class VideoGenerationRequest(BaseModel):
    """Request for video generation."""
    prompt: str = Field(..., min_length=1, max_length=4000)
    negative_prompt: Optional[str] = Field(None, max_length=2000)
    mode: VideoGenerationMode = Field(default=VideoGenerationMode.T2V, description="Generation mode: t2v, i2v, or r2v")
    duration_seconds: float = Field(default=5.0, ge=1.0, le=30.0)
    aspect_ratio: AspectRatio = AspectRatio.LANDSCAPE_16_9
    resolution: str = Field(default="720p")
    seed: Optional[int] = Field(None, ge=0)
    first_frame_path: Optional[str] = Field(None, description="Start frame for i2v/r2v (storyboard frame)")
    last_frame_path: Optional[str] = Field(None, description="End frame for interpolation (storyboard frame)")
    reference_image_paths: List[str] = Field(default_factory=list, description="Additional reference images for r2v subject/scene/style lock")
    reference_video_path: Optional[str] = Field(None, description="Video reference for r2v motion/camera lock or vid2vid")
    reference_audio_path: Optional[str] = Field(None, description="Audio reference for r2v voice lock (e.g. MiniMax H3)")
    camera_movement: Optional[Dict[str, Any]] = Field(None, description="Camera direction params (preset + intensity)")
    extra_params: Dict[str, Any] = Field(default_factory=dict)


class VideoGenerationResponse(BaseModel):
    """Response for video generation."""
    job_id: str
    status: GenerationStatus = GenerationStatus.PENDING
    video_path: Optional[str] = None
    video_url: Optional[str] = None
    error_message: Optional[str] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)


class AudioGenerationRequest(BaseModel):
    """Request for audio generation (TTS)."""
    text: str = Field(..., min_length=1, max_length=5000)
    language: str = Field(default="en")
    voice_id: Optional[str] = None
    reference_audio_path: Optional[str] = Field(None, description="Reference audio for voice cloning")
    speed: float = Field(default=1.0, ge=0.25, le=4.0)


class AudioGenerationResponse(BaseModel):
    """Response for audio generation."""
    job_id: str
    status: GenerationStatus = GenerationStatus.PENDING
    audio_path: Optional[str] = None
    audio_url: Optional[str] = None
    error_message: Optional[str] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)


class SFXGenerationRequest(BaseModel):
    """Request for sound effect generation."""
    prompt: str = Field(..., min_length=1, max_length=1000)
    duration_seconds: float = Field(default=3.0, ge=0.5, le=30.0)


# =============================================================================
# Driver Info
# =============================================================================

class DriverInfo(BaseModel):
    """Metadata about a driver for UI display."""
    driver_id: str
    display_name: str
    category: DriverCategory
    description: str = ""
    supported_features: List[str] = Field(default_factory=list)
    max_width: int = 2048
    max_height: int = 2048
    max_duration_seconds: float = 10.0
    requires_api_key: bool = False
    api_key_env_var: Optional[str] = None
    max_reference_images: int = 3
    max_reference_videos: int = 1
    max_reference_audio: int = 1
    max_total_references: int = 4
    resolution_tiers: List[str] = Field(default_factory=lambda: ["native"])


# =============================================================================
# Abstract Base Classes
# =============================================================================

class ImageDriver(ABC):
    """Abstract base class for image generation models."""

    @property
    @abstractmethod
    def driver_id(self) -> str:
        """Unique identifier for this driver (e.g., 'qwen_image')."""
        pass

    @property
    @abstractmethod
    def driver_name(self) -> str:
        """Human-readable name (e.g., 'Qwen Image (ComfyUI)')."""
        pass

    @property
    @abstractmethod
    def category(self) -> DriverCategory:
        """Whether this is a LOCAL or CLOUD driver."""
        pass

    @property
    @abstractmethod
    def supported_features(self) -> List[str]:
        """Features: 'text_to_image', 'image_to_image', 'inpainting', 'multi_reference'."""
        pass

    @abstractmethod
    async def generate(self, request: ImageGenerationRequest) -> ImageGenerationResponse:
        """Submit an image generation request. Returns immediately with job_id."""
        pass

    @abstractmethod
    async def check_status(self, job_id: str) -> ImageGenerationResponse:
        """Check the status of a pending generation job."""
        pass

    async def cancel(self, job_id: str) -> bool:
        """Attempt to cancel a pending job. Optional."""
        return False

    def get_info(self) -> DriverInfo:
        """Return driver metadata for UI display."""
        return DriverInfo(
            driver_id=self.driver_id,
            display_name=self.driver_name,
            category=self.category,
            supported_features=self.supported_features,
        )


class VideoDriver(ABC):
    """Abstract base class for video generation models."""

    @property
    @abstractmethod
    def driver_id(self) -> str:
        pass

    @property
    @abstractmethod
    def driver_name(self) -> str:
        pass

    @property
    @abstractmethod
    def category(self) -> DriverCategory:
        pass

    @property
    @abstractmethod
    def supported_features(self) -> List[str]:
        """Features: 'text_to_video', 'image_to_video', 'first_last_frame', 'video_to_video'."""
        pass

    @property
    @abstractmethod
    def max_duration_seconds(self) -> float:
        pass

    @abstractmethod
    async def generate(self, request: VideoGenerationRequest) -> VideoGenerationResponse:
        """Submit a video generation request."""
        pass

    @abstractmethod
    async def check_status(self, job_id: str) -> VideoGenerationResponse:
        """Check the status of a pending generation job."""
        pass

    @abstractmethod
    async def download(self, job_id: str, output_dir: str) -> str:
        """Download a completed video to local storage."""
        pass

    async def cancel(self, job_id: str) -> bool:
        return False

    def get_info(self) -> DriverInfo:
        return DriverInfo(
            driver_id=self.driver_id,
            display_name=self.driver_name,
            category=self.category,
            supported_features=self.supported_features,
            max_duration_seconds=self.max_duration_seconds,
        )


class AudioDriver(ABC):
    """Abstract base class for audio generation models."""

    @property
    @abstractmethod
    def driver_id(self) -> str:
        pass

    @property
    @abstractmethod
    def driver_name(self) -> str:
        pass

    @property
    @abstractmethod
    def category(self) -> DriverCategory:
        pass

    @property
    @abstractmethod
    def supports_voice_cloning(self) -> bool:
        pass

    @property
    @abstractmethod
    def supported_languages(self) -> List[str]:
        pass

    @abstractmethod
    async def generate_speech(self, request: AudioGenerationRequest) -> AudioGenerationResponse:
        """Generate speech from text."""
        pass

    @abstractmethod
    async def check_status(self, job_id: str) -> AudioGenerationResponse:
        """Check the status of a pending audio job."""
        pass

    async def generate_sfx(self, request: SFXGenerationRequest) -> AudioGenerationResponse:
        """Generate sound effects from a prompt. Optional - override if supported."""
        return AudioGenerationResponse(
            job_id="",
            status=GenerationStatus.FAILED,
            error_message="SFX generation not supported by this driver",
        )

    async def cancel(self, job_id: str) -> bool:
        return False

    def get_info(self) -> DriverInfo:
        return DriverInfo(
            driver_id=self.driver_id,
            display_name=self.driver_name,
            category=self.category,
            supported_features=["tts"] + (["voice_cloning"] if self.supports_voice_cloning else []),
        )
