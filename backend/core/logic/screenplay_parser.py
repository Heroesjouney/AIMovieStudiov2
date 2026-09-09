"""
Screenplay Parser - Fountain format support.

Parses Fountain-format screenplays into structured scenes and shots
that can be imported into the AI Movie Studio project.

Fountain is a plain-text screenplay format. See https://fountain.io

Supported elements:
    - Scene headings (sluglines): INT./EXT., location, time of day
    - Action lines: description paragraphs
    - Character cues: CHARACTER NAME (centered, uppercase)
    - Dialogue: text following a character cue
    - Parentheticals: (wryly) notes
    - Transitions: CUT TO:, FADE OUT, etc.
    - Shot headings: CLOSE-UP, WIDE SHOT, etc.
    - Title page: Title, Credit, Author, Draft date
"""

import re
from typing import List, Optional, Dict, Any, Tuple
from dataclasses import dataclass, field


# =============================================================================
# Data Models
# =============================================================================

@dataclass
class DialogueBlock:
    character: str
    parenthetical: Optional[str] = None
    text: str = ""


@dataclass
class ParsedShot:
    shot_type: str = "medium"  # maps to ShotType enum
    heading: str = ""           # original heading text
    action: str = ""            # action/description text (concatenated)
    action_lines: List[str] = field(default_factory=list)  # individual action paragraphs
    dialogue: List[DialogueBlock] = field(default_factory=list)
    transition: Optional[str] = None


@dataclass
class ParsedScene:
    heading: str = ""           # full slugline, e.g. "INT. COFFEE SHOP - DAY"
    int_ext: str = ""           # "INT" | "EXT" | "INT/EXT" | "EXT/INT"
    location: str = ""          # e.g. "COFFEE SHOP"
    time_of_day: str = ""       # e.g. "DAY", "NIGHT", "DAWN"
    description: str = ""        # scene-level action before first shot heading
    shots: List[ParsedShot] = field(default_factory=list)
    # Accumulated action lines before any explicit shot heading
    # become the first shot's action.


@dataclass
class ParsedScreenplay:
    title: str = ""
    author: str = ""
    credit: str = ""
    draft_date: str = ""
    scenes: List[ParsedScene] = field(default_factory=list)
    raw_text: str = ""


# =============================================================================
# Fountain Parsing
# =============================================================================

# Regex patterns
_SCENE_HEADING_RE = re.compile(
    r"^(INT\.?|EXT\.?|INT\.?/EXT\.?|EXT\.?/INT\.?|I\.?/E\.?)\s*(.+)",
    re.IGNORECASE,
)
_TRANSITION_RE = re.compile(
    r"^(CUT TO:|FADE IN:|FADE OUT\.|FADE TO BLACK\.|DISSOLVE TO:|SMASH CUT:|MATCH CUT:|JUMP CUT:|WIPE:|IRIS OUT\.|END OF SCENE)$",
    re.IGNORECASE,
)
# Word boundary after the keyword prevents "CU" from matching "CUSTOMER"
# or "CUT", and "WIDE" from matching "WIDELY", etc.
_SHOT_HEADING_RE = re.compile(
    r"^(CLOSE-?UP|CLOSE UP|CU|WIDE|WIDE SHOT|WS|ESTABLISHING|ESTABLISHING SHOT|MEDIUM|MS|MEDIUM SHOT|TWO SHOT|OTS|OVER THE SHOULDER|POV|AERIAL|INSERT|EXTREME CLOSE-?UP|ECU|TRACKING|DOLLY|PAN|ZOOM|ANGLE|REVERSE)\b\s*(.*)",
    re.IGNORECASE,
)
_PARENTHETICAL_RE = re.compile(r"^\((.+)\)$")
_CHARACTER_RE = re.compile(
    r"^([A-Z][A-Z0-9 .'\-]+)(\s*\([^)]+\))?$"
)
_TITLE_PAGE_RE = re.compile(
    r"^(Title|Credit|Author|Authors|Draft date|Contact|Source|Notes):\s*(.*)",
    re.IGNORECASE,
)

# Shot type mapping
_SHOT_TYPE_MAP = {
    "close-up": "close_up", "close up": "close_up", "cu": "close_up",
    "extreme close-up": "extreme_close_up", "extreme close up": "extreme_close_up", "ecu": "extreme_close_up",
    "wide": "wide", "wide shot": "wide", "ws": "wide",
    "establishing": "establishing", "establishing shot": "establishing",
    "medium": "medium", "ms": "medium", "medium shot": "medium",
    "two shot": "two_shot",
    "over the shoulder": "over_the_shoulder", "ots": "over_the_shoulder",
    "pov": "pov",
    "aerial": "aerial",
    "insert": "insert",
    "tracking": "medium",
    "dolly": "medium",
    "pan": "medium",
    "zoom": "medium",
    "angle": "medium",
    "reverse": "medium",
    "subsequent": "subsequent",
}

# Time of day mapping to SceneTimeOfDay enum
_TIME_OF_DAY_MAP = {
    "day": "day", "daytime": "day",
    "night": "night", "nighttime": "night",
    "dawn": "dawn", "sunrise": "dawn",
    "morning": "morning",
    "dusk": "dusk", "sunset": "dusk", "golden hour": "golden_hour", "magic hour": "golden_hour",
    "evening": "dusk",
    "afternoon": "day",
    "later": "day",
    "continuous": "day",
    "interior": "interior",
    "int": "interior",
}


def _normalize_shot_type(heading: str) -> str:
    """Map a shot heading to ShotType enum value."""
    lower = heading.lower().strip()
    for key, value in _SHOT_TYPE_MAP.items():
        if lower.startswith(key):
            return value
    return "medium"


def _normalize_time_of_day(tod: str) -> str:
    """Map a time-of-day string to SceneTimeOfDay enum value."""
    lower = tod.lower().strip()
    return _TIME_OF_DAY_MAP.get(lower, "day")


def _is_scene_heading(line: str) -> bool:
    return bool(_SCENE_HEADING_RE.match(line))


def _is_shot_heading(line: str) -> bool:
    return bool(_SHOT_HEADING_RE.match(line))


def _is_transition(line: str) -> bool:
    return bool(_TRANSITION_RE.match(line.strip()))


def _is_character_cue(line: str) -> bool:
    stripped = line.strip()
    if not stripped or len(stripped) < 2:
        return False
    # Must be uppercase (allowing numbers, spaces, apostrophes, hyphens)
    if stripped != stripped.upper():
        return False
    # Must not be a scene heading or transition
    if _is_scene_heading(stripped) or _is_transition(stripped):
        return False
    return bool(_CHARACTER_RE.match(stripped))


def parse_fountain(text: str) -> ParsedScreenplay:
    """Parse a Fountain-format screenplay string into structured data.

    This is a simplified parser that handles the most common Fountain
    conventions. It does not handle forced section syntax (#), boneyard
    blocks (/* */), or dual dialogue, but covers the core elements.
    """
    # Pre-process: strip BOM, normalize line endings
    text = text.lstrip("\ufeff").replace("\r\n", "\n").replace("\r", "\n")
    lines = text.split("\n")

    screenplay = ParsedScreenplay(raw_text=text)
    current_scene: Optional[ParsedScene] = None
    current_shot: Optional[ParsedShot] = None
    current_dialogue: Optional[DialogueBlock] = None

    # State machine
    in_title_page = True
    in_dialogue = False
    in_parenthetical = False
    i = 0

    while i < len(lines):
        line = lines[i]
        stripped = line.strip()

        # --- Title page parsing (only at start, before any content) ---
        if in_title_page:
            if stripped == "":
                # Blank line — could still be title page or end of it
                # Peek ahead: if next non-blank line is a scene heading, title page is over
                j = i + 1
                while j < len(lines) and lines[j].strip() == "":
                    j += 1
                if j < len(lines) and _is_scene_heading(lines[j]):
                    in_title_page = False
                i += 1
                continue
            m = _TITLE_PAGE_RE.match(stripped)
            if m:
                key = m.group(1).lower()
                val = m.group(2).strip()
                if key == "title":
                    screenplay.title = val
                elif key in ("author", "authors"):
                    screenplay.author = val
                elif key == "credit":
                    screenplay.credit = val
                elif key == "draft date":
                    screenplay.draft_date = val
                i += 1
                continue
            # Non-title-page line encountered
            in_title_page = False

        # --- Blank line ---
        if stripped == "":
            if in_dialogue and current_dialogue:
                # End dialogue block
                if current_shot:
                    current_shot.dialogue.append(current_dialogue)
                current_dialogue = None
            in_dialogue = False
            i += 1
            continue

        # --- Scene heading ---
        if _is_scene_heading(stripped):
            # Flush any open dialogue
            if current_dialogue and current_shot:
                current_shot.dialogue.append(current_dialogue)
                current_dialogue = None
            in_dialogue = False

            # Start new scene
            current_scene = ParsedScene(heading=stripped)
            # Parse slugline components
            m = _SCENE_HEADING_RE.match(stripped)
            if m:
                prefix = m.group(1).upper().replace(".", "")
                rest = m.group(2).strip()
                # Split location and time of day by last dash
                if " - " in rest:
                    parts = rest.rsplit(" - ", 1)
                    current_scene.location = parts[0].strip()
                    if len(parts) > 1:
                        current_scene.time_of_day = parts[1].strip()
                else:
                    current_scene.location = rest
                # Normalize int/ext
                if "/" in prefix:
                    current_scene.int_ext = "INT/EXT"
                elif prefix.startswith("INT"):
                    current_scene.int_ext = "INT"
                else:
                    current_scene.int_ext = "EXT"

            # Start first shot (implicit medium shot)
            current_shot = ParsedShot(shot_type="medium", heading="MEDIUM SHOT")
            current_scene.shots.append(current_shot)
            screenplay.scenes.append(current_scene)
            i += 1
            continue

        # --- Transition (checked before shot heading so "CUT TO:" etc.
        # aren't miscaught by the CU/WS shot abbreviations) ---
        if _is_transition(stripped):
            if current_dialogue and current_shot:
                current_shot.dialogue.append(current_dialogue)
                current_dialogue = None
            in_dialogue = False

            if current_shot:
                current_shot.transition = stripped
            i += 1
            continue

        # --- Shot heading ---
        if _is_shot_heading(stripped):
            if current_dialogue and current_shot:
                current_shot.dialogue.append(current_dialogue)
                current_dialogue = None
            in_dialogue = False

            if current_scene is None:
                # Shot heading before any scene — create a default scene
                current_scene = ParsedScene(
                    heading="UNTITLED SCENE",
                    int_ext="INT",
                    location="UNKNOWN",
                    time_of_day="DAY",
                )
                screenplay.scenes.append(current_scene)

            # Start new shot in current scene
            current_shot = ParsedShot(
                shot_type=_normalize_shot_type(stripped),
                heading=stripped,
            )
            current_scene.shots.append(current_shot)
            i += 1
            continue

        # --- Character cue ---
        if _is_character_cue(stripped):
            # Flush previous dialogue
            if current_dialogue and current_shot:
                current_shot.dialogue.append(current_dialogue)

            # Extract character name (strip parenthetical extensions)
            char_name = stripped
            paren_match = re.match(r"^([A-Z][A-Z0-9 .'\-]+?)(?:\s*\(([^)]+)\))?$", stripped)
            if paren_match:
                char_name = paren_match.group(1).strip()

            current_dialogue = DialogueBlock(character=char_name)
            in_dialogue = True

            # Check for parenthetical on next line
            if i + 1 < len(lines):
                next_line = lines[i + 1].strip()
                paren_m = _PARENTHETICAL_RE.match(next_line)
                if paren_m:
                    current_dialogue.parenthetical = paren_m.group(1).strip()
                    i += 1  # skip parenthetical line
            i += 1
            continue

        # --- Dialogue text ---
        if in_dialogue and current_dialogue:
            if current_dialogue.text:
                current_dialogue.text += " " + stripped
            else:
                current_dialogue.text = stripped
            i += 1
            continue

        # --- Action line ---
        if current_shot is None:
            # No scene yet — create a default
            current_scene = ParsedScene(
                heading="UNTITLED SCENE",
                int_ext="INT",
                location="UNKNOWN",
                time_of_day="DAY",
            )
            current_shot = ParsedShot(shot_type="medium", heading="MEDIUM SHOT")
            current_scene.shots.append(current_shot)
            screenplay.scenes.append(current_scene)

        if current_shot.action:
            current_shot.action += " " + stripped
        else:
            current_shot.action = stripped
        current_shot.action_lines.append(stripped)
        i += 1

    # Flush final dialogue
    if current_dialogue and current_shot:
        current_shot.dialogue.append(current_dialogue)

    return screenplay


