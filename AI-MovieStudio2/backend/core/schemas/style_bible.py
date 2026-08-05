"""
Style Bible Schema - Project-level style consistency.

Defines the global "show look" that keeps all shots visually consistent.
"""

from typing import Optional, Dict, Any
from pydantic import BaseModel, Field


class RenderDefaults(BaseModel):
    """Default render settings for the project."""
    engine: str = Field(default="qwen_image")
    steps: int = Field(default=20)
    guidance: float = Field(default=7.0)
    width: int = Field(default=1024)
    height: int = Field(default=1024)
    seed_strategy: str = Field(default="locked_per_shot", description="locked_per_shot, per_sequence, or random")


class ConsistencyDefaults(BaseModel):
    """Defaults that enforce visual stability."""
    prefer_anchored_img2img: bool = Field(default=True)
    default_img2img_strength: float = Field(default=0.55, ge=0.0, le=1.0)


class StyleBible(BaseModel):
    """Project-level style bible for consistent look across all shots."""
    project_id: str = Field(default="default")
    look_prompt_suffix: str = Field(
        default="",
        description="Cinematic style tail appended to all shot prompts (lens, lighting, film stock, grain)"
    )
    negative_prompt: str = Field(
        default="watermark, text, logo, extra limbs, deformed, blurry, low quality",
        description="Project-wide negative prompt"
    )
    render_defaults: RenderDefaults = Field(default_factory=RenderDefaults)
    consistency_defaults: ConsistencyDefaults = Field(default_factory=ConsistencyDefaults)


class StyleBibleUpdateRequest(BaseModel):
    look_prompt_suffix: Optional[str] = None
    negative_prompt: Optional[str] = None
    render_defaults: Optional[RenderDefaults] = None
    consistency_defaults: Optional[ConsistencyDefaults] = None
