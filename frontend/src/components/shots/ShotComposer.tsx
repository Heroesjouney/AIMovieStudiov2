"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useStudioStore } from "@/lib/store";
import {
  fetchShots, createShot, deleteShot, reorderShots,
  generateShotFrame, checkShotFrameStatus, updateShot, updateScene,
  fetchScenes,
  type ShotResponse, type SceneResponse,
} from "@/lib/api";
import { ScenePanel } from "./ScenePanel";
import { ShotDetail } from "./ShotDetail";
import {
  Plus, Trash2, Clapperboard, GripVertical, Camera, Layers, Sparkles,
  Loader2, X, RefreshCw, ChevronDown, ChevronRight, ImageIcon, Link2, Copy
} from "lucide-react";
import { CameraAngleWidget, type PreviousShotAngle } from "./CameraAngleWidget";
import { ShotTypeLibrary } from "./ShotTypeLibrary";
import {
  CINEMATIC_PRESETS, getPresetById,
  wouldCrossLine, suggestReverse,
} from "@/lib/cinematicPresets";

const SHOT_TYPES = [
  { value: "wide", label: "Wide Shot", prompt: "wide shot" },
  { value: "medium", label: "Medium Shot", prompt: "medium shot" },
  { value: "close_up", label: "Close Up", prompt: "close-up shot" },
  { value: "over_the_shoulder", label: "Over Shoulder", prompt: "over-the-shoulder shot" },
  { value: "establishing", label: "Establishing", prompt: "wide establishing shot" },
  { value: "insert", label: "Insert", prompt: "insert shot, extreme close-up" },
  { value: "pov", label: "POV", prompt: "point of view shot" },
  { value: "two_shot", label: "Two Shot", prompt: "two shot" },
];

const STYLE_OPTIONS = [
  { value: "", label: "Style: Auto" },
  { value: "photorealistic, cinematic, realistic photography, natural lighting, film grain", label: "Style: Realistic" },
  { value: "cinematic film still, dramatic lighting, movie production quality, 35mm film", label: "Style: Cinematic" },
  { value: "cartoon style, animated, clean lines, vibrant colors, flat shading", label: "Style: Cartoon" },
  { value: "anime style, cel shading, detailed illustration, studio quality", label: "Style: Anime" },
  { value: "oil painting, painterly brushstrokes, classical art style, rich textures", label: "Style: Oil Painting" },
  { value: "digital painting, concept art style, detailed environment art", label: "Style: Concept Art" },
];

const ASPECT_RATIOS = [
  { value: "16:9", label: "Ratio: 16:9", width: 1344, height: 768 },
  { value: "2.39:1", label: "Ratio: 2.39:1 Cinemascope", width: 1344, height: 562 },
  { value: "2:1", label: "Ratio: 2:1 Univisium", width: 1344, height: 672 },
  { value: "1.85:1", label: "Ratio: 1.85:1 Widescreen", width: 1344, height: 726 },
  { value: "4:3", label: "Ratio: 4:3 Classic", width: 1024, height: 768 },
  { value: "1:1", label: "Ratio: 1:1 Square", width: 1024, height: 1024 },
  { value: "9:16", label: "Ratio: 9:16 Vertical", width: 768, height: 1344 },
];



