/**
 * Previs Store (Zustand)
 *
 * Dedicated state for the 3D Camera Keyframing & Motion Previs stage.
 * Kept separate from the main useStudioStore so previs authoring state
 * (proxies, keyframes, playback) doesn't bloat the global studio slice.
 *
 * The motion generation job is tracked here so useGenerationPolling can
 * poll it the same way it polls frame/video jobs.
 */

import { create } from "zustand";
import {
  DEFAULT_TRAJECTORY,
  generatePresetKeyframes,
  type CameraKeyframe,
  type ProxyKeyframe,
  type TrajectoryConfig,
  type TrajectoryPreset,
} from "./previsTrajectory";

export type ProxyKind = "character" | "set" | "cube" | "sphere" | "cylinder" | "plane" | "cone" | "torus";

export interface ProxyObject {
  id: string;
  kind: ProxyKind;
  label: string;
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
  color: string;
}

export type AspectRatioId = "16:9" | "2.39:1";

export const FOCAL_LENGTHS = [18, 35, 50, 85] as const;
export type FocalLength = (typeof FOCAL_LENGTHS)[number];

export const ASPECT_RATIOS: { id: AspectRatioId; label: string; w: number; h: number }[] = [
  { id: "16:9", label: "16:9", w: 16, h: 9 },
  { id: "2.39:1", label: "2.39:1", w: 2.39, h: 1 },
];

export const RENDER_RESOLUTIONS: { id: RenderResolution; label: string; height: number }[] = [
  { id: "480p", label: "480p", height: 480 },
  { id: "720p", label: "720p", height: 720 },
  { id: "1080p", label: "1080p", height: 1080 },
];
export type RenderResolution = "480p" | "720p" | "1080p";

interface PrevisState {
  // --- Proxies (Phase 1) ---
  proxies: ProxyObject[];
  selectedProxyId: string | null;
  addProxy: (kind: ProxyKind) => void;
  updateProxy: (id: string, patch: Partial<ProxyObject>) => void;
  removeProxy: (id: string) => void;
  renameProxy: (id: string, label: string) => void;
  selectProxy: (id: string | null) => void;
  /** True when the shot camera is the active selection (for TransformControls). */
  cameraSelected: boolean;
  selectCamera: (selected: boolean) => void;

  // --- Shot camera framing (Phase 2) ---
  focalLength: FocalLength;
  setFocalLength: (f: FocalLength) => void;
  aspectRatio: AspectRatioId;
  setAspectRatio: (a: AspectRatioId) => void;
  /** Action axis angle (degrees) for the 180° line. */
  actionAxisAngle: number;
  setActionAxisAngle: (a: number) => void;

  // --- Trajectory + keyframes (Phase 3) ---
  trajectory: TrajectoryConfig;
  keyframes: CameraKeyframe[];
  setTrajectory: (patch: Partial<TrajectoryConfig>) => void;
  applyPreset: (preset: TrajectoryPreset) => void;
  setKeyframePosition: (frame: number, position: [number, number, number]) => void;
  setKeyframeTarget: (frame: number, target: [number, number, number]) => void;
  /** Insert/update a keyframe at the current frame with the given position + target. */
  addKeyframeAtFrame: (frame: number, position: [number, number, number], target: [number, number, number]) => void;
  /** Remove the keyframe at the given frame (if it exists). */
  removeKeyframeAtFrame: (frame: number) => void;

  // --- Proxy keyframes (multitrack) ---
  /** Per-proxy keyframe tracks: { [proxyId]: ProxyKeyframe[] } */
  proxyKeyframes: Record<string, ProxyKeyframe[]>;
  /** Insert/update a proxy keyframe at the given frame. */
  addProxyKeyframe: (proxyId: string, frame: number, position: [number, number, number], rotation: [number, number, number], scale: [number, number, number]) => void;
  /** Remove a proxy keyframe at the given frame. */
  removeProxyKeyframe: (proxyId: string, frame: number) => void;

