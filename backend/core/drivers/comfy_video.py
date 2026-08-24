"""
ComfyUI Video Driver - LTX 2.3 + MiniMax H3

Connects to a local ComfyUI instance for video generation using
LTX Video 2.3 and MiniMax H3 (RH_MinMaxH3 custom nodes).

Supports:
    - LTX 2.3: text-to-video (T2V), image-to-video (I2V, first frame)
    - MiniMax H3 (ComfyUI): T2V, I2V, R2V (subject/scene/style/motion/audio lock)

Requires:
    - ComfyUI running locally
    - LTX Video 2.3 nodes installed
    - ComfyUI_RH_MinMaxH3 custom nodes installed (for minimax_h3)
"""

import asyncio
import json
import uuid
import os
import time
from pathlib import Path
from typing import List, Optional, Dict, Any

import aiohttp

from .base import (
    VideoDriver, VideoGenerationRequest, VideoGenerationResponse,
    GenerationStatus, DriverCategory, DriverInfo, AspectRatio,
    VideoGenerationMode,
)


# Camera movement preset → motion prompt augmentation
# Used by ComfyUI workflows that accept a motion/camera text description.
COMFY_CAMERA_PROMPTS = {
    "static": "static camera, no movement",
    "dolly_in": "slow dolly in toward the subject",
    "dolly_out": "slow dolly out, pulling back from the subject",
    "pan_left": "camera pans left",
    "pan_right": "camera pans right",
    "tilt_up": "camera tilts up",
    "tilt_down": "camera tilts down",
    "crane_up": "crane shot moving up",
    "crane_down": "crane shot moving down",
    "orbit_left": "orbit shot circling left around the subject",
    "orbit_right": "orbit shot circling right around the subject",
    "handheld": "handheld camera, subtle shake",
    "zoom_in": "zoom in",
    "zoom_out": "zoom out",
    "dolly_zoom": "dolly zoom (vertigo effect)",
    "truck_left": "camera trucks left, moving sideways",
    "truck_right": "camera trucks right, moving sideways",
    "pedestal_up": "camera pedestal moves up",
    "pedestal_down": "camera pedestal moves down",
    "arc_left": "arc shot curving left around the subject",
    "arc_right": "arc shot curving right around the subject",
    "shake": "camera shake, chaotic movement",
    "roll": "camera rolls, rotating on its axis",
}


# Per-model capability matrix
MODEL_CAPABILITIES = {
    "ltx_video_2_3": {
        "display_name": "LTX Video 2.3 (ComfyUI)",
        "features": ["text_to_video", "image_to_video", "first_last_frame", "image_audio_to_video"],
        "supports_last_frame": True,
        "supports_reference_images": False,
        "supports_reference_video": False,
        "supports_reference_audio": True,
        "supports_camera_control": True,
        "max_duration": 10.0,
    },
    "wan_video": {
        "display_name": "Wan Video (ComfyUI)",
        "features": ["text_to_video", "image_to_video", "first_last_frame"],
        "supports_last_frame": True,
        "supports_reference_images": False,
        "supports_reference_video": False,
        "supports_reference_audio": False,
        "supports_camera_control": True,
        "max_duration": 10.0,
    },
    "minimax_h3": {
        "display_name": "MiniMax H3 (ComfyUI)",
        "features": ["text_to_video", "image_to_video", "first_last_frame", "reference_to_video", "native_audio"],
        "supports_last_frame": True,
        "supports_reference_images": True,
        "supports_reference_video": True,
        "supports_reference_audio": True,
        "supports_camera_control": True,
        "max_duration": 15.0,
    },
}


