"""
Camera Schema - 3D camera parameters for art direction.

Defines camera position, rotation, FOV, and movement presets
used by the 3D Camera Director for multi-angle generation.
"""

from enum import Enum
from typing import Optional, List
from pydantic import BaseModel, Field


class CameraAnglePreset(str, Enum):
    """Quick angle presets for multi-angle generation."""
    FRONT = "front"
    THREE_QUARTER_LEFT = "three_quarter_left"
    THREE_QUARTER_RIGHT = "three_quarter_right"
    SIDE_LEFT = "side_left"
    SIDE_RIGHT = "side_right"
    OVERHEAD = "overhead"
    LOW_ANGLE = "low_angle"
    HIGH_ANGLE = "high_angle"
    BACK = "back"
    BACK_LEFT = "back_left"
    BACK_RIGHT = "back_right"
    DUTCH_TILT = "dutch_tilt"
    CLOSE_UP = "close_up"
    WIDE_SHOT = "wide_shot"
    MEDIUM_SHOT = "medium_shot"


# Qwen Multiangle LoRA prompt format: <sks> {azimuth} {elevation} {distance}
# Used by ComfyUI-qwenmultiangle + Qwen-Image-Edit-2511-Multiple-Angles-LoRA
QWEN_MULTIANGLE_PROMPTS = {
    CameraAnglePreset.FRONT: "<sks> front view eye-level shot medium shot",
    CameraAnglePreset.THREE_QUARTER_LEFT: "<sks> front-left quarter view eye-level shot medium shot",
    CameraAnglePreset.THREE_QUARTER_RIGHT: "<sks> front-right quarter view eye-level shot medium shot",
    CameraAnglePreset.SIDE_LEFT: "<sks> left side view eye-level shot medium shot",
    CameraAnglePreset.SIDE_RIGHT: "<sks> right side view eye-level shot medium shot",
    CameraAnglePreset.OVERHEAD: "<sks> front view high-angle shot wide shot",
    CameraAnglePreset.LOW_ANGLE: "<sks> front view low-angle shot medium shot",
    CameraAnglePreset.HIGH_ANGLE: "<sks> front view high-angle shot medium shot",
    CameraAnglePreset.BACK: "<sks> back view eye-level shot medium shot",
    CameraAnglePreset.BACK_LEFT: "<sks> back-left quarter view eye-level shot medium shot",
    CameraAnglePreset.BACK_RIGHT: "<sks> back-right quarter view eye-level shot medium shot",
    CameraAnglePreset.DUTCH_TILT: "<sks> front-right quarter view eye-level shot close-up",
    CameraAnglePreset.CLOSE_UP: "<sks> front view eye-level shot close-up",
    CameraAnglePreset.WIDE_SHOT: "<sks> front view eye-level shot wide shot",
    CameraAnglePreset.MEDIUM_SHOT: "<sks> front view eye-level shot medium shot",
}


class CameraMovementPreset(str, Enum):
    """Camera movement presets for video generation."""
    STATIC = "static"
    DOLLY_IN = "dolly_in"
    DOLLY_OUT = "dolly_out"
    PAN_LEFT = "pan_left"
    PAN_RIGHT = "pan_right"
    TILT_UP = "tilt_up"
    TILT_DOWN = "tilt_down"
    CRANE_UP = "crane_up"
    CRANE_DOWN = "crane_down"
    ORBIT_LEFT = "orbit_left"
    ORBIT_RIGHT = "orbit_right"
    HANDHELD = "handheld"
    ZOOM_IN = "zoom_in"
    ZOOM_OUT = "zoom_out"
    DOLLY_ZOOM = "dolly_zoom"


class CameraParams(BaseModel):
    """3D camera parameters for a single viewpoint."""
    position_x: float = Field(default=0.0, description="Camera X position")
    position_y: float = Field(default=0.0, description="Camera Y position (height)")
    position_z: float = Field(default=5.0, description="Camera Z position (distance from subject)")
    rotation_x: float = Field(default=0.0, description="Tilt (pitch) in degrees")
    rotation_y: float = Field(default=0.0, description="Pan (yaw) in degrees")
    rotation_z: float = Field(default=0.0, description="Roll in degrees")
    fov: float = Field(default=50.0, ge=10.0, le=170.0, description="Field of view in degrees")
    focal_length: Optional[float] = Field(default=None, description="Focal length in mm (alternative to FOV)")


