"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Line, Html } from "@react-three/drei";
import * as THREE from "three";
import { usePrevisStore } from "@/lib/usePrevisStore";
import { focalToFov, sampleTrajectory, trajectoryPoints } from "@/lib/previsTrajectory";

const STAGE_EXTENT = 10;

/**
 * Editor-view overlay: trajectory spline, keyframe markers (click to delete),
 * the live shot camera marker (click to select → gizmo handles), FOV frustum,
 * and the 180° action-axis guideline.
 */
export function TrajectoryVisual({
  cameraRef,
}: {
  cameraRef: React.RefObject<THREE.Group>;
}) {
  const keyframes = usePrevisStore((s) => s.keyframes);
  const cameraChannels = usePrevisStore((s) => s.cameraChannels);
  const durationFrames = usePrevisStore((s) => s.durationFrames);
  const currentFrame = usePrevisStore((s) => s.currentFrame);
  const focalLength = usePrevisStore((s) => s.focalLength);
  const aspectRatio = usePrevisStore((s) => s.aspectRatio);
  const actionAxisAngle = usePrevisStore((s) => s.actionAxisAngle);
  const removeKeyframeAtFrame = usePrevisStore((s) => s.removeKeyframeAtFrame);
  const cameraSelected = usePrevisStore((s) => s.cameraSelected);
  const selectCamera = usePrevisStore((s) => s.selectCamera);

  const pathPts = useMemo(() => trajectoryPoints(cameraChannels, 96, durationFrames), [cameraChannels, durationFrames]);
  const aspect = aspectRatio === "16:9" ? 16 / 9 : 2.39 / 1;

  const frustumRef = useRef<THREE.LineSegments>(null);
  const frustumGeom = useMemo(() => new THREE.BufferGeometry(), []);

  useFrame(() => {
    const s = usePrevisStore.getState();
    const t = s.durationFrames > 0 ? s.currentFrame / s.durationFrames : 0;
    const { position, target } = sampleTrajectory(s.cameraChannels, t, s.durationFrames);

    // Drive the camera marker along the trajectory during playback, or when
    // the camera is NOT selected (so the gizmo isn't fighting the sampler).
    // When the camera is selected AND not playing, the gizmo has full control.
    if (cameraRef.current && (!cameraSelected || s.isPlaying)) {
      cameraRef.current.position.copy(position);
      cameraRef.current.lookAt(target);
    }

    // Rebuild frustum from the camera's current position (works during drag too)
    const camPos = cameraRef.current ? cameraRef.current.position : position;
    const dir = target.clone().sub(camPos);
    const dist = dir.length() || 1;
    dir.normalize();
    const fov = focalToFov(focalLength) * (Math.PI / 180);
    const halfH = Math.tan(fov / 2) * dist;
    const halfW = halfH * aspect;

    const up = new THREE.Vector3(0, 1, 0);
    const right = new THREE.Vector3().crossVectors(dir, up).normalize();
    const trueUp = new THREE.Vector3().crossVectors(right, dir).normalize();

    const center = camPos.clone().add(dir.clone().multiplyScalar(dist));
    const c = [
      center.clone().add(right.clone().multiplyScalar(halfW)).add(trueUp.clone().multiplyScalar(halfH)),
      center.clone().add(right.clone().multiplyScalar(-halfW)).add(trueUp.clone().multiplyScalar(halfH)),
      center.clone().add(right.clone().multiplyScalar(-halfW)).add(trueUp.clone().multiplyScalar(-halfH)),
      center.clone().add(right.clone().multiplyScalar(halfW)).add(trueUp.clone().multiplyScalar(-halfH)),
    ];
    const verts: number[] = [];
    for (let i = 0; i < 4; i++) {
      verts.push(camPos.x, camPos.y, camPos.z, c[i].x, c[i].y, c[i].z);
      const n = (i + 1) % 4;
      verts.push(c[i].x, c[i].y, c[i].z, c[n].x, c[n].y, c[n].z);
    }
    frustumGeom.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
    if (frustumRef.current) frustumRef.current.geometry = frustumGeom;
  });

  // 180° axis crossing detection
  const crossesLine = useMemo(() => {
    const t = durationFrames > 0 ? currentFrame / durationFrames : 0;
    const { position, target } = sampleTrajectory(cameraChannels, t, durationFrames);
    const horizAngle = (Math.atan2(position.x - target.x, position.z - target.z) * 180) / Math.PI;
    const axisBack = (actionAxisAngle + 180) % 360;
    const norm = ((horizAngle - axisBack + 540) % 360) - 180;
    return Math.abs(norm) < 18;
  }, [cameraChannels, currentFrame, durationFrames, actionAxisAngle]);

  const axisRad = (actionAxisAngle * Math.PI) / 180;
  const axisLine: [number, number, number][] = [
    [Math.sin(axisRad) * STAGE_EXTENT, 0.03, Math.cos(axisRad) * STAGE_EXTENT],
    [-Math.sin(axisRad) * STAGE_EXTENT, 0.03, -Math.cos(axisRad) * STAGE_EXTENT],
  ];

  const currentFrameRounded = Math.round(currentFrame);

  return (
    <group>
      {/* Action axis (180° line) */}
      <Line
        points={axisLine}
        color={crossesLine ? "#ef4444" : "#3b82f6"}
        lineWidth={crossesLine ? 2.5 : 1.2}
        transparent
        opacity={crossesLine ? 0.85 : 0.4}
        dashed
        dashSize={0.25}
        gapSize={0.15}
      />

      {/* Trajectory spline */}
      {pathPts.length >= 2 && (
        <Line points={pathPts} color="#6366f1" lineWidth={2} transparent opacity={0.8} />
      )}

      {/* Keyframe markers — click to delete (if more than 2 remain) */}
      {keyframes.map((k, i) => {
        const isCurrent = k.frame === currentFrameRounded;
        return (
          <group key={i} position={k.position}>
            <mesh
              onClick={(e) => {
                e.stopPropagation();
                removeKeyframeAtFrame(k.frame);
              }}
              onPointerOver={(e) => { e.stopPropagation(); document.body.style.cursor = "pointer"; }}
              onPointerOut={() => { document.body.style.cursor = "auto"; }}
            >
              <sphereGeometry args={[isCurrent ? 0.12 : 0.08, 12, 12]} />
              <meshBasicMaterial color={isCurrent ? "#ffffff" : "#818cf8"} />
            </mesh>
            {isCurrent && (
              <mesh>
                <sphereGeometry args={[0.16, 12, 12]} />
                <meshBasicMaterial color="#ffffff" transparent opacity={0.2} />
              </mesh>
            )}
            <Html position={[0, 0.2, 0]} center>
              <div className={`text-[7px] select-none pointer-events-none whitespace-nowrap ${isCurrent ? "text-white font-bold" : "text-studio-muted/60"}`}>
                f{k.frame}
              </div>
            </Html>
          </group>
        );
      })}

      {/* FOV frustum */}
      <lineSegments ref={frustumRef}>
        <lineBasicMaterial color="#f59e0b" transparent opacity={0.5} />
      </lineSegments>

      {/* 180° warning label */}
      {crossesLine && (
        <Html position={[0, STAGE_EXTENT * 0.4, 0]} center>
          <div className="text-[10px] font-bold text-red-400 bg-red-500/15 px-1.5 py-0.5 rounded select-none pointer-events-none whitespace-nowrap">
            180° AXIS CROSSED
          </div>
        </Html>
      )}
    </group>
  );
}

