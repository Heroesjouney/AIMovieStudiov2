"""
Project Schema - Top-level project container.

Each project has its own style bible, scenes, shots, and assets.
"""

from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, Field

from .style_bible import StyleBible


class Project(BaseModel):
    """A film project containing scenes, shots, and assets."""
    id: str
    name: str
    description: Optional[str] = None
    style_bible: StyleBible = Field(default_factory=StyleBible)
    scene_ids: List[str] = Field(default_factory=list)
    asset_ids: List[str] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class ProjectCreateRequest(BaseModel):
    name: str
    description: Optional[str] = None


class ProjectResponse(BaseModel):
    id: str
    name: str
    description: Optional[str] = None
    style_bible: StyleBible
    scene_ids: List[str] = Field(default_factory=list)
    asset_ids: List[str] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime
