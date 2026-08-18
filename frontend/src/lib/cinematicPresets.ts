export interface CinematicPreset {
  id: string;
  label: string;
  icon: string;
  horizontalAngle: number;
  verticalAngle: number;
  zoom: number;
  prompt: string;
  description: string;
  category: "basic" | "advanced" | "coverage";
}

export const CINEMATIC_PRESETS: CinematicPreset[] = [
  // Basic shots
  {
    id: "wide",
    label: "Wide",
    icon: "▭",
    horizontalAngle: 0,
    verticalAngle: 0,
    zoom: 1,
    prompt: "wide shot, full scene visible",
    description: "Full scene, establishes geography",
    category: "basic",
  },
  {
    id: "medium",
    label: "Medium",
    icon: "▬",
    horizontalAngle: 0,
    verticalAngle: 0,
    zoom: 5,
    prompt: "medium shot, waist-up framing",
    description: "Waist-up, standard dialogue framing",
    category: "basic",
  },
  {
    id: "closeup",
    label: "Close-Up",
    icon: "●",
    horizontalAngle: 0,
    verticalAngle: 0,
    zoom: 8,
    prompt: "close-up on face",
    description: "Head and shoulders, emotional emphasis",
    category: "basic",
  },
  {
    id: "extreme_closeup",
    label: "Extreme CU",
    icon: "⚫",
    horizontalAngle: 0,
    verticalAngle: 0,
    zoom: 8.5,
    prompt: "extreme close-up on face, eyes and mouth only",
    description: "Tightest framing — pure emotion or detail",
    category: "basic",
  },
  {
    id: "insert",
    label: "Insert",
    icon: "◆",
    horizontalAngle: 0,
    verticalAngle: 0,
    zoom: 9.5,
    prompt: "insert shot, extreme close-up detail",
    description: "Detail shot of object or action",
    category: "basic",
  },
  // Advanced angles
  {
    id: "ots_left",
    label: "OTS Left",
    icon: "◀",
    horizontalAngle: 225,
    verticalAngle: 0,
    zoom: 7,
    prompt: "over the shoulder, foreground figure on left",
    description: "Camera behind right character, looking left",
    category: "advanced",
  },
  {
    id: "ots_right",
    label: "OTS Right",
    icon: "▶",
    horizontalAngle: 135,
    verticalAngle: 0,
    zoom: 7,
    prompt: "over the shoulder, foreground figure on right",
    description: "Camera behind left character, looking right",
    category: "advanced",
  },
  {
    id: "low_angle",
    label: "Low Angle",
    icon: "↑",
    horizontalAngle: 0,
    verticalAngle: -25,
    zoom: 5,
    prompt: "low angle, heroic perspective",
    description: "Camera below subject, looking up — power",
    category: "advanced",
  },
  {
    id: "high_angle",
    label: "High Angle",
    icon: "↓",
    horizontalAngle: 0,
    verticalAngle: 45,
    zoom: 5,
    prompt: "high angle, looking down",
    description: "Camera above subject, looking down — vulnerability",
    category: "advanced",
  },
  {
    id: "dutch_left",
    label: "Dutch L",
    icon: "↖",
    horizontalAngle: 315,
    verticalAngle: 10,
    zoom: 5,
    prompt: "dutch tilt, canted angle",
    description: "Tilted frame — tension, unease",
    category: "advanced",
  },
  {
    id: "dutch_right",
    label: "Dutch R",
    icon: "↗",
    horizontalAngle: 45,
    verticalAngle: 10,
    zoom: 5,
    prompt: "dutch tilt, canted angle",
    description: "Tilted frame — tension, unease",
    category: "advanced",
  },
  // Coverage
  {
    id: "two_shot",
    label: "Two-Shot",
    icon: "◐",
    horizontalAngle: 0,
    verticalAngle: 0,
    zoom: 3,
    prompt: "two shot, both characters visible",
    description: "Both subjects in frame, relationship context",
    category: "coverage",
  },
  {
    id: "reverse_left",
    label: "Reverse L",
    icon: "⬅",
    horizontalAngle: 270,
    verticalAngle: 0,
    zoom: 5,
    prompt: "reverse angle, looking left",
    description: "Opposite of previous — respects 180° rule",
    category: "coverage",
  },
  {
    id: "reverse_right",
    label: "Reverse R",
    icon: "➡",
    horizontalAngle: 90,
    verticalAngle: 0,
    zoom: 5,
    prompt: "reverse angle, looking right",
    description: "Opposite of previous — respects 180° rule",
    category: "coverage",
  },
  {
    id: "pov",
    label: "POV",
    icon: "👁",
    horizontalAngle: 0,
    verticalAngle: 0,
    zoom: 6,
    prompt: "point of view shot, first person perspective",
    description: "Character's eyes — subjective camera",
    category: "coverage",
  },
  {
    id: "dirty_ots_left",
    label: "Dirty OTS L",
    icon: "◀",
    horizontalAngle: 225,
    verticalAngle: 0,
    zoom: 6,
    prompt: "dirty over the shoulder, blurred foreground figure on left edge of frame",
    description: "Dirty frame — foreground obstruction adds depth",
    category: "coverage",
  },
  {
    id: "dirty_ots_right",
    label: "Dirty OTS R",
    icon: "▶",
    horizontalAngle: 135,
    verticalAngle: 0,
    zoom: 6,
    prompt: "dirty over the shoulder, blurred foreground figure on right edge of frame",
    description: "Dirty frame — foreground obstruction adds depth",
    category: "coverage",
  },
  {
    id: "clean_front",
    label: "Clean",
    icon: "○",
    horizontalAngle: 0,
    verticalAngle: 0,
    zoom: 5,
    prompt: "clean shot, unobstructed view, no foreground elements",
    description: "Clean frame — clear view of subject",
    category: "coverage",
  },
];