class ComfyVideoDriver(VideoDriver):
    """
    Local ComfyUI video generation driver.
    
    Supports LTX Video 2.3 and MiniMax H3 for T2V, I2V, and R2V generation.
    """

    def __init__(
        self,
        comfy_url: Optional[str] = None,
        output_dir: Optional[str] = None,
        model_id: str = "ltx_video_2_3",
    ):
        self.comfy_url = comfy_url or os.getenv("COMFY_URL", "http://127.0.0.1:8188")
        self.output_dir = output_dir or os.getenv("COMFY_OUTPUT_DIR", "")
        self._model_id = model_id
        self._jobs: Dict[str, dict] = {}

    def _load_workflow(self, name: str) -> dict:
        workflow_path = Path(__file__).parent.parent / "workflows" / f"{name}.json"
        if workflow_path.exists():
            with open(workflow_path, "r") as f:
                return json.load(f)
        return {}

    @property
    def driver_id(self) -> str:
        return f"comfy_{self._model_id}"

    @property
    def driver_name(self) -> str:
        caps = MODEL_CAPABILITIES.get(self._model_id, {})
        return caps.get("display_name", f"ComfyUI ({self._model_id})")

    @property
    def category(self) -> DriverCategory:
        return DriverCategory.LOCAL

    @property
    def supported_features(self) -> List[str]:
        caps = MODEL_CAPABILITIES.get(self._model_id, {})
        return caps.get("features", ["text_to_video", "image_to_video"])

    @property
    def max_duration_seconds(self) -> float:
        caps = MODEL_CAPABILITIES.get(self._model_id, {})
        return caps.get("max_duration", 10.0)

    def _resolve_local_path(self, path: str) -> str:
        """Resolve a served asset path (e.g. /assets/...) to a filesystem path
        relative to the Vault, or return as-is if it looks like a ComfyUI input path."""
        if not path:
            return path
        # Already a ComfyUI input filename or absolute path
        if not path.startswith("/assets/"):
            return path
        # /assets/{project_id}/... → backend/assets/{project_id}/...
        vault = Path(__file__).parent.parent.parent / "assets"
        rel = path.replace("/assets/", "", 1)
        local = vault / rel
        if local.exists():
            return local.name
        return path

    def _build_workflow(self, request: VideoGenerationRequest, upload_map: dict = None) -> dict:
        """Build a ComfyUI workflow from the template, injecting all request params."""
        upload_map = upload_map or {}
        # MiniMax H3 uses different workflows + model weights for R2V vs T2V/I2V
        wf_name = self._model_id
        if self._model_id == "minimax_h3" and request.mode == VideoGenerationMode.R2V:
            wf_name = "minimax_h3_r2v"
        # LTX Video 2.3 uses a separate FLF2V workflow when last_frame is provided
        if self._model_id == "ltx_video_2_3" and request.last_frame_path:
            wf_name = "ltx_video_2_3_flf2v"
        # LTX Video 2.3 IA2V mode: image + audio to video
        if self._model_id == "ltx_video_2_3" and request.mode == VideoGenerationMode.IA2V:
            wf_name = "ltx_video_2_3_ia2v"

        workflow = self._load_workflow(wf_name)
        if not workflow:
            return {}

        wf = json.loads(json.dumps(workflow))
        caps = MODEL_CAPABILITIES.get(self._model_id, {})

        # Augment prompt with camera movement description
        effective_prompt = request.prompt
        if request.camera_movement and caps.get("supports_camera_control", False):
            preset = request.camera_movement.get("preset", "static")
            cam_desc = COMFY_CAMERA_PROMPTS.get(preset, "")
            # Append amplitude/speed modifiers if provided
            amplitude = request.camera_movement.get("amplitude")
            speed = request.camera_movement.get("speed")
            if amplitude and amplitude != "medium":
                cam_desc += f" with {amplitude} amplitude"
            if speed and speed != "normal":
                cam_desc += f" at {speed} speed"
            if cam_desc and cam_desc not in effective_prompt:
                effective_prompt = f"{effective_prompt}, {cam_desc}"

        # Track LoadImage node slots we fill
        ref_image_idx = 0

        # Nodes to remove if their reference is not provided (T2V mode)
        nodes_to_remove = set()
        nodes_to_add = {}

        for node_id, node in wf.items():
            if not isinstance(node, dict):
                continue  # skip metadata keys like _comment
            ct = node.get("class_type", "")
            inputs = node.get("inputs", {})

            # --- Prompts (standard CLIPTextEncode nodes) ---
            if ct == "CLIPTextEncode" or ct in ("CLIPTextEncodePositive", "T5TextEncode"):
                text = inputs.get("text", "")
                if "PROMPT_PLACEHOLDER" in text or "__PROMPT__" in text or "{prompt}" in text:
                    inputs["text"] = text.replace("PROMPT_PLACEHOLDER", effective_prompt).replace("__PROMPT__", effective_prompt).replace("{prompt}", effective_prompt)
                if "NEGATIVE_PROMPT_PLACEHOLDER" in text or "__NEGATIVE__" in text:
                    neg = request.negative_prompt or ""
                    inputs["text"] = text.replace("NEGATIVE_PROMPT_PLACEHOLDER", neg).replace("__NEGATIVE__", neg)
            elif ct in ("CLIPTextEncodeNegative", "T5TextEncodeNegative"):
                text = inputs.get("text", "")
                if "NEGATIVE_PROMPT_PLACEHOLDER" in text or "__NEGATIVE__" in text:
                    neg = request.negative_prompt or ""
                    inputs["text"] = text.replace("NEGATIVE_PROMPT_PLACEHOLDER", neg).replace("__NEGATIVE__", neg)

            # --- LTX 2.3 IA2V: prompt in PrimitiveStringMultiline node ---
            if ct == "PrimitiveStringMultiline":
                val = inputs.get("value", "")
                if "PROMPT_PLACEHOLDER" in str(val) or "__PROMPT__" in str(val):
                    inputs["value"] = effective_prompt

            # --- LTX 2.3 IA2V: prompt enhance toggle (PrimitiveBoolean) ---
            if ct == "PrimitiveBoolean":
                meta_title = node.get("_meta", {}).get("title", "")
                if "Prompt Enhance" in meta_title:
                    inputs["value"] = bool(request.extra_params.get("enhance_prompt", False))

            # --- MiniMax H3: prompt is in the MiniMaxH3ImageToVideo node directly ---
            if ct == "MiniMaxH3ImageToVideo":
                prompt_val = inputs.get("prompt", "")
                if "PROMPT_PLACEHOLDER" in str(prompt_val) or "__PROMPT__" in str(prompt_val):
                    inputs["prompt"] = effective_prompt
                # Compute frame count: 24fps, rounded to nearest 17-frame block
                # Formula: max(5, round(duration * 24)) + (5 - (max(5, round(duration * 24)) % 17)) % 17
                raw_frames = max(5, round(request.duration_seconds * 24))
                length = raw_frames + (5 - (raw_frames % 17)) % 17
                inputs["length"] = length
                # Handle conditional last_frame connection
                if not request.last_frame_path:
                    # Disconnect last_frame — set to null for T2V/I2V without end frame
                    inputs["last_frame"] = None
                    nodes_to_remove.add("116")  # Remove the last_frame LoadImage node

            # --- MiniMax H3 R2V: MiniMaxH3ReferenceToVideo node ---
            if ct == "MiniMaxH3ReferenceToVideo":
                # ref_image_size: 'match' (faster) or 'max' (stronger identity)
                if request.extra_params and "ref_image_size" in request.extra_params:
                    inputs["ref_image_size"] = request.extra_params["ref_image_size"]

                # Disconnect reference slots that have no input
                # Reference images: ref_images.ref_image_0, _1, _2 (template has 3 slots, 2 LoadImage nodes)
                ref_img_keys = [k for k in list(inputs.keys()) if k.startswith("ref_images.ref_image_")]
                for idx, rk in enumerate(sorted(ref_img_keys)):
                    if idx < len(request.reference_image_paths):
                        conn = inputs.get(rk)
                        if isinstance(conn, list) and len(conn) == 2:
                            # Template has a LoadImage node connected — fill it
                            load_node_id = str(conn[0])
                            if load_node_id in wf and wf[load_node_id].get("class_type") == "LoadImage":
                                rp = request.reference_image_paths[idx]
                                wf[load_node_id]["inputs"]["image"] = upload_map.get(rp, self._resolve_local_path(rp))
                        elif conn is None:
                            # No LoadImage node in template for this slot — inject one dynamically
                            new_node_id = f"ref_img_{idx}"
                            nodes_to_add[new_node_id] = {
                                "class_type": "LoadImage",
                                "inputs": {
                                    "image": upload_map.get(request.reference_image_paths[idx], self._resolve_local_path(request.reference_image_paths[idx]))
                                }
                            }
                            inputs[rk] = [new_node_id, 0]
                    else:
                        # No reference image for this slot — disconnect and remove LoadImage node
                        conn = inputs.get(rk)
                        inputs[rk] = None
                        if isinstance(conn, list) and len(conn) == 2:
                            nodes_to_remove.add(str(conn[0]))

                # Reference video: ref_videos.ref_video_0 (loaded as IMAGE sequence via VHSLoadVideo)
                ref_vid_keys = [k for k in list(inputs.keys()) if k.startswith("ref_videos.ref_video_")]
                for idx, vk in enumerate(sorted(ref_vid_keys)):
                    if idx == 0 and request.reference_video_path:
                        # Inject a VHSLoadVideo node to load the reference video as image sequence
                        # The ref_videos input type is IMAGE (frame batch), so we use VHSLoadVideo
                        new_node_id = f"ref_vid_{idx}"
                        nodes_to_add[new_node_id] = {
                            "class_type": "VHSLoadVideo",
                            "inputs": {
                                "video": self._resolve_local_path(request.reference_video_path),
                                "force_rate": 0,
                                "frame_load_cap": 0,
                                "skip_first_frames": 0,
                                "select_every_nth": 1,
                                "format": "video",
                            }
                        }
                        inputs[vk] = [new_node_id, 0]
                    else:
                        inputs[vk] = None

                # Reference video audio: ref_video_audios.ref_video_audio_0
                # This is the audio track paired with the reference video
                ref_va_keys = [k for k in list(inputs.keys()) if k.startswith("ref_video_audios.")]
                for idx, vak in enumerate(sorted(ref_va_keys)):
                    if idx == 0 and request.reference_video_path:
                        # VHSLoadVideo also outputs audio on slot 1 — reuse the same node
                        new_node_id = f"ref_vid_{idx}"
                        if new_node_id in nodes_to_add or new_node_id in wf:
                            inputs[vak] = [new_node_id, 1]
                        else:
                            inputs[vak] = None
                    else:
                        inputs[vak] = None

                # Reference audio: ref_audios.ref_audio_0 (standalone audio clip for voice/music lock)
                ref_aud_keys = [k for k in list(inputs.keys()) if k.startswith("ref_audios.ref_audio_")]
                for idx, ak in enumerate(sorted(ref_aud_keys)):
                    if idx == 0 and request.reference_audio_path:
                        # Inject a LoadAudio node for the standalone reference audio
                        new_node_id = f"ref_aud_{idx}"
                        nodes_to_add[new_node_id] = {
                            "class_type": "LoadAudio",
                            "inputs": {
                                "audio": self._resolve_local_path(request.reference_audio_path),
                            }
                        }
                        inputs[ak] = [new_node_id, 0]
                    else:
                        inputs[ak] = None

            # --- PrimitiveStringMultiline: prompt (check both 'string' and 'value' keys) ---
            if ct == "PrimitiveStringMultiline":
                text_val = inputs.get("string", inputs.get("value", ""))
                if "PROMPT_PLACEHOLDER" in str(text_val) or "__PROMPT__" in str(text_val):
                    if "string" in inputs:
                        inputs["string"] = effective_prompt
                    else:
                        inputs["value"] = effective_prompt
                # Ensure required 'value' key is never missing
                if "value" not in inputs and "string" not in inputs:
                    inputs["value"] = ""

            # --- Seed ---
            if ct == "KSampler" or ct in ("KSamplerAdvanced", "LTXVSampler", "MinimaxH3Sampler"):
                if request.seed is not None:
                    inputs["seed"] = request.seed
                else:
                    inputs["seed"] = int(time.time()) % (2**32)

            # --- MiniMax H3: seed is in RandomNoise node ---
            if ct == "RandomNoise":
                if request.seed is not None:
                    inputs["noise_seed"] = request.seed
                else:
                    inputs["noise_seed"] = int(time.time()) % (2**32)

            # --- Duration / frames (standard latent nodes) ---
            if ct in ("EmptyLatentImage", "EmptyHunyuanLatentVideo", "LTXVEmptyLatent", "MinimaxH3EmptyLatent"):
                ar_map = {
                    "16:9": (1280, 720),
                    "9:16": (720, 1280),
                    "1:1": (1024, 1024),
                    "21:9": (1280, 548),
                    "4:3": (1024, 768),
                }
                dims = ar_map.get(request.aspect_ratio.value if request.aspect_ratio else "16:9", (1280, 720))
                inputs["width"] = dims[0]
                inputs["height"] = dims[1]
                fps = inputs.get("frame_rate", 24)
                total_frames = int(request.duration_seconds * fps)
                if "length" in inputs:
                    inputs["length"] = total_frames
                if "num_frames" in inputs:
                    inputs["num_frames"] = total_frames
                if "frames" in inputs:
                    inputs["frames"] = total_frames

            # --- MiniMax H3: duration via PrimitiveFloat → ComfyMathExpression → length ---
            if ct == "PrimitiveFloat":
                # The PrimitiveFloat node feeds duration in seconds to the math expression
                # which converts to frame count (17-frame block grid at 24fps)
                inputs["value"] = request.duration_seconds

            # --- Resolution / aspect ratio selector ---
            if ct == "ResolutionSelector":
                ar_to_resolution = {
                    "16:9": "16:9 (Widescreen)",
                    "9:16": "9:16 (Portrait Widescreen)",
                    "1:1": "1:1 (Square)",
                    "4:3": "4:3 (Standard)",
                    "21:9": "21:9 (Ultrawide)",
                }
                ar_val = request.aspect_ratio.value if request.aspect_ratio else "16:9"
                # Always override — template may have hardcoded defaults
                # Both aspect_ratio and resolution use the same formatted label
                formatted = ar_to_resolution.get(ar_val, "16:9 (Widescreen)")
                inputs["aspect_ratio"] = formatted
                inputs["resolution"] = formatted

            # --- LTX 2.3 FLF2V: seed via RandomNoise ---
            if ct == "RandomNoise":
                if request.seed is not None:
                    inputs["noise_seed"] = request.seed

            # --- LTX 2.3 FLF2V: duration via PrimitiveInt (node title "Duration") ---
            if ct == "PrimitiveInt":
                meta_title = node.get("_meta", {}).get("title", "")
                if "Duration" in meta_title:
                    inputs["value"] = int(request.duration_seconds)

            # --- LTX 2.3 FLF2V: width/height via PrimitiveInt (titled Width/Height) ---
            if ct == "PrimitiveInt":
                meta_title = node.get("_meta", {}).get("title", "")
                if "Width" in meta_title or "width" in meta_title:
                    ar_map_ltx = {
                        "16:9": (1280, 720), "9:16": (720, 1280),
                        "1:1": (960, 960), "4:3": (1024, 768), "21:9": (1280, 548),
                    }
                    dims = ar_map_ltx.get(request.aspect_ratio.value if request.aspect_ratio else "16:9", (1280, 720))
                    inputs["value"] = dims[0]
                elif "Height" in meta_title or "height" in meta_title:
                    ar_map_ltx = {
                        "16:9": (1280, 720), "9:16": (720, 1280),
                        "1:1": (960, 960), "4:3": (1024, 768), "21:9": (1280, 548),
                    }
                    dims = ar_map_ltx.get(request.aspect_ratio.value if request.aspect_ratio else "16:9", (1280, 720))
                    inputs["value"] = dims[1]

            # --- First frame (I2V / R2V) ---
            if ct == "LoadImage":
                img_val = inputs.get("image", "")
                if "FIRST_FRAME_PLACEHOLDER" in str(img_val) or "SOURCE_IMAGE_PLACEHOLDER" in str(img_val):
                    if request.first_frame_path:
                        inputs["image"] = upload_map.get(request.first_frame_path, self._resolve_local_path(request.first_frame_path))
                    else:
                        # T2V mode — no first frame, disconnect and mark for removal
                        nodes_to_remove.add(node_id)
                elif "LAST_FRAME_PLACEHOLDER" in str(img_val):
                    if request.last_frame_path:
                        inputs["image"] = upload_map.get(request.last_frame_path, self._resolve_local_path(request.last_frame_path))
                    else:
                        nodes_to_remove.add(node_id)
                elif "REF_IMAGE_PLACEHOLDER" in str(img_val) or "SUBJECT_IMAGE_PLACEHOLDER" in str(img_val):
                    if ref_image_idx < len(request.reference_image_paths):
                        rp = request.reference_image_paths[ref_image_idx]
                        inputs["image"] = upload_map.get(rp, self._resolve_local_path(rp))
                        ref_image_idx += 1
                    else:
                        nodes_to_remove.add(node_id)
                elif "REF_IMAGE_" in str(img_val) and "PLACEHOLDER" in str(img_val):
                    # MiniMax H3 R2V: REF_IMAGE_0_PLACEHOLDER, REF_IMAGE_1_PLACEHOLDER, etc.
                    # Extract index from placeholder
                    try:
                        idx = int(str(img_val).split("REF_IMAGE_")[1].split("_")[0])
                    except (ValueError, IndexError):
                        idx = ref_image_idx
                    if idx < len(request.reference_image_paths):
                        rp = request.reference_image_paths[idx]
                        inputs["image"] = upload_map.get(rp, self._resolve_local_path(rp))
                    else:
                        nodes_to_remove.add(node_id)
                elif "SCENE_IMAGE_PLACEHOLDER" in str(img_val):
                    if ref_image_idx < len(request.reference_image_paths):
                        rp = request.reference_image_paths[ref_image_idx]
                        inputs["image"] = upload_map.get(rp, self._resolve_local_path(rp))
                        ref_image_idx += 1
                    else:
                        nodes_to_remove.add(node_id)

            # --- MiniMax H3: disconnect first_frame if no first frame provided ---
            if ct == "MiniMaxH3ImageToVideo" and not request.first_frame_path:
                inputs["first_frame"] = None
                nodes_to_remove.add("114")  # Remove the first_frame LoadImage node

            # --- Reference video (motion lock) ---
            if ct in ("LoadVideo", "LoadVideoUpload", "VHSLoadVideo"):
                vid_val = inputs.get("video", "")
                if "REF_VIDEO_PLACEHOLDER" in str(vid_val) or "MOTION_VIDEO_PLACEHOLDER" in str(vid_val):
                    if request.reference_video_path:
                        inputs["video"] = self._resolve_local_path(request.reference_video_path)

            # --- CreateVideo: ensure fps is always set ---
            if ct == "CreateVideo":
                if not inputs.get("fps") or inputs["fps"] is None:
                    # Try to get fps from connected frame rate node, default to 24
                    fps_val = inputs.get("fps")
                    if isinstance(fps_val, list):
                        # fps is a node connection — leave it, it should resolve at runtime
                        pass
                    else:
                        inputs["fps"] = 24

            # --- Reference audio (voice lock) ---
            if ct in ("LoadAudio", "LoadAudioUpload", "MinimaxH3LoadAudio"):
                aud_val = inputs.get("audio", "")
                if "REF_AUDIO_PLACEHOLDER" in str(aud_val) or "VOICE_AUDIO_PLACEHOLDER" in str(aud_val):
                    if request.reference_audio_path:
                        inputs["audio"] = self._resolve_local_path(request.reference_audio_path)

        # Add dynamically injected nodes (e.g. extra LoadImage nodes for 3rd+ ref images)
        wf.update(nodes_to_add)

        # Remove unused nodes (e.g. LoadImage nodes for references not provided)
        for nid in nodes_to_remove:
            wf.pop(nid, None)

        return wf

    async def _upload_to_comfy(self, session: aiohttp.ClientSession, local_path: str) -> str:
        """Upload a file to ComfyUI's input directory and return the filename."""
        import os
        filename = os.path.basename(local_path)
        data = aiohttp.FormData()
        data.add_field("image", open(local_path, "rb"), filename=filename)
        async with session.post(f"{self.comfy_url}/upload/image", data=data) as resp:
            if resp.status == 200:
                result = await resp.json()
                return result.get("name", filename)
            return filename

    def _resolve_and_upload_paths(self, request: VideoGenerationRequest) -> dict:
        """Pre-resolve all image paths to local filesystem paths for later upload.
        Returns a dict mapping original paths to local absolute paths."""
        paths_to_upload = {}
        if request.first_frame_path:
            local = self._resolve_to_local_abs(request.first_frame_path)
            if local:
                paths_to_upload[request.first_frame_path] = local
        if request.last_frame_path:
            local = self._resolve_to_local_abs(request.last_frame_path)
            if local:
                paths_to_upload[request.last_frame_path] = local
        for ref in request.reference_image_paths:
            local = self._resolve_to_local_abs(ref)
            if local:
                paths_to_upload[ref] = local
        return paths_to_upload

    def _resolve_to_local_abs(self, path: str) -> Optional[str]:
        """Resolve a served asset path to an absolute filesystem path."""
        if not path or not path.startswith("/assets/"):
            return None
        vault = Path(__file__).parent.parent.parent / "assets"
        rel = path.replace("/assets/", "", 1)
        local = vault / rel
        if local.exists():
            return str(local)
        return None

    async def generate(self, request: VideoGenerationRequest) -> VideoGenerationResponse:
        job_id = str(uuid.uuid4())

        # Upload images to ComfyUI before building the workflow
        upload_map = {}  # original_path -> comfy_filename
        paths_to_upload = self._resolve_and_upload_paths(request)
        if paths_to_upload:
            async with aiohttp.ClientSession() as session:
                for orig_path, local_abs in paths_to_upload.items():
                    try:
                        comfy_name = await self._upload_to_comfy(session, local_abs)
                        upload_map[orig_path] = comfy_name
                        print(f"[ComfyVideoDriver] uploaded {orig_path} -> {comfy_name}")
                    except Exception as e:
                        print(f"[ComfyVideoDriver] upload failed for {orig_path}: {e}")

        # Build workflow with uploaded filenames
        workflow = self._build_workflow(request, upload_map)

        if not workflow:
            return VideoGenerationResponse(
                job_id=job_id,
                status=GenerationStatus.FAILED,
                error_message=f"Workflow template '{self._model_id}' not found or empty",
            )

        self._jobs[job_id] = {
            "workflow": workflow,
            "status": GenerationStatus.PENDING,
            "prompt_id": None,
            "created_at": time.time(),
            "output_videos": [],
            "request": request.model_dump(),
        }

        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    f"{self.comfy_url}/prompt",
                    json={"prompt": workflow},
                ) as resp:
                    if resp.status != 200:
                        error_text = await resp.text()
                        self._jobs[job_id]["status"] = GenerationStatus.FAILED
                        return VideoGenerationResponse(
                            job_id=job_id,
                            status=GenerationStatus.FAILED,
                            error_message=f"ComfyUI error: {error_text}",
                        )
                    result = await resp.json()
                    prompt_id = result.get("prompt_id")
                    self._jobs[job_id]["prompt_id"] = prompt_id
                    self._jobs[job_id]["status"] = GenerationStatus.PROCESSING
        except Exception as e:
            self._jobs[job_id]["status"] = GenerationStatus.FAILED
            return VideoGenerationResponse(
                job_id=job_id,
                status=GenerationStatus.FAILED,
                error_message=f"Failed to connect to ComfyUI: {str(e)}",
            )

        return VideoGenerationResponse(
            job_id=job_id,
            status=GenerationStatus.PROCESSING,
            metadata={"prompt_id": self._jobs[job_id]["prompt_id"], "workflow": self._model_id},
        )

    async def check_status(self, job_id: str) -> VideoGenerationResponse:
        job = self._jobs.get(job_id)
        if not job:
            return VideoGenerationResponse(
                job_id=job_id,
                status=GenerationStatus.FAILED,
                error_message="Job not found",
            )

        if job["status"] in (GenerationStatus.COMPLETED, GenerationStatus.FAILED):
            return VideoGenerationResponse(
                job_id=job_id,
                status=job["status"],
                video_url=job.get("output_videos", [None])[0] if job.get("output_videos") else None,
                error_message=job.get("error_message"),
            )

        prompt_id = job.get("prompt_id")
        if not prompt_id:
            return VideoGenerationResponse(
                job_id=job_id,
                status=GenerationStatus.PENDING,
            )

        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(
                    f"{self.comfy_url}/history/{prompt_id}"
                ) as resp:
                    if resp.status == 200:
                        history = await resp.json()
                        if prompt_id in history:
                            outputs = history[prompt_id].get("outputs", {})
                            video_urls = []
                            for node_id, node_output in outputs.items():
                                print(f"[comfy_video] node {node_id} output keys: {list(node_output.keys())}")
                                if "gifs" in node_output:
                                    for vid in node_output["gifs"]:
                                        filename = vid["filename"]
                                        subfolder = vid.get("subfolder", "")
                                        vid_url = f"{self.comfy_url}/view?filename={filename}&subfolder={subfolder}&type=output"
                                        video_urls.append(vid_url)
                                if "videos" in node_output:
                                    for vid in node_output["videos"]:
                                        filename = vid["filename"]
                                        subfolder = vid.get("subfolder", "")
                                        vid_url = f"{self.comfy_url}/view?filename={filename}&subfolder={subfolder}&type=output"
                                        video_urls.append(vid_url)
                                if "images" in node_output:
                                    for img in node_output["images"]:
                                        filename = img["filename"]
                                        subfolder = img.get("subfolder", "")
                                        img_type = img.get("type", "output")
                                        if filename.endswith((".mp4", ".webm", ".mkv", ".gif")):
                                            vid_url = f"{self.comfy_url}/view?filename={filename}&subfolder={subfolder}&type={img_type}"
                                            video_urls.append(vid_url)
                            if video_urls:
                                job["status"] = GenerationStatus.COMPLETED
                                job["output_videos"] = video_urls
                                return VideoGenerationResponse(
                                    job_id=job_id,
                                    status=GenerationStatus.COMPLETED,
                                    video_url=video_urls[0],
                                )
                            else:
                                print(f"[comfy_video] no video URLs found in outputs: {outputs}")
        except Exception as e:
            job["status"] = GenerationStatus.FAILED
            job["error_message"] = str(e)
            return VideoGenerationResponse(
                job_id=job_id,
                status=GenerationStatus.FAILED,
                error_message=str(e),
            )

        return VideoGenerationResponse(
            job_id=job_id,
            status=GenerationStatus.PROCESSING,
        )

    async def download(self, job_id: str, output_dir: str) -> str:
        job = self._jobs.get(job_id)
        if not job or job["status"] != GenerationStatus.COMPLETED:
            raise ValueError("Job not completed or not found")
        
        video_urls = job.get("output_videos", [])
        if not video_urls:
            raise ValueError("No video output found")

        Path(output_dir).mkdir(parents=True, exist_ok=True)
        filename = f"{job_id}.mp4"
        output_path = Path(output_dir) / filename

        async with aiohttp.ClientSession() as session:
            async with session.get(video_urls[0]) as resp:
                if resp.status == 200:
                    with open(output_path, "wb") as f:
                        f.write(await resp.read())
                    return str(output_path)
        raise IOError("Failed to download video")

    def get_info(self) -> DriverInfo:
        return DriverInfo(
            driver_id=self.driver_id,
            display_name=self.driver_name,
            category=self.category,
            supported_features=self.supported_features,
            max_duration_seconds=self.max_duration_seconds,
            requires_api_key=False,
        )
