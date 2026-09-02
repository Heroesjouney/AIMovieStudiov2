"use client";

import { useState } from "react";
import {
  type ShotResponse, updateShot,
  generateCameraAngles, checkAnglesStatus,
  CAMERA_ANGLE_PRESETS,
} from "@/lib/api";
import {
  Camera, Loader2, ChevronDown, ChevronRight,
} from "lucide-react";
import { useGenerationPolling } from "@/lib/useGenerationPolling";

interface MultiAnglePanelProps {
  shot: ShotResponse;
  projectId: string;
  prompt: string;
  onRefresh: () => Promise<void>;
}

export function MultiAnglePanel({ shot, projectId, prompt, onRefresh }: MultiAnglePanelProps) {
  const [show, setShow] = useState(false);
  const [selectedAngles, setSelectedAngles] = useState<string[]>([]);
  const poll = useGenerationPolling();

  const toggleAngle = (a: string) => setSelectedAngles((p) => p.includes(a) ? p.filter((x) => x !== a) : [...p, a]);

  const handleGenerate = async () => {
    if (!shot.frame_image_path || selectedAngles.length === 0) return;
    const boundRefPaths = (shot.assets || []).map((a: any) => a.image_path).filter(Boolean);

    try {
      const resp = await generateCameraAngles(
        shot.frame_image_path, selectedAngles, 1024, 1024, undefined, "qwen_multiangle", prompt, boundRefPaths
      );

      if (resp.sub_jobs) {
        const subJobs = resp.sub_jobs;
        const results: Record<string, string> = {};
        let done = 0;

        poll.startPolling(
          async () => {
            for (const sub of subJobs) {
              if (results[sub.angle]) continue;
              const st = await checkAnglesStatus(sub.sub_job_id, "qwen_multiangle");
              if (st.status === "completed" && st.image_urls?.[0]) { results[sub.angle] = st.image_urls[0]; done++; }
              else if (st.status === "failed") done++;
            }
            return { status: done >= subJobs.length ? "completed" : "processing", image_urls: [] };
          },
          async () => {
            await updateShot(projectId, shot.id, { angle_images: { ...(shot.angle_images || {}), ...results } });
            setSelectedAngles([]);
            await onRefresh();
          },
          { intervalMs: 3000 }
        );
      }
    } catch (err) {
      poll.setError(err instanceof Error ? err.message : "Failed");
    }
  };

  return (
    <div className="p-3 bg-studio-panel rounded-lg border border-studio-border">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-semibold flex items-center gap-1.5">
          <Camera className="w-3.5 h-3.5 text-studio-accent" /> Multi-Angle Generation
        </h3>
        <div className="flex items-center gap-2">
          {poll.isRunning && <span className="text-[10px] text-studio-muted/70 tabular-nums">{poll.elapsedDisplay}</span>}
          <button onClick={() => setShow(!show)} className="p-1 rounded-lg hover:bg-studio-panelHover text-studio-muted hover:text-studio-accent transition-colors">
            {show ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {show && (
        <div className="animate-fade-in">
          <p className="text-[10px] text-studio-muted mb-1.5">Select angles (Qwen Multiangle LoRA):</p>
          <div className="flex flex-wrap gap-1 mb-2">
            {CAMERA_ANGLE_PRESETS.map((p) => (
              <button key={p.value} onClick={() => toggleAngle(p.value)}
                className={`flex items-center gap-1 px-2 py-1 text-[10px] rounded-lg border transition-all ${
                  selectedAngles.includes(p.value) ? "border-studio-accent bg-studio-accent/15 text-studio-accent" : "border-studio-border hover:border-studio-accent/40 text-studio-muted"
                }`}>
                <span>{p.icon}</span>{p.label}
              </button>
            ))}
          </div>
          <div className="flex gap-2 mb-2">
            <button onClick={() => setSelectedAngles(CAMERA_ANGLE_PRESETS.map((p) => p.value))} className="text-[10px] text-studio-muted hover:text-studio-accent">Select All</button>
            <button onClick={() => setSelectedAngles([])} className="text-[10px] text-studio-muted hover:text-studio-accent">Clear</button>
            <button onClick={() => setSelectedAngles(["three_quarter_left", "three_quarter_right", "side_left", "side_right"])} className="text-[10px] text-studio-muted hover:text-studio-accent">Coverage Set</button>
            <button onClick={() => setSelectedAngles(["front", "back", "side_left", "side_right"])} className="text-[10px] text-studio-muted hover:text-studio-accent">360° Set</button>
          </div>
          <button onClick={handleGenerate} disabled={poll.isRunning || selectedAngles.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-studio-accent hover:bg-studio-accentHover disabled:opacity-40 disabled:cursor-not-allowed text-white text-[10px] font-medium rounded-lg transition-all">
            {poll.isRunning ? <Loader2 className="w-3 h-3 animate-spin" /> : <Camera className="w-3 h-3" />}
            {poll.isRunning ? (poll.status || "Working...") : `Generate ${selectedAngles.length} Angle${selectedAngles.length !== 1 ? "s" : ""}`}
          </button>
          {poll.error && <p className="mt-2 text-[10px] text-studio-danger bg-studio-danger/10 p-1.5 rounded">{poll.error}</p>}
        </div>
      )}

      {!show && <p className="text-[10px] text-studio-muted">Generate multiple camera angles from the current frame.</p>}
    </div>
  );
}
