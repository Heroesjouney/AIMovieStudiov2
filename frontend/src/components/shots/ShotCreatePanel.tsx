"use client";

import { useState, useRef, useEffect } from "react";
import { useStudioStore } from "@/lib/store";
import {
  fetchShots, createShot, deleteShot, reorderShots,
  generateShotFrame, checkShotFrameStatus, updateShot,
  fetchScenes,
  type ShotResponse,
} from "@/lib/api";
import {
  Plus, Trash2, Clapperboard, GripVertical, Camera, Layers, Sparkles,
  Loader2, X, RefreshCw, ChevronDown, ChevronRight, Link2, Dices,
} from "lucide-react";
import { CameraAngleWidget, type PreviousShotAngle } from "./CameraAngleWidget";
import { ShotTypeLibrary } from "./ShotTypeLibrary";
import { AssetPicker } from "../shared/AssetPicker";
import { ShotFrameLinker } from "../shared/ShotFrameLinker";
import { ModelSelector } from "../shared/ModelSelector";
import { useGenerationPolling } from "@/lib/useGenerationPolling";
import {
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
  { value: "16:9", label: "16:9", width: 1344, height: 768 },
  { value: "2.39:1", label: "2.39:1", width: 1344, height: 562 },
  { value: "2:1", label: "2:1", width: 1344, height: 672 },
  { value: "1.85:1", label: "1.85:1", width: 1344, height: 726 },
  { value: "4:3", label: "4:3", width: 1024, height: 768 },
  { value: "1:1", label: "1:1", width: 1024, height: 1024 },
  { value: "9:16", label: "9:16", width: 768, height: 1344 },
];

interface ShotCreatePanelProps {
  projectId: string;
  selectedSceneId: string | null;
  isFirstShotInScene: boolean;
  sceneRecipeCount: number;
  referenceFrameUrl?: string;
  widgetPreviousShots: PreviousShotAngle[];
  actionAxisAngle?: number;
  lastShotAngle: number | null;
  sortedShots: ShotResponse[];
  assets: any[];
  sceneRecipeAssetIds: Set<string>;
  onClose: () => void;
  onRefresh: () => Promise<void>;
}

