"use client";

import { useState, useEffect, useCallback } from "react";
import { fetchModels, type ModelInfo } from "@/lib/api";
import { ChevronDown, Box } from "lucide-react";

interface CheckpointOverrideProps {
  value: string;
  onChange: (checkpoint: string) => void;
  compact?: boolean;
}

/**
 * Dropdown that lists all checkpoint/UNet models from ComfyUI's models directory.
 * When a value is selected, it overrides the default model in the workflow.
 * Leave empty to use the workflow's built-in model.
 */
export function CheckpointOverride({ value, onChange, compact }: CheckpointOverrideProps) {
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [loading, setLoading] = useState(false);

  const loadModels = useCallback(async () => {
    setLoading(true);
    try {
      const resp = await fetchModels();
      setModels(resp.models);
    } catch {
      setModels([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadModels();
  }, [loadModels]);

  if (loading && models.length === 0) {
    return (
      <div className={`text-[10px] text-studio-muted/50 ${compact ? "" : "py-1"}`}>
        Loading models...
      </div>
    );
  }

  if (models.length === 0) return null;

  return (
    <div>
      <label className="flex items-center gap-1.5 text-[10px] font-semibold text-studio-muted uppercase tracking-wider mb-1">
        <Box className="w-3 h-3" />
        Model Override
      </label>
      <div className="relative">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={`w-full bg-studio-panel border border-studio-border rounded-lg appearance-none cursor-pointer focus:border-studio-accent focus:outline-none ${
            compact ? "px-2 py-1 text-[10px]" : "px-2.5 py-1.5 text-xs"
          }`}
        >
          <option value="">Default (workflow built-in)</option>
          {models.map((m) => (
            <option key={m.name} value={m.name}>
              {m.name}
            </option>
          ))}
        </select>
        <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-studio-muted">
          <ChevronDown className={compact ? "w-2.5 h-2.5" : "w-3 h-3"} />
        </div>
      </div>
      <p className="text-[9px] text-studio-muted/40 mt-0.5">
        Swap the model file (e.g. use a smaller/faster version)
      </p>
    </div>
  );
}
