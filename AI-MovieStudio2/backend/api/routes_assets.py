"""
Asset Routes - CRUD for characters, locations, props, vehicles.

All assets are stored in the Vault as JSON + media files.
"""

import json
import uuid
import shutil
from pathlib import Path
from typing import List, Optional
from datetime import datetime
from urllib.parse import unquote

import httpx
from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Query
from fastapi.responses import JSONResponse, FileResponse
from pydantic import BaseModel

from core.schemas.asset import (
    Asset, AssetType, AssetStatus, AssetCreateRequest,
    AssetGenerateRequest, AssetResponse,
)

router = APIRouter()

VAULT_DIR = Path(__file__).parent.parent / "assets"


def _project_dir(project_id: str) -> Path:
    d = VAULT_DIR / project_id
    d.mkdir(parents=True, exist_ok=True)
    return d


def _assets_index(project_id: str) -> Path:
    return _project_dir(project_id) / "assets.json"


def _load_assets(project_id: str) -> List[dict]:
    idx = _assets_index(project_id)
    if idx.exists():
        with open(idx, "r") as f:
            return json.load(f)
    return []


def _save_assets(project_id: str, assets: List[dict]):
    idx = _assets_index(project_id)
    with open(idx, "w") as f:
        json.dump(assets, f, indent=2, default=str)


def _find_asset(project_id: str, asset_id: str) -> Optional[dict]:
    for a in _load_assets(project_id):
        if a["id"] == asset_id:
            return a
    return None


def _asset_to_response(a: dict) -> dict:
    return {
        "id": a["id"],
        "project_id": a["project_id"],
        "type": a["type"],
        "name": a["name"],
        "version": a.get("version", 1),
        "status": a.get("status", "draft"),
        "primary_image": a.get("primary_image"),
        "thumbnail": a.get("thumbnail"),
        "folder_path": a.get("folder_path"),
        "tags": a.get("tags", []),
        "description": a.get("description"),
        "generation_prompt": a.get("generation_prompt"),
        "character_data": a.get("character_data"),
        "location_data": a.get("location_data"),
        "created_at": a.get("created_at"),
        "updated_at": a.get("updated_at"),
    }


# =============================================================================
# Video Upload Endpoints (MUST be before parameterized routes to avoid conflicts)
# =============================================================================

@router.post("/videos/upload")
async def upload_video(
    file: UploadFile = File(..., description="Video file to upload"),
    project_id: str = Form(default="default", description="Project ID"),
):
    allowed_extensions = {".mp4", ".mov", ".avi", ".mkv", ".webm"}
    ext = Path(file.filename).suffix.lower() if file.filename else ""

    if ext not in allowed_extensions:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid file type. Allowed: {', '.join(allowed_extensions)}"
        )

    videos_dir = VAULT_DIR / project_id / "videos"
    videos_dir.mkdir(parents=True, exist_ok=True)

    file_path = videos_dir / file.filename

    counter = 1
    original_stem = file_path.stem
    while file_path.exists():
        file_path = videos_dir / f"{original_stem}_{counter}{ext}"
        counter += 1

    content = await file.read()
    file_path.write_bytes(content)

    # Extract duration using ffprobe
    duration_seconds = None
    try:
        import subprocess
        result = subprocess.run(
            ["ffprobe", "-v", "error", "-show_entries", "format=duration",
             "-of", "default=noprint_wrappers=1:nokey=1", str(file_path)],
            capture_output=True, text=True, timeout=10,
        )
        if result.returncode == 0:
            d = float(result.stdout.strip())
            if d > 0:
                duration_seconds = d
    except Exception:
        pass

    return {
        "filename": file_path.name,
        "path": str(file_path),
        "size_bytes": len(content),
        "video_url": f"/assets/{project_id}/videos/{file_path.name}",
        "duration_seconds": duration_seconds,
    }


