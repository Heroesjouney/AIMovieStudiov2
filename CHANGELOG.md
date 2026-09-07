# Changelog

All notable changes to AI Movie Studio 2 will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

---

## [Unreleased]

### Added

#### Docker Compose Setup
- **One-command stack** — `docker compose up --build` starts both backend and frontend containers
- **Backend Dockerfile** — Python image with `build-essential` for future dependencies without prebuilt wheels
- **Frontend Dockerfile** — Node image with `NEXT_IGNORE_BUILD_ERRORS=1` for pragmatic container builds
- **Bind mounts for data persistence** — `backend/assets/`, `settings.json`, and `workflows/` persist across container rebuilds
- **Privacy-first networking** — Both services bind to `127.0.0.1` only; `.dockerignore` excludes `.env` and `assets/` from build context
- **ComfyUI on host** — Backend container reaches ComfyUI at `host.docker.internal:8188` (no container GPU setup needed)
- **CI workflow** — `docker-build.yml` builds both images and runs a compose smoke test on every push/PR
- **DOCKER.md** — Dedicated documentation for Docker setup, troubleshooting, and configuration
- **`.env.example` fix** — Commented out `COMFY_URL` and `COMFY_OUTPUT_DIR` defaults that would break under Docker (pointed to container loopback instead of host)
- **GitHub issue templates** — Bug report and feature request templates tailored to the project (generation setup, backend logs, environment fields)

#### Workflow Model Analysis & Upload
- **Workflow analysis endpoint** (`POST /api/settings/workflows/analyze`) — Parses ComfyUI workflow JSON (both API and UI format) and extracts all required model references (checkpoints, LoRAs, VAEs, CLIP, UNet, ControlNet, upscale models, etc.) with their node types, filenames, and target subdirectories
- **Model existence check endpoint** (`POST /api/settings/workflows/check-models`) — Queries ComfyUI's `/object_info` API for each node type and compares available model filenames against the required ones, returning found/missing status per model
- **Generic model upload endpoint** (`POST /api/generate/models/upload-to`) — Uploads a model file to any ComfyUI model subdirectory (checkpoints, loras, vae, clip, unet, controlnet, upscale_models, gligen, hypernetworks, style_models, diffusion_models, text_encoders)
- **Auto-analyze workflow JSON in Settings panel** — When workflow JSON is pasted or loaded from file, a debounced auto-analysis extracts required models and checks them against ComfyUI (500ms debounce)
- **Required Models UI in Settings panel** — Displays each model reference with filename, type label, target subdirectory, and found/missing status. Models already in ComfyUI show a green "In ComfyUI" badge. Missing models show an Upload button that targets the correct subdirectory
- **Frontend API functions** — `analyzeWorkflow()`, `checkWorkflowModels()`, `uploadModelToSubdir()` in `api.ts` with `WorkflowModelRef` and `ModelCheckResult` types

#### Auto-Refresh Driver Dropdowns
- **Driver dropdowns auto-refresh after workflow operations** — Registering or deleting a custom workflow now calls `getDrivers()` and updates the Zustand store (`setDrivers`) immediately — no page refresh needed
- **`refreshDrivers` callback** in `SettingsPanel.tsx` — Re-fetches all drivers (image, video, audio) and updates the global store after workflow register/delete

#### Expanded LoRA Support
- **LoRA selector added to ShotCreatePanel** — LoRAs can now be applied when creating new shots, passed via `extraParams.loras` to `generateShotFrame()`
- **LoRA selector added to RetakePanel** — LoRAs can now be applied to video retakes, passed via `extraParams.loras` to `retakeVideo()`
- **LoRA preservation on regenerate** — `ShotComposer.tsx` regenerate now reads `loras` from the stored generation recipe and passes them to `generateShotFrame()`
- **Retake endpoint supports `extra_params`** — `POST /api/shots/retake` now accepts an `extra_params` query parameter (JSON-encoded) and passes it to `VideoGenerationRequest`
- **`retakeVideo()` API function updated** — Now accepts optional `extraParams` argument

