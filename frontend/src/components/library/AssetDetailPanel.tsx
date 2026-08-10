"use client";

import { useState, useEffect } from "react";
import { useStudioStore } from "@/lib/store";
import {
  generateAssetSheet, generateTurnaroundSheet, checkGenerationStatus, saveGeneratedToAsset, fetchAssets,
  analyzeCharacter, checkAnalysisStatus,
  getDrivers, getAssetThumbnailUrl, type AssetResponse, type DriverInfo,
} from "@/lib/api";
import {
  Layers, Loader2, X, Save, Download, Check, Sparkles, Cloud, HardDrive, Lock, Wand2,
} from "lucide-react";

const typeIcons: Record<string, string> = {
  character: "👤",
  location: "📍",
  prop: "📦",
  vehicle: "🚗",
};

const sheetTypeLabels: Record<string, string> = {
  character: "Character Sheet",
  prop: "Prop Sheet",
  vehicle: "Vehicle Sheet",
  location: "Location Sheet",
};

interface SheetTemplate {
  id: string;
  label: string;
  prompt: string;
}

const sheetTemplates: Record<string, SheetTemplate[]> = {
  character: [
    {
      id: "turnaround_pro",
      label: "Turnaround Pro",
      prompt: "Multi-step pipeline: 5 separate view generations (front, side, back, three-quarter, face closeup) using Multiangle LoRA, composited into a single sheet.",
    },
    {
      id: "turnaround",
      label: "Turnaround",
      prompt: "character sheet, multiple views, front view, side view, back view, three-quarter view, full body turnaround, white background, clean design sheet",
    },
    {
      id: "expressions",
      label: "Expressions",
      prompt: "character expression sheet, multiple facial expressions, happy, sad, angry, surprised, neutral, close-up face views, white background, clean design sheet",
    },
    {
      id: "poses",
      label: "Poses",
      prompt: "character pose sheet, multiple action poses, standing, sitting, walking, running, dynamic poses, full body, white background, clean design sheet",
    },
    {
      id: "outfits",
      label: "Outfits",
      prompt: "character outfit sheet, multiple costume variations, casual, formal, action wear, accessories, full body views, white background, clean design sheet",
    },
  ],
  prop: [
    {
      id: "angles",
      label: "Multi-Angle",
      prompt: "prop design sheet, multiple angles, front view, side view, top view, three-quarter view, detail close-ups, white background, clean design sheet",
    },
    {
      id: "details",
      label: "Details",
      prompt: "prop detail sheet, close-up views, material textures, surface details, different parts labeled, white background, clean design sheet",
    },
    {
      id: "variants",
      label: "Variants",
      prompt: "prop variant sheet, multiple design variations, different styles, color options, alternate configurations, white background, clean design sheet",
    },
  ],
  vehicle: [
    {
      id: "angles",
      label: "Multi-Angle",
      prompt: "vehicle design sheet, multiple angles, front view, side view, rear view, three-quarter view, top-down view, white background, clean design sheet",
    },
    {
      id: "interior",
      label: "Interior",
      prompt: "vehicle interior design sheet, dashboard view, seats, cockpit, controls, interior details, white background, clean design sheet",
    },
    {
      id: "variants",
      label: "Variants",
      prompt: "vehicle variant sheet, multiple color schemes, different configurations, alternate designs, side-by-side comparison, white background, clean design sheet",
    },
  ],
  location: [
    {
      id: "angles",
      label: "Multi-Angle",
      prompt: "location design sheet, wide establishing shot, different camera angles, aerial view, ground level view, three-quarter view, clean design sheet",
    },
    {
      id: "lighting",
      label: "Lighting",
      prompt: "location lighting sheet, same location with different lighting conditions, daytime, sunset, night, dramatic lighting, moody atmosphere, clean design sheet",
    },
    {
      id: "interior",
      label: "Interior/Exterior",
      prompt: "location design sheet, interior and exterior views, different rooms, entrance, wide shots, clean design sheet",
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
    asset.type === "character" ? "turnaround_pro" : (sheetTemplates[asset.type]?.[0]?.id || "turnaround_pro")
  );
  const [promptMode, setPromptMode] = useState<"template" | "custom">("template");
  const [savingIndex, setSavingIndex] = useState<number | null>(null);
  const [savedIndices, setSavedIndices] = useState<Set<number>>(new Set());
  const [charDescription, setCharDescription] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [drivers, setDrivers] = useState<DriverInfo[]>([]);
  const [selectedDriver, setSelectedDriver] = useState<string>("qwen_image_edit");
  const [progressViews, setProgressViews] = useState({ completed: 0, total: 0 });
  const isTurnaroundPro = asset.type === "character" && selectedTemplate === "turnaround_pro";

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

  const handleAutoDescribe = async () => {
    setAnalyzing(true);
    setError(null);
    try {
      const response = await analyzeCharacter(projectId, asset.id);
      if (response.status === "failed") {
        setError(response.error_message || "Failed to analyze character");
        setAnalyzing(false);
        return;
      }

      const pollInterval = setInterval(async () => {
        const statusResp = await checkAnalysisStatus(response.job_id);
        if (statusResp.status === "completed") {
          clearInterval(pollInterval);
          const desc = statusResp.metadata?.description || "";
          setCharDescription(desc);
          setAnalyzing(false);
        } else if (statusResp.status === "failed") {
          clearInterval(pollInterval);
          setError(statusResp.error_message || "Failed to analyze character");
          setAnalyzing(false);
        }
      }, 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to analyze character");
      setAnalyzing(false);
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
        response = await generateTurnaroundSheet(
          projectId,
          asset.id,
          charDescription || undefined,
          customPrompt || undefined,
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

      const pollInterval = setInterval(async () => {
        const statusResp = await checkGenerationStatus(response.job_id, isTurnaroundPro ? "qwen_image_edit" : selectedDriver);
        if (statusResp.status === "completed") {
          clearInterval(pollInterval);
          const images = statusResp.image_urls || [];
          setResultImages(images);
          setStatus("");
          setGenerating(false);
          setProgressViews({ completed: 0, total: 0 });
          // Auto-save the first (composite) image to the asset library
          if (images.length > 0) {
            setSavingIndex(0);
            try {
              await saveGeneratedToAsset(
                projectId,
                images[0],
                `${asset.name} - ${sheetLabel}`,
                asset.type,
                activePrompt || undefined,
              );
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
      );
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
            <div className="relative rounded-xl overflow-hidden border border-studio-border">
              <img src={thumbUrl} alt={asset.name} className="w-full max-h-48 object-contain bg-studio-bg" />
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
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="block text-[10px] font-semibold text-studio-muted uppercase tracking-wider">
                        Character Description <span className="normal-case opacity-50">(recommended for consistency)</span>
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
                    <p className="text-[10px] text-studio-muted mt-1.5 leading-relaxed">
                      Multi-step pipeline: generates 5 separate views (front, side, back, three-quarter, face closeup) using the Multiangle LoRA, then composites them into a single sheet. Most accurate turnaround method.
                    </p>
                  </div>
                )}
              </div>
            ) : (
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
                      <img src={url} alt={label} className="w-full" />
                      <div className="absolute top-2 left-2 px-2 py-1 bg-black/70 backdrop-blur-sm text-white text-[10px] font-medium rounded-lg">
                        {label}
                      </div>
                      <div className="absolute bottom-2 right-2 flex gap-2">
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
    </div>
  );
}
