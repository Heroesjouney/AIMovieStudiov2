"use client";

import { useState, useEffect } from "react";
import { useStudioStore } from "@/lib/store";
import {
  fetchScenes, createScene, updateScene, deleteScene,
  addSceneReferenceAsset, removeSceneReferenceAsset,
  type SceneResponse,
} from "@/lib/api";
import { Plus, Trash2, Film, Sun, Moon, Sunrise, Sunset, Building2, X, Layers, PanelLeftClose, PanelLeftOpen } from "lucide-react";

const TIME_OF_DAY_ICONS: Record<string, any> = {
  dawn: Sunrise,
  morning: Sun,
  day: Sun,
  golden_hour: Sunset,
  dusk: Sunset,
  night: Moon,
  interior: Building2,
};

const MOODS = ["neutral", "tense", "joyful", "melancholic", "mysterious", "action", "romantic", "horror"];
const TIMES = ["dawn", "morning", "day", "golden_hour", "dusk", "night", "interior"];
const LIGHTINGS = [
  { value: "natural", label: "Natural" },
  { value: "low_key", label: "Low-Key" },
  { value: "high_key", label: "High-Key" },
  { value: "rembrandt", label: "Rembrandt" },
  { value: "split", label: "Split" },
  { value: "backlit", label: "Backlit" },
  { value: "practical", label: "Practical" },
  { value: "chiaroscuro", label: "Chiaroscuro" },
  { value: "golden_hour", label: "Golden Hour" },
  { value: "blue_hour", label: "Blue Hour" },
  { value: "neon", label: "Neon" },
  { value: "moonlight", label: "Moonlight" },
];

