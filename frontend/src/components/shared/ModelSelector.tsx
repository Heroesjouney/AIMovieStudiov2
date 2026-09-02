"use client";

import { ChevronDown } from "lucide-react";

interface DriverInfo {
  driver_id: string;
  display_name: string;
  category?: string;
  requires_api_key?: boolean;
  supported_features?: string[];
  description?: string;
}

interface ModelSelectorProps {
  drivers: DriverInfo[];
  value: string;
  onChange: (value: string) => void;
  filterFn?: (d: DriverInfo) => boolean;
  groupLabels?: { storyboard?: string; other?: string };
  compact?: boolean;
  showBadges?: boolean;
}

export function ModelSelector({
  drivers, value, onChange, filterFn, groupLabels, compact, showBadges,
}: ModelSelectorProps) {
  const filtered = filterFn ? drivers.filter(filterFn) : drivers;
  const storyboardIds = ["qwen_image_edit"];
  const storyboardDrivers = filtered.filter(
    (d) => storyboardIds.includes(d.driver_id) || d.supported_features?.includes("storyboard")
  );
  const otherDrivers = filtered.filter(
    (d) => !storyboardIds.includes(d.driver_id) && !d.supported_features?.includes("storyboard")
  );
  const current = filtered.find((d) => d.driver_id === value);

  return (
    <div>
      <div className="relative">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={`w-full bg-studio-panel border border-studio-border rounded-lg ${compact ? "px-2 py-1 text-[10px]" : "px-2.5 py-1.5 text-xs"} focus:border-studio-accent focus:outline-none appearance-none cursor-pointer`}
        >
          {storyboardDrivers.length > 0 && (
            <optgroup label={groupLabels?.storyboard || "Storyboard Models"}>
              {storyboardDrivers.map((d) => (
                <option key={d.driver_id} value={d.driver_id}>
                  {d.display_name}{d.requires_api_key ? " (requires API key)" : ""}
                </option>
              ))}
            </optgroup>
          )}
          {otherDrivers.length > 0 && (
            <optgroup label={groupLabels?.other || "Other Models"}>
              {otherDrivers.map((d) => (
                <option key={d.driver_id} value={d.driver_id}>
                  {d.display_name}{d.requires_api_key ? " (requires API key)" : ""}
                </option>
              ))}
            </optgroup>
          )}
        </select>
        <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-studio-muted">
          <ChevronDown className={compact ? "w-2.5 h-2.5" : "w-3 h-3"} />
        </div>
      </div>
      {showBadges && current && (
        <div className="flex flex-wrap gap-1 mt-1">
          <span className="px-1.5 py-0.5 text-[9px] rounded-full bg-studio-border/50 text-studio-muted">
            {current.category === "cloud" ? "Cloud" : "Local"}
          </span>
          {current.requires_api_key && (
            <span className="px-1.5 py-0.5 text-[9px] rounded-full bg-studio-border/50 text-studio-muted">API Key</span>
          )}
          {current.supported_features?.includes("image_to_image") && (
            <span className="px-1.5 py-0.5 text-[9px] rounded-full bg-studio-border/50 text-studio-muted">Img2Img</span>
          )}
        </div>
      )}
    </div>
  );
}
