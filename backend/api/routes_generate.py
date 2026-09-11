"""
Generate Routes - Direct image generation (not shot-bound) + driver listing.

Used by the Asset generation panel and the model selector dropdown.
"""

import json
import os
import shutil
import uuid
from pathlib import Path
from fastapi import APIRouter, HTTPException, UploadFile, File, Form
from pydantic import BaseModel
from typing import Optional, List

from core.drivers import (
    get_image_driver, get_video_driver, list_image_drivers, list_video_drivers, list_audio_drivers,
)
from core.drivers.base import (
    ImageGenerationRequest, ImageGenerationResponse, GenerationStatus,
    VideoGenerationRequest, VideoGenerationMode, AspectRatio,
)
from core.drivers.lora_utils import fetch_lora_list

router = APIRouter()

VAULT_DIR = Path(__file__).parent.parent / "assets"


@router.get("/drivers")
async def get_all_drivers():
    """List all available drivers (image, video, audio) for frontend dropdowns."""
    return {
        "image": [d.model_dump() for d in list_image_drivers()],
        "video": [d.model_dump() for d in list_video_drivers()],
        "audio": [d.model_dump() for d in list_audio_drivers()],
    }


@router.get("/drivers/image")
async def get_image_drivers():
    return [d.model_dump() for d in list_image_drivers()]


@router.get("/drivers/video")
async def get_video_drivers():
    return [d.model_dump() for d in list_video_drivers()]


@router.get("/drivers/audio")
async def get_audio_drivers():
    return [d.model_dump() for d in list_audio_drivers()]


@router.get("/loras")
async def list_loras():
    """List available LoRA models from the local ComfyUI instance."""
    comfy_url = os.getenv("COMFY_URL", "http://127.0.0.1:8188")
    loras = await fetch_lora_list(comfy_url)
    return {"loras": loras, "comfy_url": comfy_url}


@router.post("/loras/upload")
async def upload_lora(file: UploadFile = File(...)):
    """Upload a LoRA file (.safetensors) to ComfyUI's models/loras directory.

    The target directory is determined by (in order):
    1. COMFY_LORAS_DIR env var
    2. COMFY_MODELS_DIR env var + /loras
    3. COMFY_DIR env var + /models/loras
    4. Fallback: ./ComfyUI/models/loras relative to CWD
    """
    loras_dir = (
        os.getenv("COMFY_LORAS_DIR")
        or (os.path.join(os.getenv("COMFY_MODELS_DIR", ""), "loras") if os.getenv("COMFY_MODELS_DIR") else None)
        or (os.path.join(os.getenv("COMFY_DIR", ""), "models", "loras") if os.getenv("COMFY_DIR") else None)
        or os.path.join(os.getcwd(), "ComfyUI", "models", "loras")
    )

    loras_path = Path(loras_dir)
    if not loras_path.exists():
        raise HTTPException(
            status_code=400,
            detail=f"ComfyUI loras directory not found: {loras_path}. Set COMFY_LORAS_DIR or COMFY_DIR env var.",
        )

    # Validate file extension
    filename = file.filename or "uploaded.safetensors"
    if not filename.lower().endswith((".safetensors", ".pt", ".pth", ".ckpt", ".gguf")):
        raise HTTPException(
            status_code=400,
            detail="Only .safetensors, .pt, .pth, .ckpt, or .gguf files are allowed.",
        )

    dest = loras_path / filename
    if dest.exists():
        raise HTTPException(
            status_code=409,
            detail=f"A LoRA named '{filename}' already exists.",
        )

    # Write the file
    content = await file.read()
    dest.write_bytes(content)
    print(f"[LoRA] Uploaded '{filename}' ({len(content)} bytes) to {dest}")

    return {"name": filename, "size_bytes": len(content), "path": str(dest)}


