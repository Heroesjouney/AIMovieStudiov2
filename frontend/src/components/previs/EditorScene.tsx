"use client";

import { useRef, useEffect, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Grid, Html, OrbitControls, TransformControls } from "@react-three/drei";
import * as THREE from "three";
import { usePrevisStore } from "@/lib/usePrevisStore";
import { ProxyMesh } from "./ProxyMesh";
import { TrajectoryVisual, CameraMarker } from "./TrajectoryVisual";
import { sampleTrajectory, sampleProxyTransform, focalToFov } from "@/lib/previsTrajectory";

const GRID_SIZE = 20;

/**
 * The authoring scene rendered inside the editor Canvas:
 * ground grid + distance markers, axis vectors, interactive proxies with
 * TransformControls gizmos, a draggable shot camera, and the trajectory overlay.
 */
export function EditorScene() {
  const proxies = usePrevisStore((s) => s.proxies);
  const selectedProxyId = usePrevisStore((s) => s.selectedProxyId);
  const selectProxy = usePrevisStore((s) => s.selectProxy);
  const updateProxy = usePrevisStore((s) => s.updateProxy);
  const gizmoMode = usePrevisStore((s) => s.gizmoMode);
  const cameraSelected = usePrevisStore((s) => s.cameraSelected);
  const selectCamera = usePrevisStore((s) => s.selectCamera);
  const addKeyframeAtFrame = usePrevisStore((s) => s.addKeyframeAtFrame);
  const addProxyKeyframe = usePrevisStore((s) => s.addProxyKeyframe);
  const currentFrame = usePrevisStore((s) => s.currentFrame);
  const durationFrames = usePrevisStore((s) => s.durationFrames);
  const viewMode = usePrevisStore((s) => s.viewMode);
  const focalLength = usePrevisStore((s) => s.focalLength);
  const aspectRatio = usePrevisStore((s) => s.aspectRatio);
  const isPlaying = usePrevisStore((s) => s.isPlaying);

  const refMap = useRef(new Map<string, THREE.Group>());
  const cameraRef = useRef<THREE.Group>(null);

  // Track the camera's position between gizmo ticks so we can compute the
  // incremental delta for translate mode (move target with camera, not orbit).
  const prevCamPos = useRef<THREE.Vector3 | null>(null);

  // Reset the delta tracker when a new drag could start.
  useEffect(() => {
    prevCamPos.current = null;
  }, [gizmoMode, cameraSelected]);

  const selectedProxyRef = selectedProxyId ? refMap.current.get(selectedProxyId) : undefined;

  // Proxy gizmo — update the base transform AND create a keyframe at the
  // current frame so the movement is recorded on the proxy's track.
  const handleProxyGizmoChange = () => {
    if (!selectedProxyId) return;
    const obj = refMap.current.get(selectedProxyId);
    if (!obj) return;
    const pos: [number, number, number] = [obj.position.x, obj.position.y, obj.position.z];
    const rot: [number, number, number] = [obj.rotation.x, obj.rotation.y, obj.rotation.z];
    const scl: [number, number, number] = [obj.scale.x, obj.scale.y, obj.scale.z];
    updateProxy(selectedProxyId, { position: pos, rotation: rot, scale: scl });
    addProxyKeyframe(selectedProxyId, Math.round(currentFrame), pos, rot, scl);
  };

  // Camera gizmo — behaviour depends on the active gizmo mode:
  //
  //   translate: move position + target by the same delta so the camera
  //   translates forward/back/sideways without rotating (no orbiting).
  //
  //   rotate: the gizmo rotates the camera group. We read the new forward
  //   direction from the quaternion and project a new look-at target at the
  //   current distance — so the camera stays put but aims somewhere else.
  const handleCameraGizmoChange = () => {
    if (!cameraRef.current) return;
    const frame = Math.round(currentFrame);
    const t = durationFrames > 0 ? currentFrame / durationFrames : 0;
    // Always read fresh keyframes from the store (subscribed value can lag).
    const { position: sampledPos, target: sampledTarget } = sampleTrajectory(
      usePrevisStore.getState().keyframes,
      t,
    );
    const newPos = cameraRef.current.position;

    if (gizmoMode === "translate") {
      // Delta from the previous tick (or from the sampled position on first tick).
      const prev = prevCamPos.current ?? sampledPos;
      const delta = new THREE.Vector3().subVectors(newPos, prev);
      // Move the target by the same delta → camera keeps looking the same way.
      const newTarget = sampledTarget.clone().add(delta);
      addKeyframeAtFrame(
        frame,
        [newPos.x, newPos.y, newPos.z],
        [newTarget.x, newTarget.y, newTarget.z],
      );
    } else if (gizmoMode === "rotate") {
      // The gizmo rotated the group — read forward direction from the quaternion.
      // Object3D.lookAt points +Z toward the target, so forward = +Z.
      const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(cameraRef.current.quaternion);
      const dist = sampledPos.distanceTo(sampledTarget) || 5;
      const newTarget = new THREE.Vector3(
        newPos.x + forward.x * dist,
        newPos.y + forward.y * dist,
        newPos.z + forward.z * dist,
      );
      addKeyframeAtFrame(
        frame,
        [newPos.x, newPos.y, newPos.z],
        [newTarget.x, newTarget.y, newTarget.z],
      );
    }

    prevCamPos.current = newPos.clone();
  };

  return (
    <>
      <ambientLight intensity={0.7} />
      <directionalLight position={[6, 8, 4]} intensity={0.9} castShadow />
      <directionalLight position={[-4, 3, -5]} intensity={0.3} color="#60a5fa" />

      {/* Solid ground plane (bright enough to read as a floor) */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} receiveShadow>
        <planeGeometry args={[GRID_SIZE, GRID_SIZE]} />
        <meshBasicMaterial color="#3a3a48" />
      </mesh>

      {/* Ground grid with distance markers */}
      <Grid
        args={[GRID_SIZE, GRID_SIZE]}
        cellSize={1}
        cellThickness={0.5}
        cellColor="#4a4a5e"
        sectionSize={5}
        sectionThickness={1.2}
        sectionColor="#6a6a86"
        fadeDistance={28}
        fadeStrength={1}
        followCamera={false}
        infiniteGrid={false}
      />
      <DistanceMarkers extent={GRID_SIZE / 2} />

      {/* World axis vectors at origin */}
      <AxisVectors />

      {/* Proxies */}
      {proxies.map((p) => (
        <group
          key={p.id}
          ref={(el) => {
            if (el) refMap.current.set(p.id, el);
            else refMap.current.delete(p.id);
          }}
          position={p.position}
          rotation={p.rotation}
          scale={p.scale}
        >
          <ProxyMesh proxy={p} selected={selectedProxyId === p.id} onSelect={selectProxy} interactive />
        </group>
      ))}

      {/* In Perspective mode: show the camera marker, gizmos, and trajectory.
          In Camera mode: hide them (we ARE the camera — clean first-person view). */}
      {viewMode === "perspective" && (
        <>
          {/* Draggable shot camera marker */}
          <CameraMarker cameraRef={cameraRef} />

          {/* Gizmo for the selected proxy */}
          {selectedProxyRef && !cameraSelected && (
            <TransformControls object={selectedProxyRef} mode={gizmoMode} onObjectChange={handleProxyGizmoChange} />
          )}

          {/* Gizmo for the selected camera — hidden during playback so it
              doesn't fight the trajectory animation. */}
          {cameraSelected && cameraRef.current && !isPlaying && (
            <TransformControls
              object={cameraRef.current}
              mode={gizmoMode === "scale" ? "translate" : gizmoMode}
              onObjectChange={handleCameraGizmoChange}
              onPointerMissed={() => selectCamera(false)}
            />
          )}

          {/* Trajectory + FOV frustum overlay */}
          <TrajectoryVisual cameraRef={cameraRef} />
        </>
      )}

      {/* Camera mode: fly controller replaces OrbitControls + gizmos */}
      {viewMode === "camera" && <CameraFlyController />}

      {/* Proxy animation — interpolates proxy transforms from keyframes each frame.
          Skips the currently-selected proxy so the gizmo has full control. */}
      <ProxyAnimator refMap={refMap} />

      {/* OrbitControls only in perspective mode */}
      {viewMode === "perspective" && (
        <OrbitControls makeDefault enablePan minDistance={3} maxDistance={30} maxPolarAngle={Math.PI / 2.05} />
      )}
    </>
  );
}

