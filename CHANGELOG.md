# Changelog

All notable changes to AI Movie Studio 2 will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

---

## [Unreleased]

### Fixed

#### Scene Deletion Preserves Videos, Deletes Images
- **Video preservation on scene/shot deletion** (CRITICAL) — Deleting scenes (single or bulk) previously called `shutil.rmtree(shot_folder)` which destroyed all files in the shot folder, including generated video takes. Now, before deleting a shot folder, the backend moves all video files (`.mp4`, `.mov`, `.avi`, `.mkv`, `.webm`) to `assets/<project>/videos/` so they survive the deletion.
- **Images are deleted with the shot folder** — frame images (`last_frame.png`, `first_frame.png`, `angle_*.jpg`, retake anchors) are continuity assets tied to the shot and are deleted along with the shot folder. Storyboard card images (`frame_image_path`) are typically remote URLs or in `/assets/generated/` and are not affected.
- **New helper** `_preserve_videos_from_shot()` in `routes_scenes.py` handles moving videos to the vault's `videos/` directory with collision-safe naming.
- **Bulk delete** now only deletes the scene list, storyboard cards, and associated images — all generated videos are preserved in the vault.

### Added

#### Audio System Overhaul

##### ComfyUI Audio Driver
- **`ComfyAudioDriver`** (`backend/core/drivers/comfy_audio.py`) — New driver supporting ComfyUI audio workflows with async polling, parameter injection, and output download
- **MiniMax Music 3** workflow (`backend/core/workflows/minimax_music3.json`) — Text-to-music generation with caption, lyrics, duration, seed, steps, and CFG controls
- **Chatterbox TTS** workflow (`backend/core/workflows/chatterbox_tts.json`) — Text-to-speech with voice cloning via ComfyUI; reference audio uploaded to ComfyUI before generation
- **HunyuanVideo Foley** workflow (`backend/core/workflows/hunyuan_foley.json`) — Video-to-foley sound effects generation; injects video path, prompt, negative prompt, duration, CFG, steps, and seed into the HunyuanFoleySampler node
- **Audio workflow category** — `POST /api/settings/workflows` now accepts `"audio"` as a valid category (previously only `"image"` and `"video"`)
- **Audio model upload** — `POST /api/generate/models/upload-to` now accepts `audio` and `audio_models` subdirectories
- **Driver registration** — `get_audio_driver()` and `list_audio_drivers()` now include `comfy_audio`, `chatterbox_tts`, and `hunyuan_foley`

##### Audio API Extensions
- **`AudioGenerationRequest`** extended with `lyrics`, `duration_seconds`, `seed`, `steps`, `cfg`, `clip_name`, `video_path`, `negative_prompt`, and `extra_params` fields
- **`AudioJobRequest`** extended with `lyrics`, `seed`, `steps`, `cfg`, and `negative_prompt` fields
- **Async job polling** — `GET /api/audio/status/{job_id}` now polls the driver for ComfyUI jobs (previously only returned the in-memory job state); downloads audio output from ComfyUI when complete
- **`POST /api/audio/job`** now handles async `PROCESSING` responses from ComfyUI drivers (returns `processing` status instead of incorrectly marking as `completed`)
- **Foley video path resolution** — `/job` endpoint searches `videos/`, `foley_videos/`, `shots/` subdirectories recursively to find the input video

##### Audio Bug Fixes
- **Generated audio persistence** (CRITICAL) — `POST /api/audio/job` now downloads remote audio URLs into the vault; previously marked jobs as completed without saving the file, leaving the audio library empty
- **Reference voice for Fish Speech** (CRITICAL) — Reference voice is now sent for Fish Speech (supports voice cloning), not just Chatterbox TTS
- **Replicate voice cloning** (CRITICAL) — `FishSpeechDriver._generate_replicate` now base64-encodes reference audio as a data URI instead of passing a local file path (Replicate requires a public URL or data URI)
- **Waveform endpoint** (MEDIUM) — `GET /api/assets/waveform/{project_id}/{filename}` now searches `audio/<uuid>/` subdirectories recursively; previously only searched the flat `audio/` directory and never found generated/uploaded audio files

