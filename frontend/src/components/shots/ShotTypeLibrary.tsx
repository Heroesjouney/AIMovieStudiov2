"use client";

import { CINEMATIC_PRESETS, type CinematicPreset } from "@/lib/cinematicPresets";

interface ShotTypeLibraryProps {
  onSelect: (preset: CinematicPreset) => void;
  selectedPresetId?: string;
}

function ShotIllustration({ preset }: { preset: CinematicPreset }) {
  const h = preset.horizontalAngle;
  const v = preset.verticalAngle;
  const z = preset.zoom;

  // Camera position on a 32x32 mini compass
  const hRad = (h * Math.PI) / 180;
  const vRad = (v * Math.PI) / 180;
  const dist = 14 - (z / 10) * 8;
  const cx = 16 + dist * Math.sin(hRad) * Math.cos(vRad);
  const cy = 16 - dist * Math.cos(hRad) * Math.cos(vRad) + (v > 0 ? (v / 60) * 4 : (v / 30) * 4);

  return (
    <svg viewBox="0 0 32 32" className="w-full h-full">
      {/* Compass circle */}
      <circle cx="16" cy="16" r="14" fill="#111827" stroke="#374151" strokeWidth="0.5" />
      {/* Cross hairs */}
      <line x1="16" y1="2" x2="16" y2="30" stroke="#374151" strokeWidth="0.3" />
      <line x1="2" y1="16" x2="30" y2="16" stroke="#374151" strokeWidth="0.3" />
      {/* Subject dot */}
      <circle cx="16" cy="16" r="2" fill="#9ca3af" />
      {/* Front indicator */}
      <text x="16" y="5" fill="#ef4444" fontSize="3" textAnchor="middle" fontWeight="bold">F</text>
      {/* Camera position */}
      <line x1="16" y1="16" x2={cx} y2={cy} stroke="#f59e0b" strokeWidth="0.5" strokeDasharray="1,1" opacity="0.6" />
      <circle cx={cx} cy={cy} r="1.8" fill="#f59e0b" />
      {/* Camera direction cone */}
      <circle cx={cx} cy={cy} r="3" fill="#f59e0b" opacity="0.15" />
    </svg>
  );
}

export function ShotTypeLibrary({ onSelect, selectedPresetId }: ShotTypeLibraryProps) {
  const categories: { key: CinematicPreset["category"]; label: string }[] = [
    { key: "basic", label: "Basic" },
    { key: "advanced", label: "Advanced" },
    { key: "coverage", label: "Coverage" },
  ];

  return (
    <div className="flex flex-col gap-2">
      {categories.map((cat) => {
        const presets = CINEMATIC_PRESETS.filter((p) => p.category === cat.key);
        if (presets.length === 0) return null;
        return (
          <div key={cat.key}>
            <div className="text-[8px] font-semibold text-studio-muted uppercase tracking-wider mb-1">
              {cat.label}
            </div>
            <div className="grid grid-cols-4 gap-1">
              {presets.map((p) => (
                <button
                  key={p.id}
                  onClick={() => onSelect(p)}
                  title={p.description}
                  className={`flex flex-col items-center gap-0.5 p-1 rounded border transition-colors ${
                    selectedPresetId === p.id
                      ? "border-studio-accent bg-studio-accent/10"
                      : "border-studio-border bg-studio-bg hover:border-studio-accent/50"
                  }`}
                >
                  <div className="w-8 h-8">
                    <ShotIllustration preset={p} />
                  </div>
                  <span className="text-[7px] text-studio-text leading-tight text-center">
                    {p.label}
                  </span>
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
