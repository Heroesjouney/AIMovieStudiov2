"""
Screenplay Routes - Import Fountain-format screenplays.

Parses a Fountain screenplay and creates scenes in the project, storing the
parsed shot breakdown on each scene as a reference for manually building shots.
"""

import json
import uuid
from pathlib import Path
from typing import List, Optional, Dict, Any
from datetime import datetime

from fastapi import APIRouter, HTTPException, UploadFile, File, Form
from pydantic import BaseModel, Field

from core.logic.screenplay_parser import parse_screenplay, screenplay_to_import_data
from core.schemas.scene import SceneTimeOfDay, SceneMood, SceneLighting

router = APIRouter()
VAULT_DIR = Path(__file__).parent.parent / "assets"


def _project_dir(project_id: str) -> Path:
    d = VAULT_DIR / project_id
    d.mkdir(parents=True, exist_ok=True)
    return d


def _scenes_index(project_id: str) -> Path:
    return _project_dir(project_id) / "scenes.json"


def _load_scenes(project_id: str) -> List[dict]:
    idx = _scenes_index(project_id)
    if idx.exists():
        with open(idx, "r") as f:
            return json.load(f)
    return []


def _save_scenes(project_id: str, scenes: List[dict]):
    with open(_scenes_index(project_id), "w") as f:
        json.dump(scenes, f, indent=2, default=str)


# Valid enum values for mapping
_TOD_VALUES = {e.value for e in SceneTimeOfDay}
_MOOD_VALUES = {e.value for e in SceneMood}
_LIGHTING_VALUES = {e.value for e in SceneLighting}


class ScreenplayImportPreview(BaseModel):
    """Preview of parsed screenplay before confirming import."""
    title: str = ""
    author: str = ""
    scene_count: int = 0
    shot_count: int = 0
    scenes: List[Dict[str, Any]] = Field(default_factory=list)
    shots: List[Dict[str, Any]] = Field(default_factory=list)


class ScreenplayImportRequest(BaseModel):
    """Request to import a parsed screenplay into a project."""
    project_id: str = Field(default="default")
    text: str = Field(..., description="Screenplay text (Fountain or Final Draft .fdx)")
    dry_run: bool = Field(default=False, description="If True, return preview without creating anything")
    filename: Optional[str] = Field(default=None, description="Original filename; used to detect .fdx format")


class ScreenplayImportResult(BaseModel):
    status: str = "ok"
    project_id: str = "default"
    scenes_created: int = 0
    shots_created: int = 0
    scene_ids: List[str] = Field(default_factory=list)
    shot_ids: List[str] = Field(default_factory=list)
    preview: Optional[ScreenplayImportPreview] = None


def _safe_enum(value: str, valid: set, default: str) -> str:
    """Return value if it's in the valid set, else default."""
    if value and value in valid:
        return value
    return default


@router.post("/preview", response_model=ScreenplayImportPreview)
async def preview_screenplay(req: ScreenplayImportRequest):
    """Parse a screenplay (Fountain or Final Draft .fdx) and return a preview without creating anything."""
    if not req.text.strip():
        raise HTTPException(status_code=400, detail="Screenplay text is empty")

    parsed = parse_screenplay(req.text, req.filename)
    data = screenplay_to_import_data(parsed)

    return ScreenplayImportPreview(
        title=data["title"],
        author=data["author"],
        scene_count=len(data["scenes"]),
        shot_count=len(data["shots"]),
        scenes=data["scenes"],
        shots=data["shots"],
    )


@router.post("/import", response_model=ScreenplayImportResult)
async def import_screenplay(req: ScreenplayImportRequest):
    """Import a screenplay (Fountain or Final Draft .fdx) into a project, creating scenes only.

    The parsed shot breakdown is stored on each scene as ``script_breakdown``
    so the user can pull shots into the storyboard on demand via
    ``POST /scenes/{project_id}/{scene_id}/generate-shots``. This keeps the
    storyboard clean until the user curates each scene.
    """
    if not req.text.strip():
        raise HTTPException(status_code=400, detail="Screenplay text is empty")

    parsed = parse_screenplay(req.text, req.filename)
    data = screenplay_to_import_data(parsed)

    if not data["scenes"]:
        raise HTTPException(status_code=400, detail="No scenes found in screenplay")

    if req.dry_run:
        preview = ScreenplayImportPreview(
            title=data["title"],
            author=data["author"],
            scene_count=len(data["scenes"]),
            shot_count=len(data["shots"]),
            scenes=data["scenes"],
            shots=data["shots"],
        )
        return ScreenplayImportResult(
            status="preview",
            project_id=req.project_id,
            preview=preview,
        )

    # Load existing scenes (shots are NOT created during import)
    scenes = _load_scenes(req.project_id)
    scene_ids: List[str] = []

    base_scene_order = len(scenes)

    for s_idx, scene_data in enumerate(data["scenes"]):
        scene_id = str(uuid.uuid4())
        now = datetime.utcnow().isoformat()

        tod = _safe_enum(scene_data.get("time_of_day", "day"), _TOD_VALUES, "day")
        mood = _safe_enum(scene_data.get("mood", "neutral"), _MOOD_VALUES, "neutral")
        lighting = _safe_enum(scene_data.get("lighting", "natural"), _LIGHTING_VALUES, "natural")

        # Parsed shot breakdown for this scene (consumed by generate-shots later)
        scene_shots = [s for s in data["shots"] if s["scene_index"] == s_idx]

        scene = {
            "id": scene_id,
            "project_id": req.project_id,
            "name": scene_data["name"],
            "description": scene_data.get("description", ""),
            "sequence_order": base_scene_order + s_idx,
            "time_of_day": tod,
            "mood": mood,
            "lighting": lighting,
            "defaults": {
                "aspect_ratio": "16:9",
                "composition_preset": None,
                "lighting_mood": None,
                "hero_cast_id": None,
                "location_id": None,
                "prop_id": None,
            },
            "reference_assets": [],
            "establishing_frame_path": None,
            "shot_ids": [],
            # Parsed screenplay breakdown — kept until the user generates shots.
            "script_breakdown": scene_shots,
            "created_at": now,
            "updated_at": now,
        }
        scenes.append(scene)
        scene_ids.append(scene_id)

    _save_scenes(req.project_id, scenes)

    return ScreenplayImportResult(
        status="ok",
        project_id=req.project_id,
        scenes_created=len(scene_ids),
        shots_created=0,
        scene_ids=scene_ids,
        shot_ids=[],
    )


@router.post("/upload", response_model=ScreenplayImportResult)
async def upload_screenplay(
    project_id: str = Form("default"),
    dry_run: bool = Form(False),
    file: UploadFile = File(...),
):
    """Upload a screenplay file (.fountain, .txt, .spmd, or .fdx) and import it."""
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file provided")

    if not file.filename.endswith((".fountain", ".txt", ".spmd", ".fdx")):
        raise HTTPException(status_code=400, detail="File must be .fountain, .txt, .spmd, or .fdx format")

    content = await file.read()
    text = content.decode("utf-8", errors="replace")

    return await import_screenplay(ScreenplayImportRequest(
        project_id=project_id,
        text=text,
        dry_run=dry_run,
        filename=file.filename,
    ))
