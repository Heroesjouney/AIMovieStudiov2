"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useStudioStore } from "@/lib/store";
import {
  fetchShots, createShot, deleteShot, reorderShots,
  generateShotFrame, checkShotFrameStatus, updateShot, updateScene,
  type ShotResponse, type SceneResponse,
} from "@/lib/api";
import { ScenePanel } from "./ScenePanel";
import { ShotDetail } from "./ShotDetail";
import {
  Plus, Trash2, Clapperboard, GripVertical, Camera, Layers, Sparkles,
  Loader2, X, RefreshCw,
} from "lucide-react";

const SHOT_TYPES = [
  { value: "wide", label: "Wide Shot" },
  { value: "medium", label: "Medium Shot" },
  { value: "close_up", label: "Close Up" },
  { value: "over_the_shoulder", label: "Over Shoulder" },
  { value: "establishing", label: "Establishing" },
  { value: "insert", label: "Insert" },
  { value: "pov", label: "POV" },
  { value: "two_shot", label: "Two Shot" },
];

export function ShotComposer({ projectId }: { projectId: string }) {
  const {
    shots, setShots, selectedShotId, setSelectedShotId, selectedSceneId,
    scenes, imageDrivers, selectedImageDriver, setSelectedImageDriver,
    assets,
  } = useStudioStore();

  const [showCreate, setShowCreate] = useState(false);
  const [newPrompt, setNewPrompt] = useState("");
  const [newShotType, setNewShotType] = useState("medium");
  const [creating, setCreating] = useState(false);
  const [createStatus, setCreateStatus] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  const [regeneratingId, setRegeneratingId] = useState<string | null>(null);
  const [newShotAssets, setNewShotAssets] = useState<any[]>([]);
  const [showAssetPicker, setShowAssetPicker] = useState(false);

  // Drag-and-drop state
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const reorderTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Clean up any active polling on unmount
  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, []);

  const refresh = useCallback(async () => {
    const data = await fetchShots(projectId, selectedSceneId || undefined);
    setShots(data);
  }, [projectId, selectedSceneId, setShots]);

  useEffect(() => { refresh(); }, [projectId, selectedSceneId]);

  // Sort shots by sequence_order for display
  const sortedShots = [...shots].sort((a, b) => (a.sequence_order ?? 0) - (b.sequence_order ?? 0));
  const selectedShot = sortedShots.find((s) => s.id === selectedShotId);
  const selectedScene = scenes.find((s) => s.id === selectedSceneId);
  const sceneRecipeCount = (selectedScene?.reference_assets || []).length;
  const sceneHasEstablishing = !!(selectedScene?.establishing_frame_path);
  const sceneShotCount = selectedSceneId ? sortedShots.filter((s) => s.scene_id === selectedSceneId).length : 0;
  const isFirstShotInScene = !!selectedSceneId && sceneShotCount === 0;

  // Assets available to add (have a primary image, not already in newShotAssets)
  const sceneRecipeAssetIds = new Set((selectedScene?.reference_assets || []).map((a: any) => a.asset_id));
  const availableAssets = assets.filter((a) => a.primary_image && !newShotAssets.some((na) => na.asset_id === a.id));
  const extraAssetCount = newShotAssets.filter((a) => !sceneRecipeAssetIds.has(a.asset_id)).length;

  const handleCreateAndGenerate = async () => {
    if (!newPrompt.trim()) return;
    setCreating(true); setCreateError(null); setCreateStatus("Creating shot...");

    try {
      const shotName = newPrompt.slice(0, 40) + (newPrompt.length > 40 ? "..." : "");
      const shot = await createShot(projectId, shotName, newPrompt, selectedSceneId || undefined);
      await refresh();

      // Bind additional assets to the shot (on top of scene recipe)
      if (newShotAssets.length > 0) {
        await updateShot(projectId, shot.id, { assets: newShotAssets });
      }

      setCreateStatus("Generating frame...");
      const refPaths = newShotAssets.map((a: any) => a.image_path).filter(Boolean);

      // Force first shot in scene to be a wide establishing shot
      const effectiveShotType = isFirstShotInScene ? "establishing" : newShotType;
      const shotTypeLabel = SHOT_TYPES.find((t) => t.value === effectiveShotType)?.label || "Medium Shot";
      const fullPrompt = isFirstShotInScene
        ? `Wide establishing shot. ${newPrompt}`
        : `${shotTypeLabel}. ${newPrompt}`;

      const resp = await generateShotFrame(shot.id, fullPrompt, selectedImageDriver, undefined, 1344, 768, undefined, refPaths);
      if (resp.status === "failed") {
        setCreateError(resp.error_message || "Generation failed");
        setCreating(false); setCreateStatus("");
        return;
      }

      // Clear any existing polling interval before starting a new one
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);

      pollIntervalRef.current = setInterval(async () => {
        try {
          const st = await checkShotFrameStatus(resp.job_id, selectedImageDriver);
          if (st.status === "completed") {
            if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
            pollIntervalRef.current = null;
            const framePath = st.image_urls?.[0] || "";
            await updateShot(projectId, shot.id, {
              frame_image_path: framePath,
              status: "frame_generated",
              generation_recipe: { prompt: fullPrompt, model_id: selectedImageDriver, reference_image_paths: refPaths, timestamp: new Date().toISOString() },
            });
            // If this scene has no establishing frame yet, save this as the establishing frame
            if (selectedSceneId && selectedScene && !selectedScene.establishing_frame_path && framePath) {
              await updateScene(projectId, selectedSceneId, { establishing_frame_path: framePath });
              console.log(`[ShotComposer] saved establishing frame for scene ${selectedSceneId}: ${framePath}`);
            }
            setCreating(false); setCreateStatus("");
            setNewPrompt(""); setShowCreate(false);
            setNewShotAssets([]);
            setSelectedShotId(shot.id);
            await refresh();
          } else if (st.status === "failed") {
            if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
            pollIntervalRef.current = null;
            setCreateError(st.error_message || "Generation failed");
            setCreating(false); setCreateStatus("");
          } else {
            setCreateStatus(st.status === "in_queue" ? "In queue..." : "Processing...");
          }
        } catch (pollErr) {
          // Network error during polling — don't crash, just keep trying
          console.warn("[ShotComposer] poll error (will retry):", pollErr);
        }
      }, 3000);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Failed");
      setCreating(false); setCreateStatus("");
    }
  };

  const handleDelete = async (shotId: string) => {
    if (!confirm("Delete this shot?")) return;
    await deleteShot(projectId, shotId);
    if (selectedShotId === shotId) setSelectedShotId(null);
    await refresh();
  };

  const handleRegenerate = async (shot: ShotResponse) => {
    setRegeneratingId(shot.id);
    const refPaths = (shot.assets || []).map((a: any) => a.image_path).filter(Boolean);
    const prompt = shot.generation_recipe?.prompt || shot.description || shot.name;

    try {
      const resp = await generateShotFrame(shot.id, prompt, selectedImageDriver, undefined, 1344, 768, undefined, refPaths);
      if (resp.status === "failed") { setRegeneratingId(null); return; }

      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = setInterval(async () => {
        try {
          const st = await checkShotFrameStatus(resp.job_id, selectedImageDriver);
          if (st.status === "completed") {
            if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
            pollIntervalRef.current = null;
            const framePath = st.image_urls?.[0] || "";
            await updateShot(projectId, shot.id, {
              frame_image_path: framePath,
              status: "frame_generated",
              generation_recipe: { prompt, model_id: selectedImageDriver, reference_image_paths: refPaths, timestamp: new Date().toISOString() },
            });
            setRegeneratingId(null);
            await refresh();
          } else if (st.status === "failed") {
            if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
            pollIntervalRef.current = null;
            setRegeneratingId(null);
          }
        } catch (pollErr) {
          console.warn("[ShotComposer] regenerate poll error (will retry):", pollErr);
        }
      }, 3000);
    } catch (err) {
      setRegeneratingId(null);
    }
  };

  // --- Drag and drop handlers ---
  const handleDragStart = (e: React.DragEvent, shotId: string) => {
    setDraggedId(shotId);
    setIsDragging(true);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", shotId);
  };

  const handleDragEnd = () => {
    setDraggedId(null);
    setDragOverId(null);
    setIsDragging(false);
  };

  const handleDragOver = (e: React.DragEvent, shotId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (shotId !== draggedId) {
      setDragOverId(shotId);
    }
  };

  const handleDragLeave = () => {
    setDragOverId(null);
  };

  const handleDrop = async (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    if (!draggedId || draggedId === targetId) {
      setDraggedId(null); setDragOverId(null); setIsDragging(false);
      return;
    }

    // Reorder locally
    const newOrder = sortedShots.map((s) => s.id);
    const fromIdx = newOrder.indexOf(draggedId);
    const toIdx = newOrder.indexOf(targetId);
    if (fromIdx === -1 || toIdx === -1) return;
    newOrder.splice(fromIdx, 1);
    newOrder.splice(toIdx, 0, draggedId);

    // Optimistic update: reorder local state
    const shotMap = new Map(sortedShots.map((s) => [s.id, s]));
    const reordered = newOrder.map((id, idx) => ({ ...shotMap.get(id)!, sequence_order: idx }));
    setShots(reordered);

    setDraggedId(null); setDragOverId(null); setIsDragging(false);

    // Debounce the API call
    if (reorderTimerRef.current) clearTimeout(reorderTimerRef.current);
    reorderTimerRef.current = setTimeout(async () => {
      await reorderShots(projectId, newOrder);
      await refresh();
    }, 500);
  };

  useEffect(() => {
    return () => { if (reorderTimerRef.current) clearTimeout(reorderTimerRef.current); };
  }, []);

  return (
    <div className="flex h-full">
      <ScenePanel projectId={projectId} />

      {/* Main storyboard area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Storyboard grid */}
        <div className={`overflow-auto p-5 ${selectedShot ? "w-2/3 border-r border-studio-border" : "flex-1"}`}>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-semibold">
                Storyboard{selectedSceneId ? "" : " — All Scenes"}
              </h2>
              <p className="text-xs text-studio-muted mt-0.5">
                {sortedShots.length} shot{sortedShots.length !== 1 ? "s" : ""} · Drag to reorder
              </p>
            </div>
            <button
              onClick={() => setShowCreate(!showCreate)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-studio-accent hover:bg-studio-accentHover text-white transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              New Shot
            </button>
          </div>

          {showCreate && (
            <div className="mb-4 p-4 bg-studio-panel rounded-xl border border-studio-border animate-fade-in">
              <div className="flex items-center justify-between mb-2">
                <label className="text-[10px] font-semibold text-studio-muted uppercase tracking-wider">New Shot Prompt</label>
                <button onClick={() => { setShowCreate(false); setCreateError(null); setNewShotAssets([]); }} className="p-1 rounded-lg hover:bg-studio-panelHover text-studio-muted transition-colors">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              <textarea
                value={newPrompt}
                onChange={(e) => setNewPrompt(e.target.value)}
                placeholder="Describe the shot... (e.g. 'Hero walks into the warehouse, dramatic lighting from above')"
                rows={3}
                autoFocus
                className="w-full bg-studio-bg border border-studio-border rounded-lg p-2.5 text-xs focus:border-studio-accent focus:ring-2 focus:ring-studio-accent/20 focus:outline-none resize-none"
                onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleCreateAndGenerate(); }}
              />
              <div className="flex items-center gap-3 mt-2">
                <select
                  value={isFirstShotInScene ? "establishing" : newShotType}
                  onChange={(e) => setNewShotType(e.target.value)}
                  disabled={isFirstShotInScene}
                  className="bg-studio-bg border border-studio-border rounded-lg px-2 py-1.5 text-xs focus:border-studio-accent focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {SHOT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
                {isFirstShotInScene && (
                  <span className="text-[10px] text-studio-accent font-medium">
                    First shot — auto-set as establishing wide shot
                  </span>
                )}
                <select
                  value={selectedImageDriver}
                  onChange={(e) => setSelectedImageDriver(e.target.value)}
                  className="bg-studio-bg border border-studio-border rounded-lg px-2 py-1.5 text-xs focus:border-studio-accent focus:outline-none"
                  title="Image model"
                >
                  {imageDrivers.map((d) => <option key={d.driver_id} value={d.driver_id}>{d.display_name}</option>)}
                </select>
                {sceneRecipeCount > 0 && (
                  <span className="flex items-center gap-1 text-[10px] text-studio-muted">
                    <Layers className="w-3 h-3" />
                    {sceneRecipeCount} recipe assets attached
                  </span>
                )}
                <div className="flex-1" />
                <button
                  onClick={handleCreateAndGenerate}
                  disabled={creating || !newPrompt.trim()}
                  className="flex items-center gap-1.5 px-4 py-1.5 bg-studio-accent hover:bg-studio-accentHover disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-medium rounded-lg transition-colors"
                >
                  {creating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                  {creating ? (createStatus || "Working...") : "Create & Generate"}
                </button>
              </div>
              {createError && <p className="mt-2 text-xs text-studio-danger bg-studio-danger/10 p-2 rounded-lg">{createError}</p>}

              {/* Shot assets (editable recipe for this shot) */}
              <div className="mt-3 pt-3 border-t border-studio-border">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-[10px] font-semibold text-studio-muted uppercase tracking-wider">
                    Shot Assets {extraAssetCount > 0 && `(+${extraAssetCount} extra)`}
                  </label>
                  <button
                    onClick={() => setShowAssetPicker(!showAssetPicker)}
                    className="flex items-center gap-1 text-[10px] text-studio-accent hover:text-studio-accentHover transition-colors"
                  >
                    <Plus className="w-3 h-3" />
                    Add asset
                  </button>
                </div>

                {/* Selected assets chips */}
                {newShotAssets.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {newShotAssets.map((a) => (
                      <div key={a.asset_id} className="flex items-center gap-1 px-2 py-1 bg-studio-bg border border-studio-border rounded-lg text-[10px]">
                        {a.image_path && <img src={a.image_path} alt="" className="w-5 h-5 rounded object-cover" />}
                        <span className="text-studio-text">{a.asset_name}</span>
                        <span className="text-studio-muted capitalize">{a.role}</span>
                        <button
                          onClick={() => setNewShotAssets(newShotAssets.filter((x) => x.asset_id !== a.asset_id))}
                          className="text-studio-muted hover:text-studio-danger transition-colors"
                        >
                          <X className="w-2.5 h-2.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-[10px] text-studio-muted/50">
                    {sceneRecipeCount > 0 ? `${sceneRecipeCount} scene recipe assets will be included` : "No assets selected"}
                  </p>
                )}

                {/* Asset picker dropdown */}
                {showAssetPicker && (
                  <div className="mt-2 p-2 bg-studio-bg border border-studio-border rounded-lg max-h-40 overflow-auto">
                    {availableAssets.length > 0 ? (
                      <div className="flex flex-col gap-1">
                        {availableAssets.map((a) => (
                          <button
                            key={a.id}
                            onClick={() => {
                              setNewShotAssets([...newShotAssets, {
                                asset_id: a.id,
                                asset_name: a.name,
                                image_path: a.primary_image,
                                role: a.type,
                              }]);
                              setShowAssetPicker(false);
                            }}
                            className="flex items-center gap-2 px-2 py-1.5 hover:bg-studio-panel rounded-lg text-left transition-colors"
                          >
                            {a.primary_image && <img src={a.primary_image} alt="" className="w-8 h-8 rounded object-cover" />}
                            <div className="flex-1 min-w-0">
                              <p className="text-xs text-studio-text truncate">{a.name}</p>
                              <p className="text-[10px] text-studio-muted capitalize">{a.type}</p>
                            </div>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <p className="text-[10px] text-studio-muted text-center py-2">No more assets available</p>
                    )}
                  </div>
                )}
              </div>

              <p className="mt-2 text-[10px] text-studio-muted/50">Ctrl+Enter to generate · Shot name auto-derived from prompt</p>
            </div>
          )}

          {/* Grid of shot cards */}
          {sortedShots.length > 0 ? (
            <div className="grid grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2.5">
              {sortedShots.map((shot, idx) => (
                <div
                  key={shot.id}
                  draggable
                  onDragStart={(e) => handleDragStart(e, shot.id)}
                  onDragEnd={handleDragEnd}
                  onDragOver={(e) => handleDragOver(e, shot.id)}
                  onDragLeave={handleDragLeave}
                  onDrop={(e) => handleDrop(e, shot.id)}
                  onClick={() => setSelectedShotId(selectedShotId === shot.id ? null : shot.id)}
                  className={`group relative rounded-xl border cursor-pointer transition-all overflow-hidden ${
                    selectedShotId === shot.id
                      ? "border-studio-accent ring-2 ring-studio-accent/20"
                      : dragOverId === shot.id
                        ? "border-studio-accent border-dashed"
                        : "border-studio-border hover:border-studio-accent/40"
                  } ${draggedId === shot.id ? "opacity-40" : ""} ${isDragging ? "cursor-grabbing" : ""}`}
                >
                  {/* Drag handle */}
                  <div className="absolute top-1.5 left-1.5 z-10 p-1 rounded bg-black/40 backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing">
                    <GripVertical className="w-3 h-3 text-white" />
                  </div>

                  {/* Shot number badge */}
                  <div className="absolute top-1.5 right-1.5 z-10 px-1.5 py-0.5 rounded text-[10px] font-bold bg-black/60 backdrop-blur-sm text-white">
                    #{idx + 1}
                  </div>

                  {/* Frame image or placeholder */}
                  <div className="aspect-video bg-studio-panel flex items-center justify-center overflow-hidden relative">
                    {shot.frame_image_path ? (
                      <img src={shot.frame_image_path} alt={shot.name} className="w-full h-full object-cover" />
                    ) : (
                      <div className="flex flex-col items-center gap-1 text-studio-muted">
                        <Clapperboard className="w-6 h-6 opacity-40" />
                        <span className="text-[10px]">No frame</span>
                      </div>
                    )}

                    {/* Regenerate button overlay */}
                    {shot.frame_image_path && (
                      <button
                        onClick={(e) => { e.stopPropagation(); handleRegenerate(shot); }}
                        disabled={regeneratingId === shot.id}
                        className="absolute bottom-1.5 left-1.5 z-10 p-1.5 rounded-lg bg-black/60 backdrop-blur-sm opacity-0 group-hover:opacity-100 hover:bg-studio-accent text-white transition-all disabled:opacity-100"
                        title="Regenerate frame"
                      >
                        {regeneratingId === shot.id ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <RefreshCw className="w-3 h-3" />
                        )}
                      </button>
                    )}
                  </div>

                  {/* Card footer */}
                  <div className="p-2 bg-studio-panel/80">
                    <div className="flex items-center justify-between gap-1.5">
                      <p className="text-[11px] font-medium truncate flex-1">{shot.name}</p>
                      <span className={`text-[9px] px-1.5 py-0.5 rounded-full shrink-0 ${
                        shot.status === "frame_generated" ? "bg-studio-success/20 text-studio-success" : "bg-studio-border text-studio-muted"
                      }`}>
                        {shot.status}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[9px] text-studio-muted">{shot.shot_type}</span>
                      {Object.keys(shot.angle_images || {}).length > 0 && (
                        <span className="flex items-center gap-0.5 text-[10px] text-studio-accent">
                          <Camera className="w-2.5 h-2.5" />
                          {Object.keys(shot.angle_images).length}
                        </span>
                      )}
                      {(shot.assets || []).length > 0 && (
                        <span className="flex items-center gap-0.5 text-[10px] text-studio-muted">
                          <Layers className="w-2.5 h-2.5" />
                          {(shot.assets || []).length}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Delete button */}
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDelete(shot.id); }}
                    className="absolute bottom-1.5 right-1.5 z-10 p-1 rounded-lg bg-black/40 backdrop-blur-sm opacity-0 group-hover:opacity-100 hover:bg-studio-danger/80 text-white transition-all"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}

              {/* Add new shot card */}
              <div
                onClick={() => setShowCreate(true)}
                className="rounded-xl border-2 border-dashed border-studio-border hover:border-studio-accent/50 cursor-pointer transition-all flex items-center justify-center min-h-[120px]"
              >
                <div className="flex flex-col items-center gap-2 text-studio-muted">
                  <div className="w-10 h-10 rounded-full bg-studio-panel flex items-center justify-center">
                    <Plus className="w-5 h-5" />
                  </div>
                  <span className="text-xs">Add Shot</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="w-16 h-16 rounded-2xl bg-studio-panel border border-studio-border flex items-center justify-center mx-auto mb-4">
                <Clapperboard className="w-8 h-8 text-studio-muted/50" />
              </div>
              <p className="text-sm text-studio-muted">No shots yet</p>
              <p className="text-xs text-studio-muted/50 mt-1 mb-4">Create your first shot to start the storyboard</p>
              <button
                onClick={() => setShowCreate(true)}
                className="flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-lg bg-studio-accent hover:bg-studio-accentHover text-white transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                New Shot
              </button>
            </div>
          )}
        </div>

        {/* Detail panel (slides in when a shot is selected) */}
        {selectedShot && (
          <div className="w-1/3 min-w-[400px] overflow-hidden animate-fade-in">
            <ShotDetail
              shot={selectedShot}
              projectId={projectId}
              allShots={sortedShots}
              onRefresh={refresh}
              onClose={() => setSelectedShotId(null)}
            />
          </div>
        )}
      </div>
    </div>
  );
}
