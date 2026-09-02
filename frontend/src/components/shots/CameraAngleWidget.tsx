"use client";

import { useRef, useMemo, useCallback, Component, type ReactNode } from "react";
import { Canvas, useThree, useFrame } from "@react-three/fiber";
import { OrbitControls, Html, Line } from "@react-three/drei";
import * as THREE from "three";

export interface PreviousShotAngle {
  horizontalAngle: number;
  verticalAngle: number;
  zoom: number;
  label: string;
}

interface CameraAngleWidgetProps {
  horizontalAngle: number;
  verticalAngle: number;
  zoom: number;
  onChange: (h: number, v: number, z: number) => void;
  referenceImageUrl?: string;
  previousShots?: PreviousShotAngle[];
  actionAxisAngle?: number;
  isPOV?: boolean;
}

class WebGLErrorBoundary extends Component<
  { children: ReactNode; fallback: ReactNode },
  { hasError: boolean }
> {
  constructor(props: { children: ReactNode; fallback: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(err: unknown) {
    console.warn("[CameraAngleWidget] WebGL failed, showing fallback:", err);
  }
  render() {
    if (this.state.hasError) return this.props.fallback;
    return this.props.children;
  }
}

const FLOOR_RADIUS = 2.2;
const SUBJECT_Y = 0.8;

function angleToPosition(hAngle: number, vAngle: number, zoom: number): THREE.Vector3 {
  const hRad = (hAngle * Math.PI) / 180;
  const vRad = (vAngle * Math.PI) / 180;
  const dist = 3.5 - (zoom / 10) * 2.5;
  const x = dist * Math.sin(hRad) * Math.cos(vRad);
  const y = dist * Math.sin(vRad) + SUBJECT_Y;
  const z = dist * Math.cos(hRad) * Math.cos(vRad);
  return new THREE.Vector3(x, y, z);
}

function positionToAngle(pos: THREE.Vector3): { h: number; v: number; z: number } {
  const subject = new THREE.Vector3(0, SUBJECT_Y, 0);
  const offset = pos.clone().sub(subject);
  const dist = offset.length();
  const h = (Math.atan2(offset.x, offset.z) * 180) / Math.PI;
  const v = (Math.asin(offset.y / Math.max(dist, 0.001)) * 180) / Math.PI;
  const zoom = Math.max(0, Math.min(10, ((3.5 - dist) / 2.5) * 10));
  return {
    h: ((h % 360) + 360) % 360,
    v: Math.max(-30, Math.min(60, v)),
    z: zoom,
  };
}

const COMPASS_DIRS = [
  { angle: 0, label: "FRONT", color: "#ef4444" },
  { angle: 90, label: "RIGHT", color: "#9ca3af" },
  { angle: 180, label: "BACK", color: "#9ca3af" },
  { angle: 270, label: "LEFT", color: "#9ca3af" },
];

function CompassRose() {
  const spokes = useMemo(() => {
    const result: { points: [number, number, number][]; thick: boolean }[] = [];
    for (let i = 0; i < 8; i++) {
      const a = (i * 45 * Math.PI) / 180;
      const inner = i % 2 === 0 ? 0.5 : 0.7;
      const outer = FLOOR_RADIUS;
      result.push({
        points: [
          [Math.sin(a) * inner, 0.02, Math.cos(a) * inner],
          [Math.sin(a) * outer, 0.02, Math.cos(a) * outer],
        ],
        thick: i % 2 === 0,
      });
    }
    return result;
  }, []);

  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
        <circleGeometry args={[FLOOR_RADIUS, 64]} />
        <meshStandardMaterial color="#111827" transparent opacity={0.85} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
        <ringGeometry args={[FLOOR_RADIUS - 0.04, FLOOR_RADIUS, 64]} />
        <meshBasicMaterial color="#4b5563" />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
        <ringGeometry args={[0.47, 0.5, 32]} />
        <meshBasicMaterial color="#4b5563" />
      </mesh>
      {spokes.map((s, i) => (
        <Line
          key={i}
          points={s.points}
          color={s.thick ? "#4b5563" : "#374151"}
          lineWidth={s.thick ? 2 : 1}
          transparent
          opacity={0.6}
        />
      ))}
      {COMPASS_DIRS.map((d) => {
        const rad = (d.angle * Math.PI) / 180;
        const x = Math.sin(rad) * (FLOOR_RADIUS + 0.35);
        const z = Math.cos(rad) * (FLOOR_RADIUS + 0.35);
        return (
          <Html key={d.angle} position={[x, 0.05, z]} center>
            <div
              className="text-[9px] font-bold select-none pointer-events-none whitespace-nowrap tracking-wider"
              style={{ color: d.color }}
            >
              {d.label}
            </div>
          </Html>
        );
      })}
    </group>
  );
}

function SubjectMarker() {
  return (
    <group position={[0, SUBJECT_Y, 0]}>
      <mesh position={[0, 0, 0]}>
        <capsuleGeometry args={[0.22, 0.5, 8, 16]} />
        <meshStandardMaterial
          color="#9ca3af"
          emissive="#6b7280"
          emissiveIntensity={0.15}
          roughness={0.7}
        />
      </mesh>
      <mesh position={[0, 0.5, 0]}>
        <sphereGeometry args={[0.16, 16, 16]} />
        <meshStandardMaterial
          color="#9ca3af"
          emissive="#6b7280"
          emissiveIntensity={0.15}
          roughness={0.7}
        />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.55, 0]}>
        <ringGeometry args={[0.25, 0.4, 32]} />
        <meshBasicMaterial color="#1f2937" transparent opacity={0.5} />
      </mesh>
    </group>
  );
}

