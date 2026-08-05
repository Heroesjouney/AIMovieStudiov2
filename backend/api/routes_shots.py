"""
Shot Routes - Shot CRUD, frame generation, camera direction, video generation.

Shots are the core unit of the storyboard. Each shot stores its full
generation recipe for reproducibility.
"""

import json
import uuid
import shutil
from pathlib import Path
from typing import List, Optional
from datetime import datetime

import httpx
from fastapi import APIRouter, HTTPException

from core.schemas.shot import (
    Shot, ShotCreateRequest, ShotType, ShotStatus,
    ShotAssetRef, GenerationRecipe, ShotFrameGenerateRequest,
    ShotVariationRequest, ShotVideoGenerateRequest,
)
from core.schemas.camera import (
    CameraParams, CameraMovement, CameraAnglePreset,
    MultiAngleRequest, QWEN_MULTIANGLE_PROMPTS,
)
from core.drivers import get_image_driver, get_video_driver
from core.drivers.base import VideoGenerationRequest, VideoGenerationMode, AspectRatio, GenerationStatus

router = APIRouter()
VAULT_DIR = Path(__file__).parent.parent / "assets"


def _project_dir(project_id: str) -> Path:
    d = VAULT_DIR / project_id
    d.mkdir(parents=True, exist_ok=True)
    return d


def _shots_index(project_id: str) -> Path:
    return _project_dir(project_id) / "shots.json"


def _load_shots(project_id: str) -> List[dict]:
    idx = _shots_index(project_id)
    if idx.exists():
        with open(idx, "r") as f:
            return json.load(f)
    return []


def _save_shots(project_id: str, shots: List[dict]):
    with open(_shots_index(project_id), "w") as f:
        json.dump(shots, f, indent=2, default=str)


def _find_shot(project_id: str, shot_id: str) -> Optional[dict]:
    for s in _load_shots(project_id):
        if s["id"] == shot_id:
            return s
    return None


def _shot_dir(project_id: str, shot_id: str) -> Path:
    d = _project_dir(project_id) / "shots" / shot_id
    d.mkdir(parents=True, exist_ok=True)
    return d


async def _download_image_to_vault(project_id: str, shot_id: str, image_url: str, prefix: str = "frame") -> str:
    """Download a generated image URL to the Vault and return the local served path."""
    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.get(image_url)
            if resp.status_code != 200:
                return image_url  # Fallback to remote URL
            image_bytes = resp.content
    except Exception:
        return image_url  # Fallback to remote URL

    content_type = resp.headers.get("content-type", "")
    if "png" in content_type:
        ext = ".png"
    elif "webp" in content_type:
        ext = ".webp"
    elif "jpeg" in content_type or "jpg" in content_type:
        ext = ".jpg"
    else:
        ext = ".png"

    shot_folder = _shot_dir(project_id, shot_id)
    filename = f"{prefix}{ext}"
    filepath = shot_folder / filename
    filepath.write_bytes(image_bytes)

    return f"/assets/{project_id}/shots/{shot_id}/{filename}"


def _load_scenes(project_id: str) -> List[dict]:
    idx = _project_dir(project_id) / "scenes.json"
    if idx.exists():
        with open(idx, "r") as f:
            return json.load(f)
    return []


def _load_assets(project_id: str) -> List[dict]:
    idx = _project_dir(project_id) / "assets.json"
    if idx.exists():
        with open(idx, "r") as f:
            return json.load(f)
    return []


@router.get("/{project_id}")
async def list_shots(project_id: str, scene_id: Optional[str] = None):
    shots = _load_shots(project_id)
    if scene_id:
        shots = [s for s in shots if s.get("scene_id") == scene_id]
    return shots


