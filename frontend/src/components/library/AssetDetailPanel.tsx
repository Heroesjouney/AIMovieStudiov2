"use client";

import { useState, useEffect } from "react";
import { useStudioStore } from "@/lib/store";
import {
  generateAssetSheet, generateTurnaroundSheet, checkGenerationStatus, saveGeneratedToAsset, fetchAssets,
  analyzeCharacter, checkAnalysisStatus, updateAsset,
  getDrivers, getAssetThumbnailUrl, type AssetResponse, type DriverInfo,
} from "@/lib/api";
import {
  Layers, Loader2, X, Save, Download, Check, Sparkles, Cloud, HardDrive, Lock, Wand2, ZoomIn,
} from "lucide-react";

const typeIcons: Record<string, string> = {
  character: "👤",
  location: "📍",
  prop: "📦",
  vehicle: "🚗",
  style: "🎨",
  effect: "✨",
};

const sheetTypeLabels: Record<string, string> = {
  character: "Character Sheet",
  prop: "Prop Sheet",
  vehicle: "Vehicle Sheet",
  location: "Location Sheet",
  style: "Style Reference",
  effect: "Effect Reference",
};

interface SheetTemplate {
  id: string;
  label: string;
  prompt: string;
}

const sheetTemplates: Record<string, SheetTemplate[]> = {
  character: [
    {
      id: "character_sheet",
      label: "Character Sheet",
      prompt: "Multi-view character turnaround sheet with front, side, back, three-quarter, and face closeup views.",
    },
  ],
  prop: [
    {
      id: "prop_sheet",
      label: "Prop Sheet",
      prompt: "prop design sheet, multiple angles, front view, side view, top view, three-quarter view, detail close-ups, pure white background, isolated on white, no background, clean design sheet",
    },
  ],
  vehicle: [
    {
      id: "vehicle_sheet",
      label: "Vehicle Sheet",
      prompt: "vehicle design sheet, multiple angles, front view, side view, rear view, three-quarter view, pure white background, isolated on white, no background, clean design sheet",
    },
  ],
  location: [
    {
      id: "location_sheet",
      label: "Location Sheet",
      prompt: "location design sheet, wide establishing shot, different camera angles, aerial view, ground level view, three-quarter view, clean design sheet",
    },
  ],
  style: [
    {
      id: "style_sheet",
      label: "Style Reference",
      prompt: "style reference sheet, color palette, texture samples, lighting examples, grade comparison, visual mood board, clean design sheet",
    },
  ],
  effect: [
    {
      id: "effect_sheet",
      label: "Effect Reference",
      prompt: "visual effect reference sheet, multiple frames showing the effect from different angles and stages, clean design sheet",
    },
  ],
};

interface Props {
  projectId: string;
  asset: AssetResponse;
}

