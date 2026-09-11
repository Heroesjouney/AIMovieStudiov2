"use client";

import { useEffect, useRef, useState, Component, type ReactNode } from "react";
import { Canvas } from "@react-three/fiber";
import { Move, RotateCw, Maximize2, Camera, Circle, Video, Eye } from "lucide-react";
import { usePrevisStore } from "@/lib/usePrevisStore";
import { EditorScene } from "./EditorScene";
import { ViewfinderScene } from "./ViewfinderScene";
import { PrevisOutliner } from "./PrevisOutliner";
import { PrevisInspector } from "./PrevisInspector";
import { PrevisTransport } from "./PrevisTransport";

class PrevisErrorBoundary extends Component<
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
    console.warn("[PrevisStage] WebGL failed, showing fallback:", err);
  }
  render() {
    if (this.state.hasError) return this.props.fallback;
    return this.props.children;
  }
}

export function PrevisStage() {
  const viewfinderRef = useRef<HTMLCanvasElement>(null);

  const {
    isRecording, selectProxy, selectCamera,
    focalLength, aspectRatio,
    gizmoMode, setGizmoMode,
    viewMode, setViewMode,
  } = usePrevisStore();

  // --- Playback loop (rAF) — advances currentFrame while playing ---
  useEffect(() => {
    if (!usePrevisStore.getState().isPlaying) return;
    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      const s = usePrevisStore.getState();
      let next = s.currentFrame + dt * s.fps;
      if (next >= s.durationFrames) {
        if (s.isRecording) {
          s.setCurrentFrame(s.durationFrames);
          s.setIsPlaying(false);
          return;
        }
        next = 0;
      }
      s.setCurrentFrame(next);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [usePrevisStore.getState().isPlaying]); // eslint-disable-line react-hooks/exhaustive-deps

  // --- C hotkey: toggle Perspective / Camera viewport mode ---
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Only toggle on bare "c" — ignore if the user is typing in an input/textarea
      const target = e.target as HTMLElement;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      if (e.key.toLowerCase() === "c" && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const s = usePrevisStore.getState();
        s.setViewMode(s.viewMode === "perspective" ? "camera" : "perspective");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const aspect = aspectRatio === "16:9" ? 16 / 9 : 2.39 / 1;

  return (
    <div className="flex flex-col h-full bg-studio-bg overflow-hidden">
      {/* Main 3-pane area */}
      <div className="flex-1 flex overflow-hidden min-h-0">
        {/* Left: Scene Outliner */}
        <aside className="w-[180px] shrink-0 border-r border-studio-border overflow-hidden">
          <PrevisOutliner />
        </aside>

        {/* Center: Editor 3D Stage */}
        <div className="flex-1 relative min-w-0 bg-gradient-to-b from-studio-bg to-[#0d0d14]">
          {/* Floating gizmo toolbar */}
          <div className="absolute top-2 left-1/2 -translate-x-1/2 z-20 flex items-center gap-0.5 px-1 py-1 bg-studio-panel/90 backdrop-blur-md border border-studio-border rounded-xl shadow-lg">
            {/* Viewport mode toggle — Perspective / Camera (Unreal-style) */}
            <GizmoButton
              active={viewMode === "perspective"}
              onClick={() => setViewMode("perspective")}
              icon={<Eye className="w-3.5 h-3.5" />}
              label="Persp"
              hotkey=""
            />
            <GizmoButton
              active={viewMode === "camera"}
              onClick={() => setViewMode("camera")}
              icon={<Video className="w-3.5 h-3.5" />}
              label="Camera"
              hotkey="C"
            />
            <div className="w-px h-5 bg-studio-border mx-0.5" />
            <GizmoButton
              active={gizmoMode === "translate"}
              onClick={() => setGizmoMode("translate")}
              icon={<Move className="w-3.5 h-3.5" />}
              label="Move"
              hotkey="W"
            />
            <GizmoButton
              active={gizmoMode === "rotate"}
              onClick={() => setGizmoMode("rotate")}
              icon={<RotateCw className="w-3.5 h-3.5" />}
              label="Rotate"
              hotkey="E"
            />
            <GizmoButton
              active={gizmoMode === "scale"}
              onClick={() => setGizmoMode("scale")}
              icon={<Maximize2 className="w-3.5 h-3.5" />}
              label="Scale"
              hotkey="R"
            />
          </div>

          <PrevisErrorBoundary
            fallback={
              <div className="w-full h-full flex flex-col items-center justify-center gap-2 p-4">
                <Camera className="w-8 h-8 text-studio-muted/20" />
                <p className="text-xs text-studio-muted text-center">
                  3D previs stage unavailable (WebGL disabled).
                </p>
              </div>
            }
          >
            <Canvas
              camera={{ position: [7, 5, 9], fov: 50 }}
              dpr={[1, 1.5]}
              gl={{ antialias: false, powerPreference: "default", failIfMajorPerformanceCaveat: false }}
              onPointerMissed={() => {
                selectProxy(null);
                selectCamera(false);
              }}
            >
              <color attach="background" args={[viewMode === "camera" ? "#000000" : "#13131a"]} />
              <EditorScene />
            </Canvas>
          </PrevisErrorBoundary>

          {/* Bottom-left instructions hint — changes with the viewport mode */}
          <div className="absolute bottom-3 left-3 z-20 max-w-[320px] px-2.5 py-1.5 bg-studio-panel/80 backdrop-blur-sm border border-studio-border rounded-lg">
            {viewMode === "perspective" ? (
              <p className="text-[9px] text-studio-muted/70 leading-relaxed">
                <span className="text-amber-400 font-semibold">Click the camera</span> →
                <span className="text-studio-accent font-semibold"> Move</span> to pan/dolly,
                <span className="text-studio-accent font-semibold"> Rotate</span> to aim.
                Then <span className="text-studio-warning font-semibold">Set Key</span> to lock it.
                Or apply a <span className="text-studio-accent font-semibold">Template</span> to start fast.
              </p>
            ) : (
              <p className="text-[9px] text-studio-muted/70 leading-relaxed">
                <span className="text-studio-accent font-semibold">CAMERA MODE</span> — you are looking through the lens.
                Hold <span className="text-amber-400 font-semibold">RMB</span> + drag to look,
                <span className="text-amber-400 font-semibold"> WASD</span> to move,
                <span className="text-amber-400 font-semibold"> Q/E</span> up/down,
                <span className="text-amber-400 font-semibold"> wheel</span> to dolly.
                Press <span className="text-studio-warning font-semibold">K</span> to drop a keyframe.
              </p>
            )}
          </div>

          {/* Camera mode indicator overlay (top-right of the editor viewport) */}
          {viewMode === "camera" && (
            <>
              {/* Letterbox bars — mask the canvas outside the target aspect ratio
                  so the user sees the exact framing the camera will capture. */}
              <LetterboxOverlay aspect={aspectRatio === "16:9" ? 16 / 9 : 2.39 / 1} />

              {/* Indicator chip */}
              <div className="absolute top-2 right-2 z-20 flex items-center gap-1.5 px-2 py-1 bg-studio-accent/20 border border-studio-accent/40 rounded-lg">
                <Video className="w-3 h-3 text-studio-accent" />
                <span className="text-[9px] font-bold text-studio-accent uppercase tracking-wider">Through the Lens</span>
              </div>
            </>
          )}
        </div>

        {/* Right: Shot View + Inspector */}
        <aside className="w-[240px] shrink-0 border-l border-studio-border overflow-hidden flex flex-col">
          {/* Shot view (through-the-lens viewfinder) */}
          <div className="shrink-0 bg-black flex flex-col items-center pt-2 pb-1 border-b border-studio-border">
            <div className="flex items-center gap-1.5 mb-1 px-2 w-full">
              <Camera className="w-3 h-3 text-studio-accent shrink-0" />
              <span className="text-[9px] font-bold text-studio-accent uppercase tracking-wider">Shot View</span>
              <span className="text-[8px] text-studio-muted/50 ml-auto tabular-nums">{focalLength}mm · {aspectRatio}</span>
              {isRecording && (
                <span className="flex items-center gap-0.5 text-[8px] font-bold text-red-400 animate-pulse">
                  <Circle className="w-1.5 h-1.5 fill-red-500 text-red-500" /> REC
                </span>
              )}
            </div>
            {/* Viewfinder canvas — sized to match the selected aspect ratio */}
            <div className="w-full px-2 pb-1 flex justify-center">
              <div
                className="relative rounded-md overflow-hidden border border-studio-border bg-[#05050a] shadow-md"
                style={{ aspectRatio: aspect, width: "100%", maxHeight: "180px" }}
              >
                <PrevisErrorBoundary
                  fallback={<div className="w-full h-full flex items-center justify-center"><Camera className="w-5 h-5 text-studio-muted/20" /></div>}
                >
                  <Canvas
                    ref={viewfinderRef}
                    camera={{ fov: 50, position: [0, 1.6, 6] }}
                    dpr={[2, 2]}
                    gl={{ preserveDrawingBuffer: true, antialias: true }}
                    style={{ width: "100%", height: "100%", background: "#05050a" }}
                  >
                    <ViewfinderScene />
                  </Canvas>
                </PrevisErrorBoundary>
                {/* Safe-action framing guides (rule-of-thirds lines) */}
                <div className="absolute inset-0 pointer-events-none">
                  <div className="absolute top-1/3 left-0 right-0 h-px bg-white/10" />
                  <div className="absolute top-2/3 left-0 right-0 h-px bg-white/10" />
                  <div className="absolute left-1/3 top-0 bottom-0 w-px bg-white/10" />
                  <div className="absolute left-2/3 top-0 bottom-0 w-px bg-white/10" />
                </div>
              </div>
            </div>
          </div>

          {/* Inspector (transform / camera settings / prompt) */}
          <div className="flex-1 overflow-hidden min-h-0">
            <PrevisInspector viewfinderCanvasRef={viewfinderRef} />
          </div>
        </aside>
      </div>

      {/* Bottom: Transport bar */}
      <PrevisTransport />
    </div>
  );
}

function GizmoButton({
  active,
  onClick,
  icon,
  label,
  hotkey,
}: {
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
  label: string;
  hotkey: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-medium transition-colors ${
        active
          ? "bg-studio-accent text-white"
          : "text-studio-muted hover:text-studio-text hover:bg-studio-panelHover"
      }`}
      title={`${label} (${hotkey})`}
    >
      {icon}
      <span className="hidden xl:inline">{label}</span>
    </button>
  );
}

/**
 * Black bars that mask the canvas outside the target aspect ratio in camera
 * mode, so the user sees the exact framing the camera will capture. Uses a
 * ResizeObserver to adapt to container size changes.
 */
function LetterboxOverlay({ aspect }: { aspect: number }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [bars, setBars] = useState({ top: 0, bottom: 0, left: 0, right: 0 });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (w === 0 || h === 0) return;
      const containerAspect = w / h;
      let top = 0, bottom = 0, left = 0, right = 0;
      if (containerAspect > aspect) {
        // Canvas wider than target — pillarbox (bars on left/right)
        const innerW = h * aspect;
        left = (w - innerW) / 2;
        right = left;
      } else {
        // Canvas taller than target — letterbox (bars on top/bottom)
        const innerH = w / aspect;
        top = (h - innerH) / 2;
        bottom = top;
      }
      setBars({ top, bottom, left, right });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [aspect]);

  return (
    <div ref={containerRef} className="absolute inset-0 z-10 pointer-events-none">
      {bars.top > 0 && <div className="absolute top-0 left-0 right-0 bg-black" style={{ height: bars.top }} />}
      {bars.bottom > 0 && <div className="absolute bottom-0 left-0 right-0 bg-black" style={{ height: bars.bottom }} />}
      {bars.left > 0 && <div className="absolute top-0 bottom-0 left-0 bg-black" style={{ width: bars.left }} />}
      {bars.right > 0 && <div className="absolute top-0 bottom-0 right-0 bg-black" style={{ width: bars.right }} />}
    </div>
  );
}
