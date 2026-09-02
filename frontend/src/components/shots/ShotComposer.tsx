"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useStudioStore } from "@/lib/store";
import {
  fetchShots, deleteShot, reorderShots, createShot,
  generateShotFrame, checkShotFrameStatus, updateShot,
  fetchScenes,
  type ShotResponse,
} from "@/lib/api";
import { ScenePanel } from "./ScenePanel";
import { ShotCreatePanel } from "./ShotCreatePanel";
import {
  Plus, Trash2, Clapperboard, GripVertical, Camera, Layers,
  Loader2, RefreshCw, Copy,
} from "lucide-react";
import { useGenerationPolling } from "@/lib/useGenerationPolling";
import { type PreviousShotAngle } from "./CameraAngleWidget";

export function ShotComposer({ projectId }: { projectId: string }) {
  const {
    shots, setShots, selectedShotId, setSelectedShotId, selectedSceneId,
    scenes, setScenes, imageDrivers, selectedImageDriver,
    assets,
  } = useStudioStore();

  const [showCreate, setShowCreate] = useState(false);
  const [regeneratingId, setRegeneratingId] = useState<string | null>(null);

  // Drag-and-drop state
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const reorderTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const regenPoll = useGenerationPolling();

  const refresh = useCallback(async () => {
    const [shotData, sceneData] = await Promise.all([
      fetchShots(projectId, selectedSceneId || undefined),
      fetchScenes(projectId),
    ]);
    setShots(shotData);
    setScenes(sceneData);
  }, [projectId, selectedSceneId, setShots, setScenes]);

  useEffect(() => { refresh(); }, [projectId, selectedSceneId]);

  // Sort shots by sequence_order, filtering out hidden shots
  const sortedShots = [...shots]
    .filter((s: any) => !s.hidden)
    .sort((a, b) => (a.sequence_order ?? 0) - (b.sequence_order ?? 0));
  const selectedScene = scenes.find((s) => s.id === selectedSceneId);
  const sceneRecipeCount = (selectedScene?.reference_assets || []).length;
  const sceneShotCount = selectedSceneId ? sortedShots.filter((s) => s.scene_id === selectedSceneId).length : 0;
  const isFirstShotInScene = !!selectedSceneId && sceneShotCount === 0;

  // Last generated frame in scene for reference
  const lastSceneFrame = selectedSceneId
    ? sortedShots
        .filter((s) => s.scene_id === selectedSceneId && s.frame_image_path)
        .sort((a, b) => (b.sequence_order ?? 0) - (a.sequence_order ?? 0))[0]
    : null;
  const referenceFrameUrl = selectedScene?.establishing_frame_path || lastSceneFrame?.frame_image_path;

  // Camera angles for 180° rule and coverage
  const sceneShotsWithAngles = selectedSceneId
    ? sortedShots
        .filter((s) => s.scene_id === selectedSceneId && s.generation_recipe?.params?.horizontal_angle != null)
        .sort((a, b) => (a.sequence_order ?? 0) - (b.sequence_order ?? 0))
    : [];
  const lastShotAngle = sceneShotsWithAngles.length > 0
    ? sceneShotsWithAngles[sceneShotsWithAngles.length - 1].generation_recipe.params.horizontal_angle
    : null;

  const widgetPreviousShots: PreviousShotAngle[] = sceneShotsWithAngles.map((s, i) => ({
    horizontalAngle: s.generation_recipe.params.horizontal_angle,
    verticalAngle: s.generation_recipe.params.vertical_angle ?? 0,
    zoom: s.generation_recipe.params.zoom ?? 5,
    label: `S${i + 1}`,
  }));

  const actionAxisAngle = sceneShotsWithAngles.length > 0
    ? sceneShotsWithAngles[0].generation_recipe.params.horizontal_angle
    : undefined;

  const sceneRecipeAssetIds = new Set((selectedScene?.reference_assets || []).map((a: any) => a.asset_id));

  const handleDuplicate = async (shot: ShotResponse) => {
    const dup = await createShot(projectId, `${shot.name} (copy)`, shot.description || "", shot.scene_id || undefined, shot.shot_type);
    if (shot.frame_image_path) {
      await updateShot(projectId, dup.id, {
        frame_image_path: shot.frame_image_path,
        status: shot.status,
        generation_recipe: shot.generation_recipe,
        assets: shot.assets,
      });
    }
    await refresh();
  };

  const handleDelete = async (shotId: string) => {
    if (!confirm("Delete this shot?")) return;
    await deleteShot(projectId, shotId);
    if (selectedShotId === shotId) setSelectedShotId(null);
    await refresh();
  };

  const handleRegenerate = async (shot: ShotResponse) => {
    setRegeneratingId(shot.id);
    const prompt = shot.generation_recipe?.prompt || shot.description || shot.name;
    const recipeWidth = shot.generation_recipe?.params?.width || 1344;
    const recipeHeight = shot.generation_recipe?.params?.height || 768;
    const recipeSeed = shot.generation_recipe?.seed;
    const recipeNegative = shot.generation_recipe?.resolved_negative_prompt;
    const recipeDenoise = shot.generation_recipe?.denoise;
    const recipeCfg = shot.generation_recipe?.params?.cfg;
    const recipeSteps = shot.generation_recipe?.params?.steps;

    try {
      const resp = await generateShotFrame(
        shot.id, prompt, selectedImageDriver,
        recipeNegative || undefined,
        recipeWidth, recipeHeight,
        recipeSeed, undefined, recipeDenoise, recipeCfg, recipeSteps,
      );
      if (resp.status === "failed") { setRegeneratingId(null); return; }

      regenPoll.startPolling(
        () => checkShotFrameStatus(resp.job_id, selectedImageDriver),
        async (st) => {
          const framePath = st.image_urls?.[0] || "";
          await updateShot(projectId, shot.id, {
            frame_image_path: framePath,
            status: "frame_generated",
            generation_recipe: { prompt, model_id: selectedImageDriver, params: { width: recipeWidth, height: recipeHeight }, seed: recipeSeed, timestamp: new Date().toISOString() },
          });
          setRegeneratingId(null);
          await refresh();
        },
        { intervalMs: 3000 }
      );
    } catch (err) {
      setRegeneratingId(null);
    }
  };

  // --- Drag and drop ---
  const handleDragStart = (e: React.DragEvent, shotId: string) => {
    setDraggedId(shotId); setIsDragging(true);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", shotId);
  };
  const handleDragEnd = () => { setDraggedId(null); setDragOverId(null); setIsDragging(false); };
  const handleDragOver = (e: React.DragEvent, shotId: string) => {
    e.preventDefault(); e.dataTransfer.dropEffect = "move";
    if (shotId !== draggedId) setDragOverId(shotId);
  };
  const handleDrop = async (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    if (!draggedId || draggedId === targetId) { setDraggedId(null); setDragOverId(null); setIsDragging(false); return; }
    const newOrder = sortedShots.map((s) => s.id);
    const fromIdx = newOrder.indexOf(draggedId);
    const toIdx = newOrder.indexOf(targetId);
    if (fromIdx === -1 || toIdx === -1) return;
    newOrder.splice(fromIdx, 1); newOrder.splice(toIdx, 0, draggedId);
    const shotMap = new Map(sortedShots.map((s) => [s.id, s]));
    const reordered = newOrder.map((id, idx) => ({ ...shotMap.get(id)!, sequence_order: idx }));
    setShots(reordered);
    setDraggedId(null); setDragOverId(null); setIsDragging(false);
    if (reorderTimerRef.current) clearTimeout(reorderTimerRef.current);
    reorderTimerRef.current = setTimeout(async () => { await reorderShots(projectId, newOrder); await refresh(); }, 500);
  };

  useEffect(() => { return () => { if (reorderTimerRef.current) clearTimeout(reorderTimerRef.current); }; }, []);

  return (
    <div className="flex h-full">
      <ScenePanel projectId={projectId} />

      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 overflow-auto p-5">
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
              disabled={!selectedSceneId}
              title={!selectedSceneId ? "Select a scene first" : "Create new shot"}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-studio-accent hover:bg-studio-accentHover text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Plus className="w-3.5 h-3.5" />
              New Shot
            </button>
          </div>

          {showCreate && !selectedSceneId && (
            <div className="mb-4 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-xl text-xs text-yellow-400">
              Select a scene from the left panel first. Shots need a scene to inherit characters, location, and the establishing frame.
            </div>
          )}
          {showCreate && selectedSceneId && (
            <ShotCreatePanel
              projectId={projectId}
              selectedSceneId={selectedSceneId}
              isFirstShotInScene={isFirstShotInScene}
              sceneRecipeCount={sceneRecipeCount}
              referenceFrameUrl={referenceFrameUrl || undefined}
              widgetPreviousShots={widgetPreviousShots}
              actionAxisAngle={actionAxisAngle}
              lastShotAngle={lastShotAngle}
              sortedShots={sortedShots}
              assets={assets}
              sceneRecipeAssetIds={sceneRecipeAssetIds}
              onClose={() => setShowCreate(false)}
              onRefresh={refresh}
            />
          )}

          {/* Grid of shot cards */}
          {sortedShots.length > 0 ? (
            <div className="grid grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7 gap-2">
              {sortedShots.map((shot, idx) => {
                const shotScene = scenes.find((s) => s.id === shot.scene_id);
                return (
                <div
                  key={shot.id}
                  draggable
                  onDragStart={(e) => handleDragStart(e, shot.id)}
                  onDragEnd={handleDragEnd}
                  onDragOver={(e) => handleDragOver(e, shot.id)}
                  onDragLeave={() => setDragOverId(null)}
                  onDrop={(e) => handleDrop(e, shot.id)}
                  onClick={() => {
                    const newId = selectedShotId === shot.id ? null : shot.id;
                    setSelectedShotId(newId);
                    if (newId) useStudioStore.getState().setActiveInspector("shot");
                  }}
                  className={`group relative rounded-xl border cursor-pointer transition-all overflow-hidden ${
                    selectedShotId === shot.id
                      ? "border-studio-accent ring-2 ring-studio-accent/20"
                      : dragOverId === shot.id
                        ? "border-studio-accent border-dashed"
                        : "border-studio-border hover:border-studio-accent/40"
                  } ${draggedId === shot.id ? "opacity-40" : ""} ${isDragging ? "cursor-grabbing" : ""}`}
                >
                  <div className="absolute top-1.5 left-1.5 z-10 p-1 rounded bg-black/40 backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing">
                    <GripVertical className="w-3 h-3 text-white" />
                  </div>
                  <div className="absolute top-1.5 right-1.5 z-10 px-1.5 py-0.5 rounded text-[10px] font-bold bg-black/60 backdrop-blur-sm text-white">
                    #{idx + 1}
                  </div>

                  <div
                    className="bg-studio-panel flex items-center justify-center overflow-hidden relative"
                    style={{ aspectRatio: shot.generation_recipe?.params?.width && shot.generation_recipe?.params?.height
                      ? `${shot.generation_recipe.params.width} / ${shot.generation_recipe.params.height}`
                      : "16 / 9" }}
                  >
                    {shot.frame_image_path ? (
                      <img src={shot.frame_image_path} alt={shot.name} className="w-full h-full object-contain" />
                    ) : (
                      <div className="flex flex-col items-center gap-1 text-studio-muted">
                        <Clapperboard className="w-6 h-6 opacity-40" />
                        <span className="text-[10px]">No frame</span>
                      </div>
                    )}
                    {shot.frame_image_path && (
                      <button
                        onClick={(e) => { e.stopPropagation(); handleRegenerate(shot); }}
                        disabled={regeneratingId === shot.id}
                        className="absolute bottom-1.5 left-1.5 z-10 p-1.5 rounded-lg bg-black/60 backdrop-blur-sm opacity-0 group-hover:opacity-100 hover:bg-studio-accent text-white transition-all disabled:opacity-100"
                        title="Regenerate frame"
                      >
                        {regeneratingId === shot.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                      </button>
                    )}
                  </div>

                  <div className="p-1.5 bg-studio-panel/80">
                    <div className="flex items-center justify-between gap-1">
                      <p className="text-[10px] font-medium truncate flex-1">{shot.name}</p>
                      <span className={`text-[8px] px-1 py-0.5 rounded-full shrink-0 ${
                        shot.status === "frame_generated" ? "bg-studio-success/20 text-studio-success" : "bg-studio-border text-studio-muted"
                      }`}>
                        {shot.status}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="text-[8px] text-studio-muted">{shot.shot_type}</span>
                      {!selectedSceneId && shotScene && (
                        <span className="text-[8px] text-studio-accent/70 truncate">{shotScene.name}</span>
                      )}
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

                  <div className="absolute bottom-1.5 right-1.5 z-10 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDuplicate(shot); }}
                      className="p-1 rounded-lg bg-black/40 backdrop-blur-sm hover:bg-studio-accent text-white transition-all"
                      title="Duplicate shot"
                    >
                      <Copy className="w-3 h-3" />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDelete(shot.id); }}
                      className="p-1 rounded-lg bg-black/40 backdrop-blur-sm hover:bg-studio-danger/80 text-white transition-all"
                      title="Delete shot"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              );})}
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
                disabled={!selectedSceneId}
                className="flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-lg bg-studio-accent hover:bg-studio-accentHover text-white transition-colors disabled:opacity-40"
              >
                <Plus className="w-3.5 h-3.5" />
                New Shot
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
