"""
ComfyUI 3D Camera Driver - Multi-angle generation via depth-based 3D reconstruction

Uses ComfyUI's 3D Camera Node to generate multiple camera angles from a single
reference frame. The workflow:
1. Extract depth map from the source image (Depth Anything)
2. Reconstruct a pseudo-3D point cloud
3. Render from new camera positions (X, Y, Z, pan, tilt, FOV)
4. Output variation images representing different viewpoints

This is the core differentiator for AI Movie Studio 2 vs Higgsfield.
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
    ImageDriver, ImageGenerationRequest, ImageGenerationResponse,
    GenerationStatus, DriverCategory, DriverInfo,
)
from core.schemas.camera import CameraParams, CameraAnglePreset, MultiAngleRequest


# Angle preset → camera parameter mappings
ANGLE_PRESET_PARAMS = {
    CameraAnglePreset.FRONT: {"position_x": 0, "position_y": 0, "position_z": 5, "rotation_x": 0, "rotation_y": 0},
    CameraAnglePreset.THREE_QUARTER_LEFT: {"position_x": -2, "position_y": 0.5, "position_z": 4, "rotation_x": 0, "rotation_y": -25},
    CameraAnglePreset.THREE_QUARTER_RIGHT: {"position_x": 2, "position_y": 0.5, "position_z": 4, "rotation_x": 0, "rotation_y": 25},
    CameraAnglePreset.SIDE_LEFT: {"position_x": -4, "position_y": 0, "position_z": 3, "rotation_x": 0, "rotation_y": -90},
    CameraAnglePreset.SIDE_RIGHT: {"position_x": 4, "position_y": 0, "position_z": 3, "rotation_x": 0, "rotation_y": 90},
    CameraAnglePreset.OVERHEAD: {"position_x": 0, "position_y": 6, "position_z": 2, "rotation_x": -60, "rotation_y": 0},
    CameraAnglePreset.LOW_ANGLE: {"position_x": 0, "position_y": -2, "position_z": 4, "rotation_x": 25, "rotation_y": 0},
    CameraAnglePreset.HIGH_ANGLE: {"position_x": 0, "position_y": 4, "position_z": 4, "rotation_x": -25, "rotation_y": 0},
    CameraAnglePreset.BACK: {"position_x": 0, "position_y": 0, "position_z": -5, "rotation_x": 0, "rotation_y": 180},
    CameraAnglePreset.DUTCH_TILT: {"position_x": 1, "position_y": 1, "position_z": 4, "rotation_x": 0, "rotation_y": 15, "rotation_z": 15},
}


class ComfyCameraDriver(ImageDriver):
    """
    ComfyUI 3D Camera driver for multi-angle generation.
    
    Takes a source image, generates a depth map, and renders new viewpoints
    using ComfyUI's 3D camera node workflow.
    """

    def __init__(
        self,
        comfy_url: Optional[str] = None,
        output_dir: Optional[str] = None,
    ):
        self.comfy_url = comfy_url or os.getenv("COMFY_URL", "http://127.0.0.1:8188")
        self.output_dir = output_dir or os.getenv("COMFY_OUTPUT_DIR", "")
        self._jobs: Dict[str, dict] = {}

    def _load_workflow(self) -> dict:
        workflow_path = Path(__file__).parent.parent / "workflows" / "3d_camera_multiview.json"
        if workflow_path.exists():
            with open(workflow_path, "r") as f:
                return json.load(f)
        return {}

    def _build_angle_workflow(
        self,
        source_image_path: str,
        camera_params: CameraParams,
        width: int = 1024,
        height: int = 1024,
        seed: Optional[int] = None,
    ) -> dict:
        """Build a ComfyUI workflow for a single angle generation."""
        workflow = self._load_workflow()
        if not workflow:
            return {}

        wf = json.loads(json.dumps(workflow))

        for node_id, node in wf.items():
            class_type = node.get("class_type", "")

            if class_type == "LoadImage" and "SOURCE_IMAGE_PLACEHOLDER" in str(node.get("inputs", {})):
                node["inputs"]["image"] = source_image_path

            if class_type == "3DCameraNode" or class_type == "Camera3D":
                inputs = node.get("inputs", {})
                inputs["x"] = camera_params.position_x
                inputs["y"] = camera_params.position_y
                inputs["z"] = camera_params.position_z
                inputs["pan"] = camera_params.rotation_y
                inputs["tilt"] = camera_params.rotation_x
                inputs["roll"] = camera_params.rotation_z
                inputs["fov"] = camera_params.fov

            if class_type == "EmptyLatentImage":
                node["inputs"]["width"] = width
                node["inputs"]["height"] = height

            if class_type == "KSampler" and seed is not None:
                node["inputs"]["seed"] = seed

        return wf

    @property
    def driver_id(self) -> str:
        return "comfy_3d_camera"

    @property
    def driver_name(self) -> str:
        return "3D Camera Director (ComfyUI)"

    @property
    def category(self) -> DriverCategory:
        return DriverCategory.LOCAL

    @property
    def supported_features(self) -> List[str]:
        return ["multi_angle", "depth_extraction", "camera_control"]

    async def generate(self, request: ImageGenerationRequest) -> ImageGenerationResponse:
        """Standard image generation (not used for camera — use generate_angles instead)."""
        return await self._submit_workflow(request.prompt, request.reference_image_paths, request.width, request.height, request.seed)

    async def generate_angles(self, req: MultiAngleRequest) -> ImageGenerationResponse:
        """
        Generate multiple camera angles from a source image.
        
        For each angle preset, builds a workflow with the corresponding camera params
        and submits to ComfyUI. Returns a parent job_id that tracks all sub-jobs.
        """
        job_id = str(uuid.uuid4())
        sub_jobs = []

        for angle in req.angles:
            params_dict = ANGLE_PRESET_PARAMS.get(angle, {})
            camera_params = CameraParams(
                position_x=params_dict.get("position_x", 0),
                position_y=params_dict.get("position_y", 0),
                position_z=params_dict.get("position_z", 5),
                rotation_x=params_dict.get("rotation_x", 0),
                rotation_y=params_dict.get("rotation_y", 0),
                rotation_z=params_dict.get("rotation_z", 0),
            )

            wf = self._build_angle_workflow(
                source_image_path=req.source_image_path,
                camera_params=camera_params,
                width=req.width,
                height=req.height,
                seed=req.seed,
            )

            if not wf:
                continue

            sub_job_id = str(uuid.uuid4())
            try:
                async with aiohttp.ClientSession() as session:
                    async with session.post(
                        f"{self.comfy_url}/prompt",
                        json={"prompt": wf},
                    ) as resp:
                        if resp.status == 200:
                            result = await resp.json()
                            prompt_id = result.get("prompt_id")
                            self._jobs[sub_job_id] = {
                                "prompt_id": prompt_id,
                                "status": GenerationStatus.PROCESSING,
                                "angle": angle.value,
                                "output_images": [],
                            }
                            sub_jobs.append({"sub_job_id": sub_job_id, "angle": angle.value})
                        else:
                            self._jobs[sub_job_id] = {
                                "status": GenerationStatus.FAILED,
                                "angle": angle.value,
                                "error_message": f"ComfyUI error: {await resp.text()}",
                            }
            except Exception as e:
                self._jobs[sub_job_id] = {
                    "status": GenerationStatus.FAILED,
                    "angle": angle.value,
                    "error_message": str(e),
                }

        self._jobs[job_id] = {
            "status": GenerationStatus.PROCESSING,
            "sub_jobs": sub_jobs,
            "is_parent": True,
        }

        return ImageGenerationResponse(
            job_id=job_id,
            status=GenerationStatus.PROCESSING,
            metadata={"sub_jobs": sub_jobs, "angles": [a.value for a in req.angles]},
        )

    async def _submit_workflow(
        self, prompt: str, ref_paths: List[str], width: int, height: int, seed: Optional[int]
    ) -> ImageGenerationResponse:
        """Submit a single workflow to ComfyUI."""
        job_id = str(uuid.uuid4())
        workflow = self._load_workflow()
        if not workflow:
            return ImageGenerationResponse(
                job_id=job_id,
                status=GenerationStatus.FAILED,
                error_message="3D camera workflow template not found",
            )

        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    f"{self.comfy_url}/prompt",
                    json={"prompt": workflow},
                ) as resp:
                    if resp.status != 200:
                        return ImageGenerationResponse(
                            job_id=job_id,
                            status=GenerationStatus.FAILED,
                            error_message=f"ComfyUI error: {await resp.text()}",
                        )
                    result = await resp.json()
                    prompt_id = result.get("prompt_id")
                    self._jobs[job_id] = {
                        "prompt_id": prompt_id,
                        "status": GenerationStatus.PROCESSING,
                    }
                    return ImageGenerationResponse(
                        job_id=job_id,
                        status=GenerationStatus.PROCESSING,
                        metadata={"prompt_id": prompt_id},
                    )
        except Exception as e:
            return ImageGenerationResponse(
                job_id=job_id,
                status=GenerationStatus.FAILED,
                error_message=str(e),
            )

    async def check_status(self, job_id: str) -> ImageGenerationResponse:
        """Check status of a camera generation job (handles parent and sub-jobs)."""
        job = self._jobs.get(job_id)
        if not job:
            return ImageGenerationResponse(
                job_id=job_id,
                status=GenerationStatus.FAILED,
                error_message="Job not found",
            )

        if job.get("is_parent"):
            return await self._check_parent_status(job_id)

        if job["status"] in (GenerationStatus.COMPLETED, GenerationStatus.FAILED):
            return ImageGenerationResponse(
                job_id=job_id,
                status=job["status"],
                image_urls=job.get("output_images", []),
                error_message=job.get("error_message"),
                metadata={"angle": job.get("angle")},
            )

        prompt_id = job.get("prompt_id")
        if not prompt_id:
            return ImageGenerationResponse(job_id=job_id, status=GenerationStatus.PENDING)

        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(f"{self.comfy_url}/history/{prompt_id}") as resp:
                    if resp.status == 200:
                        history = await resp.json()
                        if prompt_id in history:
                            outputs = history[prompt_id].get("outputs", {})
                            image_urls = []
                            for node_id, node_output in outputs.items():
                                if "images" in node_output:
                                    for img in node_output["images"]:
                                        filename = img["filename"]
                                        subfolder = img.get("subfolder", "")
                                        img_url = f"{self.comfy_url}/view?filename={filename}&subfolder={subfolder}&type=output"
                                        image_urls.append(img_url)
                            if image_urls:
                                job["status"] = GenerationStatus.COMPLETED
                                job["output_images"] = image_urls
                                return ImageGenerationResponse(
                                    job_id=job_id,
                                    status=GenerationStatus.COMPLETED,
                                    image_urls=image_urls,
                                    metadata={"angle": job.get("angle")},
                                )
        except Exception as e:
            job["status"] = GenerationStatus.FAILED
            job["error_message"] = str(e)

        return ImageGenerationResponse(job_id=job_id, status=GenerationStatus.PROCESSING)

    async def _check_parent_status(self, job_id: str) -> ImageGenerationResponse:
        """Check all sub-jobs of a parent multi-angle job."""
        job = self._jobs.get(job_id, {})
        sub_jobs = job.get("sub_jobs", [])
        angle_results = []
        all_completed = True
        any_failed = False

        for sub in sub_jobs:
            sub_id = sub["sub_job_id"]
            sub_job = self._jobs.get(sub_id, {})
            status = sub_job.get("status", GenerationStatus.PENDING)

            if status == GenerationStatus.COMPLETED:
                angle_results.append({
                    "angle": sub["angle"],
                    "status": "completed",
                    "image_url": sub_job.get("output_images", [None])[0] if sub_job.get("output_images") else None,
                })
            elif status == GenerationStatus.FAILED:
                angle_results.append({
                    "angle": sub["angle"],
                    "status": "failed",
                    "error": sub_job.get("error_message"),
                })
                any_failed = True
            else:
                angle_results.append({"angle": sub["angle"], "status": "processing"})
                all_completed = False

        overall_status = GenerationStatus.COMPLETED if all_completed else (
            GenerationStatus.FAILED if any_failed and all_completed else GenerationStatus.PROCESSING
        )

        return ImageGenerationResponse(
            job_id=job_id,
            status=overall_status,
            metadata={"angle_results": angle_results},
        )

    def get_info(self) -> DriverInfo:
        return DriverInfo(
            driver_id=self.driver_id,
            display_name=self.driver_name,
            category=self.category,
            supported_features=self.supported_features,
            requires_api_key=False,
        )