@router.get("/videos/list")
async def list_videos(project_id: str = Query(default="default")):
    videos_dir = VAULT_DIR / project_id / "videos"
    videos_dir.mkdir(parents=True, exist_ok=True)

    allowed_extensions = {".mp4", ".mov", ".avi", ".mkv", ".webm"}
    videos = []

    for p in sorted(videos_dir.iterdir(), key=lambda x: x.stat().st_mtime, reverse=True):
        if p.is_file() and p.suffix.lower() in allowed_extensions:
            # Extract duration using ffprobe
            duration_seconds = None
            try:
                import subprocess
                result = subprocess.run(
                    ["ffprobe", "-v", "error", "-show_entries", "format=duration",
                     "-of", "default=noprint_wrappers=1:nokey=1", str(p)],
                    capture_output=True, text=True, timeout=10,
                )
                if result.returncode == 0:
                    d = float(result.stdout.strip())
                    if d > 0:
                        duration_seconds = d
            except Exception:
                pass

            videos.append({
                "filename": p.name,
                "video_url": f"/assets/{project_id}/videos/{p.name}",
                "size_bytes": p.stat().st_size,
                "modified_at": datetime.utcfromtimestamp(p.stat().st_mtime).isoformat(),
                "duration_seconds": duration_seconds,
            })

    return {"project_id": project_id, "videos": videos}


@router.delete("/videos/{project_id}/{filename:path}")
async def delete_video(project_id: str, filename: str):
    decoded_filename = unquote(filename)
    videos_dir = VAULT_DIR / project_id / "videos"
    file_path = videos_dir / decoded_filename

    if not file_path.exists():
        if videos_dir.exists():
            for f in videos_dir.iterdir():
                if f.name.lower() == decoded_filename.lower():
                    file_path = f
                    break

    if not file_path.exists():
        raise HTTPException(status_code=404, detail=f"Video not found: {decoded_filename}")

    file_path.unlink()
    return {"deleted": True, "filename": file_path.name}


# =============================================================================
# Image Upload Endpoints (for timeline library — plates, graphics, hold frames)
# =============================================================================

@router.post("/images/upload")
async def upload_image(
    file: UploadFile = File(..., description="Image file to upload"),
    project_id: str = Form(default="default", description="Project ID"),
):
    allowed_extensions = {".png", ".jpg", ".jpeg", ".webp", ".bmp", ".tiff", ".gif"}
    ext = Path(file.filename).suffix.lower() if file.filename else ""

    if ext not in allowed_extensions:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid file type. Allowed: {', '.join(allowed_extensions)}"
        )

    images_dir = VAULT_DIR / project_id / "images"
    images_dir.mkdir(parents=True, exist_ok=True)

    file_path = images_dir / file.filename

    counter = 1
    original_stem = file_path.stem
    while file_path.exists():
        file_path = images_dir / f"{original_stem}_{counter}{ext}"
        counter += 1

    content = await file.read()
    file_path.write_bytes(content)

    return {
        "filename": file_path.name,
        "image_url": f"/assets/{project_id}/images/{file_path.name}",
        "size_bytes": len(content),
    }


@router.get("/images/list")
async def list_images(project_id: str = Query(default="default")):
    images_dir = VAULT_DIR / project_id / "images"
    images_dir.mkdir(parents=True, exist_ok=True)

    allowed_extensions = {".png", ".jpg", ".jpeg", ".webp", ".bmp", ".tiff", ".gif"}
    images = []

    for p in sorted(images_dir.iterdir(), key=lambda x: x.stat().st_mtime, reverse=True):
        if p.is_file() and p.suffix.lower() in allowed_extensions:
            images.append({
                "filename": p.name,
                "image_url": f"/assets/{project_id}/images/{p.name}",
                "size_bytes": p.stat().st_size,
                "modified_at": datetime.utcfromtimestamp(p.stat().st_mtime).isoformat(),
            })

    return {"project_id": project_id, "images": images}


@router.delete("/images/{project_id}/{filename:path}")
async def delete_image(project_id: str, filename: str):
    decoded_filename = unquote(filename)
    images_dir = VAULT_DIR / project_id / "images"
    file_path = images_dir / decoded_filename

    if not file_path.exists():
        if images_dir.exists():
            for f in images_dir.iterdir():
                if f.name.lower() == decoded_filename.lower():
                    file_path = f
                    break

    if not file_path.exists():
        raise HTTPException(status_code=404, detail=f"Image not found: {decoded_filename}")

    file_path.unlink()
    return {"deleted": True, "filename": file_path.name}