# =============================================================================
# Final Draft (.fdx) Parsing
# =============================================================================
#
# FDX is Final Draft's XML format. The structure is:
#   <FinalDraft DocumentType="Script" Version="...">
#     <Content>
#       <Paragraph Type="Scene Heading"><Text>INT. ...</Text></Paragraph>
#       <Paragraph Type="Action"><Text>...</Text></Paragraph>
#       <Paragraph Type="Character"><Text>BARISTA</Text></Paragraph>
#       <Paragraph Type="Parenthetical"><Text>(smiling)</Text></Paragraph>
#       <Paragraph Type="Dialogue"><Text>...</Text></Paragraph>
#       <Paragraph Type="Transition"><Text>CUT TO:</Text></Paragraph>
#       <Paragraph Type="Shot"><Text>CLOSE-UP: ...</Text></Paragraph>
#       ...
#     </Content>
#   </FinalDraft>
#
# We map each Paragraph Type to the same element kinds the Fountain parser
# produces, then reuse the scene-heading/shot-type/time-of-day normalization
# helpers so both formats yield an identical ParsedScreenplay.

import xml.etree.ElementTree as ET

# FDX Paragraph Type -> internal element kind
_FDX_TYPE_MAP = {
    "Scene Heading": "scene",
    "Scene Heading (Cont'd)": "scene",
    "Action": "action",
    "Action (Cont'd)": "action",
    "Character": "character",
    "Character (Cont'd)": "character",
    "Parenthetical": "parenthetical",
    "Parenthetical (Cont'd)": "parenthetical",
    "Dialogue": "dialogue",
    "Dialogue (Cont'd)": "dialogue",
    "Transition": "transition",
    "Shot": "shot",
    "Shot Heading": "shot",
    "Cast List": "action",       # treat cast lists as action text
    "Centered": "action",
    "ScriptNote": None,          # skip
    "Section Heading": None,     # skip (outline sections)
    "Act Break": None,           # skip
}


def _strip_ns(tag: str) -> str:
    """Remove an XML namespace prefix from a tag, e.g. '{ns}Paragraph' -> 'Paragraph'."""
    return tag.split("}", 1)[1] if "}" in tag else tag


def _fdx_paragraph_text(para: ET.Element) -> str:
    """Concatenate all <Text> children of a paragraph into one string."""
    parts = []
    for child in para.iter():
        if _strip_ns(child.tag) == "Text" and child.text:
            parts.append(child.text)
    return " ".join(p.strip() for p in parts if p.strip())


def _fdx_iter_paragraphs(root: ET.Element):
    """Yield (Type, text) for every <Paragraph> in document order, flattening
    dual-dialogue blocks (which nest two character columns)."""
    for elem in root.iter():
        if _strip_ns(elem.tag) != "Paragraph":
            continue
        ptype = elem.get("Type", "").strip()
        # Dual Dialogue wraps two columns; descend into its nested paragraphs
        if ptype.lower().startswith("dual"):
            for nested in elem.iter():
                if nested is elem:
                    continue
                if _strip_ns(nested.tag) == "Paragraph":
                    yield nested.get("Type", "").strip(), _fdx_paragraph_text(nested)
            continue
        yield ptype, _fdx_paragraph_text(elem)