export function ShotCreatePanel({
  projectId, selectedSceneId, isFirstShotInScene, sceneRecipeCount,
  referenceFrameUrl, widgetPreviousShots, actionAxisAngle, lastShotAngle,
  sortedShots, assets, sceneRecipeAssetIds, onClose, onRefresh,
}: ShotCreatePanelProps) {
  const { imageDrivers, selectedImageDriver, setSelectedImageDriver } = useStudioStore();

  const [newPrompt, setNewPrompt] = useState("");
  const [artStyle, setArtStyle] = useState("");
  const [aspectRatio, setAspectRatio] = useState("16:9");
  const [camHorizontal, setCamHorizontal] = useState(0);
  const [camVertical, setCamVertical] = useState(0);
  const [camZoom, setCamZoom] = useState(5);
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(null);
  const [newShotAssets, setNewShotAssets] = useState<any[]>([]);
  const [showAssetPicker, setShowAssetPicker] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [linkedImagePaths, setLinkedImagePaths] = useState<string[]>([]);
  const [showImageLinker, setShowImageLinker] = useState(false);
  const [advNegativePrompt, setAdvNegativePrompt] = useState("");
  const [advSeed, setAdvSeed] = useState("");
  const [advDenoise, setAdvDenoise] = useState("");
  const [advCfg, setAdvCfg] = useState("");
  const [advSteps, setAdvSteps] = useState("");

  const poll = useGenerationPolling();

  const availableAssets = assets.filter((a) => a.primary_image && !newShotAssets.some((na) => na.asset_id === a.id));
  const extraAssetCount = newShotAssets.filter((a) => !sceneRecipeAssetIds.has(a.asset_id)).length;
  const crossesLine = lastShotAngle !== null && wouldCrossLine(lastShotAngle, camHorizontal);

  const handleCreateAndGenerate = async () => {
    if (isFirstShotInScene && !newPrompt.trim()) return;
    const wasFirstShot = isFirstShotInScene;

    poll.setStatus("Creating shot...");

    try {
      const shotName = wasFirstShot
        ? newPrompt.slice(0, 40) + (newPrompt.length > 40 ? "..." : "")
        : `Camera: H${camHorizontal}° V${camVertical}° Z${camZoom.toFixed(1)}`;
      const effectiveShotType = wasFirstShot ? "establishing" : "subsequent";
      const shot = await createShot(projectId, shotName, newPrompt || "", selectedSceneId || undefined, effectiveShotType);
      await onRefresh();

      if (newShotAssets.length > 0) {
        await updateShot(projectId, shot.id, { assets: newShotAssets });
      }

      const shotTypeData = SHOT_TYPES.find((t) => t.value === effectiveShotType);
      const shotTypePrompt = shotTypeData?.prompt || "";
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
        linkedImagePaths.length > 0 ? linkedImagePaths : undefined,
        advDenoise ? parseFloat(advDenoise) : undefined,
        advCfg ? parseFloat(advCfg) : undefined,
        advSteps ? parseInt(advSteps) : undefined,
        wasFirstShot ? 0 : camHorizontal,
        wasFirstShot ? 0 : camVertical,
        wasFirstShot ? 1.0 : camZoom,
        wasFirstShot ? undefined : (selectedPresetId || undefined),
      );

      if (resp.status === "failed") {
        poll.setError(resp.error_message || "Generation failed");
        return;
      }

      poll.startPolling(
        () => checkShotFrameStatus(resp.job_id, selectedImageDriver),
        async (st) => {
          const framePath = st.image_urls?.[0] || "";
          await updateShot(projectId, shot.id, {
            frame_image_path: framePath,
            status: "frame_generated",
          });
          setNewPrompt("");
          setNewShotAssets([]);
          setLinkedImagePaths([]);
          setShowImageLinker(false);
          setAspectRatio("16:9");
          setCamHorizontal(0); setCamVertical(0); setCamZoom(5); setSelectedPresetId(null);
          useStudioStore.getState().setSelectedShotId(shot.id);
          useStudioStore.getState().setActiveInspector("shot");
          await onRefresh();
          onClose();
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
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter" && !poll.isRunning && (newPrompt.trim() || !isFirstShotInScene)) {
        e.preventDefault();
        handleCreateAndGenerate();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [poll.isRunning, newPrompt, isFirstShotInScene]);

  const handleClose = () => {
    poll.reset();
    setNewPrompt("");
    setNewShotAssets([]);
    setArtStyle("");
    setAspectRatio("16:9");
    setCamHorizontal(0); setCamVertical(0); setCamZoom(5); setSelectedPresetId(null);
    setLinkedImagePaths([]);
    setShowImageLinker(false);
    setShowAdvanced(false);
    setShowAssetPicker(false);
    onClose();
  };

  return (
    <div className="mb-4 p-4 bg-studio-panel rounded-xl border border-studio-border animate-fade-in">
      <div className="flex items-center justify-between mb-2">
        <label className="text-[10px] font-semibold text-studio-muted uppercase tracking-wider">
          {(isFirstShotInScene || poll.isRunning) ? "New Shot Prompt" : "Camera Position"}
        </label>
        <div className="flex items-center gap-2">
          {poll.isRunning && (
            <span className="text-[10px] text-studio-muted/70 tabular-nums">{poll.elapsedDisplay}</span>
          )}
          <button onClick={handleClose} className="p-1 rounded-lg hover:bg-studio-panelHover text-studio-muted transition-colors">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {(isFirstShotInScene || (poll.isRunning && !useStudioStore.getState().selectedShotId)) && (
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
        {(isFirstShotInScene || poll.isRunning) && (
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
        <div className="w-40">
          <ModelSelector
            drivers={imageDrivers}
            value={selectedImageDriver}
            onChange={setSelectedImageDriver}
            filterFn={(d) => d.driver_id === "qwen_image_edit"}
            compact
          />
        </div>
        {isFirstShotInScene && !poll.isRunning && (
          <span className="text-[10px] text-studio-accent font-medium">
            First shot — auto establishing
          </span>
        )}
        {!isFirstShotInScene && !poll.isRunning && (
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
                      setCamHorizontal(suggestReverse(lastShotAngle));
                    }
                  }}
                  className="ml-auto text-[9px] px-2 py-0.5 rounded bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-400 transition-colors"
                >
                  Fix: Reverse Angle
                </button>
              </div>
            )}

            {/* Action prompt */}
            <textarea
              value={newPrompt}
              onChange={(e) => setNewPrompt(e.target.value)}
              placeholder="Action prompt... (e.g. 'knight draws sword') — leave empty for camera-only"
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
                    <input type="range" min={0} max={360} step={5} value={camHorizontal}
                      onChange={(e) => setCamHorizontal(parseInt(e.target.value))} className="w-16 accent-studio-accent" />
                    <span className="text-[9px] text-studio-muted w-7 text-right tabular-nums">{camHorizontal}°</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <label className="text-[9px] font-semibold text-studio-muted uppercase shrink-0 w-8">Vert</label>
                    <input type="range" min={-30} max={60} step={5} value={camVertical}
                      onChange={(e) => setCamVertical(parseInt(e.target.value))} className="w-16 accent-studio-accent" />
                    <span className="text-[9px] text-studio-muted w-7 text-right tabular-nums">{camVertical}°</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <label className="text-[9px] font-semibold text-studio-muted uppercase shrink-0 w-8">Zoom</label>
                    <input type="range" min={0} max={12} step={0.5} value={camZoom}
                      onChange={(e) => setCamZoom(parseFloat(e.target.value))} className="w-16 accent-studio-accent" />
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
                      let promptText = `<sks> ${hDir} ${vDir} ${dist}`;
                      const hints: string[] = [];
                      if (hDir === "back view") hints.push("character seen from behind");
                      else if (hDir.includes("back-")) hints.push("partial back view, character turned away");
                      if (dist === "extreme close-up") hints.push("tight framing on facial features, eyes and mouth detail");
                      else if (dist === "extreme wide") hints.push("figures small in frame, environment dominates");
                      if (vDir === "high-angle") hints.push("looking down from above, top-down perspective");
                      else if (vDir === "low-angle") hints.push("camera tilted upward, dramatic perspective");
                      if (hints.length > 0) promptText += ` (${hints.join(", ")})`;
                      return promptText;
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
              <div className="flex gap-1">
                <input
                  type="number"
                  value={advSeed}
                  onChange={(e) => setAdvSeed(e.target.value.replace(/[^0-9]/g, ""))}
                  placeholder="Random"
                  className="w-full bg-studio-panel border border-studio-border rounded-lg px-2 py-1.5 text-[10px] focus:border-studio-accent focus:outline-none"
                />
                <button
                  onClick={() => setAdvSeed(String(Math.floor(Math.random() * 999999999)))}
                  className="px-1.5 rounded-lg bg-studio-panel border border-studio-border hover:border-studio-accent text-studio-muted hover:text-studio-accent transition-colors"
                  title="Randomize seed"
                >
                  <Dices className="w-3 h-3" />
                </button>
              </div>
            </div>
            <div>
              <label className="text-[10px] font-semibold text-studio-muted uppercase tracking-wider block mb-1">Denoise</label>
              <input
                type="number" step="0.05" min="0" max="1"
                value={advDenoise}
                onChange={(e) => setAdvDenoise(e.target.value)}
                placeholder="1.0"
                className="w-full bg-studio-panel border border-studio-border rounded-lg px-2 py-1.5 text-[10px] focus:border-studio-accent focus:outline-none"
              />
            </div>
            <div>
              <label className="text-[10px] font-semibold text-studio-muted uppercase tracking-wider block mb-1">CFG</label>
              <input
                type="number" step="0.5" min="0" max="20"
                value={advCfg}
                onChange={(e) => setAdvCfg(e.target.value)}
                placeholder="Default (1)"
                className="w-full bg-studio-panel border border-studio-border rounded-lg px-2 py-1.5 text-[10px] focus:border-studio-accent focus:outline-none"
              />
            </div>
            <div>
              <label className="text-[10px] font-semibold text-studio-muted uppercase tracking-wider block mb-1">Steps</label>
              <input
                type="number" min="1" max="50"
                value={advSteps}
                onChange={(e) => setAdvSteps(e.target.value)}
                placeholder="Default (4)"
                className="w-full bg-studio-panel border border-studio-border rounded-lg px-2 py-1.5 text-[10px] focus:border-studio-accent focus:outline-none"
              />
            </div>
          </div>
          <p className="text-[9px] text-studio-muted">
            Denoise: 1.0 = new composition, 0.75 = light edit, 0.5 = minimal changes. CFG default 1 (Lightning LoRA). Steps default 4.
          </p>
        </div>
      )}

      <div className="flex items-center gap-3 mt-2">
        <div className="flex-1" />
        <button
          onClick={handleCreateAndGenerate}
          disabled={poll.isRunning || (isFirstShotInScene && !newPrompt.trim())}
          className="flex items-center gap-1.5 px-4 py-1.5 bg-studio-accent hover:bg-studio-accentHover disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-medium rounded-lg transition-colors"
        >
          {poll.isRunning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
          {poll.isRunning ? (poll.status || "Working...") : (
            <span className="flex items-center gap-1.5">
              Create & Generate
              <kbd className="hidden sm:inline text-[9px] px-1 py-0.5 rounded bg-white/10 border border-white/20">Ctrl+↵</kbd>
            </span>
          )}
        </button>
      </div>
      {poll.error && <p className="mt-2 text-xs text-studio-danger bg-studio-danger/10 p-2 rounded-lg">{poll.error}</p>}

      {/* Shot assets */}
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

        {showAssetPicker && (
          <div className="mt-2">
            <AssetPicker
              assets={availableAssets}
              onSelect={(a) => {
                setNewShotAssets([...newShotAssets, {
                  asset_id: a.id, asset_name: a.name,
                  image_path: a.primary_image, role: a.type,
                }]);
                setShowAssetPicker(false);
              }}
              onClose={() => setShowAssetPicker(false)}
              compact
            />
          </div>
        )}
      </div>

      {/* Linked reference images */}
      {!isFirstShotInScene && (
        <div className="mt-3 pt-3 border-t border-studio-border">
          <ShotFrameLinker
            shots={sortedShots}
            excludeId={undefined}
            linkedPaths={linkedImagePaths}
            onLink={(p) => !linkedImagePaths.includes(p) && setLinkedImagePaths([...linkedImagePaths, p])}
            onUnlink={(i) => setLinkedImagePaths(linkedImagePaths.filter((_, idx) => idx !== i))}
            show={showImageLinker}
            onToggle={() => setShowImageLinker(!showImageLinker)}
          />
        </div>
      )}

      <p className="mt-2 text-[10px] text-studio-muted/50">Ctrl+Enter to generate · Shot name auto-derived from prompt</p>
    </div>
  );
}
