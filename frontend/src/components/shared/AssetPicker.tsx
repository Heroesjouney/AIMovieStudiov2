"use client";

import { X } from "lucide-react";

interface AssetPickerProps {
  assets: { id: string; name: string; type: string; primary_image?: string }[];
  excludeIds?: Set<string>;
  onSelect: (asset: { id: string; name: string; type: string; primary_image?: string }) => void;
  onClose?: () => void;
  compact?: boolean;
}

export function AssetPicker({ assets, excludeIds, onSelect, onClose, compact }: AssetPickerProps) {
  const available = assets.filter((a) => !excludeIds?.has(a.id));

  return (
    <div className={`bg-studio-panel rounded-lg border border-studio-border animate-fade-in ${compact ? "p-2" : "p-3"} max-h-64 overflow-y-auto`}>
      {onClose && (
        <div className="flex justify-end mb-1">
          <button onClick={onClose} className="p-0.5 rounded hover:bg-studio-border text-studio-muted transition-colors">
            <X className="w-3 h-3" />
          </button>
        </div>
      )}
      {available.length > 0 ? (
        <div className={`grid ${compact ? "grid-cols-6" : "grid-cols-4"} gap-1.5`}>
          {available.map((asset) => (
            <button
              key={asset.id}
              onClick={() => onSelect(asset)}
              className="flex flex-col items-center gap-1 p-1.5 rounded-lg hover:bg-studio-bg border border-studio-border transition-all"
            >
              {asset.primary_image && (
                <img src={asset.primary_image} alt="" className="w-full aspect-square object-cover rounded" />
              )}
              <span className="text-[10px] truncate w-full text-center">{asset.name}</span>
              <span className="text-[9px] text-studio-muted capitalize">{asset.type}</span>
            </button>
          ))}
        </div>
      ) : (
        <p className="text-[10px] text-studio-muted text-center py-4">No assets available</p>
      )}
    </div>
  );
}