@router.get("/models")
async def list_models():
    """List available checkpoint models from the local ComfyUI instance."""
    comfy_url = os.getenv("COMFY_URL", "http://127.0.0.1:8188")
    auth_token = os.getenv("COMFY_AUTH_TOKEN", "")
    import aiohttp

    try:
        headers = {}
        if auth_token:
            headers["Authorization"] = f"Bearer {auth_token}"
        async with aiohttp.ClientSession(headers=headers) as session:
            async with session.get(
                f"{comfy_url}/object_info/CheckpointLoaderSimple",
                timeout=aiohttp.ClientTimeout(total=10),
            ) as resp:
                if resp.status != 200:
                    return {"models": [], "comfy_url": comfy_url}
                data = await resp.json()
                ckpt_info = data.get("CheckpointLoaderSimple", {})
                input_spec = ckpt_info.get("input", {})
                ckpt_input = input_spec.get("ckpt_name", {})
                if isinstance(ckpt_input, dict):
                    filenames = ckpt_input.get("values", [])
                elif isinstance(ckpt_input, list):
                    filenames = ckpt_input
                else:
                    filenames = []
                return {"models": [{"name": fn} for fn in filenames], "comfy_url": comfy_url}
    except Exception as e:
        print(f"[Models] Failed to fetch checkpoint list from ComfyUI: {e}")
        return {"models": [], "comfy_url": comfy_url}


@router.post("/models/upload")
async def upload_model(file: UploadFile = File(...)):
    """Upload a checkpoint model file to ComfyUI's models/checkpoints directory.

    The target directory is determined by (in order):
    1. COMFY_CHECKPOINTS_DIR env var
    2. COMFY_MODELS_DIR env var + /checkpoints
    3. COMFY_DIR env var + /models/checkpoints
    4. Fallback: ./ComfyUI/models/checkpoints relative to CWD
    """
    ckpt_dir = (
        os.getenv("COMFY_CHECKPOINTS_DIR")
        or (os.path.join(os.getenv("COMFY_MODELS_DIR", ""), "checkpoints") if os.getenv("COMFY_MODELS_DIR") else None)
        or (os.path.join(os.getenv("COMFY_DIR", ""), "models", "checkpoints") if os.getenv("COMFY_DIR") else None)
        or os.path.join(os.getcwd(), "ComfyUI", "models", "checkpoints")
    )

    ckpt_path = Path(ckpt_dir)
    if not ckpt_path.exists():
        raise HTTPException(
            status_code=400,
            detail=f"ComfyUI checkpoints directory not found: {ckpt_path}. Set COMFY_CHECKPOINTS_DIR or COMFY_DIR env var.",
        )

    filename = file.filename or "uploaded.safetensors"
    if not filename.lower().endswith((".safetensors", ".pt", ".pth", ".ckpt", ".gguf")):
        raise HTTPException(
            status_code=400,
            detail="Only .safetensors, .pt, .pth, .ckpt, or .gguf files are allowed.",
        )

    dest = ckpt_path / filename
    if dest.exists():
        raise HTTPException(
            status_code=409,
            detail=f"A model named '{filename}' already exists.",
        )

    content = await file.read()
    dest.write_bytes(content)
    print(f"[Models] Uploaded '{filename}' ({len(content)} bytes) to {dest}")

    return {"name": filename, "size_bytes": len(content), "path": str(dest)}


@router.post("/models/upload-to")
async def upload_model_to_subdir(subdirectory: str, file: UploadFile = File(...)):
    """Upload a model file to a specific ComfyUI models subdirectory.

    Supports: checkpoints, loras, vae, clip, unet, controlnet, upscale_models,
    gligen, hypernetworks, style_models, etc.
    """
    ALLOWED_SUBDIRS = {
        "checkpoints", "loras", "vae", "clip", "unet", "controlnet",
        "upscale_models", "gligen", "hypernetworks", "style_models",
        "diffusion_models", "text_encoders",
        "audio", "audio_models",
    }
    if subdirectory not in ALLOWED_SUBDIRS:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid subdirectory '{subdirectory}'. Allowed: {sorted(ALLOWED_SUBDIRS)}",
        )

    # Resolve the models base directory
    models_base = (
        os.getenv("COMFY_MODELS_DIR")
        or (os.path.join(os.getenv("COMFY_DIR", ""), "models") if os.getenv("COMFY_DIR") else None)
        or os.path.join(os.getcwd(), "ComfyUI", "models")
    )

    target_dir = Path(models_base) / subdirectory
    if not target_dir.exists():
        # Try to create it
        try:
            target_dir.mkdir(parents=True, exist_ok=True)
        except Exception:
            raise HTTPException(
                status_code=400,
                detail=f"ComfyUI models directory not found: {target_dir}. Set COMFY_MODELS_DIR or COMFY_DIR env var.",
            )

    filename = file.filename or "uploaded.safetensors"
    if not filename.lower().endswith((".safetensors", ".pt", ".pth", ".ckpt", ".gguf", ".bin")):
        raise HTTPException(
            status_code=400,
            detail="Only .safetensors, .pt, .pth, .ckpt, .gguf, or .bin files are allowed.",
        )

    dest = target_dir / filename
    if dest.exists():
        raise HTTPException(
            status_code=409,
            detail=f"A file named '{filename}' already exists in {subdirectory}/.",
        )

    content = await file.read()
    dest.write_bytes(content)
    print(f"[Models] Uploaded '{filename}' ({len(content)} bytes) to {dest}")

    return {"name": filename, "size_bytes": len(content), "path": str(dest), "subdirectory": subdirectory}


