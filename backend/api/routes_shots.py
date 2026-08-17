"""
Shot Routes - Shot CRUD, frame generation, camera direction, video generation.

Shots are the core unit of the storyboard. Each shot stores its full
generation recipe for reproducibility.
"""

import json
import uuid
import random
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
    angles_to_sks_prompt,
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


def _save_scenes(project_id: str, scenes: List[dict]):
    idx = _project_dir(project_id) / "scenes.json"
    with open(idx, "w") as f:
        json.dump(scenes, f, indent=2, default=str)


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

    # Load full asset records early (needed for scene context and asset descriptions)
    all_assets = _load_assets(shot["project_id"]) if shot else []
    asset_map = {a["id"]: a for a in all_assets}

    # Look up scene for lighting/mood/time_of_day context and establishing frame
    scene_context = ""
    establishing_frame = None
    scene_obj = None
    if shot and shot.get("scene_id"):
        scenes = _load_scenes(shot["project_id"])
        scene_obj = next((s for s in scenes if s["id"] == shot["scene_id"]), None)
        if scene_obj:
            parts = []
            # Include scene description for narrative context
            scene_desc = scene_obj.get("description", "")
            if scene_desc:
                parts.append(scene_desc)
            # Include location description (not auto-generated name) for environment context
            for ref in scene_obj.get("reference_assets", []):
                if ref.get("asset_type") == "location":
                    # Look up full asset to get description (name is often auto-generated)
                    loc_asset = next((a for a in all_assets if a["id"] == ref.get("asset_id")), None)
                    loc_desc = (loc_asset or {}).get("description", "")
                    loc_name = (loc_asset or {}).get("name", "")
                    # Strip style keywords that got saved as part of the description
                    # (e.g. "Photoreal, realistic, circus tent." -> "circus tent")
                    style_keywords = [
                        "photoreal", "photorealistic", "realistic", "8k", "4k",
                        "high quality", "detailed", "cinematic", "hyperrealistic",
                        "ultra realistic", "real", "photo", "photography",
                    ]
                    if loc_desc:
                        desc_words = loc_desc.replace(".", "").split(",")
                        cleaned = [w.strip() for w in desc_words if w.strip().lower() not in style_keywords]
                        loc_desc = ", ".join(cleaned) if cleaned else loc_desc
                    # Prefer description if name looks auto-generated
                    if loc_desc and ("generated" in loc_name.lower() or not loc_name):
                        parts.append(f"at {loc_desc}")
                    elif loc_name and "generated" not in loc_name.lower():
                        parts.append(f"at {loc_name}")
                    elif loc_desc:
                        parts.append(f"at {loc_desc}")
                    break
            # Always include time of day — even "day" provides useful context
            tod = scene_obj.get("time_of_day", "")
            if tod:
                tod_labels = {
                    "dawn": "dawn light, first light of day",
                    "morning": "morning light, bright clear daylight",
                    "day": "daytime, bright daylight",
                    "golden_hour": "golden hour, warm directional sunlight",
                    "dusk": "dusk, fading light",
                    "night": "nighttime, darkness",
                    "interior": "interior setting",
                }
                parts.append(tod_labels.get(tod, tod.replace("_", " ")))
            # Always include mood with professional cinematography adjective
            mood = scene_obj.get("mood", "")
            if mood:
                mood_labels = {
                    "neutral": "balanced composition",
                    "tense": "tense atmosphere, tight framing",
                    "joyful": "joyful atmosphere, warm tones",
                    "melancholic": "melancholic atmosphere, muted tones",
                    "mysterious": "mysterious atmosphere, shadows and fog",
                    "action": "high energy action, dynamic composition",
                    "romantic": "romantic atmosphere, soft focus",
                    "horror": "dread and horror, dark shadows",
                }
                parts.append(mood_labels.get(mood, f"{mood} mood"))
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
    print(f"[routes_shots] shot_assets={len(shot_assets)}, scene_id={shot.get('scene_id') if shot else 'none'}")

    location_image = None
    character_images = []
    other_images = []
    prompt_enrichments = []
    for a in shot_assets:
        role = a.get("role", a.get("asset_type", ""))
        name = a.get("asset_name", "")
        img = a.get("image_path")
        asset_id = a.get("asset_id", "")
        full_asset = asset_map.get(asset_id, {})
        desc = full_asset.get("description", "")
        if role == "location" and img:
            location_image = img
        elif role == "character":
            # Use description as the character label if name is auto-generated
            display_name = name
            if name and "generated" in name.lower():
                display_name = desc if desc else name
            if display_name:
                prompt_enrichments.append(f"featuring {display_name}")
            # Use primary_image (single portrait) for VL context — multi-view
            # sheets confuse the VL encoder (5 panels look like 5 characters).
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
    # For establishing shots: professional baseline + full character descriptions
    # + scene context first, user's action prompt LAST (strongest position).
    # For subsequent shots: continuity prefix + context first, user's composition
    # instruction last (strongest position for the model).
    is_establishing = not establishing_frame

    # Detect action verbs in the user's prompt and amplify them.
    # The VL encoder sees static character portraits, which biases the model
    # toward static poses. Adding dynamic action descriptors helps override this.
    action_verbs = [
        "fight", "fights", "fighting", "battling", "attacks", "attacking",
        "running", "chasing", "fleeing", "charging", "lunging", "striking",
        "dodging", "blocking", "parrying", "clashing", "wielding",
        "punching", "kicking", "grabbing", "pushing", "pulling",
        "jumping", "leaping", "falling", "diving", "rolling",
        "shooting", "aiming", "throwing", "catching",
        "riding", "galloping", "sprinting", "escaping",
    ]
    user_prompt_lower = req.prompt.lower()
    has_action = any(verb in user_prompt_lower for verb in action_verbs)
    action_prefix = ""
    if has_action:
        action_prefix = "dynamic action, characters in motion"

    if is_establishing:
        # Establishing shot: now uses <sks> camera angle prompt when angles are
        # provided (front/eye/wide by default from frontend), plus scene context.
        # The Multi-Angles LoRA (strength 0.6) guides framing while the VL encoder
        # sees all 3 reference images (location + characters).
        if req.horizontal_angle is not None:
            effective_prompt = angles_to_sks_prompt(
                req.horizontal_angle, req.vertical_angle or 0, req.zoom if req.zoom is not None else 1.0
            )
        else:
            effective_prompt = "wide establishing shot"
        # Add scene context, character names, and user description
        context_parts = []
        if scene_context:
            context_parts.append(scene_context)
        if prompt_enrichments:
            context_parts.append(", ".join(prompt_enrichments))
        if action_prefix:
            context_parts.append(action_prefix)
        if context_parts:
            effective_prompt += f" {', '.join(context_parts)}"
        if req.prompt.strip():
            effective_prompt += f" {req.prompt.strip()}"
    else:
        # Subsequent shot: use camera angle controls if provided, otherwise
        # send the user's prompt directly. The multi-angles LoRA expects
        # prompts in the format "<sks> {h_direction} {v_direction} {distance}".
        preset = req.composition_preset or ""
        is_pov = preset == "pov"
        is_ots = preset in ("ots_left", "ots_right", "dirty_ots_left", "dirty_ots_right")

        if req.horizontal_angle is not None and not is_pov:
            # For OTS: reverse the horizontal angle 180° so the <sks> tag
            # describes the subject facing the camera, not the character
            # whose shoulder we're behind.
            sks_h = req.horizontal_angle
            if is_ots:
                sks_h = (sks_h + 180) % 360
            effective_prompt = angles_to_sks_prompt(
                sks_h, req.vertical_angle or 0, req.zoom if req.zoom is not None else 5.0
            )
            # Add scene context and character names for consistency reinforcement
            # (VL encoder sees the establishing frame, but text helps the model
            # maintain character identity and scene atmosphere)
            context_parts = []
            if scene_context:
                context_parts.append(scene_context)
            if prompt_enrichments:
                context_parts.append(", ".join(prompt_enrichments))
            if context_parts:
                effective_prompt += f" {', '.join(context_parts)}"
            if action_prefix:
                effective_prompt += f" {action_prefix}"
            if req.prompt.strip():
                effective_prompt += f" {req.prompt.strip()}"
            print(f"[routes_shots] camera angles: h={req.horizontal_angle}, v={req.vertical_angle}, zoom={req.zoom}, preset={preset}")
        elif is_pov:
            # POV: the Multi-Angles LoRA cannot handle first-person perspective.
            # Skip the <sks> tag entirely and use only descriptive text.
            context_parts = []
            if scene_context:
                context_parts.append(scene_context)
            if prompt_enrichments:
                context_parts.append(", ".join(prompt_enrichments))
            if action_prefix:
                context_parts.append(action_prefix)
            context_str = ", ".join(context_parts)
            user_str = req.prompt.strip()
            if context_str and user_str:
                effective_prompt = f"{context_str}, {user_str}"
            else:
                effective_prompt = context_str or user_str
            print(f"[routes_shots] POV shot: skipping <sks> tag, using descriptive text only")
        else:
            effective_prompt = req.prompt

    # Find previous shot in the same scene for action continuity
    prev_frame_image = None
    establishing_seed = None
    shot_index_in_scene = 0
    if shot and shot.get("scene_id"):
        all_shots = _load_shots(shot["project_id"])
        scene_shots = [s for s in all_shots if s.get("scene_id") == shot.get("scene_id") and s["id"] != req.shot_id]
        scene_shots.sort(key=lambda s: s.get("sequence_order", 0))
        current_order = shot.get("sequence_order", 0)
        prev_shots = [s for s in scene_shots if s.get("sequence_order", 0) < current_order and s.get("frame_image_path")]
        shot_index_in_scene = len(prev_shots)
        if prev_shots:
            prev_shots.sort(key=lambda s: s.get("sequence_order", 0), reverse=True)
            prev_frame_image = prev_shots[0]["frame_image_path"]
            print(f"[routes_shots] continuity: using prev shot frame {prev_frame_image}")
            # Extract seed from the establishing shot's recipe for seed continuity
            est_recipe = prev_shots[-1].get("generation_recipe") or {}
            est_seed = est_recipe.get("seed") if isinstance(est_recipe, dict) else None
            print(f"[routes_shots] continuity: establishing shot recipe seed={est_seed}, recipe type={type(est_recipe).__name__}")
            if est_seed is not None:
                establishing_seed = est_seed
                print(f"[routes_shots] continuity: using establishing seed {est_seed}")

    # Build ref_paths.
    # ESTABLISHING SHOT: 3 refs (location + characters/props) — uses the
    #   qwen_image_edit_establishing workflow with 3 LoadImage nodes.
    # SUBSEQUENT SHOTS: 2 refs (establishing frame + previous shot frame) — uses
    #   the qwen_image_edit workflow with LoadImage nodes. The establishing frame
    #   provides scene/character identity; the previous shot frame provides
    #   action continuity (e.g. character pose from the prior angle).
    ref_paths = []
    if establishing_frame:
        ref_paths.append(establishing_frame)
        if prev_frame_image and prev_frame_image != establishing_frame:
            ref_paths.append(prev_frame_image)
            print(f"[routes_shots] ref_paths (subsequent): establishing + prev shot frame")
        else:
            print(f"[routes_shots] ref_paths (subsequent): establishing frame only")
    else:
        if location_image:
            ref_paths.append(location_image)
        if character_images:
            ref_paths.append(character_images[0])
        if len(character_images) > 1 and len(ref_paths) < 3:
            ref_paths.append(character_images[1])
        elif other_images and len(ref_paths) < 3:
            ref_paths.append(other_images[0])
        print(f"[routes_shots] ref_paths (establishing): {ref_paths}")
    # Add any explicitly passed refs not already included
    for r in (req.reference_image_paths or []):
        if r not in ref_paths:
            ref_paths.append(r)

    print(f"[routes_shots] characters={len(character_images)}, location={'yes' if location_image else 'no'}, has_establishing={'yes' if establishing_frame else 'no'}, action={'yes' if has_action else 'no'}")
    print(f"[routes_shots] effective_prompt={effective_prompt}")
    print(f"[routes_shots] ref_paths={ref_paths}")

    # Default negative prompt — kept short for qwen_image_edit (cfg=1 means
    # minimal negative guidance influence)
    base_negative = "deformed, extra limbs, blurry, low quality, watermark, text"
    if has_action:
        base_negative = "static pose, standing still, " + base_negative
    if is_establishing:
        base_negative = "close-up shot, cropped environment, " + base_negative
    effective_negative = req.negative_prompt or base_negative
    print(f"[routes_shots] effective_negative={effective_negative}")

    # Denoise: user override > defaults.
    # For qwen_image_edit: always 1.0. The VL encoder provides scene/character
    # consistency via reference images. Lower denoise locks the latent and
    # produces near-identical copies of the establishing frame.
    denoise = None
    if req.model_id == "qwen_image_edit":
        if req.denoise is not None:
            denoise = req.denoise
        elif establishing_frame:
            # All subsequent shots: denoise=1.0. The VL encoder sees the
            # establishing frame (image1) for scene/character consistency.
            # At denoise=0.8 with 4 steps, the latent dominates and the output
            # looks identical to the establishing frame. denoise=1.0 gives the
            # model freedom to change camera angle and composition while still
            # maintaining consistency through VL context.
            denoise = 1.0
        else:
            denoise = 1.0
        print(f"[routes_shots] using denoise={denoise} (action={has_action}, establishing={not bool(establishing_frame)})")

    from core.drivers.base import ImageGenerationRequest
    # Seed: for subsequent shots, use a DIFFERENT seed than the establishing shot.
    # With denoise=1.0, the model generates from noise. Same seed + same VL refs
    # = identical output. A different seed ensures the model explores a different
    # composition/camera angle.
    effective_seed = req.seed
    if effective_seed is None:
        if establishing_seed is not None:
            # Each subsequent shot gets a unique seed offset by its position
            # in the scene, so shots 2, 3, 4... all get different seeds.
            effective_seed = (establishing_seed + 1 + shot_index_in_scene) % (2**32)
            print(f"[routes_shots] using offset seed for variation: {effective_seed} (establishing was {establishing_seed}, shot index {shot_index_in_scene})")
        else:
            effective_seed = random.randint(0, 2**32 - 1)
            print(f"[routes_shots] using random seed: {effective_seed}")

    extra_params = {}
    if req.cfg is not None:
        extra_params["cfg"] = req.cfg
    if req.steps is not None:
        extra_params["steps"] = req.steps
    extra_params["shot_type"] = "establishing" if is_establishing else "subsequent"
    if req.composition_preset:
        extra_params["composition_preset"] = req.composition_preset

    gen_req = ImageGenerationRequest(
        prompt=effective_prompt,
        negative_prompt=effective_negative,
        width=req.width,
        height=req.height,
        seed=effective_seed,
        reference_image_paths=ref_paths,
        denoise_strength=denoise,
        extra_params=extra_params,
    )

    response = await driver.generate(gen_req)

    # Store recipe in shot
    if shot:
        recipe = GenerationRecipe(
            resolved_prompt=effective_prompt,
            resolved_negative_prompt=req.negative_prompt,
            seed=effective_seed,
            model_id=req.model_id,
            params={
                "width": req.width, "height": req.height,
                "cfg": req.cfg, "steps": req.steps,
                "horizontal_angle": req.horizontal_angle,
                "vertical_angle": req.vertical_angle,
                "zoom": req.zoom,
            },
            reference_paths=ref_paths,
            denoise=denoise,
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

            # Auto-save establishing frame for the scene
            # - If no establishing frame exists yet, set it
            # - If this shot IS an establishing shot, update it (regenerated)
            frame_path = updates.get("frame_image_path")
            scene_id = s.get("scene_id")
            shot_type = s.get("shot_type", "")
            if frame_path and scene_id:
                scenes = _load_scenes(project_id)
                for sc in scenes:
                    if sc["id"] == scene_id:
                        should_update = False
                        if not sc.get("establishing_frame_path"):
                            should_update = True
                        if should_update:
                            sc["establishing_frame_path"] = frame_path
                            sc["updated_at"] = datetime.utcnow().isoformat()
                            _save_scenes(project_id, scenes)
                            print(f"[routes_shots] auto-saved establishing frame for scene {scene_id}: {frame_path}")
                        break

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
