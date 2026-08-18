"""
Asset Schema - Characters, Locations, Props, Vehicles

Defines the data models for all creative assets in the Vault.
"""

from datetime import datetime
from enum import Enum
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field


class AssetType(str, Enum):
    CHARACTER = "character"
    LOCATION = "location"
    PROP = "prop"
    VEHICLE = "vehicle"
    STYLE = "style"
    EFFECT = "effect"


class AssetStatus(str, Enum):
    DRAFT = "draft"
    READY = "ready"
    PROCESSING = "processing"
    ERROR = "error"


class CharacterData(BaseModel):
    """Extended data for character assets."""
    generation_prompt: Optional[str] = None
    negative_prompt: Optional[str] = None
    model_type: Optional[str] = None
    face_embedding_path: Optional[str] = None
    views: Dict[str, str] = Field(default_factory=dict)  # front, side, back, three_quarter
    expressions: Dict[str, str] = Field(default_factory=dict)  # neutral, angry, happy, sad
    wardrobe_mask_path: Optional[str] = None
    voice_reference_path: Optional[str] = None
    identity_pack: Optional[Dict[str, Any]] = None


class LocationData(BaseModel):
    """Extended data for location assets."""
    panorama_path: Optional[str] = None
    depth_map_path: Optional[str] = None
    plate_image_path: Optional[str] = None
    variants: Dict[str, str] = Field(default_factory=dict)  # day, night, weather variants


class PropData(BaseModel):
    """Extended data for prop assets."""
    pass


class VehicleData(BaseModel):
    """Extended data for vehicle assets."""
    pass


class StyleData(BaseModel):
    """Extended data for style assets."""
    pass


class EffectData(BaseModel):
    """Extended data for effect assets."""
    pass


class Asset(BaseModel):
    """Core asset model stored in the Vault."""
    id: str = Field(..., description="UUID identifier")
    project_id: str = Field(default="default")
    type: AssetType
    name: str
    version: int = Field(default=1)
    status: AssetStatus = AssetStatus.DRAFT
    primary_image: Optional[str] = None
    thumbnail: Optional[str] = None
    folder_path: Optional[str] = None
    tags: List[str] = Field(default_factory=list)
    description: Optional[str] = None
    character_data: Optional[CharacterData] = None
    location_data: Optional[LocationData] = None
    prop_data: Optional[PropData] = None
    vehicle_data: Optional[VehicleData] = None
    style_data: Optional[StyleData] = None
    effect_data: Optional[EffectData] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class AssetCreateRequest(BaseModel):
    """Request to create a new asset."""
    project_id: str = Field(default="default")
    type: AssetType
    name: str
    description: Optional[str] = None
    tags: List[str] = Field(default_factory=list)


class AssetGenerateRequest(BaseModel):
    """Request to generate an asset image via AI."""
    project_id: str = Field(default="default")
    type: AssetType
    name: str
    prompt: str
    negative_prompt: Optional[str] = None
    model_id: str = Field(default="qwen_image", description="Which image driver to use")
    width: int = Field(default=1024, ge=256, le=4096)
    height: int = Field(default=1024, ge=256, le=4096)
    seed: Optional[int] = None
    reference_image_path: Optional[str] = None
    tags: List[str] = Field(default_factory=list)
    description: Optional[str] = None


class AssetResponse(BaseModel):
    """Response containing asset data."""
    id: str
    project_id: str
    type: AssetType
    name: str
    version: int
    status: AssetStatus
    primary_image: Optional[str] = None
    thumbnail: Optional[str] = None
    folder_path: Optional[str] = None
    tags: List[str] = Field(default_factory=list)
    description: Optional[str] = None
    character_data: Optional[CharacterData] = None
    location_data: Optional[LocationData] = None
    created_at: datetime
    updated_at: datetime
