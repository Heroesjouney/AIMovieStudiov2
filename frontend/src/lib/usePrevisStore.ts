/**
 * Previs Store (Zustand)
 *
 * Dedicated state for the 3D Camera Keyframing & Motion Previs stage.
 * Kept separate from the main useStudioStore so previs authoring state
 * (proxies, keyframes, playback) doesn't bloat the global studio slice.
 *
 * Previs does NOT generate AI video directly — it records the viewfinder to
 * an MP4 in the project video library, which is then submitted to the
 * Camera Director (Reference mode) as a motion reference.
 */

import { create } from "zustand";
import {
  DEFAULT_TRAJECTORY,
  generatePresetKeyframes,
  type CameraKeyframe,
  type CameraChannel,
  type CameraChannelKeyframes,
  type Keyframe1D,
  type ProxyKeyframe,
  type TrajectoryConfig,
  type TrajectoryPreset,
  channelsToKeyframes,
  emptyCameraChannels,
  keyframesToChannels,
  sampleChannel1D,
  sampleTrajectory,
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

export type AspectRatioId = "4:3" | "16:9" | "2.35:1" | "2.39:1" | "1:1" | "9:16";

export const FOCAL_LENGTHS = [14, 18, 24, 28, 35, 50, 85, 135] as const;
export type FocalLength = (typeof FOCAL_LENGTHS)[number];

/** Lens categories for display grouping in the inspector. */
export const LENS_GROUPS: { label: string; focal: number[]; hint: string }[] = [
  { label: "Ultra-Wide", focal: [14, 18], hint: "Wide FOV, deep focus" },
  { label: "Wide", focal: [24, 28], hint: "Establishing / environment" },
  { label: "Normal", focal: [35, 50], hint: "Natural perspective" },
  { label: "Telephoto", focal: [85, 135], hint: "Compressed, shallow DOF" },
];

export const ASPECT_RATIOS: { id: AspectRatioId; label: string; w: number; h: number }[] = [
  { id: "1:1", label: "1:1", w: 1, h: 1 },
  { id: "4:3", label: "4:3", w: 4, h: 3 },
  { id: "16:9", label: "16:9", w: 16, h: 9 },
  { id: "2.35:1", label: "2.35:1", w: 2.35, h: 1 },
  { id: "2.39:1", label: "2.39:1", w: 2.39, h: 1 },
  { id: "9:16", label: "9:16", w: 9, h: 16 },
];

/** Look up the numeric aspect ratio (w/h) for a given id. */
export function aspectRatioValue(id: AspectRatioId): number {
  const r = ASPECT_RATIOS.find((a) => a.id === id);
  return r ? r.w / r.h : 16 / 9;
}

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
  /** Duplicate the selected proxy in place (offset slightly so it's visible). */
  duplicateSelectedProxy: () => void;
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
  /** Derived full-transform keyframes (for display / trajectory spline). */
  keyframes: CameraKeyframe[];
  /** Source-of-truth per-channel keyframe tracks (pos X/Y/Z, target X/Y/Z). */
  cameraChannels: CameraChannelKeyframes;
  setTrajectory: (patch: Partial<TrajectoryConfig>) => void;
  applyPreset: (preset: TrajectoryPreset) => void;
  setKeyframePosition: (frame: number, position: [number, number, number]) => void;
  setKeyframeTarget: (frame: number, target: [number, number, number]) => void;
  /** Insert/update a keyframe at the current frame with the given position + target (writes all channels). */
  addKeyframeAtFrame: (frame: number, position: [number, number, number], target: [number, number, number], roll?: number, focal?: number) => void;
  /** Remove the keyframe at the given frame from all channels (if it exists). */
  removeKeyframeAtFrame: (frame: number) => void;
  /** Insert/update a single channel's keyframe at the given frame. */
  addChannelKeyframe: (channel: CameraChannel, frame: number, value: number, ease?: "smooth" | "linear") => void;
  /** Remove a single channel's keyframe at the given frame. */
  removeChannelKeyframe: (channel: CameraChannel, frame: number) => void;
  /** Toggle a channel keyframe's segment easing between smooth and linear. */
  toggleChannelKeyframeEase: (channel: CameraChannel, frame: number) => void;

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

  // --- Editor viewport mode (Unreal-style Perspective / Camera / Plan toggle) ---
  /** "perspective" = free orbit viewport; "camera" = look through the shot camera;
   *  "plan" = top-down orthographic floor-plan schematic. */
  viewMode: "perspective" | "camera" | "plan";
  setViewMode: (m: "perspective" | "camera" | "plan") => void;

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

  /** URL of the previs recording saved to the project library. */
  savedPrevisUrl: string | null;
  setSavedPrevisUrl: (u: string | null) => void;

  // --- Gizmo snapping ---
  snapEnabled: boolean;
  setSnapEnabled: (v: boolean) => void;

  // --- Undo/redo (authoring history) ---
  past: PrevisSnapshot[];
  future: PrevisSnapshot[];
  /** Snapshot the current authoring state onto the undo stack (call BEFORE a mutation). */
  pushHistory: () => void;
  undo: () => void;
  redo: () => void;

  // --- Persistence (save/load the previs scene to the Vault) ---
  serialize: () => PrevisScenePayload;
  hydrate: (data: PrevisScenePayload) => void;
  /** Reset the entire previs scene to empty defaults (proxies, keyframes,
   *  camera channels, trajectory). Pushes the current state to undo first
   *  so a reset can be undone. */
  resetScene: () => void;
}

