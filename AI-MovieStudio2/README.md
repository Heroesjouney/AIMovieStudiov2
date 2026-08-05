# AI Movie Studio 2

A professional, model-agnostic AI filmmaking workstation. Plan scenes, generate storyboard frames, manage assets, and orchestrate AI generation through local ComfyUI or cloud APIs (Fal/Replicate).

## Architecture

```
/backend   - FastAPI server (Python) + Vault (JSON file storage)
/frontend  - Next.js 14 + React + Tailwind CSS + React Three Fiber
```

## Prerequisites

- **Python 3.10+** with pip
- **Node.js 18+** with npm
- **ComfyUI** running locally (for local image/video generation)
- **GPU** with CUDA support (recommended)

## Setup

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

## Running the App

You need **three services** running simultaneously:

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

- API server: http://localhost:8001
- API docs: http://localhost:8001/docs
- Health check: http://localhost:8001/health

### Terminal 3 — Frontend (Next.js)

```bash
cd frontend
npm run dev
```

- App: http://localhost:3000

## Usage

1. Open http://localhost:3000 in your browser
2. Create or select a project
3. Build scenes and shots in the storyboard
4. Generate AI images via the asset panel or shot detail panel
5. Select a ComfyUI model driver from the dropdown (Z-Image, Qwen Image, Flux 2, etc.)
6. Generated images are saved to `backend/assets/generated/` and served at `/assets/generated/`

## Available Image Models

| Model ID | Display Name | Type |
|---|---|---|
| `z_image` | Z-Image Turbo (ComfyUI) | Text-to-image, 9 steps |
| `qwen_image` | Qwen Image (ComfyUI) | Text-to-image, 20 steps |
| `qwen_image_edit` | Qwen Image Edit (ComfyUI) | Image-to-image, 4 steps |
| `qwen_multiangle` | Qwen Multiangle (ComfyUI) | Multi-reference, multi-angle |
| `flux2` | Flux 2 (ComfyUI) | Text-to-image |
| `flux2_kontext` | Flux 2 Kontext (ComfyUI) | Multi-reference storyboard |
| `krea2` | Krea 2 (ComfyUI) | Text-to-image |

## Project Structure

```
AI-MovieStudio2/
├── backend/
│   ├── api/                 # FastAPI route handlers
│   │   ├── routes_assets.py
│   │   ├── routes_shots.py
│   │   ├── routes_generate.py
│   │   └── ...
│   ├── core/
│   │   ├── drivers/         # AI model adapters
│   │   │   ├── base.py      # Abstract base classes
│   │   │   ├── comfy_image.py
│   │   │   ├── comfy_video.py
│   │   │   ├── fal_image.py
│   │   │   └── ...
│   │   ├── workflows/       # ComfyUI workflow JSON templates
│   │   └── schemas/         # Pydantic models
│   ├── assets/              # The Vault (project data + generated images)
│   ├── app.py               # FastAPI app
│   ├── main.py              # CLI entry point
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── app/             # Next.js pages
│   │   ├── components/
│   │   │   ├── studio/      # 3D stage canvas
│   │   │   ├── shots/       # Storyboard + shot detail
│   │   │   └── library/     # Asset grid
│   │   └── lib/
│   │       ├── api.ts       # API client
│   │       └── store.ts     # Zustand state management
│   ├── next.config.mjs      # API proxy config
│   └── package.json
└── README.md
```

## Troubleshooting

**Generation status not updating:**
- Ensure the backend was restarted after code changes
- Check that ComfyUI is running and accessible at the `COMFY_URL`

**403 Forbidden on generated images:**
- The backend downloads images from ComfyUI and serves them locally
- Verify `backend/assets/generated/` directory exists and is writable

**Slow generation:**
- Force SDPA attention backend: `$env:ATTN_BACKEND="sdpa"` (PowerShell)
- Use turbo/lightning models (Z-Image Turbo = 9 steps, Qwen Edit Lightning = 4 steps)
- Reduce resolution if needed

**Frontend can't reach API:**
- Backend must be on port 8001 (configured in `next.config.mjs`)
- Check http://localhost:8001/health responds
