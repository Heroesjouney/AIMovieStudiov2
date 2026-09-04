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
    ShotVariationRequest, ShotVideoGenerateRequest, RetentionLevel,
)
from core.schemas.camera import (
    CameraParams, CameraMovement, CameraAnglePreset,
    MultiAngleRequest, QWEN_MULTIANGLE_PROMPTS,
    angles_to_sks_prompt,
)
from core.drivers import get_image_driver, get_video_driver
from core.drivers.base import VideoGenerationRequest, VideoGenerationMode, AspectRatio, GenerationStatus
from core.logic.prompt_builder import build_prompt, parse_dialogue_tags

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


def _find_shot_global(shot_id: str) -> tuple[Optional[dict], Optional[str]]:
    """Search all project directories for a shot by ID.
    Returns (shot_dict, project_id) or (None, None) if not found.
    """
    if not VAULT_DIR.exists():
        return None, None
    for project_dir in VAULT_DIR.iterdir():
        if not project_dir.is_dir():
            continue
        shots_idx = project_dir / "shots.json"
        if not shots_idx.exists():
            continue
        try:
            with open(shots_idx, "r") as f:
                shots = json.load(f)
            for s in shots:
                if s.get("id") == shot_id:
                    return s, project_dir.name
        except (json.JSONDecodeError, KeyError):
            continue
    return None, None


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
        "hidden": req.hidden,
        "sequence_order": len(_load_shots(req.project_id)),
        "assets": auto_assets,
        "frame_image_path": None,
        "angle_images": {},
        "video_clip_path": None,
        "video_takes": [],
        "audio_clip_path": None,
        "last_frame_path": None,
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
    shot, shot_project_id = _find_shot_global(req.shot_id)
    shot_assets = (shot or {}).get("assets", [])

    # Load full asset records early (needed for scene context and asset descriptions)
    all_assets = _load_assets(shot_project_id) if shot else []
    asset_map = {a["id"]: a for a in all_assets}

    # Look up scene for lighting/mood/time_of_day context and establishing frame
    scene_context = ""
    establishing_frame = None
    scene_obj = None
    if shot and shot.get("scene_id"):
        scenes = _load_scenes(shot_project_id)
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

    # Detect if the user's prompt focuses on a specific character by name.
    # If so, only include that character's reference image and enrichment text.
    user_prompt_lower = req.prompt.lower().strip()
    focused_character_name = None

    location_image = None
    character_images = []
    other_images = []
    prompt_enrichments = []
    # First pass: collect character names to check for focus
    character_entries = []
    for a in shot_assets:
        role = a.get("role", a.get("asset_type", ""))
        if role != "character":
            continue
        name = a.get("asset_name", "")
        asset_id = a.get("asset_id", "")
        full_asset = asset_map.get(asset_id, {})
        desc = full_asset.get("description", "")
        display_name = name
        if name and "generated" in name.lower():
            display_name = desc if desc else name
        if display_name:
            name_lower = display_name.lower()
            name_words = name_lower.split()
            if name_lower in user_prompt_lower or (name_words and name_words[0] in user_prompt_lower):
                focused_character_name = display_name
                break

    if focused_character_name and establishing_frame:
        print(f"[routes_shots] character focus detected: '{focused_character_name}' — filtering other characters")

    for a in shot_assets:
        role = a.get("role", a.get("asset_type", ""))
        name = a.get("asset_name", "")
        img = a.get("image_path")
        asset_id = a.get("asset_id", "")
        retention = a.get("retention", "fully_preserved")
        full_asset = asset_map.get(asset_id, {})
        desc = full_asset.get("description", "")
        if role == "location" and img:
            location_image = img
        elif role == "character":
            display_name = name
            if name and "generated" in name.lower():
                display_name = desc if desc else name
            # Skip non-focused characters when a focus is detected (subsequent shots only)
            if focused_character_name and establishing_frame and display_name != focused_character_name:
                print(f"[routes_shots] skipping character '{display_name}' (not focused)")
                continue
            if display_name:
                if retention == "fully_preserved":
                    prompt_enrichments.append(f"featuring {display_name}")
                elif retention == "partially_preserved":
                    prompt_enrichments.append(f"featuring {display_name}, with some characteristics changed")
                elif retention == "attribute_transfer":
                    prompt_enrichments.append(f"transferring {display_name}'s characteristics to a different subject")
                elif retention == "weak_reference":
                    prompt_enrichments.append(f"loosely referencing {display_name}'s style")
                else:
                    prompt_enrichments.append(f"featuring {display_name}")
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
            sks_tag = angles_to_sks_prompt(
                req.horizontal_angle, req.vertical_angle or 0, req.zoom if req.zoom is not None else 1.0
            )
        else:
            sks_tag = "wide establishing shot"
        effective_prompt = build_prompt(
            model_id=req.model_id,
            scene_context=scene_context,
            shot_assets=shot_assets,
            asset_map=asset_map,
            action_prefix=action_prefix,
            user_prompt=req.prompt,
            sks_tag=sks_tag,
            is_pov=False,
            is_establishing=True,
            prompt_override=req.prompt_override,
        )
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
            sks_tag = angles_to_sks_prompt(
                sks_h, req.vertical_angle or 0, req.zoom if req.zoom is not None else 5.0
            )
            effective_prompt = build_prompt(
                model_id=req.model_id,
                scene_context=scene_context,
                shot_assets=shot_assets,
                asset_map=asset_map,
                action_prefix=action_prefix,
                user_prompt=req.prompt,
                sks_tag=sks_tag,
                is_pov=False,
                is_establishing=False,
                prompt_override=req.prompt_override,
            )
            print(f"[routes_shots] camera angles: h={req.horizontal_angle}, v={req.vertical_angle}, zoom={req.zoom}, preset={preset}")
        elif is_pov:
            # POV: the Multi-Angles LoRA cannot handle first-person perspective.
            # Skip the <sks> tag entirely and use only descriptive text.
            effective_prompt = build_prompt(
                model_id=req.model_id,
                scene_context=scene_context,
                shot_assets=shot_assets,
                asset_map=asset_map,
                action_prefix=action_prefix,
                user_prompt=req.prompt,
                sks_tag=None,
                is_pov=True,
                is_establishing=False,
                prompt_override=req.prompt_override,
            )
            print(f"[routes_shots] POV shot: skipping <sks> tag, using descriptive text only")
        else:
            effective_prompt = req.prompt_override.strip() if req.prompt_override else req.prompt

    # Find previous shot in the same scene for action continuity
    prev_frame_image = None
    establishing_seed = None
    shot_index_in_scene = 0
    if shot and shot.get("scene_id"):
        all_shots = _load_shots(shot_project_id)
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
                "prompt_override": req.prompt_override,
            },
            reference_paths=ref_paths,
            denoise=denoise,
        )
        shot["generation_recipe"] = recipe.model_dump()
        shot["status"] = ShotStatus.PLANNED.value
        shots = _load_shots(shot_project_id)
        for s in shots:
            if s["id"] == req.shot_id:
                s.update(shot)
                break
        _save_shots(shot_project_id, shots)

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
    return {"status": "ok", "count": len(reordered)}


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