function CameraMarker({
  position,
  onDrag,
  isPOV,
}: {
  position: THREE.Vector3;
  onDrag: (pos: THREE.Vector3) => void;
  isPOV?: boolean;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const dragging = useRef(false);
  const { camera, raycaster, pointer, gl } = useThree();
  const dragPlane = useRef(new THREE.Plane());
  const color = isPOV ? "#06b6d4" : "#f59e0b";

  useFrame(() => {
    if (groupRef.current) {
      groupRef.current.position.lerp(position, 0.25);
      if (isPOV) {
        // POV: look outward horizontally from subject (away from center)
        const outward = position.clone().sub(new THREE.Vector3(0, SUBJECT_Y, 0));
        outward.y = 0; // keep look direction horizontal
        outward.normalize();
        const target = position.clone().add(outward);
        groupRef.current.lookAt(target);
      } else {
        groupRef.current.lookAt(0, SUBJECT_Y, 0);
      }
    }
  });

  const handlePointerDown = useCallback(
    (e: any) => {
      e.stopPropagation();
      dragging.current = true;
      gl.domElement.style.cursor = "grabbing";
    },
    [gl]
  );

  const handlePointerUp = useCallback(() => {
    dragging.current = false;
    gl.domElement.style.cursor = "auto";
  }, [gl]);

  const handlePointerMove = useCallback(
    (e: any) => {
      if (!dragging.current) return;
      e.stopPropagation();

      raycaster.setFromCamera(pointer, camera);
      const hit = new THREE.Vector3();
      const subjectPos = new THREE.Vector3(0, SUBJECT_Y, 0);
      const dir = position.clone().sub(subjectPos).normalize();
      dragPlane.current.setFromNormalAndCoplanarPoint(dir, subjectPos);

      if (raycaster.ray.intersectPlane(dragPlane.current, hit)) {
        const offset = hit.clone().sub(subjectPos);
        const dist = offset.length();
        const clampedDist = Math.max(1, Math.min(3.5, dist));
        const clamped = offset.normalize().multiplyScalar(clampedDist).add(subjectPos);
        onDrag(clamped);
      }
    },
    [camera, pointer, raycaster, onDrag]
  );

  return (
    <group>
      {!isPOV && (
        <Line
          points={[[0, SUBJECT_Y, 0], position.toArray()] as [number, number, number][]}
          color="#f59e0b"
          lineWidth={1.5}
          transparent
          opacity={0.5}
          dashed
          dashSize={0.08}
          gapSize={0.06}
        />
      )}
      <group ref={groupRef}>
        <mesh
          onPointerDown={handlePointerDown}
          onPointerUp={handlePointerUp}
          onPointerMove={handlePointerMove}
          onPointerOut={handlePointerUp}
        >
          <boxGeometry args={[0.18, 0.14, 0.12]} />
          <meshStandardMaterial
            color={color}
            emissive={color}
            emissiveIntensity={0.3}
            metalness={0.5}
            roughness={0.3}
          />
        </mesh>
        <mesh position={[0, 0, -0.1]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.05, 0.05, 0.08, 12]} />
          <meshStandardMaterial
            color="#1f2937"
            emissive="#111827"
            emissiveIntensity={0.2}
            metalness={0.8}
            roughness={0.2}
          />
        </mesh>
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.14, 0.17, 24]} />
          <meshBasicMaterial color={color} transparent opacity={0.3} side={THREE.DoubleSide} />
        </mesh>
        {isPOV && (
          <Html position={[0, 0.25, 0]} center>
            <div className="text-[8px] font-bold text-cyan-400 select-none pointer-events-none whitespace-nowrap">
              POV
            </div>
          </Html>
        )}
      </group>
    </group>
  );
}