class GenerateImageRequest(BaseModel):
    prompt: str
    model_id: str = "qwen_image"
    negative_prompt: Optional[str] = None
    width: int = 1024
    height: int = 1024
    seed: Optional[int] = None
    reference_image_paths: List[str] = []
    extra_params: Optional[dict] = None


@router.post("/image")
async def generate_image(
    prompt: str,
    model_id: str = "qwen_image",
    negative_prompt: Optional[str] = None,
    width: int = 1024,
    height: int = 1024,
    seed: Optional[int] = None,
    reference_image_paths: List[str] = None,
    extra_params: Optional[str] = None,
):
    """Generate an image using the selected driver.

    extra_params: JSON-encoded string with optional keys like {"loras": [...], "cfg": ..., "steps": ...}
    """
    driver = get_image_driver(model_id)
    if not driver:
        raise HTTPException(status_code=400, detail=f"Unknown model: {model_id}")

    parsed_extra: dict = {}
    if extra_params:
        try:
            parsed_extra = json.loads(extra_params)
        except (json.JSONDecodeError, TypeError):
            parsed_extra = {}

    req = ImageGenerationRequest(
        prompt=prompt,
        negative_prompt=negative_prompt,
        width=width,
        height=height,
        seed=seed,
        reference_image_paths=reference_image_paths or [],
        extra_params=parsed_extra,
    )
    response = await driver.generate(req)
    return response.model_dump()


@router.get("/status/{job_id}")
async def check_status(job_id: str, model_id: str = "qwen_image"):
    """Check generation status."""
    driver = get_image_driver(model_id)
    if not driver:
        raise HTTPException(status_code=400, detail=f"Unknown model: {model_id}")
    response = await driver.check_status(job_id)
    return response.model_dump()


class AssetSheetRequest(BaseModel):
    project_id: str = "default"
    asset_id: str
    prompt: Optional[str] = None
    negative_prompt: Optional[str] = None
    seed: Optional[int] = None
    model_id: Optional[str] = None


@router.post("/asset-sheet")
async def generate_asset_sheet(req: AssetSheetRequest):
    """Generate a multi-view design sheet from an existing asset (character, prop, vehicle, location)."""
    # Look up the asset to get its primary_image and type
    assets_path = VAULT_DIR / req.project_id / "assets.json"
    if not assets_path.exists():
        raise HTTPException(status_code=404, detail=f"No assets found for project: {req.project_id}")

    with open(assets_path, "r") as f:
        assets = json.load(f)

    asset = next((a for a in assets if a["id"] == req.asset_id), None)
    if not asset:
        raise HTTPException(status_code=404, detail=f"Asset not found: {req.asset_id}")

    if not asset.get("primary_image"):
        raise HTTPException(status_code=400, detail="Asset has no primary image to generate sheet from")

    # Determine which driver to use — default to qwen_image_edit (ComfyUI)
    model_id = req.model_id or "qwen_image_edit"
    driver = get_image_driver(model_id)
    if not driver:
        raise HTTPException(status_code=500, detail=f"Driver '{model_id}' not available")

    # ComfyImageDriver has a dedicated generate_asset_sheet method with sheet-specific workflows
    if hasattr(driver, "generate_asset_sheet"):
        response = await driver.generate_asset_sheet(
            asset_image_path=asset["primary_image"],
            asset_type=asset.get("type", "character"),
            prompt=req.prompt or "",
            negative_prompt=req.negative_prompt or "",
            seed=req.seed,
        )
    else:
        # Cloud drivers (Fal, Replicate) — use standard generate() with sheet prompt
        sheet_prompt = req.prompt or "character sheet, multiple views, front view, side view, back view, three-quarter view, full body turnaround, white background, clean design sheet"
        response = await driver.generate(ImageGenerationRequest(
            prompt=sheet_prompt,
            negative_prompt=req.negative_prompt or "",
            width=1024,
            height=1024,
            seed=req.seed,
            reference_image_paths=[asset["primary_image"]],
        ))

    return response.model_dump()


