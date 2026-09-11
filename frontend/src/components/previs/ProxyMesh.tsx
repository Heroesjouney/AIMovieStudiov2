"use client";

import { useRef } from "react";
import * as THREE from "three";
import type { ProxyObject, ProxyKind } from "@/lib/usePrevisStore";

interface ProxyMeshProps {
  proxy: ProxyObject;
  selected?: boolean;
  onSelect?: (id: string) => void;
  /** When false (viewfinder), meshes render non-interactive. */
  interactive?: boolean;
}

/**
 * Renders a single previs proxy.
 *  - character: capsule body + head + forward target-vector arrow
 *  - set: scalable bounding box
 *
 * Shared by the editor scene (interactive, selectable) and the through-the-lens
 * viewfinder (non-interactive).
 */
export function ProxyMesh({ proxy, selected, onSelect, interactive = true }: ProxyMeshProps) {
  const groupRef = useRef<THREE.Group>(null);

  const emissive = selected ? proxy.color : "#000000";
  const emissiveIntensity = selected ? 0.35 : 0;

  return (
    <group
      ref={groupRef}
      onClick={
        interactive
          ? (e) => {
              e.stopPropagation();
              onSelect?.(proxy.id);
            }
          : undefined
      }
      onPointerOver={
        interactive
          ? (e) => {
              e.stopPropagation();
              if (groupRef.current) groupRef.current.userData.hover = true;
            }
          : undefined
      }
    >
      {proxy.kind === "character" ? (
        <CharacterMesh color={proxy.color} emissive={emissive} emissiveIntensity={emissiveIntensity} selected={selected} />
      ) : proxy.kind === "set" ? (
        <SetMesh color={proxy.color} emissive={emissive} emissiveIntensity={emissiveIntensity} selected={selected} />
      ) : (
        <PrimitiveMesh kind={proxy.kind} color={proxy.color} emissive={emissive} emissiveIntensity={emissiveIntensity} selected={selected} />
      )}
    </group>
  );
}

function CharacterMesh({
  color,
  emissive,
  emissiveIntensity,
  selected,
}: {
  color: string;
  emissive: string;
  emissiveIntensity: number;
  selected?: boolean;
}) {
  // Geometry is centered at origin so the pivot is at the visual center
  // (not the feet). The group's position offsets it so feet sit on the ground.
  return (
    <group>
      {/* Body — centered at y=0 (half above, half below) */}
      <mesh castShadow>
        <capsuleGeometry args={[0.22, 0.6, 8, 16]} />
        <meshStandardMaterial
          color={color}
          emissive={emissive}
          emissiveIntensity={emissiveIntensity}
          roughness={0.6}
          metalness={0.1}
        />
      </mesh>
      {/* Head — above the body */}
      <mesh position={[0, 0.55, 0]}>
        <sphereGeometry args={[0.16, 16, 16]} />
        <meshStandardMaterial
          color={color}
          emissive={emissive}
          emissiveIntensity={emissiveIntensity}
          roughness={0.6}
        />
      </mesh>
      {/* Forward target-vector indicator (facing +Z of the proxy) */}
      <group position={[0, 0.55, 0]}>
        <mesh position={[0, 0, 0.32]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.02, 0.02, 0.4, 8]} />
          <meshBasicMaterial color={selected ? "#ffffff" : color} />
        </mesh>
        <mesh position={[0, 0, 0.55]} rotation={[Math.PI / 2, 0, 0]}>
          <coneGeometry args={[0.07, 0.14, 12]} />
          <meshBasicMaterial color={selected ? "#ffffff" : color} />
        </mesh>
      </group>
      {/* Ground contact ring — at the feet (y = -0.52) */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.52, 0]}>
        <ringGeometry args={[0.22, 0.3, 24]} />
        <meshBasicMaterial color={selected ? "#ffffff" : color} transparent opacity={0.35} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

function SetMesh({
  color,
  emissive,
  emissiveIntensity,
  selected,
}: {
  color: string;
  emissive: string;
  emissiveIntensity: number;
  selected?: boolean;
}) {
  return (
    <mesh castShadow>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial
        color={color}
        emissive={emissive}
        emissiveIntensity={emissiveIntensity}
        roughness={0.85}
        metalness={0.05}
      />
      {selected && (
        <lineSegments>
          <edgesGeometry args={[new THREE.BoxGeometry(1.02, 1.02, 1.02)]} />
          <lineBasicMaterial color="#ffffff" />
        </lineSegments>
      )}
    </mesh>
  );
}

function PrimitiveMesh({
  kind,
  color,
  emissive,
  emissiveIntensity,
  selected,
}: {
  kind: ProxyKind;
  color: string;
  emissive: string;
  emissiveIntensity: number;
  selected?: boolean;
}) {
  const geom = (() => {
    switch (kind) {
      case "cube":
        return <boxGeometry args={[1, 1, 1]} />;
      case "sphere":
        return <sphereGeometry args={[0.5, 24, 24]} />;
      case "cylinder":
        return <cylinderGeometry args={[0.5, 0.5, 1, 24]} />;
      case "plane":
        return <planeGeometry args={[1, 1]} />;
      case "cone":
        return <coneGeometry args={[0.5, 1, 24]} />;
      case "torus":
        return <torusGeometry args={[0.4, 0.15, 16, 32]} />;
      default:
        return <boxGeometry args={[1, 1, 1]} />;
    }
  })();

  return (
    <mesh castShadow>
      {geom}
      <meshStandardMaterial
        color={color}
        emissive={emissive}
        emissiveIntensity={emissiveIntensity}
        roughness={0.5}
        metalness={0.2}
        side={kind === "plane" ? THREE.DoubleSide : THREE.FrontSide}
      />
      {selected && (
        <lineSegments>
          <edgesGeometry args={[edgesBoxFor(kind)]} />
          <lineBasicMaterial color="#ffffff" />
        </lineSegments>
      )}
    </mesh>
  );
}

function edgesBoxFor(kind: ProxyKind): THREE.BufferGeometry {
  switch (kind) {
    case "cube":
      return new THREE.EdgesGeometry(new THREE.BoxGeometry(1.02, 1.02, 1.02));
    case "sphere":
      return new THREE.EdgesGeometry(new THREE.SphereGeometry(0.52, 16, 12));
    case "cylinder":
      return new THREE.EdgesGeometry(new THREE.CylinderGeometry(0.52, 0.52, 1.02, 16));
    case "plane":
      return new THREE.EdgesGeometry(new THREE.PlaneGeometry(1.02, 1.02));
    case "cone":
      return new THREE.EdgesGeometry(new THREE.ConeGeometry(0.52, 1.02, 16));
    case "torus":
      return new THREE.EdgesGeometry(new THREE.TorusGeometry(0.42, 0.16, 8, 16));
    default:
      return new THREE.EdgesGeometry(new THREE.BoxGeometry(1.02, 1.02, 1.02));
  }
}
