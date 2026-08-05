"""
AI Movie Studio 2 - Project Routes

Projects are stored as directories under the Vault.
Each project directory contains assets/, shots.json, scenes.json, timeline.json, etc.
"""

import os
import re
from datetime import datetime
from pathlib import Path
from typing import List

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter()

VAULT_DIR = Path(__file__).resolve().parent.parent / "assets"


class ProjectCreate(BaseModel):
    name: str
    description: str = ""


class ProjectResponse(BaseModel):
    id: str
    name: str
    description: str
    created_at: str
    asset_count: int
    shot_count: int


def _slugify(name: str) -> str:
    slug = re.sub(r"[^a-zA-Z0-9_-]+", "_", name.strip()).strip("_").lower()
    return slug or "untitled"


def _project_dir(project_id: str) -> Path:
    return VAULT_DIR / project_id


def _read_project_meta(project_dir: Path) -> dict:
    meta_file = project_dir / "project.json"
    if meta_file.exists():
        import json
        with open(meta_file, "r", encoding="utf-8") as f:
            return json.load(f)
    return {}


def _write_project_meta(project_dir: Path, meta: dict) -> None:
    meta_file = project_dir / "project.json"
    import json
    with open(meta_file, "w", encoding="utf-8") as f:
        json.dump(meta, f, indent=2)


def _count_assets(project_dir: Path) -> int:
    assets_file = project_dir / "assets.json"
    if assets_file.exists():
        import json
        with open(assets_file, "r", encoding="utf-8") as f:
            data = json.load(f)
            return len(data) if isinstance(data, list) else 0
    return 0


def _count_shots(project_dir: Path) -> int:
    shots_file = project_dir / "shots.json"
    if shots_file.exists():
        import json
        with open(shots_file, "r", encoding="utf-8") as f:
            data = json.load(f)
            return len(data) if isinstance(data, list) else 0
    return 0


@router.get("/", response_model=List[ProjectResponse])
async def list_projects():
    """List all projects in the Vault."""
    projects = []
    if not VAULT_DIR.exists():
        return projects

    for entry in sorted(VAULT_DIR.iterdir()):
        if not entry.is_dir():
            continue
        if entry.name.startswith("__") or entry.name.startswith("."):
            continue

        meta = _read_project_meta(entry)
        projects.append(ProjectResponse(
            id=entry.name,
            name=meta.get("name", entry.name),
            description=meta.get("description", ""),
            created_at=meta.get("created_at", datetime.utcnow().isoformat()),
            asset_count=_count_assets(entry),
            shot_count=_count_shots(entry),
        ))

    return projects


@router.post("/", response_model=ProjectResponse)
async def create_project(body: ProjectCreate):
    """Create a new project directory in the Vault."""
    project_id = _slugify(body.name)

    project_dir = _project_dir(project_id)
    if project_dir.exists():
        raise HTTPException(status_code=409, detail=f"Project '{project_id}' already exists")

    project_dir.mkdir(parents=True, exist_ok=True)
    (project_dir / "assets").mkdir(exist_ok=True)

    meta = {
        "name": body.name,
        "description": body.description,
        "created_at": datetime.utcnow().isoformat(),
    }
    _write_project_meta(project_dir, meta)

    return ProjectResponse(
        id=project_id,
        name=body.name,
        description=body.description,
        created_at=meta["created_at"],
        asset_count=0,
        shot_count=0,
    )


@router.delete("/{project_id}")
async def delete_project(project_id: str):
    """Delete a project and all its data."""
    project_dir = _project_dir(project_id)
    if not project_dir.exists():
        raise HTTPException(status_code=404, detail="Project not found")

    import shutil
    shutil.rmtree(project_dir)
    return {"status": "deleted", "project_id": project_id}


@router.get("/{project_id}", response_model=ProjectResponse)
async def get_project(project_id: str):
    """Get details for a single project."""
    project_dir = _project_dir(project_id)
    if not project_dir.exists():
        raise HTTPException(status_code=404, detail="Project not found")

    meta = _read_project_meta(project_dir)
    return ProjectResponse(
        id=project_id,
        name=meta.get("name", project_id),
        description=meta.get("description", ""),
        created_at=meta.get("created_at", datetime.utcnow().isoformat()),
        asset_count=_count_assets(project_dir),
        shot_count=_count_shots(project_dir),
    )