# Keep old endpoint name as alias for backwards compatibility
@router.post("/character-sheet")
async def generate_character_sheet(req: AssetSheetRequest):
    """Alias for /generate/asset-sheet (backwards compatible)."""
    return await generate_asset_sheet(req)


class TurnaroundSheetRequest(BaseModel):
    project_id: str = "default"
    asset_id: str
    character_description: Optional[str] = None
    prompt: Optional[str] = None
    negative_prompt: Optional[str] = None
    seed: Optional[int] = None


@router.post("/turnaround-sheet")
async def generate_turnaround_sheet(req: TurnaroundSheetRequest):
    """Generate a high-detail 4-view turnaround sheet (front, side, back, three-quarter) from a single character image.

    Submits 4 separate generations using the Multiangle LoRA, then composites them side-by-side.
    Returns a job_id that can be polled via /generate/status/{job_id}?model_id=qwen_image_edit.
    The response metadata includes completed_views/total_views progress during polling.
    """
    assets_path = VAULT_DIR / req.project_id / "assets.json"
    if not assets_path.exists():
        raise HTTPException(status_code=404, detail=f"No assets found for project: {req.project_id}")

    with open(assets_path, "r") as f:
        assets = json.load(f)

    asset = next((a for a in assets if a["id"] == req.asset_id), None)
    if not asset:
        raise HTTPException(status_code=404, detail=f"Asset not found: {req.asset_id}")

    if not asset.get("primary_image"):
        raise HTTPException(status_code=400, detail="Asset has no primary image to generate turnaround from")

    driver = get_image_driver("qwen_image_edit")
    if not driver:
        raise HTTPException(status_code=500, detail="ComfyUI image driver not available")

    response = await driver.generate_turnaround_sheet(
        asset_image_path=asset["primary_image"],
        character_description=req.character_description or "",
        prompt=req.prompt or "",
        negative_prompt=req.negative_prompt or "",
        seed=req.seed,
    )
    return response.model_dump()


class AnalyzeCharacterRequest(BaseModel):
    project_id: str = "default"
    asset_id: str


@router.post("/analyze-character")
async def analyze_character(req: AnalyzeCharacterRequest):
    """Analyze a character image using Qwen2.5-VL and return a text description.

    Submits a VLM captioning job to ComfyUI. Poll with /generate/analyze-status/{job_id}.
    Requires ComfyUI-QwenVL custom node installed in ComfyUI.
    """
    assets_path = VAULT_DIR / req.project_id / "assets.json"
    if not assets_path.exists():
        raise HTTPException(status_code=404, detail=f"No assets found for project: {req.project_id}")

    with open(assets_path, "r") as f:
        assets = json.load(f)

    asset = next((a for a in assets if a["id"] == req.asset_id), None)
    if not asset:
        raise HTTPException(status_code=404, detail=f"Asset not found: {req.asset_id}")

    if not asset.get("primary_image"):
        raise HTTPException(status_code=400, detail="Asset has no primary image to analyze")

    driver = get_image_driver("qwen_image_edit")
    if not driver:
        raise HTTPException(status_code=500, detail="ComfyUI image driver not available")

    try:
        response = await driver.analyze_character(asset["primary_image"])
        return response.model_dump()
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"analyze_character failed: {str(e)}")