/**
 * The draggable shot camera marker. Rendered separately so it can hold the ref
 * that TransformControls attaches to. Click to select → gizmo handles appear.
 *
 * IMPORTANT: Object3D.lookAt() points +Z toward the target (unlike Camera which
 * uses -Z). So the lens is on +Z to face the subject.
 */
export function CameraMarker({
  cameraRef,
}: {
  cameraRef: React.RefObject<THREE.Group>;
}) {
  const cameraSelected = usePrevisStore((s) => s.cameraSelected);
  const selectCamera = usePrevisStore((s) => s.selectCamera);

  const bodyColor = "#52525b";   // bright enough to see against the dark floor
  const accentColor = "#f59e0b"; // amber accent for visibility
  const emissive = cameraSelected ? "#f59e0b" : "#3f3f46";
  const emissiveIntensity = cameraSelected ? 0.5 : 0.15;

  return (
    <group ref={cameraRef}>
      {/* Invisible larger hitbox for easier clicking */}
      <mesh
        onClick={(e) => {
          e.stopPropagation();
          selectCamera(true);
        }}
        onPointerOver={(e) => { e.stopPropagation(); document.body.style.cursor = "pointer"; }}
        onPointerOut={() => { document.body.style.cursor = "auto"; }}
        visible={false}
      >
        <boxGeometry args={[0.5, 0.35, 0.65]} />
      </mesh>

      {/* --- Camera body (main rectangular block) --- */}
      <mesh castShadow>
        <boxGeometry args={[0.34, 0.22, 0.16]} />
        <meshStandardMaterial color={bodyColor} metalness={0.6} roughness={0.4} emissive={emissive} emissiveIntensity={emissiveIntensity} />
      </mesh>

      {/* --- Lens barrel (cylinder pointing forward +Z toward subject) --- */}
      <group position={[0, 0, 0.1]}>
        {/* Main barrel */}
        <mesh position={[0, 0, 0.08]} rotation={[Math.PI / 2, 0, 0]} castShadow>
          <cylinderGeometry args={[0.075, 0.07, 0.16, 16]} />
          <meshStandardMaterial color="#27272a" metalness={0.85} roughness={0.2} />
        </mesh>
        {/* Lens hood (wider ring at front) */}
        <mesh position={[0, 0, 0.17]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.082, 0.082, 0.03, 16]} />
          <meshStandardMaterial color="#18181b" metalness={0.9} roughness={0.15} />
        </mesh>
        {/* Amber accent ring (makes lens visible from far away) */}
        <mesh position={[0, 0, 0.155]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.078, 0.078, 0.01, 16]} />
          <meshStandardMaterial color={accentColor} emissive={accentColor} emissiveIntensity={0.6} metalness={0.5} roughness={0.3} />
        </mesh>
        {/* Front glass element (dark, reflective) */}
        <mesh position={[0, 0, 0.19]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.055, 0.055, 0.01, 16]} />
          <meshStandardMaterial color="#09090b" metalness={0.95} roughness={0.05} />
        </mesh>
      </group>

      {/* --- Viewfinder bump (top-back, -Z side away from subject) --- */}
      <mesh position={[0, 0.08, -0.04]} castShadow>
        <boxGeometry args={[0.1, 0.06, 0.08]} />
        <meshStandardMaterial color={bodyColor} metalness={0.6} roughness={0.4} emissive={emissive} emissiveIntensity={emissiveIntensity} />
      </mesh>
      {/* Viewfinder eyepiece (smaller, darker) */}
      <mesh position={[0, 0.09, -0.09]}>
        <boxGeometry args={[0.06, 0.04, 0.02]} />
        <meshStandardMaterial color="#09090b" metalness={0.5} roughness={0.4} />
      </mesh>

      {/* --- Hot shoe (top mount, small rail) --- */}
      <mesh position={[0, 0.13, 0]}>
        <boxGeometry args={[0.06, 0.015, 0.05]} />
        <meshStandardMaterial color="#71717a" metalness={0.8} roughness={0.25} />
      </mesh>

      {/* --- Side grip (right side, angled) --- */}
      <mesh position={[-0.2, -0.02, -0.01]} rotation={[0, 0, 0.15]} castShadow>
        <boxGeometry args={[0.06, 0.18, 0.12]} />
        <meshStandardMaterial color="#3f3f46" metalness={0.5} roughness={0.5} />
      </mesh>

      {/* --- Recording indicator LED (top-front, red dot) --- */}
      <mesh position={[0.12, 0.1, 0.07]}>
        <sphereGeometry args={[0.014, 8, 8]} />
        <meshStandardMaterial color="#ef4444" emissive="#ef4444" emissiveIntensity={1} />
      </mesh>

      {/* --- Top handle / strap mounts --- */}
      <mesh position={[-0.15, 0.13, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.018, 0.018, 0.04, 8]} />
        <meshStandardMaterial color="#71717a" metalness={0.8} roughness={0.25} />
      </mesh>
      <mesh position={[0.15, 0.13, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.018, 0.018, 0.04, 8]} />
        <meshStandardMaterial color="#71717a" metalness={0.8} roughness={0.25} />
      </mesh>

      <Html position={[0, 0.4, 0]} center>
        <div className={`text-[7px] font-bold select-none pointer-events-none whitespace-nowrap ${cameraSelected ? "text-white" : "text-amber-400"}`}>
          {cameraSelected ? "CAMERA" : "click to edit"}
        </div>
      </Html>
    </group>
  );
}