@router.post("/")
async def create_shot(req: ShotCreateRequest):
    shot_id = str(uuid.uuid4())
    now = datetime.utcnow().isoformat()

    # Auto-bind scene defaults if scene_id is provided and no assets explicitly set
    auto_assets = [a.model_dump() for a in req.assets]
    if req.scene_id and not auto_assets:
        scenes = _load_scenes(req.project_id)
        scene = next((s for s in scenes if s["id"] == req.scene_id), None)
        if scene:
            # First, bind scene reference_assets (the recipe)
            for ref in scene.get("reference_assets", []):
                auto_assets.append({
                    "asset_id": ref["asset_id"],
                    "asset_name": ref.get("asset_name", ""),
                    "image_path": ref.get("image_path"),
                    "role": ref.get("asset_type", "character"),
                })
            # Then, bind scene defaults (hero cast, location, prop) if not already in ref_assets
            ref_ids = {a["asset_id"] for a in auto_assets}
            defaults = scene.get("defaults", {})
            assets_list = _load_assets(req.project_id)
            for default_key, default_val in defaults.items():
                if default_val and default_key in ("hero_cast_id", "location_id", "prop_id"):
                    if default_val in ref_ids:
                        continue
                    asset = next((a for a in assets_list if a["id"] == default_val), None)
                    if asset:
                        role = "character" if "cast" in default_key else ("location" if "location" in default_key else "prop")
                        auto_assets.append({
                            "asset_id": asset["id"],
                            "asset_name": asset.get("name", ""),
                            "image_path": asset.get("primary_image"),
                            "role": role,
                        })

    shot = {
        "id": shot_id,
        "project_id": req.project_id,
        "scene_id": req.scene_id,
        "name": req.name,
        "shot_type": req.shot_type.value,
        "status": ShotStatus.DRAFT.value,
        "description": req.description,
        "notes": req.notes,
        "sequence_order": len(_load_shots(req.project_id)),
        "assets": auto_assets,
        "frame_image_path": None,
        "angle_images": {},
        "video_clip_path": None,
        "video_takes": [],
        "audio_clip_path": None,
        "camera_params": None,
        "camera_movement": None,
        "generation_recipe": None,
        "created_at": now,
        "updated_at": now,
    }
    shots = _load_shots(req.project_id)
    shots.append(shot)
    _save_shots(req.project_id, shots)
    return shot


# =============================================================================
# Shot Frame Generation (must be before /{project_id}/{shot_id} routes)
# =============================================================================

