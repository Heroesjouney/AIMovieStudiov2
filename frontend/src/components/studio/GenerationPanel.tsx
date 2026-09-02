"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useStudioStore } from "@/lib/store";
import { generateImage, checkGenerationStatus, saveGeneratedToAsset, fetchAssets } from "@/lib/api";
import {
  Sparkles, Loader2, Save, Download, Check, RotateCcw,
  Dices, ChevronDown, Settings, Clock, X,
} from "lucide-react";

// =============================================================================
// Constants
// =============================================================================

const ASPECT_PRESETS = [
  { id: "square", label: "Square", w: 1024, h: 1024 },
  { id: "portrait", label: "Portrait", w: 768, h: 1024 },
  { id: "landscape", label: "Landscape", w: 1024, h: 768 },
  { id: "wide", label: "Wide", w: 1280, h: 720 },
  { id: "vertical", label: "Vertical", w: 720, h: 1280 },
];

const PROMPT_PRESETS_BY_TYPE: Record<string, { id: string; label: string; text: string }[]> = {
  character: [
    { id: "hero", label: "Hero", text: "Full-body character design of a heroic figure, detailed costume, confident pose" },
    { id: "villain", label: "Villain", text: "Full-body character design of a sinister villain, dark attire, menacing expression" },
    { id: "civilian", label: "Civilian", text: "Full-body character design of an everyday person, casual clothing, natural pose" },
    { id: "child", label: "Child", text: "Full-body character design of a young child, playful expression, simple clothing" },
  ],
  location: [
    { id: "city", label: "City", text: "Wide establishing shot of a bustling city street, tall buildings, atmospheric lighting" },
    { id: "interior", label: "Interior", text: "Detailed interior room, furnished, warm lighting, cinematic composition" },
    { id: "nature", label: "Nature", text: "Expansive natural landscape, mountains, trees, golden hour lighting" },
    { id: "sci-fi", label: "Sci-Fi", text: "Futuristic sci-fi environment, sleek architecture, neon accents, atmospheric haze" },
  ],
  prop: [
    { id: "weapon", label: "Weapon", text: "Detailed weapon design, ornate hilt, polished blade, studio lighting" },
    { id: "artifact", label: "Artifact", text: "Ancient mystical artifact, glowing runes, weathered surface, magical aura" },
    { id: "gadget", label: "Gadget", text: "Futuristic gadget device, sleek design, glowing indicators, technical details" },
  ],
  vehicle: [
    { id: "car", label: "Car", text: "Sleek car design, three-quarter view, detailed surfaces, studio lighting" },
    { id: "spaceship", label: "Spaceship", text: "Futuristic spaceship design, aerodynamic hull, engine glow, sci-fi aesthetic" },
    { id: "creature", label: "Creature", text: "Fantasy creature mount, detailed anatomy, textured skin, dynamic pose" },
  ],
  style: [
    { id: "color", label: "Color Palette", text: "Color palette reference sheet, swatches, gradient samples, mood tones" },
    { id: "mood", label: "Mood Board", text: "Visual mood board, texture samples, lighting references, atmospheric tones" },
  ],
  effect: [
    { id: "fire", label: "Fire", text: "Visual effect reference, fire and flame particles, multiple stages, clean sheet" },
    { id: "magic", label: "Magic", text: "Visual effect reference, magical energy particles, glowing aura, multiple stages" },
  ],
};

const ASSET_TYPES = [
  { id: "character", label: "Character" },
  { id: "location", label: "Location" },
  { id: "prop", label: "Prop" },
  { id: "vehicle", label: "Vehicle" },
  { id: "style", label: "Style" },
  { id: "effect", label: "Effect" },
];

