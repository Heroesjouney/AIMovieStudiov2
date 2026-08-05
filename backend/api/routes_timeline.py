"""
Timeline Routes - Save/load timeline state per project.

The timeline is the final assembly point where video clips, audio,
and images are arranged into a sequence.
"""

import json
import os
import subprocess
import tempfile
import asyncio
from pathlib import Path
from typing import Optional, Dict, List
from datetime import datetime
from urllib.parse import unquote

from fastapi import APIRouter, HTTPException, BackgroundTasks
from fastapi.responses import FileResponse

router = APIRouter()
VAULT_DIR = Path(__file__).parent.parent / "assets"

# In-memory render job tracking
_render_jobs: Dict[str, dict] = {}


def _timeline_path(project_id: str) -> Path:
    return VAULT_DIR / project_id / "timeline.json"


@router.get("/{project_id}")
async def get_timeline(project_id: str):
    """Get the timeline state for a project."""
    tl_path = _timeline_path(project_id)
    if tl_path.exists():
        with open(tl_path, "r") as f:
            return json.load(f)
    return {
        "projectId": project_id,
        "fps": 24,
        "format": {"aspectRatio": "16:9", "width": 1920, "height": 1080},
        "videoTracks": [],
        "audioTracks": [],
    }


@router.put("/{project_id}")
async def save_timeline(project_id: str, timeline: dict):
    """Save the timeline state for a project."""
    tl_path = _timeline_path(project_id)
    tl_path.parent.mkdir(parents=True, exist_ok=True)
    with open(tl_path, "w") as f:
        json.dump(timeline, f, indent=2)
    return timeline


@router.post("/{project_id}")
async def save_timeline_post(project_id: str, timeline: dict):
    """Save the timeline state for a project (POST alias for compatibility)."""
    return await save_timeline(project_id, timeline)


# =============================================================================
# Render Timeline to MP4
# =============================================================================

def _resolve_source_url(source_url: str) -> Optional[Path]:
    """Resolve a clip sourceUrl to a local file path."""
    if not source_url:
        return None
    # Remove query params
    clean = source_url.split("?")[0]
    # If it starts with /assets/, map to VAULT_DIR
    if clean.startswith("/assets/"):
        rel = clean[len("/assets/"):]
        path = VAULT_DIR / rel
        if path.exists():
            return path
    # If it starts with /api/assets/, strip /api
    if clean.startswith("/api/assets/"):
        rel = clean[len("/api/assets/"):]
        path = VAULT_DIR / rel
        if path.exists():
            return path
    # Try as absolute path
    p = Path(clean)
    if p.exists():
        return p
    return None


def _get_clip_duration(clip: dict) -> float:
    """Get clip duration in seconds."""
    trim_in = clip.get("trimInSeconds", 0) or 0
    trim_out = clip.get("trimOutSeconds") or 0
    if trim_out and trim_out > trim_in:
        return trim_out - trim_in
    return 5.0


def _build_ffmpeg_command(
    clips: List[dict],
    audio_clips: List[dict],
    output_path: str,
    width: int = 1920,
    height: int = 1080,
    fps: int = 24,
) -> List[str]:
    """Build ffmpeg command to concatenate video clips and mix audio."""
    cmd = ["ffmpeg", "-y"]

    # Collect all input files
    input_args = []
    video_inputs = []
    audio_inputs = []

    for clip in clips:
        path = _resolve_source_url(clip.get("sourceUrl", ""))
        if not path:
            continue
        trim_in = clip.get("trimInSeconds", 0) or 0
        duration = _get_clip_duration(clip)
        input_args.extend(["-ss", str(trim_in), "-t", str(duration), "-i", str(path)])
        video_inputs.append(len(video_inputs))

    for clip in audio_clips:
        path = _resolve_source_url(clip.get("sourceUrl", ""))
        if not path:
            continue
        trim_in = clip.get("trimInSeconds", 0) or 0
        duration = _get_clip_duration(clip)
        input_args.extend(["-ss", str(trim_in), "-t", str(duration), "-i", str(path)])
        audio_inputs.append(len(video_inputs) + len(audio_inputs))

    if not video_inputs and not audio_inputs:
        return []

    cmd.extend(input_args)

    # Build filter complex
    filters = []
    video_streams = []
    for i, idx in enumerate(video_inputs):
        filters.append(f"[{idx}:v]scale={width}:{height}:force_original_aspect_ratio=decrease,pad={width}:{height}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps={fps}[v{i}]")
        video_streams.append(f"[v{i}]")

    if video_streams:
        concat_inputs = "".join(video_streams)
        n = len(video_streams)
        filters.append(f"{concat_inputs}concat=n={n}:v=1:a=0[vout]")

    # Audio mixing
    audio_streams = []
    for i, idx in enumerate(audio_inputs):
        filters.append(f"[{idx}:a]aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo[a{i}]")
        audio_streams.append(f"[a{i}]")

    if audio_streams:
        if len(audio_streams) > 1:
            mix_inputs = "".join(audio_streams)
            filters.append(f"{mix_inputs}amix=inputs={len(audio_streams)}:duration=longest[aout]")
        else:
            filters.append(f"{audio_streams[0]}acopy[aout]")

    filter_complex = ";".join(filters)

    cmd.extend(["-filter_complex", filter_complex])

    if video_streams and audio_streams:
        cmd.extend(["-map", "[vout]", "-map", "[aout]"])
    elif video_streams:
        cmd.extend(["-map", "[vout]"])
    elif audio_streams:
        cmd.extend(["-map", "[aout]"])

    cmd.extend([
        "-c:v", "libx264", "-preset", "medium", "-crf", "18",
        "-c:a", "aac", "-b:a", "192k",
        "-pix_fmt", "yuv420p",
        "-movflags", "+faststart",
        output_path,
    ])

    return cmd


