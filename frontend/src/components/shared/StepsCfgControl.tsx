"use client";

import { SlidersHorizontal } from "lucide-react";

interface StepsCfgControlProps {
  steps: number | null;
  cfg: number | null;
  onStepsChange: (v: number | null) => void;
  onCfgChange: (v: number | null) => void;
  compact?: boolean;
}

export function StepsCfgControl({ steps, cfg, onStepsChange, onCfgChange, compact }: StepsCfgControlProps) {
  return (
    <div className={compact ? "space-y-2" : "space-y-3"}>
      <label className={`flex items-center gap-1.5 ${compact ? "text-[10px]" : "text-[11px]"} font-semibold text-studio-muted uppercase tracking-wider`}>
        <SlidersHorizontal className="w-3 h-3" />
        Steps & CFG
      </label>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] text-studio-muted">Steps</span>
            <span className="text-[10px] text-studio-muted/70 font-mono">{steps ?? "auto"}</span>
          </div>
          <input
            type="range"
            min={1}
            max={50}
            step={1}
            value={steps ?? 0}
            onChange={(e) => {
              const v = Number(e.target.value);
              onStepsChange(v === 0 ? null : v);
            }}
            className="w-full accent-studio-accent"
          />
        </div>
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] text-studio-muted">CFG Scale</span>
            <span className="text-[10px] text-studio-muted/70 font-mono">{cfg ?? "auto"}</span>
          </div>
          <input
            type="range"
            min={0}
            max={20}
            step={0.5}
            value={cfg ?? 0}
            onChange={(e) => {
              const v = Number(e.target.value);
              onCfgChange(v === 0 ? null : v);
            }}
            className="w-full accent-studio-accent"
          />
        </div>
      </div>
      <div className="flex gap-2">
        <button
          onClick={() => { onStepsChange(null); onCfgChange(null); }}
          className="text-[10px] text-studio-muted hover:text-studio-accent transition-colors"
        >
          Reset to auto
        </button>
      </div>
    </div>
  );
}
