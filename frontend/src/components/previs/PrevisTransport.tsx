"use client";

import {
  Play, Pause, Square, SkipBack, SkipForward, Diamond, Plus, Trash2,
  Box, User, Circle, Cylinder as CylIcon, Square as SqIcon, Triangle, Donut, Camera,
} from "lucide-react";
import { usePrevisStore, type ProxyKind } from "@/lib/usePrevisStore";
import { sampleTrajectory } from "@/lib/previsTrajectory";
import type { TrajectoryPreset } from "@/lib/previsTrajectory";

const TEMPLATES: { id: TrajectoryPreset; label: string; icon: string; desc: string }[] = [
  { id: "dolly", label: "Dolly", icon: "↔", desc: "Linear push-in / pull-out" },
  { id: "arc", label: "Arc", icon: "◠", desc: "Orbit around target" },
  { id: "crane", label: "Crane", icon: "↕", desc: "Vertical boom up / down" },
  { id: "custom", label: "Clear", icon: "✕", desc: "Remove all keyframes" },
];

const DURATIONS = [
  { frames: 48, label: "2s" },
  { frames: 96, label: "4s" },
  { frames: 144, label: "6s" },
  { frames: 240, label: "10s" },
  { frames: 360, label: "15s" },
];

const KIND_ICON: Record<ProxyKind, React.ComponentType<{ className?: string }>> = {
  character: User,
  set: Box,
  cube: Box,
  sphere: Circle,
  cylinder: CylIcon,
  plane: SqIcon,
  cone: Triangle,
  torus: Donut,
};

/**
 * Transport bar — multitrack keyframe timeline (like Unreal / After Effects):
 *
 *   Row 1: Playback controls + scrubber + timecode
 *   Row 2+: Track per object (camera first, then each proxy) with keyframe diamonds
 *   Last row: Templates + duration + Set Key
 */