function AngleReadout({
  horizontalAngle,
  verticalAngle,
  zoom,
  crossesLine,
}: {
  horizontalAngle: number;
  verticalAngle: number;
  zoom: number;
  crossesLine?: boolean;
}) {
  const hDir = useMemo(() => {
    const h = horizontalAngle % 360;
    if (h < 22.5 || h >= 337.5) return "Front";
    if (h < 67.5) return "Front-Rt";
    if (h < 112.5) return "Right";
    if (h < 157.5) return "Back-Rt";
    if (h < 202.5) return "Back";
    if (h < 247.5) return "Back-Lt";
    if (h < 292.5) return "Left";
    return "Front-Lt";
  }, [horizontalAngle]);

  const vDir = useMemo(() => {
    if (verticalAngle < -15) return "Low";
    if (verticalAngle < 15) return "Eye";
    if (verticalAngle < 45) return "High";
    return "Bird";
  }, [verticalAngle]);

  const shotSize = useMemo(() => {
    if (zoom < 1) return "XWide";
    if (zoom < 2) return "Wide";
    if (zoom < 4) return "Med";
    if (zoom < 7) return "Close";
    return "XClose";
  }, [zoom]);

  const warnings = useMemo(() => {
    const h = horizontalAngle % 360;
    const isBack = h >= 157.5 && h < 247.5;
    const isBackQuarter = (h >= 112.5 && h < 157.5) || (h >= 247.5 && h < 292.5);
    const isExtremeClose = zoom >= 8.5;
    const isExtremeWide = zoom < 1;
    const isBird = verticalAngle >= 45;
    const isExtremeLow = verticalAngle <= -25;
    const items: string[] = [];
    if (isBack) items.push("Back view — AI may lose character identity");
    else if (isBackQuarter) items.push("Back quarter — character detail may drift");
    if (isExtremeClose) items.push("Extreme close-up — facial detail may distort");
    if (isExtremeWide) items.push("Extreme wide — characters may lose detail");
    if (isBird) items.push("Bird's eye — AI tends to flatten perspective");
    if (isExtremeLow) items.push("Extreme low angle — proportions may distort");
    return items;
  }, [horizontalAngle, zoom, verticalAngle]);

  const hasWarning = warnings.length > 0;

  return (
    <Html position={[0, FLOOR_RADIUS + 0.6, 0]} center>
      <div className="flex flex-col items-center gap-1 select-none pointer-events-none whitespace-nowrap">
        <div className="flex items-center gap-1.5">
          <span className={`text-[10px] font-bold tracking-wide ${hasWarning ? "text-orange-400" : "text-amber-400"}`}>
            {hDir} {vDir} {shotSize}
          </span>
          {crossesLine && (
            <span className="text-[8px] font-bold text-red-400 bg-red-500/15 px-1 py-0.5 rounded">
              180°
            </span>
          )}
          {hasWarning && (
            <span className="text-[8px] font-bold text-orange-400 bg-orange-500/15 px-1 py-0.5 rounded">
              ⚠
            </span>
          )}
        </div>
        {hasWarning && (
          <div className="flex flex-col gap-0.5 max-w-[200px]">
            {warnings.map((w, i) => (
              <span key={i} className="text-[7px] text-orange-300/80 leading-tight text-center">
                {w}
              </span>
            ))}
          </div>
        )}
      </div>
    </Html>
  );
}

