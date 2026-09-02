"use client";

import { useState } from "react";
import {
  type ShotResponse,
  retakeVideo, checkShotVideoStatus,
} from "@/lib/api";
import {
  RotateCcw, Loader2, ChevronDown, ChevronRight,
} from "lucide-react";
import { useGenerationPolling } from "@/lib/useGenerationPolling";

interface RetakePanelProps {
  shot: ShotResponse;
  projectId: string;
  onRefresh: () => Promise<void>;
}

export function RetakePanel({ shot, projectId, onRefresh }: RetakePanelProps) {
  const [show, setShow] = useState(false);
  const [retakeStart, setRetakeStart] = useState(0);
  const [retakeEnd, setRetakeEnd] = useState(2);
  const [retakePrompt, setRetakePrompt] = useState("");
  const poll = useGenerationPolling();

  const handleRetake = async () => {
    if (!retakePrompt.trim() || !shot.video_clip_path) return;
    try {
      const resp = await retakeVideo(projectId, shot.id, retakeStart, retakeEnd, retakePrompt, "minimax_h3");
      if (resp.status === "failed") { poll.setError(resp.error_message || "Retake failed"); return; }
      const jobId = resp.job_id;

      poll.startPolling(
        () => checkShotVideoStatus(jobId, "minimax_h3"),
        async () => { setShow(false); await onRefresh(); },
        { intervalMs: 3000 }
      );
    } catch (err) {
      poll.setError(err instanceof Error ? err.message : "Retake failed");
    }
  };

  return (
    <div className="p-3 bg-studio-panel rounded-lg border border-studio-border">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-semibold flex items-center gap-1.5">
          <RotateCcw className="w-3.5 h-3.5 text-studio-accent" /> Retake Mode
        </h3>
        <div className="flex items-center gap-2">
          {poll.isRunning && <span className="text-[10px] text-studio-muted/70 tabular-nums">{poll.elapsedDisplay}</span>}
          <button onClick={() => setShow(!show)} className="p-1 rounded-lg hover:bg-studio-panelHover text-studio-muted hover:text-studio-accent transition-colors">
            {show ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>
      {show && (
        <div className="animate-fade-in space-y-2">
          <p className="text-[10px] text-studio-muted">Mark a time range and regenerate just that portion. The new segment is spliced back.</p>
          <div className="flex items-center gap-2">
            <label className="text-[10px] text-studio-muted">Start (s):</label>
            <input type="number" min={0} max={retakeEnd - 0.1} step={0.1} value={retakeStart} onChange={(e) => setRetakeStart(parseFloat(e.target.value))}
              className="w-16 bg-studio-bg border border-studio-border rounded-lg px-1.5 py-1 text-[10px] focus:border-studio-accent focus:outline-none" />
            <label className="text-[10px] text-studio-muted">End (s):</label>
            <input type="number" min={retakeStart + 0.1} step={0.1} value={retakeEnd} onChange={(e) => setRetakeEnd(parseFloat(e.target.value))}
              className="w-16 bg-studio-bg border border-studio-border rounded-lg px-1.5 py-1 text-[10px] focus:border-studio-accent focus:outline-none" />
          </div>
          <textarea value={retakePrompt} onChange={(e) => setRetakePrompt(e.target.value)} rows={2}
            className="w-full bg-studio-bg border border-studio-border rounded-lg p-1.5 text-[10px] focus:border-studio-accent focus:outline-none resize-none"
            placeholder="Describe what should happen in the retake segment..." />
          <button onClick={handleRetake} disabled={poll.isRunning || !retakePrompt.trim()}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-studio-accent hover:bg-studio-accentHover disabled:opacity-40 disabled:cursor-not-allowed text-white text-[10px] font-medium rounded-lg transition-all">
            {poll.isRunning ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCcw className="w-3 h-3" />}
            {poll.isRunning ? (poll.status || "Processing...") : "Generate Retake"}
          </button>
          {poll.error && <p className="text-[10px] text-studio-danger bg-studio-danger/10 p-1.5 rounded">{poll.error}</p>}
        </div>
      )}
      {!show && <p className="text-[10px] text-studio-muted">Regenerate a portion of the video and splice it back.</p>}
    </div>
  );
}
