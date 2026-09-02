"use client";

import { useState } from "react";
import { useStudioStore } from "@/lib/store";
import {
  type ShotResponse, updateShot,
  generateShotVariation, checkShotFrameStatus as checkVariationStatus,
} from "@/lib/api";
import {
  Wand2, Loader2, ChevronDown, ChevronRight, Copy,
} from "lucide-react";
import { useGenerationPolling } from "@/lib/useGenerationPolling";

const VARIATION_PRESETS = [
  { id: "wide", label: "Wide Shot", prompt: "wider shot of the same scene, pull back camera, show more of the environment", shot_type: "wide" },
  { id: "close_up", label: "Close Up", prompt: "close up shot of the same scene, tighten framing on the subject", shot_type: "close_up" },
  { id: "over_shoulder", label: "Over Shoulder", prompt: "over the shoulder shot of the same scene, looking from behind the character", shot_type: "over_the_shoulder" },
  { id: "low_angle", label: "Low Angle", prompt: "low angle shot of the same scene, camera looking up, dramatic perspective", shot_type: "medium" },
  { id: "high_angle", label: "High Angle", prompt: "high angle shot of the same scene, camera looking down from above", shot_type: "aerial" },
  { id: "pov", label: "POV Shot", prompt: "point of view shot, first person perspective of the character in the scene", shot_type: "pov" },
  { id: "action", label: "Action Beat", prompt: "same scene but now showing an action moment, dynamic movement, energy and motion", shot_type: "medium" },
  { id: "reaction", label: "Reaction", prompt: "same scene but now showing a character reaction shot, facial expression close-up", shot_type: "close_up" },
];

interface VariationPanelProps {
  shot: ShotResponse;
  projectId: string;
  onRefresh: () => Promise<void>;
}

export function VariationPanel({ shot, projectId, onRefresh }: VariationPanelProps) {
  const { selectedImageDriver } = useStudioStore();
  const [show, setShow] = useState(false);
  const [variationPrompt, setVariationPrompt] = useState("");
  const [variationName, setVariationName] = useState("");
  const poll = useGenerationPolling();

  const handleGenerate = async (presetPrompt?: string, presetShotType?: string) => {
    const p = presetPrompt || variationPrompt;
    if (!p.trim() || !shot.frame_image_path) return;
    const name = variationName.trim() || `${shot.name} - Variation`;

    try {
      const resp = await generateShotVariation(
        projectId, shot.id, name, p, presetShotType || "medium", selectedImageDriver,
      );

      if (resp.generation.status === "failed") {
        poll.setError(resp.generation.error_message || "Variation failed");
        return;
      }

      const jobId = resp.generation.job_id;
      poll.startPolling(
        () => checkVariationStatus(jobId, selectedImageDriver),
        async (st) => {
          const imageUrl = st.image_urls?.[0] || "";
          if (imageUrl && resp.shot.id) {
            await updateShot(projectId, resp.shot.id, {
              frame_image_path: imageUrl,
              status: "frame_generated",
            });
          }
          setVariationPrompt(""); setVariationName("");
          await onRefresh();
        },
        { intervalMs: 2000 }
      );
    } catch (err) {
      poll.setError(err instanceof Error ? err.message : "Failed");
    }
  };

  return (
    <div className="p-3 bg-studio-panel rounded-lg border border-studio-border">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-semibold flex items-center gap-1.5">
          <Wand2 className="w-3.5 h-3.5 text-studio-accent" /> Build Scene in Frames
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
          <p className="text-[10px] text-studio-muted">Generate new shots from this frame with different angles, compositions, and actions:</p>
          <div className="flex flex-wrap gap-1">
            {VARIATION_PRESETS.map((preset) => (
              <button
                key={preset.id}
                onClick={() => handleGenerate(preset.prompt, preset.shot_type)}
                disabled={poll.isRunning}
                className="flex items-center gap-1 px-2 py-1 text-[10px] rounded-lg border border-studio-border hover:border-studio-accent/40 hover:bg-studio-accent/5 text-studio-muted hover:text-studio-text transition-all disabled:opacity-40"
              >
                <Copy className="w-2.5 h-2.5" />
                {preset.label}
              </button>
            ))}
          </div>

          <div className="pt-2 border-t border-studio-border/50">
            <label className="block text-[10px] font-semibold text-studio-muted uppercase tracking-wider mb-1">Custom Variation</label>
            <input
              value={variationName}
              onChange={(e) => setVariationName(e.target.value)}
              className="w-full bg-studio-bg border border-studio-border rounded-lg p-1.5 text-[10px] mb-1.5 focus:border-studio-accent focus:outline-none"
              placeholder="Shot name (e.g. 'Scene 1 - Low Angle')"
            />
            <textarea
              value={variationPrompt}
              onChange={(e) => setVariationPrompt(e.target.value)}
              rows={2}
              className="w-full bg-studio-bg border border-studio-border rounded-lg p-1.5 text-[10px] mb-1.5 focus:border-studio-accent focus:outline-none resize-none"
              placeholder="Describe the variation (e.g. 'same scene but character is now running')"
            />
            <button
              onClick={() => handleGenerate()}
              disabled={poll.isRunning || !variationPrompt.trim()}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-studio-accent hover:bg-studio-accentHover disabled:opacity-40 disabled:cursor-not-allowed text-white text-[10px] font-medium rounded-lg transition-all"
            >
              {poll.isRunning ? <Loader2 className="w-3 h-3 animate-spin" /> : <Wand2 className="w-3 h-3" />}
              {poll.isRunning ? (poll.status || "Generating...") : "Generate Variation"}
            </button>
          </div>
          {poll.error && <p className="text-[10px] text-studio-danger bg-studio-danger/10 p-1.5 rounded">{poll.error}</p>}
        </div>
      )}

      {!show && <p className="text-[10px] text-studio-muted">Create new shots from this frame with different angles and actions.</p>}
    </div>
  );
}