def parse_fdx(text: str) -> ParsedScreenplay:
    """Parse a Final Draft .fdx (XML) screenplay into the same structure as
    parse_fountain."""
    screenplay = ParsedScreenplay(raw_text=text)

    try:
        root = ET.fromstring(text.strip())
    except ET.ParseError as e:
        raise ValueError(f"Invalid FDX XML: {e}")

    # Find the <Content> root if present, else use the document root
    content_root = root
    for elem in root.iter():
        if _strip_ns(elem.tag) == "Content":
            content_root = elem
            break

    current_scene: Optional[ParsedScene] = None
    current_shot: Optional[ParsedShot] = None
    current_dialogue: Optional[DialogueBlock] = None

    def flush_dialogue():
        nonlocal current_dialogue
        if current_dialogue and current_shot:
            current_shot.dialogue.append(current_dialogue)
        current_dialogue = None

    def ensure_shot():
        nonlocal current_shot
        if current_shot is None:
            current_shot = ParsedShot(shot_type="medium", heading="MEDIUM SHOT")
            if current_scene is not None:
                current_scene.shots.append(current_shot)

    def ensure_scene():
        nonlocal current_scene, current_shot
        if current_scene is None:
            current_scene = ParsedScene(
                heading="UNTITLED SCENE",
                int_ext="INT",
                location="UNKNOWN",
                time_of_day="DAY",
            )
            screenplay.scenes.append(current_scene)
            current_shot = ParsedShot(shot_type="medium", heading="MEDIUM SHOT")
            current_scene.shots.append(current_shot)

    for ptype, ptext in _fdx_iter_paragraphs(content_root):
        kind = _FDX_TYPE_MAP.get(ptype)
        if not ptext:
            continue

        if kind == "scene":
            flush_dialogue()
            current_scene = ParsedScene(heading=ptext)
            m = _SCENE_HEADING_RE.match(ptext)
            if m:
                prefix = m.group(1).upper().replace(".", "")
                rest = m.group(2).strip()
                if " - " in rest:
                    parts = rest.rsplit(" - ", 1)
                    current_scene.location = parts[0].strip()
                    if len(parts) > 1:
                        current_scene.time_of_day = parts[1].strip()
                else:
                    current_scene.location = rest
                if "/" in prefix:
                    current_scene.int_ext = "INT/EXT"
                elif prefix.startswith("INT"):
                    current_scene.int_ext = "INT"
                else:
                    current_scene.int_ext = "EXT"
            current_shot = ParsedShot(shot_type="medium", heading="MEDIUM SHOT")
            current_scene.shots.append(current_shot)
            screenplay.scenes.append(current_scene)

        elif kind == "shot":
            flush_dialogue()
            ensure_scene()
            current_shot = ParsedShot(
                shot_type=_normalize_shot_type(ptext),
                heading=ptext,
            )
            current_scene.shots.append(current_shot)

        elif kind == "transition":
            flush_dialogue()
            if current_shot:
                current_shot.transition = ptext

        elif kind == "character":
            flush_dialogue()
            ensure_scene()
            char_name = ptext
            paren_match = re.match(r"^([A-Z][A-Z0-9 .'\-]+?)(?:\s*\(([^)]+)\))?$", ptext)
            if paren_match:
                char_name = paren_match.group(1).strip()
            current_dialogue = DialogueBlock(character=char_name)

        elif kind == "parenthetical":
            # Attach to the current dialogue block (or start one if none)
            if current_dialogue is None:
                current_dialogue = DialogueBlock(character="UNKNOWN")
            paren_m = _PARENTHETICAL_RE.match(ptext)
            if paren_m:
                current_dialogue.parenthetical = paren_m.group(1).strip()
            else:
                current_dialogue.parenthetical = ptext.strip("()")

        elif kind == "dialogue":
            ensure_scene()
            if current_dialogue is None:
                current_dialogue = DialogueBlock(character="UNKNOWN")
            if current_dialogue.text:
                current_dialogue.text += " " + ptext
            else:
                current_dialogue.text = ptext

        elif kind == "action":
            flush_dialogue()
            ensure_scene()
            ensure_shot()
            if current_shot.action:
                current_shot.action += " " + ptext
            else:
                current_shot.action = ptext
            current_shot.action_lines.append(ptext)

    flush_dialogue()
    return screenplay


# =============================================================================
# Format Dispatch
# =============================================================================

def parse_screenplay(text: str, filename: Optional[str] = None) -> ParsedScreenplay:
    """Parse a screenplay, auto-detecting Fountain vs. Final Draft (.fdx).

    Detection order:
      1. If a filename is given and ends with .fdx, parse as FDX.
      2. If the trimmed text starts with '<?xml' or '<FinalDraft', parse as FDX.
      3. Otherwise parse as Fountain.
    """
    stripped = text.lstrip()
    if filename and filename.lower().endswith(".fdx"):
        return parse_fdx(text)
    if stripped.startswith("<?xml") or stripped.startswith("<FinalDraft"):
        return parse_fdx(text)
    return parse_fountain(text)


