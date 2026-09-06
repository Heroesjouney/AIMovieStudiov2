"""
Settings Routes - API key management and app configuration.

Stores API keys in a local JSON file (settings.json) in the vault directory.
Keys are loaded into environment variables at startup so drivers can detect them.
"""

import json
import os
from pathlib import Path
from fastapi import APIRouter, HTTPException, UploadFile, File
from pydantic import BaseModel
from typing import Optional, Dict, List

router = APIRouter()

VAULT_DIR = Path(__file__).parent.parent / "assets"
SETTINGS_FILE = VAULT_DIR / "settings.json"
WORKFLOWS_DIR = Path(__file__).parent.parent / "core" / "workflows"

# Supported API key providers
SUPPORTED_KEYS = {
    "FAL_KEY": {
        "label": "Fal.ai API Key",
        "description": "Enables cloud image and video generation via Fal.ai",
        "url": "https://fal.ai/dashboard/keys",
    },
    "REPLICATE_API_TOKEN": {
        "label": "Replicate API Token",
        "description": "Enables cloud image and audio generation via Replicate",
        "url": "https://replicate.com/account/api-tokens",
    },
}


def _load_settings() -> dict:
    """Load settings from the JSON file."""
    if SETTINGS_FILE.exists():
        try:
            return json.loads(SETTINGS_FILE.read_text())
        except (json.JSONDecodeError, IOError):
            pass
    return {}


def _save_settings(data: dict):
    """Save settings to the JSON file."""
    VAULT_DIR.mkdir(parents=True, exist_ok=True)
    SETTINGS_FILE.write_text(json.dumps(data, indent=2))


def load_api_keys_into_env():
    """Load saved API keys and ComfyUI config into environment variables at startup."""
    settings = _load_settings()
    api_keys = settings.get("api_keys", {})
    for key_name, value in api_keys.items():
        if value and key_name not in os.environ:
            os.environ[key_name] = value
            print(f"[Settings] Loaded API key '{key_name}' from settings.json")

    comfy_config = settings.get("comfy_config", {})
    if comfy_config.get("url"):
        os.environ["COMFY_URL"] = comfy_config["url"]
        print(f"[Settings] Loaded ComfyUI URL from settings.json: {comfy_config['url']}")
    if comfy_config.get("auth_token"):
        os.environ["COMFY_AUTH_TOKEN"] = comfy_config["auth_token"]


@router.get("/api-keys")
async def get_api_keys():
    """Return the current API key configuration (values masked)."""
    settings = _load_settings()
    api_keys = settings.get("api_keys", {})

    result = {}
    for key_name, info in SUPPORTED_KEYS.items():
        value = api_keys.get(key_name, "")
        result[key_name] = {
            "label": info["label"],
            "description": info["description"],
            "url": info["url"],
            "is_set": bool(value),
            "masked_value": value[:8] + "..." + value[-4:] if len(value) > 12 else ("***" if value else ""),
        }
    return result


class SaveApiKeyRequest(BaseModel):
    key_name: str
    value: str


@router.post("/api-keys")
async def save_api_key(req: SaveApiKeyRequest):
    """Save or update an API key."""
    if req.key_name not in SUPPORTED_KEYS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported key: {req.key_name}. Supported: {list(SUPPORTED_KEYS.keys())}",
        )

    settings = _load_settings()
    if "api_keys" not in settings:
        settings["api_keys"] = {}

    settings["api_keys"][req.key_name] = req.value
    _save_settings(settings)

    # Update env var immediately
    os.environ[req.key_name] = req.value
    print(f"[Settings] Saved API key '{req.key_name}'")

    return {"status": "ok", "key_name": req.key_name}


@router.delete("/api-keys/{key_name}")
async def delete_api_key(key_name: str):
    """Remove an API key."""
    if key_name not in SUPPORTED_KEYS:
        raise HTTPException(status_code=400, detail=f"Unsupported key: {key_name}")

    settings = _load_settings()
    api_keys = settings.get("api_keys", {})

    if key_name in api_keys:
        del api_keys[key_name]
        settings["api_keys"] = api_keys
        _save_settings(settings)

    # Remove from env
    if key_name in os.environ:
        del os.environ[key_name]

    print(f"[Settings] Deleted API key '{key_name}'")
    return {"status": "ok", "key_name": key_name}


# =============================================================================
# ComfyUI Server Configuration
# =============================================================================


@router.get("/comfy-config")
async def get_comfy_config():
    """Return the current ComfyUI server configuration."""
    settings = _load_settings()
    comfy = settings.get("comfy_config", {})
    return {
        "url": comfy.get("url", os.getenv("COMFY_URL", "http://127.0.0.1:8188")),
        "auth_token": comfy.get("auth_token", ""),
        "is_remote": comfy.get("is_remote", False),
    }