@router.get("/{project_id}")
async def list_assets(project_id: str, asset_type: Optional[str] = None):
    assets = _load_assets(project_id)
    if asset_type:
        assets = [a for a in assets if a["type"] == asset_type]
    return [_asset_to_response(a) for a in assets]


@router.post("/")
async def create_asset(req: AssetCreateRequest):
    asset_id = str(uuid.uuid4())
    now = datetime.utcnow().isoformat()
    asset = {
        "id": asset_id,
        "project_id": req.project_id,
        "type": req.type.value,
        "name": req.name,
        "version": 1,
        "status": AssetStatus.DRAFT.value,
        "primary_image": None,
        "thumbnail": None,
        "folder_path": None,
        "tags": req.tags,
        "description": req.description,
        "character_data": None,
        "location_data": None,
        "created_at": now,
        "updated_at": now,
    }
    assets = _load_assets(req.project_id)
    assets.append(asset)
    _save_assets(req.project_id, assets)
    return _asset_to_response(asset)


@router.get("/{project_id}/{asset_id}")
async def get_asset(project_id: str, asset_id: str):
    a = _find_asset(project_id, asset_id)
    if not a:
        raise HTTPException(status_code=404, detail="Asset not found")
    return _asset_to_response(a)


@router.put("/{project_id}/{asset_id}")
async def update_asset(project_id: str, asset_id: str, updates: dict):
    assets = _load_assets(project_id)
    for a in assets:
        if a["id"] == asset_id:
            a.update(updates)
            a["updated_at"] = datetime.utcnow().isoformat()
            _save_assets(project_id, assets)
            return _asset_to_response(a)
    raise HTTPException(status_code=404, detail="Asset not found")


@router.delete("/{project_id}/{asset_id}")
async def delete_asset(project_id: str, asset_id: str):
    assets = _load_assets(project_id)
    filtered = [a for a in assets if a["id"] != asset_id]
    if len(filtered) == len(assets):
        raise HTTPException(status_code=404, detail="Asset not found")
    _save_assets(project_id, filtered)
    return {"status": "deleted", "id": asset_id}


@router.post("/upload")
async def upload_asset(
    project_id: str = Form(...),
    name: str = Form(...),
    asset_type: str = Form(...),
    description: str = Form(None),
    file: UploadFile = File(...),
):
    asset_id = str(uuid.uuid4())
    asset_folder = _project_dir(project_id) / asset_id
    asset_folder.mkdir(parents=True, exist_ok=True)

    ext = Path(file.filename).suffix or ".png"
    filename = f"primary{ext}"
    filepath = asset_folder / filename
    with open(filepath, "wb") as f:
        shutil.copyfileobj(file.file, f)

    image_url = f"/assets/{project_id}/{asset_id}/{filename}"
    now = datetime.utcnow().isoformat()
    asset = {
        "id": asset_id,
        "project_id": project_id,
        "type": asset_type,
        "name": name,
        "version": 1,
        "status": AssetStatus.READY.value,
        "primary_image": image_url,
        "thumbnail": image_url,
        "folder_path": str(asset_folder),
        "tags": [],
        "description": description,
        "character_data": None,
        "location_data": None,
        "created_at": now,
        "updated_at": now,
    }
    assets = _load_assets(project_id)
    assets.append(asset)
    _save_assets(project_id, assets)
    return _asset_to_response(asset)


class SaveGeneratedRequest(BaseModel):
    project_id: str
    image_url: str
    asset_type: str = "character"
    name: str
    description: Optional[str] = None
    prompt: Optional[str] = None
    asset_id: Optional[str] = None  # If provided, update existing asset