@router.get("/analyze-status/{job_id}")
async def check_analysis_status(job_id: str):
    """Check the status of a character analysis (VLM captioning) job."""
    driver = get_image_driver("qwen_image_edit")
    if not driver:
        raise HTTPException(status_code=500, detail="ComfyUI image driver not available")

    response = await driver.check_analysis_status(job_id)
    return response.model_dump()


# =============================================================================
# Motion Previs → Video (V2V / motion-control)
#
# Accepts a recorded previs clip captured from the browser canvas and routes it
# into a video driver's motion-control slot (reference_video_path). The previs
# clip becomes the camera/motion reference for video-to-video generation
# (MiniMax H3, LTX Video, Wan Video, Higgsfield Sea Dance, etc.).
# =============================================================================

PREVIS_INPUT_DIR = VAULT_DIR / "previs_inputs"


@router.post("/motion-shot")
async def generate_motion_shot(
    prompt: str = Form(...),
    motion_reference: UploadFile = File(...),
    model_id: str = Form("minimax_h3"),
    aspect_ratio: str = Form("16:9"),
    focal_length: Optional[float] = Form(None),
    duration_seconds: Optional[float] = Form(None),
):
    """Submit a recorded previs motion clip and dispatch it to a video driver.

    The uploaded clip is namespaced by job_id on disk so concurrent recordings
    (which all arrive as previs_motion.webm) can't clobber each other. The clip
    is passed as `reference_video_path` with mode=r2v (motion/camera lock).
    Returns a generation job that can be polled via /generate/motion-shot/{job_id}/status.
    """
    driver = get_video_driver(model_id)
    if not driver:
        raise HTTPException(status_code=400, detail=f"Unknown video model: {model_id}")

    PREVIS_INPUT_DIR.mkdir(parents=True, exist_ok=True)

    job_id = f"job_{uuid.uuid4().hex}"
    original_name = motion_reference.filename or "previs_motion.webm"
    file_path = PREVIS_INPUT_DIR / f"{job_id}_{original_name}"

    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(motion_reference.file, buffer)
    print(f"[motion-shot] saved previs reference ({os.path.getsize(file_path)} bytes) -> {file_path}")

    try:
        ar = AspectRatio(aspect_ratio)
    except ValueError:
        ar = AspectRatio.LANDSCAPE_16_9

    extra_params: dict = {}
    if focal_length is not None:
        extra_params["focal_length_mm"] = focal_length

    gen_req = VideoGenerationRequest(
        prompt=prompt,
        mode=VideoGenerationMode.R2V,
        duration_seconds=duration_seconds if duration_seconds else 5,
        aspect_ratio=ar,
        reference_video_path=str(file_path),
        extra_params=extra_params,
    )

    response = await driver.generate(gen_req)

    return {
        **response.model_dump(),
        "job_id": response.job_id or job_id,
        "model_id": model_id,
        "previs_reference_path": str(file_path),
        "message": "Motion reference video successfully passed to model driver.",
    }


@router.get("/motion-shot/{job_id}/status")
async def check_motion_shot_status(job_id: str, model_id: str = "minimax_h3"):
    """Poll the status of a previs motion-shot generation job.

    Returns the underlying video driver's status response (status, video_url,
    error_message, metadata). Designed to be polled by useGenerationPolling.
    """
    driver = get_video_driver(model_id)
    if not driver:
        raise HTTPException(status_code=400, detail=f"Unknown video model: {model_id}")

    response = await driver.check_status(job_id)
    return response.model_dump()


# =============================================================================
# Previs Render — WebM → MP4 conversion (no ComfyUI/AI needed)
# =============================================================================

def _get_ffmpeg_exe() -> str:
    """Get the path to the bundled ffmpeg binary from imageio_ffmpeg."""
    try:
        import imageio_ffmpeg
        return imageio_ffmpeg.get_ffmpeg_exe()
    except ImportError:
        raise HTTPException(
            status_code=500,
            detail="ffmpeg not available — imageio_ffmpeg package not installed",
        )