@router.post("/frame")
async def generate_shot_frame(req: ShotFrameGenerateRequest):
    """Generate a storyboard frame for a shot using the selected image driver."""
    driver = get_image_driver(req.model_id)
    if not driver:
        raise HTTPException(status_code=400, detail=f"Unknown model: {req.model_id}")

    # Look up the shot to get asset metadata (types and names)
    shot = _find_shot("default", req.shot_id)
    shot_assets = (shot or {}).get("assets", [])

    # Look up scene for lighting/mood/time_of_day context and establishing frame
    scene_context = ""
    establishing_frame = None
    scene_obj = None
    if shot and shot.get("scene_id"):
        scenes = _load_scenes(shot["project_id"])
        scene_obj = next((s for s in scenes if s["id"] == shot["scene_id"]), None)
        if scene_obj:
            parts = []
            tod = scene_obj.get("time_of_day", "")
            if tod and tod != "day":
                parts.append(tod.replace("_", " "))
            mood = scene_obj.get("mood", "")
            if mood and mood != "neutral":
                parts.append(f"{mood} mood")
            lighting = scene_obj.get("lighting", "")
            if lighting and lighting != "natural":
                lighting_labels = {
                    "low_key": "low-key lighting",
                    "high_key": "high-key lighting",
                    "rembrandt": "Rembrandt lighting",
                    "split": "split lighting",
                    "backlit": "backlit lighting",
                    "practical": "practical lighting",
                    "chiaroscuro": "chiaroscuro lighting",
                    "golden_hour": "golden hour lighting",
                    "blue_hour": "blue hour lighting",
                    "neon": "neon lighting",
                    "moonlight": "moonlight lighting",
                }
                parts.append(lighting_labels.get(lighting, lighting.replace("_", " ")))
            if parts:
                scene_context = ", ".join(parts)
            establishing_frame = scene_obj.get("establishing_frame_path")
            if establishing_frame:
                print(f"[routes_shots] scene has establishing frame: {establishing_frame}")

    # Separate assets by role for multi-reference workflow
    location_image = None
    character_images = []
    other_images = []
    prompt_enrichments = []
    for a in shot_assets:
        role = a.get("role", a.get("asset_type", ""))
        name = a.get("asset_name", "")
        img = a.get("image_path")
        if role == "location" and img:
            location_image = img
        elif role == "character":
            if name:
                prompt_enrichments.append(f"featuring {name}")
            if img:
                character_images.append(img)
        elif role == "prop":
            if name:
                prompt_enrichments.append(f"with {name}")
            if img:
                other_images.append(img)
        elif role == "vehicle":
            if name:
                prompt_enrichments.append(f"with {name}")
            if img:
                other_images.append(img)

    # Build the effective prompt with scene context and character/prop names
    prompt_parts = [req.prompt]
    if scene_context:
        prompt_parts.append(scene_context)
    if prompt_enrichments:
        prompt_parts.append(" ".join(prompt_enrichments))
    effective_prompt = ", ".join(prompt_parts)

    # Find previous shot in the same scene for action continuity
    prev_frame_image = None
    if shot and shot.get("scene_id"):
        all_shots = _load_shots(shot["project_id"])
        scene_shots = [s for s in all_shots if s.get("scene_id") == shot.get("scene_id") and s["id"] != req.shot_id]
        scene_shots.sort(key=lambda s: s.get("sequence_order", 0))
        current_order = shot.get("sequence_order", 0)
        prev_shots = [s for s in scene_shots if s.get("sequence_order", 0) < current_order and s.get("frame_image_path")]
        if prev_shots:
            prev_shots.sort(key=lambda s: s.get("sequence_order", 0), reverse=True)
            prev_frame_image = prev_shots[0]["frame_image_path"]
            print(f"[routes_shots] continuity: using prev shot frame {prev_frame_image}")

    # Build ref_paths (max 3 for multi-reference workflow):
    # HYBRID ESTABLISHING SHOT STRATEGY:
    #   First shot in scene (no establishing_frame on scene yet):
    #     image1 = location, image2 = character, image3 = prop/vehicle
    #   Subsequent shots (establishing_frame exists on scene):
    #     image1 = establishing_frame (scene consistency), image2 = character (character consistency), image3 = previous shot frame (action continuity)
    ref_paths = []
    if establishing_frame:
        # Subsequent shots: establishing + character + previous frame
        ref_paths.append(establishing_frame)
        if character_images:
            ref_paths.append(character_images[0])
        if prev_frame_image:
            ref_paths.append(prev_frame_image)
        elif location_image:
            ref_paths.append(location_image)
        elif len(ref_paths) < 3 and other_images:
            ref_paths.append(other_images[0])
    else:
        # First shot: location + character + prop
        if location_image:
            ref_paths.append(location_image)
        if character_images:
            ref_paths.append(character_images[0])
        if len(ref_paths) < 3 and other_images:
            ref_paths.append(other_images[0])
    # Add any explicitly passed refs not already included
    for r in (req.reference_image_paths or []):
        if r not in ref_paths:
            ref_paths.append(r)

    print(f"[routes_shots] effective_prompt={effective_prompt[:120]}..., ref_paths={ref_paths}")

    from core.drivers.base import ImageGenerationRequest
    gen_req = ImageGenerationRequest(
        prompt=effective_prompt,
        negative_prompt=req.negative_prompt,
        width=req.width,
        height=req.height,
        seed=req.seed,
        reference_image_paths=ref_paths,
    )

    response = await driver.generate(gen_req)

    # Store recipe in shot
    if shot:
        recipe = GenerationRecipe(
            resolved_prompt=effective_prompt,
            resolved_negative_prompt=req.negative_prompt,
            seed=req.seed,
            model_id=req.model_id,
            params={"width": req.width, "height": req.height},
            reference_paths=ref_paths,
        )
        shot["generation_recipe"] = recipe.model_dump()
        shot["status"] = ShotStatus.PLANNED.value
        shots = _load_shots(shot["project_id"])
        for s in shots:
            if s["id"] == req.shot_id:
                s.update(shot)
                break
        _save_shots(shot["project_id"], shots)

    return response.model_dump()


@router.get("/status/{job_id}")
async def check_generation_status(job_id: str, model_id: str = "qwen_image_edit"):
    """Check the status of a generation job."""
    driver = get_image_driver(model_id)
    if not driver:
        raise HTTPException(status_code=400, detail=f"Unknown model: {model_id}")
    response = await driver.check_status(job_id)
    return response.model_dump()


@router.get("/{project_id}/{shot_id}")
async def get_shot(project_id: str, shot_id: str):
    s = _find_shot(project_id, shot_id)
    if not s:
        raise HTTPException(status_code=404, detail="Shot not found")
    return s


@router.put("/{project_id}/{shot_id}")
async def update_shot(project_id: str, shot_id: str, updates: dict):
    shots = _load_shots(project_id)
    for s in shots:
        if s["id"] == shot_id:
            s.update(updates)
            s["updated_at"] = datetime.utcnow().isoformat()
            _save_shots(project_id, shots)
            return s
    raise HTTPException(status_code=404, detail="Shot not found")


