"""
Scene Schema - Scene management with defaults and shot lists.

A scene is a collection of shots that share a location, time of day,
and baseline production parameters.
"""

from datetime import datetime
from enum import Enum
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field


class SceneTimeOfDay(str, Enum):
    DAWN = "dawn"
    MORNING = "morning"
    DAY = "day"
    GOLDEN_HOUR = "golden_hour"
    DUSK = "dusk"
    NIGHT = "night"
    INTERIOR = "interior"


class SceneMood(str, Enum):
    NEUTRAL = "neutral"
    TENSE = "tense"
    JOYFUL = "joyful"
    MELANCHOLIC = "melancholic"
    MYSTERIOUS = "mysterious"
    ACTION = "action"
    ROMANTIC = "romantic"
    HORROR = "horror"


class SceneLighting(str, Enum):
    NATURAL = "natural"
    LOW_KEY = "low_key"
    HIGH_KEY = "high_key"
    REMBRANDT = "rembrandt"
    SPLIT = "split"
    BACKLIT = "backlit"
    PRACTICAL = "practical"
    CHIAROSCURO = "chiaroscuro"
    GOLDEN_HOUR = "golden_hour"
    BLUE_HOUR = "blue_hour"
    NEON = "neon"
    MOONLIGHT = "moonlight"


class SceneAssetRef(BaseModel):
    """Reference to an asset in the scene recipe."""
    asset_id: str
    asset_type: str
    asset_name: str
    image_path: Optional[str] = None


class SceneDefaults(BaseModel):
    """Baseline parameters applied to new shots in this scene."""
    aspect_ratio: str = Field(default="16:9")
    composition_preset: Optional[str] = None
    lighting_mood: Optional[str] = None
    hero_cast_id: Optional[str] = None
    location_id: Optional[str] = None
    prop_id: Optional[str] = None


class Scene(BaseModel):
    """A scene containing shots with shared defaults and a reference asset recipe."""
    id: str
    project_id: str = Field(default="default")
    name: str
    description: Optional[str] = None
    sequence_order: int = Field(default=0)
    time_of_day: SceneTimeOfDay = SceneTimeOfDay.DAY
    mood: SceneMood = SceneMood.NEUTRAL
    lighting: SceneLighting = SceneLighting.NATURAL
    defaults: SceneDefaults = Field(default_factory=SceneDefaults)
    reference_assets: List[SceneAssetRef] = Field(default_factory=list)
    establishing_frame_path: Optional[str] = None
    shot_ids: List[str] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class SceneCreateRequest(BaseModel):
    project_id: str = Field(default="default")
    name: str
    description: Optional[str] = None
    time_of_day: SceneTimeOfDay = SceneTimeOfDay.DAY
    mood: SceneMood = SceneMood.NEUTRAL
    lighting: SceneLighting = SceneLighting.NATURAL
    defaults: SceneDefaults = Field(default_factory=SceneDefaults)
    reference_assets: List[SceneAssetRef] = Field(default_factory=list)


class SceneResponse(BaseModel):
    id: str
    project_id: str
    name: str
    description: Optional[str] = None
    sequence_order: int
    time_of_day: SceneTimeOfDay
    mood: SceneMood
    lighting: SceneLighting
    defaults: SceneDefaults
    reference_assets: List[SceneAssetRef] = Field(default_factory=list)
    establishing_frame_path: Optional[str] = None
    shot_ids: List[str] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime
