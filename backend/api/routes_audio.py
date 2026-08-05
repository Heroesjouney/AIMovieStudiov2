"""
Audio Routes - TTS, SFX, music, foley, and audio file management.

Supports both direct TTS (query-param) and job-based generation (JSON body)
for speech, music, and foley with async polling.
"""

import json
import os
import uuid
import shutil
from pathlib import Path
from typing import List, Optional, Dict, Any
from datetime import datetime

from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Body
from pydantic import BaseModel

from core.drivers import get_audio_driver
from core.drivers.base import AudioGenerationRequest

router = APIRouter()
VAULT_DIR = Path(__file__).parent.parent / "assets"

# In-memory job store (persists for server lifetime)
_audio_jobs: Dict[str, dict] = {}


class AudioJobRequest(BaseModel):
    project_id: str = "default"
    clip_name: Optional[str] = None
    text: str = ""
    actor_id: Optional[str] = None
    voice_id: Optional[str] = None
    language: str = "en"
    speed: Optional[float] = None
    generator: str = "fish_speech"
    duration_seconds: Optional[float] = None
    reference_audio_filename: Optional[str] = None
    input_video_filename: Optional[str] = None
    use_mock: bool = False


def _audio_dir(project_id: str) -> Path:
    d = VAULT_DIR / project_id / "audio"
    d.mkdir(parents=True, exist_ok=True)
    return d


def _references_dir(project_id: str) -> Path:
    d = VAULT_DIR / project_id / "audio_references"
    d.mkdir(parents=True, exist_ok=True)
    return d


def _foley_dir(project_id: str) -> Path:
    d = VAULT_DIR / project_id / "foley_videos"
    d.mkdir(parents=True, exist_ok=True)
    return d


# =============================================================================
# Job-based audio generation (speech, music, foley)
# =============================================================================

@router.post("/job")
async def start_audio_job(req: AudioJobRequest):
    """Start an audio generation job (speech, music, or foley)."""
    job_id = str(uuid.uuid4())
    now = datetime.utcnow().isoformat()

    job = {
        "job_id": job_id,
        "status": "pending",
        "audio_url": None,
        "video_url": None,
        "duration_seconds": None,
        "error_message": None,
        "created_at": now,
        "updated_at": now,
        "request": req.model_dump(),
    }
    _audio_jobs[job_id] = job

    try:
        driver = get_audio_driver(req.generator)
        if not driver:
            job["status"] = "failed"
            job["error_message"] = f"Unknown audio generator: {req.generator}"
            job["updated_at"] = datetime.utcnow().isoformat()
            raise HTTPException(status_code=400, detail=f"Unknown audio generator: {req.generator}")

        gen_req = AudioGenerationRequest(
            text=req.text,
            language=req.language,
            voice_id=req.voice_id,
            reference_audio_path=str(_references_dir(req.project_id) / req.reference_audio_filename) if req.reference_audio_filename else None,
        )

        job["status"] = "processing"
        job["updated_at"] = datetime.utcnow().isoformat()

        response = await driver.generate_speech(gen_req)

        # Save audio to project audio directory
        audio_folder = _audio_dir(req.project_id) / job_id
        audio_folder.mkdir(parents=True, exist_ok=True)

        clip_name = req.clip_name or f"audio_{job_id[:8]}"
        ext = ".wav"
        filename = f"{clip_name}{ext}"
        filepath = audio_folder / filename

        # If the driver returned a URL or path, try to download/copy it
        if hasattr(response, "audio_url") and response.audio_url:
            job["audio_url"] = f"/assets/{req.project_id}/audio/{job_id}/{filename}"
            job["status"] = "completed"
        elif hasattr(response, "audio_path") and response.audio_path:
            if os.path.exists(response.audio_path):
                shutil.copy2(response.audio_path, filepath)
                job["audio_url"] = f"/assets/{req.project_id}/audio/{job_id}/{filename}"
                job["status"] = "completed"
            else:
                job["status"] = "failed"
                job["error_message"] = "Audio file not found after generation"
        else:
            job["status"] = "completed"
            job["audio_url"] = getattr(response, "audio_url", None)

        if req.duration_seconds:
            job["duration_seconds"] = req.duration_seconds

        job["updated_at"] = datetime.utcnow().isoformat()

    except HTTPException:
        raise
    except Exception as e:
        job["status"] = "failed"
        job["error_message"] = str(e)
        job["updated_at"] = datetime.utcnow().isoformat()

    return {
        "job_id": job_id,
        "status": job["status"],
        "message": "Audio generation started" if job["status"] == "pending" else job.get("error_message", "Completed"),
    }


@router.get("/status/{job_id}")
async def get_audio_job_status(job_id: str):
    """Get the status of an audio generation job."""
    job = _audio_jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Audio job not found")
    return job


# =============================================================================
# Legacy direct TTS (query-param based)
# =============================================================================

