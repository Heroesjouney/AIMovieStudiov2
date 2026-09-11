/**
 * Previs Trajectory Engine
 *
 * Pure three.js math for building + sampling camera motion curves.
 * Used by the previs store (keyframe generation) and the 3D scene
 * (live sampling during playback).
 */

import * as THREE from "three";

export type TrajectoryPreset = "dolly" | "arc" | "crane" | "custom";

export interface CameraKeyframe {
  frame: number;
  position: [number, number, number];
  target: [number, number, number];
}

/** A keyframe for an object's transform (position, rotation, scale). */
export interface ProxyKeyframe {
  frame: number;
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
}

// --- Per-axis camera keyframing ---
// Each camera transform channel gets its own keyframe track so the user can
// keyframe X position independently from Y, pan independently from tilt, etc.

export type CameraChannel = "posX" | "posY" | "posZ" | "targetX" | "targetY" | "targetZ";

export const CAMERA_CHANNELS: { id: CameraChannel; label: string; color: string }[] = [
  { id: "posX", label: "Pos X", color: "#ef4444" },
  { id: "posY", label: "Pos Y", color: "#22c55e" },
  { id: "posZ", label: "Pos Z", color: "#3b82f6" },
  { id: "targetX", label: "Tgt X", color: "#f87171" },
  { id: "targetY", label: "Tgt Y", color: "#4ade80" },
  { id: "targetZ", label: "Tgt Z", color: "#60a5fa" },
];

export interface Keyframe1D {
  frame: number;
  value: number;
}

export type CameraChannelKeyframes = Record<CameraChannel, Keyframe1D[]>;

export function emptyCameraChannels(): CameraChannelKeyframes {
  return {
    posX: [],
    posY: [],
    posZ: [],
    targetX: [],
    targetY: [],
    targetZ: [],
  };
}

/** Convert a full-transform keyframe array into per-channel keyframes. */
export function keyframesToChannels(keyframes: CameraKeyframe[]): CameraChannelKeyframes {
  return {
    posX: keyframes.map((k) => ({ frame: k.frame, value: k.position[0] })),
    posY: keyframes.map((k) => ({ frame: k.frame, value: k.position[1] })),
    posZ: keyframes.map((k) => ({ frame: k.frame, value: k.position[2] })),
    targetX: keyframes.map((k) => ({ frame: k.frame, value: k.target[0] })),
    targetY: keyframes.map((k) => ({ frame: k.frame, value: k.target[1] })),
    targetZ: keyframes.map((k) => ({ frame: k.frame, value: k.target[2] })),
  };
}

/** Convert per-channel keyframes back into full-transform keyframes (for display). */
export function channelsToKeyframes(channels: CameraChannelKeyframes): CameraKeyframe[] {
  // Collect all unique frame numbers across all channels
  const frameSet = new Set<number>();
  for (const ch of CAMERA_CHANNELS) {
    for (const k of channels[ch.id]) frameSet.add(k.frame);
  }
  const frames = Array.from(frameSet).sort((a, b) => a - b);
  return frames.map((frame) => ({
    frame,
    position: [
      sampleChannel1D(channels.posX, frame),
      sampleChannel1D(channels.posY, frame),
      sampleChannel1D(channels.posZ, frame),
    ],
    target: [
      sampleChannel1D(channels.targetX, frame),
      sampleChannel1D(channels.targetY, frame),
      sampleChannel1D(channels.targetZ, frame),
    ],
  }));
}

/**
 * Sample a 1D keyframe track at a given frame using linear interpolation.
 * Falls back to the nearest keyframe value if outside the keyframe range.
 */
