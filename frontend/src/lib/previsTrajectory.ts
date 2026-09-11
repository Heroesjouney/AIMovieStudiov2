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
): CameraKeyframe[] {
  if (cfg.preset === "dolly") {
    // Linear translation between start and end — 2 keyframes is enough.
    return [
      { frame: 0, position: cfg.startPos, target: cfg.target },
      { frame: durationFrames, position: cfg.endPos, target: cfg.target },
    ];
  }

  if (cfg.preset === "arc") {
    // Arc around the target — start and end positions on the orbit circle.
    const center = new THREE.Vector3(...cfg.target);
    const startH = cfg.startPos[1];
    const startAng = cfg.startAngle * (Math.PI / 180);
    const endAng = cfg.endAngle * (Math.PI / 180);
    const sx = center.x + cfg.radius * Math.sin(startAng);
    const sz = center.z + cfg.radius * Math.cos(startAng);
    const ex = center.x + cfg.radius * Math.sin(endAng);
    const ez = center.z + cfg.radius * Math.cos(endAng);
    return [
      { frame: 0, position: [sx, startH, sz], target: cfg.target },
      { frame: durationFrames, position: [ex, startH, ez], target: cfg.target },
    ];
  }

  if (cfg.preset === "crane") {
    // Vertical move with pitch — start and end with adjusted look-down.
    const pitchEnd = (cfg.endPos[1] - cfg.startPos[1]) / Math.max(0.001, cfg.endPos[1] - cfg.startPos[1]);
    return [
      { frame: 0, position: cfg.startPos, target: cfg.target },
      {
        frame: durationFrames,
        position: cfg.endPos,
        target: [cfg.target[0], cfg.target[1] - pitchEnd * 0.6, cfg.target[2]] as [number, number, number],
      },
    ];
  }

  // "custom" — start with 2 default keyframes (start + end).
  return [
    { frame: 0, position: cfg.startPos, target: cfg.target },
    { frame: durationFrames, position: cfg.endPos, target: cfg.target },
  ];
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
 */
export function sampleTrajectory(
  keyframes: CameraKeyframe[],
  t: number,
): { position: THREE.Vector3; target: THREE.Vector3 } {
  const clamped = Math.max(0, Math.min(1, t));
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
export function trajectoryPoints(keyframes: CameraKeyframe[], segments = 64): [number, number, number][] {
  const { posCurve, ready } = buildCurves(keyframes);
  if (!ready || !posCurve) {
    // Fallback: use the raw keyframe positions. If fewer than 2, pad with
    // defaults so the <Line> component never receives an empty array
    // (which crashes with "Invalid typed array length: -6").
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