// Professional coverage sequence
export const COVERAGE_SEQUENCE = [
  { step: 0, presetId: "wide", label: "1. Establishing", note: "Set the scene" },
  { step: 1, presetId: "two_shot", label: "2. Two-Shot", note: "Establish relationship" },
  { step: 2, presetId: "ots_left", label: "3. OTS Left", note: "Character A's perspective" },
  { step: 3, presetId: "ots_right", label: "4. OTS Right", note: "Character B's perspective" },
  { step: 4, presetId: "closeup", label: "5. Close-Up", note: "Emotional beat" },
  { step: 5, presetId: "insert", label: "6. Insert", note: "Detail or action" },
];

export function getPresetById(id: string): CinematicPreset | undefined {
  return CINEMATIC_PRESETS.find((p) => p.id === id);
}

// 180-degree rule: determine which "side" an angle is on
// The line runs through 0° and 180° (front-back axis)
// Right side: 0° < angle < 180°
// Left side: 180° < angle < 360°
export function getSide(angle: number): "right" | "left" | "on-line" {
  const h = angle % 360;
  if (h === 0 || h === 180) return "on-line";
  if (h > 0 && h < 180) return "right";
  return "left";
}

export function wouldCrossLine(
  prevAngle: number | null,
  newAngle: number
): boolean {
  if (prevAngle === null) return false;
  const prevSide = getSide(prevAngle);
  const newSide = getSide(newAngle);
  if (prevSide === "on-line" || newSide === "on-line") return false;
  return prevSide !== newSide;
}

// Suggest a reverse angle that respects the 180° rule
export function suggestReverse(prevAngle: number): number {
  const reversed = (prevAngle + 180) % 360;
  return Math.round(reversed / 5) * 5;
}

// Get the next recommended shot in the coverage sequence
export function getNextCoverageStep(
  usedPresetIds: string[]
): { presetId: string; label: string; note: string } | null {
  for (const step of COVERAGE_SEQUENCE) {
    if (!usedPresetIds.includes(step.presetId)) {
      return step;
    }
  }
  return null;
}

// Camera Movement Presets for video generation
export const CAMERA_MOVEMENT_PRESETS = [
  { value: "static", label: "Static", icon: "⏸" },
  { value: "dolly_in", label: "Dolly In", icon: "🔍" },
  { value: "dolly_out", label: "Dolly Out", icon: "🔎" },
  { value: "pan_left", label: "Pan Left", icon: "⬅" },
  { value: "pan_right", label: "Pan Right", icon: "➡" },
  { value: "tilt_up", label: "Tilt Up", icon: "⬆" },
  { value: "tilt_down", label: "Tilt Down", icon: "⬇" },
  { value: "crane_up", label: "Crane Up", icon: "🢁" },
  { value: "crane_down", label: "Crane Down", icon: "🢃" },
  { value: "orbit_left", label: "Orbit Left", icon: "↺" },
  { value: "orbit_right", label: "Orbit Right", icon: "↻" },
  { value: "handheld", label: "Handheld", icon: "✋" },
  { value: "zoom_in", label: "Zoom In", icon: "⊕" },
  { value: "zoom_out", label: "Zoom Out", icon: "⊖" },
  { value: "dolly_zoom", label: "Dolly Zoom", icon: "🌀" },
  { value: "truck_left", label: "Truck Left", icon: "⬅" },
  { value: "truck_right", label: "Truck Right", icon: "➡" },
  { value: "pedestal_up", label: "Pedestal Up", icon: "⬆" },
  { value: "pedestal_down", label: "Pedestal Down", icon: "⬇" },
  { value: "arc_left", label: "Arc Left", icon: "⤴" },
  { value: "arc_right", label: "Arc Right", icon: "⤵" },
  { value: "shake", label: "Shake", icon: "📳" },
  { value: "roll", label: "Roll", icon: "🔄" },
] as const;

export const CAMERA_AMPLITUDE_OPTIONS = [
  { value: "small", label: "Small" },
  { value: "medium", label: "Medium" },
  { value: "large", label: "Large" },
] as const;

export const CAMERA_SPEED_OPTIONS = [
  { value: "slow", label: "Slow" },
  { value: "normal", label: "Normal" },
  { value: "fast", label: "Fast" },
] as const;