export function sampleChannel1D(keyframes: Keyframe1D[], frame: number): number {
  if (keyframes.length === 0) return 0;
  if (keyframes.length === 1) return keyframes[0].value;
  // Sort by frame (defensive — they should already be sorted)
  const sorted = keyframes.length > 1 && keyframes[0].frame > keyframes[1].frame
    ? [...keyframes].sort((a, b) => a.frame - b.frame)
    : keyframes;
  if (frame <= sorted[0].frame) return sorted[0].value;
  if (frame >= sorted[sorted.length - 1].frame) return sorted[sorted.length - 1].value;
  for (let i = 0; i < sorted.length - 1; i++) {
    if (sorted[i].frame <= frame && sorted[i + 1].frame >= frame) {
      const span = Math.max(0.001, sorted[i + 1].frame - sorted[i].frame);
      const t = (frame - sorted[i].frame) / span;
      return THREE.MathUtils.lerp(sorted[i].value, sorted[i + 1].value, t);
    }
  }
  return sorted[sorted.length - 1].value;
}

export interface TrajectoryConfig {
  preset: TrajectoryPreset;
  startPos: [number, number, number];
  endPos: [number, number, number];
  /** Center the camera looks at / orbits around. */
  target: [number, number, number];
  /** Orbit radius (arc preset). */
  radius: number;
  /** Start/end orbit angles in degrees (arc preset). */
  startAngle: number;
  endAngle: number;
}

export const DEFAULT_TRAJECTORY: TrajectoryConfig = {
  preset: "dolly",
  startPos: [0, 1.6, 6],
  endPos: [0, 1.6, 2.5],
  target: [0, 1.0, 0],
  radius: 4,
  startAngle: 20,
  endAngle: -20,
};

/**
 * Generate keyframes for a motion preset across `durationFrames`.
 *
 * Presets only produce 2 keyframes (start + end) — the CatmullRom spline
 * interpolates smoothly between them, so extra dots would just be visual
 * clutter. Users add more keyframes manually via "Set Key" when they want
 * custom control points.
 */
export function generatePresetKeyframes(
  cfg: TrajectoryConfig,
  durationFrames: number,
): CameraChannelKeyframes {
  // Build the full-transform keyframes, then convert to per-channel.
  let kfs: CameraKeyframe[];
  if (cfg.preset === "dolly") {
    kfs = [
      { frame: 0, position: cfg.startPos, target: cfg.target },
      { frame: durationFrames, position: cfg.endPos, target: cfg.target },
    ];
  } else if (cfg.preset === "arc") {
    const center = new THREE.Vector3(...cfg.target);
    const startH = cfg.startPos[1];
    const startAng = cfg.startAngle * (Math.PI / 180);
    const endAng = cfg.endAngle * (Math.PI / 180);
    const sx = center.x + cfg.radius * Math.sin(startAng);
    const sz = center.z + cfg.radius * Math.cos(startAng);
    const ex = center.x + cfg.radius * Math.sin(endAng);
    const ez = center.z + cfg.radius * Math.cos(endAng);
    kfs = [
      { frame: 0, position: [sx, startH, sz], target: cfg.target },
      { frame: durationFrames, position: [ex, startH, ez], target: cfg.target },
    ];
  } else if (cfg.preset === "crane") {
    const pitchEnd = (cfg.endPos[1] - cfg.startPos[1]) / Math.max(0.001, cfg.endPos[1] - cfg.startPos[1]);
    kfs = [
      { frame: 0, position: cfg.startPos, target: cfg.target },
      {
        frame: durationFrames,
        position: cfg.endPos,
        target: [cfg.target[0], cfg.target[1] - pitchEnd * 0.6, cfg.target[2]] as [number, number, number],
      },
    ];
  } else {
    kfs = [
      { frame: 0, position: cfg.startPos, target: cfg.target },
      { frame: durationFrames, position: cfg.endPos, target: cfg.target },
    ];
  }
  return keyframesToChannels(kfs);
}

function lerp3(
  a: [number, number, number],
  b: [number, number, number],
  t: number,
): [number, number, number] {
  return [
    THREE.MathUtils.lerp(a[0], b[0], t),
    THREE.MathUtils.lerp(a[1], b[1], t),
    THREE.MathUtils.lerp(a[2], b[2], t),
  ];
}