@router.delete("/video/take")
async def delete_video_take(project_id: str, shot_id: str, take_id: str):
    """Delete a video take from a shot.

    Removes the take from video_takes[], deletes the MP4 file from the vault.
    If the deleted take was the active (selected) one:
    - Promotes the most recent remaining take to active (re-extracts last frame)
    - If no takes remain, clears video_clip_path, last_frame_path, and resets status
    """
    shots = _load_shots(project_id)
    shot = next((s for s in shots if s["id"] == shot_id), None)
    if not shot:
        raise HTTPException(status_code=404, detail="Shot not found")

    takes = shot.get("video_takes", [])
    take_to_delete = next((t for t in takes if t["id"] == take_id), None)
    if not take_to_delete:
        raise HTTPException(status_code=404, detail="Take not found")

    was_selected = take_to_delete.get("selected", False)
    take_path = take_to_delete.get("path", "")

    # Delete the MP4 file from vault
    if take_path and take_path.startswith("/assets/"):
        local_file = VAULT_DIR / take_path[len("/assets/"):]
        if local_file.exists():
            try:
                local_file.unlink()
                print(f"[routes_shots] deleted take file: {local_file}")
            except Exception as e:
                print(f"[routes_shots] failed to delete take file: {e}")

    # Also delete spliced retake file if it exists
    spliced_path = shot.get("video_clip_path", "")
    if take_to_delete.get("retake_of") and spliced_path.startswith("/assets/"):
        spliced_file = VAULT_DIR / spliced_path[len("/assets/"):]
        if spliced_file.exists() and spliced_file != local_file:
            try:
                spliced_file.unlink()
                print(f"[routes_shots] deleted spliced file: {spliced_file}")
            except Exception as e:
                print(f"[routes_shots] failed to delete spliced file: {e}")

    # Remove the take from the list
    takes = [t for t in takes if t["id"] != take_id]
    shot["video_takes"] = takes

    if was_selected:
        if takes:
            # Promote the last remaining take to active
            takes[-1]["selected"] = True
            shot["video_clip_path"] = takes[-1]["path"]
            shot["video_takes"] = takes

            # Re-extract last frame from the new active take
            shot_folder = _shot_dir(project_id, shot_id)
            last_frame_path = shot_folder / "last_frame.png"
            if _extract_last_frame(takes[-1]["path"], last_frame_path):
                shot["last_frame_path"] = f"/assets/{project_id}/shots/{shot_id}/last_frame.png"
            else:
                shot["last_frame_path"] = None
        else:
            # No takes left — clear video state
            shot["video_clip_path"] = None
            shot["last_frame_path"] = None
            shot["status"] = ShotStatus.PLANNED.value

    shot["updated_at"] = datetime.utcnow().isoformat()
    _save_shots(project_id, shots)

    return {"status": "deleted", "take_id": take_id, "remaining_takes": len(takes)}