#### LoRA Support
- **LoRA Selector component** (`LoRASelector.tsx`) — Reusable UI component with searchable dropdown, per-LoRA strength sliders (0–2), and inline upload
- **LoRA upload endpoint** (`POST /api/generate/loras/upload`) — Upload `.safetensors`, `.pt`, `.pth`, `.ckpt`, or `.gguf` files directly to ComfyUI's `models/loras/` directory
- **LoRA listing endpoint** (`GET /api/generate/loras`) — Fetches available LoRAs from ComfyUI's `/object_info/LoraLoader` endpoint
- **LoRA injection utility** (`lora_utils.py`) — Shared module that injects `LoraLoader` nodes into ComfyUI workflow JSON, supporting chained multiple LoRAs
- **LoRA injection in all ComfyUI drivers** — `comfy_image.py`, `comfy_video.py`, and `comfy_camera.py` now inject LoRA nodes when `extra_params.loras` is provided
- **`supports_loras` flag** — Added to `DriverInfo` schema in `base.py` and set to `True` for all local ComfyUI drivers in `__init__.py`
- **LoRA selector integrated into 5 surfaces** — Generate (GenerationPanel), Shots (ShotDetail), Camera Director (CameraDirector), Shot Create Panel (ShotCreatePanel), and Retake Panel (RetakePanel) — appears in Advanced Settings when the selected driver supports LoRAs
- **`extra_params.loras` wired through API** — `generateImage()` and `generateShotFrame()` in `api.ts` now accept and pass LoRA selections

#### Settings Panel
- **Settings panel component** (`SettingsPanel.tsx`) — Modal dialog accessible via gear icon (⚙) in the project header
- **Cloud API key management** — Add, update, and remove Fal.ai and Replicate API keys from the UI without editing `.env`
- **API key storage** — Keys stored in `backend/assets/settings.json`, loaded into environment variables at backend startup via `load_api_keys_into_env()`
- **Settings routes** (`routes_settings.py`) — `GET/POST/DELETE /api/settings/api-keys` for key management
- **Model upload endpoint** (`POST /api/generate/models/upload`) — Upload checkpoint models to ComfyUI's `models/checkpoints/` directory
- **Model listing endpoint** (`GET /api/generate/models`) — Lists available checkpoints from ComfyUI

#### Custom Workflows
- **Custom workflow registration** — Upload ComfyUI workflow JSON (API format) through the Settings panel to add new models without writing code
- **Workflow endpoints** — `GET/POST/DELETE /api/settings/workflows` for listing, registering, and deleting custom workflows
- **Dynamic driver registration** — `list_image_drivers()` and `list_video_drivers()` in `__init__.py` automatically include custom workflows from `settings.json`
- **Dynamic driver instantiation** — `get_image_driver()` and `get_video_driver()` handle custom workflow IDs by injecting workflow metadata into `MODEL_INFO`
- **Workflow JSON storage** — Custom workflows saved to `backend/core/workflows/{driver_id}.json`
- **Frontend API functions** — `listWorkflows()`, `registerWorkflow()`, `deleteWorkflow()` in `api.ts`
- **Custom Workflows UI section** — Added to SettingsPanel with form for display name, driver ID, category (image/video), and JSON paste/file upload

#### Long Take Mode (Experimental)
- **Keyframe interpolation for continuous shots** — Chain multiple first-last-frame-to-video (FLF2V) segments to generate shots longer than a single clip allows
- **Flexible keyframe definitions** — Each keyframe can be defined by an image, a prompt, or both. Prompt-only keyframes automatically generate an image via T2I (Flux 2 / Qwen Image fallback) before interpolation
- **Per-keyframe prompts** — Each keyframe has its own action prompt describing what happens *by* that keyframe. Combined with the global scene prompt for per-segment generation
- **Mode-aware UI** — T2V mode uses prompt-only keyframes (images auto-generated). I2V/R2V modes allow image+prompt or image-only keyframes
- **Long Take schema** (`LongTakeRequest` in `shot.py`) — Validates at least 2 keyframes (image or prompt), segment duration, and model FLF2V support
- **Backend endpoint** (`POST /long-take`, `GET /long-take/status/{job_id}`) — Manages multi-segment generation pipeline: T2I for missing keyframe images → sequential FLF2V segment generation → ffmpeg concat stitching → stores as single take on shot
- **Frontend UI** (`CameraDirector.tsx`) — Long Take toggle (visible only for FLF2V-capable models), keyframe cards with image thumbnails or prompt placeholders, per-keyframe prompt inputs, segment duration slider, progress bar with polling
- **Global Scene Prompt labeling** — In Long Take mode, the main prompt is relabeled to "Global Scene Prompt" to distinguish scene context from per-keyframe action prompts
- **Seed continuity** — Base seed derived from request or time, incremented per segment for variety while maintaining consistency
- **Take metadata** — Completed long takes store `segment_prompts` and `keyframe_paths` for reproducibility
- **Memory cleanup** — Long take jobs are cleaned up from in-memory dict after completion or failure
- **Shared asset path resolution** — Extracted `_resolve_asset_path()` helper used by `_concat_videos`, `_splice_video`, and `_extract_last_frame`

