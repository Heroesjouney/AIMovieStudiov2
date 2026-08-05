"""
AI Movie Studio 2 - FastAPI Application

Main web server for the AI Movie Studio 2 backend.
Provides REST API endpoints for asset management, generation, rendering, and export.

Usage:
    uvicorn app:app --reload --port 8001

    Or via main.py:
    python main.py serve
"""

from contextlib import asynccontextmanager
from datetime import datetime
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from dotenv import load_dotenv

load_dotenv()

VAULT_DIR = Path(__file__).parent / "assets"
VAULT_DIR.mkdir(parents=True, exist_ok=True)


@asynccontextmanager
async def lifespan(app: FastAPI):
    print("[*] AI Movie Studio 2 - Starting up...")
    print(f"    Time: {datetime.utcnow().isoformat()}")
    print(f"    Vault: {VAULT_DIR}")
    yield
    print("[*] AI Movie Studio 2 - Shutting down...")


app = FastAPI(
    title="AI Movie Studio 2",
    description="Professional AI Filmmaking Workstation API",
    version="2.0.0",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)

# Serve static asset files (images, videos, audio)
app.mount("/assets", StaticFiles(directory=str(VAULT_DIR)), name="assets")


@app.get("/health", tags=["System"])
async def health_check():
    return {
        "status": "healthy",
        "service": "AI Movie Studio 2",
        "version": "2.0.0",
        "timestamp": datetime.utcnow().isoformat(),
    }


@app.get("/", tags=["System"])
async def root():
    return {
        "message": "Welcome to AI Movie Studio 2 API",
        "docs": "/docs",
        "health": "/health",
    }


# API Routers
from api.routes_assets import router as assets_router
from api.routes_scenes import router as scenes_router
from api.routes_shots import router as shots_router
from api.routes_generate import router as generate_router
from api.routes_render import router as render_router
from api.routes_audio import router as audio_router
from api.routes_timeline import router as timeline_router
from api.routes_export import router as export_router
from api.routes_projects import router as projects_router

app.include_router(projects_router, prefix="/api/projects", tags=["Projects"])
app.include_router(assets_router, prefix="/api/assets", tags=["Assets"])
app.include_router(scenes_router, prefix="/api/scenes", tags=["Scenes"])
app.include_router(shots_router, prefix="/api/shots", tags=["Shots"])
app.include_router(generate_router, prefix="/api/generate", tags=["Generate"])
app.include_router(render_router, prefix="/api/render", tags=["Render"])
app.include_router(audio_router, prefix="/api/audio", tags=["Audio"])
app.include_router(timeline_router, prefix="/api/timeline", tags=["Timeline"])
app.include_router(export_router, prefix="/api/export", tags=["Export"])