/**
 * Unreal-style fly controller for Camera viewport mode.
 *
 * - Hold RMB + drag: look around (orbit the look-at target around the camera)
 * - Hold RMB + W/A/S/D: move forward/back/strafe
 * - Hold RMB + Q/E: move down/up
 * - Mouse wheel: dolly forward/back
 * - K: drop a keyframe at the current frame
 *
 * The editor camera is positioned at the sampled trajectory point each frame
 * (mirroring ViewfinderCamera). WASD/look updates write the current frame's
 * keyframe in real-time, so the user is "driving" the camera keyframe directly.
 */
function CameraFlyController() {
  const { camera, gl } = useThree();
  const keyframes = usePrevisStore((s) => s.keyframes);
  const durationFrames = usePrevisStore((s) => s.durationFrames);
  const currentFrame = usePrevisStore((s) => s.currentFrame);
  const focalLength = usePrevisStore((s) => s.focalLength);
  const aspectRatio = usePrevisStore((s) => s.aspectRatio);

  // Refs for input state (avoid re-renders on every mouse move)
  const rmbHeld = useRef(false);
  const keysDown = useRef<Set<string>>(new Set());
  const lookYaw = useRef(0);   // accumulated yaw (radians)
  const lookPitch = useRef(0); // accumulated pitch (radians, clamped)
  const lastMouse = useRef<{ x: number; y: number } | null>(null);
  // Live camera position — mutated by WASD each frame, synced to the keyframe
  const livePos = useRef<THREE.Vector3 | null>(null);
  const liveTarget = useRef<THREE.Vector3 | null>(null);

  // Initialize yaw/pitch from the current keyframe's look direction on mount
  // and whenever the current frame changes significantly.
  useEffect(() => {
    const t = durationFrames > 0 ? currentFrame / durationFrames : 0;
    const { position, target } = sampleTrajectory(
      usePrevisStore.getState().keyframes,
      t,
    );
    livePos.current = position.clone();
    liveTarget.current = target.clone();
    // Derive yaw/pitch from the look direction
    const dir = new THREE.Vector3().subVectors(target, position);
    lookYaw.current = Math.atan2(dir.x, dir.z);
    lookPitch.current = Math.asin(THREE.MathUtils.clamp(dir.y / Math.max(0.001, dir.length()), -1, 1));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // --- Input listeners on the gl canvas ---
  useEffect(() => {
    const dom = gl.domElement;

    const onMouseDown = (e: MouseEvent) => {
      if (e.button === 2) { // right mouse button
        rmbHeld.current = true;
        lastMouse.current = { x: e.clientX, y: e.clientY };
        dom.style.cursor = "grabbing";
      }
    };
    const onMouseUp = (e: MouseEvent) => {
      if (e.button === 2) {
        rmbHeld.current = false;
        lastMouse.current = null;
        dom.style.cursor = "default";
      }
    };
    const onMouseMove = (e: MouseEvent) => {
      if (!rmbHeld.current || !lastMouse.current) return;
      const dx = e.clientX - lastMouse.current.x;
      const dy = e.clientY - lastMouse.current.y;
      lastMouse.current = { x: e.clientX, y: e.clientY };
      // Look sensitivity
      const sens = 0.0035;
      lookYaw.current -= dx * sens;
      lookPitch.current = THREE.MathUtils.clamp(
        lookPitch.current - dy * sens,
        -Math.PI / 2 + 0.05,
        Math.PI / 2 - 0.05,
      );
    };
    const onWheel = (e: WheelEvent) => {
      if (!livePos.current || !liveTarget.current) return;
      e.preventDefault();
      // Dolly along the look direction
      const forward = new THREE.Vector3().subVectors(liveTarget.current, livePos.current).normalize();
      const step = e.deltaY > 0 ? -0.5 : 0.5;
      livePos.current.addScaledVector(forward, step);
      liveTarget.current.addScaledVector(forward, step);
    };
    const onContext = (e: Event) => e.preventDefault(); // suppress context menu on RMB

    const onKeyDown = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      keysDown.current.add(k);
      // K = drop keyframe at current frame
      if (k === "k" && livePos.current && liveTarget.current) {
        const frame = Math.round(usePrevisStore.getState().currentFrame);
        usePrevisStore.getState().addKeyframeAtFrame(
          frame,
          [livePos.current.x, livePos.current.y, livePos.current.z],
          [liveTarget.current.x, liveTarget.current.y, liveTarget.current.z],
        );
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      keysDown.current.delete(e.key.toLowerCase());
    };

    dom.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mouseup", onMouseUp);
    window.addEventListener("mousemove", onMouseMove);
    dom.addEventListener("wheel", onWheel, { passive: false });
    dom.addEventListener("contextmenu", onContext);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    return () => {
      dom.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mouseup", onMouseUp);
      window.removeEventListener("mousemove", onMouseMove);
      dom.removeEventListener("wheel", onWheel);
      dom.removeEventListener("contextmenu", onContext);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [gl]);

  // --- Per-frame: apply WASD movement + update camera + sync keyframe ---
  useFrame((_, dt) => {
    if (!(camera instanceof THREE.PerspectiveCamera)) return;
    if (!livePos.current || !liveTarget.current) return;

    // If not playing, allow WASD to move the camera.
    // If playing, the trajectory sampling overrides (see below).
    const isPlaying = usePrevisStore.getState().isPlaying;

    if (!isPlaying) {
      // Build forward/right vectors from the current look yaw (horizontal plane)
      const forward = new THREE.Vector3(
        Math.sin(lookYaw.current),
        0,
        Math.cos(lookYaw.current),
      );
      const right = new THREE.Vector3(
        Math.sin(lookYaw.current + Math.PI / 2),
        0,
        Math.cos(lookYaw.current + Math.PI / 2),
      );

      // Movement speed (units per second)
      const speed = 3.0 * dt;
      const k = keysDown.current;
      if (k.has("w")) livePos.current.addScaledVector(forward, speed);
      if (k.has("s")) livePos.current.addScaledVector(forward, -speed);
      if (k.has("a")) livePos.current.addScaledVector(right, -speed);
      if (k.has("d")) livePos.current.addScaledVector(right, speed);
      if (k.has("q")) livePos.current.y -= speed;
      if (k.has("e")) livePos.current.y += speed;

      // Compute the look-at target from yaw/pitch at a fixed distance
      const dist = livePos.current.distanceTo(liveTarget.current) || 5;
      const dir = new THREE.Vector3(
        Math.sin(lookYaw.current) * Math.cos(lookPitch.current),
        Math.sin(lookPitch.current),
        Math.cos(lookYaw.current) * Math.cos(lookPitch.current),
      );
      liveTarget.current.copy(livePos.current).addScaledVector(dir, dist);

      // Write the current keyframe in real-time so the trajectory updates
      const frame = Math.round(usePrevisStore.getState().currentFrame);
      usePrevisStore.getState().addKeyframeAtFrame(
        frame,
        [livePos.current.x, livePos.current.y, livePos.current.z],
        [liveTarget.current.x, liveTarget.current.y, liveTarget.current.z],
      );
    } else {
      // Playing — sample the trajectory (don't allow manual override during playback)
      const t = durationFrames > 0 ? currentFrame / durationFrames : 0;
      const { position, target } = sampleTrajectory(
        usePrevisStore.getState().keyframes,
        t,
      );
      livePos.current.copy(position);
      liveTarget.current.copy(target);
      // Sync yaw/pitch from the sampled look direction
      const dir = new THREE.Vector3().subVectors(target, position);
      lookYaw.current = Math.atan2(dir.x, dir.z);
      lookPitch.current = Math.asin(THREE.MathUtils.clamp(dir.y / Math.max(0.001, dir.length()), -1, 1));
    }

    // Apply to the actual editor camera
    camera.position.copy(livePos.current);
    camera.lookAt(liveTarget.current);
    camera.fov = focalToFov(focalLength);

    // Letterbox the WebGL viewport to the target aspect ratio so the render
    // matches the camera's framing (no stretching). The areas outside the
    // letterbox are covered by CSS bars in PrevisStage.
    const targetAspect = aspectRatio === "16:9" ? 16 / 9 : 2.39 / 1;
    const canvas = gl.domElement;
    const bufW = canvas.width;
    const bufH = canvas.height;
    const canvasAspect = bufW / bufH;

    let vpW: number, vpH: number, vpX: number, vpY: number;
    if (canvasAspect > targetAspect) {
      // Canvas wider than target — pillarbox (bars on left/right)
      vpH = bufH;
      vpW = Math.round(vpH * targetAspect);
      vpX = Math.round((bufW - vpW) / 2);
      vpY = 0;
    } else {
      // Canvas taller than target — letterbox (bars on top/bottom)
      vpW = bufW;
      vpH = Math.round(vpW / targetAspect);
      vpX = 0;
      vpY = Math.round((bufH - vpH) / 2);
    }

    gl.setViewport(vpX, vpY, vpW, vpH);
    gl.setScissor(vpX, vpY, vpW, vpH);
    gl.setScissorTest(true);
    camera.aspect = targetAspect;
    camera.updateProjectionMatrix();
  });

  // Restore full viewport when unmounting (switching back to Perspective mode)
  useEffect(() => {
    return () => {
      gl.setScissorTest(false);
      const canvas = gl.domElement;
      gl.setViewport(0, 0, canvas.width, canvas.height);
    };
  }, [gl]);

  return null;
}

/**
 * Reads proxy keyframes from the store and applies interpolated transforms to
 * proxy groups every frame. The selected proxy is skipped (gizmo controls it).
 */
function ProxyAnimator({ refMap }: { refMap: React.MutableRefObject<Map<string, THREE.Group>> }) {
  useFrame(() => {
    const s = usePrevisStore.getState();
    const frame = s.currentFrame;
    const selectedId = s.selectedProxyId;

    for (const [id, group] of refMap.current) {
      // Skip the selected proxy — the gizmo is controlling it.
      if (id === selectedId) continue;
      const track = s.proxyKeyframes[id];
      if (!track || track.length === 0) continue;
      const { position, rotation, scale } = sampleProxyTransform(track, frame);
      group.position.set(...position);
      group.rotation.set(...rotation);
      group.scale.set(...scale);
    }
  });
  return null;
}

function DistanceMarkers({ extent }: { extent: number }) {
  const marks: { pos: [number, number, number]; label: string }[] = [];
  for (let i = -extent; i <= extent; i += 5) {
    if (i !== 0) {
      marks.push({ pos: [i, 0.02, -extent], label: `${i}m` });
      marks.push({ pos: [-extent, 0.02, i], label: `${i}` });
    }
  }
  return (
    <group>
      {marks.map((m, i) => (
        <Html key={i} position={m.pos} center>
          <div className="text-[8px] text-studio-muted/50 select-none pointer-events-none whitespace-nowrap">
            {m.label}
          </div>
        </Html>
      ))}
    </group>
  );
}

function AxisVectors() {
  return (
    <group position={[0, 0.02, 0]}>
      {/* X (red) */}
      <mesh position={[0.5, 0, 0]} rotation={[0, 0, -Math.PI / 2]}>
        <cylinderGeometry args={[0.01, 0.01, 1, 6]} />
        <meshBasicMaterial color="#ef4444" />
      </mesh>
      {/* Z (blue) */}
      <mesh position={[0, 0, 0.5]}>
        <cylinderGeometry args={[0.01, 0.01, 1, 6]} />
        <meshBasicMaterial color="#3b82f6" />
      </mesh>
      {/* Y (green) */}
      <mesh position={[0, 0.5, 0]}>
        <cylinderGeometry args={[0.01, 0.01, 1, 6]} />
        <meshBasicMaterial color="#22c55e" />
      </mesh>
    </group>
  );
}