/**
 * Build Catmull-Rom curves through keyframe positions and look-at targets.
 * Falls back to a straight line when fewer than 2 keyframes exist.
 */
export function buildCurves(keyframes: CameraKeyframe[]) {
  if (keyframes.length >= 2) {
    const positions = keyframes.map((k) => new THREE.Vector3(...k.position));
    const targets = keyframes.map((k) => new THREE.Vector3(...k.target));
    return {
      posCurve: new THREE.CatmullRomCurve3(positions),
      targetCurve: new THREE.CatmullRomCurve3(targets),
      ready: true as const,
    };
  }
  return { posCurve: null, targetCurve: null, ready: false as const };
}

export type SampleResult = { position: THREE.Vector3; target: THREE.Vector3; ready: false } | {
  position: THREE.Vector3;
  target: THREE.Vector3;
  ready: true;
};

/**
 * Sample camera position + look-at target at a given normalized time `t` in [0,1].
 * Accepts either the old CameraKeyframe[] format or the new per-channel format.
 */
export function sampleTrajectory(
  keyframesOrChannels: CameraKeyframe[] | CameraChannelKeyframes,
  t: number,
  durationFrames?: number,
): { position: THREE.Vector3; target: THREE.Vector3 } {
  const clamped = Math.max(0, Math.min(1, t));

  // Detect per-channel format
  if (!Array.isArray(keyframesOrChannels)) {
    const ch = keyframesOrChannels;
    // If all channels are empty, fall back to a sensible default camera
    // position (eye-level, looking at the scene center).
    const allEmpty = ch.posX.length === 0 && ch.posY.length === 0 && ch.posZ.length === 0
      && ch.targetX.length === 0 && ch.targetY.length === 0 && ch.targetZ.length === 0;
    if (allEmpty) {
      return {
        position: new THREE.Vector3(0, 1.6, 6),
        target: new THREE.Vector3(0, 1, 0),
      };
    }
    const frame = durationFrames !== undefined ? clamped * durationFrames : 0;
    return {
      position: new THREE.Vector3(
        sampleChannel1D(ch.posX, frame),
        sampleChannel1D(ch.posY, frame),
        sampleChannel1D(ch.posZ, frame),
      ),
      target: new THREE.Vector3(
        sampleChannel1D(ch.targetX, frame),
        sampleChannel1D(ch.targetY, frame),
        sampleChannel1D(ch.targetZ, frame),
      ),
    };
  }

  // Legacy CameraKeyframe[] format
  const keyframes = keyframesOrChannels;
  const { posCurve, targetCurve, ready } = buildCurves(keyframes);
  if (!ready || !posCurve || !targetCurve) {
    const first = keyframes[0];
    const pos = first ? new THREE.Vector3(...first.position) : new THREE.Vector3(0, 1.6, 6);
    const tgt = first ? new THREE.Vector3(...first.target) : new THREE.Vector3(0, 1, 0);
    return { position: pos, target: tgt };
  }
  return { position: posCurve.getPoint(clamped), target: targetCurve.getPoint(clamped) };
}

/**
 * Convert a focal length (mm) to a vertical FOV (degrees) for a full-frame
 * sensor (36 x 24 mm). Used by the through-the-lens viewfinder camera.
 */
export function focalToFov(focalMm: number, sensorHeightMm = 24): number {
  return (2 * Math.atan(sensorHeightMm / (2 * Math.max(1, focalMm)))) * (180 / Math.PI);
}

/**
 * Sampled polyline of the trajectory path (for drawing the spline in the
 * editor view). Returns an array of [x,y,z] points.
 */