export function ShotComposer({ projectId }: { projectId: string }) {
  const {
    shots, setShots, selectedShotId, setSelectedShotId, selectedSceneId,
    scenes, setScenes, imageDrivers, selectedImageDriver, setSelectedImageDriver,
    assets,
  } = useStudioStore();

  const [showCreate, setShowCreate] = useState(false);
  const [newPrompt, setNewPrompt] = useState("");
  const [newShotType, setNewShotType] = useState("medium");
  const [artStyle, setArtStyle] = useState("");
  const [aspectRatio, setAspectRatio] = useState("16:9");
  const [camHorizontal, setCamHorizontal] = useState(0);
  const [camVertical, setCamVertical] = useState(0);
  const [camZoom, setCamZoom] = useState(5);
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [createStatus, setCreateStatus] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  const [regeneratingId, setRegeneratingId] = useState<string | null>(null);
  const [newShotAssets, setNewShotAssets] = useState<any[]>([]);
  const [showAssetPicker, setShowAssetPicker] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [advNegativePrompt, setAdvNegativePrompt] = useState("");
  const [advSeed, setAdvSeed] = useState("");
  const [advDenoise, setAdvDenoise] = useState("");
  const [advCfg, setAdvCfg] = useState("");
  const [advSteps, setAdvSteps] = useState("");

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
    const [shotData, sceneData] = await Promise.all([
      fetchShots(projectId, selectedSceneId || undefined),
      fetchScenes(projectId),
    ]);
    setShots(shotData);
    setScenes(sceneData);
  }, [projectId, selectedSceneId, setShots, setScenes]);

  useEffect(() => { refresh(); }, [projectId, selectedSceneId]);

  // Sort shots by sequence_order for display
  const sortedShots = [...shots].sort((a, b) => (a.sequence_order ?? 0) - (b.sequence_order ?? 0));
  const selectedShot = sortedShots.find((s) => s.id === selectedShotId);
  const selectedScene = scenes.find((s) => s.id === selectedSceneId);
  const sceneRecipeCount = (selectedScene?.reference_assets || []).length;
  const sceneHasEstablishing = !!(selectedScene?.establishing_frame_path);
  const sceneShotCount = selectedSceneId ? sortedShots.filter((s) => s.scene_id === selectedSceneId).length : 0;
  const isFirstShotInScene = !!selectedSceneId && sceneShotCount === 0;

  // Find the last generated frame in this scene to show as reference
  const lastSceneFrame = selectedSceneId
    ? sortedShots
        .filter((s) => s.scene_id === selectedSceneId && s.frame_image_path)
        .sort((a, b) => (b.sequence_order ?? 0) - (a.sequence_order ?? 0))[0]
    : null;
  const referenceFrameUrl = selectedScene?.establishing_frame_path || lastSceneFrame?.frame_image_path;

  // Track camera angles used in this scene's shots for 180° rule and coverage
  const sceneShotsWithAngles = selectedSceneId
    ? sortedShots
        .filter((s) => s.scene_id === selectedSceneId && s.generation_recipe?.params?.horizontal_angle != null)
        .sort((a, b) => (a.sequence_order ?? 0) - (b.sequence_order ?? 0))
    : [];
  const lastShotAngle = sceneShotsWithAngles.length > 0
    ? sceneShotsWithAngles[sceneShotsWithAngles.length - 1].generation_recipe.params.horizontal_angle
    : null;
  const usedPresetAngles = sceneShotsWithAngles.map((s) => s.generation_recipe.params.horizontal_angle);
  const crossesLine = lastShotAngle !== null && wouldCrossLine(lastShotAngle, camHorizontal);

  // Build previous shot angle data for 3D widget ghost markers
  const widgetPreviousShots: PreviousShotAngle[] = sceneShotsWithAngles.map((s, i) => ({
    horizontalAngle: s.generation_recipe.params.horizontal_angle,
    verticalAngle: s.generation_recipe.params.vertical_angle ?? 0,
    zoom: s.generation_recipe.params.zoom ?? 5,
    label: `S${i + 1}`,
  }));

  // Action axis = first shot's horizontal angle (establishing shot direction)
  const actionAxisAngle = sceneShotsWithAngles.length > 0
    ? sceneShotsWithAngles[0].generation_recipe.params.horizontal_angle
    : undefined;

  // Assets available to add (have a primary image, not already in newShotAssets)
  const sceneRecipeAssetIds = new Set((selectedScene?.reference_assets || []).map((a: any) => a.asset_id));
  const availableAssets = assets.filter((a) => a.primary_image && !newShotAssets.some((na) => na.asset_id === a.id));
  const extraAssetCount = newShotAssets.filter((a) => !sceneRecipeAssetIds.has(a.asset_id)).length;

  const handleCreateAndGenerate = async () => {
    // Subsequent shots don't require a prompt — camera angles drive generation
    if (isFirstShotInScene && !newPrompt.trim()) return;
    const wasFirstShot = isFirstShotInScene;
    setCreating(true); setCreateError(null); setCreateStatus("Creating shot...");

    try {
      const shotName = wasFirstShot
        ? newPrompt.slice(0, 40) + (newPrompt.length > 40 ? "..." : "")
        : `Camera: H${camHorizontal}° V${camVertical}° Z${camZoom.toFixed(1)}`;
      // Force first shot in scene to be a wide establishing shot
      const effectiveShotType = wasFirstShot ? "establishing" : "subsequent";
      const shot = await createShot(projectId, shotName, newPrompt || "", selectedSceneId || undefined, effectiveShotType);
      await refresh();

      // Bind additional assets to the shot (on top of scene recipe)
      if (newShotAssets.length > 0) {
        await updateShot(projectId, shot.id, { assets: newShotAssets });
      }

      setCreateStatus("Generating frame...");
      // Don't pass asset image_paths — the backend constructs ref_paths
      // intelligently from the shot's scene, assets, and establishing frame.

      const shotTypeData = SHOT_TYPES.find((t) => t.value === effectiveShotType);
      const shotTypePrompt = shotTypeData?.prompt || "";
      // For establishing shots, build a cinematic prompt with shot type + style.
      // For subsequent shots, send only optional user text — the backend generates
      // the <sks> camera angle prompt from the horizontal/vertical/zoom sliders.
      let fullPrompt: string;
      if (wasFirstShot) {
        const cinematicParts = [shotTypePrompt];
        if (artStyle) cinematicParts.push(artStyle);
        const cinematicPrefix = cinematicParts.filter(Boolean).join(", ");
        fullPrompt = `${cinematicPrefix}. ${newPrompt}`;
      } else {
        fullPrompt = newPrompt;
      }

      const aspectData = ASPECT_RATIOS.find((a) => a.value === aspectRatio) || ASPECT_RATIOS[0];

      const resp = await generateShotFrame(
        shot.id, fullPrompt, selectedImageDriver,
        advNegativePrompt || undefined,
        aspectData.width, aspectData.height,
        advSeed ? parseInt(advSeed) : undefined,
        undefined, // Let backend handle ref_paths from scene/shot assets
        advDenoise ? parseFloat(advDenoise) : undefined,
        advCfg ? parseFloat(advCfg) : undefined,
        advSteps ? parseInt(advSteps) : undefined,
        wasFirstShot ? 0 : camHorizontal,
        wasFirstShot ? 0 : camVertical,
        wasFirstShot ? 1.0 : camZoom,
        wasFirstShot ? undefined : (selectedPresetId || undefined),
      );
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
            });
            // Establishing frame is now auto-saved by the backend in update_shot
            setCreating(false); setCreateStatus("");
            setNewPrompt(""); setShowCreate(false);
            setNewShotAssets([]);
            setAspectRatio("16:9");
            setCamHorizontal(0); setCamVertical(0); setCamZoom(5); setSelectedPresetId(null);
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
    // Don't pass asset image_paths — the backend constructs ref_paths
    // intelligently from the shot's scene, assets, and establishing frame.
    // Passing asset images directly bypasses that logic and causes wrong refs.
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
        recipeSeed,
        undefined, // Let backend handle ref_paths
        recipeDenoise,
        recipeCfg,
        recipeSteps,
      );
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
              generation_recipe: { prompt, model_id: selectedImageDriver, params: { width: recipeWidth, height: recipeHeight }, seed: recipeSeed, timestamp: new Date().toISOString() },
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
            <div className="mb-4 p-4 bg-studio-panel rounded-xl border border-studio-border animate-fade-in">
              <div className="flex items-center justify-between mb-2">
                <label className="text-[10px] font-semibold text-studio-muted uppercase tracking-wider">
                  {(isFirstShotInScene || creating) ? "New Shot Prompt" : "Camera Position"}
                </label>
                <button onClick={() => { setShowCreate(false); setCreateError(null); setNewShotAssets([]); setArtStyle(""); setAspectRatio("16:9"); setCamHorizontal(0); setCamVertical(0); setCamZoom(5); setSelectedPresetId(null); }} className="p-1 rounded-lg hover:bg-studio-panelHover text-studio-muted transition-colors">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              {(isFirstShotInScene || (creating && !selectedShotId)) && (
                <textarea
                  value={newPrompt}
                  onChange={(e) => setNewPrompt(e.target.value)}
                  placeholder="Describe the scene... (e.g. 'Circus tent at dusk, characters facing off')"
                  rows={3}
                  autoFocus
                  className="w-full bg-studio-bg border border-studio-border rounded-lg p-2.5 text-xs focus:border-studio-accent focus:ring-2 focus:ring-studio-accent/20 focus:outline-none resize-none"
                  onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleCreateAndGenerate(); }}
                />
              )}
              {/* Cinematic quick-select options */}
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                <Camera className="w-3 h-3 text-studio-muted shrink-0" />
                {(isFirstShotInScene || creating) && (
                  <select
                    value="establishing"
                    disabled
                    className="bg-studio-bg border border-studio-border rounded-lg px-2 py-1 text-[10px] focus:border-studio-accent focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <option value="establishing">Establishing</option>
                  </select>
                )}
                <select
                  value={artStyle}
                  onChange={(e) => setArtStyle(e.target.value)}
                  className="bg-studio-bg border border-studio-border rounded-lg px-2 py-1 text-[10px] focus:border-studio-accent focus:outline-none"
                  title="Art style"
                >
                  {STYLE_OPTIONS.map((opt) => <option key={opt.label} value={opt.value}>{opt.label}</option>)}
                </select>
                <select
                  value={aspectRatio}
                  onChange={(e) => setAspectRatio(e.target.value)}
                  className="bg-studio-bg border border-studio-border rounded-lg px-2 py-1 text-[10px] focus:border-studio-accent focus:outline-none"
                  title="Aspect ratio"
                >
                  {ASPECT_RATIOS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                </select>
                <select
                  value={selectedImageDriver}
                  onChange={(e) => setSelectedImageDriver(e.target.value)}
                  className="bg-studio-bg border border-studio-border rounded-lg px-2 py-1 text-[10px] focus:border-studio-accent focus:outline-none"
                  title="Image model"
                >
                  {imageDrivers
                    .filter((d) => d.driver_id === "qwen_image_edit")
                    .map((d) => <option key={d.driver_id} value={d.driver_id}>{d.display_name}</option>)}
                </select>
                {isFirstShotInScene && !creating && (
                  <span className="text-[10px] text-studio-accent font-medium">
                    First shot — auto establishing
                  </span>
                )}
                {!isFirstShotInScene && !creating && (
                  <div className="w-full mt-2 flex flex-col gap-2">
                    {/* 180° rule warning */}
                    {crossesLine && (
                      <div className="flex items-center gap-2 px-2.5 py-1.5 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
                        <span className="text-[10px] text-yellow-400 font-medium">
                          ⚠ 180° Rule: Camera crossed the line
                        </span>
                        <button
                          onClick={() => {
                            if (lastShotAngle !== null) {
                              const reversed = suggestReverse(lastShotAngle);
                              setCamHorizontal(reversed);
                            }
                          }}
                          className="ml-auto text-[9px] px-2 py-0.5 rounded bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-400 transition-colors"
                        >
                          Fix: Reverse Angle
                        </button>
                      </div>
                    )}

                    {/* Action prompt — full width above widget */}
                    <textarea
                      value={newPrompt}
                      onChange={(e) => setNewPrompt(e.target.value)}
                      placeholder="Action prompt... (e.g. 'knight draws sword, intense expression') — leave empty for camera-only generation"
                      rows={2}
                      className="w-full bg-studio-bg border border-studio-border rounded-lg p-2 text-xs focus:border-studio-accent focus:ring-2 focus:ring-studio-accent/20 focus:outline-none resize-none"
                    />

                    {/* 3D Widget + controls */}
                    <div className="flex gap-2">
                      <div className="w-96 h-96 shrink-0">
                        <CameraAngleWidget
                          horizontalAngle={camHorizontal}
                          verticalAngle={camVertical}
                          zoom={camZoom}
                          onChange={(h, v, z) => { setCamHorizontal(h); setCamVertical(v); setCamZoom(z); }}
                          referenceImageUrl={referenceFrameUrl || undefined}
                          previousShots={widgetPreviousShots}
                          actionAxisAngle={actionAxisAngle}
                          isPOV={selectedPresetId === "pov"}
                        />
                      </div>
                      <div className="w-52 shrink-0 flex flex-col gap-2 px-3 py-3 bg-studio-bg rounded-lg border border-studio-border overflow-y-auto" style={{ maxHeight: 384 }}>
                        {referenceFrameUrl && (
                          <div className="rounded overflow-hidden border border-studio-border">
                            <img src={referenceFrameUrl} alt="Reference" className="w-full h-16 object-cover" />
                          </div>
                        )}
                        <div className="flex flex-col gap-1.5">
                          <div className="flex items-center gap-1.5">
                            <label className="text-[9px] font-semibold text-studio-muted uppercase shrink-0 w-8">Horiz</label>
                            <input
                              type="range" min={0} max={360} step={5}
                              value={camHorizontal}
                              onChange={(e) => setCamHorizontal(parseInt(e.target.value))}
                              className="w-16 accent-studio-accent"
                            />
                            <span className="text-[9px] text-studio-muted w-7 text-right tabular-nums">{camHorizontal}°</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <label className="text-[9px] font-semibold text-studio-muted uppercase shrink-0 w-8">Vert</label>
                            <input
                              type="range" min={-30} max={60} step={5}
                              value={camVertical}
                              onChange={(e) => setCamVertical(parseInt(e.target.value))}
                              className="w-16 accent-studio-accent"
                            />
                            <span className="text-[9px] text-studio-muted w-7 text-right tabular-nums">{camVertical}°</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <label className="text-[9px] font-semibold text-studio-muted uppercase shrink-0 w-8">Zoom</label>
                            <input
                              type="range" min={0} max={12} step={0.5}
                              value={camZoom}
                              onChange={(e) => setCamZoom(parseFloat(e.target.value))}
                              className="w-16 accent-studio-accent"
                            />
                            <span className="text-[9px] text-studio-muted w-8 text-right tabular-nums">{camZoom.toFixed(1)}</span>
                          </div>
                        </div>
                        <div className="mt-1.5 px-2 py-1 bg-studio-bg rounded border border-studio-border/50">
                          <span className="text-[8px] text-studio-accent/80 font-mono leading-tight">
                            {(() => {
                              const h = camHorizontal % 360;
                              const hDir = h < 22.5 || h >= 337.5 ? "front view"
                                : h < 67.5 ? "front-right quarter"
                                : h < 112.5 ? "right side"
                                : h < 157.5 ? "back-right quarter"
                                : h < 202.5 ? "back view"
                                : h < 247.5 ? "back-left quarter"
                                : h < 292.5 ? "left side"
                                : "front-left quarter";
                              const v = camVertical;
                              const vDir = v < -15 ? "low-angle" : v < 15 ? "eye-level" : v < 45 ? "elevated" : "high-angle";
                              const z = camZoom;
                              const dist = z < 1 ? "extreme wide" : z < 2 ? "wide" : z < 4 ? "medium" : z < 7 ? "close-up" : "extreme close-up";
                              let prompt = `<sks> ${hDir} ${vDir} ${dist}`;
                              const hints: string[] = [];
                              if (hDir === "back view") hints.push("character seen from behind");
                              else if (hDir.includes("back-")) hints.push("partial back view, character turned away");
                              if (dist === "extreme close-up") hints.push("tight framing on facial features, eyes and mouth detail");
                              else if (dist === "extreme wide") hints.push("figures small in frame, environment dominates");
                              if (vDir === "high-angle") hints.push("looking down from above, top-down perspective");
                              else if (vDir === "low-angle") hints.push("camera tilted upward, dramatic perspective");
                              if (hints.length > 0) prompt += ` (${hints.join(", ")})`;
                              return prompt;
                            })()}
                          </span>
                        </div>
                        <div className="border-t border-studio-border pt-2">
                          <ShotTypeLibrary
                            selectedPresetId={selectedPresetId || undefined}
                            onSelect={(p) => {
                              setSelectedPresetId(p.id);
                              setCamHorizontal(p.horizontalAngle);
                              setCamVertical(p.verticalAngle);
                              setCamZoom(p.zoom);
                              setNewPrompt(p.prompt || "");
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                )}
                {sceneRecipeCount > 0 && (
                  <span className="flex items-center gap-1 text-[10px] text-studio-muted">
                    <Layers className="w-3 h-3" />
                    {sceneRecipeCount} recipe
                  </span>
                )}
              </div>
              {/* Advanced settings toggle */}
              <button
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="flex items-center gap-1.5 mt-2 px-2 py-1 rounded-lg text-xs text-studio-muted hover:text-studio-accent hover:bg-studio-panelHover border border-studio-border transition-colors"
              >
                {showAdvanced ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                Advanced Settings
              </button>
              {showAdvanced && (
                <div className="mt-2 p-3 bg-studio-bg rounded-lg border border-studio-border space-y-2">
                  <div>
                    <label className="text-[10px] font-semibold text-studio-muted uppercase tracking-wider block mb-1">Negative Prompt</label>
                    <textarea
                      value={advNegativePrompt}
                      onChange={(e) => setAdvNegativePrompt(e.target.value)}
                      placeholder="e.g. background characters, crowd, extra people..."
                      rows={2}
                      className="w-full bg-studio-panel border border-studio-border rounded-lg p-2 text-[10px] focus:border-studio-accent focus:outline-none resize-none"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] font-semibold text-studio-muted uppercase tracking-wider block mb-1">Seed</label>
                      <input
                        type="number"
                        value={advSeed}
                        onChange={(e) => setAdvSeed(e.target.value)}
                        placeholder="Random"
                        className="w-full bg-studio-panel border border-studio-border rounded-lg px-2 py-1.5 text-[10px] focus:border-studio-accent focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-semibold text-studio-muted uppercase tracking-wider block mb-1">Denoise</label>
                      <input
                        type="number"
                        step="0.05"
                        min="0"
                        max="1"
                        value={advDenoise}
                        onChange={(e) => setAdvDenoise(e.target.value)}
                        placeholder="1.0"
                        className="w-full bg-studio-panel border border-studio-border rounded-lg px-2 py-1.5 text-[10px] focus:border-studio-accent focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-semibold text-studio-muted uppercase tracking-wider block mb-1">CFG</label>
                      <input
                        type="number"
                        step="0.5"
                        min="0"
                        max="20"
                        value={advCfg}
                        onChange={(e) => setAdvCfg(e.target.value)}
                        placeholder="Default (1)"
                        className="w-full bg-studio-panel border border-studio-border rounded-lg px-2 py-1.5 text-[10px] focus:border-studio-accent focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-semibold text-studio-muted uppercase tracking-wider block mb-1">Steps</label>
                      <input
                        type="number"
                        min="1"
                        max="50"
                        value={advSteps}
                        onChange={(e) => setAdvSteps(e.target.value)}
                        placeholder="Default (4)"
                        className="w-full bg-studio-panel border border-studio-border rounded-lg px-2 py-1.5 text-[10px] focus:border-studio-accent focus:outline-none"
                      />
                    </div>
                  </div>
                  <p className="text-[9px] text-studio-muted">
                    Denoise: 1.0 = generate from noise (new composition), 0.75 = edit base image lightly, 0.5 = minimal changes to base image
                  </p>
                  <p className="text-[9px] text-studio-muted">
                    CFG: Higher = stronger prompt adherence (default 1 for Lightning LoRA). Steps: More = higher quality (default 4 for Lightning). Leave blank for defaults.
                  </p>
                </div>
              )}
              <div className="flex items-center gap-3 mt-2">
                <div className="flex-1" />
                <button
                  onClick={handleCreateAndGenerate}
                  disabled={creating || (isFirstShotInScene && !newPrompt.trim())}
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
