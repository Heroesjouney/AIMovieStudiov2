"use client";

import { Link2, X } from "lucide-react";

interface ShotFrameLinkerProps {
  shots: { id: string; name: string; frame_image_path?: string | null }[];
  excludeId?: string;
  linkedPaths: string[];
  onLink: (path: string) => void;
  onUnlink: (index: number) => void;
  show: boolean;
  onToggle: () => void;
}

export function ShotFrameLinker({
  shots, excludeId, linkedPaths, onLink, onUnlink, show, onToggle,
}: ShotFrameLinkerProps) {
  const availableShots = shots
    .filter((s) => s.frame_image_path && s.id !== excludeId)
    .sort((a, b) => (a.name || "").localeCompare(b.name || ""));

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <label className="text-[10px] font-semibold text-studio-muted uppercase tracking-wider flex items-center gap-1.5">
          <Link2 className="w-3 h-3" />
          Linked References {linkedPaths.length > 0 && `(${linkedPaths.length})`}
        </label>
        <button
          onClick={onToggle}
          className="text-[10px] text-studio-accent hover:text-studio-accentHover transition-colors"
        >
          {show ? "Done" : "Add"}
        </button>
      </div>

      {linkedPaths.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {linkedPaths.map((p, i) => (
            <div key={i} className="relative group">
              <img src={p} alt="ref" className="w-12 h-12 rounded-lg object-cover border border-studio-border" />
              <button
                onClick={() => onUnlink(i)}
                className="absolute -top-1 -right-1 p-0.5 rounded-full bg-studio-danger text-white opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <X className="w-2.5 h-2.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {show && (
        <div className="p-2 bg-studio-bg rounded-lg border border-studio-border max-h-48 overflow-y-auto">
          <div className="grid grid-cols-10 gap-0.5">
            {availableShots.map((s) => (
              <button
                key={s.id}
                onClick={() => s.frame_image_path && onLink(s.frame_image_path)}
                className={`rounded overflow-hidden border transition-all ${
                  linkedPaths.includes(s.frame_image_path!)
                    ? "border-studio-accent ring-1 ring-studio-accent/40"
                    : "border-studio-border hover:border-studio-accent/40"
                }`}
                title={s.name}
              >
                <img src={s.frame_image_path!} alt={s.name} className="w-full aspect-video object-cover" />
              </button>
            ))}
          </div>
          {availableShots.length === 0 && (
            <p className="text-[10px] text-studio-muted text-center py-2">No frames available to link</p>
          )}
        </div>
      )}
    </div>
  );
}