##### Audio UI Improvements
- **Music tab re-enabled** — MiniMax Music 3 (ComfyUI) with prompt builder, duration slider, and optional lyrics textarea
- **Foley tab re-enabled** — HunyuanVideo Foley (ComfyUI) with video source selector, sound presets, prompt, negative prompt, and duration slider
- **Chatterbox TTS** option added to the speech engine selector
- **Reference voice** section now shows for both Fish Speech and Chatterbox TTS
- **Reference voice helper text** is now engine-specific (mentions ComfyUI for Chatterbox, Fish Speech for Fish Speech)
- **Error clearing** — Switching audio tabs now clears the error message
- **Foley duration** is now a UI slider (1–30s) instead of hardcoded to 10s
- **Engine labels** updated to reflect actual backends (e.g. "MiniMax Music 3 (ComfyUI)", "HunyuanVideo Foley (ComfyUI)")

#### Cloud Audio Drivers

##### Fal Audio Driver (`backend/core/drivers/fal_audio.py`)
- **`FalAudioDriver`** — New cloud audio driver using the `fal_client` SDK
- **`fal_music`** — MiniMax Music 3 via Fal (`minimax/music-3` endpoint) for text-to-music with lyrics and duration control
- **`fal_foley`** — HunyuanVideo Foley via Fal (`fal-ai/hunyuan-video-foley` endpoint) for video-to-foley generation
- **`fal_elevenlabs`** — ElevenLabs v3 via Fal (`fal-ai/elevenlabs/tts/eleven-v3` endpoint) for high-quality TTS with 20+ pre-built voices and inline emotion tags (`[excited]`, `[whispers]`, `[laughs]`)
- **`fal_chatterbox_hd`** — Chatterbox HD via Fal (`resemble-ai/chatterboxhd/text-to-speech` endpoint) for 48kHz TTS with zero-shot voice cloning from reference audio
- **`fal_chatterbox`** — Chatterbox OSS via Fal (`fal-ai/chatterbox/text-to-speech` endpoint) for 24kHz TTS with voice cloning
- **Reference audio upload** — `FalAudioDriver._upload_reference_audio()` uploads local reference audio to Fal storage via `fal_client.upload_file()` for cloud voice cloning
- **Engine selector** in Music tab now offers local ComfyUI or cloud Fal
- **Engine selector** in Foley tab now offers local ComfyUI, cloud Fal, or cloud Replicate
- **Engine selector** in Speech tab now offers local (Fish Speech, Chatterbox TTS) or cloud (ElevenLabs v3, Chatterbox HD, Chatterbox OSS)
- **ElevenLabs voice selector** — 20 pre-built voices (Rachel, Aria, Roger, Sarah, etc.) shown when ElevenLabs v3 is selected
- **Public URL video source** — Foley tab now has a "Public URL" video source option for cloud backends (cloud APIs require a publicly accessible video URL)

##### Replicate Foley Driver (`backend/core/drivers/replicate_foley.py`)
- **`ReplicateFoleyDriver`** — New cloud foley driver using the Replicate REST API
- **`replicate_foley`** — HunyuanVideo Foley via Replicate (`tencent/hunyuanvideo-foley` model) for video-to-foley generation
- Uses `aiohttp` for async API calls with Bearer token auth
- Polls `/v1/predictions/{id}` for completion

##### Audio API Extensions (Cloud)
- **`AudioJobRequest`** extended with `input_video_url` field for cloud foley drivers
- **`AudioGenerationRequest.extra_params["video_url"]`** — Cloud drivers read the public video URL from extra_params
- **`get_audio_driver()`** and **`list_audio_drivers()`** now include `fal_music`, `fal_foley`, and `replicate_foley`

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

