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

VIDEO_EXTENSIONS = {".mp4", ".mov", ".avi", ".mkv", ".webm"}


def _project_dir(project_id: str) -> Path:
    d = VAULT_DIR / project_id
    d.mkdir(parents=True, exist_ok=True)
    return d


def _move_with_collision(src: Path, dest_dir: Path) -> Path:
    """Move a file to dest_dir, renaming if there's a collision. Returns the destination path."""
    dest = dest_dir / src.name
    if dest.exists():
        stem = src.stem
        suffix = src.suffix
        counter = 1
        while dest.exists():
            dest = dest_dir / f"{stem}_{counter}{suffix}"
            counter += 1
    import shutil as _shutil
    _shutil.move(str(src), str(dest))
    return dest


def _preserve_videos_from_shot(project_id: str, shot_folder: Path) -> int:
    """Move video files from a shot folder to the vault's videos/ directory before deletion.

    Images and other files are left in the shot folder to be deleted with it.
    Returns the number of video files preserved.
    """
    if not shot_folder.exists() or not shot_folder.is_dir():
        return 0

    videos_dir = _project_dir(project_id) / "videos"
    videos_dir.mkdir(parents=True, exist_ok=True)

    preserved = 0
    for f in shot_folder.iterdir():
        if f.is_file() and f.suffix.lower() in VIDEO_EXTENSIONS:
            try:
                dest = _move_with_collision(f, videos_dir)
                preserved += 1
                print(f"[scenes] preserved video: {f.name} -> videos/{dest.name}")
            except Exception as e:
                print(f"[scenes] failed to preserve video {f.name}: {e}")

    return preserved


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


def _load_assets(project_id: str) -> List[dict]:
    idx = _project_dir(project_id) / "assets.json"
    if idx.exists():
        with open(idx, "r") as f:
            return json.load(f)
    return []


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
    preserved_videos = 0
    if shots_path.exists():
        with open(shots_path, "r") as f:
            all_shots = json.load(f)
        deleted_shot_count = len(all_shots)

        # Preserve video files before deleting shot folders (images are deleted with the folder)
        shots_dir = _project_dir(project_id) / "shots"
        for shot in all_shots:
            shot_folder = shots_dir / shot["id"]
            if shot_folder.exists() and shot_folder.is_dir():
                try:
                    preserved_videos += _preserve_videos_from_shot(project_id, shot_folder)
                    shutil.rmtree(shot_folder)
                except Exception as e:
                    print(f"[scenes] failed to delete shot folder {shot_folder}: {e}")

        _save_shots_file(project_id, [])

    _save_scenes(project_id, [])
    print(f"[scenes] bulk-deleted {deleted_scene_count} scene(s) and {deleted_shot_count} shot(s) from project '{project_id}' (preserved {preserved_videos} video(s))")

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

        # Preserve video files before deleting shot folders (images are deleted with the folder)
        shots_dir = _project_dir(project_id) / "shots"
        preserved_videos = 0
        for shot in scene_shots:
            shot_id = shot["id"]
            shot_folder = shots_dir / shot_id
            if shot_folder.exists() and shot_folder.is_dir():
                try:
                    preserved_videos += _preserve_videos_from_shot(project_id, shot_folder)
                    shutil.rmtree(shot_folder)
                    print(f"[scenes] deleted shot folder: {shot_folder}")
                except Exception as e:
                    print(f"[scenes] failed to delete shot folder {shot_folder}: {e}")

        print(f"[scenes] deleted {len(scene_shots)} shot(s) from scene '{scene.get('name', scene_id)}' (preserved {preserved_videos} video(s))")

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


@router.put("/{project_id}/{scene_id}/reference-assets/{asset_id}/retention")
async def update_reference_asset_retention(project_id: str, scene_id: str, asset_id: str, body: dict):
    """Update the retention level of a recipe asset."""
    retention = body.get("retention", "fully_preserved")
    valid = {"fully_preserved", "partially_preserved", "attribute_transfer", "weak_reference"}
    if retention not in valid:
        raise HTTPException(status_code=400, detail=f"Invalid retention level: {retention}")
    scenes = _load_scenes(project_id)
    for s in scenes:
        if s["id"] == scene_id:
            for a in s.get("reference_assets", []):
                if a["asset_id"] == asset_id:
                    a["retention"] = retention
                    s["updated_at"] = datetime.utcnow().isoformat()
                    _save_scenes(project_id, scenes)
                    return s
            raise HTTPException(status_code=404, detail="Asset not found in recipe")
    raise HTTPException(status_code=404, detail="Scene not found")


@router.post("/{project_id}/{scene_id}/sync-recipe")
async def sync_recipe_to_shots(project_id: str, scene_id: str):
    """Re-bind the scene's recipe assets to all existing shots in the scene.

    For each shot belonging to this scene, replaces its assets with the
    current recipe assets (preserving retention levels set on the recipe).
    Shots that have no scene_id or a different scene_id are untouched.
    """
    scenes = _load_scenes(project_id)
    scene = next((s for s in scenes if s["id"] == scene_id), None)
    if scene is None:
        raise HTTPException(status_code=404, detail="Scene not found")

    recipe = scene.get("reference_assets", [])
    # Build the asset list that shots will receive — same logic as create_shot:
    # first bind reference_assets (the recipe), then merge scene defaults
    # (hero_cast_id, location_id, prop_id) if not already included.
    recipe_assets = [
        {
            "asset_id": ref["asset_id"],
            "asset_name": ref.get("asset_name", ""),
            "image_path": ref.get("image_path"),
            "role": ref.get("asset_type", "character"),
            "retention": ref.get("retention", "fully_preserved"),
        }
        for ref in recipe
    ]
    ref_ids = {a["asset_id"] for a in recipe_assets}
    defaults = scene.get("defaults", {})
    assets_list = _load_assets(project_id)
    for default_key, default_val in defaults.items():
        if default_val and default_key in ("hero_cast_id", "location_id", "prop_id"):
            if default_val in ref_ids:
                continue
            asset = next((a for a in assets_list if a["id"] == default_val), None)
            if asset:
                role = "character" if "cast" in default_key else ("location" if "location" in default_key else "prop")
                recipe_assets.append({
                    "asset_id": asset["id"],
                    "asset_name": asset.get("name", ""),
                    "image_path": asset.get("primary_image"),
                    "role": role,
                })

    shots_path = _project_dir(project_id) / "shots.json"
    shots = []
    if shots_path.exists():
        with open(shots_path, "r") as f:
            shots = json.load(f)

    updated_count = 0
    for shot in shots:
        if shot.get("scene_id") != scene_id:
            continue
        shot["assets"] = recipe_assets
        shot["updated_at"] = datetime.utcnow().isoformat()
        updated_count += 1

    if updated_count > 0:
        _save_shots_file(project_id, shots)

    return {
        "status": "synced",
        "scene_id": scene_id,
        "shots_synced": updated_count,
        "recipe_asset_count": len(recipe_assets),
    }