async def _run_render_job(job_id: str, project_id: str, timeline: dict):
    """Background task to render timeline to MP4."""
    job = _render_jobs[job_id]
    try:
        job["status"] = "processing"
        job["updated_at"] = datetime.utcnow().isoformat()

        # Collect video clips from all video tracks, sorted by startTime
        video_clips = []
        for track in timeline.get("videoTracks", []):
            for clip in track.get("clips", []):
                video_clips.append(clip)
        video_clips.sort(key=lambda c: c.get("startTime", 0))

        # Collect audio clips from all audio tracks
        audio_clips = []
        for track in timeline.get("audioTracks", []):
            for clip in track.get("clips", []):
                audio_clips.append(clip)

        fmt = timeline.get("format", {})
        width = fmt.get("width", 1920)
        height = fmt.get("height", 1080)
        fps = timeline.get("fps", 24)

        output_dir = VAULT_DIR / project_id / "renders"
        output_dir.mkdir(parents=True, exist_ok=True)
        output_path = output_dir / f"render_{job_id}.mp4"

        cmd = _build_ffmpeg_command(video_clips, audio_clips, str(output_path), width, height, fps)

        if not cmd:
            job["status"] = "failed"
            job["error_message"] = "No valid video or audio clips found in timeline"
            job["updated_at"] = datetime.utcnow().isoformat()
            return

        job["command"] = " ".join(cmd)
        process = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await process.communicate()

        if process.returncode == 0:
            job["status"] = "completed"
            job["video_url"] = f"/assets/{project_id}/renders/render_{job_id}.mp4"
            job["file_size"] = output_path.stat().st_size
        else:
            job["status"] = "failed"
            job["error_message"] = stderr.decode()[-2000:] if stderr else "Unknown ffmpeg error"

        job["updated_at"] = datetime.utcnow().isoformat()

    except Exception as e:
        job["status"] = "failed"
        job["error_message"] = str(e)
        job["updated_at"] = datetime.utcnow().isoformat()


@router.post("/{project_id}/render")
async def render_timeline(project_id: str, background_tasks: BackgroundTasks):
    """Start a background render job to export the timeline as MP4."""
    tl_path = _timeline_path(project_id)
    if not tl_path.exists():
        raise HTTPException(status_code=404, detail="No timeline found. Save the timeline first.")

    with open(tl_path, "r") as f:
        timeline = json.load(f)

    video_clip_count = sum(len(t.get("clips", [])) for t in timeline.get("videoTracks", []))
    if video_clip_count == 0:
        raise HTTPException(status_code=400, detail="Timeline has no video clips to render")

    import uuid
    job_id = f"render_{uuid.uuid4().hex[:12]}"
    now = datetime.utcnow().isoformat()

    _render_jobs[job_id] = {
        "job_id": job_id,
        "project_id": project_id,
        "status": "pending",
        "video_url": None,
        "error_message": None,
        "created_at": now,
        "updated_at": now,
    }

    background_tasks.add_task(_run_render_job, job_id, project_id, timeline)

    return _render_jobs[job_id]


@router.get("/{project_id}/render/{job_id}")
async def get_render_status(project_id: str, job_id: str):
    """Check the status of a timeline render job."""
    job = _render_jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Render job not found")
    return job


@router.get("/{project_id}/renders")
async def list_renders(project_id: str):
    """List all completed renders for a project."""
    render_dir = VAULT_DIR / project_id / "renders"
    if not render_dir.exists():
        return {"project_id": project_id, "renders": []}

    renders = []
    for p in sorted(render_dir.iterdir(), key=lambda x: x.stat().st_mtime, reverse=True):
        if p.is_file() and p.suffix == ".mp4":
            renders.append({
                "filename": p.name,
                "video_url": f"/assets/{project_id}/renders/{p.name}",
                "size_bytes": p.stat().st_size,
                "modified_at": datetime.utcfromtimestamp(p.stat().st_mtime).isoformat(),
            })
    return {"project_id": project_id, "renders": renders}
