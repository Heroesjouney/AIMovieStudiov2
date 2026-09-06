"""
Shared LoRA injection utility for ComfyUI drivers.

Injects LoraLoader nodes into a ComfyUI workflow graph, chaining them
between the checkpoint loader and all downstream consumers (samplers,
CLIPTextEncode, etc.).
"""

import json
from typing import Dict, Any, List, Optional


def inject_loras(workflow: dict, loras: List[Dict[str, Any]]) -> dict:
    """Inject LoraLoader nodes into a ComfyUI workflow.

    Args:
        workflow: The parsed ComfyUI workflow JSON (node_id -> node dict).
        loras: List of {"name": "filename.safetensors", "strength": 0.8}.

    Returns:
        A new workflow dict with LoraLoader nodes inserted.
    """
    if not loras:
        return workflow

    wf = json.loads(json.dumps(workflow))  # Deep copy

    # Find the checkpoint loader node(s) — they output MODEL and CLIP
    # Common types: CheckpointLoaderSimple, CheckpointLoader, UNETLoader, etc.
    loader_types = {
        "CheckpointLoaderSimple", "CheckpointLoader",
        "UNETLoader", "UnetLoaderGGUF",
    }

    # Find the primary model/clip source
    model_source = None  # (node_id, output_index)
    clip_source = None   # (node_id, output_index)

    for node_id, node in wf.items():
        ct = node.get("class_type", "")
        if ct in loader_types:
            # CheckpointLoaderSimple outputs [MODEL, CLIP, VAE]
            # UNETLoader outputs [MODEL]
            if model_source is None:
                model_source = (node_id, 0)
            if clip_source is None and ct in ("CheckpointLoaderSimple", "CheckpointLoader"):
                clip_source = (node_id, 1)
            break

    if model_source is None:
        print("[LoRA] No checkpoint loader found — skipping LoRA injection")
        return wf

    # Track the current model/clip sources as we chain LoRAs
    current_model = list(model_source)  # [node_id, output_idx]
    current_clip = list(clip_source) if clip_source else None

    # Find all nodes that reference the original model/clip source
    # We need to rewire them to the last LoraLoader output
    model_refs = []  # (node_id, input_key)
    clip_refs = []   # (node_id, input_key)

    target_model_node = model_source[0]
    target_clip_node = clip_source[0] if clip_source else None

    for node_id, node in wf.items():
        inputs = node.get("inputs", {})
        for key, val in inputs.items():
            if isinstance(val, list) and len(val) == 2:
                ref_node, ref_idx = val[0], val[1]
                if ref_node == target_model_node and ref_idx == 0:
                    model_refs.append((node_id, key))
                if target_clip_node and ref_node == target_clip_node and ref_idx == 1:
                    clip_refs.append((node_id, key))

    # Create LoraLoader nodes, chained sequentially
    for i, lora in enumerate(loras):
        lora_node_id = f"lora_loader_{i}"
        lora_inputs = {
            "lora_name": lora["name"],
            "strength_model": float(lora.get("strength", 1.0)),
            "strength_clip": float(lora.get("strength_clip", lora.get("strength", 1.0))),
            "model": [current_model[0], current_model[1]],
        }
        if current_clip:
            lora_inputs["clip"] = [current_clip[0], current_clip[1]]

        wf[lora_node_id] = {
            "class_type": "LoraLoader",
            "inputs": lora_inputs,
        }

        # Update current sources to this LoraLoader's outputs
        # LoraLoader outputs [MODEL, CLIP]
        current_model = [lora_node_id, 0]
        current_clip = [lora_node_id, 1] if current_clip else None

    # Rewire all downstream nodes that referenced the original loader
    # to reference the last LoraLoader instead
    for node_id, key in model_refs:
        wf[node_id]["inputs"][key] = [current_model[0], current_model[1]]
    for node_id, key in clip_refs:
        if current_clip:
            wf[node_id]["inputs"][key] = [current_clip[0], current_clip[1]]

    print(f"[LoRA] Injected {len(loras)} LoRA(s): {[l['name'] for l in loras]}")
    return wf


async def fetch_lora_list(comfy_url: str) -> List[Dict[str, Any]]:
    """Fetch the list of available LoRAs from ComfyUI's object_info endpoint.

    Returns a list of {"name": "filename.safetensors", "size_bytes": ...} dicts.
    """
    import aiohttp

    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(
                f"{comfy_url}/object_info/LoraLoader",
                timeout=aiohttp.ClientTimeout(total=10),
            ) as resp:
                if resp.status != 200:
                    return []
                data = await resp.json()
                lora_info = data.get("LoraLoader", {})
                input_spec = lora_info.get("input", {})
                lora_input = input_spec.get("lora_name", {})
                # lora_name is a list of allowed values (filenames)
                if isinstance(lora_input, dict):
                    filenames = lora_input.get("values", [])
                elif isinstance(lora_input, list):
                    filenames = lora_input
                else:
                    filenames = []

                return [{"name": fn} for fn in filenames]
    except Exception as e:
        print(f"[LoRA] Failed to fetch LoRA list from ComfyUI: {e}")
        return []