  // --- Timeline / playback (Phase 3) ---
  fps: number;
  durationFrames: number;
  currentFrame: number;
  isPlaying: boolean;
  setDurationFrames: (n: number) => void;
  setCurrentFrame: (f: number) => void;
  togglePlay: () => void;
  setIsPlaying: (v: boolean) => void;

  // --- Gizmo manipulation mode (Phase 1) ---
  gizmoMode: "translate" | "rotate" | "scale";
  setGizmoMode: (m: "translate" | "rotate" | "scale") => void;

  // --- Editor viewport mode (Unreal-style Perspective / Camera toggle) ---
  /** "perspective" = free orbit viewport; "camera" = look through the shot camera. */
  viewMode: "perspective" | "camera";
  setViewMode: (m: "perspective" | "camera") => void;

  // --- Capture (Phase 4) ---
  depthMode: boolean;
  setDepthMode: (v: boolean) => void;
  /** Max distance (in scene units) for the depth pass. Objects at this distance
   *  render black; objects at the camera render white. Linear mapping. */
  depthRange: number;
  setDepthRange: (v: number) => void;
  renderResolution: RenderResolution;
  setRenderResolution: (v: RenderResolution) => void;
  isRecording: boolean;
  setIsRecording: (v: boolean) => void;

  // --- Generation (Phase 5) ---
  shotPrompt: string;
  setShotPrompt: (p: string) => void;
  selectedModelId: string;
  setSelectedModelId: (m: string) => void;
  activeMotionJob: { job_id: string; model_id: string } | null;
  setActiveMotionJob: (job: { job_id: string; model_id: string } | null) => void;
  resultVideoUrl: string | null;
  setResultVideoUrl: (u: string | null) => void;
  /** URL of the previs recording saved to the project library. */
  savedPrevisUrl: string | null;
  setSavedPrevisUrl: (u: string | null) => void;
}

function uid(): string {
  return Math.random().toString(36).slice(2, 10);
}

const PROXY_COLORS = ["#f59e0b", "#06b6d4", "#22c55e", "#a855f7", "#ec4899", "#3b82f6"];

const PRIMITIVE_DEFAULTS: Record<string, { label: string; scale: [number, number, number] }> = {
  cube: { label: "Cube", scale: [1, 1, 1] },
  sphere: { label: "Sphere", scale: [1, 1, 1] },
  cylinder: { label: "Cylinder", scale: [1, 1.5, 1] },
  plane: { label: "Plane", scale: [2, 2, 1] },
  cone: { label: "Cone", scale: [1, 1.5, 1] },
  torus: { label: "Torus", scale: [1, 1, 1] },
};

function defaultProxy(kind: ProxyKind): ProxyObject {
  const idx = Math.floor(Math.random() * PROXY_COLORS.length);
  if (kind === "character") {
    return {
      id: uid(),
      kind,
      label: `Character ${PROXY_COLORS.length + 1}`,
      // y=0.6 puts feet on the ground (geometry is centered at origin)
      position: [(Math.random() - 0.5) * 4, 0.6, (Math.random() - 0.5) * 4],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
      color: PROXY_COLORS[idx],
    };
  }
  if (kind === "set") {
    return {
      id: uid(),
      kind,
      label: `Set Piece`,
      position: [(Math.random() - 0.5) * 6, 0.5, (Math.random() - 0.5) * 6],
      rotation: [0, 0, 0],
      scale: [2, 1.5, 1],
      color: "#64748b",
    };
  }
  // Primitive shapes
  const def = PRIMITIVE_DEFAULTS[kind];
  const posY = kind === "plane" ? 0.01 : kind === "sphere" || kind === "cylinder" || kind === "cone" ? 1 : 0.5;
  return {
    id: uid(),
    kind,
    label: def.label,
    position: [(Math.random() - 0.5) * 6, posY, (Math.random() - 0.5) * 6],
    rotation: kind === "plane" ? [-Math.PI / 2, 0, 0] : [0, 0, 0],
    scale: def.scale,
    color: PROXY_COLORS[idx],
  };
}