export function trajectoryPoints(
  keyframesOrChannels: CameraKeyframe[] | CameraChannelKeyframes,
  segments = 64,
  durationFrames?: number,
): [number, number, number][] {
  // Per-channel format
  if (!Array.isArray(keyframesOrChannels)) {
    const ch = keyframesOrChannels;
    // If all channels are empty, return a default static position (no spline).
    const allEmpty = ch.posX.length === 0 && ch.posY.length === 0 && ch.posZ.length === 0;
    if (allEmpty) return [[0, 1.6, 6], [0, 1.6, 6]];
    const dur = durationFrames ?? 96;
    const pts: [number, number, number][] = [];
    for (let i = 0; i <= segments; i++) {
      const frame = (i / segments) * dur;
      pts.push([
        sampleChannel1D(ch.posX, frame),
        sampleChannel1D(ch.posY, frame),
        sampleChannel1D(ch.posZ, frame),
      ]);
    }
    return pts;
  }

  // Legacy CameraKeyframe[] format
  const keyframes = keyframesOrChannels;
  const { posCurve, ready } = buildCurves(keyframes);
  if (!ready || !posCurve) {
    const pts = keyframes.map((k) => k.position);
    if (pts.length >= 2) return pts;
    if (pts.length === 1) return [pts[0], pts[0]];
    return [[0, 1.6, 6], [0, 1.6, 2.5]];
  }
  const pts: [number, number, number][] = [];
  for (let i = 0; i <= segments; i++) {
    const p = posCurve.getPoint(i / segments);
    pts.push([p.x, p.y, p.z]);
  }
  return pts;
}

/**
 * Sample an object's interpolated transform (position, rotation, scale) at a
 * given frame. Uses linear interpolation for position/scale and spherical
 * linear interpolation (slerp) for rotation between the two surrounding
 * keyframes. If fewer than 2 keyframes exist, returns the first keyframe's
 * transform (or a sensible default).
 */
export function sampleProxyTransform(
  keyframes: ProxyKeyframe[],
  frame: number,
): { position: [number, number, number]; rotation: [number, number, number]; scale: [number, number, number] } {
  if (keyframes.length === 0) {
    return { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] };
  }
  if (keyframes.length === 1) {
    const k = keyframes[0];
    return { position: k.position, rotation: k.rotation, scale: k.scale };
  }

  // Before the first keyframe
  if (frame <= keyframes[0].frame) {
    const k = keyframes[0];
    return { position: k.position, rotation: k.rotation, scale: k.scale };
  }
  // After the last keyframe
  if (frame >= keyframes[keyframes.length - 1].frame) {
    const k = keyframes[keyframes.length - 1];
    return { position: k.position, rotation: k.rotation, scale: k.scale };
  }

  // Find the two surrounding keyframes
  let a = keyframes[0];
  let b = keyframes[keyframes.length - 1];
  for (let i = 0; i < keyframes.length - 1; i++) {
    if (keyframes[i].frame <= frame && keyframes[i + 1].frame >= frame) {
      a = keyframes[i];
      b = keyframes[i + 1];
      break;
    }
  }

  const span = Math.max(1, b.frame - a.frame);
  const t = (frame - a.frame) / span;

  // Linear interpolation for position and scale
  const position: [number, number, number] = [
    THREE.MathUtils.lerp(a.position[0], b.position[0], t),
    THREE.MathUtils.lerp(a.position[1], b.position[1], t),
    THREE.MathUtils.lerp(a.position[2], b.position[2], t),
  ];
  const scale: [number, number, number] = [
    THREE.MathUtils.lerp(a.scale[0], b.scale[0], t),
    THREE.MathUtils.lerp(a.scale[1], b.scale[1], t),
    THREE.MathUtils.lerp(a.scale[2], b.scale[2], t),
  ];

  // Slerp for rotation (using quaternions for smooth interpolation)
  const qa = new THREE.Quaternion().setFromEuler(new THREE.Euler(...a.rotation));
  const qb = new THREE.Quaternion().setFromEuler(new THREE.Euler(...b.rotation));
  const qr = new THREE.Quaternion().slerpQuaternions(qa, qb, t);
  const e = new THREE.Euler().setFromQuaternion(qr);
  const rotation: [number, number, number] = [e.x, e.y, e.z];

  return { position, rotation, scale };
}
