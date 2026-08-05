# 🎬 AI Movie Studio 2

[![Python](https://img.shields.io/badge/Python-3.10+-3776AB?logo=python&logoColor=white)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.109+-009688?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![Next.js](https://img.shields.io/badge/Next.js-14.2-000000?logo=next.js&logoColor=white)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-18.3-61DAFB?logo=react&logoColor=white)](https://react.dev/)
[![Three.js](https://img.shields.io/badge/Three.js-R3F-000000?logo=three.js&logoColor=white)](https://threejs.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-3.4-38BDF8?logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

> A professional, **model-agnostic** AI filmmaking workstation. Plan scenes, generate storyboard frames, manage assets, and orchestrate AI generation through local **ComfyUI** or cloud APIs (**Fal** / **Replicate**).

---

## ✨ Features

- **🗂️ Project & Asset Vault** — Local JSON-based storage for projects, scenes, shots, cameras, and assets. Ready to migrate to PostgreSQL.
- **🎬 Storyboard & 2.5D Stage** — A React Three Fiber canvas for blocking shots in 3D space with camera framing.
- **🧠 Script & Continuity Logic** — Parse scripts into shots, maintain visual continuity across scenes, and build a Style Bible.
- **🔌 The Driver System** — Model-agnostic AI orchestration. Swap between local ComfyUI workflows and cloud providers without touching the UI.
  - **Image:** Z-Image, Qwen Image, Qwen Image Edit, Qwen Multiangle, Flux 2, Flux 2 Kontext, Krea 2
  - **Video:** ComfyUI video pipelines + Fal / Replicate drivers
  - **Camera:** ComfyUI camera control drivers
  - **Audio:** Fish Speech driver
- **🖼️ Multi-Reference Generation** — Use character/scene reference images to keep continuity across frames.
- **🎞️ Timeline & Export** — Assemble shots into a timeline and export (XML via Jinja2 templates).
- **⚡ Real-Time Status** — WebSocket-backed generation status updates.

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
│   │   │   ├── studio/      # 3D stage canvas (R3F)
│   │   │   ├── shots/       # Storyboard + shot detail
│   │   │   ├── library/     # Asset grid
│   │   │   ├── camera/      # Camera controls
│   │   │   ├── timeline/    # Shot timeline
│   │   │   └── export/      # Export panel
│   │   └── lib/
│   │       ├── api.ts       # API client
│   │       └── store.ts     # Zustand state management
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
3. Build scenes and shots in the storyboard.
4. Block shots on the 2.5D stage and frame the camera.
5. Generate AI images via the asset panel or shot detail panel.
6. Select a ComfyUI model driver from the dropdown (Z-Image, Qwen Image, Flux 2, etc.).
7. Generated images are saved to `backend/assets/generated/` and served at `/assets/generated/`.
8. Assemble shots on the timeline and export.

---

## 🎨 Available Image Models

| Model ID            | Display Name                | Type                          |
| ------------------- | --------------------------- | ----------------------------- |
| `z_image`           | Z-Image Turbo (ComfyUI)     | Text-to-image, 9 steps        |
| `qwen_image`        | Qwen Image (ComfyUI)        | Text-to-image, 20 steps       |
| `qwen_image_edit`   | Qwen Image Edit (ComfyUI)   | Image-to-image, 4 steps       |
| `qwen_multiangle`   | Qwen Multiangle (ComfyUI)   | Multi-reference, multi-angle  |
| `flux2`             | Flux 2 (ComfyUI)            | Text-to-image                 |
| `flux2_kontext`     | Flux 2 Kontext (ComfyUI)    | Multi-reference storyboard    |
| `krea2`             | Krea 2 (ComfyUI)            | Text-to-image                 |

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
