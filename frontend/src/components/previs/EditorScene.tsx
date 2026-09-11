"use client";

import { useRef, useEffect, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Grid, OrbitControls, OrthographicCamera, TransformControls } from "@react-three/drei";
import * as THREE from "three";
import { usePrevisStore, aspectRatioValue } from "@/lib/usePrevisStore";
import { ProxyMesh } from "./ProxyMesh";
import { TrajectoryVisual, CameraMarker } from "./TrajectoryVisual";
import { SceneLabel } from "./SceneLabel";
import { sampleTrajectory, sampleProxyTransform, sampleChannel1D, focalToFov } from "@/lib/previsTrajectory";

const GRID_SIZE = 60;

const WORLD_UP = new THREE.Vector3(0, 1, 0);

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
  const snapEnabled = usePrevisStore((s) => s.snapEnabled);
  const pushHistory = usePrevisStore((s) => s.pushHistory);

  const refMap = useRef(new Map<string, THREE.Group>());
  const cameraRef = useRef<THREE.Group>(null);

  // True while a gizmo drag is actively in progress. The ProxyAnimator and
  // camera sampler skip the dragged object during a drag so the gizmo stays
  // in control — but once the drag ends, animation sampling resumes so the
  // object follows its keyframes when the timeline scrubs.
  const draggingRef = useRef(false);

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
  //   current distance (pan/tilt). Any twist around the view axis is the
  //   roll (dutch angle) — decomposed against the zero-roll lookAt
  //   orientation and keyed on the roll channel. The timeline Roll°
  //   sub-track is the precise-numeric companion to this gizmo.
  const handleCameraGizmoChange = () => {
    if (!cameraRef.current) return;
    const frame = Math.round(currentFrame);
    const t = durationFrames > 0 ? currentFrame / durationFrames : 0;
    // Always read fresh keyframes from the store (subscribed value can lag).
    const { position: sampledPos, target: sampledTarget } = sampleTrajectory(
      usePrevisStore.getState().cameraChannels,
      t,
      durationFrames,
    );
    const newPos = cameraRef.current.position;
    const store = usePrevisStore.getState();

    if (gizmoMode === "translate") {
      // Delta from the previous tick (or from the sampled position on first tick).
      const prev = prevCamPos.current ?? sampledPos;
      const delta = new THREE.Vector3().subVectors(newPos, prev);
      // Move the target by the same delta → camera keeps looking the same way.
      const newTarget = sampledTarget.clone().add(delta);
      // Only key the 3 position channels (translate doesn't change look direction).
      store.addChannelKeyframe("posX", frame, newPos.x);
      store.addChannelKeyframe("posY", frame, newPos.y);
      store.addChannelKeyframe("posZ", frame, newPos.z);
      // Also move the target by the same delta so the view stays consistent,
      // but only if there isn't already a target key at this frame (don't
      // clobber an intentional pan key the user set at the same frame).
      const hasTargetKey =
        store.cameraChannels.targetX.some((k) => k.frame === frame) ||
        store.cameraChannels.targetY.some((k) => k.frame === frame) ||
        store.cameraChannels.targetZ.some((k) => k.frame === frame);
      if (!hasTargetKey) {
        store.addChannelKeyframe("targetX", frame, newTarget.x);
        store.addChannelKeyframe("targetY", frame, newTarget.y);
        store.addChannelKeyframe("targetZ", frame, newTarget.z);
      }
    } else if (gizmoMode === "rotate") {
      // The gizmo rotated the group — read forward direction from the quaternion.
      // Object3D.lookAt points +Z toward the target, so forward = +Z.
      const quat = cameraRef.current.quaternion;
      const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(quat).normalize();
      const dist = sampledPos.distanceTo(sampledTarget) || 5;
      const newTarget = new THREE.Vector3(
        newPos.x + forward.x * dist,
        newPos.y + forward.y * dist,
        newPos.z + forward.z * dist,
      );
      // Key the 3 target channels (pan/tilt).
      store.addChannelKeyframe("targetX", frame, newTarget.x);
      store.addChannelKeyframe("targetY", frame, newTarget.y);
      store.addChannelKeyframe("targetZ", frame, newTarget.z);

      // Roll (dutch angle): build the zero-roll orientation for this forward
      // exactly like Object3D.lookAt does (x = up×z, y = z×x, z = forward),
      // then the leftover twist of the gizmo rotation is a pure rotation
      // about the view axis — the roll. This matches how the sampler applies
      // it (lookAt + rotateZ(roll)), so gizmo ⇄ timeline round-trip exactly.
      const xAxis = new THREE.Vector3().crossVectors(WORLD_UP, forward);
      if (xAxis.lengthSq() > 1e-6) {
        xAxis.normalize();
        const yAxis = new THREE.Vector3().crossVectors(forward, xAxis);
        const qLook = new THREE.Quaternion().setFromRotationMatrix(
          new THREE.Matrix4().makeBasis(xAxis, yAxis, forward),
        );
        const twist = qLook.clone().invert().multiply(quat);
        const rollDeg = THREE.MathUtils.radToDeg(2 * Math.atan2(twist.z, twist.w));
        store.addChannelKeyframe("roll", frame, rollDeg);
      }

      // Also key the position at the current spot if there isn't already a
      // position key at this frame — otherwise playback would sample empty
      // position channels to 0 and the camera would jump to the origin.
      const hasPosKey =
        store.cameraChannels.posX.some((k) => k.frame === frame) ||
        store.cameraChannels.posY.some((k) => k.frame === frame) ||
        store.cameraChannels.posZ.some((k) => k.frame === frame);
      if (!hasPosKey) {
        store.addChannelKeyframe("posX", frame, newPos.x);
        store.addChannelKeyframe("posY", frame, newPos.y);
        store.addChannelKeyframe("posZ", frame, newPos.z);
      }
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
        fadeDistance={80}
        fadeStrength={1}
        followCamera={false}
        infiniteGrid={false}
      />
      <DistanceMarkers extent={GRID_SIZE / 2} />

      {/* World axis vectors at origin */}
      <AxisVectors />

      {/* Proxies — the transform group (refMap/gizmo target) is wrapped in an
          unscaled outer group so plan-view labels aren't distorted by proxy scale. */}
      {proxies.map((p) => (
        <group key={p.id}>
          <group
            ref={(el) => {
              if (el) refMap.current.set(p.id, el);
              else refMap.current.delete(p.id);
            }}
            position={p.position}
            rotation={p.rotation}
            scale={p.scale}
          >
            <ProxyMesh proxy={p} selected={selectedProxyId === p.id} onSelect={selectProxy} interactive={viewMode !== "camera"} />
          </group>
          {viewMode === "plan" && (
            <SceneLabel text={p.label} position={[p.position[0], 1.2, p.position[2]]} color={p.color} height={0.45} bold />
          )}
        </group>
      ))}

      {/* In Perspective + Plan modes: show the camera marker + trajectory.
          In Camera mode: hide them (we ARE the camera — clean first-person view). */}
      {viewMode !== "camera" && (
        <>
          {/* Draggable shot camera marker */}
          <CameraMarker cameraRef={cameraRef} />

          {/* Gizmo for the selected proxy — perspective mode only, snaps to
              the grid when snapping is enabled, pushes one undo entry per drag. */}
          {viewMode === "perspective" && selectedProxyRef && !cameraSelected && (
            <TransformControls
              object={selectedProxyRef}
              mode={gizmoMode}
              onObjectChange={handleProxyGizmoChange}
              onMouseDown={() => { draggingRef.current = true; pushHistory(); }}
              onMouseUp={() => { draggingRef.current = false; }}
              translationSnap={snapEnabled ? 0.5 : null}
              rotationSnap={snapEnabled ? THREE.MathUtils.degToRad(15) : null}
            />
          )}

          {/* Gizmo for the selected camera — hidden during playback so it
              doesn't fight the trajectory animation. Local space so the rotate
              rings map to pan / tilt / roll (roll = the ring around the lens). */}
          {viewMode === "perspective" && cameraSelected && cameraRef.current && !isPlaying && (
            <TransformControls
              object={cameraRef.current}
              mode={gizmoMode === "scale" ? "translate" : gizmoMode}
              space={gizmoMode === "rotate" ? "local" : "world"}
              onObjectChange={handleCameraGizmoChange}
              onMouseDown={() => pushHistory()}
              onPointerMissed={() => selectCamera(false)}
              translationSnap={snapEnabled ? 0.5 : null}
              rotationSnap={snapEnabled ? THREE.MathUtils.degToRad(15) : null}
            />
          )}

          {/* Trajectory + FOV frustum overlay */}
          <TrajectoryVisual cameraRef={cameraRef} />
        </>
      )}

      {/* Camera mode: fly controller replaces OrbitControls + gizmos */}
      {viewMode === "camera" && <CameraFlyController />}

      {/* Plan mode: top-down orthographic floor-plan view */}
      {viewMode === "plan" && (
        <OrthographicCamera makeDefault position={[0, 30, 0]} rotation={[-Math.PI / 2, 0, 0]} zoom={45} near={0.1} far={100} />
      )}

      {/* Proxy animation — interpolates proxy transforms from keyframes each frame.
          Skips the currently-selected proxy so the gizmo has full control. */}
      <ProxyAnimator refMap={refMap} draggingRef={draggingRef} />

      {/* F-key frame-selected (UE5): listens for the hotkey event and moves
          the orbit camera + target to frame the selected proxy or the camera
          marker. Only active in perspective mode. */}
      {viewMode === "perspective" && <FrameSelected refMap={refMap} cameraRef={cameraRef} />}

      {/* Viewport navigation per mode: free orbit (perspective), pan/zoom only (plan) */}
      {viewMode === "perspective" && (
        <>
          <OrbitControls
            makeDefault
            enablePan
            minDistance={1}
            maxDistance={500}
            maxPolarAngle={Math.PI / 2.05}
            mouseButtons={{
              LEFT: THREE.MOUSE.ROTATE,
              MIDDLE: THREE.MOUSE.PAN,
              RIGHT: null as unknown as THREE.MOUSE,
            }}
          />
          <PerspectiveWASD />
        </>
      )}
      {viewMode === "plan" && (
        <OrbitControls makeDefault enableRotate={false} enablePan minZoom={10} maxZoom={200} screenSpacePanning />
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
      usePrevisStore.getState().cameraChannels,
      t,
      durationFrames,
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
      const wasDown = keysDown.current.has(k);
      keysDown.current.add(k);
      const s = usePrevisStore.getState();
      // K = drop keyframe at current frame
      if (k === "k" && livePos.current && liveTarget.current) {
        const frame = Math.round(s.currentFrame);
        s.pushHistory();
        s.addKeyframeAtFrame(
          frame,
          [livePos.current.x, livePos.current.y, livePos.current.z],
          [liveTarget.current.x, liveTarget.current.y, liveTarget.current.z],
        );
      }
      // First movement key of a gesture = one undo entry for the whole drive.
      if (!wasDown && ["w", "a", "s", "d", "q", "e"].includes(k) && rmbHeld.current) {
        s.pushHistory();
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
        usePrevisStore.getState().cameraChannels,
        t,
        durationFrames,
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
    // Roll (dutch angle) + animated focal come from the keyframe channels.
    const s = usePrevisStore.getState();
    const frameNow = Math.round(s.currentFrame);
    const rollNow = sampleChannel1D(s.cameraChannels.roll, frameNow);
    camera.rotateZ(THREE.MathUtils.degToRad(rollNow));
    const focalNow = s.cameraChannels.focal.length > 0 ? sampleChannel1D(s.cameraChannels.focal, frameNow) : null;
    camera.fov = focalToFov(focalNow ?? focalLength);

    // Letterbox the WebGL viewport to the target aspect ratio so the render
    // matches the camera's framing (no stretching). The areas outside the
    // letterbox are covered by CSS bars in PrevisStage.
    const targetAspect = aspectRatioValue(aspectRatio);
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
 * Unreal Engine 5-style perspective viewport navigation.
 *
 *   LMB-drag  = orbit around pivot (handled by OrbitControls)
 *   RMB-drag  = free-look (rotate camera in place; OrbitControls disabled)
 *   RMB+WASD  = fly along view direction (including pitch)
 *   RMB+Q/E   = world up/down
 *   Wheel     = dolly toward pivot (OrbitControls)
 *
 * WASD/QE only respond while RMB is held, matching UE5. Forward uses the
 * camera's actual look direction (with pitch), not a flattened horizon vector.
 */
function PerspectiveWASD() {
  const { camera, gl, controls } = useThree();
  const keys = useRef(new Set<string>());
  const rmb = useRef(false);
  const lastMouse = useRef<{ x: number; y: number } | null>(null);
  // Yaw/pitch for free-look, derived from camera orientation each RMB press.
  const yaw = useRef(0);
  const pitch = useRef(0);

  useEffect(() => {
    const dom = gl.domElement;

    const isTyping = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      return t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (isTyping(e)) return;
      keys.current.add(e.key.toLowerCase());
    };
    const onKeyUp = (e: KeyboardEvent) => {
      keys.current.delete(e.key.toLowerCase());
    };

    const onMouseDown = (e: MouseEvent) => {
      if (e.button !== 2) return; // RMB only
      rmb.current = true;
      lastMouse.current = { x: e.clientX, y: e.clientY };
      // Seed yaw/pitch from current camera orientation
      const dir = new THREE.Vector3();
      camera.getWorldDirection(dir);
      yaw.current = Math.atan2(dir.x, dir.z);
      pitch.current = Math.asin(THREE.MathUtils.clamp(dir.y, -1, 1));
      // Disable OrbitControls so RMB-drag free-looks instead of orbiting
      if (controls && "enabled" in controls) (controls as { enabled: boolean }).enabled = false;
      dom.style.cursor = "grabbing";
    };
    const onMouseUp = (e: MouseEvent) => {
      if (e.button !== 2) return;
      rmb.current = false;
      lastMouse.current = null;
      if (controls && "enabled" in controls) (controls as { enabled: boolean }).enabled = true;
      dom.style.cursor = "default";
    };
    const onMouseMove = (e: MouseEvent) => {
      if (!rmb.current || !lastMouse.current) return;
      const dx = e.clientX - lastMouse.current.x;
      const dy = e.clientY - lastMouse.current.y;
      lastMouse.current = { x: e.clientX, y: e.clientY };
      const sens = 0.0035;
      yaw.current -= dx * sens;
      pitch.current = THREE.MathUtils.clamp(
        pitch.current - dy * sens,
        -Math.PI / 2 + 0.05,
        Math.PI / 2 - 0.05,
      );
    };
    const onContext = (e: Event) => e.preventDefault();

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    dom.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mouseup", onMouseUp);
    window.addEventListener("mousemove", onMouseMove);
    dom.addEventListener("contextmenu", onContext);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      dom.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mouseup", onMouseUp);
      window.removeEventListener("mousemove", onMouseMove);
      dom.removeEventListener("contextmenu", onContext);
    };
  }, [gl, camera, controls]);

  useFrame((_, dt) => {
    if (!(camera instanceof THREE.PerspectiveCamera)) return;

    // --- Free-look: apply yaw/pitch to camera orientation while RMB held ---
    if (rmb.current) {
      const dir = new THREE.Vector3(
        Math.sin(yaw.current) * Math.cos(pitch.current),
        Math.sin(pitch.current),
        Math.cos(yaw.current) * Math.cos(pitch.current),
      );
      const target = camera.position.clone().add(dir);
      camera.lookAt(target);
    }

    // --- WASD/QE movement (only while RMB held, UE5-style) ---
    const k = keys.current;
    if (!rmb.current) return;
    if (!k.has("w") && !k.has("a") && !k.has("s") && !k.has("d") && !k.has("q") && !k.has("e")) return;

    // Forward = actual view direction (with pitch), like UE5
    const forward = new THREE.Vector3();
    camera.getWorldDirection(forward);
    const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();

    // Shift = 3× speed boost (UE5 convention)
    const speed = (k.has("shift") ? 24.0 : 8.0) * dt;
    const move = new THREE.Vector3();
    if (k.has("w")) move.addScaledVector(forward, speed);
    if (k.has("s")) move.addScaledVector(forward, -speed);
    if (k.has("a")) move.addScaledVector(right, -speed);
    if (k.has("d")) move.addScaledVector(right, speed);
    if (k.has("e")) move.y += speed;
    if (k.has("q")) move.y -= speed;

    camera.position.add(move);
    // Move the orbit target with the camera so LMB-orbit stays centered
    const orbitTarget = (controls as unknown as { target?: THREE.Vector3 } | null)?.target;
    if (orbitTarget) orbitTarget.add(move);
  });

  return null;
}

/**
 * F-key frame-selected (UE5 "Focus"). Listens for the `previs-frame-selected`
 * window event (dispatched by the PrevisStage hotkey handler) and moves the
 * orbit camera + target to frame the selected proxy or the shot camera.
 */
function FrameSelected({
  refMap,
  cameraRef,
}: {
  refMap: React.MutableRefObject<Map<string, THREE.Group>>;
  cameraRef: React.RefObject<THREE.Group>;
}) {
  const { camera, controls } = useThree();

  useEffect(() => {
    const onFrame = () => {
      const s = usePrevisStore.getState();
      let targetPos: THREE.Vector3 | null = null;

      if (s.selectedProxyId) {
        const obj = refMap.current.get(s.selectedProxyId);
        if (obj) targetPos = obj.position.clone();
      } else if (s.cameraSelected && cameraRef.current) {
        targetPos = cameraRef.current.position.clone();
      }

      if (!targetPos) return;
      const orbitTarget = (controls as unknown as { target?: THREE.Vector3 } | null)?.target;
      if (orbitTarget) orbitTarget.copy(targetPos);

      // Place the camera at a comfortable viewing distance along the current
      // view direction, preserving the user's orbit angle.
      if (camera instanceof THREE.PerspectiveCamera) {
        const dir = new THREE.Vector3();
        camera.getWorldDirection(dir);
        const dist = 6;
        camera.position.copy(targetPos).addScaledVector(dir, -dist);
      }
    };
    window.addEventListener("previs-frame-selected", onFrame);
    return () => window.removeEventListener("previs-frame-selected", onFrame);
  }, [camera, controls, refMap, cameraRef]);

  return null;
}

/**
 * Reads proxy keyframes from the store and applies interpolated transforms to
 * proxy groups every frame. The selected proxy is skipped (gizmo controls it).
 */
function ProxyAnimator({ refMap, draggingRef }: { refMap: React.MutableRefObject<Map<string, THREE.Group>>; draggingRef: React.MutableRefObject<boolean> }) {
  useFrame(() => {
    const s = usePrevisStore.getState();
    const frame = s.currentFrame;
    const selectedId = s.selectedProxyId;

    for (const [id, group] of refMap.current) {
      // Skip the selected proxy only while a gizmo drag is active —
      // otherwise the gizmo and the sampler fight over its transform.
      if (id === selectedId && draggingRef.current) continue;
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
        <SceneLabel key={i} text={m.label} position={m.pos} color="#64748b" height={0.3} />
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
      <mesh position={[0, 0, 0.5]} rotation={[Math.PI / 2, 0, 0]}>
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
