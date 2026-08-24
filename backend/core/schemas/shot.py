"""
Shot Schema - Individual storyboard shots with generation recipes.

Each shot stores its full generation recipe for reproducibility,
including model, seed, prompts, references, and camera parameters.
"""

from datetime import datetime
from enum import Enum
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field

from .camera import CameraParams, CameraMovement


class ShotType(str, Enum):
    WIDE = "wide"
    MEDIUM = "medium"
    CLOSE_UP = "close_up"
    EXTREME_CLOSE_UP = "extreme_close_up"
    OVER_THE_SHOULDER = "over_the_shoulder"
    ESTABLISHING = "establishing"
    SUBSEQUENT = "subsequent"
    INSERT = "insert"
    POV = "pov"
    AERIAL = "aerial"
    TWO_SHOT = "two_shot"


class ShotStatus(str, Enum):
    DRAFT = "draft"
    PLANNED = "planned"
    FRAME_GENERATED = "frame_generated"
    ANGLES_GENERATED = "angles_generated"
    VIDEO_GENERATED = "video_generated"
    AUDIO_GENERATED = "audio_generated"
    COMPLETE = "complete"
    ERROR = "error"


class RetentionLevel(str, Enum):
    """How closely the AI should follow a reference asset."""
    FULLY_PRESERVED = "fully_preserved"
    PARTIALLY_PRESERVED = "partially_preserved"
    ATTRIBUTE_TRANSFER = "attribute_transfer"
    WEAK_REFERENCE = "weak_reference"


class ShotAssetRef(BaseModel):
    """Reference to an asset attached to a shot."""
    asset_id: str
    asset_type: str
    asset_name: str
    image_path: Optional[str] = None
    retention: RetentionLevel = RetentionLevel.FULLY_PRESERVED


class GenerationRecipe(BaseModel):
    """Stored generation settings for reproducibility."""
    resolved_prompt: str = ""
    resolved_negative_prompt: Optional[str] = None
    seed: Optional[int] = None
    model_id: str = ""
    params: Dict[str, Any] = Field(default_factory=dict)
    workflow_hash: Optional[str] = None
    reference_paths: List[str] = Field(default_factory=list)
    denoise: Optional[float] = None


class Shot(BaseModel):
    """A single storyboard shot."""
    id: str
    project_id: str = Field(default="default")
    scene_id: Optional[str] = None
    name: str
    shot_type: ShotType = ShotType.MEDIUM
    status: ShotStatus = ShotStatus.DRAFT
    description: str = ""
    notes: Optional[str] = None
    sequence_order: int = Field(default=0)
    
    # Asset bindings
    assets: List[ShotAssetRef] = Field(default_factory=list)
    
    # Generated content
    frame_image_path: Optional[str] = None
    angle_images: Dict[str, str] = Field(default_factory=dict)
    video_clip_path: Optional[str] = None
    video_takes: List[Dict[str, Any]] = Field(default_factory=list, description="All generated takes; each: {id, path, seed, prompt, negative_prompt, model_id, camera_movement, created_at, selected}")
    audio_clip_path: Optional[str] = None
    last_frame_path: Optional[str] = None
    
    # Camera direction
    camera_params: Optional[CameraParams] = None
    camera_movement: Optional[CameraMovement] = None
    
    # Generation recipe
    generation_recipe: Optional[GenerationRecipe] = None
    
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class ShotCreateRequest(BaseModel):
    project_id: str = Field(default="default")
    scene_id: Optional[str] = None
    name: str
    shot_type: ShotType = ShotType.MEDIUM
    description: str = ""
    notes: Optional[str] = None
    assets: List[ShotAssetRef] = Field(default_factory=list)
    hidden: bool = Field(default=False, description="Hidden from storyboard (scratch/freestyle shots)")