def screenplay_to_import_data(
    parsed: ParsedScreenplay,
) -> Dict[str, Any]:
    """Convert parsed screenplay into import-ready data structure.

    Returns a dict with:
        - scenes: list of scene dicts (name, description, time_of_day, int_ext, location)
        - shots: list of shot dicts (scene_index, shot_type, name, description, dialogue)
    """
    scenes = []
    shots = []

    for idx, scene in enumerate(parsed.scenes):
        # Build scene description from first shot's action if available
        scene_desc = ""
        if scene.shots and scene.shots[0].action:
            scene_desc = scene.shots[0].action[:200]

        # Normalize time of day
        tod = _normalize_time_of_day(scene.time_of_day) if scene.time_of_day else "day"

        # Infer mood from scene content (simple heuristic)
        mood = "neutral"
        action_text = " ".join(s.action for s in scene.shots).lower()
        dialogue_text = " ".join(d.text for s in scene.shots for d in s.dialogue).lower()
        combined = action_text + " " + dialogue_text
        if any(w in combined for w in ["explosion", "fight", "chase", "run", "attack", "gun", "crash"]):
            mood = "action"
        elif any(w in combined for w in ["scary", "dark", "horror", "scream", "blood", "monster"]):
            mood = "horror"
        elif any(w in combined for w in ["love", "kiss", "romantic", "tender", "embrace"]):
            mood = "romantic"
        elif any(w in combined for w in ["sad", "cry", "tears", "grief", "funeral", "alone"]):
            mood = "melancholic"
        elif any(w in combined for w in ["mystery", "secret", "unknown", "shadow", "whisper"]):
            mood = "mysterious"
        elif any(w in combined for w in ["laugh", "happy", "joy", "smile", "celebrate", "fun"]):
            mood = "joyful"
        elif any(w in combined for w in ["tense", "nervous", "danger", "threat", "suspense"]):
            mood = "tense"

        # Infer lighting from time of day and scene content
        lighting = "natural"
        if tod == "night":
            lighting = "moonlight"
        elif tod == "dawn":
            lighting = "natural"
        elif tod in ("dusk", "golden_hour"):
            lighting = "golden_hour"
        elif "neon" in combined:
            lighting = "neon"
        elif "candle" in combined or "fire" in combined or "torch" in combined:
            lighting = "practical"
        elif "dark" in combined and tod != "night":
            lighting = "low_key"

        scenes.append({
            "name": scene.heading or f"Scene {idx + 1}",
            "description": scene_desc,
            "time_of_day": tod,
            "mood": mood,
            "lighting": lighting,
            "int_ext": scene.int_ext,
            "location": scene.location,
        })

        for shot_idx, shot in enumerate(scene.shots):
            # Build shot name
            shot_name = shot.heading or f"Shot {shot_idx + 1}"

            # Structured dialogue blocks for screenplay-formatted rendering
            dialogue_blocks = [
                {
                    "character": d.character,
                    "parenthetical": d.parenthetical,
                    "text": d.text,
                }
                for d in shot.dialogue
            ]

            # Build dialogue string with @character says: format for H3
            dialogue_parts = []
            for d in shot.dialogue:
                if d.parenthetical:
                    dialogue_parts.append(f"@{d.character} says: ({d.parenthetical}) {d.text}")
                else:
                    dialogue_parts.append(f"@{d.character} says: {d.text}")

            dialogue_str = "\n".join(dialogue_parts)

            # Build full description (action + dialogue)
            full_desc = shot.action
            if dialogue_str:
                if full_desc:
                    full_desc += "\n\n" + dialogue_str
                else:
                    full_desc = dialogue_str

            shots.append({
                "scene_index": idx,
                "shot_type": shot.shot_type,
                "name": shot_name,
                "description": full_desc,
                "action": shot.action,
                "action_lines": shot.action_lines,
                "dialogue": dialogue_str,
                "dialogue_blocks": dialogue_blocks,
                "transition": shot.transition,
            })

    return {
        "title": parsed.title,
        "author": parsed.author,
        "scenes": scenes,
        "shots": shots,
    }
