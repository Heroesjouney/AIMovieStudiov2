"use client";

import { useState, useEffect } from "react";
import {
  Loader2, Circle, Video, CheckCircle2, AlertCircle,
  SlidersHorizontal, Camera, Layers, Save, Film,
} from "lucide-react";
import { usePrevisStore, LENS_GROUPS, ASPECT_RATIOS, RENDER_RESOLUTIONS, type FocalLength, type RenderResolution } from "@/lib/usePrevisStore";
import { useStudioStore } from "@/lib/store";
import { renderPrevisToMp4 } from "@/lib/api";

/**
 * Right-side inspector panel.
 *
 * Shows the selected proxy's transform (position/rotation/scale) with numeric
 * inputs when one is selected, or shot-camera framing settings otherwise.
 * Always shows the motion prompt + generate button at the bottom.
 */
export function PrevisInspector({
  viewfinderCanvasRef,
}: {
  viewfinderCanvasRef: React.RefObject<HTMLCanvasElement>;
}) {
  const selectedProxyId = usePrevisStore((s) => s.selectedProxyId);
  const selectedProxy = usePrevisStore((s) =>
    s.proxies.find((p) => p.id === s.selectedProxyId),
  );

  return (
    <div className="flex flex-col h-full bg-studio-panel/50 overflow-hidden">
      {/* Transform or Camera settings */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {selectedProxy ? (
          <TransformEditor proxy={selectedProxy} />
        ) : (
          <CameraSettings />
        )}
      </div>

      {/* Prompt + Generate (always visible) */}
      <div className="shrink-0 border-t border-studio-border">
        <PromptAndGenerate viewfinderCanvasRef={viewfinderCanvasRef} />
      </div>
    </div>
  );
}

// =============================================================================
// Transform Editor
// =============================================================================

function TransformEditor({ proxy }: { proxy: NonNullable<ReturnType<typeof usePrevisStore.getState>["proxies"][number]> }) {
  const updateProxy = usePrevisStore((s) => s.updateProxy);
  const pushHistory = usePrevisStore((s) => s.pushHistory);

  const axes = [
    { key: "position" as const, label: "Pos", color: "#ef4444" },
    { key: "rotation" as const, label: "Rot", color: "#22c55e" },
    { key: "scale" as const, label: "Scl", color: "#3b82f6" },
  ] as const;

  const comps = ["X", "Y", "Z"] as const;

  return (
    <div className="p-2.5 flex flex-col gap-2.5">
      {/* Header */}
      <div className="flex items-center gap-1.5">
        <SlidersHorizontal className="w-3 h-3 text-studio-accent" />
        <span className="text-[9px] text-studio-muted/60 uppercase tracking-wider font-semibold truncate">{proxy.label}</span>
        <span className="text-[8px] text-studio-muted/40 uppercase ml-auto">{proxy.kind}</span>
      </div>

      {/* Transform rows */}
      {axes.map((axis) => (
        <div key={axis.key} className="flex flex-col gap-1">
          <div className="flex items-center gap-1">
            <span className="text-[8px] text-studio-muted/60 uppercase tracking-wider w-6">{axis.label}</span>
            <div className="flex-1 grid grid-cols-3 gap-1">
              {comps.map((c, i) => (
                <TransformInput
                  key={c}
                  axisColor={axis.color}
                  label={c}
                  value={proxy[axis.key][i]}
                  onChange={(v) => {
                    pushHistory();
                    const arr = [...proxy[axis.key]] as [number, number, number];
                    arr[i] = v;
                    updateProxy(proxy.id, { [axis.key]: arr });
                  }}
                />
              ))}
            </div>
          </div>
        </div>
      ))}

      {/* Color picker */}
      <div className="flex items-center gap-1.5 pt-0.5">
        <span className="text-[8px] text-studio-muted/60 uppercase tracking-wider w-6">Color</span>
        <input
          type="color"
          value={proxy.color}
          onChange={(e) => updateProxy(proxy.id, { color: e.target.value })}
          className="w-5 h-5 rounded cursor-pointer bg-transparent border border-studio-border"
        />
        <span className="text-[9px] text-studio-muted/40 font-mono">{proxy.color}</span>
      </div>
    </div>
  );
}

function TransformInput({
  label,
  value,
  onChange,
  axisColor,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  axisColor: string;
}) {
  const [text, setText] = useState(String(value.toFixed(2)));

  // Sync external changes (e.g. from gizmo drag)
  useEffect(() => {
    setText(value.toFixed(2));
  }, [value]);

  return (
    <div className="relative flex items-center">
      <span
        className="absolute left-1 text-[7px] font-bold pointer-events-none"
        style={{ color: axisColor }}
      >
        {label}
      </span>
      <input
        type="number"
        step="0.1"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          const v = parseFloat(text);
          if (!isNaN(v)) onChange(v);
          else setText(value.toFixed(2));
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
        className="w-full pl-3.5 pr-0.5 py-1 bg-studio-bg border border-studio-border rounded text-[10px] text-studio-text text-right tabular-nums focus:outline-none focus:border-studio-accent/50 hover:border-studio-borderHover transition-colors"
      />
    </div>
  );
}

// =============================================================================
// Camera Settings (shown when no proxy is selected)
// =============================================================================

function CameraSettings() {
  const {
    focalLength, setFocalLength,
    aspectRatio, setAspectRatio,
    renderResolution, setRenderResolution,
    actionAxisAngle, setActionAxisAngle,
    depthMode, setDepthMode,
    depthRange, setDepthRange,
    cameraChannels, addChannelKeyframe, currentFrame,
  } = usePrevisStore();

  const currentFrameRounded = Math.round(currentFrame);
  const focalAnimated = cameraChannels.focal.length > 0;

  return (
    <div className="p-2.5 flex flex-col gap-2.5">
      <div className="flex items-center gap-1.5">
        <Camera className="w-3 h-3 text-studio-accent" />
        <span className="text-[9px] text-studio-muted/60 uppercase tracking-wider font-semibold">Shot Camera</span>
      </div>

      {/* Focal length — dropdown grouped by lens type */}
      <div className="flex flex-col gap-1">
        <label className="text-[8px] text-studio-muted/60 uppercase tracking-wider">
          Focal Length{focalAnimated && <span className="text-studio-accent ml-1 normal-case">(animated)</span>}
        </label>
        <select
          value={focalLength}
          onChange={(e) => {
            const f = parseInt(e.target.value, 10) as FocalLength;
            setFocalLength(f);
            if (focalAnimated) addChannelKeyframe("focal", currentFrameRounded, f);
          }}
          className="w-full px-2 py-1.5 bg-studio-bg border border-studio-border rounded text-[10px] text-studio-text focus:outline-none focus:border-studio-accent/50 hover:border-studio-borderHover transition-colors cursor-pointer"
        >
          {LENS_GROUPS.map((group) => (
            <optgroup key={group.label} label={group.label}>
              {group.focal.map((f) => (
                <option key={f} value={f}>{f}mm — {group.hint}</option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>

      {/* Aspect ratio — dropdown */}
      <div className="flex flex-col gap-1">
        <label className="text-[8px] text-studio-muted/60 uppercase tracking-wider">Aspect Ratio</label>
        <select
          value={aspectRatio}
          onChange={(e) => setAspectRatio(e.target.value as typeof aspectRatio)}
          className="w-full px-2 py-1.5 bg-studio-bg border border-studio-border rounded text-[10px] text-studio-text focus:outline-none focus:border-studio-accent/50 hover:border-studio-borderHover transition-colors cursor-pointer"
        >
          {ASPECT_RATIOS.map((a) => (
            <option key={a.id} value={a.id}>{a.label} ({a.w}:{a.h})</option>
          ))}
        </select>
      </div>

      {/* Render resolution — dropdown */}
      <div className="flex flex-col gap-1">
        <label className="text-[8px] text-studio-muted/60 uppercase tracking-wider">Render Resolution</label>
        <select
          value={renderResolution}
          onChange={(e) => setRenderResolution(e.target.value as RenderResolution)}
          className="w-full px-2 py-1.5 bg-studio-bg border border-studio-border rounded text-[10px] text-studio-text focus:outline-none focus:border-studio-accent/50 hover:border-studio-borderHover transition-colors cursor-pointer"
        >
          {RENDER_RESOLUTIONS.map((r) => (
            <option key={r.id} value={r.id}>{r.label} ({r.height}p)</option>
          ))}
        </select>
      </div>

      {/* Action axis (180° line) */}
      <div className="flex flex-col gap-1">
        <span className="text-[8px] text-studio-muted/60 uppercase tracking-wider">Action Axis (180° Line)</span>
        <div className="flex items-center gap-2">
          <input
            type="range"
            min={0}
            max={360}
            step={5}
            value={actionAxisAngle}
            onChange={(e) => setActionAxisAngle(parseInt(e.target.value, 10))}
            className="flex-1 accent-studio-accent"
          />
          <span className="text-[10px] text-studio-muted tabular-nums w-8 text-right">{actionAxisAngle}°</span>
        </div>
      </div>

      {/* Depth pass toggle */}
      <button
        onClick={() => setDepthMode(!depthMode)}
        className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-[10px] font-medium transition-colors ${
          depthMode
            ? "bg-studio-warning/20 text-studio-warning border border-studio-warning/30"
            : "bg-studio-panelHover text-studio-muted hover:text-studio-text border border-transparent"
        }`}
      >
        <Layers className="w-3 h-3" />
        Depth Pass
        <span className="ml-auto text-[8px] opacity-60">{depthMode ? "ON" : "OFF"}</span>
      </button>

      {/* Depth range slider — only visible when depth pass is ON */}
      {depthMode && (
        <div className="flex flex-col gap-1 pl-1 border-l-2 border-studio-warning/30">
          <div className="flex items-center justify-between">
            <span className="text-[8px] text-studio-muted/60 uppercase tracking-wider">Depth Range</span>
            <span className="text-[10px] text-studio-warning tabular-nums">{depthRange}m</span>
          </div>
          <input
            type="range"
            min={2}
            max={40}
            step={1}
            value={depthRange}
            onChange={(e) => setDepthRange(parseInt(e.target.value, 10))}
            className="w-full accent-studio-warning"
          />
          <p className="text-[8px] text-studio-muted/40 leading-relaxed">
            White = at camera · Black = {depthRange}m away. Adjust so your scene fills the gradient.
          </p>
        </div>
      )}
    </div>
  );
}

// =============================================================================
// Prompt + Generate
// =============================================================================

function pickRecorderMime(): string {
  const candidates = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm", "video/mp4"];
  for (const c of candidates) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(c)) return c;
  }
  return "video/webm";
}

function PromptAndGenerate({ viewfinderCanvasRef }: { viewfinderCanvasRef: React.RefObject<HTMLCanvasElement> }) {
  const {
    isRecording, setIsRecording, setIsPlaying, setCurrentFrame,
    durationFrames, fps,
    savedPrevisUrl, setSavedPrevisUrl,
    renderResolution, aspectRatio,
  } = usePrevisStore();

  const bumpVideoLibraryRefresh = useStudioStore((s) => s.bumpVideoLibraryRefresh);
  const projectId = useStudioStore((s) => s.timeline.projectId);
  const setActiveInspector = useStudioStore((s) => s.setActiveInspector);
  const setPendingRefVideoPath = useStudioStore((s) => s.setPendingRefVideoPath);

  // Hand the previs recording to the Camera Director as the motion reference
  // (Reference / r2v mode). Generation stays in the Camera Director so all
  // references (characters, scenes, audio) live in one place.
  const handleSendToCameraDirector = () => {
    if (!savedPrevisUrl) return;
    setPendingRefVideoPath(savedPrevisUrl);
    setActiveInspector("camera");
  };

  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleRenderPrevis = async () => {
    const canvas = viewfinderCanvasRef.current;
    if (!canvas || isRecording) return;

    setCurrentFrame(0);
    setIsPlaying(true);
    setIsRecording(true);
    setSavedPrevisUrl(null);
    setError(null);

    try {
      const stream = canvas.captureStream(fps);
      const mimeType = pickRecorderMime();
      const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 8_000_000 });
      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => { if (e.data && e.data.size > 0) chunks.push(e.data); };
      recorder.onstop = async () => {
        setIsPlaying(false);
        setIsRecording(false);
        const blob = new Blob(chunks, { type: mimeType });
        // Render the previs recording to MP4 via backend ffmpeg and save
        // the MP4 to the project video library.
        try {
          setIsSaving(true);
          const result = await renderPrevisToMp4(blob, projectId, renderResolution, aspectRatio);
          setSavedPrevisUrl(result.video_url);
          // Trigger the MediaLibrary to re-fetch the video list.
          bumpVideoLibraryRefresh();
        } catch (err) {
          console.error("[Previs] failed to render to MP4:", err);
          setError(err instanceof Error ? err.message : "Failed to render previs to MP4");
        } finally {
          setIsSaving(false);
        }
      };
      recorder.start();
      const captureMs = (durationFrames / fps) * 1000 + 250;
      setTimeout(() => { if (recorder.state !== "inactive") recorder.stop(); }, captureMs);
    } catch (err) {
      console.error("[Previs] capture failed:", err);
      setIsPlaying(false);
      setIsRecording(false);
      setError(err instanceof Error ? err.message : "Failed to capture previs");
    }
  };

  return (
    <div className="p-2.5 flex flex-col gap-2">
      <div className="flex items-center gap-1.5">
        <Film className="w-3 h-3 text-studio-accent" />
        <span className="text-[9px] text-studio-muted/60 uppercase tracking-wider font-semibold">Render Previs</span>
      </div>

      <button
        onClick={handleRenderPrevis}
        disabled={isRecording || isSaving}
        className="w-full px-3 py-2 bg-studio-accent hover:bg-studio-accentHover disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-[11px] font-semibold flex items-center justify-center gap-1.5 shadow-lg transition-colors"
      >
        {isRecording ? (
          <><Circle className="w-3 h-3 fill-red-500 text-red-500 animate-pulse" /> Recording...</>
        ) : isSaving ? (
          <><Save className="w-3 h-3 animate-spin" /> Rendering MP4...</>
        ) : (
          <><Video className="w-3.5 h-3.5" /> Render to MP4</>
        )}
      </button>

      {/* Status */}
      {isSaving && (
        <div className="flex items-center gap-1.5 text-[10px] text-studio-muted bg-studio-bg/60 border border-studio-border rounded-lg px-2 py-1.5">
          <Save className="w-3 h-3 animate-spin text-studio-accent shrink-0" />
          <span>Rendering to MP4...</span>
        </div>
      )}
      {error && (
        <div className="flex items-start gap-1.5 text-[10px] text-studio-danger bg-studio-bg/60 border border-studio-danger/40 rounded-lg px-2 py-1.5">
          <AlertCircle className="w-3 h-3 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}
      {savedPrevisUrl && !isSaving && (
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-1.5 text-[10px] text-studio-success bg-studio-bg/60 border border-studio-success/40 rounded-lg px-2 py-1.5">
            <CheckCircle2 className="w-3 h-3 shrink-0" />
            <span className="truncate flex-1">MP4 saved to library</span>
            <a
              href={savedPrevisUrl}
              target="_blank"
              rel="noreferrer"
              className="text-studio-accent hover:underline shrink-0"
            >
              view
            </a>
          </div>
          <button
            onClick={handleSendToCameraDirector}
            className="w-full flex items-center justify-center gap-1.5 px-2.5 py-1.5 bg-studio-accent/15 hover:bg-studio-accent/25 border border-studio-accent/40 text-studio-accent rounded-lg text-[10px] font-semibold transition-colors"
          >
            <Camera className="w-3 h-3" />
            Use in Camera Director
          </button>
        </div>
      )}
    </div>
  );
}