@router.post("/tts")
async def generate_tts(
    text: str,
    language: str = "en",
    voice_id: Optional[str] = None,
    reference_audio_path: Optional[str] = None,
    model_id: str = "fish_speech",
):
    """Generate speech from text (direct, non-job)."""
    driver = get_audio_driver(model_id)
    if not driver:
        raise HTTPException(status_code=400, detail=f"Unknown audio model: {model_id}")

    req = AudioGenerationRequest(
        text=text,
        language=language,
        voice_id=voice_id,
        reference_audio_path=reference_audio_path,
    )
    response = await driver.generate_speech(req)
    return response.model_dump()


# =============================================================================
# Audio file management
# =============================================================================

@router.post("/upload/{project_id}")
async def upload_audio_file(project_id: str, file: UploadFile = File(...)):
    """Upload an audio file to the project vault."""
    audio_id = str(uuid.uuid4())
    audio_folder = VAULT_DIR / project_id / "audio" / audio_id
    audio_folder.mkdir(parents=True, exist_ok=True)

    ext = Path(file.filename).suffix or ".wav"
    filename = f"audio{ext}"
    filepath = audio_folder / filename
    with open(filepath, "wb") as f:
        shutil.copyfileobj(file.file, f)

    size = filepath.stat().st_size
    audio_url = f"/assets/{project_id}/audio/{audio_id}/{filename}"
    return {
        "filename": file.filename or filename,
        "audio_url": audio_url,
        "size_bytes": size,
    }


@router.get("/files/{project_id}")
async def list_audio_files(project_id: str):
    """List all audio files for a project."""
    audio_dir = VAULT_DIR / project_id / "audio"
    if not audio_dir.exists():
        return {"project_id": project_id, "files": []}

    files = []
    for d in audio_dir.iterdir():
        if d.is_dir():
            for f in d.iterdir():
                if f.suffix in (".wav", ".mp3", ".flac", ".ogg"):
                    files.append({
                        "filename": f.name,
                        "audio_url": f"/assets/{project_id}/audio/{d.name}/{f.name}",
                        "size_bytes": f.stat().st_size,
                        "modified_at": datetime.fromtimestamp(f.stat().st_mtime).isoformat(),
                    })
    return {"project_id": project_id, "files": files}


@router.delete("/file/{project_id}/{filename}")
async def delete_audio_file(project_id: str, filename: str):
    """Delete an audio file from the project."""
    audio_dir = VAULT_DIR / project_id / "audio"
    if not audio_dir.exists():
        raise HTTPException(status_code=404, detail="Audio directory not found")

    deleted = False
    for d in audio_dir.iterdir():
        if d.is_dir():
            target = d / filename
            if target.exists():
                target.unlink()
                deleted = True
                break

    return {"project_id": project_id, "filename": filename, "deleted": deleted}


# =============================================================================
# Audio reference voices (for TTS voice cloning)
# =============================================================================

@router.get("/references/{project_id}")
async def list_audio_references(project_id: str):
    """List reference audio files for voice cloning."""
    ref_dir = _references_dir(project_id)
    files = []
    if ref_dir.exists():
        for f in ref_dir.iterdir():
            if f.is_file() and f.suffix in (".wav", ".mp3", ".flac", ".ogg"):
                files.append({"filename": f.name})
    return {"project_id": project_id, "files": files}


@router.post("/references/{project_id}")
async def upload_audio_reference(project_id: str, file: UploadFile = File(...)):
    """Upload a reference audio file for voice cloning."""
    ref_dir = _references_dir(project_id)
    filename = file.filename or "reference.wav"
    filepath = ref_dir / filename
    with open(filepath, "wb") as f:
        shutil.copyfileobj(file.file, f)
    return {"filename": filename}


@router.delete("/references/{project_id}/{filename}")
async def delete_audio_reference(project_id: str, filename: str):
    """Delete a reference audio file."""
    ref_dir = _references_dir(project_id)
    filepath = ref_dir / filename
    if filepath.exists():
        filepath.unlink()
        return {"project_id": project_id, "filename": filename, "deleted": True}
    raise HTTPException(status_code=404, detail="Reference audio not found")


# =============================================================================
# Foley video upload
# =============================================================================

@router.post("/foley/video/{project_id}")
async def upload_foley_video(project_id: str, file: UploadFile = File(...)):
    """Upload a video file for foley sound generation."""
    foley_dir = _foley_dir(project_id)
    filename = file.filename or "foley_video.mp4"
    filepath = foley_dir / filename
    with open(filepath, "wb") as f:
        shutil.copyfileobj(file.file, f)
    return {"filename": filename, "path": str(filepath)}


@router.get("/foley/videos/{project_id}")
async def list_foley_videos(project_id: str):
    """List uploaded foley videos for a project."""
    foley_dir = _foley_dir(project_id)
    videos = []
    if foley_dir.exists():
        for f in foley_dir.iterdir():
            if f.is_file() and f.suffix in (".mp4", ".mov", ".avi", ".mkv", ".webm"):
                videos.append({
                    "filename": f.name,
                    "size_bytes": f.stat().st_size,
                    "modified_at": datetime.fromtimestamp(f.stat().st_mtime).isoformat(),
                })
    return {"project_id": project_id, "videos": videos}