export function AssetDetailPanel({ projectId, asset }: Props) {
  const { setSelectedAssetId, setAssets } = useStudioStore();

  const [generating, setGenerating] = useState(false);
  const [status, setStatus] = useState("");
  const [resultImages, setResultImages] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [seed, setSeed] = useState("");
  const [customPrompt, setCustomPrompt] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState<string>(
    asset.type === "character" ? "character_sheet" : (sheetTemplates[asset.type]?.[0]?.id || "character_sheet")
  );
  const [promptMode, setPromptMode] = useState<"template" | "custom">("template");
  const [savingIndex, setSavingIndex] = useState<number | null>(null);
  const [savedIndices, setSavedIndices] = useState<Set<number>>(new Set());
  const [charDescription, setCharDescription] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [drivers, setDrivers] = useState<DriverInfo[]>([]);
  const [selectedDriver, setSelectedDriver] = useState<string>("qwen_image_edit");
  const [progressViews, setProgressViews] = useState({ completed: 0, total: 0 });
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const isTurnaroundPro = asset.type === "character";

  // Fetch available image drivers on mount
  useEffect(() => {
    getDrivers().then((data) => {
      const imageDrivers = data.image.filter((d) => d.supported_features.includes("image_to_image"));
      setDrivers(imageDrivers);
      // Default to qwen_image_edit if available, otherwise first driver
      if (!imageDrivers.find((d) => d.driver_id === "qwen_image_edit")) {
        setSelectedDriver(imageDrivers[0]?.driver_id || "qwen_image_edit");
      }
    }).catch(() => {
      // Fallback: just use ComfyUI
      setDrivers([]);
    });
  }, []);

  // Lock driver to ComfyUI when Turnaround Pro is selected
  useEffect(() => {
    if (isTurnaroundPro) {
      setSelectedDriver("qwen_image_edit");
    }
  }, [isTurnaroundPro]);

  const selectedDriverInfo = drivers.find((d) => d.driver_id === selectedDriver);

  const thumbUrl = getAssetThumbnailUrl(asset);
  const sheetLabel = sheetTypeLabels[asset.type] || "Design Sheet";
  const templates = sheetTemplates[asset.type] || sheetTemplates.character;
  const activeTemplate = templates.find((t) => t.id === selectedTemplate) || templates[0];
  const activePrompt = promptMode === "custom" ? customPrompt : activeTemplate?.prompt || "";

  const handleClose = () => {
    setSelectedAssetId(null);
  };

  const refreshAssets = async () => {
    try {
      const fresh = await fetchAssets(projectId);
      setAssets(fresh);
    } catch {}
  };

  const handleAutoDescribe = async (): Promise<string> => {
    setAnalyzing(true);
    setError(null);
    try {
      const response = await analyzeCharacter(projectId, asset.id);
      if (response.status === "failed") {
        setError(response.error_message || "Failed to analyze character");
        setAnalyzing(false);
        return "";
      }

      return await new Promise<string>((resolve) => {
        let analysisPollErrors = 0;
        const pollInterval = setInterval(async () => {
          try {
            const statusResp = await checkAnalysisStatus(response.job_id);
            analysisPollErrors = 0;
            if (statusResp.status === "completed") {
              clearInterval(pollInterval);
              const desc = statusResp.metadata?.description || "";
              setCharDescription(desc);
              if (desc) {
                try {
                  await updateAsset(projectId, asset.id, { description: desc });
                  await refreshAssets();
                } catch (e) {
                  console.warn("[AssetDetailPanel] failed to persist description:", e);
                }
              }
              setAnalyzing(false);
              resolve(desc);
            } else if (statusResp.status === "failed") {
              clearInterval(pollInterval);
              setError(statusResp.error_message || "Failed to analyze character");
              setAnalyzing(false);
              resolve("");
            }
          } catch (pollErr) {
            analysisPollErrors++;
            console.warn("[AssetDetailPanel] analysis poll error:", pollErr);
            if (analysisPollErrors >= 5) {
              clearInterval(pollInterval);
              setError("Lost connection to backend while polling.");
              setAnalyzing(false);
              resolve("");
            }
          }
        }, 2000);
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to analyze character");
      setAnalyzing(false);
      return "";
    }
  };

  const handleGenerateSheet = async () => {
    setGenerating(true);
    setError(null);
    setResultImages([]);
    setSavedIndices(new Set());
    setStatus("Submitting...");

    try {
      let response;

      if (isTurnaroundPro) {
        // Auto-describe in background if in template mode and no description yet
        let description = charDescription;
        if (promptMode === "template" && !description) {
          setStatus("Auto-describing character...");
          description = await handleAutoDescribe();
        }

        setStatus("Submitting...");
        response = await generateTurnaroundSheet(
          projectId,
          asset.id,
          description || undefined,
          promptMode === "custom" ? customPrompt : undefined,
          seed ? Number(seed) : undefined,
        );
        setProgressViews({ completed: 0, total: 5 });
      } else {
        response = await generateAssetSheet(
          projectId,
          asset.id,
          activePrompt || undefined,
          seed ? Number(seed) : undefined,
          selectedDriver !== "qwen_image_edit" ? selectedDriver : undefined,
        );
      }

      if (response.status === "failed") {
        setError(response.error_message || "Sheet generation failed");
        setGenerating(false);
        return;
      }

      let sheetPollErrors = 0;
      const pollInterval = setInterval(async () => {
        try {
          const statusResp = await checkGenerationStatus(response.job_id, isTurnaroundPro ? "qwen_image_edit" : selectedDriver);
          sheetPollErrors = 0;
          if (statusResp.status === "completed") {
            clearInterval(pollInterval);
            const images = statusResp.image_urls || [];
            setResultImages(images);
            setStatus("");
            setGenerating(false);
            setProgressViews({ completed: 0, total: 0 });
            if (images.length > 0) {
              setSavingIndex(0);
              try {
                await saveGeneratedToAsset(
                  projectId,
                  images[0],
                  `${asset.name} - ${sheetLabel}`,
                  asset.type,
                  activePrompt || undefined,
                  charDescription || asset.description || undefined,
                );
                try {
                  await updateAsset(projectId, asset.id, { character_sheet_path: images[0] });
                } catch (e) {
                  console.warn('[AssetDetailPanel] failed to store sheet path:', e);
                }
                setSavedIndices(new Set([0]));
                await refreshAssets();
              } catch (err) {
                console.error("Auto-save failed:", err);
              } finally {
                setSavingIndex(null);
              }
            }
          } else if (statusResp.status === "failed") {
            clearInterval(pollInterval);
            setError(statusResp.error_message || "Sheet generation failed");
            setGenerating(false);
            setProgressViews({ completed: 0, total: 0 });
          } else {
            const meta = statusResp.metadata;
            if (meta?.completed_views !== undefined && meta?.total_views !== undefined) {
              setStatus(`Generating ${meta.completed_views}/${meta.total_views} views...`);
              setProgressViews({ completed: meta.completed_views, total: meta.total_views });
            } else {
              setStatus(statusResp.status === "in_queue" ? "In queue..." : "Generating...");
            }
          }
        } catch (pollErr) {
          sheetPollErrors++;
          console.warn("[AssetDetailPanel] sheet poll error:", pollErr);
          if (sheetPollErrors >= 5) {
            clearInterval(pollInterval);
            setError("Lost connection to backend while polling. The sheet may still be generating — refresh later.");
            setGenerating(false);
            setProgressViews({ completed: 0, total: 0 });
          }
        }
      }, 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate sheet");
      setGenerating(false);
    }
  };

  const handleSaveOne = async (index: number, imageUrl: string) => {
    setSavingIndex(index);
    try {
      await saveGeneratedToAsset(
        projectId,
        imageUrl,
        `${asset.name} - ${sheetLabel}`,
        asset.type,
        activePrompt || undefined,
        charDescription || asset.description || undefined,
      );
      // Also store the sheet image on the original asset for storyboard reference
      if (index === 0) {
        try {
          await updateAsset(projectId, asset.id, { character_sheet_path: imageUrl });
        } catch (e) {
          console.warn('[AssetDetailPanel] failed to store sheet path:', e);
        }
      }
      setSavedIndices((prev) => new Set(prev).add(index));
      await refreshAssets();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSavingIndex(null);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in"
      onClick={handleClose}
    >
      <div
        className="bg-studio-panel border border-studio-border rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-studio-border shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-base">{typeIcons[asset.type] || "🖼️"}</span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-studio-text truncate">{asset.name}</p>
              <p className="text-[10px] text-studio-muted uppercase tracking-wider">{asset.type}</p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="p-1.5 rounded-lg hover:bg-studio-border text-studio-muted hover:text-studio-text transition-colors shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 space-y-4 overflow-y-auto">
          {/* Preview */}
          {thumbUrl && (
            <div className="relative rounded-xl overflow-hidden border border-studio-border group">
              <img src={thumbUrl} alt={asset.name} className="w-full max-h-48 object-contain bg-studio-bg cursor-zoom-in" onClick={() => setLightboxUrl(thumbUrl)} />
              <div className="absolute top-2 right-2 p-1.5 bg-black/60 backdrop-blur-sm text-white rounded-lg opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 text-[10px]">
                <ZoomIn className="w-3 h-3" />
                Click to enlarge
              </div>
            </div>
          )}

          {/* Generation metadata */}
          {asset.generation_prompt && (
            <div className="p-3 bg-studio-bg rounded-xl border border-studio-border/50 space-y-1.5">
              <div className="flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-studio-accent/60" />
                <p className="text-[10px] font-semibold text-studio-muted uppercase tracking-wider">Generation Prompt</p>
              </div>
              <p className="text-xs text-studio-text/80 leading-relaxed">{asset.generation_prompt}</p>
            </div>
          )}

          {/* Design Sheet section */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-studio-accent" />
              <p className="text-sm font-semibold text-studio-text">{sheetLabel}</p>
            </div>
            <p className="text-xs text-studio-muted">
              Generate a multi-view design sheet from this {asset.type}.
            </p>

            {/* Driver / API selector */}
            <div>
              <label className="block text-[10px] font-semibold text-studio-muted uppercase tracking-wider mb-1.5">
                Generation Backend
              </label>
              {drivers.length === 0 ? (
                <div className="flex items-center gap-2 px-3 py-2 bg-studio-bg border border-studio-border rounded-lg text-xs text-studio-muted">
                  <HardDrive className="w-3.5 h-3.5" />
                  Local ComfyUI (default)
                </div>
              ) : (
                <div className="relative">
                  <select
                    value={selectedDriver}
                    onChange={(e) => setSelectedDriver(e.target.value)}
                    disabled={isTurnaroundPro}
                    className={`w-full appearance-none bg-studio-bg border border-studio-border rounded-lg px-3 py-2 text-xs text-studio-text focus:border-studio-accent focus:outline-none disabled:opacity-60 disabled:cursor-not-allowed pr-8`}
                  >
                    {drivers.map((d) => (
                      <option key={d.driver_id} value={d.driver_id}>
                        {d.display_name}
                      </option>
                    ))}
                  </select>
                  <div className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none">
                    {selectedDriverInfo?.category === "cloud" ? (
                      <Cloud className="w-3.5 h-3.5 text-studio-muted" />
                    ) : (
                      <HardDrive className="w-3.5 h-3.5 text-studio-muted" />
                    )}
                  </div>
                </div>
              )}
              {isTurnaroundPro && (
                <div className="flex items-center gap-1.5 mt-1.5">
                  <Lock className="w-3 h-3 text-studio-muted" />
                  <p className="text-[10px] text-studio-muted">
                    Turnaround Pro requires local ComfyUI (Multiangle LoRA + multi-step pipeline)
                  </p>
                </div>
              )}
            </div>

            {/* Mode toggle: Templates vs Custom */}
            <div className="flex gap-1.5">
              <button
                onClick={() => setPromptMode("template")}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors border ${
                  promptMode === "template"
                    ? "bg-studio-accent/20 text-studio-accent border-studio-accent/40"
                    : "bg-studio-bg text-studio-muted border-studio-border hover:text-studio-text"
                }`}
              >
                Templates
              </button>
              <button
                onClick={() => setPromptMode("custom")}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors border ${
                  promptMode === "custom"
                    ? "bg-studio-accent/20 text-studio-accent border-studio-accent/40"
                    : "bg-studio-bg text-studio-muted border-studio-border hover:text-studio-text"
                }`}
              >
                Custom
              </button>
            </div>

            {/* Template selector */}
            {promptMode === "template" ? (
              <div className="space-y-2">
                <div className="flex flex-wrap gap-1.5">
                  {templates.map((tpl) => (
                    <button
                      key={tpl.id}
                      onClick={() => setSelectedTemplate(tpl.id)}
                      className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors border ${
                        selectedTemplate === tpl.id
                          ? "bg-studio-accent/20 text-studio-accent border-studio-accent/40"
                          : "bg-studio-bg text-studio-muted border-studio-border hover:text-studio-text"
                      }`}
                    >
                      {tpl.label}
                    </button>
                  ))}
                </div>
                <div className="p-2.5 bg-studio-bg rounded-lg border border-studio-border/50">
                  <p className="text-[11px] text-studio-text/70 leading-relaxed">{activeTemplate?.prompt}</p>
                </div>
                {isTurnaroundPro && (
                  <p className="text-[10px] text-studio-muted mt-1 leading-relaxed">
                    Generates 5 separate views (front, side, back, three-quarter, face closeup) with auto-described character context, composited into a single sheet.
                  </p>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                <div>
                  <label className="block text-[10px] font-semibold text-studio-muted uppercase tracking-wider mb-1.5">
                    Custom Prompt
                  </label>
                  <textarea
                    value={customPrompt}
                    onChange={(e) => setCustomPrompt(e.target.value)}
                    rows={3}
                    className="w-full bg-studio-bg border border-studio-border rounded-xl p-2.5 text-sm text-studio-text focus:border-studio-accent focus:ring-2 focus:ring-studio-accent/20 focus:outline-none resize-none"
                    placeholder="Write your own design sheet prompt..."
                  />
                </div>
                {isTurnaroundPro && (
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="block text-[10px] font-semibold text-studio-muted uppercase tracking-wider">
                        Character Description <span className="normal-case opacity-50">(optional)</span>
                      </label>
                      <button
                        onClick={handleAutoDescribe}
                        disabled={analyzing}
                        className="flex items-center gap-1 px-2 py-1 text-[10px] font-medium text-studio-accent hover:bg-studio-accent/10 rounded-lg transition-colors disabled:opacity-40"
                      >
                        {analyzing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Wand2 className="w-3 h-3" />}
                        {analyzing ? "Analyzing..." : "Auto-Describe"}
                      </button>
                    </div>
                    <textarea
                      value={charDescription}
                      onChange={(e) => setCharDescription(e.target.value)}
                      rows={2}
                      className="w-full bg-studio-bg border border-studio-border rounded-xl p-2.5 text-sm text-studio-text focus:border-studio-accent focus:ring-2 focus:ring-studio-accent/20 focus:outline-none resize-none"
                      placeholder="e.g. a woman in her 30s wearing a brown leather jacket, dark jeans, boots, short black hair"
                    />
                  </div>
                )}
              </div>
            )}

            {/* Seed */}
            <div>
              <label className="block text-[10px] font-semibold text-studio-muted uppercase tracking-wider mb-1.5">
                Seed <span className="normal-case opacity-50">(optional)</span>
              </label>
              <input
                value={seed}
                onChange={(e) => setSeed(e.target.value)}
                className="w-full bg-studio-bg border border-studio-border rounded-xl p-2.5 text-sm focus:border-studio-accent focus:outline-none"
                placeholder="Random"
              />
            </div>

            {/* Generate button */}
            <button
              onClick={handleGenerateSheet}
              disabled={generating}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-studio-accent hover:bg-studio-accentHover disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm rounded-xl font-medium transition-all hover:scale-[1.01] shadow-lg shadow-studio-accent/20"
            >
              {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              {generating ? (status || "Generating...") : `Generate ${sheetLabel}`}
            </button>

            {/* Progress bar for multi-view generation */}
            {generating && progressViews.total > 0 && (
              <div className="space-y-1.5">
                <div className="flex gap-1.5">
                  {Array.from({ length: progressViews.total }).map((_, i) => (
                    <div
                      key={i}
                      className={`h-1.5 flex-1 rounded-full transition-colors ${
                        i < progressViews.completed
                          ? "bg-studio-accent"
                          : "bg-studio-border"
                      }`}
                    />
                  ))}
                </div>
                <p className="text-[10px] text-studio-muted text-center">
                  {progressViews.completed} of {progressViews.total} views complete
                </p>
              </div>
            )}
          </div>

          {/* Error */}
          {error && (
            <div className="p-3 bg-studio-danger/10 border border-studio-danger/30 rounded-xl text-sm text-studio-danger">
              {error}
            </div>
          )}

          {/* Results */}
          {resultImages.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-semibold text-studio-text">Results</p>
              <div className="space-y-3">
                {resultImages.map((url, i) => {
                  const label = isTurnaroundPro
                    ? i === 0 ? "Composite Sheet" : ["Front", "Side", "Back", "Three-Quarter"][i - 1] || `View ${i}`
                    : `Sheet ${i + 1}`;
                  return (
                    <div key={i} className="relative group rounded-xl overflow-hidden border border-studio-border">
                      <img src={url} alt={label} className="w-full cursor-zoom-in" onClick={() => setLightboxUrl(url)} />
                      <div className="absolute top-2 left-2 px-2 py-1 bg-black/70 backdrop-blur-sm text-white text-[10px] font-medium rounded-lg">
                        {label}
                      </div>
                      <div className="absolute bottom-2 right-2 flex gap-2">
                        <button
                          onClick={() => setLightboxUrl(url)}
                          className="px-3 py-1.5 bg-black/70 backdrop-blur-sm text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1.5"
                        >
                          <ZoomIn className="w-3.5 h-3.5" />
                          View
                        </button>
                        <button
                          onClick={() => handleSaveOne(i, url)}
                          disabled={savingIndex !== null || savedIndices.has(i)}
                          className="px-3 py-1.5 bg-black/70 backdrop-blur-sm text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-60 flex items-center gap-1.5"
                        >
                          {savedIndices.has(i) ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Save className="w-3.5 h-3.5" />}
                          {savedIndices.has(i) ? "Saved" : "Save to Assets"}
                        </button>
                        <a
                          href={url}
                          download
                          className="px-3 py-1.5 bg-black/70 backdrop-blur-sm text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <Download className="w-3.5 h-3.5" />
                        </a>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Lightbox */}
      {lightboxUrl && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
          onClick={() => setLightboxUrl(null)}
        >
          <button
            onClick={() => setLightboxUrl(null)}
            className="absolute top-4 right-4 p-2 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
          <img
            src={lightboxUrl}
            alt="Full size"
            className="max-w-full max-h-full object-contain rounded-lg"
            onClick={(e) => e.stopPropagation()}
          />
          <a
            href={lightboxUrl}
            download
            onClick={(e) => e.stopPropagation()}
            className="absolute bottom-4 right-4 px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-colors flex items-center gap-2 text-sm"
          >
            <Download className="w-4 h-4" />
            Download
          </a>
        </div>
      )}
    </div>
  );
}