#### Screenplay Import (Fountain + Final Draft)
- **Fountain parser** (`screenplay_parser.py`) — Parses plain-text Fountain screenplays (`.fountain`, `.txt`, `.spmd`) into structured scenes with shot breakdowns. Supports scene headings (sluglines), action lines, character cues, parentheticals, dialogue, transitions, shot headings, and title-page metadata
- **Final Draft (.fdx) parser** — Parses Final Draft's XML format using the same internal data model. Maps FDX `<Paragraph Type="...">` elements (Scene Heading, Action, Character, Parenthetical, Dialogue, Transition, Shot) to the same structure as Fountain. Handles namespace-prefixed tags, dual-dialogue blocks (flattened), and skips ScriptNote/Section Heading/Act Break
- **Format auto-detection** (`parse_screenplay()`) — Dispatcher detects format by filename extension (`.fdx` → FDX) or by content (text starting with `<?xml` or `<FinalDraft` → FDX; otherwise Fountain). Pasted FDX content is detected even without a filename
- **Scenes-only import workflow** — Importing a screenplay creates scene entries only; the storyboard stays clean. The parsed shot breakdown is stored on each scene as `script_breakdown` for reference. This preserves the existing establish-then-continue shot workflow (set up recipe → generate establishing shot → build subsequent shots manually)
- **Import endpoints** — `POST /api/screenplay/preview` (parse without creating), `POST /api/screenplay/import` (create scenes), `POST /api/screenplay/upload` (upload `.fountain`/`.txt`/`.spmd`/`.fdx` files). Request model includes optional `filename` for extension-based format detection
- **Screenplay import modal** (`ScreenplayImportModal.tsx`) — Drag-and-drop or browse to upload a screenplay file, with a live preview of detected scenes/shots before importing. Accepts `.fountain`, `.txt`, `.spmd`, and `.fdx`
- **Screenplay Breakdown reference panel** — Each scene's recipe now displays the imported script breakdown formatted as a screenplay (monospace, indented character cues, parentheticals, dialogue, right-aligned transitions, separate action paragraphs). Each shot has a copy-to-clipboard button so the user can paste dialogue/action into a manually-created shot's description. Only appears on scenes that have a breakdown (imported scenes); manually-created scenes show nothing extra
- **Structured breakdown data** — Each breakdown shot includes `action_lines` (individual action paragraphs) and `dialogue_blocks` (`{character, parenthetical, text}`) for screenplay-formatted rendering, alongside the flat `action`/`dialogue` strings for backward compatibility
- **Scene-level metadata inference** — Time of day, mood, and lighting are inferred from scene headings and content (action/dialogue keyword heuristics). `int_ext` and `location` are parsed from sluglines
- **Parser robustness fixes** — Shot-heading matching uses word boundaries so character names like "CUSTOMER" aren't misclassified as close-up shots; transitions are checked before shot headings so "CUT TO:" isn't treated as a shot

#### Bulk Scene Delete
- **Bulk delete endpoint** (`DELETE /api/scenes/{project_id}/all`) — Deletes every scene in a project along with all associated shots (removed from `shots.json`) and their on-disk folders (frames, angle images, video takes, audio). Returns `{status, project_id, scenes_deleted, shots_deleted}`. Idempotent (safe on an empty project). Route is placed before the single-scene `/{project_id}/{scene_id}` route so `/all` matches correctly
- **"Delete all" button in ScenePanel** — Destructive button in the Scenes header (visible only when scenes exist) with a two-step inline confirmation matching the existing per-scene delete UX. On success, clears the selected scene and refreshes both scenes and shots so the storyboard is cleared
- **Frontend API** — `deleteAllScenes(projectId)` in `api.ts` with `DeleteAllScenesResult` type