@router.delete("/{project_id}/{shot_id}")
async def delete_shot(project_id: str, shot_id: str):
    shots = _load_shots(project_id)
    filtered = [s for s in shots if s["id"] != shot_id]
    if len(filtered) == len(shots):
        raise HTTPException(status_code=404, detail="Shot not found")
    _save_shots(project_id, filtered)
    return {"status": "deleted", "id": shot_id}


@router.put("/{project_id}/reorder")
async def reorder_shots(project_id: str, shot_ids: List[str]):
    """Bulk reorder shots by providing an ordered list of shot IDs."""
    shots = _load_shots(project_id)
    shot_map = {s["id"]: s for s in shots}
    reordered = []
    for idx, sid in enumerate(shot_ids):
        if sid in shot_map:
            shot_map[sid]["sequence_order"] = idx
            shot_map[sid]["updated_at"] = datetime.utcnow().isoformat()
            reordered.append(shot_map[sid])
    # Append any shots not in the reorder list (e.g. new ones)
    for s in shots:
        if s["id"] not in shot_ids:
            reordered.append(s)
    _save_shots(project_id, reordered)
    return {"status": "reordered", "count": len(shot_ids)}


# =============================================================================
# Shot Variation Generation - Build scene in frames from a base shot
# =============================================================================

@router.post("/variation")
async def generate_shot_variation(req: ShotVariationRequest):
    """Create a new shot as a variation of an existing shot's frame.

    Copies the source shot's frame as a reference image and generates a new
    frame with the variation prompt (different angle, composition, or action).
    The new shot inherits the scene_id and assets from the source shot.
    """
    source_shot = _find_shot(req.project_id, req.source_shot_id)
    if not source_shot:
        raise HTTPException(status_code=404, detail="Source shot not found")

    if not source_shot.get("frame_image_path"):
        raise HTTPException(status_code=400, detail="Source shot has no frame to vary from")

    # Create the new shot
    new_shot_id = str(uuid.uuid4())
    now = datetime.utcnow().isoformat()

    # Inherit assets from source shot
    inherited_assets = source_shot.get("assets", [])

    new_shot = {
        "id": new_shot_id,
        "project_id": req.project_id,
        "scene_id": req.scene_id or source_shot.get("scene_id"),
        "name": req.name,
        "shot_type": req.shot_type.value,
        "status": ShotStatus.DRAFT.value,
        "description": req.prompt,
        "notes": f"Variation of: {source_shot.get('name', '')}",
        "sequence_order": len(_load_shots(req.project_id)),
        "assets": inherited_assets,
        "frame_image_path": None,
        "angle_images": {},
        "video_clip_path": None,
        "video_takes": [],
        "audio_clip_path": None,
        "camera_params": None,
        "camera_movement": None,
        "generation_recipe": None,
        "created_at": now,
        "updated_at": now,
    }

    shots = _load_shots(req.project_id)
    shots.append(new_shot)
    _save_shots(req.project_id, shots)

    # Build reference paths: source frame first, then bound asset images
    ref_paths = [source_shot["frame_image_path"]]
    for a in inherited_assets:
        if a.get("image_path") and a["image_path"] not in ref_paths:
            ref_paths.append(a["image_path"])

    # Generate the frame using the edit driver (supports reference images)
    driver = get_image_driver(req.model_id)
    if not driver:
        raise HTTPException(status_code=400, detail=f"Unknown model: {req.model_id}")

    from core.drivers.base import ImageGenerationRequest
    gen_req = ImageGenerationRequest(
        prompt=req.prompt,
        negative_prompt=req.negative_prompt,
        width=req.width,
        height=req.height,
        seed=req.seed,
        reference_image_paths=ref_paths,
    )
    response = await driver.generate(gen_req)

    # Store recipe
    recipe = GenerationRecipe(
        resolved_prompt=req.prompt,
        resolved_negative_prompt=req.negative_prompt,
        seed=req.seed,
        model_id=req.model_id,
        params={"width": req.width, "height": req.height},
        reference_paths=ref_paths,
    )
    new_shot["generation_recipe"] = recipe.model_dump()
    new_shot["status"] = ShotStatus.PLANNED.value

    # Update shot in storage
    shots = _load_shots(req.project_id)
    for s in shots:
        if s["id"] == new_shot_id:
            s.update(new_shot)
            break
    _save_shots(req.project_id, shots)

    return {
        "shot": new_shot,
        "generation": response.model_dump(),
    }


