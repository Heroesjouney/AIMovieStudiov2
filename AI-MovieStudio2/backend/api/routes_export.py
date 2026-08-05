"""
Export Routes - EDL/XML export for professional NLEs.

Generates CMX 3600 EDL and Adobe Premiere Pro XML files
from the project timeline.
"""

import json
from pathlib import Path
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, HTTPException
from fastapi.responses import PlainTextResponse

router = APIRouter()
VAULT_DIR = Path(__file__).parent.parent / "assets"


@router.get("/{project_id}/edl")
async def export_edl(project_id: str):
    """Export timeline as CMX 3600 EDL file."""
    tl_path = VAULT_DIR / project_id / "timeline.json"
    if not tl_path.exists():
        raise HTTPException(status_code=404, detail="No timeline found for project")

    with open(tl_path, "r") as f:
        timeline = json.load(f)

    edl_lines = [
        f"TITLE: {project_id}",
        f"FCM: NON-DROP FRAME",
        "",
    ]

    clip_num = 1
    for track in timeline.get("videoTracks", []):
        for clip in track.get("clips", []):
            name = clip.get("name", f"CLIP_{clip_num:03d}")
            source = clip.get("sourceUrl", "")
            trim_in = clip.get("trimInSeconds", 0)
            trim_out = clip.get("trimOutSeconds") or 5.0
            start = clip.get("startTime", 0)
            end = start + (trim_out - trim_in)

            def frames(seconds):
                fps = timeline.get("fps", 24)
                total = int(seconds * fps)
                hh = total // (fps * 3600)
                mm = (total % (fps * 3600)) // (fps * 60)
                ss = (total % (fps * 60)) // fps
                ff = total % fps
                return f"{hh:01d}:{mm:02d}:{ss:02d}:{ff:02d}"

            edl_lines.append(
                f"{clip_num:03d}  AX       V     C        {frames(trim_in)} {frames(trim_out)} {frames(start)} {frames(end)}"
            )
            edl_lines.append(f"* FROM CLIP NAME: {name}")
            edl_lines.append(f"* SOURCE FILE: {source}")
            edl_lines.append("")
            clip_num += 1

    return PlainTextResponse(
        content="\n".join(edl_lines),
        media_type="text/plain",
        headers={"Content-Disposition": f"attachment; filename={project_id}.edl"},
    )


@router.get("/{project_id}/xml")
async def export_xml(project_id: str):
    """Export timeline as Adobe Premiere Pro XML."""
    tl_path = VAULT_DIR / project_id / "timeline.json"
    if not tl_path.exists():
        raise HTTPException(status_code=404, detail="No timeline found for project")

    with open(tl_path, "r") as f:
        timeline = json.load(f)

    fps = timeline.get("fps", 24)
    width = timeline.get("format", {}).get("width", 1920)
    height = timeline.get("format", {}).get("height", 1080)

    xml_parts = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<!DOCTYPE xmeml>',
        '<xmeml version="4">',
        '  <sequence>',
        f'    <name>{project_id}</name>',
        f'    <rate><timebase>{fps}</timebase></rate>',
        f'    <media>',
        f'      <video>',
        f'        <format><samplecharacteristics><width>{width}</width><height>{height}</height></samplecharacteristics></format>',
        '        <track>',
    ]

    clip_num = 1
    for track in timeline.get("videoTracks", []):
        for clip in track.get("clips", []):
            name = clip.get("name", f"Clip {clip_num}")
            source = clip.get("sourceUrl", "")
            trim_in = clip.get("trimInSeconds", 0)
            trim_out = clip.get("trimOutSeconds") or 5.0
            start = clip.get("startTime", 0)
            duration = trim_out - trim_in

            xml_parts.extend([
                f'          <clipitem id="clip-{clip_num}">',
                f'            <name>{name}</name>',
                f'            <duration>{int(duration * fps)}</duration>',
                f'            <rate><timebase>{fps}</timebase></rate>',
                f'            <start>{int(start * fps)}</start>',
                f'            <end>{int((start + duration) * fps)}</end>',
                f'            <in>{int(trim_in * fps)}</in>',
                f'            <out>{int(trim_out * fps)}</out>',
                f'            <file id="file-{clip_num}">',
                f'              <name>{name}</name>',
                f'              <pathurl>{source}</pathurl>',
                f'              <rate><timebase>{fps}</timebase></rate>',
                f'              <media><video><samplecharacteristics><width>{width}</width><height>{height}</height></samplecharacteristics></video></media>',
                f'            </file>',
                f'          </clipitem>',
            ])
            clip_num += 1

    xml_parts.extend([
        '        </track>',
        '      </video>',
        '    </media>',
        '  </sequence>',
        '</xmeml>',
    ])

    return PlainTextResponse(
        content="\n".join(xml_parts),
        media_type="application/xml",
        headers={"Content-Disposition": f"attachment; filename={project_id}.xml"},
    )
