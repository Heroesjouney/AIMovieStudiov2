"use client";

import { useStudioStore } from "@/lib/store";
import { ShotDetail } from "@/components/shots/ShotDetail";
import { CameraDirector } from "@/components/camera/CameraDirector";
import { DialoguePanel } from "@/components/timeline/DialoguePanel";
import { GenerationPanel } from "@/components/studio/GenerationPanel";
import {
  Clapperboard, Camera, Mic, Sparkles, X, ChevronDown, ChevronUp,
} from "lucide-react";

const INSPECTOR_TABS = [
  { id: "generate" as const, label: "Assets", icon: Sparkles },
  { id: "shot" as const, label: "Shot", icon: Clapperboard },
  { id: "camera" as const, label: "Camera", icon: Camera },
  { id: "audio" as const, label: "Audio", icon: Mic },
];

export function InspectorPanel({ projectId }: { projectId: string }) {
  const {
    activeInspector, setActiveInspector,
    selectedShotId, shots, setSelectedShotId,
  } = useStudioStore();

  const sortedShots = [...shots].sort((a, b) => (a.sequence_order ?? 0) - (b.sequence_order ?? 0));
  const selectedShot = sortedShots.find((s) => s.id === selectedShotId);

  return (
    <div className="h-full flex flex-col bg-studio-panel/30 border-l border-studio-border">
      {/* Inspector tab bar */}
      <div className="flex items-center gap-0.5 px-2 pt-2 pb-1 border-b border-studio-border bg-studio-panel/50 shrink-0">
        {INSPECTOR_TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeInspector === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveInspector(tab.id)}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-medium rounded-lg transition-all ${
                isActive
                  ? "bg-studio-accent text-white"
                  : "text-studio-muted hover:text-studio-text hover:bg-studio-panelHover"
              }`}
            >
              <Icon className="w-3 h-3" />
              {tab.label}
            </button>
          );
        })}
        <div className="ml-auto flex items-center gap-1">
          {selectedShot && activeInspector === "shot" && (
            <button
              onClick={() => setSelectedShotId(null)}
              className="p-1 rounded-lg hover:bg-studio-panelHover text-studio-muted hover:text-studio-danger transition-colors"
              title="Close shot"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Inspector content */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {activeInspector === "shot" && selectedShot && (
          <ShotDetail
            shot={selectedShot}
            projectId={projectId}
            allShots={sortedShots}
            onRefresh={async () => {
              const { fetchShots } = await import("@/lib/api");
              const fresh = await fetchShots(projectId);
              useStudioStore.getState().setShots(fresh);
            }}
            onClose={() => setSelectedShotId(null)}
          />
        )}
        {activeInspector === "shot" && !selectedShot && (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-center px-4">
            <Clapperboard className="w-8 h-8 text-studio-muted/30" />
            <p className="text-xs text-studio-muted">Select a shot from the storyboard</p>
          </div>
        )}
        {activeInspector === "camera" && <CameraDirector projectId={projectId} />}
        {activeInspector === "audio" && <DialoguePanel projectId={projectId} />}
        {activeInspector === "generate" && <GenerationPanel projectId={projectId} />}
      </div>
    </div>
  );
}
