"use client";

import { useState, useRef, useEffect } from "react";
import { useStudioStore } from "@/lib/store";
import {
  type ShotResponse, updateShot, generateShotFrame, checkShotFrameStatus,
  generateCameraAngles, checkAnglesStatus, generateShotVariation, checkShotFrameStatus as checkVariationStatus,
  CAMERA_ANGLE_PRESETS, retakeVideo, checkShotVideoStatus,
} from "@/lib/api";
import {
  CAMERA_MOVEMENT_PRESETS, CAMERA_AMPLITUDE_OPTIONS, CAMERA_SPEED_OPTIONS,
} from "@/lib/cinematicPresets";
import {
  Plus, Loader2, ImageIcon, Camera,
  Link2, X, Layers, Sparkles, ChevronDown, Copy, Wand2, RotateCcw, ChevronRight,
} from "lucide-react";

const STORYBOARD_MODELS = ["qwen_image_edit"];

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
  const [generating, setGenerating] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [showAssetPicker, setShowAssetPicker] = useState(false);
  const [generatingAngles, setGeneratingAngles] = useState(false);
  const [angleStatus, setAngleStatus] = useState("");
  const [selectedAngles, setSelectedAngles] = useState<string[]>([]);
  const [showAnglePanel, setShowAnglePanel] = useState(false);
  const [showVariationPanel, setShowVariationPanel] = useState(false);
  const [variationPrompt, setVariationPrompt] = useState("");
  const [variationName, setVariationName] = useState("");
  const [generatingVariation, setGeneratingVariation] = useState(false);
  const [variationStatus, setVariationStatus] = useState("");
  const [showRetake, setShowRetake] = useState(false);
  const [linkedImagePaths, setLinkedImagePaths] = useState<string[]>([]);
  const [showImageLinker, setShowImageLinker] = useState(false);
  const [retakeStart, setRetakeStart] = useState(0);
  const [retakeEnd, setRetakeEnd] = useState(2);
  const [retakePrompt, setRetakePrompt] = useState("");
  const [retakeStatus, setRetakeStatus] = useState("");
  const [generatingRetake, setGeneratingRetake] = useState(false);
  const anglePollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const framePollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const retakePollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Clean up any active polling on unmount
  useEffect(() => {
    return () => {
      if (framePollRef.current) clearInterval(framePollRef.current);
      if (anglePollRef.current) clearInterval(anglePollRef.current);
      if (retakePollRef.current) clearInterval(retakePollRef.current);
    };
  }, []);

  const storyboardDrivers = imageDrivers.filter(
    (d) => STORYBOARD_MODELS.includes(d.driver_id) || d.supported_features.includes("storyboard")
  );
  const otherDrivers = imageDrivers.filter(
    (d) => !STORYBOARD_MODELS.includes(d.driver_id) && !d.supported_features.includes("storyboard")
  );

  const availableAssets = assets.filter((a) => a.primary_image);

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

  const handleRetake = async () => {
    if (!retakePrompt.trim() || !shot.video_clip_path) return;
    setGeneratingRetake(true); setError(null); setRetakeStatus("Submitting...");
    try {
      const resp = await retakeVideo(projectId, shot.id, retakeStart, retakeEnd, retakePrompt, "minimax_h3");
      if (resp.status === "failed") { setError(resp.error_message || "Retake failed"); setGeneratingRetake(false); return; }
      const jobId = resp.job_id;
      let retakePollErrors = 0;
      retakePollRef.current = setInterval(async () => {
        try {
          const st = await checkShotVideoStatus(jobId, "minimax_h3");
          retakePollErrors = 0;
          if (st.status === "completed") {
            if (retakePollRef.current) clearInterval(retakePollRef.current);
            retakePollRef.current = null;
            setRetakeStatus("Done!"); setGeneratingRetake(false); setShowRetake(false);
            await onRefresh();
          } else if (st.status === "failed") {
            if (retakePollRef.current) clearInterval(retakePollRef.current);
            retakePollRef.current = null;
            setError(st.error_message || "Retake failed"); setGeneratingRetake(false);
          } else { setRetakeStatus(st.status === "in_queue" ? "In queue..." : "Processing..."); }
        } catch (e) {
          retakePollErrors++;
          console.warn("[ShotDetail] retake poll error:", e);
          if (retakePollErrors >= 5) {
            if (retakePollRef.current) clearInterval(retakePollRef.current);
            retakePollRef.current = null;
            setError("Lost connection to backend while polling. The video may still be generating — refresh later.");
            setGeneratingRetake(false);
          }
        }
      }, 3000);
    } catch (err) { setError(err instanceof Error ? err.message : "Retake failed"); setGeneratingRetake(false); }
  };

  const handleGenerateFrame = async () => {
    if (!prompt.trim()) return;
    setGenerating(true); setError(null); setStatus("Submitting...");

    try {
      const resp = await generateShotFrame(
        shot.id, prompt, selectedImageDriver,
        negativePrompt || undefined, 1344, 768, undefined,
        linkedImagePaths.length > 0 ? linkedImagePaths : undefined,
      );
      if (resp.status === "failed") { setError(resp.error_message || "Failed"); setGenerating(false); return; }

      // Clear any existing polling before starting
      if (framePollRef.current) clearInterval(framePollRef.current);

      let framePollErrors = 0;
      framePollRef.current = setInterval(async () => {
        try {
          const st = await checkShotFrameStatus(resp.job_id, selectedImageDriver);
          framePollErrors = 0;
          if (st.status === "completed") {
            if (framePollRef.current) clearInterval(framePollRef.current);
            framePollRef.current = null;
            await updateShot(projectId, shot.id, {
              frame_image_path: st.image_urls?.[0] || "",
              status: "frame_generated",
              generation_recipe: { prompt, negative_prompt: negativePrompt, model_id: selectedImageDriver, timestamp: new Date().toISOString() },
            });
            setStatus("Done!"); setGenerating(false); await onRefresh();
          } else if (st.status === "failed") {
            if (framePollRef.current) clearInterval(framePollRef.current);
            framePollRef.current = null;
            setError(st.error_message || "Failed"); setGenerating(false);
          } else { setStatus(st.status === "in_queue" ? "In queue..." : "Processing..."); }
        } catch (pollErr) {
          framePollErrors++;
          console.warn("[ShotDetail] poll error:", pollErr);
          if (framePollErrors >= 5) {
            if (framePollRef.current) clearInterval(framePollRef.current);
            framePollRef.current = null;
            setError("Lost connection to backend while polling. The frame may still be generating — refresh later.");
            setGenerating(false);
          }
        }
      }, 3000);
    } catch (err) { setError(err instanceof Error ? err.message : "Failed"); setGenerating(false); }
  };

  const handleGenerateAngles = async () => {
    if (!shot.frame_image_path || selectedAngles.length === 0) return;
    setGeneratingAngles(true); setError(null); setAngleStatus("Submitting...");
    const boundRefPaths = (shot.assets || []).map((a: any) => a.image_path).filter(Boolean);

    try {
      const resp = await generateCameraAngles(shot.frame_image_path, selectedAngles, 1024, 1024, undefined, "qwen_multiangle", prompt, boundRefPaths);

      if (resp.sub_jobs) {
        const subJobs = resp.sub_jobs;
        const results: Record<string, string> = {};
        let done = 0;
        let anglePollErrors = 0;
        anglePollRef.current = setInterval(async () => {
          try {
            for (const sub of subJobs) {
              if (results[sub.angle]) continue;
              const st = await checkAnglesStatus(sub.sub_job_id, "qwen_multiangle");
              if (st.status === "completed" && st.image_urls?.[0]) { results[sub.angle] = st.image_urls[0]; done++; }
              else if (st.status === "failed") done++;
            }
            anglePollErrors = 0;
            setAngleStatus(`Generated ${done}/${subJobs.length}...`);
            if (done >= subJobs.length) {
              if (anglePollRef.current) clearInterval(anglePollRef.current);
              await updateShot(projectId, shot.id, { angle_images: { ...(shot.angle_images || {}), ...results } });
              setGeneratingAngles(false); setAngleStatus(""); setSelectedAngles([]); await onRefresh();
            }
          } catch (angleErr) {
            anglePollErrors++;
            console.warn("[ShotDetail] angle poll error:", angleErr);
            if (anglePollErrors >= 5) {
              if (anglePollRef.current) clearInterval(anglePollRef.current);
              setError("Lost connection to backend while polling angles.");
              setGeneratingAngles(false); setAngleStatus("");
            }
          }
        }, 3000);
      } else {
        let anglePollErrors = 0;
        const interval = setInterval(async () => {
          try {
            const st = await checkAnglesStatus(resp.job_id, "3d_camera");
            anglePollErrors = 0;
            if (st.status === "completed") {
              clearInterval(interval);
              const ar = st.metadata?.angle_results || [];
              const na: Record<string, string> = {};
              for (const a of ar) if (a.image_url) na[a.angle] = a.image_url;
              await updateShot(projectId, shot.id, { angle_images: { ...(shot.angle_images || {}), ...na } });
              setGeneratingAngles(false); setAngleStatus(""); setSelectedAngles([]); await onRefresh();
            } else if (st.status === "failed") { clearInterval(interval); setError(st.error_message || "Failed"); setGeneratingAngles(false); }
            else setAngleStatus("Processing...");
          } catch (angleErr) {
            anglePollErrors++;
            console.warn("[ShotDetail] angle poll error:", angleErr);
            if (anglePollErrors >= 5) {
              clearInterval(interval);
              setError("Lost connection to backend while polling angles.");
              setGeneratingAngles(false); setAngleStatus("");
            }
          }
        }, 3000);
      }
    } catch (err) { setError(err instanceof Error ? err.message : "Failed"); setGeneratingAngles(false); }
  };

  const toggleAngle = (a: string) => setSelectedAngles((p) => p.includes(a) ? p.filter((x) => x !== a) : [...p, a]);

  const VARIATION_PRESETS = [
    { id: "wide", label: "Wide Shot", prompt: "wider shot of the same scene, pull back camera, show more of the environment", shot_type: "wide" },
    { id: "close_up", label: "Close Up", prompt: "close up shot of the same scene, tighten framing on the subject", shot_type: "close_up" },
    { id: "over_shoulder", label: "Over Shoulder", prompt: "over the shoulder shot of the same scene, looking from behind the character", shot_type: "over_the_shoulder" },
    { id: "low_angle", label: "Low Angle", prompt: "low angle shot of the same scene, camera looking up, dramatic perspective", shot_type: "medium" },
    { id: "high_angle", label: "High Angle", prompt: "high angle shot of the same scene, camera looking down from above", shot_type: "aerial" },
    { id: "pov", label: "POV Shot", prompt: "point of view shot, first person perspective of the character in the scene", shot_type: "pov" },
    { id: "action", label: "Action Beat", prompt: "same scene but now showing an action moment, dynamic movement, energy and motion", shot_type: "medium" },
    { id: "reaction", label: "Reaction", prompt: "same scene but now showing a character reaction shot, facial expression close-up", shot_type: "close_up" },
  ];

  const handleGenerateVariation = async (presetPrompt?: string, presetShotType?: string) => {
    const p = presetPrompt || variationPrompt;
    if (!p.trim() || !shot.frame_image_path) return;
    setGeneratingVariation(true); setError(null); setVariationStatus("Submitting...");
    const name = variationName.trim() || `${shot.name} - Variation`;

    try {
      const resp = await generateShotVariation(
        projectId, shot.id, name, p, presetShotType || "medium",
        selectedImageDriver,
      );

      if (resp.generation.status === "failed") {
        setError(resp.generation.error_message || "Variation failed");
        setGeneratingVariation(false); return;
      }

      const jobId = resp.generation.job_id;
      let varPollErrors = 0;
      const interval = setInterval(async () => {
        try {
          const st = await checkVariationStatus(jobId, selectedImageDriver);
          varPollErrors = 0;
          if (st.status === "completed") {
            clearInterval(interval);
            const imageUrl = st.image_urls?.[0] || "";
            if (imageUrl && resp.shot.id) {
              await updateShot(projectId, resp.shot.id, {
                frame_image_path: imageUrl,
                status: "frame_generated",
              });
            }
            setVariationStatus("Done!"); setGeneratingVariation(false);
            setVariationPrompt(""); setVariationName("");
            await onRefresh();
          } else if (st.status === "failed") {
            clearInterval(interval); setError(st.error_message || "Variation failed"); setGeneratingVariation(false);
          } else { setVariationStatus(st.status === "in_queue" ? "In queue..." : "Processing..."); }
        } catch (varErr) {
          varPollErrors++;
          console.warn("[ShotDetail] variation poll error:", varErr);
          if (varPollErrors >= 5) {
            clearInterval(interval);
            setError("Lost connection to backend while polling. The variation may still be generating — refresh later.");
            setGeneratingVariation(false);
          }
        }
      }, 2000);
    } catch (err) { setError(err instanceof Error ? err.message : "Failed"); setGeneratingVariation(false); }
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header bar */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-studio-border shrink-0">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold truncate">{shot.name}</h2>
          <p className="text-xs text-studio-muted truncate">{shot.description || "No description"}</p>
        </div>
        <button onClick={onClose} className="p-2 rounded-lg hover:bg-studio-panelHover text-studio-muted hover:text-studio-text transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-auto p-5">
        <div className="max-w-2xl mx-auto space-y-5">
          {/* Frame preview */}
          <div className="aspect-video bg-studio-panel rounded-xl border border-studio-border overflow-hidden flex items-center justify-center relative group">
            {shot.frame_image_path ? (
              <img src={shot.frame_image_path} alt="Frame" className="w-full h-full object-contain" />
            ) : (
              <div className="text-center text-studio-muted">
                <ImageIcon className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No frame generated yet</p>
              </div>
            )}
          </div>

          {/* Angle images */}
          {Object.keys(shot.angle_images || {}).length > 0 && (
            <div>
              <h3 className="text-sm font-semibold flex items-center gap-2 mb-3">
                <Camera className="w-4 h-4 text-studio-accent" />
                Camera Angles ({Object.keys(shot.angle_images).length})
              </h3>
              <div className="grid grid-cols-4 gap-2">
                {Object.entries(shot.angle_images).map(([angle, url]) => (
                  <div key={angle}>
                    <img src={url} alt={angle} className="w-full aspect-video object-cover rounded-lg border border-studio-border" />
                    <p className="text-xs text-studio-muted mt-1 text-center capitalize">{angle.replace(/_/g, " ")}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Reference assets */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <Layers className="w-4 h-4 text-studio-accent" />
                Reference Assets
              </h3>
              <button onClick={() => setShowAssetPicker(!showAssetPicker)} className="flex items-center gap-1 px-2.5 py-1 text-xs rounded-lg bg-studio-panel hover:bg-studio-panelHover border border-studio-border transition-colors">
                <Plus className="w-3 h-3" /> Add Asset
              </button>
            </div>

            {showAssetPicker && (
              <div className="mb-3 p-3 bg-studio-panel rounded-xl border border-studio-border animate-fade-in max-h-64 overflow-y-auto">
                <div className="grid grid-cols-4 gap-2">
                  {availableAssets.filter((a) => !(shot.assets || []).some((sa: any) => sa.asset_id === a.id)).map((asset) => (
                    <button key={asset.id} onClick={() => handleBindAsset(asset)} className="flex flex-col items-center gap-1 p-2 rounded-lg hover:bg-studio-bg border border-studio-border transition-all">
                      <img src={asset.primary_image!} alt="" className="w-full aspect-square object-cover rounded" />
                      <span className="text-[10px] truncate w-full text-center">{asset.name}</span>
                      <span className="text-[9px] text-studio-muted">{asset.type}</span>
                    </button>
                  ))}
                </div>
                {availableAssets.length === 0 && <p className="text-xs text-studio-muted text-center py-4">No assets available</p>}
              </div>
            )}

            <div className="flex gap-2 flex-wrap">
              {(shot.assets || []).map((a: any, i: number) => (
                <div key={i} className="group flex flex-col gap-1 px-3 py-1.5 bg-studio-panel rounded-lg border border-studio-border text-xs">
                  <div className="flex items-center gap-2">
                    {a.image_path && <img src={a.image_path} alt="" className="w-6 h-6 rounded object-cover" />}
                    <span>{a.asset_name}</span>
                    <span className="text-[10px] text-studio-muted capitalize">{a.role}</span>
                    <button onClick={() => handleUnbindAsset(a.asset_id)} className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-studio-danger/20 text-studio-danger transition-all">
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                  <select
                    value={a.retention || "fully_preserved"}
                    onChange={(e) => handleAssetRetentionChange(a.asset_id, e.target.value)}
                    className="text-[10px] bg-studio-bg border border-studio-border rounded px-1 py-0.5 focus:outline-none focus:border-studio-accent"
                  >
                    <option value="fully_preserved">Preserve Exactly</option>
                    <option value="partially_preserved">Partial Match</option>
                    <option value="attribute_transfer">Attribute Transfer</option>
                    <option value="weak_reference">Loose Reference</option>
                  </select>
                </div>
              ))}
              {(shot.assets || []).length === 0 && <p className="text-xs text-studio-muted">No assets bound. Add assets for consistency.</p>}
            </div>
          </div>

          {/* Generate frame */}
          <div className="p-4 bg-studio-panel rounded-xl border border-studio-border">
            <h3 className="text-sm font-semibold mb-3">Generate Storyboard Frame</h3>
            <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={3} placeholder="Describe the shot composition..."
              className="w-full bg-studio-bg border border-studio-border rounded-xl p-3 text-sm mb-1 focus:border-studio-accent focus:ring-2 focus:ring-studio-accent/20 focus:outline-none resize-none" />
            <div className="flex justify-end mb-2">
              <span className={`text-[10px] ${prompt.trim().split(/\s+/).filter(Boolean).length >= 350 ? "text-green-400" : prompt.trim().split(/\s+/).filter(Boolean).length > 0 ? "text-yellow-400" : "text-studio-muted"}`}>
                Word count: {prompt.trim().split(/\s+/).filter(Boolean).length} / target 350-500
              </span>
            </div>
            <input value={negativePrompt} onChange={(e) => setNegativePrompt(e.target.value)} placeholder="Negative prompt (optional)..."
              className="w-full bg-studio-bg border border-studio-border rounded-xl p-2.5 text-xs mb-3 focus:border-studio-accent focus:ring-2 focus:ring-studio-accent/20 focus:outline-none" />

            <div className="flex items-center gap-3 mb-3">
              <label className="text-xs text-studio-muted whitespace-nowrap">Model:</label>
              <div className="relative flex-1">
                <select value={selectedImageDriver} onChange={(e) => useStudioStore.getState().setSelectedImageDriver(e.target.value)}
                  className="w-full bg-studio-bg border border-studio-border rounded-lg px-3 py-1.5 text-xs focus:border-studio-accent focus:outline-none appearance-none cursor-pointer">
                  {storyboardDrivers.length > 0 && (
                    <optgroup label="Storyboard Models">
                      {storyboardDrivers.map((d) => <option key={d.driver_id} value={d.driver_id}>{d.display_name}</option>)}
                    </optgroup>
                  )}
                  {otherDrivers.length > 0 && (
                    <optgroup label="Other Models">
                      {otherDrivers.map((d) => <option key={d.driver_id} value={d.driver_id}>{d.display_name}</option>)}
                    </optgroup>
                  )}
                </select>
                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-studio-muted w-3 h-3" />
              </div>
            </div>

            {/* Link existing images as additional references */}
            <div className="mb-3">
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs text-studio-muted flex items-center gap-1.5">
                  <Link2 className="w-3 h-3" />
                  Linked References {linkedImagePaths.length > 0 && `(${linkedImagePaths.length})`}
                </label>
                <button
                  onClick={() => setShowImageLinker(!showImageLinker)}
                  className="text-[10px] text-studio-accent hover:text-studio-accentHover transition-colors"
                >
                  {showImageLinker ? "Done" : "Add"}
                </button>
              </div>
              {linkedImagePaths.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {linkedImagePaths.map((p, i) => (
                    <div key={i} className="relative group">
                      <img src={p} alt="ref" className="w-12 h-12 rounded-lg object-cover border border-studio-border" />
                      <button
                        onClick={() => setLinkedImagePaths(linkedImagePaths.filter((_, idx) => idx !== i))}
                        className="absolute -top-1 -right-1 p-0.5 rounded-full bg-studio-danger text-white opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <X className="w-2.5 h-2.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {showImageLinker && (
                <div className="p-2 bg-studio-bg rounded-lg border border-studio-border max-h-48 overflow-y-auto">
                  <div className="grid grid-cols-10 gap-0.5">
                    {allShots
                      .filter((s) => s.frame_image_path && s.id !== shot.id)
                      .sort((a, b) => (a.sequence_order ?? 0) - (b.sequence_order ?? 0))
                      .map((s) => (
                        <button
                          key={s.id}
                          onClick={() => {
                            if (!linkedImagePaths.includes(s.frame_image_path!)) {
                              setLinkedImagePaths([...linkedImagePaths, s.frame_image_path!]);
                            }
                          }}
                          className={`rounded overflow-hidden border transition-all ${
                            linkedImagePaths.includes(s.frame_image_path!)
                              ? "border-studio-accent ring-1 ring-studio-accent/40"
                              : "border-studio-border hover:border-studio-accent/40"
                          }`}
                          title={s.name}
                        >
                          <img src={s.frame_image_path!} alt={s.name} className="w-full aspect-video object-cover" />
                        </button>
                      ))}
                  </div>
                </div>
              )}
            </div>

            <button
              onClick={handleGenerateFrame}
              disabled={generating || prompt.trim().length === 0}
              className="flex items-center gap-2 px-5 py-2.5 bg-studio-accent hover:bg-studio-accentHover disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium rounded-xl transition-all hover:scale-[1.02] shadow-md shadow-studio-accent/20"
            >
              {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              {generating ? status : "Generate Frame"}
            </button>
            {error && <p className="mt-3 text-xs text-studio-danger bg-studio-danger/10 p-2 rounded-lg">{error}</p>}
          </div>

          {/* Multi-angle generation */}
          {shot.frame_image_path && (
            <div className="p-4 bg-studio-panel rounded-xl border border-studio-border">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <Camera className="w-4 h-4 text-studio-accent" /> Multi-Angle Generation
                </h3>
                <button onClick={() => setShowAnglePanel(!showAnglePanel)} className="p-1 rounded-lg hover:bg-studio-panelHover text-studio-muted hover:text-studio-accent transition-colors">
                  {showAnglePanel ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                </button>
              </div>

              {showAnglePanel && (
                <div className="animate-fade-in">
                  <p className="text-xs text-studio-muted mb-2">Select angles (Qwen Multiangle LoRA):</p>
                  <div className="flex flex-wrap gap-1.5 mb-3">
                    {CAMERA_ANGLE_PRESETS.map((p) => (
                      <button key={p.value} onClick={() => toggleAngle(p.value)}
                        className={`flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-lg border transition-all ${
                          selectedAngles.includes(p.value) ? "border-studio-accent bg-studio-accent/15 text-studio-accent" : "border-studio-border hover:border-studio-accent/40 text-studio-muted"
                        }`}>
                        <span>{p.icon}</span>{p.label}
                      </button>
                    ))}
                  </div>
                  <div className="flex gap-2 mb-3">
                    <button onClick={() => setSelectedAngles(CAMERA_ANGLE_PRESETS.map((p) => p.value))} className="text-[10px] text-studio-muted hover:text-studio-accent">Select All</button>
                    <button onClick={() => setSelectedAngles([])} className="text-[10px] text-studio-muted hover:text-studio-accent">Clear</button>
                    <button onClick={() => setSelectedAngles(["three_quarter_left", "three_quarter_right", "side_left", "side_right"])} className="text-[10px] text-studio-muted hover:text-studio-accent">Coverage Set</button>
                    <button onClick={() => setSelectedAngles(["front", "back", "side_left", "side_right"])} className="text-[10px] text-studio-muted hover:text-studio-accent">360° Set</button>
                  </div>
                  <button onClick={handleGenerateAngles} disabled={generatingAngles || selectedAngles.length === 0}
                    className="flex items-center gap-2 px-4 py-2 bg-studio-accent hover:bg-studio-accentHover disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-medium rounded-lg transition-all">
                    {generatingAngles ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Camera className="w-3.5 h-3.5" />}
                    {generatingAngles ? angleStatus : `Generate ${selectedAngles.length} Angle${selectedAngles.length !== 1 ? "s" : ""}`}
                  </button>
                </div>
              )}

              {!showAnglePanel && <p className="text-xs text-studio-muted">Generate multiple camera angles from the current frame using Qwen Multiangle LoRA.</p>}
            </div>
          )}

          {/* Shot Variation - Build scene in frames */}
          {shot.frame_image_path && (
            <div className="p-4 bg-studio-panel rounded-xl border border-studio-border">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <Wand2 className="w-4 h-4 text-studio-accent" /> Build Scene in Frames
                </h3>
                <button onClick={() => setShowVariationPanel(!showVariationPanel)} className="p-1 rounded-lg hover:bg-studio-panelHover text-studio-muted hover:text-studio-accent transition-colors">
                  {showVariationPanel ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                </button>
              </div>

              {showVariationPanel && (
                <div className="animate-fade-in space-y-3">
                  <p className="text-xs text-studio-muted">Generate new shots from this frame with different angles, compositions, and actions:</p>
                  <div className="flex flex-wrap gap-1.5">
                    {VARIATION_PRESETS.map((preset) => (
                      <button
                        key={preset.id}
                        onClick={() => handleGenerateVariation(preset.prompt, preset.shot_type)}
                        disabled={generatingVariation}
                        className="flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-lg border border-studio-border hover:border-studio-accent/40 hover:bg-studio-accent/5 text-studio-muted hover:text-studio-text transition-all disabled:opacity-40"
                      >
                        <Copy className="w-3 h-3" />
                        {preset.label}
                      </button>
                    ))}
                  </div>

                  {/* Custom variation */}
                  <div className="pt-2 border-t border-studio-border/50">
                    <label className="block text-[10px] font-semibold text-studio-muted uppercase tracking-wider mb-1.5">Custom Variation</label>
                    <input
                      value={variationName}
                      onChange={(e) => setVariationName(e.target.value)}
                      className="w-full bg-studio-bg border border-studio-border rounded-lg p-2 text-xs mb-2 focus:border-studio-accent focus:outline-none"
                      placeholder="Shot name (e.g. 'Scene 1 - Low Angle')"
                    />
                    <textarea
                      value={variationPrompt}
                      onChange={(e) => setVariationPrompt(e.target.value)}
                      rows={2}
                      className="w-full bg-studio-bg border border-studio-border rounded-lg p-2 text-xs mb-2 focus:border-studio-accent focus:outline-none resize-none"
                      placeholder="Describe the variation (e.g. 'same scene but character is now running')"
                    />
                    <button
                      onClick={() => handleGenerateVariation()}
                      disabled={generatingVariation || !variationPrompt.trim()}
                      className="flex items-center gap-2 px-4 py-2 bg-studio-accent hover:bg-studio-accentHover disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-medium rounded-lg transition-all"
                    >
                      {generatingVariation ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wand2 className="w-3.5 h-3.5" />}
                      {generatingVariation ? (variationStatus || "Generating...") : "Generate Variation"}
                    </button>
                  </div>
                </div>
              )}

              {!showVariationPanel && <p className="text-xs text-studio-muted">Create new shots from this frame with different angles, compositions, and actions to build the entire scene.</p>}
            </div>
          )}

          {/* Last frame continuity */}
          {shot.last_frame_path && (
            <div className="p-4 bg-studio-panel rounded-xl border border-studio-border">
              <h3 className="text-sm font-semibold flex items-center gap-2 mb-3">
                <Link2 className="w-4 h-4 text-studio-accent" /> Last Frame (Continuity)
              </h3>
              <div className="flex items-center gap-3">
                <img src={shot.last_frame_path} alt="Last frame" className="w-32 aspect-video object-cover rounded-lg border border-studio-border" />
                <p className="text-xs text-studio-muted">This frame will auto-pass to the next shot's video generation as the first frame anchor for visual continuity.</p>
              </div>
            </div>
          )}

          {/* Video retake */}
          {shot.video_clip_path && (
            <div className="p-4 bg-studio-panel rounded-xl border border-studio-border">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <RotateCcw className="w-4 h-4 text-studio-accent" /> Retake Mode
                </h3>
                <button onClick={() => setShowRetake(!showRetake)} className="p-1 rounded-lg hover:bg-studio-panelHover text-studio-muted hover:text-studio-accent transition-colors">
                  {showRetake ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                </button>
              </div>
              {showRetake && (
                <div className="animate-fade-in space-y-3">
                  <p className="text-xs text-studio-muted">Mark a time range in the video and regenerate just that portion. The new segment is spliced back into the original.</p>
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-studio-muted">Start (s):</label>
                    <input type="number" min={0} max={retakeEnd - 0.1} step={0.1} value={retakeStart} onChange={(e) => setRetakeStart(parseFloat(e.target.value))}
                      className="w-20 bg-studio-bg border border-studio-border rounded-lg px-2 py-1 text-xs focus:border-studio-accent focus:outline-none" />
                    <label className="text-xs text-studio-muted">End (s):</label>
                    <input type="number" min={retakeStart + 0.1} step={0.1} value={retakeEnd} onChange={(e) => setRetakeEnd(parseFloat(e.target.value))}
                      className="w-20 bg-studio-bg border border-studio-border rounded-lg px-2 py-1 text-xs focus:border-studio-accent focus:outline-none" />
                  </div>
                  <textarea value={retakePrompt} onChange={(e) => setRetakePrompt(e.target.value)} rows={2}
                    className="w-full bg-studio-bg border border-studio-border rounded-xl p-2.5 text-xs focus:border-studio-accent focus:outline-none resize-none"
                    placeholder="Describe what should happen in the retake segment..." />
                  <button onClick={handleRetake} disabled={generatingRetake || !retakePrompt.trim()}
                    className="flex items-center gap-2 px-4 py-2 bg-studio-accent hover:bg-studio-accentHover disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-medium rounded-lg transition-all">
                    {generatingRetake ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
                    {generatingRetake ? (retakeStatus || "Processing...") : "Generate Retake"}
                  </button>
                </div>
              )}
              {!showRetake && <p className="text-xs text-studio-muted">Regenerate a portion of the video and splice it back into the original.</p>}
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