# =============================================================================
# Camera Direction - Multi-Angle Generation
# =============================================================================

@router.post("/angles")
async def generate_camera_angles(req: MultiAngleRequest):
    """Generate multiple camera angles from a reference frame.

    Supports two methods:
    - qwen_multiangle: Uses Qwen Image Edit + Multiple-Angles-LoRA with <sks> prompt format
    - 3d_camera: Uses depth-based 3D camera reconstruction
    """
    if req.method == "qwen_multiangle":
        # Use ComfyImageDriver with qwen_multiangle workflow
        # Each angle gets its own <sks> prompt appended to base_prompt
        driver = get_image_driver("qwen_multiangle")
        if not driver:
            raise HTTPException(status_code=400, detail="Qwen Multiangle driver not available")

        # Build reference image list: source frame first, then additional refs
        ref_paths = [req.source_image_path] + req.reference_image_paths

        # Generate all angles as sub-jobs
        import uuid as _uuid
        parent_job_id = str(_uuid.uuid4())
        sub_jobs = []

        for angle in req.angles:
            angle_prompt = QWEN_MULTIANGLE_PROMPTS.get(angle, "")
            full_prompt = f"{req.base_prompt or ''} {angle_prompt}".strip()

            from core.drivers.base import ImageGenerationRequest
            gen_req = ImageGenerationRequest(
                prompt=full_prompt,
                width=req.width,
                height=req.height,
                seed=req.seed,
                reference_image_paths=ref_paths,
            )
            response = await driver.generate(gen_req)
            sub_jobs.append({
                "sub_job_id": response.job_id,
                "angle": angle.value,
                "status": response.status,
            })

        return {
            "job_id": parent_job_id,
            "status": "processing",
            "method": "qwen_multiangle",
            "sub_jobs": sub_jobs,
            "angles": [a.value for a in req.angles],
        }

    elif req.method == "3d_camera":
        from core.drivers.comfy_camera import ComfyCameraDriver
        driver = ComfyCameraDriver()
        response = await driver.generate_angles(req)
        return response.model_dump()

    else:
        raise HTTPException(status_code=400, detail=f"Unknown method: {req.method}")


@router.get("/angles/status/{job_id}")
async def check_angles_status(job_id: str, model_id: str = "qwen_multiangle"):
    """Check the status of a multi-angle generation job."""
    if model_id == "qwen_multiangle":
        driver = get_image_driver("qwen_multiangle")
        if not driver:
            raise HTTPException(status_code=400, detail="Qwen Multiangle driver not available")
        response = await driver.check_status(job_id)
        return response.model_dump()
    else:
        from core.drivers.comfy_camera import ComfyCameraDriver
        driver = ComfyCameraDriver()
        response = await driver.check_status(job_id)
        return response.model_dump()


# =============================================================================
# Shot Video Generation (multi-take, model-aware references)
# =============================================================================

# In-memory store: job_id → {shot_id, project_id, model_id, take_id, request}
_video_jobs: dict = {}


async def _download_video_to_vault(project_id: str, shot_id: str, video_url: str, take_id: str) -> str:
    """Download a generated video URL to the Vault and return the local served path."""
    try:
        async with httpx.AsyncClient(timeout=120.0) as client:
            resp = await client.get(video_url)
            if resp.status_code != 200:
                return video_url  # Fallback to remote URL
            video_bytes = resp.content
    except Exception:
        return video_url  # Fallback to remote URL

    shot_folder = _shot_dir(project_id, shot_id)
    filename = f"take_{take_id}.mp4"
    filepath = shot_folder / filename
    filepath.write_bytes(video_bytes)
    return f"/assets/{project_id}/shots/{shot_id}/{filename}"


