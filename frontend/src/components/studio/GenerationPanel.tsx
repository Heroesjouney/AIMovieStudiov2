"use client";

import { useState, useCallback } from "react";
import { useStudioStore } from "@/lib/store";
import { generateImage, checkGenerationStatus, saveGeneratedToAsset, fetchAssets } from "@/lib/api";
import { Sparkles, Loader2, Save, Download, Check, RotateCcw } from "lucide-react";

export function GenerationPanel({ projectId }: { projectId: string }) {
  const {
    imageDrivers,
    selectedImageDriver,
    setSelectedImageDriver,
    assets,
    setAssets,
    selectedAssetId,
  } = useStudioStore();

  const [prompt, setPrompt] = useState("");
  const [negativePrompt, setNegativePrompt] = useState("background, scenery, environment, landscape, gradient background, colored background, shadow on background");
  const [width, setWidth] = useState(1024);
  const [height, setHeight] = useState(1024);
  const [seed, setSeed] = useState("");
  const [assetName, setAssetName] = useState("");
  const [assetType, setAssetType] = useState("character");
  const [generating, setGenerating] = useState(false);
  const [status, setStatus] = useState("");
  const [resultImages, setResultImages] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [savingIndex, setSavingIndex] = useState<number | null>(null);
  const [savedIndices, setSavedIndices] = useState<Set<number>>(new Set());

  const selectedAsset = assets.find((a) => a.id === selectedAssetId);

  const refreshAssets = useCallback(async () => {
    try {
      const fresh = await fetchAssets(projectId);
      setAssets(fresh);
    } catch {}
  }, [projectId, setAssets]);

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      setError("Please enter a prompt");
      return;
    }
    setGenerating(true);
    setError(null);
    setResultImages([]);
    setSavedIndices(new Set());
    setStatus("Submitting...");

    try {
      const refPaths = selectedAsset?.primary_image ? [selectedAsset.primary_image] : [];
      // Auto-append white background for asset types that should be isolated
      const bgSuffix = assetType !== "location"
        ? ", pure white background, isolated on white, no background"
        : "";
      const finalPrompt = prompt + bgSuffix;
      const response = await generateImage(
        finalPrompt,
        selectedImageDriver,
        negativePrompt || undefined,
        width,
        height,
        seed ? Number(seed) : undefined,
        refPaths,
      );

      if (response.status === "failed") {
        setError(response.error_message || "Generation failed");
        setGenerating(false);
        return;
      }

      // Poll for completion
      const pollInterval = setInterval(async () => {
        const statusResp = await checkGenerationStatus(response.job_id, selectedImageDriver);
        if (statusResp.status === "completed") {
          clearInterval(pollInterval);
          setResultImages(statusResp.image_urls || []);
          setStatus("Completed!");
          setGenerating(false);

        } else if (statusResp.status === "failed") {
          clearInterval(pollInterval);
          setError(statusResp.error_message || "Generation failed");
          setGenerating(false);
        } else {
          setStatus(statusResp.status === "in_queue" ? "In queue..." : "Processing...");
        }
      }, 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate");
      setGenerating(false);
    }
  };

  const handleReset = () => {
    setPrompt("");
    setNegativePrompt("background, scenery, environment, landscape, gradient background, colored background, shadow on background");
    setSeed("");
    setAssetName("");
    setResultImages([]);
    setSavedIndices(new Set());
    setError(null);
    setStatus("");
    setGenerating(false);
  };

  const handleSaveOne = async (index: number, imageUrl: string) => {
    const name = assetName.trim() || `Generated ${assetType} ${Date.now()}`;
    setSavingIndex(index);
    try {
      await saveGeneratedToAsset(
        projectId,
        imageUrl,
        name,
        assetType,
        prompt,
      );
      setSavedIndices((prev) => new Set(prev).add(index));
      await refreshAssets();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save asset");
    } finally {
      setSavingIndex(null);
    }
  };

  const handleSaveAll = async () => {
    const name = assetName.trim() || `Generated ${assetType} ${Date.now()}`;
    for (let i = 0; i < resultImages.length; i++) {
      if (savedIndices.has(i)) continue;
      setSavingIndex(i);
      try {
        const suffix = resultImages.length > 1 ? ` ${i + 1}` : "";
        await saveGeneratedToAsset(
          projectId,
          resultImages[i],
          `${name}${suffix}`,
          assetType,
          prompt,
        );
        setSavedIndices((prev) => new Set(prev).add(i));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to save asset");
        break;
      }
    }
    setSavingIndex(null);
    await refreshAssets();
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h2 className="text-lg font-semibold">Asset Generation</h2>
        <p className="text-sm text-studio-muted mt-1">Generate characters, locations, props, and vehicles using AI models</p>
      </div>

      {/* Model selector */}
      <div className="mb-5">
        <label className="block text-xs font-semibold text-studio-muted uppercase tracking-wider mb-2">
          Model
          <span className="normal-case opacity-50 ml-2">
            {imageDrivers.find((d) => d.driver_id === selectedImageDriver)?.category === "cloud" ? (
              <span className="text-studio-accent">Cloud API</span>
            ) : imageDrivers.find((d) => d.driver_id === selectedImageDriver)?.category === "local" ? (
              <span className="text-studio-success">Local ComfyUI</span>
            ) : null}
          </span>
        </label>
        <div className="relative">
          <select
            value={selectedImageDriver}
            onChange={(e) => setSelectedImageDriver(e.target.value)}
            className="w-full bg-studio-panel border border-studio-border rounded-xl px-3.5 py-2.5 text-sm focus:border-studio-accent focus:ring-2 focus:ring-studio-accent/20 focus:outline-none appearance-none cursor-pointer"
          >
            {imageDrivers.filter((d) => d.category === "cloud").length > 0 && (
              <optgroup label="☁️  Cloud APIs">
                {imageDrivers
                  .filter((d) => d.category === "cloud")
                  .map((d) => (
                    <option key={d.driver_id} value={d.driver_id}>
                      {d.display_name}
                      {d.requires_api_key ? " (requires API key)" : ""}
                    </option>
                  ))}
              </optgroup>
            )}
            {imageDrivers.filter((d) => d.category === "local").length > 0 && (
              <optgroup label="🖥️  Local ComfyUI">
                {imageDrivers
                  .filter((d) => d.category === "local")
                  .map((d) => (
                    <option key={d.driver_id} value={d.driver_id}>
                      {d.display_name}
                    </option>
                  ))}
              </optgroup>
            )}
          </select>
          <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-studio-muted">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        </div>
        {imageDrivers.length === 0 && (
          <p className="text-xs text-studio-muted mt-2">No drivers available — check API keys and ComfyUI connection</p>
        )}
        {(() => {
          const driver = imageDrivers.find((d) => d.driver_id === selectedImageDriver);
          if (driver?.description) {
            return <p className="text-xs text-studio-muted mt-2">{driver.description}</p>;
          }
          return null;
        })()}
      </div>

      {/* Reference image */}
      {selectedAsset && (
        <div className="mb-5 p-3 bg-studio-panel rounded-xl border border-studio-border">
          <div className="flex items-center gap-3">
            {selectedAsset.primary_image && (
              <img src={selectedAsset.primary_image} alt="ref" className="w-16 h-16 object-cover rounded-lg shrink-0" />
            )}
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-studio-muted uppercase tracking-wider">Reference Asset</p>
              <p className="text-sm font-medium mt-0.5 truncate">{selectedAsset.name}</p>
            </div>
          </div>
          {selectedAsset.generation_prompt && (
            <div className="mt-2 pt-2 border-t border-studio-border/50">
              <p className="text-[10px] font-semibold text-studio-muted uppercase tracking-wider mb-1">Original Prompt</p>
              <p className="text-xs text-studio-text/70 leading-relaxed">{selectedAsset.generation_prompt}</p>
            </div>
          )}
        </div>
      )}

      {/* Prompt */}
      <div className="mb-4">
        <label className="block text-xs font-semibold text-studio-muted uppercase tracking-wider mb-2">Prompt</label>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={3}
          className="w-full bg-studio-panel border border-studio-border rounded-xl p-3 text-sm text-studio-text focus:border-studio-accent focus:ring-2 focus:ring-studio-accent/20 focus:outline-none resize-none"
          placeholder="Describe the asset to generate..."
        />
      </div>

      <div className="mb-4">
        <label className="block text-xs font-semibold text-studio-muted uppercase tracking-wider mb-2">Negative Prompt <span className="normal-case opacity-50">(optional)</span></label>
        <input
          value={negativePrompt}
          onChange={(e) => setNegativePrompt(e.target.value)}
          className="w-full bg-studio-panel border border-studio-border rounded-xl p-2.5 text-sm text-studio-text focus:border-studio-accent focus:ring-2 focus:ring-studio-accent/20 focus:outline-none"
          placeholder="background, scenery, environment..."
        />
      </div>

      {/* Settings row */}
      <div className="flex gap-4 mb-5">
        <div className="flex-1">
          <label className="block text-xs font-semibold text-studio-muted uppercase tracking-wider mb-2">Width</label>
          <input
            type="number"
            value={width}
            onChange={(e) => setWidth(Number(e.target.value))}
            className="w-full bg-studio-panel border border-studio-border rounded-xl p-2.5 text-sm focus:border-studio-accent focus:outline-none"
          />
        </div>
        <div className="flex-1">
          <label className="block text-xs font-semibold text-studio-muted uppercase tracking-wider mb-2">Height</label>
          <input
            type="number"
            value={height}
            onChange={(e) => setHeight(Number(e.target.value))}
            className="w-full bg-studio-panel border border-studio-border rounded-xl p-2.5 text-sm focus:border-studio-accent focus:outline-none"
          />
        </div>
        <div className="flex-1">
          <label className="block text-xs font-semibold text-studio-muted uppercase tracking-wider mb-2">Seed</label>
          <input
            value={seed}
            onChange={(e) => setSeed(e.target.value)}
            className="w-full bg-studio-panel border border-studio-border rounded-xl p-2.5 text-sm focus:border-studio-accent focus:outline-none"
            placeholder="random"
          />
        </div>
      </div>

      {/* Asset save options */}
      <div className="flex gap-4 mb-5">
        <div className="flex-1">
          <label className="block text-xs font-semibold text-studio-muted uppercase tracking-wider mb-2">Save as <span className="normal-case opacity-50">(optional)</span></label>
          <input
            value={assetName}
            onChange={(e) => setAssetName(e.target.value)}
            className="w-full bg-studio-panel border border-studio-border rounded-xl p-2.5 text-sm focus:border-studio-accent focus:outline-none"
            placeholder="Asset name..."
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-studio-muted uppercase tracking-wider mb-2">Type</label>
          <select
            value={assetType}
            onChange={(e) => setAssetType(e.target.value)}
            className="bg-studio-panel border border-studio-border rounded-xl p-2.5 text-sm focus:border-studio-accent focus:outline-none"
          >
            <option value="character">Character</option>
            <option value="location">Location</option>
            <option value="prop">Prop</option>
            <option value="vehicle">Vehicle</option>
          </select>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex gap-3">
        <button
          onClick={handleGenerate}
          disabled={generating || !prompt.trim()}
          className="flex items-center gap-2 px-6 py-3 bg-studio-accent hover:bg-studio-accentHover disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl font-medium transition-all hover:scale-[1.02] shadow-lg shadow-studio-accent/20"
        >
          {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          {generating ? status : "Generate"}
        </button>
        <button
          onClick={handleReset}
          disabled={generating}
          className="flex items-center gap-2 px-4 py-3 bg-studio-panel hover:bg-studio-border disabled:opacity-40 text-studio-muted hover:text-studio-text rounded-xl font-medium transition-colors border border-studio-border"
        >
          <RotateCcw className="w-4 h-4" />
          Reset
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="mt-4 p-3 bg-studio-danger/10 border border-studio-danger/30 rounded-xl text-sm text-studio-danger">
          {error}
        </div>
      )}

      {/* Results */}
      {resultImages.length > 0 && (
        <div className="mt-6 animate-fade-in">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold">Results</h3>
            {assetName.trim() && (
              <button
                onClick={handleSaveAll}
                disabled={savingIndex !== null}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-studio-accent hover:bg-studio-accentHover disabled:opacity-40 text-white text-xs rounded-lg font-medium transition-colors"
              >
                {savingIndex !== null ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                Save All to Assets
              </button>
            )}
          </div>
          <div className="grid grid-cols-2 gap-4">
            {resultImages.map((url, i) => (
              <div key={i} className="relative group rounded-xl overflow-hidden border border-studio-border">
                <img src={url} alt={`Result ${i + 1}`} className="w-full" />
                <div className="absolute bottom-2 right-2 flex gap-1.5">
                  <button
                    onClick={() => handleSaveOne(i, url)}
                    disabled={savingIndex !== null || savedIndices.has(i)}
                    className="px-2.5 py-1.5 bg-black/70 backdrop-blur-sm text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-60 flex items-center gap-1"
                  >
                    {savedIndices.has(i) ? <Check className="w-3 h-3 text-green-400" /> : <Save className="w-3 h-3" />}
                    {savedIndices.has(i) ? "Saved" : "Save as Asset"}
                  </button>
                  <a
                    href={url}
                    download
                    className="px-2.5 py-1.5 bg-black/70 backdrop-blur-sm text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <Download className="w-3 h-3" />
                  </a>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
