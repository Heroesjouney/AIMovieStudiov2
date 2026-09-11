"use client";

import { useEffect, useRef, useState, useCallback, Component, type ReactNode } from "react";
import { Canvas } from "@react-three/fiber";
import { Move, RotateCw, Maximize2, Camera, Circle, Video, Eye, Map, Magnet } from "lucide-react";
import { usePrevisStore, aspectRatioValue } from "@/lib/usePrevisStore";
import { EditorScene } from "./EditorScene";
import { ViewfinderScene } from "./ViewfinderScene";
import { PrevisOutliner } from "./PrevisOutliner";
import { PrevisInspector } from "./PrevisInspector";
import { PrevisTransport } from "./PrevisTransport";
import { useStudioStore } from "@/lib/store";
import { fetchPrevisScene, savePrevisScene } from "@/lib/api";

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
    snapEnabled, setSnapEnabled,
  } = usePrevisStore();

  const projectId = useStudioStore((s) => s.timeline.projectId);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const hydratedRef = useRef(false);
  const saveTimerRef = useRef<number | null>(null);

  const doSave = useCallback(async () => {
    if (!hydratedRef.current) return;
    setSaveStatus("saving");
    try {
      await savePrevisScene(projectId, usePrevisStore.getState().serialize());
      setSaveStatus("saved");
    } catch (err) {
      console.error("[PrevisStage] auto-save failed:", err);
      setSaveStatus("error");
    }
  }, [projectId]);

  // --- Hydrate once on mount (before auto-save starts listening) ---
  useEffect(() => {
    let cancelled = false;
    fetchPrevisScene(projectId)
      .then((res) => {
        if (cancelled || !res.scene) return;
        usePrevisStore.getState().hydrate(res.scene);
      })
      .catch((err) => console.error("[PrevisStage] failed to load previs scene:", err))
      .finally(() => {
        if (!cancelled) hydratedRef.current = true;
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  // --- Debounced auto-save on authoring changes (skips playback-only state) ---
  useEffect(() => {
    const unsub = usePrevisStore.subscribe((s, prev) => {
      if (!hydratedRef.current) return;
      if (
        s.proxies === prev.proxies &&
        s.proxyKeyframes === prev.proxyKeyframes &&
        s.cameraChannels === prev.cameraChannels &&
        s.trajectory === prev.trajectory &&
        s.durationFrames === prev.durationFrames &&
        s.focalLength === prev.focalLength &&
        s.aspectRatio === prev.aspectRatio &&
        s.actionAxisAngle === prev.actionAxisAngle &&
        s.depthMode === prev.depthMode &&
        s.depthRange === prev.depthRange &&
        s.renderResolution === prev.renderResolution
      ) {
        return;
      }
      if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = window.setTimeout(() => {
        saveTimerRef.current = null;
        void doSave();
      }, 1000);
    });
    return () => {
      unsub();
    };
  }, [doSave]);

  // --- Flush a pending save when the stage unmounts (e.g. switching dock tabs) ---
  useEffect(() => {
    return () => {
      if (saveTimerRef.current !== null) {
        window.clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
        void doSave();
      }
    };
  }, [doSave]);

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

  // --- Hotkeys: UE5-style viewport + authoring shortcuts ---
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Ignore when the user is typing in an input/textarea
      const target = e.target as HTMLElement;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      const s = usePrevisStore.getState();
      const k = e.key.toLowerCase();
      const mod = e.ctrlKey || e.metaKey;

      // View mode toggles
      if (k === "c" && !mod && !e.altKey) {
        s.setViewMode(s.viewMode === "perspective" ? "camera" : "perspective");
      } else if (k === "p" && !mod && !e.altKey) {
        s.setViewMode(s.viewMode === "plan" ? "perspective" : "plan");
      }
      // Undo / redo
      else if (k === "z" && mod && !e.altKey) {
        e.preventDefault();
        if (e.shiftKey) s.redo();
        else s.undo();
      } else if (k === "y" && mod) {
        e.preventDefault();
        s.redo();
      }
      // Gizmo mode hotkeys (W=move, E=rotate, R=scale) — UE5 convention
      else if (k === "w" && !mod && !e.altKey) {
        s.setGizmoMode("translate");
      } else if (k === "e" && !mod && !e.altKey) {
        s.setGizmoMode("rotate");
      } else if (k === "r" && !mod && !e.altKey) {
        s.setGizmoMode("scale");
      }
      // F = frame selected (dispatch event for the Canvas camera to catch)
      else if (k === "f" && !mod && !e.altKey) {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent("previs-frame-selected"));
      }
      // Delete = remove selected proxy
      else if ((e.key === "Delete" || e.key === "Backspace") && !mod && !e.altKey) {
        if (s.selectedProxyId) {
          e.preventDefault();
          s.removeProxy(s.selectedProxyId);
        }
      }
      // Ctrl+D = duplicate selected proxy
      else if (k === "d" && mod && !e.altKey) {
        if (s.selectedProxyId) {
          e.preventDefault();
          s.duplicateSelectedProxy();
        }
      }
      // End = snap selected proxy to floor (y based on kind, like defaultProxy)
      else if (e.key === "End" && !mod && !e.altKey) {
        if (s.selectedProxyId) {
          e.preventDefault();
          const p = s.proxies.find((x) => x.id === s.selectedProxyId);
          if (p) {
            const floorY =
              p.kind === "plane" ? 0.01 :
              p.kind === "character" ? 0.6 :
              p.kind === "sphere" || p.kind === "cylinder" || p.kind === "cone" ? 1 :
              0.5;
            s.updateProxy(p.id, { position: [p.position[0], floorY, p.position[2]] });
          }
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const aspect = aspectRatioValue(aspectRatio);

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
            {/* Viewport mode toggle — Perspective / Camera / Plan (Unreal-style) */}
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
            <GizmoButton
              active={viewMode === "plan"}
              onClick={() => setViewMode("plan")}
              icon={<Map className="w-3.5 h-3.5" />}
              label="Plan"
              hotkey="P"
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
            <div className="w-px h-5 bg-studio-border mx-0.5" />
            {/* Grid snapping toggle for gizmo drags */}
            <GizmoButton
              active={snapEnabled}
              onClick={() => setSnapEnabled(!snapEnabled)}
              icon={<Magnet className="w-3.5 h-3.5" />}
              label="Snap"
              hotkey=""
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

          {/* Bottom-left hint — single clean line per mode */}
          <div className="absolute bottom-3 left-3 z-20 px-2.5 py-1 bg-studio-panel/80 backdrop-blur-sm border border-studio-border rounded-md">
            <p className="text-[9px] text-studio-muted/60 leading-tight tabular-nums">
              {viewMode === "perspective"
                ? "LMB orbit · MMB pan · RMB look+WASD fly · F frame · W/E/R gizmo · Del delete"
                : viewMode === "camera"
                  ? "Through the lens · RMB-drag look · WASD move · Q/E up-down · K to key"
                  : "Plan view · Drag to pan · Wheel to zoom · Scrub timeline to review"}
            </p>
          </div>

          {/* Snap indicator badge (top-left of viewport) — visible when snapping is on */}
          {snapEnabled && (
            <div className="absolute top-2 left-3 z-20 flex items-center gap-1 px-2 py-0.5 bg-studio-warning/15 border border-studio-warning/30 rounded-md">
              <Magnet className="w-2.5 h-2.5 text-studio-warning" />
              <span className="text-[9px] text-studio-warning font-semibold tabular-nums">Snap: 0.5m</span>
            </div>
          )}

          {/* Camera mode indicator overlay (top-right of the editor viewport) */}
          {viewMode === "camera" && (
            <>
              {/* Letterbox bars — mask the canvas outside the target aspect ratio
                  so the user sees the exact framing the camera will capture. */}
              <LetterboxOverlay aspect={aspectRatioValue(aspectRatio)} />

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
              <span className="text-[9px] text-studio-muted/60 uppercase tracking-wider font-bold">Shot View</span>
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
      <PrevisTransport saveStatus={saveStatus} onSave={doSave} />
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