@router.post("/video")
async def generate_shot_video(req: ShotVideoGenerateRequest):
    """Generate a video clip (take) for a shot using the selected video driver.

    Supports T2V, I2V (first/last frame), and R2V (subject/scene/motion/audio lock).
    The result is stored as a new take in shot.video_takes. The first take is
    auto-selected as video_clip_path; subsequent takes require explicit selection.
    """
    driver = get_video_driver(req.model_id)
    if not driver:
        raise HTTPException(status_code=400, detail=f"Unknown video model: {req.model_id}")

    shot = _find_shot(req.project_id, req.shot_id)
    if not shot:
        raise HTTPException(status_code=404, detail="Shot not found")

    # Parse aspect ratio
    try:
        ar = AspectRatio(req.aspect_ratio)
    except ValueError:
        ar = AspectRatio.LANDSCAPE_16_9

    # Parse mode
    try:
        mode = VideoGenerationMode(req.mode)
    except ValueError:
        mode = VideoGenerationMode.T2V

    gen_req = VideoGenerationRequest(
        prompt=req.prompt,
        negative_prompt=req.negative_prompt,
        mode=mode,
        duration_seconds=req.duration_seconds,
        aspect_ratio=ar,
        seed=req.seed,
        first_frame_path=req.first_frame_path,
        last_frame_path=req.last_frame_path,
        reference_image_paths=req.reference_image_paths,
        reference_video_path=req.reference_video_path,
        reference_audio_path=req.reference_audio_path,
        camera_movement=req.camera_movement,
        extra_params=req.extra_params or {},
    )

    response = await driver.generate(gen_req)

    if response.status == GenerationStatus.FAILED:
        return response.model_dump()

    # Create a take ID and track the job for later persistence
    take_id = str(uuid.uuid4())[:8]
    _video_jobs[response.job_id] = {
        "shot_id": req.shot_id,
        "project_id": req.project_id,
        "model_id": req.model_id,
        "take_id": take_id,
        "request": req.model_dump(),
    }

    return {
        **response.model_dump(),
        "take_id": take_id,
        "shot_id": req.shot_id,
    }


@router.get("/video/status/{job_id}")
async def check_video_status(job_id: str, model_id: str = "fal_seedance_2_5"):
    """Check the status of a video generation job.

    When the job completes, the video is downloaded to the Vault and stored as a
    new take in the shot's video_takes list. The first take is auto-selected.
    """
    driver = get_video_driver(model_id)
    if not driver:
        raise HTTPException(status_code=400, detail=f"Unknown model: {model_id}")

    response = await driver.check_status(job_id)

    # If completed, persist the take to the shot
    if response.status == GenerationStatus.COMPLETED and response.video_url:
        job_info = _video_jobs.get(job_id)
        if job_info:
            shot_id = job_info["shot_id"]
            project_id = job_info["project_id"]
            take_id = job_info["take_id"]
            req_data = job_info["request"]

            # Download to vault
            local_path = await _download_video_to_vault(
                project_id, shot_id, response.video_url, take_id
            )

            # Load shot and append take
            shots = _load_shots(project_id)
            shot = next((s for s in shots if s["id"] == shot_id), None)
            if shot:
                takes = shot.get("video_takes", [])
                new_take = {
                    "id": take_id,
                    "path": local_path,
                    "seed": req_data.get("seed"),
                    "prompt": req_data.get("prompt"),
                    "negative_prompt": req_data.get("negative_prompt"),
                    "model_id": req_data.get("model_id"),
                    "camera_movement": req_data.get("camera_movement"),
                    "mode": req_data.get("mode"),
                    "created_at": datetime.utcnow().isoformat(),
                    "selected": len(takes) == 0,  # Auto-select first take
                }
                takes.append(new_take)
                shot["video_takes"] = takes

                # Auto-select first take → set video_clip_path
                if len(takes) == 1:
                    shot["video_clip_path"] = local_path
                    shot["status"] = ShotStatus.VIDEO_GENERATED.value

                shot["updated_at"] = datetime.utcnow().isoformat()
                _save_shots(project_id, shots)

    return response.model_dump()


@router.post("/video/take/select")
async def select_video_take(project_id: str, shot_id: str, take_id: str):
    """Select a specific take as the shot's active video clip.

    Updates shot.video_clip_path to the selected take's path and marks it as selected.
    """
    shots = _load_shots(project_id)
    shot = next((s for s in shots if s["id"] == shot_id), None)
    if not shot:
        raise HTTPException(status_code=404, detail="Shot not found")

    takes = shot.get("video_takes", [])
    selected_take = next((t for t in takes if t["id"] == take_id), None)
    if not selected_take:
        raise HTTPException(status_code=404, detail="Take not found")

    for t in takes:
        t["selected"] = (t["id"] == take_id)

    shot["video_clip_path"] = selected_take["path"]
    shot["video_takes"] = takes
    shot["status"] = ShotStatus.VIDEO_GENERATED.value
    shot["updated_at"] = datetime.utcnow().isoformat()
    _save_shots(project_id, shots)

    return {"status": "selected", "take_id": take_id, "video_clip_path": selected_take["path"]}