@router.post("/save-generated")
async def save_generated_image(req: SaveGeneratedRequest):
    """Download a generated image from a URL (ComfyUI or cloud) and save it to the Vault.

    Creates a new asset or updates an existing one with the downloaded image
    as primary_image and thumbnail.
    """
    asset_id = req.asset_id or str(uuid.uuid4())
    asset_folder = _project_dir(req.project_id) / asset_id
    asset_folder.mkdir(parents=True, exist_ok=True)

    # Download the image
    image_bytes = None
    content_type = ""

    if req.image_url.startswith("/assets/"):
        # Relative URL — read directly from Vault
        local_path = VAULT_DIR / req.image_url[len("/assets/"):]
        if not local_path.exists():
            raise HTTPException(
                status_code=404,
                detail=f"Image not found in Vault: {req.image_url}",
            )
        image_bytes = local_path.read_bytes()
        # Guess content type from extension
        ext = local_path.suffix.lower()
        if ext == ".png":
            content_type = "image/png"
        elif ext == ".webp":
            content_type = "image/webp"
        elif ext in (".jpg", ".jpeg"):
            content_type = "image/jpeg"
        else:
            content_type = "image/png"
    else:
        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                resp = await client.get(req.image_url)
                if resp.status_code != 200:
                    raise HTTPException(
                        status_code=502,
                        detail=f"Failed to download image: HTTP {resp.status_code}",
                    )
                image_bytes = resp.content
                content_type = resp.headers.get("content-type", "")
        except httpx.RequestError as e:
            raise HTTPException(
                status_code=502,
                detail=f"Failed to download image: {str(e)}",
            )

    # Determine extension from content-type or URL
    if "png" in content_type:
        ext = ".png"
    elif "webp" in content_type:
        ext = ".webp"
    elif "jpeg" in content_type or "jpg" in content_type:
        ext = ".jpg"
    else:
        # Try to extract from URL
        url_path = req.image_url.split("?")[0]
        if "." in url_path.split("/")[-1]:
            ext = "." + url_path.split("/")[-1].rsplit(".", 1)[-1]
        else:
            ext = ".png"

    filename = f"primary{ext}"
    filepath = asset_folder / filename
    filepath.write_bytes(image_bytes)

    # Also save a copy of the prompt as metadata
    if req.prompt:
        meta_path = asset_folder / "generation_meta.json"
        with open(meta_path, "w") as f:
            json.dump({
                "prompt": req.prompt,
                "source_url": req.image_url,
                "saved_at": datetime.utcnow().isoformat(),
            }, f, indent=2)

    image_url = f"/assets/{req.project_id}/{asset_id}/{filename}"
    now = datetime.utcnow().isoformat()

    assets = _load_assets(req.project_id)

    if req.asset_id:
        # Update existing asset
        found = False
        for a in assets:
            if a["id"] == asset_id:
                a["primary_image"] = image_url
                a["thumbnail"] = image_url
                a["folder_path"] = str(asset_folder)
                a["status"] = AssetStatus.READY.value
                a["updated_at"] = now
                if req.prompt:
                    a["generation_prompt"] = req.prompt
                if req.prompt and not a.get("description"):
                    a["description"] = req.prompt
                found = True
                break
        if not found:
            raise HTTPException(status_code=404, detail="Asset not found")
    else:
        # Create new asset
        asset = {
            "id": asset_id,
            "project_id": req.project_id,
            "type": req.asset_type,
            "name": req.name,
            "version": 1,
            "status": AssetStatus.READY.value,
            "primary_image": image_url,
            "thumbnail": image_url,
            "folder_path": str(asset_folder),
            "tags": [],
            "description": req.description or req.prompt,
            "generation_prompt": req.prompt,
            "character_data": None,
            "location_data": None,
            "created_at": now,
            "updated_at": now,
        }
        assets.append(asset)

    _save_assets(req.project_id, assets)

    # Return the asset
    for a in assets:
        if a["id"] == asset_id:
            return _asset_to_response(a)
    raise HTTPException(status_code=500, detail="Failed to save asset")


# =============================================================================
# Waveform & Thumbnail Generation (ffmpeg)
# =============================================================================