def _probe_duration(ffmpeg_exe: str, video_path: str) -> Optional[float]:
    """Extract video duration in seconds by parsing ffmpeg's stderr output."""
    import subprocess
    try:
        result = subprocess.run(
            [ffmpeg_exe, "-i", video_path, "-hide_banner"],
            capture_output=True, text=True, timeout=10,
        )
        for line in result.stderr.split("\n"):
            if "Duration:" in line:
                dur = line.split("Duration:")[1].split(",")[0].strip()
                h, m, s = dur.split(":")
                return int(h) * 3600 + int(m) * 60 + float(s)
    except Exception:
        pass
    return None


@router.post("/previs/render")
async def render_previs_to_mp4(
    file: UploadFile = File(..., description="Recorded previs WebM clip"),
    project_id: str = Form(default="default", description="Project ID"),
    resolution: str = Form(default="720p", description="Target resolution: 480p, 720p, 1080p"),
    aspect_ratio: str = Form(default="16:9", description="Target aspect ratio: 16:9 or 2.39:1"),
):
    """Convert a recorded previs WebM clip to MP4 (H.264/AAC) and store it in
    the project's video library.

    Uses the bundled ffmpeg from imageio_ffmpeg — no system ffmpeg installation
    required. The resulting MP4 is universally compatible (browsers, video
    editors, AI video models) and can be used as a reference clip on the
    timeline or as a motion reference for generation.
    """
    import tempfile
    import subprocess
    import time

    ffmpeg_exe = _get_ffmpeg_exe()

    # Read the uploaded WebM into a temp file
    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Empty file upload")

    with tempfile.NamedTemporaryFile(suffix=".webm", delete=False) as tmp:
        tmp.write(content)
        tmp_webm = tmp.name

    # Output MP4 in the project's video directory
    videos_dir = VAULT_DIR / project_id / "videos"
    videos_dir.mkdir(parents=True, exist_ok=True)

    timestamp = int(time.time())
    output_name = f"previs_{timestamp}.mp4"
    output_path = videos_dir / output_name

    # Build the scaling filter — scale to target height while preserving aspect
    # ratio, then pad to the exact target aspect ratio (centered, black bars).
    # e.g. -vf "scale=-2:720,pad=ceil(iw/2)*2:720:(ow-iw)/2:0" for 720p 16:9.
    res_map = {"480p": 480, "720p": 720, "1080p": 1080}
    target_h = res_map.get(resolution, 720)
    if aspect_ratio == "2.39:1":
        target_w = int(round(target_h * 2.39))
    else:  # 16:9
        target_w = int(round(target_h * 16 / 9))
    # Ensure even dimensions (libx264 requirement)
    if target_w % 2: target_w += 1
    if target_h % 2: target_h += 1
    # scale to fit within target, then pad to exact size (centered, black bars)
    vf = f"scale={target_w}:{target_h}:force_original_aspect_ratio=decrease,pad={target_w}:{target_h}:(ow-iw)/2:(oh-ih)/2"

    try:
        cmd = [
            ffmpeg_exe, "-y", "-i", tmp_webm,
            "-vf", vf,
            "-c:v", "libx264", "-preset", "fast", "-crf", "23",
            "-pix_fmt", "yuv420p",
            "-c:a", "aac", "-b:a", "128k",
            "-movflags", "+faststart",
            str(output_path),
        ]
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=180)
        if result.returncode != 0:
            error_tail = result.stderr[-800:] if result.stderr else "unknown error"
            raise HTTPException(
                status_code=500,
                detail=f"ffmpeg conversion failed: {error_tail}",
            )
    except subprocess.TimeoutExpired:
        raise HTTPException(status_code=504, detail="ffmpeg conversion timed out (180s)")
    finally:
        if os.path.exists(tmp_webm):
            os.unlink(tmp_webm)

    duration_seconds = _probe_duration(ffmpeg_exe, str(output_path))
    size_bytes = output_path.stat().st_size

    print(f"[previs/render] converted {len(content)} bytes WebM -> {size_bytes} bytes MP4 ({target_w}x{target_h}, {duration_seconds:.2f}s) -> {output_path}")

    return {
        "filename": output_name,
        "video_url": f"/assets/{project_id}/videos/{output_name}",
        "size_bytes": size_bytes,
        "duration_seconds": duration_seconds,
        "format": "mp4",
        "width": target_w,
        "height": target_h,
    }
