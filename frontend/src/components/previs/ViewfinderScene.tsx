"use client";

import { useEffect, useRef, useMemo } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { usePrevisStore } from "@/lib/usePrevisStore";
import { focalToFov, sampleTrajectory, sampleProxyTransform } from "@/lib/previsTrajectory";
import { ProxyMesh } from "./ProxyMesh";

/**
 * The through-the-lens viewfinder scene.
 *
 * Renders the stage from the animated shot camera's perspective (driven by the
 * current frame + focal length + aspect ratio). This canvas is also the capture
 * source for the offscreen previs recording (Phase 4).
 */
export function ViewfinderScene() {
  return (
    <>
      <ambientLight intensity={0.6} />
      <directionalLight position={[6, 8, 4]} intensity={0.7} />
      <directionalLight position={[-4, 3, -5]} intensity={0.25} color="#60a5fa" />

      {/* Ground reference inside the viewfinder */}
      <gridHelper args={[20, 20, "#1e1e2e", "#16161f"]} />

      <ViewfinderCamera />
      <ViewfinderProxies />
      <DepthPassController />
    </>
  );
}

function ViewfinderProxies() {
  const proxies = usePrevisStore((s) => s.proxies);
  const proxyKeyframes = usePrevisStore((s) => s.proxyKeyframes);
  const currentFrame = usePrevisStore((s) => s.currentFrame);
  const refMap = useRef(new Map<string, THREE.Group>());

  useFrame(() => {
    const frame = usePrevisStore.getState().currentFrame;
    for (const [id, group] of refMap.current) {
      const track = usePrevisStore.getState().proxyKeyframes[id];
      if (!track || track.length === 0) continue;
      const { position, rotation, scale } = sampleProxyTransform(track, frame);
      group.position.set(...position);
      group.rotation.set(...rotation);
      group.scale.set(...scale);
    }
  });

  return (
    <>
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
          <ProxyMesh proxy={p} interactive={false} />
        </group>
      ))}
    </>
  );
}

function ViewfinderCamera() {
  const { camera } = useThree();
  const cameraChannels = usePrevisStore((s) => s.cameraChannels);
  const durationFrames = usePrevisStore((s) => s.durationFrames);
  const currentFrame = usePrevisStore((s) => s.currentFrame);
  const focalLength = usePrevisStore((s) => s.focalLength);
  const aspectRatio = usePrevisStore((s) => s.aspectRatio);

  const aspect = aspectRatio === "16:9" ? 16 / 9 : 2.39 / 1;

  // Tighten near/far to the scene scale for accurate depth buffer precision.
  useEffect(() => {
    if (camera instanceof THREE.PerspectiveCamera) {
      camera.near = 0.1;
      camera.far = 50;
      camera.updateProjectionMatrix();
    }
  }, [camera]);

  useFrame(() => {
    if (!(camera instanceof THREE.PerspectiveCamera)) return;
    const t = durationFrames > 0 ? currentFrame / durationFrames : 0;
    const { position, target } = sampleTrajectory(cameraChannels, t, durationFrames);
    camera.position.copy(position);
    camera.lookAt(target);
    camera.fov = focalToFov(focalLength);
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
  });

  return null;
}

/**
 * Applies (and restores) a linear depth override material across the whole
 * viewfinder scene when depth pass mode is enabled.
 *
 * Unlike THREE.MeshDepthMaterial (which uses the non-linear depth buffer and
 * renders distant objects as pure black), this custom shader maps view-space
 * distance LINEARLY across [0, depthRange]. White = at the camera, black = at
 * depthRange. The user controls depthRange so the gradient covers the scene.
 */
function DepthPassController() {
  const depthMode = usePrevisStore((s) => s.depthMode);
  const depthRange = usePrevisStore((s) => s.depthRange);
  const { scene } = useThree();

  // Build a linear depth shader material once.
  const depthMat = useRef<THREE.ShaderMaterial | null>(null);
  useEffect(() => {
    if (!depthMat.current) {
      depthMat.current = new THREE.ShaderMaterial({
        uniforms: {
          uNear: { value: 0.0 },
          uFar: { value: 15.0 },
        },
        vertexShader: /* glsl */ `
          varying float vViewDist;
          void main() {
            vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
            // View-space distance from the camera (positive)
            vViewDist = -mvPosition.z;
            gl_Position = projectionMatrix * mvPosition;
          }
        `,
        fragmentShader: /* glsl */ `
          uniform float uNear;
          uniform float uFar;
          varying float vViewDist;
          void main() {
            // Linear depth: 0 at uNear (white), 1 at uFar (black)
            float d = clamp((vViewDist - uNear) / max(0.001, uFar - uNear), 0.0, 1.0);
            float c = 1.0 - d;
            gl_FragColor = vec4(vec3(c), 1.0);
          }
        `,
      });
    }
  }, []);

  // Update the far uniform when depthRange changes.
  useEffect(() => {
    if (depthMat.current) {
      depthMat.current.uniforms.uFar.value = depthRange;
    }
  }, [depthRange]);

  useEffect(() => {
    scene.overrideMaterial = depthMode && depthMat.current ? depthMat.current : null;
    return () => {
      scene.overrideMaterial = null;
    };
  }, [depthMode, scene]);

  return null;
}