class CameraMovement(BaseModel):
    """Camera movement definition for video generation."""
    preset: CameraMovementPreset = CameraMovementPreset.STATIC
    start_params: CameraParams = Field(default_factory=CameraParams)
    end_params: Optional[CameraParams] = None
    duration_seconds: float = Field(default=5.0, ge=0.5, le=30.0)
    intensity: float = Field(default=1.0, ge=0.1, le=3.0, description="Movement intensity multiplier")


class MultiAngleRequest(BaseModel):
    """Request to generate multiple camera angles from a reference frame."""
    source_image_path: str
    angles: List[CameraAnglePreset] = Field(
        default_factory=lambda: [
            CameraAnglePreset.THREE_QUARTER_LEFT,
            CameraAnglePreset.THREE_QUARTER_RIGHT,
            CameraAnglePreset.SIDE_LEFT,
            CameraAnglePreset.OVERHEAD,
        ]
    )
    model_id: str = Field(default="qwen_multiangle")
    method: str = Field(default="qwen_multiangle", description="qwen_multiangle or 3d_camera")
    base_prompt: Optional[str] = Field(default=None, description="Base prompt to prepend to angle prompts")
    depth_model: str = Field(default="depth_anything")
    width: int = Field(default=1024)
    height: int = Field(default=1024)
    seed: Optional[int] = None
    reference_image_paths: List[str] = Field(default_factory=list, description="Additional reference images (character, location)")


class CameraDirectionResponse(BaseModel):
    """Response containing generated camera angle images."""
    job_id: str
    status: str
    angle_images: List[dict] = Field(default_factory=list)
    error_message: Optional[str] = None


def angles_to_sks_prompt(horizontal_angle: float, vertical_angle: float, zoom: float) -> str:
    """Convert camera angles to the <sks> prompt format expected by the
    Qwen-Image-Edit-2511-Multiple-Angles-LoRA.

    Single source of truth for angle-to-text mapping. Used by both
    routes_shots.py (shot generation) and routes_generate.py (multi-angle).
    """
    h_angle = horizontal_angle % 360
    if h_angle < 22.5 or h_angle >= 337.5:
        h_dir = "front view"
    elif h_angle < 67.5:
        h_dir = "front-right quarter view"
    elif h_angle < 112.5:
        h_dir = "right side view"
    elif h_angle < 157.5:
        h_dir = "back-right quarter view"
    elif h_angle < 202.5:
        h_dir = "back view"
    elif h_angle < 247.5:
        h_dir = "back-left quarter view"
    elif h_angle < 292.5:
        h_dir = "left side view"
    else:
        h_dir = "front-left quarter view"

    v = vertical_angle
    if v < -15:
        v_dir = "low-angle shot"
    elif v < 15:
        v_dir = "eye-level shot"
    elif v < 45:
        v_dir = "elevated shot"
    else:
        v_dir = "high-angle shot"

    if zoom < 1:
        dist = "extreme wide shot"
    elif zoom < 2:
        dist = "wide shot"
    elif zoom < 4:
        dist = "medium shot"
    elif zoom < 7:
        dist = "close-up"
    else:
        dist = "extreme close-up"

    sks_prompt = f"<sks> {h_dir} {v_dir} {dist}"

    # Auto-supplementary hints for ranges where the AI struggles.
    # These reinforce the <sks> tag with descriptive text to help the model
    # produce better results in problematic angle/distance combinations.
    hints = []
    if "back view" in h_dir:
        hints.append("character seen from behind")
    elif "back-" in h_dir:
        hints.append("partial back view, character turned away")

    if dist == "extreme close-up":
        hints.append("tight framing on facial features, eyes and mouth detail")
    elif dist == "extreme wide shot":
        hints.append("figures small in frame, environment dominates")

    if v_dir == "high-angle shot":
        hints.append("looking down from above, top-down perspective")
    elif v_dir == "low-angle shot":
        hints.append("camera tilted upward, dramatic perspective")

    if hints:
        sks_prompt += f" ({', '.join(hints)})"

    return sks_prompt