export const usePrevisStore = create<PrevisState>((set, get) => ({
  // Proxies
  proxies: [
    {
      id: uid(),
      kind: "character" as ProxyKind,
      label: "Character 1",
      position: [0, 0.6, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
      color: "#f59e0b",
    },
    {
      id: uid(),
      kind: "set" as ProxyKind,
      label: "Back Wall",
      position: [0, 1, -4],
      rotation: [0, 0, 0],
      scale: [8, 3, 0.4],
      color: "#475569",
    },
  ],
  selectedProxyId: null,
  addProxy: (kind) =>
    set((s) => {
      const p = defaultProxy(kind);
      const count = s.proxies.filter((x) => x.kind === kind).length + 1;
      if (kind === "character") p.label = `Character ${count}`;
      else if (kind === "set") p.label = `Set Piece ${count}`;
      else p.label = `${PRIMITIVE_DEFAULTS[kind].label} ${count}`;
      return { proxies: [...s.proxies, p], selectedProxyId: p.id };
    }),
  updateProxy: (id, patch) =>
    set((s) => ({
      proxies: s.proxies.map((p) => (p.id === id ? { ...p, ...patch } : p)),
    })),
  removeProxy: (id) =>
    set((s) => {
      const { [id]: _removed, ...rest } = s.proxyKeyframes;
      return {
        proxies: s.proxies.filter((p) => p.id !== id),
        selectedProxyId: s.selectedProxyId === id ? null : s.selectedProxyId,
        proxyKeyframes: rest,
      };
    }),
  renameProxy: (id, label) =>
    set((s) => ({
      proxies: s.proxies.map((p) => (p.id === id ? { ...p, label } : p)),
    })),
  selectProxy: (id) => set({ selectedProxyId: id, cameraSelected: false }),
  cameraSelected: false,
  selectCamera: (cameraSelected) =>
    set({ cameraSelected, selectedProxyId: cameraSelected ? null : get().selectedProxyId }),

  // Shot camera framing
  focalLength: 35,
  setFocalLength: (focalLength) => set({ focalLength }),
  aspectRatio: "16:9",
  setAspectRatio: (aspectRatio) => set({ aspectRatio }),
  renderResolution: "720p",
  setRenderResolution: (renderResolution) => set({ renderResolution }),
  depthMode: false,
  setDepthMode: (depthMode) => set({ depthMode }),
  depthRange: 15,
  setDepthRange: (depthRange) => set({ depthRange }),
  actionAxisAngle: 0,
  setActionAxisAngle: (actionAxisAngle) => set({ actionAxisAngle }),

  // Trajectory + keyframes
  trajectory: { ...DEFAULT_TRAJECTORY, preset: "custom" },
  keyframes: [],  // start empty — user applies a template or sets keys manually
  setTrajectory: (patch) =>
    set((s) => {
      const next = { ...s.trajectory, ...patch };
      // Only regenerate keyframes from the template if we're on a preset
      // (custom = manual keyframing, so don't clobber user keys).
      const kfs = next.preset === "custom" ? s.keyframes : generatePresetKeyframes(next, s.durationFrames);
      return { trajectory: next, keyframes: kfs };
    }),
  applyPreset: (preset) =>
    set((s) => {
      const next = { ...s.trajectory, preset };
      if (preset === "custom") {
        // "Custom" = clear all keyframes, start fresh (empty state).
        return { trajectory: next, keyframes: [], currentFrame: 0, isPlaying: false };
      }
      return {
        trajectory: next,
        keyframes: generatePresetKeyframes(next, s.durationFrames),
        currentFrame: 0,
        isPlaying: false,
      };
    }),
  setKeyframePosition: (frame, position) =>
    set((s) => {
      // Custom edit: switch to "custom" and update the nearest keyframe (or append).
      const idx = s.keyframes.findIndex((k) => k.frame === frame);
      const kfs =
        idx >= 0
          ? s.keyframes.map((k, i) => (i === idx ? { ...k, position } : k))
          : [...s.keyframes, { frame, position, target: s.trajectory.target }];
      kfs.sort((a, b) => a.frame - b.frame);
      return { keyframes: kfs, trajectory: { ...s.trajectory, preset: "custom" } };
    }),
  setKeyframeTarget: (frame, target) =>
    set((s) => {
      const idx = s.keyframes.findIndex((k) => k.frame === frame);
      const kfs =
        idx >= 0
          ? s.keyframes.map((k, i) => (i === idx ? { ...k, target } : k))
          : [...s.keyframes, { frame, position: s.trajectory.startPos, target }];
      kfs.sort((a, b) => a.frame - b.frame);
      return { keyframes: kfs, trajectory: { ...s.trajectory, preset: "custom" } };
    }),
  addKeyframeAtFrame: (frame, position, target) =>
    set((s) => {
      const idx = s.keyframes.findIndex((k) => k.frame === frame);
      const kfs =
        idx >= 0
          ? s.keyframes.map((k, i) => (i === idx ? { ...k, position, target } : k))
          : [...s.keyframes, { frame, position, target }];
      kfs.sort((a, b) => a.frame - b.frame);
      return { keyframes: kfs, trajectory: { ...s.trajectory, preset: "custom" } };
    }),
  removeKeyframeAtFrame: (frame) =>
    set((s) => {
      // Allow removing down to 0 keyframes (empty state is valid).
      const kfs = s.keyframes.filter((k) => k.frame !== frame);
      return { keyframes: kfs, trajectory: { ...s.trajectory, preset: "custom" } };
    }),

  // Proxy keyframes (multitrack)
  proxyKeyframes: {},
  addProxyKeyframe: (proxyId, frame, position, rotation, scale) =>
    set((s) => {
      const track = s.proxyKeyframes[proxyId] ?? [];
      const idx = track.findIndex((k) => k.frame === frame);
      const kfs =
        idx >= 0
          ? track.map((k, i) => (i === idx ? { ...k, position, rotation, scale } : k))
          : [...track, { frame, position, rotation, scale }];
      kfs.sort((a, b) => a.frame - b.frame);
      return { proxyKeyframes: { ...s.proxyKeyframes, [proxyId]: kfs } };
    }),
  removeProxyKeyframe: (proxyId, frame) =>
    set((s) => {
      const track = s.proxyKeyframes[proxyId];
      if (!track) return {};
      const kfs = track.filter((k) => k.frame !== frame);
      return { proxyKeyframes: { ...s.proxyKeyframes, [proxyId]: kfs } };
    }),

  // Timeline / playback
  fps: 24,
  durationFrames: 96,
  currentFrame: 0,
  isPlaying: false,
  setDurationFrames: (n) =>
    set((s) => ({
      durationFrames: n,
      // Only regenerate keyframes from the template if on a preset.
      keyframes: s.trajectory.preset !== "custom" ? generatePresetKeyframes(s.trajectory, n) : s.keyframes,
      currentFrame: Math.min(s.currentFrame, n),
    })),
  setCurrentFrame: (currentFrame) => set({ currentFrame: Math.max(0, Math.min(currentFrame, get().durationFrames)) }),
  togglePlay: () => set((s) => ({ isPlaying: !s.isPlaying })),
  setIsPlaying: (isPlaying) => set({ isPlaying }),

  // Capture
  isRecording: false,
  setIsRecording: (isRecording) => set({ isRecording }),

  // Gizmo
  gizmoMode: "translate",
  setGizmoMode: (gizmoMode) => set({ gizmoMode }),

  // Editor viewport mode
  viewMode: "perspective",
  setViewMode: (viewMode) => set({ viewMode }),

  // Generation
  shotPrompt: "Wide shot, slow dolly in towards character standing under neon lights",
  setShotPrompt: (shotPrompt) => set({ shotPrompt }),
  selectedModelId: "minimax_h3",
  setSelectedModelId: (selectedModelId) => set({ selectedModelId }),
  activeMotionJob: null,
  setActiveMotionJob: (activeMotionJob) => set({ activeMotionJob }),
  resultVideoUrl: null,
  setResultVideoUrl: (resultVideoUrl) => set({ resultVideoUrl }),
  savedPrevisUrl: null,
  setSavedPrevisUrl: (savedPrevisUrl) => set({ savedPrevisUrl }),
}));