function ReferenceImagePanel({ url }: { url: string }) {
  return (
    <Html position={[0, 0, -(FLOOR_RADIUS + 1.2)]} center transform occlude>
      <div
        className="rounded-lg overflow-hidden border-2 border-studio-border shadow-xl"
        style={{ width: 120, height: 68 }}
      >
        <img
          src={url}
          alt="Reference"
          className="w-full h-full object-cover"
          style={{ pointerEvents: "none" }}
        />
      </div>
    </Html>
  );
}

function FOVCone({ cameraPos, zoom, isPOV }: { cameraPos: THREE.Vector3; zoom: number; isPOV?: boolean }) {
  const subjectPos = new THREE.Vector3(0, SUBJECT_Y, 0);
  const color = isPOV ? "#06b6d4" : "#f59e0b";

  // POV: cone extends outward from subject; Normal: cone extends from camera to subject
  const dir = isPOV
    ? (() => { const d = cameraPos.clone().sub(subjectPos); d.y = 0; return d.normalize(); })() // horizontal outward
    : subjectPos.clone().sub(cameraPos).normalize(); // toward subject
  const dist = isPOV ? 2.5 : cameraPos.distanceTo(subjectPos);
  const halfAngle = THREE.MathUtils.lerp(0.55, 0.18, Math.min(1, zoom / 10));
  const baseRadius = Math.tan(halfAngle) * dist;

  const quaternion = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 0, -1),
    dir
  );

  const coneGeo = useMemo(() => {
    const geo = new THREE.ConeGeometry(baseRadius, dist, 24, 1, true);
    geo.translate(0, -dist / 2, 0);
    geo.rotateX(Math.PI / 2);
    return geo;
  }, [baseRadius, dist]);

  const conePos = isPOV ? subjectPos.clone() : cameraPos;

  return (
    <mesh geometry={coneGeo} position={conePos} quaternion={quaternion}>
      <meshBasicMaterial
        color={color}
        transparent
        opacity={0.08}
        side={THREE.DoubleSide}
        depthWrite={false}
      />
    </mesh>
  );
}

function ActionAxisLine({ axisAngle, currentAngle }: { axisAngle: number; currentAngle: number }) {
  const rad = (axisAngle * Math.PI) / 180;
  const len = FLOOR_RADIUS + 0.5;
  const x1 = Math.sin(rad) * len;
  const z1 = Math.cos(rad) * len;
  const x2 = -x1;
  const z2 = -z1;

  // Check if current camera angle crosses the 180° line
  const axisBack = (axisAngle + 180) % 360;
  const crosses = Math.abs(((currentAngle - axisBack + 540) % 360) - 180) < 20;

  return (
    <group>
      <Line
        points={[[x1, 0.03, z1], [x2, 0.03, z2]] as [number, number, number][]}
        color={crosses ? "#ef4444" : "#3b82f6"}
        lineWidth={crosses ? 2.5 : 1.5}
        transparent
        opacity={crosses ? 0.8 : 0.4}
        dashed
        dashSize={0.12}
        gapSize={0.08}
      />
    </group>
  );
}

function PreviousShotMarker({ shot }: { shot: PreviousShotAngle }) {
  const pos = useMemo(
    () => angleToPosition(shot.horizontalAngle, shot.verticalAngle, shot.zoom),
    [shot.horizontalAngle, shot.verticalAngle, shot.zoom]
  );

  return (
    <group position={pos}>
      <mesh>
        <boxGeometry args={[0.1, 0.08, 0.07]} />
        <meshStandardMaterial
          color="#6b7280"
          transparent
          opacity={0.4}
          emissive="#6b7280"
          emissiveIntensity={0.1}
        />
      </mesh>
      <Line
        points={[[0, 0, 0], [0, SUBJECT_Y - pos.y, 0]] as [number, number, number][]}
        color="#6b7280"
        lineWidth={0.5}
        transparent
        opacity={0.2}
        dashed
        dashSize={0.04}
        gapSize={0.04}
      />
      <Html position={[0, 0.15, 0]} center>
        <div className="text-[7px] text-studio-muted select-none pointer-events-none whitespace-nowrap">
          {shot.label}
        </div>
      </Html>
    </group>
  );
}