class ShotFrameGenerateRequest(BaseModel):
    """Request to generate a storyboard frame for a shot."""
    shot_id: str
    prompt: str
    negative_prompt: Optional[str] = None
    model_id: str = Field(default="qwen_image")
    width: int = Field(default=1024)
    height: int = Field(default=1024)
    seed: Optional[int] = None
    denoise: Optional[float] = None
    cfg: Optional[float] = None
    steps: Optional[int] = None
    reference_image_paths: List[str] = Field(default_factory=list)
    composition_preset: Optional[str] = None
    horizontal_angle: Optional[int] = None
    vertical_angle: Optional[int] = None
    zoom: Optional[float] = None
    prompt_override: Optional[str] = None


class ShotVariationRequest(BaseModel):
    """Request to generate a variation of an existing shot frame."""
    project_id: str = Field(default="default")
    source_shot_id: str
    scene_id: Optional[str] = None
    name: str
    prompt: str
    negative_prompt: Optional[str] = None
    model_id: str = Field(default="qwen_image_edit")
    width: int = Field(default=1024)
    height: int = Field(default=1024)
    seed: Optional[int] = None
    shot_type: ShotType = ShotType.MEDIUM


class ShotVideoGenerateRequest(BaseModel):
    """Request to generate a video clip (take) for a shot.

    Reference slots are all optional and model-aware:
    - first_frame_path / last_frame_path: storyboard frames (same-scene shots)
    - reference_image_paths: additional subject/scene/style lock images (r2v)
    - reference_video_path: motion/camera lock video (r2v)
    - reference_audio_path: voice lock audio (r2v/ia2v, e.g. MiniMax H3 or LTX IA2V)
    """
    project_id: str = Field(default="default")
    shot_id: str
    prompt: str
    negative_prompt: Optional[str] = None
    model_id: str = Field(default="fal_seedance_2_5")
    mode: str = Field(default="t2v", description="t2v | i2v | r2v | ia2v")
    duration_seconds: float = Field(default=5.0, ge=1.0, le=30.0)
    seed: Optional[int] = None
    first_frame_path: Optional[str] = Field(None, description="Storyboard frame (start) — same-scene shot frame_image_path")
    last_frame_path: Optional[str] = Field(None, description="Storyboard frame (end) — same-scene shot frame_image_path")
    reference_image_paths: List[str] = Field(default_factory=list)
    reference_video_path: Optional[str] = Field(None, description="Same-scene shot video_clip_path for motion lock")
    reference_audio_path: Optional[str] = Field(None, description="Project audio library file for voice lock / IA2V lip-sync")
    camera_movement: Optional[Dict[str, Any]] = Field(None, description="Camera movement preset + intensity")
    aspect_ratio: str = Field(default="16:9")
    soundscape: Optional[str] = Field(None, description="Ambient/non-diegetic sound description for models with joint audio (e.g. H3)")
    music: Optional[str] = Field(None, description="Non-diegetic music description for models with joint audio")
    prompt_override: Optional[str] = Field(None, description="Manual override of the auto-compiled prompt")
    skip_continuity: bool = Field(default=False, description="If True, do not auto-inject previous shot's last frame as first frame")
    extra_params: Dict[str, Any] = Field(default_factory=dict, description="Model-specific extra params (e.g. enhance_prompt for LTX IA2V)")


class ShotResponse(BaseModel):
    id: str
    project_id: str
    scene_id: Optional[str] = None
    name: str
    shot_type: ShotType
    status: ShotStatus
    description: str
    notes: Optional[str] = None
    sequence_order: int
    assets: List[ShotAssetRef] = Field(default_factory=list)
    frame_image_path: Optional[str] = None
    angle_images: Dict[str, str] = Field(default_factory=dict)
    video_clip_path: Optional[str] = None
    video_takes: List[Dict[str, Any]] = Field(default_factory=list)
    audio_clip_path: Optional[str] = None
    last_frame_path: Optional[str] = None
    camera_params: Optional[CameraParams] = None
    camera_movement: Optional[CameraMovement] = None
    generation_recipe: Optional[GenerationRecipe] = None
    created_at: datetime
    updated_at: datetime
