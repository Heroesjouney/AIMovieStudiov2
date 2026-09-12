"use client";

import { Maximize } from "lucide-react";

interface MegapixelsControlProps {
  megapixels: number | null;
  onChange: (v: number | null) => void;
  compact?: boolean;
  disabled?: boolean;
}

export function MegapixelsControl({ megapixels, onChange, compact, disabled }: MegapixelsControlProps) {
  return (
    <div className={compact ? "space-y-1.5" : "space-y-2"}>
      <label className={`flex items-center gap-1.5 ${compact ? "text-[10px]" : "text-[11px]"} font-semibold text-studio-muted uppercase tracking-wider`}>
        <Maximize className="w-3 h-3" />
        Resolution (MP)
        {disabled && <span className="normal-case opacity-40 font-normal">(not supported by this model)</span>}
      </label>
      <div className={disabled ? "opacity-30 pointer-events-none" : ""}>
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] text-studio-muted">Megapixels</span>
          <span className="text-[10px] text-studio-muted/70 font-mono">{megapixels ?? "auto"}</span>
        </div>
        <input
          type="range"
          min={0}
          max={4}
          step={0.1}
          value={megapixels ?? 0}
          onChange={(e) => {
            const v = Number(e.target.value);
            onChange(v === 0 ? null : v);
          }}
          disabled={disabled}
          className="w-full accent-studio-accent"
        />
        <div className="flex justify-between text-[9px] text-studio-muted/40 mt-0.5">
          <span>auto</span>
          <span>0.5</span>
          <span>1.0</span>
          <span>2.0</span>
          <span>4.0</span>
        </div>
      </div>
    </div>
  );
}
