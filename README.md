# 🎬 AI Movie Studio 2

[![Python](https://img.shields.io/badge/Python-3.10+-3776AB?logo=python&logoColor=white)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.109+-009688?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![Next.js](https://img.shields.io/badge/Next.js-14.2-000000?logo=next.js&logoColor=white)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-18.3-61DAFB?logo=react&logoColor=white)](https://react.dev/)
[![Three.js](https://img.shields.io/badge/Three.js-R3F-000000?logo=three.js&logoColor=white)](https://threejs.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-3.4-38BDF8?logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

> A professional, **model-agnostic** AI filmmaking workstation. Plan scenes, generate storyboard frames, manage assets, and orchestrate AI generation through local **ComfyUI** or cloud APIs (**Fal** / **Replicate**).
>
> ⚠️ **Work in Progress** — This project is under active development. Features may change, and some pipelines are experimental. Expect breaking changes between updates.

![AI Movie Studio 2 — Project Workspace](docs/screenshot.png)

---

## ✨ Features

- **🗂️ Project & Asset Vault** — Local JSON-based storage for projects, scenes, shots, cameras, and assets. Ready to migrate to PostgreSQL.
- **🎬 Storyboard & 2.5D Stage** — A React Three Fiber canvas for blocking shots in 3D space with camera framing, featuring a 3D camera angle widget with drag-to-position, compass rose, FOV cone, 180° rule visualization, and action axis tracking.
- **🧠 Script & Continuity Logic** — Parse scripts into shots, maintain visual continuity across scenes, and build a Style Bible.
- **🔌 The Driver System** — Model-agnostic AI orchestration. Swap between local ComfyUI workflows and cloud providers without touching the UI.
  - **Image:** Z-Image, Qwen Image, Qwen Image Edit, Qwen Multiangle, Flux 2, Flux 2 Kontext, Krea 2
  - **Video:** ComfyUI video pipelines + Fal / Replicate drivers
  - **Camera:** ComfyUI camera control drivers
  - **Audio:** Fish Speech driver
- **🖼️ Multi-Reference Generation** — Use character/scene reference images to keep continuity across frames.
- **🎞️ Timeline & Export** — Assemble shots into a timeline and export (XML via Jinja2 templates).
- **⚡ Real-Time Status** — WebSocket-backed generation status updates with elapsed timers.
- **🎛️ Shot Composition Tools** — Cinematic presets library, shot type quick-select, art style & aspect ratio controls, advanced settings (negative prompt, seed, denoise, CFG, steps), and seed randomization.
- **📸 Multi-Angle & Variations** — Generate multiple camera angles per shot, create prompt variations, and retake failed generations.
- **🔀 Shot Management** — Drag-and-drop reordering, shot duplication, next/previous navigation, keyboard shortcuts (Ctrl+Enter to generate), and lightbox image viewer.

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
│   │   ├── routes_generate.py
│   │   ├── routes_projects.py
│   │   ├── routes_render.py
│   │   ├── routes_scenes.py
│   │   ├── routes_shots.py
│   │   └── routes_timeline.py
│   ├── core/
│   │   ├── drivers/         # AI model adapters (the "Driver System")
│   │   │   ├── base.py              # Abstract base classes
│   │   │   ├── comfy_image.py
│   │   │   ├── comfy_video.py
│   │   │   ├── comfy_camera.py
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
│   │   └── status/          # Generation status tracking
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
└── README.md
```

---

## ✅ Prerequisites

- **Python 3.10+** with `pip`
- **Node.js 18+** with `npm`
- **ComfyUI** running locally (for local image/video generation)
- **GPU** with CUDA support (recommended for local generation)

---

## 🚀 Setup

### 1. Backend

```bash
cd backend
pip install -r requirements.txt
```

Create a `.env` file in the `backend/` directory (optional — only needed for cloud drivers):

```env
COMFY_URL=http://127.0.0.1:8188

# Cloud providers (optional)
FAL_KEY=your_fal_api_key
REPLICATE_API_TOKEN=your_replicate_token
```

### 2. Frontend

```bash
cd frontend
npm install
```

### 3. ComfyUI

Start ComfyUI separately (default port 8188):

```bash
cd /path/to/ComfyUI
python main.py
```

If you get Flash Attention warnings on non-Ampere GPUs, force SDPA:

```powershell
# Windows PowerShell
$env:ATTN_BACKEND="sdpa"
python main.py
```

---

## ▶️ Running the App

You need **three services** running simultaneously.

### Terminal 1 — ComfyUI

```bash
cd /path/to/ComfyUI
python main.py
```

### Terminal 2 — Backend (FastAPI)

```bash
cd backend
python main.py serve --reload
```

| URL                              | Description        |
| -------------------------------- | ------------------ |
| http://localhost:8001            | API root           |
| http://localhost:8001/docs       | Interactive API docs |
| http://localhost:8001/health     | Health check       |

### Terminal 3 — Frontend (Next.js)

```bash
cd frontend
npm run dev
```

App: **http://localhost:3000**

---

## 🧭 Usage

1. Open http://localhost:3000 in your browser.
2. Create or select a project.
3. Create scenes in the left sidebar — add reference assets (characters, locations, props) to build a scene recipe.
4. Create shots within a scene. The first shot is auto-established; subsequent shots open the 3D camera angle widget for precise positioning.
5. Use the 3D widget to drag the camera around the subject, or use the slider controls. The widget shows compass directions, FOV cone, previous shot angles, and 180° rule warnings.
6. Pick a cinematic preset (establishing, over-shoulder, close-up, POV, etc.) or manually set horizontal/vertical angle and zoom.
7. Generate AI frames via the shot create panel or regenerate from shot cards. Advanced settings include negative prompt, seed (with randomize button), denoise, CFG, and steps.
8. In shot detail: generate multi-angle variants, create prompt variations, retake failed generations, and navigate between shots with next/prev buttons.
9. Drag-and-drop shot cards to reorder. Duplicate shots to experiment with different prompts.
10. Switch to the Camera Director tab for video generation (text-to-video, image-to-video with camera control).
11. Assemble shots on the timeline, add dialogue and audio, then export.

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

---

## 🧩 The Driver System

The Driver System is the core design principle: **the app is never hard-coded to one model.** Generic Drivers implement a common interface (`base.py`) so the API layer can talk to any provider uniformly.

```python
# backend/core/drivers/base.py  (conceptual)
class ImageDriver(ABC):
    @abstractmethod
    async def generate(self, prompt: str, references: list[bytes], **opts) -> bytes: ...
```

Adding a new model = adding a new Driver. No frontend changes required.

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

**3D camera widget not appearing / WebGL error**
- The 3D widget requires a WebGL context. If it fails, a slider-based fallback is shown automatically.
- Close other browser tabs using WebGL (maps, games, other dev sessions) — browsers limit concurrent contexts (~16).
- Enable hardware acceleration in your browser settings and restart.
- A hard refresh (Ctrl+Shift+R) or fresh tab often fixes context exhaustion from hot reloads.

---

## 🗺️ Roadmap

- [ ] PostgreSQL migration for the Vault
- [ ] Video timeline preview & scrubbing
- [ ] Voice cloning / lip-sync pipeline
- [ ] Cloud-only mode (no local ComfyUI required)
- [ ] Multi-user project sharing

---

## 📄 License

MIT — see [LICENSE](LICENSE).
