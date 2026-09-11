"""
Previs Routes - Persistence for the 3D Camera Keyframing & Motion Previs stage.

The previs scene (proxies, camera channels, proxy keyframes, timeline settings)
is stored as a single JSON document per project in the Vault:

    assets/<project_id>/previs/scene.json

This is intentionally separate from scenes.json / shots.json — previs is
authoring state for the camera-blocking stage, not a production entity.

The document schema is owned + versioned by the frontend store
(usePrevisStore.serialize / hydrate); the backend only stores it.
"""

import json
from pathlib import Path
from typing import Any, Dict

from fastapi import APIRouter, HTTPException

router = APIRouter()

VAULT_DIR = Path(__file__).parent.parent / "assets"

# Guard against a corrupted / hostile payload blowing up the frontend.
MAX_SCENE_BYTES = 5 * 1024 * 1024  # 5 MB


def _scene_path(project_id: str) -> Path:
    return VAULT_DIR / project_id / "previs" / "scene.json"


@router.get("/{project_id}")
async def get_previs_scene(project_id: str):
    """Load the saved previs scene for a project (null when never saved)."""
    path = _scene_path(project_id)
    if not path.exists():
        return {"project_id": project_id, "scene": None}
    try:
        scene = json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError) as e:
        raise HTTPException(status_code=500, detail=f"Failed to read previs scene: {e}")
    return {"project_id": project_id, "scene": scene}


@router.put("/{project_id}")
async def save_previs_scene(project_id: str, scene: Dict[str, Any]):
    """Persist the previs scene for a project (overwrites any previous save)."""
    if not isinstance(scene, dict) or "version" not in scene:
        raise HTTPException(status_code=400, detail="Previs scene must be a JSON object with a 'version' field")

    if len(json.dumps(scene).encode("utf-8")) > MAX_SCENE_BYTES:
        raise HTTPException(status_code=413, detail="Previs scene too large (max 5 MB)")

    d = _scene_path(project_id).parent
    d.mkdir(parents=True, exist_ok=True)
    path = _scene_path(project_id)
    path.write_text(json.dumps(scene, indent=2), encoding="utf-8")
    return {"status": "saved", "project_id": project_id, "bytes": path.stat().st_size}