> ⚠️ **Experimental status** — Long Take Mode is under active development. The multi-segment pipeline may fail mid-generation without retry capability. T2I image generation for prompt-only keyframes blocks the initial request. Results may vary significantly between models. Use with LTX Video 2.3 or Wan Video for best results.

### Changed
- **`routes_generate.py`** — Added `UploadFile` and `File` imports; added LoRA upload, model listing, model upload, and generic model upload-to-subdirectory endpoints
- **`routes_shots.py`** — Shot frame generation now merges `extra_params` (including LoRAs) into the generation request; generation recipe now stores `loras` and `composition_preset` in `params`; retake endpoint accepts `extra_params` query parameter
- **`routes_settings.py`** — Added workflow analysis and model check endpoints; `MODEL_NODE_MAP` maps 17 ComfyUI node types to model subdirectories
- **`camera.py` schema** — Added `extra_params` field to `MultiAngleRequest`
- **`app.py`** — Registered settings router; loads saved API keys into env vars at startup
- **`README.md`** — Updated with LoRA Support, Settings & Configuration, Custom Workflows sections; updated directory layout, environment variables, FAQ, and roadmap; added Long Take Mode (Experimental) to Features and Roadmap; added Workflow Model Analysis & Expanded LoRA Support sections
- **`ShotDetail.tsx`** — Added `ChevronDown` import for collapsible Advanced section
- **`ShotCreatePanel.tsx`** — Added `LoRASelector` import, `loras` state, and passes `extraParams.loras` to `generateShotFrame()`
- **`ShotComposer.tsx`** — Regenerate now reads `loras` from stored recipe and passes as `extraParams`
- **`RetakePanel.tsx`** — Added `LoRASelector` import, `loras` state, and passes `extraParams.loras` to `retakeVideo()`
- **`SettingsPanel.tsx`** — Added `refreshDrivers` callback, workflow model analysis state, and required models UI with upload buttons; auto-refreshes driver dropdowns after workflow register/delete
- **`api.ts`** — Added `analyzeWorkflow()`, `checkWorkflowModels()`, `uploadModelToSubdir()` functions; `retakeVideo()` now accepts `extraParams`; added `WorkflowModelRef` and `ModelCheckResult` types
- **`routes_scenes.py`** — `delete_scene` now deletes all shots belonging to the scene from `shots.json` and removes their folders from disk (frame images, video takes, angle images)
- **`ScenePanel.tsx`** — Replaced `confirm()` dialog with two-step inline confirmation for scene deletion; refreshes shots in Zustand store after deletion

### Fixed
- **`supports_loras` not appearing in API response** — Root cause: `list_image_drivers()` and `list_video_drivers()` in `__init__.py` construct `DriverInfo` objects directly rather than calling `driver.get_info()`. Fixed by adding `supports_loras=True` to the hardcoded `DriverInfo` entries in `__init__.py`
- **Scene deletion leaving orphaned shots** — `delete_scene` only removed the scene from `scenes.json` but left all its shots, storyboard frames, and video files on disk. Fixed by also filtering `shots.json` and deleting each shot's folder from disk
- **Non-localhost API access broken by FastAPI slash-redirect** — Collection endpoints (`/api/projects`, `/api/scenes`, `/api/shots`, `/api/assets`) registered only at `"/"`, causing FastAPI to issue a `307` redirect with an absolute `Location` header pointing to `localhost:8001`. When the browser is on a different machine than the backend, the browser follows the redirect directly and bypasses the Next.js proxy, hitting `localhost:8001` on the client's own machine. Fixed by registering affected endpoints at both `""` and `"/"` with `include_in_schema=False` on duplicates to keep `/docs` clean. *(Contributed by [@edasque](https://github.com/edasque) — PR #3)*

---

## [Previous Releases]

Prior version history was not tracked in this changelog. See git history for details on earlier changes.
