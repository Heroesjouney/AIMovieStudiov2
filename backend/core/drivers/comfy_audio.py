"""
ComfyUI Audio Driver - Music generation via ComfyUI workflows.

Connects to a local ComfyUI instance for audio generation using
workflow JSON templates (e.g. MiniMax Music 3).

Requires:
    - ComfyUI running locally (default: http://127.0.0.1:8188)
    - Audio models installed in ComfyUI/models/
"""

import asyncio
import json
import uuid
import os
import time
import random
from pathlib import Path
from typing import List, Optional, Dict, Any

import aiohttp

from .base import (
    AudioDriver, AudioGenerationRequest, AudioGenerationResponse,
    GenerationStatus, DriverCategory, DriverInfo,
)


class ComfyAudioDriver(AudioDriver):
    """
    Local ComfyUI audio generation driver.

    Supports music generation via ComfyUI workflows.
    Workflow JSON templates are loaded from core/workflows/.
    """

    MODEL_INFO = {
        "comfy_audio": {
            "name": "ComfyUI Audio (Music)",
            "workflow": "minimax_music3",
            "kind": "music",
        },
        "minimax_music3": {
            "name": "MiniMax Music 3 (ComfyUI)",
            "workflow": "minimax_music3",
            "kind": "music",
        },
        "chatterbox_tts": {
            "name": "Chatterbox TTS (ComfyUI)",
            "workflow": "chatterbox_tts",
            "kind": "tts",
        },
        "hunyuan_foley": {
            "name": "HunyuanVideo Foley (ComfyUI)",
            "workflow": "hunyuan_foley",
            "kind": "foley",
        },
    }

    def __init__(
        self,
        model_id: str = "comfy_audio",
        comfy_url: Optional[str] = None,
    ):
        self._model_id = model_id
        info = self.MODEL_INFO.get(model_id, self.MODEL_INFO["comfy_audio"])
        self._model_name = info["name"]
        self._workflow_name = info["workflow"]
        self._model_kind = info.get("kind", "music")
        self.comfy_url = comfy_url or os.getenv("COMFY_URL", "http://127.0.0.1:8188")
        self._auth_token = os.getenv("COMFY_AUTH_TOKEN", "")
        self._jobs: Dict[str, dict] = {}
        self._workflows: Dict[str, dict] = {}

    # --- AudioDriver abstract properties ---

    @property
    def driver_id(self) -> str:
        return self._model_id

    @property
    def driver_name(self) -> str:
        return self._model_name

    @property
    def category(self) -> DriverCategory:
        return DriverCategory.LOCAL

    @property
    def supports_voice_cloning(self) -> bool:
        return self._model_kind == "tts"

    @property
    def supported_languages(self) -> List[str]:
        return ["en", "zh", "ja", "ko"]

    # --- Session / workflow loading ---

    def _get_session(self) -> aiohttp.ClientSession:
        headers = {}
        if self._auth_token:
            headers["Authorization"] = f"Bearer {self._auth_token}"
        return aiohttp.ClientSession(headers=headers)

    def _load_workflow(self, name: str) -> dict:
        if name in self._workflows:
            return self._workflows[name]
        workflow_path = Path(__file__).parent.parent / "workflows" / f"{name}.json"
        if workflow_path.exists():
            with open(workflow_path, "r", encoding="utf-8") as f:
                wf = json.load(f)
                self._workflows[name] = wf
                return wf
        return {}

    async def _upload_audio_to_comfy(self, session: aiohttp.ClientSession, audio_path: str) -> str:
        """Upload an audio file to ComfyUI's /upload endpoint so LoadAudio can access it."""
        filename = Path(audio_path).name
        with open(audio_path, "rb") as f:
            data = aiohttp.FormData()
            data.add_field("image", f, filename=filename)
            async with session.post(f"{self.comfy_url}/upload/image", data=data) as resp:
                if resp.status == 200:
                    result = await resp.json()
                    return result.get("name", filename)
        return filename

    # --- Parameter injection ---

    def _inject_params(
        self,
        workflow: dict,
        request: AudioGenerationRequest,
        comfy_reference_filename: Optional[str] = None,
    ) -> dict:
        """Inject generation parameters into the workflow JSON.

        Handles three workflow patterns:
        - MiniMax Music 3: class_type-based injection (MiniMaxMusic3TextEncode, SeedNode, KSampler, SaveAudioAdvanced)
        - Chatterbox TTS: pattern-based injection (UNKNOWN fields, LoadAudio, SaveAudioMP3)
        - HunyuanVideo Foley: VHS_LoadVideoPath, HunyuanFoleySampler, PreviewAudio
        """
        wf = json.loads(json.dumps(workflow))  # deep copy

        seed = request.seed if request.seed is not None else random.randint(0, 2**32 - 1)
        clip_name = (request.clip_name or f"audio_{uuid.uuid4().hex[:8]}").replace(" ", "_")

        for node_id, node in wf.items():
            class_type = node.get("class_type", "")
            inputs = node.get("inputs", {})

            # --- MiniMax Music 3 nodes ---
            if class_type == "MiniMaxMusic3TextEncode":
                inputs["caption"] = request.text
                if request.lyrics is not None:
                    inputs["lyrics"] = request.lyrics
                if request.duration_seconds is not None:
                    inputs["max_duration"] = int(request.duration_seconds)
                if request.cfg is not None:
                    inputs["cfg_scale"] = request.cfg

            elif class_type == "SeedNode":
                inputs["seed"] = seed

            elif class_type == "KSampler":
                if request.steps is not None:
                    inputs["steps"] = request.steps
                if request.cfg is not None:
                    inputs["cfg"] = request.cfg

            elif class_type == "SaveAudioAdvanced":
                inputs["filename_prefix"] = f"audio/{clip_name}"

            # --- Chatterbox TTS nodes ---
            elif class_type == "SaveAudioMP3":
                inputs["filename_prefix"] = f"audio/{clip_name}"

            elif class_type == "LoadAudio":
                # Inject the uploaded reference audio filename
                if comfy_reference_filename:
                    inputs["audio"] = comfy_reference_filename

            # --- HunyuanVideo Foley nodes ---
            elif class_type == "VHS_LoadVideoPath":
                if request.video_path:
                    inputs["video"] = request.video_path

            elif class_type == "HunyuanFoleySampler":
                inputs["prompt"] = request.text
                if request.negative_prompt is not None:
                    inputs["negative_prompt"] = request.negative_prompt
                if request.duration_seconds is not None:
                    inputs["duration"] = int(request.duration_seconds)
                if request.cfg is not None:
                    inputs["cfg_scale"] = request.cfg
                if request.steps is not None:
                    inputs["steps"] = request.steps
                inputs["seed"] = seed

            # --- Chatterbox TTS node (no class_type, has UNKNOWN fields) ---
            elif not class_type and "UNKNOWN" in inputs:
                # This is the Chatterbox TTS node
                inputs["UNKNOWN"] = request.text
                if "UNKNOWN_4" in inputs:
                    inputs["UNKNOWN_4"] = seed
                if "UNKNOWN_5" in inputs:
                    inputs["UNKNOWN_5"] = "fixed"  # don't randomize seed

        return wf

    # --- AudioDriver methods ---

    async def generate_speech(self, request: AudioGenerationRequest) -> AudioGenerationResponse:
        """Submit an audio generation job to ComfyUI.

        For music drivers, 'text' is the music caption/prompt.
        For TTS drivers, 'text' is the dialogue to synthesize, and
        'reference_audio_path' is the voice cloning reference.
        """
        job_id = str(uuid.uuid4())

        workflow_name = self._workflow_name
        print(f"[ComfyAudioDriver] starting job={job_id}, workflow={workflow_name}, kind={self._model_kind}")

        workflow = self._load_workflow(workflow_name)
        if not workflow:
            return AudioGenerationResponse(
                job_id=job_id,
                status=GenerationStatus.FAILED,
                error_message=f"Workflow template '{workflow_name}' not found",
            )

        # For TTS with voice cloning, upload the reference audio to ComfyUI first
        comfy_reference_filename = None
        if self._model_kind == "tts" and request.reference_audio_path:
            ref_path = Path(request.reference_audio_path)
            if ref_path.exists():
                try:
                    async with self._get_session() as session:
                        comfy_reference_filename = await self._upload_audio_to_comfy(session, str(ref_path))
                        print(f"[ComfyAudioDriver] uploaded reference audio: {comfy_reference_filename}")
                except Exception as e:
                    print(f"[ComfyAudioDriver] WARNING: failed to upload reference audio: {e}")
                    # Continue without reference — some TTS nodes can work without it

        wf = self._inject_params(workflow, request, comfy_reference_filename=comfy_reference_filename)

        self._jobs[job_id] = {
            "workflow": wf,
            "status": GenerationStatus.PENDING,
            "prompt_id": None,
            "created_at": time.time(),
            "output_audio": None,
        }

        try:
            async with self._get_session() as session:
                async with session.post(
                    f"{self.comfy_url}/prompt",
                    json={"prompt": wf},
                ) as resp:
                    if resp.status != 200:
                        error_text = await resp.text()
                        self._jobs[job_id]["status"] = GenerationStatus.FAILED
                        return AudioGenerationResponse(
                            job_id=job_id,
                            status=GenerationStatus.FAILED,
                            error_message=f"ComfyUI error: {error_text}",
                        )
                    result = await resp.json()
                    prompt_id = result.get("prompt_id")
                    self._jobs[job_id]["prompt_id"] = prompt_id
                    self._jobs[job_id]["status"] = GenerationStatus.PROCESSING
                    print(f"[ComfyAudioDriver] submitted prompt_id={prompt_id}")
        except Exception as e:
            self._jobs[job_id]["status"] = GenerationStatus.FAILED
            return AudioGenerationResponse(
                job_id=job_id,
                status=GenerationStatus.FAILED,
                error_message=f"Failed to connect to ComfyUI: {str(e)}",
            )

        return AudioGenerationResponse(
            job_id=job_id,
            status=GenerationStatus.PROCESSING,
            metadata={"prompt_id": prompt_id, "workflow": workflow_name},
        )

    async def check_status(self, job_id: str) -> AudioGenerationResponse:
        """Poll ComfyUI for job completion and download audio output."""
        job = self._jobs.get(job_id)
        if not job:
            return AudioGenerationResponse(
                job_id=job_id,
                status=GenerationStatus.FAILED,
                error_message="Job not found",
            )

        if job["status"] in (GenerationStatus.COMPLETED, GenerationStatus.FAILED):
            return AudioGenerationResponse(
                job_id=job_id,
                status=job["status"],
                audio_url=job.get("output_audio"),
                error_message=job.get("error_message"),
            )

        prompt_id = job.get("prompt_id")
        if not prompt_id:
            return AudioGenerationResponse(
                job_id=job_id,
                status=GenerationStatus.PENDING,
            )

        # Timeout: 10 minutes
        elapsed = time.time() - job.get("created_at", time.time())
        if elapsed > 600:
            job["status"] = GenerationStatus.FAILED
            job["error_message"] = "Audio generation timed out (10 min)"
            return AudioGenerationResponse(
                job_id=job_id,
                status=GenerationStatus.FAILED,
                error_message=job["error_message"],
            )

        try:
            async with self._get_session() as session:
                async with session.get(
                    f"{self.comfy_url}/history/{prompt_id}"
                ) as resp:
                    if resp.status == 200:
                        history = await resp.json()
                        if prompt_id in history:
                            outputs = history[prompt_id].get("outputs", {})
                            # ComfyUI audio nodes output under "audio" or "gifs" key
                            for node_id, node_output in outputs.items():
                                # Audio output (SaveAudioAdvanced, SaveAudio, etc.)
                                if "audio" in node_output:
                                    for audio_info in node_output["audio"]:
                                        filename = audio_info["filename"]
                                        subfolder = audio_info.get("subfolder", "")
                                        file_type = audio_info.get("type", "output")

                                        # Download from ComfyUI
                                        view_url = (
                                            f"{self.comfy_url}/view?"
                                            f"filename={filename}&subfolder={subfolder}&type={file_type}"
                                        )
                                        async with session.get(view_url) as audio_resp:
                                            if audio_resp.status == 200:
                                                audio_data = await audio_resp.read()
                                                # Return as a data URL or save to temp
                                                # The routes_audio.py /job endpoint handles
                                                # downloading to the vault
                                                # Return the ComfyUI view URL
                                                comfy_url = view_url
                                                job["output_audio"] = comfy_url
                                                job["status"] = GenerationStatus.COMPLETED
                                                print(f"[ComfyAudioDriver] audio completed: {filename}")
                                                return AudioGenerationResponse(
                                                    job_id=job_id,
                                                    status=GenerationStatus.COMPLETED,
                                                    audio_url=comfy_url,
                                                    metadata={"filename": filename},
                                                )

                            # Check for execution error
                            status_info = history[prompt_id].get("status", {})
                            if status_info.get("status_str") == "error":
                                error_msg = status_info.get("messages", ["Execution error"])[-1]
                                job["status"] = GenerationStatus.FAILED
                                job["error_message"] = str(error_msg)
                                return AudioGenerationResponse(
                                    job_id=job_id,
                                    status=GenerationStatus.FAILED,
                                    error_message=str(error_msg),
                                )
        except Exception as e:
            job["status"] = GenerationStatus.FAILED
            job["error_message"] = str(e)
            return AudioGenerationResponse(
                job_id=job_id,
                status=GenerationStatus.FAILED,
                error_message=str(e),
            )

        return AudioGenerationResponse(
            job_id=job_id,
            status=GenerationStatus.PROCESSING,
        )

    def get_info(self) -> DriverInfo:
        if self._model_kind == "music":
            features = ["music"]
        elif self._model_kind == "tts":
            features = ["tts"]
            if self.supports_voice_cloning:
                features.append("voice_cloning")
        else:  # foley
            features = ["foley"]
        return DriverInfo(
            driver_id=self.driver_id,
            display_name=self.driver_name,
            category=self.category,
            supported_features=features,
        )