@router.get("/waveform/{project_id}/{filename:path}")
async def get_waveform(project_id: str, filename: str):
    """Generate waveform peaks from an audio/video file using ffmpeg."""
    import subprocess
    import struct

    decoded = unquote(filename)
    # Try to find the file in various locations
    candidates = [
        VAULT_DIR / project_id / "audio" / decoded,
        VAULT_DIR / project_id / "videos" / decoded,
        VAULT_DIR / project_id / decoded,
    ]
    file_path = None
    for c in candidates:
        if c.exists():
            file_path = c
            break
    if not file_path:
        raise HTTPException(status_code=404, detail=f"File not found: {decoded}")

    # Use ffmpeg to extract raw PCM audio data, downsample to get peaks
    # Output: raw s16le mono at low sample rate
    try:
        result = subprocess.run(
            [
                "ffmpeg", "-i", str(file_path),
                "-ac", "1",  # mono
                "-ar", "8000",  # 8kHz sample rate
                "-f", "s16le",  # raw 16-bit signed little-endian
                "-t", "300",  # cap at 5 minutes
                "pipe:1",
            ],
            capture_output=True,
            timeout=30,
        )
        if result.returncode != 0:
            raise HTTPException(status_code=500, detail="ffmpeg failed to extract audio")

        raw = result.returncode and result.stderr or result.stdout
        if not result.stdout:
            raise HTTPException(status_code=500, detail="No audio data extracted")

        # Parse raw s16le samples and compute peaks
        samples = result.stdout
        num_samples = len(samples) // 2
        if num_samples == 0:
            return {"peaks": [], "duration_seconds": 0}

        # Group samples into ~200 buckets for waveform display
        bucket_size = max(1, num_samples // 200)
        peaks = []
        for i in range(0, num_samples, bucket_size):
            chunk = samples[i * 2:(i + bucket_size) * 2]
            if len(chunk) < 2:
                break
            vals = [struct.unpack_from("<h", chunk, j)[0] for j in range(0, len(chunk) - 1, 2)]
            if vals:
                peak = max(abs(v) for v in vals) / 32768.0
                peaks.append(round(peak, 4))

        duration = num_samples / 8000.0
        return {"peaks": peaks, "duration_seconds": round(duration, 2)}

    except subprocess.TimeoutExpired:
        raise HTTPException(status_code=500, detail="ffmpeg timed out")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/thumbnails/{project_id}/{filename:path}")
async def get_video_thumbnails(project_id: str, filename: str, count: int = Query(default=6, ge=1, le=20)):
    """Generate thumbnail strip from a video file using ffmpeg."""
    import subprocess
    import base64

    decoded = unquote(filename)
    candidates = [
        VAULT_DIR / project_id / "videos" / decoded,
        VAULT_DIR / project_id / decoded,
    ]
    file_path = None
    for c in candidates:
        if c.exists():
            file_path = c
            break
    if not file_path:
        raise HTTPException(status_code=404, detail=f"Video not found: {decoded}")

    try:
        # Get video duration first
        duration_result = subprocess.run(
            ["ffprobe", "-v", "error", "-show_entries", "format=duration",
             "-of", "default=noprint_wrappers=1:nokey=1", str(file_path)],
            capture_output=True, text=True, timeout=10,
        )
        if duration_result.returncode != 0:
            raise HTTPException(status_code=500, detail="ffprobe failed")
        duration = float(duration_result.stdout.strip())

        if duration <= 0:
            raise HTTPException(status_code=400, detail="Invalid video duration")

        # Generate thumbnails at evenly spaced timestamps
        thumbnails = []
        for i in range(count):
            t = (duration / (count + 1)) * (i + 1)
            result = subprocess.run(
                [
                    "ffmpeg", "-ss", str(t), "-i", str(file_path),
                    "-vframes", "1", "-vf", "scale=80:45",
                    "-f", "image2", "-vcodec", "mjpeg", "pipe:1",
                ],
                capture_output=True,
                timeout=10,
            )
            if result.returncode == 0 and result.stdout:
                b64 = base64.b64encode(result.stdout).decode("ascii")
                thumbnails.append(f"data:image/jpeg;base64,{b64}")

        return {"thumbnails": thumbnails, "duration_seconds": duration}

    except subprocess.TimeoutExpired:
        raise HTTPException(status_code=500, detail="ffmpeg timed out")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