const DEFAULT_NEG_PROMPT = "background, scenery, environment, landscape, gradient background, colored background, shadow on background";

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
  const [negativePrompt, setNegativePrompt] = useState(DEFAULT_NEG_PROMPT);
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

  // Advanced settings toggle
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Prompt history
  const [promptHistory, setPromptHistory] = useState<string[]>([]);
  const [showPromptHistory, setShowPromptHistory] = useState(false);

  // Generation elapsed timer
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const elapsedRef = useRef<number | null>(null);

  // Lightbox
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  const selectedAsset = assets.find((a) => a.id === selectedAssetId);
  const activePresets = PROMPT_PRESETS_BY_TYPE[assetType] || [];

  const refreshAssets = useCallback(async () => {
    try {
      const fresh = await fetchAssets(projectId);
      setAssets(fresh);
    } catch {}
  }, [projectId, setAssets]);

  const stopElapsedTimer = () => {
    if (elapsedRef.current) {
      window.clearInterval(elapsedRef.current);
      elapsedRef.current = null;
    }
  };

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

    // Save prompt to history
    setPromptHistory((prev) => {
      const filtered = prev.filter((p) => p !== prompt.trim());
      return [prompt.trim(), ...filtered].slice(0, 10);
    });

    // Start elapsed timer
    setElapsedSeconds(0);
    elapsedRef.current = window.setInterval(() => {
      setElapsedSeconds((s) => s + 1);
    }, 1000);

    try {
      const refPaths = selectedAsset?.primary_image ? [selectedAsset.primary_image] : [];
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
        stopElapsedTimer();
        setGenerating(false);
        return;
      }

      let genPollErrors = 0;
      const pollInterval = setInterval(async () => {
        try {
          const statusResp = await checkGenerationStatus(response.job_id, selectedImageDriver);
          genPollErrors = 0;
          if (statusResp.status === "completed") {
            clearInterval(pollInterval);
            setResultImages(statusResp.image_urls || []);
            setStatus("Completed!");
            stopElapsedTimer();
            setGenerating(false);
          } else if (statusResp.status === "failed") {
            clearInterval(pollInterval);
            setError(statusResp.error_message || "Generation failed");
            stopElapsedTimer();
            setGenerating(false);
          } else {
            setStatus(statusResp.status === "in_queue" ? "In queue..." : "Processing...");
          }
        } catch (pollErr) {
          genPollErrors++;
          console.warn("[GenerationPanel] poll error:", pollErr);
          if (genPollErrors >= 5) {
            clearInterval(pollInterval);
            setError("Lost connection to backend while polling. The image may still be generating — refresh later.");
            stopElapsedTimer();
            setGenerating(false);
          }
        }
      }, 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate");
      stopElapsedTimer();
      setGenerating(false);
    }
  };

  // Ctrl+Enter to generate
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter" && !generating && prompt.trim()) {
        e.preventDefault();
        handleGenerate();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [generating, prompt]);

  const handleReset = () => {
    stopElapsedTimer();
    setPrompt("");
    setNegativePrompt(DEFAULT_NEG_PROMPT);
    setSeed("");
    setAssetName("");
    setResultImages([]);
    setSavedIndices(new Set());
    setError(null);
    setStatus("");
    setGenerating(false);
    setShowAdvanced(false);
    setShowPromptHistory(false);
    setElapsedSeconds(0);
  };

  const handleSaveOne = async (index: number, imageUrl: string) => {
    const name = assetName.trim() || `Generated ${assetType} ${Date.now()}`;
    setSavingIndex(index);
    try {
      await saveGeneratedToAsset(projectId, imageUrl, name, assetType, prompt);
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
        await saveGeneratedToAsset(projectId, resultImages[i], `${name}${suffix}`, assetType, prompt);
        setSavedIndices((prev) => new Set(prev).add(i));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to save asset");
        break;
      }
    }
    setSavingIndex(null);
    await refreshAssets();
  };

  const currentDriver = imageDrivers.find((d) => d.driver_id === selectedImageDriver);

  return (
    <div className="p-4 max-w-4xl mx-auto">
      <div className="mb-3">
        <h2 className="text-sm font-semibold">Asset Generation</h2>
        <p className="text-[11px] text-studio-muted mt-0.5">Generate characters, locations, props, and vehicles using AI models</p>
      </div>

      {/* Model selector */}
      <div className="mb-3">
        <label className="block text-[10px] font-semibold text-studio-muted uppercase tracking-wider mb-1.5">
          Model
          <span className="normal-case opacity-50 ml-1.5">
            {currentDriver?.category === "cloud" ? (
              <span className="text-studio-accent">Cloud API</span>
            ) : currentDriver?.category === "local" ? (
              <span className="text-studio-success">Local ComfyUI</span>
            ) : null}
          </span>
        </label>
        <div className="relative">
          <select
            value={selectedImageDriver}
            onChange={(e) => setSelectedImageDriver(e.target.value)}
            className="w-full bg-studio-panel border border-studio-border rounded-lg px-2.5 py-1.5 text-xs focus:border-studio-accent focus:outline-none appearance-none cursor-pointer"
          >
            {imageDrivers.filter((d) => d.category === "cloud").length > 0 && (
              <optgroup label="Cloud APIs">
                {imageDrivers.filter((d) => d.category === "cloud").map((d) => (
                  <option key={d.driver_id} value={d.driver_id}>
                    {d.display_name}{d.requires_api_key ? " (requires API key)" : ""}
                  </option>
                ))}
              </optgroup>
            )}
            {imageDrivers.filter((d) => d.category === "local").length > 0 && (
              <optgroup label="Local ComfyUI">
                {imageDrivers.filter((d) => d.category === "local").map((d) => (
                  <option key={d.driver_id} value={d.driver_id}>{d.display_name}</option>
                ))}
              </optgroup>
            )}
          </select>
          <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-studio-muted">
            <ChevronDown className="w-3 h-3" />
          </div>
        </div>
        {/* Model info badges */}
        <div className="flex flex-wrap gap-1.5 mt-1.5">
          <span className="px-2 py-0.5 text-[10px] rounded-full bg-studio-border/50 text-studio-muted">
            {currentDriver?.category === "cloud" ? "Cloud" : "Local"}
          </span>
          {currentDriver?.requires_api_key && (
            <span className="px-2 py-0.5 text-[10px] rounded-full bg-studio-border/50 text-studio-muted">API Key</span>
          )}
          {currentDriver?.supported_features?.includes("image_to_image") && (
            <span className="px-2 py-0.5 text-[10px] rounded-full bg-studio-border/50 text-studio-muted">Img2Img</span>
          )}
        </div>
        {imageDrivers.length === 0 && (
          <p className="text-[11px] text-studio-muted mt-1.5">No drivers available — check API keys and ComfyUI connection</p>
        )}
      </div>

      {/* Reference image */}
      {selectedAsset && (
        <div className="mb-3 p-2 bg-studio-panel rounded-lg border border-studio-border">
          <div className="flex items-center gap-2">
            {selectedAsset.primary_image && (
              <img src={selectedAsset.primary_image} alt="ref" className="w-10 h-10 object-cover rounded-md shrink-0" />
            )}
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-semibold text-studio-muted uppercase tracking-wider">Reference Asset</p>
              <p className="text-xs font-medium mt-0.5 truncate">{selectedAsset.name}</p>
            </div>
          </div>
          {selectedAsset.generation_prompt && (
            <div className="mt-1.5 pt-1.5 border-t border-studio-border/50">
              <p className="text-[10px] font-semibold text-studio-muted uppercase tracking-wider mb-0.5">Original Prompt</p>
              <p className="text-[11px] text-studio-text/70 leading-relaxed">{selectedAsset.generation_prompt}</p>
            </div>
          )}
        </div>
      )}

      {/* Prompt */}
      <div className="mb-3">
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-[10px] font-semibold text-studio-muted uppercase tracking-wider">Prompt</label>
          <div className="flex items-center gap-2">
            {promptHistory.length > 0 && (
              <div className="relative">
                <button
                  onClick={() => setShowPromptHistory(!showPromptHistory)}
                  className="text-[10px] text-studio-muted hover:text-studio-accent transition-colors flex items-center gap-1"
                >
                  <Clock className="w-3 h-3" />
                  History
                  <ChevronDown className="w-3 h-3" />
                </button>
                {showPromptHistory && (
                  <div className="absolute right-0 top-full mt-1 z-20 w-80 max-h-60 overflow-y-auto bg-studio-panel border border-studio-border rounded-lg shadow-xl">
                    {promptHistory.map((p, i) => (
                      <button
                        key={i}
                        onClick={() => { setPrompt(p); setShowPromptHistory(false); }}
                        className="w-full text-left px-3 py-2 text-[11px] text-studio-text hover:bg-studio-border/40 transition-colors border-b border-studio-border/30 last:border-0"
                      >
                        <p className="truncate">{p}</p>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            <span className={`text-[10px] ${prompt.length > 500 ? "text-studio-danger" : "text-studio-muted/50"}`}>
              {prompt.length} chars
            </span>
          </div>
        </div>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={3}
          className="w-full bg-studio-panel border border-studio-border rounded-lg px-2.5 py-2 text-xs text-studio-text focus:border-studio-accent focus:outline-none resize-none"
          placeholder="Describe the asset to generate..."
        />
        {/* Prompt presets (type-aware) */}
        {activePresets.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-1.5">
            {activePresets.map((preset) => (
              <button
                key={preset.id}
                onClick={() => setPrompt(preset.text)}
                className="px-2 py-1 text-[10px] rounded-md bg-studio-panel border border-studio-border text-studio-muted hover:text-studio-accent hover:border-studio-accent/50 transition-all"
              >
                {preset.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Asset save options */}
      <div className="flex gap-3 mb-3">
        <div className="flex-1">
          <label className="block text-[10px] font-semibold text-studio-muted uppercase tracking-wider mb-1.5">
            Save as <span className="normal-case opacity-50">(optional)</span>
          </label>
          <input
            value={assetName}
            onChange={(e) => setAssetName(e.target.value)}
            className="w-full bg-studio-panel border border-studio-border rounded-lg px-2.5 py-1.5 text-xs focus:border-studio-accent focus:outline-none"
            placeholder="Asset name..."
          />
        </div>
        <div>
          <label className="block text-[10px] font-semibold text-studio-muted uppercase tracking-wider mb-1.5">Type</label>
          <select
            value={assetType}
            onChange={(e) => setAssetType(e.target.value)}
            className="bg-studio-panel border border-studio-border rounded-lg px-2.5 py-1.5 text-xs focus:border-studio-accent focus:outline-none"
          >
            {ASSET_TYPES.map((t) => (
              <option key={t.id} value={t.id}>{t.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Aspect ratio presets */}
      <div className="mb-3">
        <label className="text-[10px] font-semibold text-studio-muted uppercase tracking-wider mb-1.5 block">
          Aspect Ratio
        </label>
        <div className="flex gap-1.5">
          {ASPECT_PRESETS.map((ar) => {
            const isActive = width === ar.w && height === ar.h;
            return (
              <button
                key={ar.id}
                onClick={() => { setWidth(ar.w); setHeight(ar.h); }}
                className={`px-2 py-1 text-[10px] font-medium rounded-md transition-all border ${
                  isActive
                    ? "bg-studio-accent/20 text-studio-accent border-studio-accent/40"
                    : "bg-studio-panel border-studio-border text-studio-muted hover:text-studio-text"
                }`}
              >
                {ar.label} <span className="opacity-50">{ar.w}×{ar.h}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Advanced Settings (collapsible) */}
      <div className="mb-3">
        <button
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="flex items-center gap-1.5 text-[10px] font-semibold text-studio-muted uppercase tracking-wider hover:text-studio-text transition-colors"
        >
          <Settings className="w-3 h-3" />
          Advanced Settings
          <ChevronDown className={`w-3 h-3 transition-transform ${showAdvanced ? "rotate-180" : ""}`} />
        </button>
        {showAdvanced && (
          <div className="mt-2 space-y-3 p-3 bg-studio-panel/50 rounded-lg border border-studio-border/50">
            {/* Dimensions */}
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="block text-[10px] font-semibold text-studio-muted uppercase tracking-wider mb-1">Width</label>
                <input
                  type="number"
                  value={width}
                  onChange={(e) => setWidth(Number(e.target.value))}
                  className="w-full bg-studio-panel border border-studio-border rounded-lg px-2.5 py-1.5 text-xs focus:border-studio-accent focus:outline-none"
                />
              </div>
              <div className="flex-1">
                <label className="block text-[10px] font-semibold text-studio-muted uppercase tracking-wider mb-1">Height</label>
                <input
                  type="number"
                  value={height}
                  onChange={(e) => setHeight(Number(e.target.value))}
                  className="w-full bg-studio-panel border border-studio-border rounded-lg px-2.5 py-1.5 text-xs focus:border-studio-accent focus:outline-none"
                />
              </div>
            </div>

            {/* Negative Prompt */}
            <div>
              <label className="block text-[10px] font-semibold text-studio-muted uppercase tracking-wider mb-1.5">
                Negative Prompt <span className="normal-case opacity-50">(optional)</span>
              </label>
              <input
                value={negativePrompt}
                onChange={(e) => setNegativePrompt(e.target.value)}
                className="w-full bg-studio-panel border border-studio-border rounded-lg px-2.5 py-1.5 text-xs text-studio-text focus:border-studio-accent focus:outline-none"
                placeholder="background, scenery, environment..."
              />
            </div>

            {/* Seed */}
            <div>
              <label className="block text-[10px] font-semibold text-studio-muted uppercase tracking-wider mb-1.5">
                Seed <span className="opacity-50">(optional)</span>
              </label>
              <div className="flex gap-1.5">
                <input
                  value={seed}
                  onChange={(e) => setSeed(e.target.value.replace(/[^0-9]/g, ""))}
                  className="flex-1 bg-studio-panel border border-studio-border rounded-lg px-2.5 py-1.5 text-xs focus:border-studio-accent focus:outline-none"
                  placeholder="Random"
                />
                <button
                  onClick={() => setSeed(String(Math.floor(Math.random() * 999999999)))}
                  className="px-2 rounded-lg bg-studio-panel border border-studio-border hover:border-studio-accent text-studio-muted hover:text-studio-accent transition-colors"
                  title="Randomize seed"
                >
                  <Dices className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Action buttons */}
      <div className="flex gap-2">
        <button
          onClick={handleGenerate}
          disabled={generating || !prompt.trim()}
          className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2 bg-studio-accent hover:bg-studio-accentHover disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs rounded-lg font-medium transition-all hover:scale-[1.01] shadow-md shadow-studio-accent/20"
        >
          {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          {generating ? (
            <span className="flex items-center gap-1.5">
              {status}
              <span className="text-[10px] opacity-70">({Math.floor(elapsedSeconds / 60)}:{(elapsedSeconds % 60).toString().padStart(2, "0")})</span>
            </span>
          ) : (
            <span className="flex items-center gap-1.5">
              Generate
              <kbd className="hidden sm:inline text-[9px] px-1 py-0.5 rounded bg-white/10 border border-white/20">Ctrl+↵</kbd>
            </span>
          )}
        </button>
        <button
          onClick={handleReset}
          disabled={generating}
          className="flex items-center justify-center gap-1.5 px-3 py-2 bg-studio-panel hover:bg-studio-border disabled:opacity-40 text-studio-muted hover:text-studio-text text-xs rounded-lg font-medium transition-all border border-studio-border"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          Reset
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="mt-3 p-2 bg-studio-danger/10 border border-studio-danger/30 rounded-lg text-xs text-studio-danger">
          {error}
        </div>
      )}

      {/* Results */}
      {resultImages.length > 0 && (
        <div className="mt-4 animate-fade-in">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-semibold">Results</h3>
            <button
              onClick={handleSaveAll}
              disabled={savingIndex !== null}
              className="flex items-center gap-1.5 px-2.5 py-1 bg-studio-accent hover:bg-studio-accentHover disabled:opacity-40 text-white text-[11px] rounded-md font-medium transition-colors"
            >
              {savingIndex !== null ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
              Save All to Assets
            </button>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {resultImages.map((url, i) => (
              <div key={i} className="relative group rounded-lg overflow-hidden border border-studio-border">
                <img
                  src={url}
                  alt={`Result ${i + 1}`}
                  className="w-full cursor-zoom-in"
                  onClick={() => setLightboxUrl(url)}
                />
                <div className="absolute bottom-1.5 right-1.5 flex gap-1">
                  <button
                    onClick={() => handleSaveOne(i, url)}
                    disabled={savingIndex !== null || savedIndices.has(i)}
                    className="px-2 py-1 bg-black/70 backdrop-blur-sm text-white text-[10px] rounded-md opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-60 flex items-center gap-1"
                  >
                    {savedIndices.has(i) ? <Check className="w-2.5 h-2.5 text-green-400" /> : <Save className="w-2.5 h-2.5" />}
                    {savedIndices.has(i) ? "Saved" : "Save"}
                  </button>
                  <a
                    href={url}
                    download
                    className="px-2 py-1 bg-black/70 backdrop-blur-sm text-white text-[10px] rounded-md opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <Download className="w-2.5 h-2.5" />
                  </a>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

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
            <X className="w-5 h-5" />
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
            className="absolute bottom-4 right-4 px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-colors flex items-center gap-2 text-xs"
          >
            <Download className="w-3.5 h-3.5" />
            Download
          </a>
        </div>
      )}
    </div>
  );
}
