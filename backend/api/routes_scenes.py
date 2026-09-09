"""
Scene Routes - Scene management with defaults and shot lists.
"""

import json
import uuid
from pathlib import Path
from typing import List, Optional
from datetime import datetime

from fastapi import APIRouter, HTTPException

from core.schemas.scene import Scene, SceneCreateRequest, SceneAssetRef

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


def _save_shots_file(project_id: str, shots: List[dict]):
    with open(_project_dir(project_id) / "shots.json", "w") as f:
        json.dump(shots, f, indent=2, default=str)


@router.get("/{project_id}")
async def list_scenes(project_id: str):
    return _load_scenes(project_id)


# Registered at both "" and "/" so FastAPI never issues its slash-redirect.
# That redirect returns an absolute Location built from the host the backend
# was called on (http://localhost:8001/...). The browser is told to follow it
# directly, bypassing the Next.js proxy, which only resolves when the browser
# happens to be on the same machine as the backend.
@router.post("", include_in_schema=False)
@router.post("/")
async def create_scene(req: SceneCreateRequest):
    scene_id = str(uuid.uuid4())
    now = datetime.utcnow().isoformat()
    scene = {
        "id": scene_id,
        "project_id": req.project_id,
        "name": req.name,
        "description": req.description,
        "sequence_order": len(_load_scenes(req.project_id)),
        "time_of_day": req.time_of_day.value,
        "mood": req.mood.value,
        "lighting": req.lighting.value,
        "defaults": req.defaults.model_dump(),
        "reference_assets": [a.model_dump() for a in req.reference_assets],
        "shot_ids": [],
        "created_at": now,
        "updated_at": now,
    }
    scenes = _load_scenes(req.project_id)
    scenes.append(scene)
    _save_scenes(req.project_id, scenes)
    return scene


@router.get("/{project_id}/{scene_id}")
async def get_scene(project_id: str, scene_id: str):
    for s in _load_scenes(project_id):
        if s["id"] == scene_id:
            return s
    raise HTTPException(status_code=404, detail="Scene not found")


@router.put("/{project_id}/{scene_id}")
async def update_scene(project_id: str, scene_id: str, updates: dict):
    scenes = _load_scenes(project_id)
    for s in scenes:
        if s["id"] == scene_id:
            s.update(updates)
            s["updated_at"] = datetime.utcnow().isoformat()
            _save_scenes(project_id, scenes)
            return s
    raise HTTPException(status_code=404, detail="Scene not found")


@router.delete("/{project_id}/all")
async def delete_all_scenes(project_id: str):
    """Delete every scene in a project along with all of their shots.

    Used to discard an entire imported screenplay (or any full scene set).
    Removes scene records, shot records, and each shot's on-disk folder
    (frames, angle images, video takes, audio). The project itself is kept.
    """
    import shutil

    scenes = _load_scenes(project_id)
    deleted_scene_count = len(scenes)

    shots_path = _project_dir(project_id) / "shots.json"
    deleted_shot_count = 0
    if shots_path.exists():
        with open(shots_path, "r") as f:
            all_shots = json.load(f)
        deleted_shot_count = len(all_shots)

        # Delete each shot's folder (frames, video takes, angle images, etc.)
        shots_dir = _project_dir(project_id) / "shots"
        for shot in all_shots:
            shot_folder = shots_dir / shot["id"]
            if shot_folder.exists() and shot_folder.is_dir():
                try:
                    shutil.rmtree(shot_folder)
                except Exception as e:
                    print(f"[scenes] failed to delete shot folder {shot_folder}: {e}")

        _save_shots_file(project_id, [])

    _save_scenes(project_id, [])
    print(f"[scenes] bulk-deleted {deleted_scene_count} scene(s) and {deleted_shot_count} shot(s) from project '{project_id}'")

    return {
        "status": "deleted_all",
        "project_id": project_id,
        "scenes_deleted": deleted_scene_count,
        "shots_deleted": deleted_shot_count,
    }


@router.delete("/{project_id}/{scene_id}")
async def delete_scene(project_id: str, scene_id: str):
    scenes = _load_scenes(project_id)
    scene = next((s for s in scenes if s["id"] == scene_id), None)
    if not scene:
        raise HTTPException(status_code=404, detail="Scene not found")
    filtered = [s for s in scenes if s["id"] != scene_id]
    _save_scenes(project_id, filtered)

    # Delete all shots belonging to this scene + their files on disk
    import shutil
    shots_path = _project_dir(project_id) / "shots.json"
    if shots_path.exists():
        with open(shots_path, "r") as f:
            all_shots = json.load(f)
        scene_shots = [s for s in all_shots if s.get("scene_id") == scene_id]
        remaining_shots = [s for s in all_shots if s.get("scene_id") != scene_id]
        _save_shots_file(project_id, remaining_shots)

        # Delete each shot's folder (frame images, video takes, angle images, etc.)
        shots_dir = _project_dir(project_id) / "shots"
        for shot in scene_shots:
            shot_id = shot["id"]
            shot_folder = shots_dir / shot_id
            if shot_folder.exists() and shot_folder.is_dir():
                try:
                    shutil.rmtree(shot_folder)
                    print(f"[scenes] deleted shot folder: {shot_folder}")
                except Exception as e:
                    print(f"[scenes] failed to delete shot folder {shot_folder}: {e}")

        print(f"[scenes] deleted {len(scene_shots)} shot(s) from scene '{scene.get('name', scene_id)}'")

    return {"status": "deleted", "id": scene_id}


@router.post("/{project_id}/{scene_id}/reference-assets")
async def add_reference_asset(project_id: str, scene_id: str, asset: SceneAssetRef):
    """Add a reference asset to the scene recipe."""
    scenes = _load_scenes(project_id)
    for s in scenes:
        if s["id"] == scene_id:
            ref_assets = s.get("reference_assets", [])
            if not any(a["asset_id"] == asset.asset_id for a in ref_assets):
                ref_assets.append(asset.model_dump())
                s["reference_assets"] = ref_assets
                s["updated_at"] = datetime.utcnow().isoformat()
                _save_scenes(project_id, scenes)
            return s
    raise HTTPException(status_code=404, detail="Scene not found")


@router.delete("/{project_id}/{scene_id}/reference-assets/{asset_id}")
async def remove_reference_asset(project_id: str, scene_id: str, asset_id: str):
    """Remove a reference asset from the scene recipe."""
    scenes = _load_scenes(project_id)
    for s in scenes:
        if s["id"] == scene_id:
            s["reference_assets"] = [a for a in s.get("reference_assets", []) if a["asset_id"] != asset_id]
            s["updated_at"] = datetime.utcnow().isoformat()
            _save_scenes(project_id, scenes)
            return s
    raise HTTPException(status_code=404, detail="Scene not found")