#### Generation Job Persistence & Polling Concurrency Fix
- **Job persistence across tab switches** — Active generation jobs (frame, video, image, audio) are now tracked in the Zustand store so polling continues or resumes when the user switches tabs and returns. The storyboard/shots update from the global store even if the job completed while the user was on another tab
- **Module-level interval Map** (`useGenerationPolling.ts`) — Polling intervals are now keyed by `job_id` in a `Map<string, intervalId>` instead of a single module-level slot. This allows **concurrent frame generations** (e.g., regenerate in ShotComposer while a ShotDetail generation is running) without one poll killing another's interval
- **`activeFrameJobs` array in store** — Replaced the single `activeFrameJob` slot with an `activeFrameJobs` array + `addActiveFrameJob` / `removeActiveFrameJob`. Each job is tracked independently; completing one removes only its own entry
- **`jobId` parameter on `startPolling`** — Each `useGenerationPolling` consumer now passes its `job_id` so the hook can key its interval and clean up only its own entry on completion/failure
- **`activeVideoJob` / `activeImageJob` / `activeAudioJobs`** — Video, image, and audio generation jobs are tracked in the store with resume-on-remount `useEffect` hooks in `CameraDirector.tsx`, `GenerationPanel.tsx`, and `DialoguePanel.tsx`

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
- **`ScenePanel.tsx`** — Replaced `confirm()` dialog with two-step inline confirmation for scene deletion; refreshes shots in Zustand store after deletion; added "Delete all" bulk-delete button with two-step confirmation; added Screenplay Breakdown reference panel with screenplay-formatted rendering and copy-to-clipboard; added script-shot count badge on scene cards
- **`routes_screenplay.py`** — New router for screenplay import (Fountain + FDX). Preview/import/upload endpoints. Uses `parse_screenplay()` format dispatcher. Removed the `generate-shots` endpoint (replaced by the reference workflow). Cleaned up unused shot helpers/imports
- **`screenplay_parser.py`** — New parser module. `parse_fountain()`, `parse_fdx()`, `parse_screenplay()` dispatcher, and `screenplay_to_import_data()`. `ParsedShot` now includes `action_lines` and the breakdown output includes `dialogue_blocks` for screenplay-formatted rendering
- **`ScreenplayImportModal.tsx`** — New component for uploading/pasting screenplays with live preview. Accepts `.fountain`, `.txt`, `.spmd`, `.fdx`
- **`api.ts`** — Added `previewScreenplay()`, `importScreenplay()`, `uploadScreenplay()`, `deleteAllScenes()` functions; added `ScreenplayImportPreview`, `ScreenplayImportResult`, `SceneScriptBreakdownShot` (with `action_lines` and `dialogue_blocks`), `DeleteAllScenesResult` types; removed `generateSceneShots()` and `GenerateSceneShotsResult`
- **`useGenerationPolling.ts`** — Replaced module-level singleton intervals with `Map<string, intervalId>` keyed by `job_id`; added `jobId` parameter to `startPolling`; uses `activeFrameJobs` array from store instead of single `activeFrameJob` slot; `stopPolling`/`stopTimer` now clear only the current instance's interval
- **`store.ts`** — Added `activeVideoJob`, `activeImageJob`, `activeAudioJobs` (with `addActiveAudioJob`/`removeActiveAudioJob`); replaced `activeFrameJob` single slot with `activeFrameJobs` array + `addActiveFrameJob`/`removeActiveFrameJob`
- **`ShotComposer.tsx`**, **`ShotDetail.tsx`**, **`ShotCreatePanel.tsx`**, **`MultiAnglePanel.tsx`**, **`VariationPanel.tsx`**, **`RetakePanel.tsx`** — Changed `setActiveFrameJob()` → `addActiveFrameJob()`; pass `jobId` to `startPolling()` options
- **`CameraDirector.tsx`** — Added `activeVideoJob` tracking with resume-on-remount `useEffect`; `setActiveVideoJob(null)` on completion/failure/reset
- **`GenerationPanel.tsx`** — Added `activeImageJob` tracking with resume-on-remount `useEffect`
- **`DialoguePanel.tsx`** — Added `activeAudioJobs` tracking for speech/music/foley jobs

### Fixed
- **`supports_loras` not appearing in API response** — Root cause: `list_image_drivers()` and `list_video_drivers()` in `__init__.py` construct `DriverInfo` objects directly rather than calling `driver.get_info()`. Fixed by adding `supports_loras=True` to the hardcoded `DriverInfo` entries in `__init__.py`
- **Scene deletion leaving orphaned shots** — `delete_scene` only removed the scene from `scenes.json` but left all its shots, storyboard frames, and video files on disk. Fixed by also filtering `shots.json` and deleting each shot's folder from disk
- **Non-localhost API access broken by FastAPI slash-redirect** — Collection endpoints (`/api/projects`, `/api/scenes`, `/api/shots`, `/api/assets`) registered only at `"/"`, causing FastAPI to issue a `307` redirect with an absolute `Location` header pointing to `localhost:8001`. When the browser is on a different machine than the backend, the browser follows the redirect directly and bypasses the Next.js proxy, hitting `localhost:8001` on the client's own machine. Fixed by registering affected endpoints at both `""` and `"/"` with `include_in_schema=False` on duplicates to keep `/docs` clean. *(Contributed by [@edasque](https://github.com/edasque) — PR #3)*
- **Concurrent frame generation polls killing each other** — `useGenerationPolling` used a single module-level `_moduleIntervalId` slot. `startPolling()` called `stopPolling()` first, which cleared the global interval — so starting a second frame generation killed the first one's poll, leaving the job running on the backend with no UI detection of completion. Fixed by keying intervals in a `Map<job_id, intervalId>` so each poll is independent
- **Single `activeFrameJob` slot overwritten by concurrent jobs** — A second frame job overwrote the first in the store; when the first completed and cleared the slot, the second appeared "not running" even though it was. Fixed by replacing the single slot with an `activeFrameJobs` array
- **`ShotDetail.tsx` type mismatch** — `AssetResponse.primary_image` is `string | null` but `AssetPicker` expects `primary_image?: string` (`string | undefined`). Fixed by mapping `null` → `undefined` at the call site (`a.primary_image ?? undefined`)

---

## [Previous Releases]

Prior version history was not tracked in this changelog. See git history for details on earlier changes.