export function CameraAngleWidget({
  horizontalAngle,
  verticalAngle,
  zoom,
  onChange,
  referenceImageUrl,
  previousShots,
  actionAxisAngle,
  isPOV,
}: CameraAngleWidgetProps) {
  // POV: camera sits at subject eye level, offset slightly in look direction
  const camPos = useMemo(
    () => isPOV
      ? new THREE.Vector3(
          Math.sin((horizontalAngle * Math.PI) / 180) * 0.3,
          SUBJECT_Y + 0.5,
          Math.cos((horizontalAngle * Math.PI) / 180) * 0.3
        )
      : angleToPosition(horizontalAngle, verticalAngle, zoom),
    [horizontalAngle, verticalAngle, zoom, isPOV]
  );

  const handleDrag = useCallback(
    (pos: THREE.Vector3) => {
      const angles = positionToAngle(pos);
      onChange(angles.h, angles.v, angles.z);
    },
    [onChange]
  );

  return (
    <div className="w-full h-full rounded-lg overflow-hidden border border-studio-border bg-gradient-to-b from-studio-bg to-studio-panel">
      <WebGLErrorBoundary
        fallback={
          <div className="w-full h-full flex flex-col items-center justify-center gap-3 p-4">
            <p className="text-[10px] text-studio-muted text-center">
              3D preview unavailable (WebGL disabled). Use the sliders below.
            </p>
            <div className="flex flex-col gap-2 w-48">
              <div className="flex items-center gap-2">
                <label className="text-[9px] text-studio-muted w-8">Horiz</label>
                <input type="range" min={0} max={360} step={5} value={horizontalAngle}
                  onChange={(e) => onChange(parseInt(e.target.value), verticalAngle, zoom)}
                  className="flex-1 accent-studio-accent" />
                <span className="text-[9px] text-studio-muted w-7 text-right tabular-nums">{horizontalAngle}&deg;</span>
              </div>
              <div className="flex items-center gap-2">
                <label className="text-[9px] text-studio-muted w-8">Vert</label>
                <input type="range" min={-30} max={60} step={5} value={verticalAngle}
                  onChange={(e) => onChange(horizontalAngle, parseInt(e.target.value), zoom)}
                  className="flex-1 accent-studio-accent" />
                <span className="text-[9px] text-studio-muted w-7 text-right tabular-nums">{verticalAngle}&deg;</span>
              </div>
              <div className="flex items-center gap-2">
                <label className="text-[9px] text-studio-muted w-8">Zoom</label>
                <input type="range" min={0} max={12} step={0.5} value={zoom}
                  onChange={(e) => onChange(horizontalAngle, verticalAngle, parseFloat(e.target.value))}
                  className="flex-1 accent-studio-accent" />
                <span className="text-[9px] text-studio-muted w-8 text-right tabular-nums">{zoom.toFixed(1)}</span>
              </div>
            </div>
          </div>
        }
      >
        <Canvas
        camera={{ position: [3.5, 3, 3.5], fov: 42 }}
        dpr={[1, 1.5]}
        gl={{ antialias: false, powerPreference: "default", failIfMajorPerformanceCaveat: false }}
        style={{ background: "transparent" }}
      >
        <ambientLight intensity={0.6} />
        <directionalLight position={[5, 6, 3]} intensity={0.7} />
        <directionalLight position={[-3, 2, -4]} intensity={0.25} color="#60a5fa" />

        <CompassRose />
        <SubjectMarker />
        {actionAxisAngle != null && (
          <ActionAxisLine axisAngle={actionAxisAngle} currentAngle={horizontalAngle} />
        )}
        {previousShots?.map((shot, i) => (
          <PreviousShotMarker key={i} shot={shot} />
        ))}
        <FOVCone cameraPos={camPos} zoom={zoom} isPOV={isPOV} />
        <CameraMarker position={camPos} onDrag={handleDrag} isPOV={isPOV} />
        <AngleReadout
          horizontalAngle={horizontalAngle}
          verticalAngle={verticalAngle}
          zoom={zoom}
          crossesLine={
            actionAxisAngle != null &&
            Math.abs(((horizontalAngle - ((actionAxisAngle + 180) % 360) + 540) % 360) - 180) < 20
          }
        />
        {referenceImageUrl && <ReferenceImagePanel url={referenceImageUrl} />}

        <OrbitControls
          enablePan={false}
          enableZoom={true}
          minDistance={3}
          maxDistance={12}
          minPolarAngle={0.15}
          maxPolarAngle={Math.PI / 2.2}
          target={[0, 0.4, 0]}
        />
      </Canvas>
      </WebGLErrorBoundary>
    </div>
  );
}
