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
    input_video_url: Optional[str] = None
    use_mock: bool = False
    # Music generation fields
    lyrics: Optional[str] = None
    seed: Optional[int] = None
    steps: Optional[int] = None
    cfg: Optional[float] = None
    # Foley generation fields
    negative_prompt: Optional[str] = None


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

        # Resolve input video path for foley generation
        video_path = None
        video_url = req.input_video_url  # Cloud drivers need a public URL
        if req.input_video_filename:
            project_dir = VAULT_DIR / req.project_id
            video_candidates = [
                project_dir / "videos" / req.input_video_filename,
                project_dir / "foley_videos" / req.input_video_filename,
                project_dir / req.input_video_filename,
            ]
            # Also search recursively in videos/, shots/, and foley_videos/ subdirectories
            for subdir in ("videos", "shots", "foley_videos"):
                search_dir = project_dir / subdir
                if search_dir.exists():
                    for sub in search_dir.rglob(req.input_video_filename):
                        video_candidates.insert(0, sub)
                        break
            for vc in video_candidates:
                if vc.exists():
                    video_path = str(vc)
                    break

        gen_req = AudioGenerationRequest(
            text=req.text,
            language=req.language,
            voice_id=req.voice_id,
            reference_audio_path=str(_references_dir(req.project_id) / req.reference_audio_filename) if req.reference_audio_filename else None,
            lyrics=req.lyrics,
            duration_seconds=req.duration_seconds,
            seed=req.seed,
            steps=req.steps,
            cfg=req.cfg,
            clip_name=req.clip_name,
            video_path=video_path,
            negative_prompt=req.negative_prompt,
        )
        # Pass video_url via extra_params for cloud drivers
        if video_url:
            gen_req.extra_params["video_url"] = video_url

        job["status"] = "processing"
        job["updated_at"] = datetime.utcnow().isoformat()

        response = await driver.generate_speech(gen_req)

        # Check if the driver returned a processing status (e.g. ComfyUI)
        # In this case, the job stays in "processing" and is polled via /status
        response_status = getattr(response, "status", None)
        response_status_val = response_status.value if response_status else None

        if response_status_val == "failed":
            job["status"] = "failed"
            job["error_message"] = getattr(response, "error_message", "Generation failed")
            job["updated_at"] = datetime.utcnow().isoformat()
            return {
                "job_id": job_id,
                "status": job["status"],
                "message": job.get("error_message", "Failed"),
            }

        if response_status_val == "processing":
            # Async driver (e.g. ComfyUI) — job will be polled via /status/{job_id}
            job["status"] = "processing"
            job["updated_at"] = datetime.utcnow().isoformat()
            return {
                "job_id": job_id,
                "status": "processing",
                "message": "Audio generation started",
            }

        # Save audio to project audio directory
        audio_folder = _audio_dir(req.project_id) / job_id
        audio_folder.mkdir(parents=True, exist_ok=True)

        clip_name = req.clip_name or f"audio_{job_id[:8]}"
        ext = ".wav"
        filename = f"{clip_name}{ext}"
        filepath = audio_folder / filename

        # If the driver returned a URL or path, download/copy it into the vault
        remote_audio_url = getattr(response, "audio_url", None)
        local_audio_path = getattr(response, "audio_path", None)

        if remote_audio_url and remote_audio_url.startswith("http"):
            # Remote URL — download it into the vault
            import aiohttp
            try:
                async with aiohttp.ClientSession() as session:
                    async with session.get(remote_audio_url) as dl_resp:
                        if dl_resp.status == 200:
                            with open(filepath, "wb") as f:
                                f.write(await dl_resp.read())
                            job["audio_url"] = f"/assets/{req.project_id}/audio/{job_id}/{filename}"
                            job["status"] = "completed"
                        else:
                            job["status"] = "failed"
                            job["error_message"] = f"Failed to download audio (HTTP {dl_resp.status})"
            except Exception as dl_err:
                job["status"] = "failed"
                job["error_message"] = f"Failed to download audio: {dl_err}"
        elif remote_audio_url and not remote_audio_url.startswith("http"):
            # Local URL (e.g. /assets/...) — copy from vault
            source_path = VAULT_DIR / remote_audio_url.lstrip("/").removeprefix("assets/")
            if source_path.exists():
                shutil.copy2(source_path, filepath)
                job["audio_url"] = f"/assets/{req.project_id}/audio/{job_id}/{filename}"
                job["status"] = "completed"
            else:
                job["status"] = "failed"
                job["error_message"] = f"Audio file not found at {source_path}"
        elif local_audio_path and os.path.exists(local_audio_path):
            shutil.copy2(local_audio_path, filepath)
            job["audio_url"] = f"/assets/{req.project_id}/audio/{job_id}/{filename}"
            job["status"] = "completed"
        else:
            job["status"] = "completed"
            job["audio_url"] = remote_audio_url

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
    """Get the status of an audio generation job.

    For ComfyUI drivers, this polls the driver for updates when the job
    is still processing.
    """
    job = _audio_jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Audio job not found")

    # If the job is still processing, poll the driver for updates
    if job.get("status") == "processing":
        req_data = job.get("request", {})
        generator = req_data.get("generator", "fish_speech")
        driver = get_audio_driver(generator)
        if driver:
            try:
                response = await driver.check_status(job_id)
                if response.status.value == "completed":
                    # Download the audio to the vault
                    remote_url = response.audio_url
                    if remote_url and remote_url.startswith("http"):
                        # ComfyUI URL — download to vault
                        project_id = req_data.get("project_id", "default")
                        audio_folder = _audio_dir(project_id) / job_id
                        audio_folder.mkdir(parents=True, exist_ok=True)
                        clip_name = req_data.get("clip_name") or f"audio_{job_id[:8]}"
                        filename = f"{clip_name}.mp3"
                        filepath = audio_folder / filename
                        import aiohttp as _aiohttp
                        try:
                            async with _aiohttp.ClientSession() as session:
                                async with session.get(remote_url) as dl_resp:
                                    if dl_resp.status == 200:
                                        filepath.write_bytes(await dl_resp.read())
                                        job["audio_url"] = f"/assets/{project_id}/audio/{job_id}/{filename}"
                                        job["status"] = "completed"
                                    else:
                                        job["status"] = "failed"
                                        job["error_message"] = f"Failed to download audio (HTTP {dl_resp.status})"
                        except Exception as dl_err:
                            job["status"] = "failed"
                            job["error_message"] = f"Failed to download audio: {dl_err}"
                    elif remote_url:
                        job["audio_url"] = remote_url
                        job["status"] = "completed"
                    else:
                        job["status"] = "completed"
                    job["updated_at"] = datetime.utcnow().isoformat()
                elif response.status.value == "failed":
                    job["status"] = "failed"
                    job["error_message"] = response.error_message or "Generation failed"
                    job["updated_at"] = datetime.utcnow().isoformat()
                # If still processing, don't update — the next poll will check again
            except Exception as e:
                print(f"[routes_audio] status poll error: {e}")

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
    original_name = file.filename or f"audio{ext}"
    # Sanitize filename — keep original name for display
    safe_stem = Path(original_name).stem.replace(" ", "_").replace("/", "_").replace("\\", "_")
    filename = f"{safe_stem}{ext}"
    filepath = audio_folder / filename
    with open(filepath, "wb") as f:
        shutil.copyfileobj(file.file, f)

    size = filepath.stat().st_size
    audio_url = f"/assets/{project_id}/audio/{audio_id}/{filename}"
    return {
        "filename": filename,
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
    # Sort by modified time, newest first
    files.sort(key=lambda x: x["modified_at"], reverse=True)
    return {"project_id": project_id, "files": files}


@router.delete("/file/{project_id}/{filename}")
async def delete_audio_file(project_id: str, filename: str):
    """Delete an audio file from the project."""
    from urllib.parse import unquote
    filename = unquote(filename)
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
                # Clean up empty folder
                try:
                    if not any(d.iterdir()):
                        d.rmdir()
                except Exception:
                    pass
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
