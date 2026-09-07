# 🎬 AI Movie Studio 2

![Cinematic Film Strip](docs/cinematic_film_strip.jpg)

[![Python](https://img.shields.io/badge/Python-3.10+-3776AB?logo=python&logoColor=white)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.109+-009688?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![Next.js](https://img.shields.io/badge/Next.js-14.2-000000?logo=next.js&logoColor=white)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-18.3-61DAFB?logo=react&logoColor=white)](https://react.dev/)
[![Three.js](https://img.shields.io/badge/Three.js-R3F-000000?logo=three.js&logoColor=white)](https://threejs.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-3.4-38BDF8?logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)
[![License](https://img.shields.io/badge/License-AGPLv3-blue.svg)](LICENSE)

> **Filmmaking is the most powerful storytelling medium we have. For too long, only a few got to play. That changes now.**

---

## 🎬 The Story

AI Movie Studio didn't come out of a hackathon. It came out of 25 years on real film sets.

I'm **Nathan McConnell** - a filmmaker, camera assistant, and virtual production specialist based in Atlanta. I started in the business while still in high school, cutting cable commercials at a local production studio, then moved into Turner Broadcasting's creative services department. A detour into computer animation took me to Escape Studios in London, but the pull of the set brought me back to Atlanta, where I spent over 14 years in the camera department - pulling focus, lining up shots, and learning the craft from the ground up on productions like *The Hunger Games: Mockingjay*, *Kill the Messenger*, *What to Expect When You're Expecting*, *The Collection*, and *Emperor*. ([IMDb](https://www.imdb.com/name/nm2468122/))

Today I manage LED volume stages for virtual production and in-camera VFX at SCAD Atlanta, and I run Sandbox Entertainment Company. I teach and mentor filmmakers on both the creative and technical sides of modern production.

### Why I'm building this

I love filmmaking. Not in a casual way - in the way that keeps you up at night thinking about a shot, that makes you notice how light falls on a wall and immediately start framing it, that makes the hum of a set feel like home. The craft of it, the collaboration, the moment a frame becomes a feeling. Every tool I build comes from that place. This project especially.

But here's the thing I can't shake: **filmmaking has always been expensive** - prohibitively so for independent creators. For decades, the cost of cameras, lighting, stages, crew, and post-production has acted as a gatekeeper, silencing voices that didn't have access to capital or industry connections. The tools existed, but the system kept them out of reach.

And here's the harder truth I learned on the inside: **talent doesn't guarantee you a seat at the table.** The gatekeepers make the rules - who gets funded, who gets heard, who gets a shot. I've watched brilliant, viable voices get silenced not because their work wasn't good enough, but because they didn't have the right access, the right budget, or the right last name. The system isn't neutral. It was built to filter people out.

AI filmmaking is changing that. It's not replacing the craft - it's handing the craft back to the people who were locked out of it. A single storyteller with a vision can now plan scenes, generate storyboards, prototype a look, and build a pitch that holds up next to a studio package. **AI Movie Studio 2 is my attempt to build the tool I wish I'd had** - one that treats filmmaking as a craft, not a budget line, and one that doesn't ask anyone for permission to make something worth watching.

I'm also developing [**Luminara**](https://luminara-kan0.onrender.com/) - a companion project exploring the next layer of AI-assisted creative workflows (source is private for now; the live app is available to try). And I build tools for the virtual production community, including a [**Real Cine Camera plugin for Unreal Engine 5**](https://www.fab.com/listings/a4efb43c-cf8a-4429-814a-812ccfa8d95e) on Fab, which brings real-world lens behavior and camera settings into UE5.

---

### What is this?

AI Movie Studio 2 is a browser-based, **model-agnostic** AI filmmaking workstation. You design scenes, place cameras in 3D space, generate storyboard frames with AI, turn them into videos, add dialogue and audio, then export the final timeline. It works with local **ComfyUI** or cloud APIs (**Fal** / **Replicate**).

You don't need to be a developer to use it. If you can use a web browser, you can use AI Movie Studio. The setup below is for developers who want to run it locally or contribute.

> ⚠️ **Work in Progress** - This project is under active development. Features may change, and some pipelines are experimental. Expect breaking changes between updates.

![AI Movie Studio 2 - Camera Director](docs/screenshot2.png)

![AI Movie Studio 2 - Project Workspace](docs/screenshot.png)

---

## 📋 Table of Contents

- [The Story](#-the-story)
- [Features](#-features)
- [Quick Start](#-quick-start-5-minutes)
- [Docker (One Command)](#-docker-one-command)
- [How to Use](#-how-to-use)
- [LoRA Support](#-lora-support)
- [Settings & Configuration](#-settings--configuration)
- [Custom Workflows](#-custom-comfyui-workflows)
- [Available Models](#-available-image-models)
- [Environment Variables](#-environment-variables)
- [ComfyUI Custom Nodes](#-comfyui-custom-nodes)
- [Required Model Files](#-required-model-files)
- [Architecture](#-architecture)
- [Troubleshooting](#-troubleshooting)
- [FAQ](#-faq)
- [Project History](#-project-history)
- [Roadmap](#-roadmap)
- [Licensing](#-licensing--commercial-use)
- [Acknowledgments](#-acknowledgments)

---

## ✨ Features

- **🗂️ Project & Asset Vault** - All your projects, scenes, shots, and assets are stored locally. No cloud dependency required.
- **🎬 3D Storyboard** - Place a virtual camera in 3D space and frame your shots visually. Drag to position, see compass directions, FOV cone, and get warnings when you break the 180° rule.
- **🧠 Continuity System** - Keep characters and locations consistent across frames using reference images.
- **🔌 Works with Any AI Model** - The "Driver System" lets you swap between local ComfyUI and cloud providers (Fal, Replicate) without changing the UI.
  - **Image generation:** 7+ local models, 7+ cloud models
  - **Video generation:** 3 local models, 4 cloud models
  - **Audio:** Fish Speech for TTS and voice cloning
- **🖼️ Multi-Reference Generation** - Feed the AI multiple character/scene reference images to maintain visual consistency.
- **🎞️ Timeline & Export** - Assemble shots into a timeline, add audio, and export to XML for editing in Premiere, DaVinci, etc.
- **⚡ Live Status** - Watch generation progress in real-time with elapsed timers.
- **🎛️ Shot Composition Tools** - Cinematic presets (establishing, over-shoulder, close-up, POV), art styles, aspect ratios, and advanced controls (negative prompt, seed, denoise, CFG, steps).
- **📸 Multi-Angle & Variations** - Generate alternate camera angles, prompt variations, and retake failed shots.
- **🎞️ Long Take Mode** *(Experimental)* - Chain keyframe interpolation across multiple segments to generate continuous shots longer than a single clip. Define keyframes by image, prompt, or both. The backend generates missing images via T2I, interpolates between keyframe pairs using first-last-frame-to-video (FLF2V), and stitches segments with ffmpeg. Only available for models that support first+last frame (e.g. LTX Video 2.3, Wan Video).
- **🔀 Shot Management** - Drag-and-drop reordering, shot duplication, next/prev navigation, keyboard shortcuts (Ctrl+Enter to generate), and a fullscreen lightbox viewer.
- **🎨 LoRA Support** - Add, upload, and manage LoRAs (Low-Rank Adaptation models) directly from the UI. Apply style or character modifications to any local ComfyUI generation with per-LoRA strength sliders. Available in all 5 generation surfaces: Generate tab, Shot tab, Camera tab, Shot Create panel, and Retake panel.
- **⚙️ Settings Panel** - A built-in settings panel (gear icon in header) for managing cloud API keys, uploading models to ComfyUI, and registering custom workflows — no code changes or `.env` editing required.
- **🔧 Custom Workflows** - Build workflows in ComfyUI, export as JSON, and upload them through the Settings panel. Custom workflows appear as new models in all dropdowns with full LoRA support. Driver dropdowns auto-refresh after registering or deleting workflows — no page reload needed.
- **🔍 Workflow Model Analysis** - When uploading a custom workflow, the app automatically analyzes the JSON and lists all required models (checkpoints, LoRAs, VAEs, CLIP, UNet, ControlNet, etc.). Each model is checked against your ComfyUI instance — models already present show a green "In ComfyUI" badge, and missing models can be uploaded directly to the correct subdirectory from the same UI.

---

## 🏗️ Architecture

The app follows a clean **Adapter Pattern** so the frontend never knows which AI engine is running.

```
┌─────────────────────────────┐        ┌──────────────────────────────┐
│  Frontend (Next.js 14)      │  HTTP  │  Backend (FastAPI)           │
│  ├─ 3D Stage (R3F)          │ ────►  │  ├─ API Routes               │
│  ├─ Storyboard / Shots      │  WS    │  ├─ Logic (Script/Continuity)│
│  ├─ Asset Library           │ ◄────  │  ├─ Schemas (Pydantic)       │
│  └─ Zustand Store           │        │  └─ Drivers (Adapter)        │
└─────────────────────────────┘        └──────────────┬───────────────┘
                                                      │
                                ┌─────────────────────┼─────────────────────┐
                                │                     │                     │
                          ┌─────▼─────┐         ┌─────▼─────┐         ┌─────▼─────┐
                          │ ComfyUI   │         │ Fal.ai    │         │ Replicate │
                          │ (Local)   │         │ (Cloud)   │         │ (Cloud)   │
                          └───────────┘         └───────────┘         └───────────┘
```

### Directory Layout

```
AI-MovieStudio2/
├── backend/
│   ├── api/                 # FastAPI route handlers
│   │   ├── routes_assets.py
│   │   ├── routes_audio.py
│   │   ├── routes_export.py
│   │   ├── routes_generate.py   # Image/video gen + LoRA/model upload endpoints
│   │   ├── routes_projects.py
│   │   ├── routes_render.py
│   │   ├── routes_scenes.py
│   │   ├── routes_settings.py   # API key management + custom workflow registration
│   │   ├── routes_shots.py
│   │   └── routes_timeline.py
│   ├── core/
│   │   ├── drivers/         # AI model adapters (the "Driver System")
│   │   │   ├── __init__.py          # Driver registry + custom workflow support
│   │   │   ├── base.py              # Abstract base classes + DriverInfo schema
│   │   │   ├── comfy_image.py       # ComfyUI image driver (LoRA injection)
│   │   │   ├── comfy_video.py       # ComfyUI video driver (LoRA injection)
│   │   │   ├── comfy_camera.py      # ComfyUI multi-angle driver (LoRA injection)
│   │   │   ├── lora_utils.py        # Shared LoRA injection + listing utilities
│   │   │   ├── fal_image.py
│   │   │   ├── fal_video.py
│   │   │   ├── fish_speech.py
│   │   │   └── replicate_driver.py
│   │   ├── logic/           # Business logic (script parsing, continuity)
│   │   ├── schemas/         # Pydantic models (single source of truth)
│   │   │   ├── asset.py
│   │   │   ├── camera.py
│   │   │   ├── project.py
│   │   │   ├── scene.py
│   │   │   ├── shot.py
│   │   │   └── style_bible.py
│   │   └── workflows/       # ComfyUI workflow JSON templates
│   ├── assets/              # The Vault (project data + generated media)
│   │   ├── default/         # Default project workspace
│   │   ├── generated/       # AI-generated images & videos
│   │   ├── status/          # Generation status tracking
│   │   └── settings.json    # API keys + custom workflow registrations
│   ├── app.py               # FastAPI app
│   ├── main.py              # CLI entry point
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── app/             # Next.js App Router pages
│   │   │   ├── project/[id] # Project workspace
│   │   │   └── projects/    # Project list
│   │   ├── components/
│   │   │   ├── studio/      # 3D stage canvas (R3F) + inspector
│   │   │   │   ├── GenerationPanel.tsx
│   │   │   │   └── InspectorPanel.tsx
│   │   │   ├── shots/       # Storyboard, shot detail & composition
│   │   │   │   ├── ShotComposer.tsx       # Main storyboard grid + drag-drop
│   │   │   │   ├── ShotCreatePanel.tsx    # New shot creation UI
│   │   │   │   ├── ShotDetail.tsx         # Shot detail with next/prev nav
│   │   │   │   ├── CameraAngleWidget.tsx  # 3D camera positioning (R3F)
│   │   │   │   ├── ShotTypeLibrary.tsx    # Cinematic preset quick-select
│   │   │   │   ├── ScenePanel.tsx         # Scene list sidebar
│   │   │   │   ├── MultiAnglePanel.tsx    # Multi-angle generation
│   │   │   │   ├── VariationPanel.tsx     # Prompt variation generation
│   │   │   │   └── RetakePanel.tsx        # Retake failed generations
│   │   │   ├── shared/      # Reusable UI components
│   │   │   │   ├── AssetPicker.tsx        # Asset selection dropdown
│   │   │   │   ├── ShotFrameLinker.tsx    # Link reference frames to shots
│   │   │   │   ├── ModelSelector.tsx      # AI model dropdown with grouping
│   │   │   │   ├── LoRASelector.tsx       # LoRA picker with upload + strength sliders
│   │   │   │   ├── SettingsPanel.tsx      # API keys + model upload + custom workflows
│   │   │   │   └── Lightbox.tsx           # Fullscreen image viewer
│   │   │   ├── library/     # Asset grid & detail panel
│   │   │   ├── camera/      # Camera director (video generation)
│   │   │   ├── timeline/    # Shot timeline, dialogue & audio
│   │   │   └── export/      # Export panel
│   │   └── lib/
│   │       ├── api.ts                  # API client
│   │       ├── store.ts                # Zustand state management
│   │       ├── useGenerationPolling.ts # Reusable polling hook for async jobs
│   │       ├── useAuth.ts             # Authentication hook
│   │       └── cinematicPresets.ts    # Shot type & camera preset definitions
│   ├── next.config.mjs      # API proxy config
│   └── package.json
├── docker-compose.yml        # Docker Compose setup (backend + frontend)
├── DOCKER.md                 # Docker setup & troubleshooting guide
└── README.md
```

---

## ✅ Prerequisites

You'll need these installed before setting up the project:

- **[Python 3.10+](https://www.python.org/downloads/)** with `pip`
- **[Node.js 18+](https://nodejs.org/)** with `npm`
- **[ComfyUI](https://github.com/comfyanonymous/ComfyUI)** running locally (for AI image/video generation)
- **GPU** with CUDA support (recommended for local generation - cloud models work without one)

> 💡 **Prefer Docker?** You can skip all manual installs and run the entire stack with `docker compose up --build`. See [Docker (One Command)](#-docker-one-command) below. You only need [Docker Desktop](https://www.docker.com/products/docker-desktop/) + ComfyUI running on your host.

### Hardware Recommendations

| Tier | GPU | VRAM | Use Case |
| ---- | --- | ---- | -------- |
| **Minimum** | RTX 3060 / RTX 4060 | 8 GB | Image generation (Z-Image, Qwen), short video clips (LTX, 5s) |
| **Recommended** | RTX 4070 Ti / RTX 4080 | 12–16 GB | All image models + video (Wan, MiniMax H3), faster iteration |
| **Enthusiast** | RTX 4090 / RTX 5090 | 24+ GB | Multi-reference video, long clips, batch generation |

> 💡 **No GPU?** You can use cloud-only models (Fal.ai, Replicate) - just set the API keys and skip ComfyUI entirely.

---

## 🚀 Quick Start (5 minutes)

> **New to this?** Follow these steps in order. You'll need **3 terminal windows** open at the same time.

### Step 1 - Install the Backend

```bash
cd backend
pip install -r requirements.txt
```

Create a `.env` file in the `backend/` directory (or copy `.env.example`):

```env
# ComfyUI URL — defaults to http://127.0.0.1:8188, so you can leave this commented out
# unless your ComfyUI listens on a different address/port
# COMFY_URL=http://127.0.0.1:8188

# Optional - only needed if using cloud AI models
FAL_KEY=your_fal_api_key
REPLICATE_API_TOKEN=your_replicate_token
```

> 💡 Don't have API keys? You can skip the cloud lines and use local ComfyUI only. You can also add API keys later via the Settings panel (gear icon in header).

### Step 2 - Install the Frontend

```bash
cd frontend
npm install
```

### Step 3 - Start ComfyUI

ComfyUI is the AI engine that generates images and videos. Start it in its own terminal:

```bash
cd /path/to/ComfyUI
python main.py
```

> ⚠️ **Flash Attention warning on older GPUs?** Force SDPA mode:
> ```powershell
> $env:ATTN_BACKEND="sdpa"  # Windows PowerShell
> python main.py
> ```

### Step 4 - Start the Backend

In a second terminal:

```bash
cd backend
python main.py serve --reload
```

You should see the API running at http://localhost:8001. Check http://localhost:8001/health to confirm.

### Step 5 - Start the Frontend

In a third terminal:

```bash
cd frontend
npm run dev
```

Open **http://localhost:3000** in your browser. You're ready to go! 🎬

---

## 🐳 Docker (One Command)

Prefer containers? Skip the manual setup above and run the entire stack with Docker Compose:

```bash
docker compose up --build
```

Then open http://localhost:3000. That's it.

**Notes:**
- ComfyUI runs on your host (not in a container) — make sure it's running on port 8188. The backend container reaches it at `host.docker.internal:8188`.
- Your project data persists via bind mounts (`backend/assets/`, `settings.json`, `workflows/`) — `docker compose down` won't lose anything.
- Both services bind to `127.0.0.1` only for privacy.
- API keys and `.env` are excluded from the build context via `.dockerignore`.

See [DOCKER.md](DOCKER.md) for details, troubleshooting, and configuration.

---

## ▶️ Running the App (Day-to-Day)

Once everything is installed (see Quick Start above), you just need to start the 3 services each time:

| Terminal | Command | URL |
| -------- | ------- | --- |
| 1 - ComfyUI | `python main.py` | http://localhost:8188 |
| 2 - Backend | `python main.py serve --reload` | http://localhost:8001 |
| 3 - Frontend | `npm run dev` | http://localhost:3000 |

> 💡 The backend also has an interactive API explorer at http://localhost:8001/docs

---

## 🧭 How to Use

Once the app is running in your browser:

1. **Create a project** - Click "New Project" or select an existing one.
2. **Build scenes** - In the left sidebar, create scenes and add reference assets (characters, locations, props). These form the "recipe" the AI uses to keep your film consistent.
3. **Create shots** - Click "New Shot" within a scene. The first shot is auto-established (wide shot). Subsequent shots open the **3D camera widget** where you can:
   - Drag the camera around the subject in 3D space
   - Use sliders for precise horizontal/vertical angle and zoom
   - See compass directions, FOV cone, and previous shot angles
   - Get warnings if you cross the 180° line
4. **Pick a preset** - Choose from cinematic presets (establishing, over-shoulder, close-up, POV, etc.) or position the camera manually.
5. **Generate frames** - Click "Create & Generate" (or press Ctrl+Enter). The AI creates a storyboard frame using your scene's reference images.
6. **Refine** - Click any shot to open its detail panel where you can:
   - Generate alternate camera angles
   - Create prompt variations
   - Retake failed generations
   - Navigate between shots with next/prev buttons
7. **Reorder & duplicate** - Drag shot cards to reorder them. Use the duplicate button to experiment with different prompts.
8. **Generate video** - Switch to the Camera Director tab to turn frames into video clips (text-to-video or image-to-video with camera movement).
9. **Assemble & export** - Arrange shots on the timeline, add dialogue and audio, then export to XML for your editing software.
10. **Apply LoRAs** - In any generation surface (Generate tab, Shot tab, Camera tab, Shot Create panel, Retake panel), expand **Advanced Settings** to add LoRAs with adjustable strength sliders. Upload new LoRAs directly from the UI. LoRAs are preserved when regenerating shots.
11. **Manage settings** - Click the **gear icon** (⚙) in the header to open the Settings panel where you can:
    - Link cloud API keys (Fal.ai, Replicate)
    - Upload model files to ComfyUI
    - Register custom ComfyUI workflows (with automatic model analysis and missing-model upload)
    - Driver dropdowns auto-refresh after workflow changes — no page reload needed

---

## 🎨 LoRA Support

AI Movie Studio 2 includes built-in LoRA (Low-Rank Adaptation) support for all local ComfyUI drivers. LoRAs let you fine-tune generation with style or character modifications.

### Using LoRAs

1. In any generation surface (Generate tab, Shot tab, Camera tab, Shot Create panel, Retake panel), expand **Advanced Settings**
2. The **LoRAs** section appears when a local ComfyUI driver is selected
3. Click **Add LoRA** to open a searchable dropdown of all LoRAs in ComfyUI's `models/loras/` directory
4. Select one or more LoRAs — each gets a strength slider (0–2, default 0.8)
5. Click the **upload icon** (⬆) to upload a new `.safetensors` LoRA file directly to ComfyUI
6. The LoRA list refreshes automatically after upload
7. LoRAs are preserved when regenerating shots (stored in the generation recipe)

### How It Works

- LoRAs are injected as `LoraLoader` nodes into the ComfyUI workflow JSON
- Multiple LoRAs chain sequentially (each LoRA feeds into the next)
- LoRA selections are passed via `extra_params.loras` in generation requests
- All local ComfyUI drivers (image, video, camera) support LoRAs
- The `supports_loras` flag on each driver controls UI visibility

### LoRA Upload Endpoint

- **`POST /api/generate/loras/upload`** — Uploads `.safetensors`, `.pt`, `.pth`, `.ckpt`, or `.gguf` files to ComfyUI's `models/loras/` directory
- Target directory resolved from `COMFY_LORAS_DIR`, `COMFY_MODELS_DIR`, or `COMFY_DIR` env vars

---

## ⚙️ Settings & Configuration

The Settings panel (gear icon ⚙ in the header) provides a UI for managing app configuration without editing `.env` files or code.

### Cloud API Keys

Link cloud generation services directly from the UI:

- **Fal.ai** — Enables cloud image and video models (Seedance, MiniMax H3, Nano Banana, etc.)
- **Replicate** — Enables cloud image models (MetaAI, Flux, SDXL) and Fish Speech TTS

Keys are stored locally in `backend/assets/settings.json` and loaded into environment variables at backend startup. After saving a key, **restart the backend** for cloud drivers to appear in dropdowns.

**Endpoints:**
- `GET /api/settings/api-keys` — List key status (masked values)
- `POST /api/settings/api-keys` — Save or update a key
- `DELETE /api/settings/api-keys/{key_name}` — Remove a key

### Model Upload

Upload checkpoint models (`.safetensors`, `.ckpt`, `.pt`) directly to ComfyUI's `models/checkpoints/` directory:

- **`GET /api/generate/models`** — Lists available checkpoints from ComfyUI
- **`POST /api/generate/models/upload`** — Uploads a model file
- Target directory resolved from `COMFY_CHECKPOINTS_DIR`, `COMFY_MODELS_DIR`, or `COMFY_DIR` env vars

> 💡 Models are stored in ComfyUI's directory — our app just queries ComfyUI's API to list them. No duplication.

---

## 🔧 Custom ComfyUI Workflows

You can add new AI models without writing any code. Build a workflow in ComfyUI, export it, and register it through the Settings panel.

### How to Add a Custom Workflow

1. **Build your workflow in ComfyUI** — Set up nodes, models, and parameters
2. **Export as API JSON** — In ComfyUI, click the menu → **Save (API Format)** → saves a `.json` file
3. **Open Settings** in AI Movie Studio — Click the gear icon (⚙) in the header
4. Scroll to **Custom ComfyUI Workflows** and click **Add Custom Workflow**
5. Fill in:
   - **Display Name** — What shows in the model dropdown (e.g. "My Custom Flux")
   - **Driver ID** — Internal ID, auto-generated from filename (e.g. `my_custom_flux`)
   - **Category** — Image or Video
   - **Workflow JSON** — Paste the JSON or click **Load from file** to upload the exported `.json`
6. **Review required models** — The app automatically analyzes the workflow JSON and lists all required models:
   - Models already in ComfyUI show a green **In ComfyUI** badge
   - Missing models show an **Upload** button — upload directly to the correct subdirectory (checkpoints, loras, vae, clip, unet, controlnet, etc.)
7. Click **Register Workflow** — The new model appears in all model dropdowns immediately (no page refresh needed)

### What Happens Behind the Scenes

- The workflow JSON is saved to `backend/core/workflows/{driver_id}.json`
- A driver entry is registered in `backend/assets/settings.json` under `custom_workflows`
- `list_image_drivers()` / `list_video_drivers()` automatically include custom workflows
- `get_image_driver()` / `get_video_driver()` instantiate a ComfyUI driver with the custom workflow
- LoRA injection works automatically (all custom workflows get `supports_loras: true`)

### Managing Custom Workflows

- All registered workflows are listed in the Settings panel
- Click the **trash icon** to delete a workflow (removes from `settings.json` + deletes the JSON file)
- Re-uploading with the same Driver ID updates the existing workflow
- You can register unlimited custom workflows

**Endpoints:**
- `GET /api/settings/workflows` — List custom workflows
- `POST /api/settings/workflows` — Register a new workflow
- `DELETE /api/settings/workflows/{driver_id}` — Delete a workflow
- `POST /api/settings/workflows/analyze` — Analyze workflow JSON for required models
- `POST /api/settings/workflows/check-models` — Check which required models exist in ComfyUI
- `POST /api/generate/models/upload-to` — Upload a model to a specific ComfyUI subdirectory

---

## 🎨 Available Image Models

| Model ID            | Display Name                | Type                          |
| ------------------- | --------------------------- | ----------------------------- |
| `z_image`           | Z-Image (ComfyUI)           | Text-to-image, 9 steps        |
| `qwen_image`        | Qwen Image (ComfyUI)        | Text-to-image, 20 steps       |
| `qwen_image_edit`   | Qwen Image Edit (ComfyUI)   | Image-to-image, 4 steps       |
| `qwen_multiangle`   | Qwen Multiangle (ComfyUI)   | Multi-reference, multi-angle  |
| `flux2`             | Flux 2 (ComfyUI)            | Text-to-image                 |
| `flux2_kontext`     | Flux 2 Kontext (ComfyUI)    | Multi-reference storyboard    |
| `krea2`             | Krea 2 (ComfyUI)            | Text-to-image                 |
| `fal_nano_banana`   | Nano Banana (Fal.ai)        | Text-to-image (cloud)         |
| `fal_krea`          | Krea (Fal.ai)               | Text-to-image (cloud)         |
| `fal_flux_dev`      | Flux Dev (Fal.ai)           | Text-to-image (cloud)         |
| `fal_flux_2`        | Flux 2 (Fal.ai)             | Text-to-image (cloud)         |
| `replicate_metaai`  | MetaAI (Replicate)          | Text-to-image (cloud)         |
| `replicate_flux_schnell` | Flux Schnell (Replicate) | Text-to-image (cloud)       |
| `replicate_sd_xl`   | SDXL (Replicate)            | Text-to-image (cloud)         |

> 💡 Cloud drivers only appear in the dropdown when the corresponding API key is set in `.env`.

---

## 🎬 Available Video Models

| Model ID              | Display Name              | Type                          |
| --------------------- | ------------------------- | ----------------------------- |
| `ltx_video_2_3`       | LTX Video 2.3 (ComfyUI)   | T2V, I2V, first-last frame    |
| `wan_video`           | Wan Video (ComfyUI)       | T2V, I2V, first-last frame    |
| `minimax_h3`          | MiniMax H3 (ComfyUI)      | T2V, I2V, reference-to-video  |
| `fal_seedance`        | Seedance v1 (Fal.ai)      | T2V, I2V, camera control      |
| `fal_seedance_2`      | Seedance 2 (Fal.ai)       | T2V, I2V, camera control      |
| `fal_seedance_2_5`    | Seedance 2.5 (Fal.ai)     | T2V, I2V, camera control      |
| `fal_minimax_h3`      | Minimax H3 (Fal.ai)       | T2V, I2V                      |

> 💡 Local video models require ComfyUI with the appropriate custom nodes installed. Cloud models require `FAL_KEY`.

---

## 🔊 Available Audio Models

| Model ID        | Display Name    | Type                          |
| --------------- | --------------- | ----------------------------- |
| `fish_speech`   | Fish Speech     | TTS, voice cloning            |

> ⚠️ **Audio is a work in progress.** The TTS and voice cloning pipeline is under active development and may not be fully functional yet.

---

## ⚙️ Environment Variables

All configuration is done through a single `.env` file in the `backend/` directory.

| Variable | Required? | Default | Description |
| -------- | --------- | ------- | ----------- |
| `COMFY_URL` | No (has default) | `http://127.0.0.1:8188` | URL of your local ComfyUI instance. Under Docker Compose, defaults to `host.docker.internal:8188`. |
| `COMFY_OUTPUT_DIR` | No | *(auto-detect)* | Path to ComfyUI's output folder (for reading saved text/metadata) |
| `COMFY_DIR` | No | - | Path to your ComfyUI installation. Used for LoRA/model uploads (resolves `models/loras/` and `models/checkpoints/`) |
| `COMFY_LORAS_DIR` | No | - | Direct path to ComfyUI's LoRAs directory (overrides `COMFY_DIR`/`COMFY_MODELS_DIR` for LoRA uploads) |
| `COMFY_CHECKPOINTS_DIR` | No | - | Direct path to ComfyUI's checkpoints directory (overrides `COMFY_DIR`/`COMFY_MODELS_DIR` for model uploads) |
| `COMFY_MODELS_DIR` | No | - | Path to ComfyUI's `models/` directory (used as fallback for both LoRA and checkpoint uploads) |
| `FAL_KEY` | No | - | Fal.ai API key. Enables cloud image + video models. Can also be set via Settings panel UI. |
| `REPLICATE_API_TOKEN` | No | - | Replicate API token. Enables cloud image models + Fish Speech TTS. Can also be set via Settings panel UI. |
| `FISH_SPEECH_URL` | No | - | URL for a self-hosted Fish Speech instance (alternative to Replicate-hosted TTS) |

> 💡 You only need **one** of the cloud API keys. If you only use local ComfyUI, just set `COMFY_URL` and skip the rest. API keys can also be managed via the Settings panel (gear icon in header) — they're stored in `backend/assets/settings.json`.

---

## 🧩 ComfyUI Custom Nodes

Local video models require specific custom nodes installed in ComfyUI. Here's what you need per model:

| Model | Required Custom Nodes |
| ----- | --------------------- |
| **LTX Video 2.3** | [LTXVideo](https://github.com/Lightricks/ComfyUI-LTXVideo) |
| **Wan Video** | [WanVideoWrapper](https://github.com/kijai/ComfyUI-WanVideoWrapper) |
| **MiniMax H3** | [MiniMax H3 nodes](https://github.com/kijai/ComfyUI-MiniMax) |

**Image models** (Z-Image, Qwen Image, Flux 2, Krea 2) require their respective custom nodes - check the ComfyUI Manager for the latest installations.

> ⚠️ Custom node compatibility changes frequently. If a model fails to load, update the custom node to the latest version via ComfyUI Manager.

---

## 📦 Required Model Files

Local models require specific `.safetensors` files downloaded into your ComfyUI `models/` directory. Cloud models (Fal.ai, Replicate) need **no downloads** — just API keys.

### Image Models

| Model | Model Files | ComfyUI Folder |
| ----- | ----------- | -------------- |
| **Z-Image Turbo** | `z_image_turbo_bf16.safetensors` | `models/unet/` |
| | `qwen_3_4b.safetensors` | `models/clip/` |
| | `ae.safetensors` | `models/vae/` |
| **Qwen Image** | `z_image_turbo_bf16.safetensors` | `models/unet/` |
| | `qwen_3_4b.safetensors` | `models/clip/` |
| | `ae.safetensors` | `models/vae/` |
| **Qwen Image Edit** | `qwen_image_edit_2511_bf16.safetensors` | `models/unet/` |
| | `qwen_2.5_vl_7b_fp8_scaled.safetensors` | `models/clip/` |
| | `qwen_image_vae.safetensors` | `models/vae/` |
| | `Qwen-Image-Edit-2511-Lightning-4steps-V1.0-bf16.safetensors` | `models/loras/` |
| **Qwen Multiangle** | Same as Qwen Image Edit, plus: | |
| | `qwen-image-edit-2511-multiple-angles-lora.safetensors` | `models/loras/` |
| **Flux 2** | `flux2_dev_fp8mixed.safetensors` | `models/unet/` |
| | `mistral_3_small_flux2_bf16.safetensors` | `models/clip/` |
| | `flux2-vae.safetensors` | `models/vae/` |
| **Flux 2 Kontext** | `flux1-dev-kontext_fp8_scaled.safetensors` | `models/unet/` |
| | `clip_l.safetensors` | `models/clip/` |
| | `t5xxl_fp8_e4m3fn_scaled.safetensors` | `models/clip/` |
| | `ae.safetensors` | `models/vae/` |
| **Krea 2** | *(handled by Krea2 custom node — no manual download)* | |

### Video Models

| Model | Model Files | ComfyUI Folder |
| ----- | ----------- | -------------- |
| **LTX Video 2.3** (basic T2V/I2V) | `ltx-video-2b-v0.9.5.safetensors` | `models/checkpoints/` |
| | `ltx-video-vae.safetensors` | `models/vae/` |
| **LTX Video 2.3** (first-last frame) | `ltx-2.3-22b-distilled-fp8.safetensors` | `models/checkpoints/` |
| | `gemma_3_12B_it_fp4_mixed.safetensors` | `models/text_encoders/` |
| **LTX Video 2.3** (image+audio-to-video) | `ltx-2.3-22b-dev-fp8.safetensors` | `models/checkpoints/` |
| | `gemma_3_12B_it_fp4_mixed.safetensors` | `models/text_encoders/` |
| | `ltx-2.3-spatial-upscaler-x2-1.1.safetensors` | `models/upscale_models/` |
| | `ltx_2.3_22b_distilled_1.1_lora_dynamic_fro09_avg_rank_111_bf16.safetensors` | `models/loras/` |
| | `gemma-3-12b-it-abliterated_lora_rank64_bf16.safetensors` | `models/loras/` |
| **MiniMax H3** (T2V/I2V) | `minimax_h3_fl2va_pruned_int8_convrot.safetensors` | `models/unet/` |
| | `qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors` | `models/clip/` |
| | `minimax_h3_video_vae_fp16.safetensors` | `models/vae/` |
| | `minimax_h3_audio_vae_fp32.safetensors` | `models/vae/` |
| **MiniMax H3** (reference-to-video) | `minimax_h3_ref2va_pruned_int8_convrot.safetensors` | `models/unet/` |
| | *(+ same CLIP and VAE files as above)* | |

> 💡 Model files can be found on [HuggingFace](https://huggingface.co/) or [CivitAI](https://civitai.com/). Search for the exact filename. FP8/INT8 variants are recommended for 12–16 GB VRAM GPUs.
>
> ⚠️ **Don't need all models?** Start with just **Z-Image** (fastest image model) and **LTX Video 2.3** (basic T2V/I2V). Add more as you need them. Cloud models (Fal.ai) require zero downloads.

---

## 🧩 How the Driver System Works

The app is **never hard-coded to one AI model**. Instead, it uses "Drivers" - small adapter modules that all speak the same interface. This means you can swap from local ComfyUI to cloud Fal.ai without touching the UI.

```
Frontend dropdown → Backend API → Driver Registry → ComfyUI / Fal / Replicate
```

Want to add a new model? Two options:

**Option 1 — No code (Custom Workflows):** Build a workflow in ComfyUI, export as API JSON, and register it via the Settings panel (gear icon in header). See [Custom Workflows](#-custom-comfyui-workflows) above.

**Option 2 — Code a new Driver:** Add a new Driver in `backend/core/drivers/`. The adapter pattern means no frontend changes are needed — the model appears in the UI automatically once registered.

```python
# backend/core/drivers/base.py  (conceptual)
class ImageDriver(ABC):
    @abstractmethod
    async def generate(self, prompt: str, references: list[bytes], **opts) -> bytes: ...
```

---

## 🛠️ Troubleshooting

**Generation status not updating**
- Ensure the backend was restarted after code changes.
- Check that ComfyUI is running and accessible at the `COMFY_URL`.

**403 Forbidden on generated images**
- The backend downloads images from ComfyUI and serves them locally.
- Verify `backend/assets/generated/` exists and is writable.

**Slow generation**
- Force SDPA attention backend: `$env:ATTN_BACKEND="sdpa"` (PowerShell).
- Use turbo/lightning models (Z-Image Turbo = 9 steps, Qwen Edit Lightning = 4 steps).
- Reduce resolution if needed.

**Frontend can't reach API**
- Backend must be on port 8001 (configured in `next.config.mjs`).
- Check http://localhost:8001/health responds.
- If running the backend on a different machine (headless server, LAN), set `BACKEND_URL` in the frontend environment to point to the backend's IP. The Next.js proxy handles routing — no direct browser-to-backend calls needed.
- Collection endpoint slash-redirects have been fixed (thanks to [@edasque](https://github.com/edasque)) — `/api/projects` and `/api/projects/` both resolve without redirect.

**3D camera widget not appearing / WebGL error**
- The 3D widget requires a WebGL context. If it fails, a slider-based fallback is shown automatically.
- Close other browser tabs using WebGL (maps, games, other dev sessions) - browsers limit concurrent contexts (~16).
- Enable hardware acceleration in your browser settings and restart.
- A hard refresh (Ctrl+Shift+R) or fresh tab often fixes context exhaustion from hot reloads.

---

## ❓ FAQ

**Do I need a GPU?**
No. Cloud models (Fal.ai, Replicate) handle generation on their servers. You only need a GPU if you want to run local models via ComfyUI.

**Can I use cloud-only mode without ComfyUI?**
Yes. Set `FAL_KEY` and/or `REPLICATE_API_TOKEN` in your `.env` and skip starting ComfyUI. Cloud image and video models will appear in the dropdowns automatically.

**Which cloud provider should I choose - Fal or Replicate?**
Fal.ai offers the best video models (Seedance, MiniMax H3) and is generally faster. Replicate is great for image models (MetaAI, Flux) and hosts Fish Speech for TTS. You can set both keys and use models from either provider.

**Where is my project data stored?**
All projects, scenes, shots, and assets are stored locally in `backend/assets/` (the "Vault"). No data leaves your machine unless you use cloud generation APIs.

**Can I use this for commercial projects?**
The software itself is AGPLv3 licensed. For commercial use without open-sourcing your code, see the [Licensing](#-licensing--commercial-use) section. AI-generated content is subject to the terms of whichever model you use - check your provider's usage rights.

**How do I add a new AI model?**
Two ways: (1) Build a workflow in ComfyUI, export as API JSON, and register it via the Settings panel (gear icon in header) — no code needed. The app automatically analyzes the workflow JSON and tells you which models are required and whether they're already in ComfyUI. Missing models can be uploaded directly from the same UI. (2) Add a new Driver class in `backend/core/drivers/` for more complex integrations. See [Custom Workflows](#-custom-comfyui-workflows) for details.

**How do I add LoRAs?**
In any generation surface (Generate tab, Shot tab, Camera tab, Shot Create panel, Retake panel), expand Advanced Settings and use the LoRA selector. You can upload `.safetensors` LoRA files directly from the UI — they're saved to ComfyUI's `models/loras/` directory. LoRAs are preserved when regenerating shots. See [LoRA Support](#-lora-support) for details.

**How do I set API keys without editing .env?**
Click the gear icon (⚙) in the header to open the Settings panel. You can add, update, and remove Fal.ai and Replicate API keys from there. Keys are stored in `backend/assets/settings.json` and loaded at backend startup.

**Can I connect to a remote/cloud ComfyUI instance?**
Yes. Open the Settings panel → **ComfyUI Server** section. Enter your remote ComfyUI URL (e.g. `https://my-comfy-cloud.example.com`) and an optional auth token (Bearer). Check the "Remote / cloud server" checkbox. All HTTP calls — prompt submission, image download, LoRA/model listing — will include the auth header automatically. This lets you run ComfyUI on a GPU server or managed service (ComfyDeploy, Modal, RunPod) while controlling it from your local machine.

**Can I control sampling steps and CFG scale?**
Yes. In any generation tab (Generate, Shots, Camera Director), expand **Advanced Settings** and use the **Steps & CFG** sliders. Set them to any value to override the workflow's defaults, or leave them at "auto" (0) to use the original workflow settings. These are passed through `extra_params` and injected into the sampler node at runtime — works for both image and video generation.

**The Settings panel has collapsible sections — how do they work?**
Each section (ComfyUI Server, Cloud API Keys, Models, LoRAs, Custom Workflows) is an independent collapsible card. Click the header to expand or collapse. Badges show item counts (e.g. "3 LoRAs", "2 connected") so you can see what's configured at a glance. The ComfyUI Server section is open by default since it's the first thing you need to configure.

---

## 🎬 Project History

This project began as an ambitious AI filmmaking tool over a year ago. The original version packed in every feature imaginable - but the interface became cluttered, the workflow was hard to navigate, and the tooling overhead outweighed the creative benefits. Rather than patching the old codebase, I started over from scratch with a clear goal: **a clean, focused UI with a streamlined creative flow.** This is version 2 - simpler, faster, and built around the actual filmmaking workflow rather than a kitchen-sink feature list. Additional tools like inpainting will be added once they fit naturally into the flow.

---

## 🗺️ Roadmap

- [x] LoRA support (upload, select, strength control) — available in all 5 generation surfaces
- [x] Settings panel (API keys, model upload, custom workflows, collapsible UI)
- [x] Custom ComfyUI workflow registration (no-code model addition)
- [x] Workflow model analysis — auto-detect required models and check against ComfyUI
- [x] Auto-refresh driver dropdowns after workflow register/delete
- [x] Remote/cloud ComfyUI server support (URL + auth token via Settings)
- [x] Steps & CFG override controls in all generation tabs
- [x] Long Take mode — keyframe interpolation for continuous shots *(Experimental)*
- [ ] Inpainting & masking tools
- [ ] PostgreSQL migration for the Vault
- [ ] Video timeline preview & scrubbing
- [ ] Voice cloning / lip-sync pipeline
- [x] Cloud-only mode (no local ComfyUI required — set API keys via Settings panel)
- [ ] Multi-user project sharing

---

## ⚖️ Licensing & Commercial Use

This project is open-source and licensed under the **GNU Affero General Public License v3.0 (AGPLv3)**.

### For Individuals and Open-Source Developers:
You are free to use, modify, and share this software completely for free, provided that any derivative work or hosted service you build with it is also fully open-sourced under the AGPLv3.

### For Commercial Entities & Businesses:
If you want to use this software, modify it, or embed it into a proprietary commercial product without being forced to open-source your own code, **the AGPLv3 license does not permit this**.

We offer **Commercial Licenses** for enterprise use, white-labeling, and closed-source integrations. Please contact nathan.mcconnell@sandboxentmt.com to discuss commercial licensing terms.

---

## 🙏 Acknowledgments

This project stands on the shoulders of giants:

- **[ComfyUI](https://github.com/comfyanonymous/ComfyUI)** - The local AI generation engine that powers image and video workflows
- **[Fal.ai](https://fal.ai/)** - Cloud GPU infrastructure for fast video and image generation
- **[Replicate](https://replicate.com/)** - Cloud model hosting and API platform
- **[Fish Speech](https://github.com/fishaudio/fish-speech)** - Open-source TTS and voice cloning
- **[FastAPI](https://fastapi.tiangela.com/)** - Backend web framework
- **[Next.js](https://nextjs.org/)** & **[React](https://react.dev/)** - Frontend framework
- **[React Three Fiber](https://r3f.docs.pmnd.rs/)** - 3D storyboard canvas (Three.js for React)
- **[Tailwind CSS](https://tailwindcss.com/)** - UI styling
- **[Zustand](https://github.com/pmndrs/zustand)** - State management

Built with respect for the open-source AI community. 🎬