export function PrevisTransport() {
  const {
    currentFrame, durationFrames, fps, isPlaying,
    togglePlay, setIsPlaying, setCurrentFrame,
    trajectory, applyPreset, keyframes,
    setDurationFrames, addKeyframeAtFrame, removeKeyframeAtFrame,
    proxies, selectedProxyId, selectProxy,
    proxyKeyframes, addProxyKeyframe, removeProxyKeyframe,
    cameraSelected, selectCamera,
  } = usePrevisStore();

  const seconds = (currentFrame / fps).toFixed(2);
  const totalSeconds = (durationFrames / fps).toFixed(0);
  const currentFrameRounded = Math.round(currentFrame);

  const handleStop = () => {
    setIsPlaying(false);
    setCurrentFrame(0);
  };

  // Set Key — works for whichever track is active (camera or selected proxy)
  const handleSetKeyframe = () => {
    const frame = currentFrameRounded;
    if (cameraSelected) {
      const t = durationFrames > 0 ? currentFrame / durationFrames : 0;
      const { position, target } = sampleTrajectory(keyframes, t);
      addKeyframeAtFrame(frame, [position.x, position.y, position.z], [target.x, target.y, target.z]);
    } else if (selectedProxyId) {
      const p = proxies.find((x) => x.id === selectedProxyId);
      if (p) addProxyKeyframe(selectedProxyId, frame, p.position, p.rotation, p.scale);
    }
  };

  const hasCamKeyAtCurrent = keyframes.some((k) => k.frame === currentFrameRounded);
  const hasProxyKeyAtCurrent = selectedProxyId
    ? (proxyKeyframes[selectedProxyId] ?? []).some((k) => k.frame === currentFrameRounded)
    : false;
  const hasKeyAtCurrent = cameraSelected ? hasCamKeyAtCurrent : hasProxyKeyAtCurrent;

  return (
    <div className="flex flex-col gap-1 px-3 py-1.5 bg-studio-panel border-t border-studio-border shrink-0 max-h-[45vh] overflow-hidden">
      {/* === Row 1: Transport + Scrubber + Timecode === */}
      <div className="flex items-center gap-3 shrink-0">
        <div className="flex items-center gap-1">
          <button onClick={() => setCurrentFrame(0)} className="inline-flex items-center justify-center h-7 w-7 rounded border border-studio-border bg-studio-bg hover:border-studio-accent/50 hover:bg-studio-border/40 transition-colors text-studio-muted" title="Skip to start">
            <SkipBack className="w-3.5 h-3.5" />
          </button>
          <button onClick={togglePlay} className="inline-flex items-center justify-center h-7 w-7 rounded border border-studio-accent bg-studio-accent hover:bg-studio-accentHover text-white transition-colors" title={isPlaying ? "Pause" : "Play"}>
            {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
          </button>
          <button onClick={handleStop} className="inline-flex items-center justify-center h-7 w-7 rounded border border-studio-border bg-studio-bg hover:border-studio-accent/50 hover:bg-studio-border/40 transition-colors text-studio-muted" title="Stop">
            <Square className="w-3.5 h-3.5" />
          </button>
          <button onClick={() => setCurrentFrame(durationFrames)} className="inline-flex items-center justify-center h-7 w-7 rounded border border-studio-border bg-studio-bg hover:border-studio-accent/50 hover:bg-studio-border/40 transition-colors text-studio-muted" title="Skip to end">
            <SkipForward className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Scrubber */}
        <div className="flex-1 flex items-center gap-2 min-w-0">
          <input
            type="range"
            min={0}
            max={durationFrames}
            step={1}
            value={currentFrameRounded}
            onChange={(e) => setCurrentFrame(parseInt(e.target.value, 10))}
            className="flex-1 accent-studio-accent"
          />
          <div className="flex items-baseline gap-1 shrink-0 tabular-nums">
            <span className="text-[11px] text-studio-text font-medium">{seconds}s</span>
            <span className="text-[9px] text-studio-muted/50">/ {totalSeconds}s</span>
            <span className="text-[9px] text-studio-muted/40 ml-1">f{currentFrameRounded}/{durationFrames}</span>
            <span className="text-[9px] text-studio-muted/30 ml-1">@ {fps}fps</span>
          </div>
        </div>
      </div>

      {/* === Multitrack timeline === */}
      <div className="flex-1 overflow-y-auto min-h-0 border border-studio-border/50 rounded-md">
        {/* Track header bar */}
        <div className="sticky top-0 z-10 flex items-center bg-studio-panel/95 backdrop-blur-sm border-b border-studio-border/50 px-1.5 py-0.5">
          <span className="text-[8px] text-studio-muted/50 uppercase tracking-wider w-28 shrink-0">Track</span>
          <span className="text-[8px] text-studio-muted/50 uppercase tracking-wider flex-1">Keyframes</span>
          <span className="text-[8px] text-studio-muted/30 uppercase tracking-wider w-8 text-right shrink-0">Keys</span>
        </div>

        {/* Camera track */}
        <TrackRow
          label="Camera"
          icon={Camera}
          color="#f59e0b"
          keyframes={keyframes.map((k) => k.frame)}
          durationFrames={durationFrames}
          currentFrame={currentFrameRounded}
          isActive={cameraSelected}
          onClick={() => selectCamera(true)}
          onKeyClick={(f) => setCurrentFrame(f)}
          onKeyDelete={(f) => removeKeyframeAtFrame(f)}
          keyCount={keyframes.length}
        />

        {/* Proxy tracks */}
        {proxies.map((p) => {
          const track = proxyKeyframes[p.id] ?? [];
          const Icon = KIND_ICON[p.kind] ?? Box;
          return (
            <TrackRow
              key={p.id}
              label={p.label}
              icon={Icon}
              color={p.color}
              keyframes={track.map((k) => k.frame)}
              durationFrames={durationFrames}
              currentFrame={currentFrameRounded}
              isActive={selectedProxyId === p.id}
              onClick={() => selectProxy(p.id)}
              onKeyClick={(f) => setCurrentFrame(f)}
              onKeyDelete={(f) => removeProxyKeyframe(p.id, f)}
              keyCount={track.length}
            />
          );
        })}
      </div>

      {/* === Row 3: Templates + Duration + Set Key === */}
      <div className="flex items-center gap-2 shrink-0">
        {/* Templates */}
        <div className="flex items-center gap-1">
          <span className="text-[8px] text-studio-muted/50 uppercase tracking-wider">Template</span>
          {TEMPLATES.map((p) => (
            <button
              key={p.id}
              onClick={() => applyPreset(p.id)}
              className={`flex items-center gap-1 px-2 py-1 rounded border text-[10px] font-medium transition-colors ${
                trajectory.preset === p.id && p.id !== "custom"
                  ? "border-studio-accent bg-studio-accent text-white"
                  : p.id === "custom"
                    ? "border-studio-border bg-studio-bg text-studio-muted hover:text-studio-danger hover:border-studio-danger/50"
                    : "border-studio-border bg-studio-bg text-studio-muted hover:border-studio-accent/50 hover:bg-studio-border/40"
              }`}
              title={p.desc}
            >
              <span className="text-[11px] leading-none">{p.icon}</span>
              {p.label}
            </button>
          ))}
        </div>

        <div className="w-px h-6 bg-studio-border mx-1" />

        {/* Duration */}
        <div className="flex items-center gap-1">
          <span className="text-[8px] text-studio-muted/50 uppercase tracking-wider hidden md:inline">Duration</span>
          {DURATIONS.map((d) => (
            <button
              key={d.frames}
              onClick={() => setDurationFrames(d.frames)}
              className={`px-2 py-1 rounded border text-[10px] font-medium tabular-nums transition-colors ${
                durationFrames === d.frames
                  ? "border-studio-accent bg-studio-accent/20 text-studio-accent"
                  : "border-studio-border bg-studio-bg text-studio-muted hover:border-studio-accent/50 hover:bg-studio-border/40"
              }`}
            >
              {d.label}
            </button>
          ))}
          {/* Custom duration input — type seconds, converts to frames */}
          <input
            type="number"
            min={1}
            max={120}
            step={1}
            value={Math.round(durationFrames / fps * 10) / 10}
            onChange={(e) => {
              const secs = parseFloat(e.target.value);
              if (!isNaN(secs) && secs > 0) setDurationFrames(Math.round(secs * fps));
            }}
            className="w-12 px-1.5 py-1 rounded border border-studio-border bg-studio-bg text-studio-text text-[10px] tabular-nums text-center focus:outline-none focus:border-studio-accent/50"
            title="Custom duration in seconds"
          />
          <span className="text-[8px] text-studio-muted/50">s</span>
        </div>

        <div className="w-px h-6 bg-studio-border mx-1" />

        {/* Set Keyframe */}
        <button
          onClick={handleSetKeyframe}
          disabled={!cameraSelected && !selectedProxyId}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded border text-[10px] font-semibold transition-colors ${
            !cameraSelected && !selectedProxyId
              ? "border-studio-border bg-studio-bg text-studio-muted/30 cursor-not-allowed"
              : hasKeyAtCurrent
                ? "border-studio-warning/30 bg-studio-warning/20 text-studio-warning"
                : "border-studio-accent/50 bg-studio-accent/15 text-studio-accent hover:bg-studio-accent/25"
          }`}
          title={hasKeyAtCurrent ? `Update keyframe at f${currentFrameRounded}` : "Set keyframe at current frame"}
        >
          <Plus className="w-3 h-3" />
          Set Key
          <span className="text-[8px] opacity-60 tabular-nums">f{currentFrameRounded}</span>
        </button>

        {/* Delete current keyframe */}
        {hasKeyAtCurrent && (
          <button
            onClick={() => {
              if (cameraSelected) removeKeyframeAtFrame(currentFrameRounded);
              else if (selectedProxyId) removeProxyKeyframe(selectedProxyId, currentFrameRounded);
            }}
            className="inline-flex items-center justify-center h-7 w-7 rounded border border-studio-border bg-studio-bg text-studio-danger/70 hover:text-studio-danger hover:border-studio-danger/50 hover:bg-studio-border/40 transition-colors"
            title="Delete keyframe at current frame"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        )}
      </div>
    </div>
  );
}

/** A single track row in the multitrack timeline. */
function TrackRow({
  label, icon: Icon, color, keyframes, durationFrames, currentFrame, isActive,
  onClick, onKeyClick, onKeyDelete, keyCount,
}: {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  keyframes: number[];
  durationFrames: number;
  currentFrame: number;
  isActive: boolean;
  onClick: () => void;
  onKeyClick: (frame: number) => void;
  onKeyDelete: (frame: number) => void;
  keyCount: number;
}) {
  return (
    <div
      onClick={onClick}
      className={`flex items-center gap-1 px-1.5 py-0.5 cursor-pointer transition-colors border-b border-studio-border/30 ${
        isActive ? "bg-studio-accent/10" : "hover:bg-studio-panelHover/50"
      }`}
    >
      {/* Track label */}
      <div className="flex items-center gap-1 w-28 shrink-0 min-w-0">
        <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
        <Icon className="w-2.5 h-2.5 text-studio-muted shrink-0" />
        <span className={`text-[9px] truncate ${isActive ? "text-studio-text font-medium" : "text-studio-muted"}`}>
          {label}
        </span>
      </div>

      {/* Keyframe diamonds */}
      <div className="flex-1 relative h-4 min-w-0">
        {keyframes.length === 0 ? (
          <span className="text-[8px] text-studio-muted/20 leading-4">—</span>
        ) : (
          keyframes.map((f, i) => {
            const isCurrent = f === currentFrame;
            const left = `${(f / durationFrames) * 100}%`;
            return (
              <button
                key={i}
                onClick={(e) => { e.stopPropagation(); onKeyClick(f); }}
                onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); onKeyDelete(f); }}
                className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 hover:scale-125 transition-transform"
                style={{ left }}
                title={`f${f}${isCurrent ? " (current)" : ""} — right-click to delete`}
              >
                <Diamond
                  className={`w-2.5 h-2.5 ${
                    isCurrent
                      ? "fill-white text-white drop-shadow-[0_0_3px_rgba(255,255,255,0.5)]"
                      : "fill-studio-accent text-studio-accent"
                  }`}
                />
              </button>
            );
          })
        )}
        {/* Current frame indicator */}
        <div
          className="absolute top-0 bottom-0 w-px bg-studio-accent/40 pointer-events-none"
          style={{ left: `${(currentFrame / durationFrames) * 100}%` }}
        />
      </div>

      {/* Key count */}
      <span className="text-[8px] text-studio-muted/40 tabular-nums w-8 text-right shrink-0">
        {keyCount}
      </span>
    </div>
  );
}
