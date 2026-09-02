"use client";

import { useState, useEffect } from "react";
import { useStudioStore } from "@/lib/store";
import {
  type ShotResponse, updateShot, generateShotFrame, checkShotFrameStatus,
} from "@/lib/api";
import {
  Plus, Loader2, ImageIcon, Camera,
  Link2, X, Layers, Sparkles,
  ChevronLeft, ChevronRight,
} from "lucide-react";
import { AssetPicker } from "../shared/AssetPicker";
import { ShotFrameLinker } from "../shared/ShotFrameLinker";
import { ModelSelector } from "../shared/ModelSelector";
import { Lightbox } from "../shared/Lightbox";
import { MultiAnglePanel } from "./MultiAnglePanel";
import { VariationPanel } from "./VariationPanel";
import { RetakePanel } from "./RetakePanel";
import { useGenerationPolling } from "@/lib/useGenerationPolling";

interface Props {
  shot: ShotResponse;
  projectId: string;
  allShots: ShotResponse[];
  onRefresh: () => Promise<void>;
  onClose: () => void;
}

export function ShotDetail({ shot, projectId, allShots, onRefresh, onClose }: Props) {
  const { imageDrivers, selectedImageDriver, assets } = useStudioStore();

  const [prompt, setPrompt] = useState("");
  const [negativePrompt, setNegativePrompt] = useState("");
  const [showAssetPicker, setShowAssetPicker] = useState(false);
  const [linkedImagePaths, setLinkedImagePaths] = useState<string[]>([]);
  const [showImageLinker, setShowImageLinker] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const poll = useGenerationPolling();

  const availableAssets = assets.filter((a) => a.primary_image);

  // Next/prev navigation
  const currentIndex = allShots.findIndex((s) => s.id === shot.id);
  const prevShot = currentIndex > 0 ? allShots[currentIndex - 1] : null;
  const nextShot = currentIndex < allShots.length - 1 ? allShots[currentIndex + 1] : null;

  const handleBindAsset = async (asset: any) => {
    const existing = shot.assets || [];
    if (existing.some((a: any) => a.asset_id === asset.id)) return;
    const newAssets = [...existing, {
      asset_id: asset.id, asset_name: asset.name,
      image_path: asset.primary_image, role: asset.type,
    }];
    await updateShot(projectId, shot.id, { assets: newAssets });
    setShowAssetPicker(false);
    await onRefresh();
  };

  const handleUnbindAsset = async (assetId: string) => {
    const newAssets = (shot.assets || []).filter((a: any) => a.asset_id !== assetId);
    await updateShot(projectId, shot.id, { assets: newAssets });
    await onRefresh();
  };

  const handleAssetRetentionChange = async (assetId: string, retention: string) => {
    const newAssets = (shot.assets || []).map((a: any) =>
      a.asset_id === assetId ? { ...a, retention } : a
    );
    await updateShot(projectId, shot.id, { assets: newAssets });
    await onRefresh();
  };

  const handleGenerateFrame = async () => {
    if (!prompt.trim()) return;
    const recipeParams = shot.generation_recipe?.params;
    const genWidth = recipeParams?.width ?? 1344;
    const genHeight = recipeParams?.height ?? 768;

    try {
      const resp = await generateShotFrame(
        shot.id, prompt, selectedImageDriver,
        negativePrompt || undefined, genWidth, genHeight, undefined,
        linkedImagePaths.length > 0 ? linkedImagePaths : undefined,
      );
      if (resp.status === "failed") { poll.setError(resp.error_message || "Failed"); return; }

      poll.startPolling(
        () => checkShotFrameStatus(resp.job_id, selectedImageDriver),
        async (st) => {
          await updateShot(projectId, shot.id, {
            frame_image_path: st.image_urls?.[0] || "",
            status: "frame_generated",
            generation_recipe: { prompt, negative_prompt: negativePrompt, model_id: selectedImageDriver, params: { width: genWidth, height: genHeight }, timestamp: new Date().toISOString() },
          });
          await onRefresh();
        },
        { intervalMs: 3000 }
      );
    } catch (err) {
      poll.setError(err instanceof Error ? err.message : "Failed");
    }
  };

  // Ctrl+Enter to generate
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter" && !poll.isRunning && prompt.trim()) {
        e.preventDefault();
        handleGenerateFrame();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [poll.isRunning, prompt]);

  const navigateToShot = (shotId: string) => {
    useStudioStore.getState().setSelectedShotId(shotId);
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header bar with nav */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-studio-border shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          {prevShot && (
            <button onClick={() => navigateToShot(prevShot.id)} className="p-1 rounded-lg hover:bg-studio-panelHover text-studio-muted hover:text-studio-accent transition-colors" title="Previous shot">
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
          )}
          <div className="min-w-0">
            <h2 className="text-xs font-semibold truncate">{shot.name}</h2>
            <p className="text-[10px] text-studio-muted truncate">{shot.description || "No description"}</p>
          </div>
          {nextShot && (
            <button onClick={() => navigateToShot(nextShot.id)} className="p-1 rounded-lg hover:bg-studio-panelHover text-studio-muted hover:text-studio-accent transition-colors" title="Next shot">
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-studio-panelHover text-studio-muted hover:text-studio-text transition-colors">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-auto p-4">
        <div className="max-w-2xl mx-auto space-y-3">
          {/* Frame preview */}
          <div
            className="bg-studio-panel rounded-lg border border-studio-border overflow-hidden flex items-center justify-center relative group cursor-zoom-in"
            style={{ aspectRatio: shot.generation_recipe?.params?.width && shot.generation_recipe?.params?.height
              ? `${shot.generation_recipe.params.width} / ${shot.generation_recipe.params.height}`
              : "16 / 9" }}
            onClick={() => shot.frame_image_path && setLightboxUrl(shot.frame_image_path)}
          >
            {shot.frame_image_path ? (
              <img src={shot.frame_image_path} alt="Frame" className="w-full h-full object-contain" />
            ) : (
              <div className="text-center text-studio-muted">
                <ImageIcon className="w-10 h-10 mx-auto mb-1.5 opacity-50" />
                <p className="text-xs">No frame generated yet</p>
              </div>
            )}
          </div>

          {/* Angle images */}
          {Object.keys(shot.angle_images || {}).length > 0 && (
            <div>
              <h3 className="text-xs font-semibold flex items-center gap-1.5 mb-2">
                <Camera className="w-3.5 h-3.5 text-studio-accent" />
                Camera Angles ({Object.keys(shot.angle_images).length})
              </h3>
              <div className="grid grid-cols-4 gap-1.5">
                {Object.entries(shot.angle_images).map(([angle, url]) => (
                  <div key={angle} className="cursor-zoom-in" onClick={() => setLightboxUrl(url as string)}>
                    <img src={url as string} alt={angle} className="w-full aspect-video object-cover rounded-lg border border-studio-border hover:border-studio-accent/40 transition-colors" />
                    <p className="text-[10px] text-studio-muted mt-0.5 text-center capitalize">{angle.replace(/_/g, " ")}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Reference assets */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <h3 className="text-xs font-semibold flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-studio-accent" />
                Reference Assets
              </h3>
              <button onClick={() => setShowAssetPicker(!showAssetPicker)} className="flex items-center gap-1 px-2 py-0.5 text-[10px] rounded-lg bg-studio-panel hover:bg-studio-panelHover border border-studio-border transition-colors">
                <Plus className="w-2.5 h-2.5" /> Add Asset
              </button>
            </div>

            {showAssetPicker && (
              <div className="mb-2">
                <AssetPicker
                  assets={availableAssets}
                  excludeIds={new Set((shot.assets || []).map((a: any) => a.asset_id))}
                  onSelect={handleBindAsset}
                  onClose={() => setShowAssetPicker(false)}
                  compact
                />
              </div>
            )}

            <div className="flex gap-1.5 flex-wrap">
              {(shot.assets || []).map((a: any, i: number) => (
                <div key={i} className="group flex flex-col gap-1 px-2 py-1 bg-studio-panel rounded-lg border border-studio-border text-[10px]">
                  <div className="flex items-center gap-1.5">
                    {a.image_path && <img src={a.image_path} alt="" className="w-5 h-5 rounded object-cover" />}
                    <span>{a.asset_name}</span>
                    <span className="text-[9px] text-studio-muted capitalize">{a.role}</span>
                    <button onClick={() => handleUnbindAsset(a.asset_id)} className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-studio-danger/20 text-studio-danger transition-all">
                      <X className="w-2.5 h-2.5" />
                    </button>
                  </div>
                  <select
                    value={a.retention || "fully_preserved"}
                    onChange={(e) => handleAssetRetentionChange(a.asset_id, e.target.value)}
                    className="text-[9px] bg-studio-bg border border-studio-border rounded px-1 py-0.5 focus:outline-none focus:border-studio-accent"
                  >
                    <option value="fully_preserved">Preserve Exactly</option>
                    <option value="partially_preserved">Partial Match</option>
                    <option value="attribute_transfer">Attribute Transfer</option>
                    <option value="weak_reference">Loose Reference</option>
                  </select>
                </div>
              ))}
              {(shot.assets || []).length === 0 && <p className="text-[10px] text-studio-muted">No assets bound. Add assets for consistency.</p>}
            </div>
          </div>

          {/* Generate frame */}
          <div className="p-3 bg-studio-panel rounded-lg border border-studio-border">
            <h3 className="text-xs font-semibold mb-2">Generate Storyboard Frame</h3>
            <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={2} placeholder="Describe the shot composition..."
              className="w-full bg-studio-bg border border-studio-border rounded-lg p-2 text-xs mb-1 focus:border-studio-accent focus:ring-2 focus:ring-studio-accent/20 focus:outline-none resize-none"
              onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleGenerateFrame(); }} />
            <div className="flex justify-end mb-1.5">
              <span className={`text-[9px] ${prompt.trim().split(/\s+/).filter(Boolean).length >= 350 ? "text-green-400" : prompt.trim().split(/\s+/).filter(Boolean).length > 0 ? "text-yellow-400" : "text-studio-muted"}`}>
                Words: {prompt.trim().split(/\s+/).filter(Boolean).length} / 350-500
              </span>
            </div>
            <input value={negativePrompt} onChange={(e) => setNegativePrompt(e.target.value)} placeholder="Negative prompt (optional)..."
              className="w-full bg-studio-bg border border-studio-border rounded-lg p-1.5 text-[10px] mb-2 focus:border-studio-accent focus:outline-none" />

            <div className="flex items-center gap-2 mb-2">
              <label className="text-[10px] text-studio-muted whitespace-nowrap">Model:</label>
              <div className="flex-1">
                <ModelSelector
                  drivers={imageDrivers}
                  value={selectedImageDriver}
                  onChange={(v) => useStudioStore.getState().setSelectedImageDriver(v)}
                  compact
                  showBadges
                />
              </div>
            </div>

            <div className="mb-2">
              <ShotFrameLinker
                shots={allShots}
                excludeId={shot.id}
                linkedPaths={linkedImagePaths}
                onLink={(p) => !linkedImagePaths.includes(p) && setLinkedImagePaths([...linkedImagePaths, p])}
                onUnlink={(i) => setLinkedImagePaths(linkedImagePaths.filter((_, idx) => idx !== i))}
                show={showImageLinker}
                onToggle={() => setShowImageLinker(!showImageLinker)}
              />
            </div>

            <button
              onClick={handleGenerateFrame}
              disabled={poll.isRunning || prompt.trim().length === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-studio-accent hover:bg-studio-accentHover disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-medium rounded-lg transition-all"
            >
              {poll.isRunning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
              {poll.isRunning ? (
                <span className="flex items-center gap-1.5">
                  {poll.status}
                  <span className="text-[9px] opacity-70">({poll.elapsedDisplay})</span>
                </span>
              ) : (
                <span className="flex items-center gap-1.5">
                  Generate Frame
                  <kbd className="hidden sm:inline text-[9px] px-1 py-0.5 rounded bg-white/10 border border-white/20">Ctrl+↵</kbd>
                </span>
              )}
            </button>
            {poll.error && <p className="mt-2 text-[10px] text-studio-danger bg-studio-danger/10 p-1.5 rounded">{poll.error}</p>}
          </div>

          {/* Multi-angle generation */}
          {shot.frame_image_path && (
            <MultiAnglePanel shot={shot} projectId={projectId} prompt={prompt} onRefresh={onRefresh} />
          )}

          {/* Shot Variation */}
          {shot.frame_image_path && (
            <VariationPanel shot={shot} projectId={projectId} onRefresh={onRefresh} />
          )}

          {/* Last frame continuity */}
          {shot.last_frame_path && (
            <div className="p-3 bg-studio-panel rounded-lg border border-studio-border">
              <h3 className="text-xs font-semibold flex items-center gap-1.5 mb-2">
                <Link2 className="w-3.5 h-3.5 text-studio-accent" /> Last Frame (Continuity)
              </h3>
              <div className="flex items-center gap-2">
                <img src={shot.last_frame_path} alt="Last frame" className="w-24 aspect-video object-cover rounded-lg border border-studio-border cursor-zoom-in" onClick={() => setLightboxUrl(shot.last_frame_path!)} />
                <p className="text-[10px] text-studio-muted">Auto-passes to the next shot's video generation as the first frame anchor for visual continuity.</p>
              </div>
            </div>
          )}

          {/* Video retake */}
          {shot.video_clip_path && (
            <RetakePanel shot={shot} projectId={projectId} onRefresh={onRefresh} />
          )}

        </div>
      </div>

      {/* Lightbox */}
      {lightboxUrl && (
        <Lightbox src={lightboxUrl} onClose={() => setLightboxUrl(null)} />
      )}
    </div>
  );
}