@router.delete("/{project_id}/{shot_id}")
async def delete_shot(project_id: str, shot_id: str):
    shots = _load_shots(project_id)
    filtered = [s for s in shots if s["id"] != shot_id]
    if len(filtered) == len(shots):
        raise HTTPException(status_code=404, detail="Shot not found")
    _save_shots(project_id, filtered)
    return {"status": "deleted", "id": shot_id}


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
        "last_frame_path": None,
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


def _extract_last_frame(video_path: str, output_path: Path) -> bool:
    """Extract the last frame of a video as a PNG using ffmpeg.

    Returns True on success, False on failure.
    """
    import subprocess
    # Resolve /assets/... URLs to local paths
    if video_path.startswith("/assets/"):
        local = VAULT_DIR / video_path[len("/assets/"):]
        if not local.exists():
            return False
        video_path = str(local)
    elif not Path(video_path).exists():
        return False

    try:
        result = subprocess.run(
            ["ffmpeg", "-y", "-sseof", "-0.1", "-i", video_path,
             "-frames:v", "1", "-q:v", "2", str(output_path)],
            capture_output=True, text=True, timeout=15,
        )
        return result.returncode == 0 and output_path.exists()
    except Exception:
        return False


def _extract_first_frame(video_path: str, output_path: Path) -> bool:
    """Extract the first frame of a video as a PNG using ffmpeg.

    Returns True on success, False on failure.
    """
    import subprocess
    if video_path.startswith("/assets/"):
        local = VAULT_DIR / video_path[len("/assets/"):]
        if not local.exists():
            return False
        video_path = str(local)
    elif not Path(video_path).exists():
        return False

    try:
        result = subprocess.run(
            ["ffmpeg", "-y", "-i", video_path,
             "-frames:v", "1", "-q:v", "2", str(output_path)],
            capture_output=True, text=True, timeout=15,
        )
        return result.returncode == 0 and output_path.exists()
    except Exception:
        return False


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

    # Auto-pass previous shot's last frame as first_frame for continuity
    # (only if user didn't explicitly provide one and didn't opt out)
    effective_first_frame = req.first_frame_path
    continuity_warning = None
    if not effective_first_frame and not req.skip_continuity and shot.get("scene_id"):
        all_shots = _load_shots(req.project_id)
        scene_shots = [s for s in all_shots if s.get("scene_id") == shot.get("scene_id") and s["id"] != req.shot_id]
        scene_shots.sort(key=lambda s: s.get("sequence_order", 0))
        current_order = shot.get("sequence_order", 0)
        prev_shots = [s for s in scene_shots if s.get("sequence_order", 0) < current_order]
        prev_with_frame = [s for s in prev_shots if s.get("last_frame_path")]
        if prev_with_frame:
            prev_with_frame.sort(key=lambda s: s.get("sequence_order", 0), reverse=True)
            effective_first_frame = prev_with_frame[0]["last_frame_path"]
            print(f"[routes_shots] video: auto-using prev shot last frame as first_frame: {effective_first_frame}")
        elif prev_shots:
            # Previous shots exist but none have a completed video (no last_frame_path)
            prev_shots.sort(key=lambda s: s.get("sequence_order", 0), reverse=True)
            prev_shot = prev_shots[0]
            if not prev_shot.get("video_clip_path"):
                continuity_warning = f"Previous shot '{prev_shot.get('name', 'unnamed')}' has no completed video. Generate it first for visual continuity."
            else:
                continuity_warning = f"Previous shot '{prev_shot.get('name', 'unnamed')}' has a video but last frame was not extracted."
            print(f"[routes_shots] video: continuity warning — {continuity_warning}")

    # Auto-pass establishing frame as reference image for scene identity lock
    effective_ref_images = list(req.reference_image_paths or [])
    if not req.skip_continuity and shot.get("scene_id"):
        scenes = _load_scenes(req.project_id)
        scene_obj = next((s for s in scenes if s["id"] == shot["scene_id"]), None)
        if scene_obj:
            est_frame = scene_obj.get("establishing_frame_path")
            if est_frame and est_frame not in effective_ref_images:
                effective_ref_images.insert(0, est_frame)
                print(f"[routes_shots] video: auto-adding establishing frame as ref image: {est_frame}")

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

    # Build effective prompt (with override support)
    effective_prompt = req.prompt
    if req.prompt_override and req.prompt_override.strip():
        effective_prompt = req.prompt_override.strip()
        print(f"[routes_shots] video: using prompt override, skipping auto-compile")
    elif req.model_id == "minimax_h3":
        # For H3, parse dialogue tags
        effective_prompt = parse_dialogue_tags(req.prompt, shot.get("assets", []))

    gen_req = VideoGenerationRequest(
        prompt=effective_prompt,
        negative_prompt=req.negative_prompt,
        mode=mode,
        duration_seconds=req.duration_seconds,
        aspect_ratio=ar,
        seed=req.seed,
        first_frame_path=effective_first_frame,
        last_frame_path=req.last_frame_path,
        reference_image_paths=effective_ref_images,
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
        "continuity_warning": continuity_warning,
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
      try:
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
                # Skip if take already persisted (re-poll after completion)
                if any(t.get("id") == take_id for t in takes):
                    print(f"[routes_shots] take {take_id} already persisted, skipping")
                else:
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

                    # Extract last frame for continuity chain
                    shot_folder = _shot_dir(project_id, shot_id)
                    last_frame_path = shot_folder / "last_frame.png"
                    if _extract_last_frame(local_path, last_frame_path):
                        shot["last_frame_path"] = f"/assets/{project_id}/shots/{shot_id}/last_frame.png"
                        print(f"[routes_shots] extracted last frame for shot {shot_id}: {shot['last_frame_path']}")
                    else:
                        print(f"[routes_shots] failed to extract last frame for shot {shot_id}")

                    # Extract first frame as storyboard image if shot has no frame_image_path
                    if not shot.get("frame_image_path"):
                        first_frame_path = shot_folder / "first_frame.png"
                        if _extract_first_frame(local_path, first_frame_path):
                            shot["frame_image_path"] = f"/assets/{project_id}/shots/{shot_id}/first_frame.png"
                            print(f"[routes_shots] extracted first frame as storyboard image for shot {shot_id}: {shot['frame_image_path']}")
                        else:
                            print(f"[routes_shots] failed to extract first frame for shot {shot_id}")

                    # Handle retake: splice new segment back into original video
                    if job_info.get("is_retake"):
                        original_path = job_info["original_video_path"]
                        start_sec = job_info["start_seconds"]
                        end_sec = job_info["end_seconds"]
                        spliced_path = shot_folder / f"take_{take_id}_spliced.mp4"
                        if _splice_video(original_path, local_path, start_sec, end_sec, spliced_path):
                            spliced_url = f"/assets/{project_id}/shots/{shot_id}/take_{take_id}_spliced.mp4"
                            new_take["path"] = spliced_url
                            new_take["retake_of"] = original_path
                            new_take["retake_range"] = [start_sec, end_sec]
                            print(f"[routes_shots] retake spliced into {spliced_url}")
                        else:
                            print(f"[routes_shots] retake splice failed, keeping unspliced segment")

                    shot["updated_at"] = datetime.utcnow().isoformat()
                    _save_shots(project_id, shots)

            # Remove job from memory after processing
            _video_jobs.pop(job_id, None)

            # Override video_url with the local vault path so the frontend
            # can play it from our backend instead of the raw ComfyUI URL
            if local_path:
                response.video_url = local_path
      except Exception as e:
        import traceback
        print(f"[routes_shots] error persisting video take: {e}")
        traceback.print_exc()

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

    # Re-extract last frame from the newly selected take so the continuity
    # chain uses the correct ending frame for subsequent shots.
    shot_folder = _shot_dir(project_id, shot_id)
    last_frame_path = shot_folder / "last_frame.png"
    if _extract_last_frame(selected_take["path"], last_frame_path):
        shot["last_frame_path"] = f"/assets/{project_id}/shots/{shot_id}/last_frame.png"
        print(f"[routes_shots] re-extracted last frame for shot {shot_id} from take {take_id}")
    else:
        print(f"[routes_shots] failed to re-extract last frame for shot {shot_id} from take {take_id}")

    shot["updated_at"] = datetime.utcnow().isoformat()
    _save_shots(project_id, shots)

    return {"status": "selected", "take_id": take_id, "video_clip_path": selected_take["path"]}


# =============================================================================
# Retake Mode - Regenerate a portion of a video and splice it back
# =============================================================================

def _splice_video(original_path: str, new_segment_path: str, start_sec: float, end_sec: str, output_path: Path) -> bool:
    """Splice a new video segment into an original video, replacing the marked range.

    Uses ffmpeg to: extract [0, start) from original, concat with new segment,
    concat with [end, duration) from original.
    """
    import subprocess
    # Resolve /assets/... URLs to local paths
    if original_path.startswith("/assets/"):
        orig_local = VAULT_DIR / original_path[len("/assets/"):]
        if not orig_local.exists():
            return False
        original_path = str(orig_local)
    if new_segment_path.startswith("/assets/"):
        new_local = VAULT_DIR / new_segment_path[len("/assets/"):]
        if not new_local.exists():
            return False
        new_segment_path = str(new_local)

    temp_dir = output_path.parent / f"retake_temp_{output_path.stem}"
    temp_dir.mkdir(exist_ok=True)

    try:
        # Part 1: before the retake range
        part1 = temp_dir / "part1.mp4"
        subprocess.run(
            ["ffmpeg", "-y", "-ss", "0", "-to", str(start_sec), "-i", original_path,
             "-c", "copy", str(part1)],
            capture_output=True, text=True, timeout=30,
        )

        # Part 2: the new segment (already a file)
        part2 = new_segment_path

        # Part 3: after the retake range
        part3 = temp_dir / "part3.mp4"
        subprocess.run(
            ["ffmpeg", "-y", "-ss", str(end_sec), "-i", original_path,
             "-c", "copy", str(part3)],
            capture_output=True, text=True, timeout=30,
        )

        # Concat all three parts
        concat_list = temp_dir / "concat.txt"
        concat_lines = []
        if part1.exists():
            concat_lines.append(f"file '{part1}'")
        concat_lines.append(f"file '{part2}'")
        if part3.exists():
            concat_lines.append(f"file '{part3}'")
        concat_list.write_text("\n".join(concat_lines))

        result = subprocess.run(
            ["ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", str(concat_list),
             "-c:v", "libx264", "-preset", "medium", "-crf", "18",
             "-c:a", "aac", "-b:a", "192k", "-pix_fmt", "yuv420p",
             "-movflags", "+faststart", str(output_path)],
            capture_output=True, text=True, timeout=120,
        )

        # Cleanup temp
        import shutil as _shutil
        _shutil.rmtree(temp_dir, ignore_errors=True)

        return result.returncode == 0 and output_path.exists()
    except Exception as e:
        print(f"[routes_shots] retake splice error: {e}")
        import shutil as _shutil
        _shutil.rmtree(temp_dir, ignore_errors=True)
        return False


@router.post("/retake")
async def generate_retake(
    project_id: str,
    shot_id: str,
    start_seconds: float,
    end_seconds: float,
    prompt: str,
    model_id: str = "minimax_h3",
    seed: Optional[int] = None,
):
    """Regenerate a portion of a shot's video and splice it back.

    1. Extract the frame at start_seconds as first_frame anchor.
    2. Extract the frame at end_seconds as last_frame anchor.
    3. Generate a new video segment with the given prompt.
    4. Splice the new segment back into the original video.
    5. Save as a new take with retake_of metadata.
    """
    shot = _find_shot(project_id, shot_id)
    if not shot:
        raise HTTPException(status_code=404, detail="Shot not found")

    video_path = shot.get("video_clip_path")
    if not video_path:
        raise HTTPException(status_code=400, detail="Shot has no video to retake")

    driver = get_video_driver(model_id)
    if not driver:
        raise HTTPException(status_code=400, detail=f"Unknown video model: {model_id}")

    shot_folder = _shot_dir(project_id, shot_id)

    # Extract anchor frames
    import subprocess
    anchor_start = shot_folder / "retake_anchor_start.png"
    anchor_end = shot_folder / "retake_anchor_end.png"

    orig_local = video_path
    if video_path.startswith("/assets/"):
        orig_local = str(VAULT_DIR / video_path[len("/assets/"):])

    subprocess.run(
        ["ffmpeg", "-y", "-ss", str(start_seconds), "-i", orig_local,
         "-frames:v", "1", "-q:v", "2", str(anchor_start)],
        capture_output=True, text=True, timeout=15,
    )
    subprocess.run(
        ["ffmpeg", "-y", "-ss", str(end_seconds), "-i", orig_local,
         "-frames:v", "1", "-q:v", "2", str(anchor_end)],
        capture_output=True, text=True, timeout=15,
    )

    anchor_start_url = f"/assets/{project_id}/shots/{shot_id}/retake_anchor_start.png"
    anchor_end_url = f"/assets/{project_id}/shots/{shot_id}/retake_anchor_end.png"

    duration = end_seconds - start_seconds

    try:
        ar = AspectRatio("16:9")
    except ValueError:
        ar = AspectRatio.LANDSCAPE_16_9

    gen_req = VideoGenerationRequest(
        prompt=prompt,
        mode=VideoGenerationMode.I2V,
        duration_seconds=max(1.0, duration),
        aspect_ratio=ar,
        seed=seed,
        first_frame_path=anchor_start_url,
        last_frame_path=anchor_end_url,
    )

    response = await driver.generate(gen_req)

    if response.status == GenerationStatus.FAILED:
        return response.model_dump()

    take_id = f"retake_{str(uuid.uuid4())[:8]}"
    _video_jobs[response.job_id] = {
        "shot_id": shot_id,
        "project_id": project_id,
        "model_id": model_id,
        "take_id": take_id,
        "request": {"prompt": prompt, "seed": seed, "model_id": model_id, "mode": "i2v"},
        "is_retake": True,
        "original_video_path": video_path,
        "start_seconds": start_seconds,
        "end_seconds": end_seconds,
    }

    return {
        **response.model_dump(),
        "take_id": take_id,
        "shot_id": shot_id,
        "is_retake": True,
    }


@router.post("/video/cleanup")
async def cleanup_stale_video_refs(project_id: str):
    """Remove video take references for files that no longer exist on disk.

    For each shot, checks every take's file path. Removes takes whose MP4 is
    missing. If the active video_clip_path points to a missing file, clears it
    and promotes a remaining take (or resets status if none survive).
    """
    shots = _load_shots(project_id)
    cleaned = 0

    for shot in shots:
        takes = shot.get("video_takes", [])
        if not takes:
            continue

        surviving = []
        for take in takes:
            path = take.get("path", "")
            if path and path.startswith("/assets/"):
                local_file = VAULT_DIR / path[len("/assets/"):]
                if local_file.exists():
                    surviving.append(take)
                else:
                    cleaned += 1
                    print(f"[cleanup] removing stale take {take.get('id')} from shot {shot['id']}")
            else:
                surviving.append(take)

        if len(surviving) == len(takes):
            # Check if active video_clip_path still exists
            vcp = shot.get("video_clip_path", "")
            if vcp and vcp.startswith("/assets/"):
                vcp_file = VAULT_DIR / vcp[len("/assets/"):]
                if not vcp_file.exists():
                    shot["video_clip_path"] = None
                    shot["status"] = ShotStatus.PLANNED.value
                    shot["last_frame_path"] = None
                    cleaned += 1
                    print(f"[cleanup] cleared missing video_clip_path for shot {shot['id']}")
            continue

        # Some takes were removed
        if surviving:
            # Ensure one take is selected
            has_selected = any(t.get("selected") for t in surviving)
            if not has_selected:
                surviving[-1]["selected"] = True
            shot["video_takes"] = surviving
            shot["video_clip_path"] = surviving[-1]["path"]
            # Re-extract last frame from new active take
            shot_folder = _shot_dir(project_id, shot["id"])
            last_frame_path = shot_folder / "last_frame.png"
            if _extract_last_frame(surviving[-1]["path"], last_frame_path):
                shot["last_frame_path"] = f"/assets/{project_id}/shots/{shot['id']}/last_frame.png"
            else:
                shot["last_frame_path"] = None
        else:
            # All takes gone
            shot["video_takes"] = []
            shot["video_clip_path"] = None
            shot["last_frame_path"] = None
            shot["status"] = ShotStatus.PLANNED.value

    _save_shots(project_id, shots)
    return {"status": "ok", "cleaned": cleaned}