class SaveComfyConfigRequest(BaseModel):
    url: str
    auth_token: Optional[str] = ""
    is_remote: bool = False


@router.post("/comfy-config")
async def save_comfy_config(req: SaveComfyConfigRequest):
    """Save ComfyUI server configuration."""
    settings = _load_settings()
    settings["comfy_config"] = {
        "url": req.url,
        "auth_token": req.auth_token or "",
        "is_remote": req.is_remote,
    }
    _save_settings(settings)

    # Update env immediately
    os.environ["COMFY_URL"] = req.url
    if req.auth_token:
        os.environ["COMFY_AUTH_TOKEN"] = req.auth_token
    elif "COMFY_AUTH_TOKEN" in os.environ:
        del os.environ["COMFY_AUTH_TOKEN"]

    print(f"[Settings] Saved ComfyUI config: url={req.url}, remote={req.is_remote}")
    return {"status": "ok"}


# =============================================================================
# Custom Workflows
# =============================================================================


def get_custom_workflows() -> List[dict]:
    """Return list of custom workflow registrations from settings.json."""
    settings = _load_settings()
    return settings.get("custom_workflows", [])


def get_custom_workflow_by_id(driver_id: str) -> Optional[dict]:
    """Find a custom workflow by its driver_id."""
    for wf in get_custom_workflows():
        if wf.get("driver_id") == driver_id:
            return wf
    return None


@router.get("/workflows")
async def list_workflows():
    """List all custom workflows registered via the UI."""
    return {"workflows": get_custom_workflows()}


class RegisterWorkflowRequest(BaseModel):
    driver_id: str
    display_name: str
    category: str  # "image" or "video"
    workflow_json: dict
    supported_features: List[str] = ["text_to_image"]


@router.post("/workflows")
async def register_workflow(req: RegisterWorkflowRequest):
    """Register a custom ComfyUI workflow.

    Saves the workflow JSON to core/workflows/ and adds a driver entry to settings.json.
    """
    driver_id = req.driver_id.strip()
    if not driver_id or not driver_id.replace("_", "").isalnum():
        raise HTTPException(status_code=400, detail="driver_id must be alphanumeric with underscores only")

    if req.category not in ("image", "video"):
        raise HTTPException(status_code=400, detail="category must be 'image' or 'video'")

    # Check for conflicts with built-in drivers
    from core.drivers import list_image_drivers, list_video_drivers
    existing_ids = {d.driver_id for d in list_image_drivers() + list_video_drivers()}
    # Allow re-uploading (updating) existing custom ones
    custom_ids = {wf["driver_id"] for wf in get_custom_workflows()}
    if driver_id in existing_ids and driver_id not in custom_ids:
        raise HTTPException(status_code=409, detail=f"driver_id '{driver_id}' conflicts with a built-in driver")

    # Save workflow JSON file
    WORKFLOWS_DIR.mkdir(parents=True, exist_ok=True)
    workflow_path = WORKFLOWS_DIR / f"{driver_id}.json"
    workflow_path.write_text(json.dumps(req.workflow_json, indent=2))
    print(f"[Workflows] Saved workflow JSON to {workflow_path}")

    # Register in settings.json
    settings = _load_settings()
    if "custom_workflows" not in settings:
        settings["custom_workflows"] = []

    entry = {
        "driver_id": driver_id,
        "display_name": req.display_name,
        "category": req.category,
        "supported_features": req.supported_features,
        "workflow_file": f"{driver_id}.json",
        "supports_loras": True,
    }

    # Update or append
    existing_idx = None
    for i, wf in enumerate(settings["custom_workflows"]):
        if wf["driver_id"] == driver_id:
            existing_idx = i
            break
    if existing_idx is not None:
        settings["custom_workflows"][existing_idx] = entry
    else:
        settings["custom_workflows"].append(entry)

    _save_settings(settings)
    print(f"[Workflows] Registered custom driver '{driver_id}' ({req.display_name})")

    return {"status": "ok", "driver_id": driver_id, "entry": entry}


@router.delete("/workflows/{driver_id}")
async def delete_workflow(driver_id: str):
    """Remove a custom workflow."""
    settings = _load_settings()
    custom = settings.get("custom_workflows", [])

    original_len = len(custom)
    custom = [wf for wf in custom if wf["driver_id"] != driver_id]

    if len(custom) == original_len:
        raise HTTPException(status_code=404, detail=f"Custom workflow '{driver_id}' not found")

    settings["custom_workflows"] = custom
    _save_settings(settings)

    # Optionally delete the workflow JSON file
    workflow_path = WORKFLOWS_DIR / f"{driver_id}.json"
    if workflow_path.exists():
        workflow_path.unlink()

    print(f"[Workflows] Deleted custom workflow '{driver_id}'")
    return {"status": "ok", "driver_id": driver_id}