/** The subset of previs state that is undoable (authoring, not playback). */
export interface PrevisSnapshot {
  proxies: ProxyObject[];
  proxyKeyframes: Record<string, ProxyKeyframe[]>;
  cameraChannels: CameraChannelKeyframes;
  keyframes: CameraKeyframe[];
  trajectory: TrajectoryConfig;
  durationFrames: number;
}

/** Serializable previs scene (what gets written to / read from the Vault). */
export interface PrevisScenePayload {
  version: number;
  proxies: ProxyObject[];
  proxyKeyframes: Record<string, ProxyKeyframe[]>;
  cameraChannels: CameraChannelKeyframes;
  trajectory: TrajectoryConfig;
  durationFrames: number;
  fps: number;
  focalLength: FocalLength;
  aspectRatio: AspectRatioId;
  actionAxisAngle: number;
  depthMode: boolean;
  depthRange: number;
  renderResolution: RenderResolution;
}

function uid(): string {
  return Math.random().toString(36).slice(2, 10);
}

const HISTORY_LIMIT = 50;

/** Snapshot the undoable (authoring) subset of the previs state. */
function snapshotState(s: PrevisState): PrevisSnapshot {
  return {
    proxies: s.proxies,
    proxyKeyframes: s.proxyKeyframes,
    cameraChannels: s.cameraChannels,
    keyframes: s.keyframes,
    trajectory: s.trajectory,
    durationFrames: s.durationFrames,
  };
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
  addProxy: (kind) => {
    get().pushHistory();
    set((s) => {
      const p = defaultProxy(kind);
      const count = s.proxies.filter((x) => x.kind === kind).length + 1;
      if (kind === "character") p.label = `Character ${count}`;
      else if (kind === "set") p.label = `Set Piece ${count}`;
      else p.label = `${PRIMITIVE_DEFAULTS[kind].label} ${count}`;
      return { proxies: [...s.proxies, p], selectedProxyId: p.id };
    });
  },
  updateProxy: (id, patch) =>
    set((s) => ({
      proxies: s.proxies.map((p) => (p.id === id ? { ...p, ...patch } : p)),
    })),
  removeProxy: (id) => {
    get().pushHistory();
    set((s) => {
      const { [id]: _removed, ...rest } = s.proxyKeyframes;
      return {
        proxies: s.proxies.filter((p) => p.id !== id),
        selectedProxyId: s.selectedProxyId === id ? null : s.selectedProxyId,
        proxyKeyframes: rest,
      };
    });
  },
  duplicateSelectedProxy: () =>
    set((s) => {
      if (!s.selectedProxyId) return {};
      const src = s.proxies.find((p) => p.id === s.selectedProxyId);
      if (!src) return {};
      get().pushHistory();
      const copy: ProxyObject = {
        ...src,
        id: uid(),
        label: `${src.label} copy`,
        position: [src.position[0] + 1, src.position[1], src.position[2] + 1],
      };
      // Copy the source proxy's keyframe track (offset by 0 frames — same timing)
      const srcTrack = s.proxyKeyframes[src.id] ?? [];
      const copyTrack = srcTrack.map((k) => ({ ...k }));
      return {
        proxies: [...s.proxies, copy],
        selectedProxyId: copy.id,
        proxyKeyframes: { ...s.proxyKeyframes, [copy.id]: copyTrack },
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
  cameraChannels: emptyCameraChannels(),  // source of truth — per-axis tracks
  keyframes: [],  // derived from cameraChannels for display/spline
  setTrajectory: (patch) =>
    set((s) => {
      const next = { ...s.trajectory, ...patch };
      // Only regenerate keyframes from the template if we're on a preset
      // (custom = manual keyframing, so don't clobber user keys).
      if (next.preset === "custom") return { trajectory: next };
      const channels = generatePresetKeyframes(next, s.durationFrames);
      return { trajectory: next, cameraChannels: channels, keyframes: channelsToKeyframes(channels) };
    }),
  applyPreset: (preset) => {
    get().pushHistory();
    set((s) => {
      const next = { ...s.trajectory, preset };
      if (preset === "custom") {
        // "Custom" = clear all keyframes, start fresh (empty state).
        return {
          trajectory: next,
          cameraChannels: emptyCameraChannels(),
          keyframes: [],
          currentFrame: 0,
          isPlaying: false,
        };
      }
      const channels = generatePresetKeyframes(next, s.durationFrames);
      return {
        trajectory: next,
        cameraChannels: channels,
        keyframes: channelsToKeyframes(channels),
        currentFrame: 0,
        isPlaying: false,
      };
    });
  },
  setKeyframePosition: (frame, position) =>
    set((s) => {
      // Update the 3 position channels at this frame.
      const channels = { ...s.cameraChannels };
      for (const ch of ["posX", "posY", "posZ"] as const) {
        const idx = channels[ch].findIndex((k) => k.frame === frame);
        const val = ch === "posX" ? position[0] : ch === "posY" ? position[1] : position[2];
        const kfs = idx >= 0
          ? channels[ch].map((k, i) => (i === idx ? { ...k, value: val } : k))
          : [...channels[ch], { frame, value: val }];
        kfs.sort((a, b) => a.frame - b.frame);
        channels[ch] = kfs;
      }
      return { cameraChannels: channels, keyframes: channelsToKeyframes(channels), trajectory: { ...s.trajectory, preset: "custom" } };
    }),
  setKeyframeTarget: (frame, target) =>
    set((s) => {
      const channels = { ...s.cameraChannels };
      for (const ch of ["targetX", "targetY", "targetZ"] as const) {
        const idx = channels[ch].findIndex((k) => k.frame === frame);
        const val = ch === "targetX" ? target[0] : ch === "targetY" ? target[1] : target[2];
        const kfs = idx >= 0
          ? channels[ch].map((k, i) => (i === idx ? { ...k, value: val } : k))
          : [...channels[ch], { frame, value: val }];
        kfs.sort((a, b) => a.frame - b.frame);
        channels[ch] = kfs;
      }
      return { cameraChannels: channels, keyframes: channelsToKeyframes(channels), trajectory: { ...s.trajectory, preset: "custom" } };
    }),
  addKeyframeAtFrame: (frame, position, target, roll, focal) =>
    set((s) => {
      // Sample the current roll/focal so unspecified values are preserved.
      const cur = sampleTrajectory(
        s.cameraChannels,
        s.durationFrames > 0 ? frame / s.durationFrames : 0,
        s.durationFrames,
      );
      // Write all 8 channels at this frame.
      const channels = { ...s.cameraChannels };
      const vals: Record<string, number> = {
        posX: position[0], posY: position[1], posZ: position[2],
        targetX: target[0], targetY: target[1], targetZ: target[2],
        roll: roll ?? cur.roll,
        focal: focal ?? (cur.focal ?? s.focalLength),
      };
      for (const ch of Object.keys(vals) as CameraChannel[]) {
        const idx = channels[ch].findIndex((k) => k.frame === frame);
        const kfs = idx >= 0
          ? channels[ch].map((k, i) => (i === idx ? { ...k, value: vals[ch] } : k))
          : [...channels[ch], { frame, value: vals[ch] }];
        kfs.sort((a, b) => a.frame - b.frame);
        channels[ch] = kfs;
      }
      return { cameraChannels: channels, keyframes: channelsToKeyframes(channels), trajectory: { ...s.trajectory, preset: "custom" } };
    }),
  removeKeyframeAtFrame: (frame) => {
    get().pushHistory();
    set((s) => {
      // Remove from all channels at this frame.
      const channels = { ...s.cameraChannels };
      for (const ch of Object.keys(channels) as CameraChannel[]) {
        channels[ch] = channels[ch].filter((k) => k.frame !== frame);
      }
      return { cameraChannels: channels, keyframes: channelsToKeyframes(channels), trajectory: { ...s.trajectory, preset: "custom" } };
    });
  },
  addChannelKeyframe: (channel, frame, value, ease) =>
    set((s) => {
      const track = s.cameraChannels[channel];
      const idx = track.findIndex((k) => k.frame === frame);
      const kfs = idx >= 0
        ? track.map((k, i) => (i === idx ? { ...k, value, ease } : k))
        : [...track, { frame, value, ease }];
      kfs.sort((a, b) => a.frame - b.frame);
      const channels = { ...s.cameraChannels, [channel]: kfs };
      return { cameraChannels: channels, keyframes: channelsToKeyframes(channels), trajectory: { ...s.trajectory, preset: "custom" } };
    }),
  removeChannelKeyframe: (channel, frame) => {
    get().pushHistory();
    set((s) => {
      const kfs = s.cameraChannels[channel].filter((k) => k.frame !== frame);
      const channels = { ...s.cameraChannels, [channel]: kfs };
      return { cameraChannels: channels, keyframes: channelsToKeyframes(channels), trajectory: { ...s.trajectory, preset: "custom" } };
    });
  },
  toggleChannelKeyframeEase: (channel, frame) => {
    get().pushHistory();
    set((s) => {
      const kfs = s.cameraChannels[channel].map((k) =>
        k.frame === frame ? { ...k, ease: k.ease === "linear" ? ("smooth" as const) : ("linear" as const) } : k,
      );
      const channels = { ...s.cameraChannels, [channel]: kfs };
      return { cameraChannels: channels };
    });
  },

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
  removeProxyKeyframe: (proxyId, frame) => {
    get().pushHistory();
    set((s) => {
      const track = s.proxyKeyframes[proxyId];
      if (!track) return {};
      const kfs = track.filter((k) => k.frame !== frame);
      return { proxyKeyframes: { ...s.proxyKeyframes, [proxyId]: kfs } };
    });
  },

  // Timeline / playback
  fps: 24,
  durationFrames: 96,
  currentFrame: 0,
  isPlaying: false,
  setDurationFrames: (n) =>
    set((s) => {
      if (s.trajectory.preset === "custom") {
        return { durationFrames: n, currentFrame: Math.min(s.currentFrame, n) };
      }
      const channels = generatePresetKeyframes(s.trajectory, n);
      return {
        durationFrames: n,
        cameraChannels: channels,
        keyframes: channelsToKeyframes(channels),
        currentFrame: Math.min(s.currentFrame, n),
      };
    }),
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

  // Saved previs recording
  savedPrevisUrl: null,
  setSavedPrevisUrl: (savedPrevisUrl) => set({ savedPrevisUrl }),

  // Gizmo snapping
  snapEnabled: false,
  setSnapEnabled: (snapEnabled) => set({ snapEnabled }),

  // Undo/redo (authoring history)
  past: [],
  future: [],
  pushHistory: () =>
    set((s) => ({
      past: [...s.past, snapshotState(s)].slice(-HISTORY_LIMIT),
      future: [],
    })),
  undo: () =>
    set((s) => {
      if (s.past.length === 0) return {};
      const prev = s.past[s.past.length - 1];
      return {
        future: [snapshotState(s), ...s.future].slice(0, HISTORY_LIMIT),
        past: s.past.slice(0, -1),
        ...prev,
      };
    }),
  redo: () =>
    set((s) => {
      if (s.future.length === 0) return {};
      const next = s.future[0];
      return {
        past: [...s.past, snapshotState(s)].slice(-HISTORY_LIMIT),
        future: s.future.slice(1),
        ...next,
      };
    }),

  // Persistence
  serialize: () => {
    const s = get();
    return {
      version: 1,
      proxies: s.proxies,
      proxyKeyframes: s.proxyKeyframes,
      cameraChannels: s.cameraChannels,
      trajectory: s.trajectory,
      durationFrames: s.durationFrames,
      fps: s.fps,
      focalLength: s.focalLength,
      aspectRatio: s.aspectRatio,
      actionAxisAngle: s.actionAxisAngle,
      depthMode: s.depthMode,
      depthRange: s.depthRange,
      renderResolution: s.renderResolution,
    };
  },
  hydrate: (data) =>
    set((s) => {
      const channels = data.cameraChannels ?? emptyCameraChannels();
      return {
        proxies: data.proxies ?? s.proxies,
        proxyKeyframes: data.proxyKeyframes ?? s.proxyKeyframes,
        cameraChannels: channels,
        keyframes: channelsToKeyframes(channels),
        trajectory: data.trajectory ?? s.trajectory,
        durationFrames: data.durationFrames ?? s.durationFrames,
        fps: data.fps ?? s.fps,
        focalLength: data.focalLength ?? s.focalLength,
        aspectRatio: data.aspectRatio ?? s.aspectRatio,
        actionAxisAngle: data.actionAxisAngle ?? s.actionAxisAngle,
        depthMode: data.depthMode ?? s.depthMode,
        depthRange: data.depthRange ?? s.depthRange,
        renderResolution: data.renderResolution ?? s.renderResolution,
        currentFrame: 0,
        isPlaying: false,
        past: [],
        future: [],
      };
    }),
  resetScene: () => {
    get().pushHistory();
    const channels = emptyCameraChannels();
    set({
      proxies: [],
      selectedProxyId: null,
      cameraSelected: false,
      proxyKeyframes: {},
      cameraChannels: channels,
      keyframes: channelsToKeyframes(channels),
      trajectory: { ...DEFAULT_TRAJECTORY, preset: "custom" },
      currentFrame: 0,
      isPlaying: false,
      savedPrevisUrl: null,
    });
  },
}));
