"use client";

import { useState } from "react";
import { useStudioStore } from "@/lib/store";
import {
  generateAssetSheet, checkGenerationStatus, saveGeneratedToAsset, fetchAssets,
  getAssetThumbnailUrl, type AssetResponse,
} from "@/lib/api";
import {
  Layers, Loader2, X, Save, Download, Check, Sparkles,
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
  const [selectedTemplate, setSelectedTemplate] = useState<string>("turnaround");
  const [promptMode, setPromptMode] = useState<"template" | "custom">("template");
  const [savingIndex, setSavingIndex] = useState<number | null>(null);
  const [savedIndices, setSavedIndices] = useState<Set<number>>(new Set());

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

  const handleGenerateSheet = async () => {
    setGenerating(true);
    setError(null);
    setResultImages([]);
    setSavedIndices(new Set());
    setStatus("Submitting...");

    try {
      const response = await generateAssetSheet(
        projectId,
        asset.id,
        activePrompt || undefined,
        seed ? Number(seed) : undefined,
      );

      if (response.status === "failed") {
        setError(response.error_message || "Sheet generation failed");
        setGenerating(false);
        return;
      }

      const pollInterval = setInterval(async () => {
        const statusResp = await checkGenerationStatus(response.job_id, "qwen_image_edit");
        if (statusResp.status === "completed") {
          clearInterval(pollInterval);
          setResultImages(statusResp.image_urls || []);
          setStatus("");
          setGenerating(false);
        } else if (statusResp.status === "failed") {
          clearInterval(pollInterval);
          setError(statusResp.error_message || "Sheet generation failed");
          setGenerating(false);
        } else {
          setStatus(statusResp.status === "in_queue" ? "In queue..." : "Generating...");
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
                {resultImages.map((url, i) => (
                  <div key={i} className="relative group rounded-xl overflow-hidden border border-studio-border">
                    <img src={url} alt={`Sheet ${i + 1}`} className="w-full" />
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
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