export function ScenePanel({ projectId }: { projectId: string }) {
  const { scenes, setScenes, selectedSceneId, setSelectedSceneId } = useStudioStore();
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [dragOverRecipe, setDragOverRecipe] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  const refresh = async () => {
    const data = await fetchScenes(projectId);
    setScenes(data);
  };

  useEffect(() => { refresh(); }, [projectId]);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    await createScene(projectId, newName, newDesc);
    setNewName("");
    setNewDesc("");
    setShowCreate(false);
    await refresh();
  };

  const handleDelete = async (sceneId: string) => {
    if (!confirm("Delete this scene and unbind its shots?")) return;
    await deleteScene(projectId, sceneId);
    if (selectedSceneId === sceneId) setSelectedSceneId(null);
    await refresh();
  };

  const selectedScene = scenes.find((s) => s.id === selectedSceneId);
  const recipeAssetIds = new Set((selectedScene?.reference_assets || []).map((a) => a.asset_id));

  const handleRemoveRecipeAsset = async (assetId: string) => {
    if (!selectedScene) return;
    await removeSceneReferenceAsset(projectId, selectedScene.id, assetId);
    await refresh();
  };

  return (
    <div className={`border-r border-studio-border shrink-0 bg-studio-panel/30 transition-all duration-200 ${collapsed ? "w-10" : "w-64"} overflow-hidden`}>
      <div className="flex items-center justify-between p-2">
        {!collapsed && (
          <h2 className="text-xs font-semibold text-studio-muted uppercase tracking-wider">Scenes</h2>
        )}
        <div className="flex items-center gap-1">
          {!collapsed && (
            <button
              onClick={() => setShowCreate(!showCreate)}
              className="p-1.5 rounded-lg hover:bg-studio-panelHover text-studio-muted hover:text-studio-accent transition-colors"
              title="New scene"
            >
              <Plus className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="p-1.5 rounded-lg hover:bg-studio-panelHover text-studio-muted hover:text-studio-accent transition-colors"
            title={collapsed ? "Expand scenes" : "Collapse scenes"}
          >
            {collapsed ? <PanelLeftOpen className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {collapsed ? (
        <div className="flex flex-col items-center gap-2 pt-2">
          <Film className="w-4 h-4 text-studio-muted/50" />
          {scenes.length > 0 && (
            <span className="text-[9px] text-studio-muted/50 vertical-text">{scenes.length}</span>
          )}
        </div>
      ) : (
        <div className="overflow-y-auto px-3 pb-3" style={{ maxHeight: "calc(100% - 48px)" }}>

      {showCreate && (
        <div className="mb-3 p-3 bg-studio-panel rounded-xl border border-studio-border animate-fade-in">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Scene name..."
            className="w-full bg-studio-bg border border-studio-border rounded-lg p-2 text-xs mb-2 focus:border-studio-accent focus:ring-2 focus:ring-studio-accent/20 focus:outline-none"
            onKeyDown={(e) => e.key === "Enter" && handleCreate()}
          />
          <textarea
            value={newDesc}
            onChange={(e) => setNewDesc(e.target.value)}
            placeholder="Description..."
            rows={2}
            className="w-full bg-studio-bg border border-studio-border rounded-lg p-2 text-xs mb-2 focus:border-studio-accent focus:ring-2 focus:ring-studio-accent/20 focus:outline-none resize-none"
          />
          <button
            onClick={handleCreate}
            className="w-full py-1.5 bg-studio-accent hover:bg-studio-accentHover text-white text-xs font-medium rounded-lg transition-colors"
          >
            Create Scene
          </button>
        </div>
      )}

      <div className="space-y-2">
        {scenes.map((scene) => {
          const TimeIcon = TIME_OF_DAY_ICONS[scene.time_of_day] || Sun;
          const isSelected = selectedSceneId === scene.id;
          return (
            <div key={scene.id}>
              <div
                onClick={() => setSelectedSceneId(isSelected ? null : scene.id)}
                className={`group relative p-2.5 rounded-xl border cursor-pointer transition-all ${
                  isSelected
                    ? "border-studio-accent bg-studio-accent/10"
                    : "border-studio-border hover:border-studio-accent/40 hover:bg-studio-panel/50"
                }`}
              >
                <div className="flex items-start gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-studio-bg flex items-center justify-center shrink-0">
                    <TimeIcon className="w-4 h-4 text-studio-muted" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium truncate">{scene.name}</p>
                    <p className="text-[10px] text-studio-muted truncate">{scene.mood} · {scene.time_of_day}</p>
                    {scene.defaults?.hero_cast_id && (
                      <p className="text-[10px] text-studio-accent/70 mt-0.5">Hero set</p>
                    )}
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDelete(scene.id); }}
                    className="opacity-0 group-hover:opacity-100 p-1 rounded-lg hover:bg-studio-danger/20 text-studio-danger transition-all"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>

              {isSelected && (
                <div className="mt-1 ml-2 p-3 bg-studio-panel rounded-xl border border-studio-border/50 animate-fade-in space-y-3">
                  {/* Recipe Assets - drag and drop */}
                  <div>
                    <label className="text-[10px] text-studio-muted uppercase tracking-wider flex items-center gap-1 mb-1.5">
                      <Layers className="w-3 h-3" /> Recipe Assets
                    </label>
                    <div
                      onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; setDragOverRecipe(true); }}
                      onDragLeave={() => setDragOverRecipe(false)}
                      onDrop={(e) => {
                        e.preventDefault();
                        setDragOverRecipe(false);
                        try {
                          const data = JSON.parse(e.dataTransfer.getData("application/json"));
                          if (data.id && !recipeAssetIds.has(data.id)) {
                            addSceneReferenceAsset(projectId, scene.id, {
                              asset_id: data.id,
                              asset_type: data.type,
                              asset_name: data.name,
                              image_path: data.primary_image || null,
                            }).then(refresh);
                          }
                        } catch {}
                      }}
                      className={`min-h-[60px] rounded-lg border-2 border-dashed p-2 transition-all ${
                        dragOverRecipe
                          ? "border-studio-accent bg-studio-accent/10"
                          : "border-studio-border bg-studio-bg/50"
                      }`}
                    >
                      {(scene.reference_assets || []).length > 0 ? (
                        <div className="flex flex-wrap gap-1.5">
                          {(scene.reference_assets || []).map((ref) => (
                            <div key={ref.asset_id} className="group flex items-center gap-1 px-1.5 py-1 bg-studio-bg rounded-lg border border-studio-border text-[10px]">
                              {ref.image_path && <img src={ref.image_path} alt="" className="w-5 h-5 rounded object-cover" />}
                              <span className="truncate max-w-[70px]">{ref.asset_name}</span>
                              <span className="text-[8px] text-studio-muted capitalize">{ref.asset_type}</span>
                              <button
                                onClick={() => handleRemoveRecipeAsset(ref.asset_id)}
                                className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-studio-danger/20 text-studio-danger transition-all"
                              >
                                <X className="w-2.5 h-2.5" />
                              </button>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="flex flex-col items-center justify-center py-3 text-center">
                          <Layers className={`w-5 h-5 mb-1 ${dragOverRecipe ? "text-studio-accent" : "text-studio-muted/40"}`} />
                          <p className={`text-[10px] ${dragOverRecipe ? "text-studio-accent" : "text-studio-muted"}`}>
                            {dragOverRecipe ? "Drop to add to recipe" : "Drag assets here to build the recipe"}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>

                  <div>
                    <label className="text-[10px] text-studio-muted uppercase tracking-wider mb-1 block">Time of Day</label>
                    <div className="flex flex-wrap gap-1">
                      {TIMES.map((t) => {
                        const TimeIcon = TIME_OF_DAY_ICONS[t] || Sun;
                        return (
                          <button
                            key={t}
                            onClick={() => updateScene(projectId, scene.id, { time_of_day: t }).then(refresh)}
                            className={`flex items-center gap-1 px-2 py-1 text-[10px] rounded-lg border transition-all ${
                              scene.time_of_day === t
                                ? "border-studio-accent bg-studio-accent/15 text-studio-accent"
                                : "border-studio-border text-studio-muted hover:text-studio-text hover:border-studio-accent/40"
                            }`}
                          >
                            <TimeIcon className="w-2.5 h-2.5" />
                            {t.replace("_", " ")}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] text-studio-muted uppercase tracking-wider mb-1 block">Mood</label>
                    <div className="flex flex-wrap gap-1">
                      {MOODS.map((m) => (
                        <button
                          key={m}
                          onClick={() => updateScene(projectId, scene.id, { mood: m }).then(refresh)}
                          className={`px-2 py-1 text-[10px] rounded-lg border transition-all capitalize ${
                            scene.mood === m
                              ? "border-studio-accent bg-studio-accent/15 text-studio-accent"
                              : "border-studio-border text-studio-muted hover:text-studio-text hover:border-studio-accent/40"
                          }`}
                        >
                          {m}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] text-studio-muted uppercase tracking-wider mb-1 block">Lighting</label>
                    <div className="flex flex-wrap gap-1">
                      {LIGHTINGS.map((l) => (
                        <button
                          key={l.value}
                          onClick={() => updateScene(projectId, scene.id, { lighting: l.value }).then(refresh)}
                          className={`px-2 py-1 text-[10px] rounded-lg border transition-all ${
                            scene.lighting === l.value
                              ? "border-studio-accent bg-studio-accent/15 text-studio-accent"
                              : "border-studio-border text-studio-muted hover:text-studio-text hover:border-studio-accent/40"
                          }`}
                        >
                          {l.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
        {scenes.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="w-12 h-12 rounded-full bg-studio-border/50 flex items-center justify-center mb-3">
              <Film className="w-6 h-6 text-studio-muted/50" />
            </div>
            <p className="text-xs text-studio-muted">No scenes yet</p>
            <p className="text-xs text-studio-muted/50 mt-1">Create a scene to group shots</p>
          </div>
        )}
        </div>
        </div>
      )}
    </div>
  );
}
