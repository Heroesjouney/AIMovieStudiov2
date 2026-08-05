"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { useStudioStore } from "@/lib/store";
import {
  generateShotVideo,
  checkShotVideoStatus,
  selectVideoTake,
  listAudioFiles,
  listVideoAssets,
  listImageAssets,
  getAssetThumbnailUrl,
  updateShot,
  type ShotVideoRequest,
  type AudioFileItem,
  type VideoAsset,
  type ImageAssetItem,
  type AssetResponse,
  type VideoTake,
} from "@/lib/api";
import {
  Camera, Loader2, Film, Video, Mic, Image as ImageIcon,
  Plus, Send, Check, X, AlertCircle, Sparkles,
  Type, Layers, Wand2,
} from "lucide-react";

// =============================================================================
// Constants
// =============================================================================

const CAMERA_MOVEMENTS = [
  { id: "static", label: "Static", hint: "" },
  { id: "dolly_in", label: "Dolly In", hint: "slow push-in, camera moves forward toward subject" },
  { id: "dolly_out", label: "Dolly Out", hint: "slow pull-back, camera moves away from subject" },
  { id: "pan_left", label: "Pan Left", hint: "camera pans left horizontally" },
  { id: "pan_right", label: "Pan Right", hint: "camera pans right horizontally" },
  { id: "tilt_up", label: "Tilt Up", hint: "camera tilts upward vertically" },
  { id: "tilt_down", label: "Tilt Down", hint: "camera tilts downward vertically" },
  { id: "crane_up", label: "Crane Up", hint: "camera rises smoothly upward" },
  { id: "crane_down", label: "Crane Down", hint: "camera descends smoothly downward" },
  { id: "orbit_left", label: "Orbit Left", hint: "camera orbits around subject to the left" },
  { id: "orbit_right", label: "Orbit Right", hint: "camera orbits around subject to the right" },
  { id: "handheld", label: "Handheld", hint: "subtle handheld camera shake, documentary feel" },
  { id: "zoom_in", label: "Zoom In", hint: "lens zoom in, subject grows larger" },
  { id: "zoom_out", label: "Zoom Out", hint: "lens zoom out, reveals more of the scene" },
  { id: "dolly_zoom", label: "Dolly Zoom", hint: "vertigo effect, dolly in while zooming out" },
];

const ASPECT_RATIOS = [
  { id: "16:9", label: "16:9 Landscape" },
  { id: "9:16", label: "9:16 Portrait" },
  { id: "1:1", label: "1:1 Square" },
  { id: "21:9", label: "21:9 Cinemascope" },
  { id: "4:3", label: "4:3 Academy" },
];

type GenMode = "t2v" | "i2v" | "r2v" | "ia2v";

const MODE_TABS: { id: GenMode; label: string; icon: any; desc: string }[] = [
  { id: "t2v", label: "Text to Video", icon: Type, desc: "Generate from prompt only" },
  { id: "i2v", label: "Image to Video", icon: ImageIcon, desc: "Animate a storyboard frame" },
  { id: "ia2v", label: "Image + Audio", icon: Mic, desc: "Lip-sync / dialogue from image + audio" },
  { id: "r2v", label: "Reference", icon: Layers, desc: "Use reference images, video, or audio" },
];

// Model capability matrix
interface ModelCaps {
  supportsFirstFrame: boolean;
  supportsLastFrame: boolean;
  supportsReferenceImages: boolean;
  supportsReferenceVideo: boolean;
  supportsReferenceAudio: boolean;
  supportsCameraControl: boolean;
  supportsT2V: boolean;
  supportsI2V: boolean;
  supportsR2V: boolean;
  supportsIA2V: boolean;
  supportsPromptEnhance: boolean;
  maxDuration: number;
}

function getModelCaps(driverId: string): ModelCaps {
  const caps: Record<string, ModelCaps> = {
    fal_seedance: { supportsFirstFrame: true, supportsLastFrame: true, supportsReferenceImages: false, supportsReferenceVideo: false, supportsReferenceAudio: false, supportsCameraControl: true, supportsT2V: true, supportsI2V: true, supportsR2V: false, supportsIA2V: false, supportsPromptEnhance: false, maxDuration: 10 },
    fal_seedance_2: { supportsFirstFrame: true, supportsLastFrame: true, supportsReferenceImages: false, supportsReferenceVideo: false, supportsReferenceAudio: false, supportsCameraControl: true, supportsT2V: true, supportsI2V: true, supportsR2V: false, supportsIA2V: false, supportsPromptEnhance: false, maxDuration: 10 },
    fal_seedance_2_5: { supportsFirstFrame: true, supportsLastFrame: true, supportsReferenceImages: false, supportsReferenceVideo: false, supportsReferenceAudio: false, supportsCameraControl: true, supportsT2V: true, supportsI2V: true, supportsR2V: false, supportsIA2V: false, supportsPromptEnhance: false, maxDuration: 10 },
    fal_minimax_h3: { supportsFirstFrame: true, supportsLastFrame: false, supportsReferenceImages: false, supportsReferenceVideo: false, supportsReferenceAudio: false, supportsCameraControl: false, supportsT2V: true, supportsI2V: true, supportsR2V: false, supportsIA2V: false, supportsPromptEnhance: false, maxDuration: 6 },
    ltx_video_2_3: { supportsFirstFrame: true, supportsLastFrame: true, supportsReferenceImages: false, supportsReferenceVideo: false, supportsReferenceAudio: true, supportsCameraControl: true, supportsT2V: true, supportsI2V: true, supportsR2V: false, supportsIA2V: true, supportsPromptEnhance: true, maxDuration: 10 },
    wan_video: { supportsFirstFrame: true, supportsLastFrame: true, supportsReferenceImages: false, supportsReferenceVideo: false, supportsReferenceAudio: false, supportsCameraControl: true, supportsT2V: true, supportsI2V: true, supportsR2V: false, supportsIA2V: false, supportsPromptEnhance: false, maxDuration: 10 },
    minimax_h3: { supportsFirstFrame: true, supportsLastFrame: true, supportsReferenceImages: true, supportsReferenceVideo: true, supportsReferenceAudio: true, supportsCameraControl: true, supportsT2V: true, supportsI2V: true, supportsR2V: true, supportsIA2V: false, supportsPromptEnhance: false, maxDuration: 15 },
  };
  return caps[driverId] || caps.ltx_video_2_3;
}

// =============================================================================
// Main Component
// =============================================================================

export function CameraDirector({ projectId }: { projectId: string }) {
  const {
    shots, selectedShotId,
    scenes, videoDrivers, assets,
    addTimelineClip, setTimelineProjectId, timeline,
  } = useStudioStore();

  // Mode — explicit user selection
  const [mode, setMode] = useState<GenMode>("i2v");

  // Generation state
  const [selectedModelId, setSelectedModelId] = useState("ltx_video_2_3");
  const [prompt, setPrompt] = useState("");
  const [negativePrompt, setNegativePrompt] = useState("");
  const [cameraMovement, setCameraMovement] = useState("static");
  const [duration, setDuration] = useState(5);
  const [seed, setSeed] = useState<string>("");
  const [aspectRatio, setAspectRatio] = useState("16:9");

  // Reference slots
  const [firstFramePath, setFirstFramePath] = useState<string | null>(null);
  const [lastFramePath, setLastFramePath] = useState<string | null>(null);
  const [refImagePaths, setRefImagePaths] = useState<string[]>([]);
  const [refVideoPath, setRefVideoPath] = useState<string | null>(null);
  const [refAudioPath, setRefAudioPath] = useState<string | null>(null);
  const [enhancePrompt, setEnhancePrompt] = useState(false);

  // Picker state
  const [activePicker, setActivePicker] = useState<string | null>(null);

  // Audio/video assets for pickers
  const [audioFiles, setAudioFiles] = useState<AudioFileItem[]>([]);
  const [audioLoading, setAudioLoading] = useState(false);
  const [uploadedVideos, setUploadedVideos] = useState<VideoAsset[]>([]);
  const [uploadedVideosLoading, setUploadedVideosLoading] = useState(false);
  const [uploadedImages, setUploadedImages] = useState<ImageAssetItem[]>([]);
  const [uploadedImagesLoading, setUploadedImagesLoading] = useState(false);

  // Generation status
  const [generating, setGenerating] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<number | null>(null);

  const selectedShot = shots.find((s) => s.id === selectedShotId);
  const caps = getModelCaps(selectedModelId);

  // Same-scene shots for reference picking
  const sameSceneShots = useMemo(() => {
    if (!selectedShot?.scene_id) return [];
    return shots.filter((s) => s.scene_id === selectedShot.scene_id);
  }, [shots, selectedShot]);

  const sameSceneFrames = sameSceneShots.filter((s) => s.frame_image_path);
  const sameSceneVideos = sameSceneShots.filter((s) => s.video_clip_path);

  // Get scene name for header
  const sceneName = useMemo(() => {
    if (!selectedShot?.scene_id) return null;
    const scene = scenes.find((s) => s.id === selectedShot.scene_id);
    return scene?.name || selectedShot.scene_id;
  }, [scenes, selectedShot]);

  // When shot changes, auto-fill refs for I2V/R2V modes
  useEffect(() => {
    if (selectedShot?.frame_image_path && (mode === "i2v" || mode === "r2v")) {
      setFirstFramePath(selectedShot.frame_image_path);
      // For R2V, also seed the reference images list with the shot frame
      if (mode === "r2v") {
        setRefImagePaths((prev) => prev.length > 0 ? prev : [selectedShot.frame_image_path!]);
      }
    } else if (!selectedShot) {
      // Clear all refs when no shot selected
      setFirstFramePath(null);
      setLastFramePath(null);
      setRefImagePaths([]);
      setRefVideoPath(null);
      setRefAudioPath(null);
      setPrompt("");
      setNegativePrompt("");
      setError(null);
    }
  }, [selectedShot, mode]);

  // When mode changes, clear refs that aren't relevant
  const handleModeChange = (newMode: GenMode) => {
    setMode(newMode);
    setError(null);
    if (newMode === "t2v") {
      setFirstFramePath(null);
      setLastFramePath(null);
      setRefImagePaths([]);
      setRefVideoPath(null);
      setRefAudioPath(null);
    } else if (newMode === "i2v") {
      setRefImagePaths([]);
      setRefVideoPath(null);
      setRefAudioPath(null);
      // Auto-fill first frame from selected shot
      if (selectedShot?.frame_image_path) {
        setFirstFramePath(selectedShot.frame_image_path);
      }
    } else if (newMode === "r2v") {
      // Auto-fill first reference image from selected shot's storyboard frame
      if (selectedShot?.frame_image_path) {
        setFirstFramePath(selectedShot.frame_image_path);
        setRefImagePaths((prev) => prev.length > 0 ? prev : [selectedShot.frame_image_path!]);
      }
    } else if (newMode === "ia2v") {
      // IA2V: needs first frame + audio clip
      setLastFramePath(null);
      setRefImagePaths([]);
      setRefVideoPath(null);
      if (selectedShot?.frame_image_path) {
        setFirstFramePath(selectedShot.frame_image_path);
      }
    }
  };

  // When model changes, filter out unsupported mode
  useEffect(() => {
    if (mode === "r2v" && !caps.supportsR2V) {
      setMode("i2v");
    } else if (mode === "ia2v" && !caps.supportsIA2V) {
      setMode("i2v");
    }
    if (mode === "i2v" && !caps.supportsI2V) {
      setMode("t2v");
    }
  }, [selectedModelId]);

  // If selected model isn't in the available list, pick the first one
  useEffect(() => {
    if (videoDrivers.length > 0 && !videoDrivers.some((d: any) => d.driver_id === selectedModelId)) {
      setSelectedModelId(videoDrivers[0].driver_id);
    }
  }, [videoDrivers]);

  // Load audio files when audio picker opens
  useEffect(() => {
    if (activePicker === "audio" && audioFiles.length === 0 && !audioLoading) {
      setAudioLoading(true);
      listAudioFiles(projectId)
        .then((res) => setAudioFiles(res.files || []))
        .catch((err) => console.error("Failed to load audio:", err))
        .finally(() => setAudioLoading(false));
    }
  }, [activePicker, projectId, audioFiles.length, audioLoading]);

  // Load uploaded videos when ref video picker opens
  useEffect(() => {
    if (activePicker === "refVideo" && uploadedVideos.length === 0 && !uploadedVideosLoading) {
      setUploadedVideosLoading(true);
      listVideoAssets(projectId)
        .then((res) => setUploadedVideos(res.videos || []))
        .catch((err) => console.error("Failed to load video assets:", err))
        .finally(() => setUploadedVideosLoading(false));
    }
    // Load uploaded images when any image picker opens
    if ((activePicker === "firstFrame" || activePicker === "lastFrame" || activePicker?.startsWith("refImage_")) && uploadedImages.length === 0 && !uploadedImagesLoading) {
      setUploadedImagesLoading(true);
      listImageAssets(projectId)
        .then((res) => setUploadedImages(res.images || []))
        .catch((err) => console.error("Failed to load image assets:", err))
        .finally(() => setUploadedImagesLoading(false));
    }
  }, [activePicker, projectId, uploadedVideos.length, uploadedVideosLoading, uploadedImages.length, uploadedImagesLoading]);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current);
    };
  }, []);

  // Camera movement hint for prompt augmentation
  const cameraHint = CAMERA_MOVEMENTS.find((m) => m.id === cameraMovement)?.hint || "";

  const handleGenerate = async () => {
    if (!selectedShot) {
      setError("Select a shot from the library first");
      return;
    }
    if (!prompt.trim()) {
      setError("Prompt is required");
      return;
    }

    if (mode === "i2v" && !firstFramePath) {
      setError("I2V mode requires a first frame");
      return;
    }
    if (mode === "ia2v" && !firstFramePath) {
      setError("IA2V mode requires a first frame image");
      return;
    }
    if (mode === "ia2v" && !refAudioPath) {
      setError("IA2V mode requires an audio clip for lip-sync");
      return;
    }
    if (mode === "r2v" && refImagePaths.length === 0) {
      setError("R2V mode requires at least one reference image");
      return;
    }

    setGenerating(true);
    setError(null);
    setStatus("Submitting video generation...");

    const req: ShotVideoRequest = {
      project_id: projectId,
      shot_id: selectedShot.id,
      prompt: prompt.trim(),
      negative_prompt: negativePrompt.trim() || undefined,
      model_id: selectedModelId,
      mode,
      duration_seconds: duration,
      seed: seed ? parseInt(seed) : undefined,
      first_frame_path: (mode === "i2v" || mode === "ia2v") ? (firstFramePath || undefined) : undefined,
      last_frame_path: mode === "i2v" ? (lastFramePath || undefined) : undefined,
      reference_image_paths: mode === "r2v" ? refImagePaths : undefined,
      reference_video_path: refVideoPath || undefined,
      reference_audio_path: (mode === "ia2v" || mode === "r2v") ? (refAudioPath || undefined) : undefined,
      camera_movement: { preset: cameraMovement, intensity: 1.0 },
      aspect_ratio: aspectRatio,
      extra_params: mode === "ia2v" ? { enhance_prompt: enhancePrompt } : undefined,
    };

    try {
      const resp = await generateShotVideo(req);
      if (resp.status === "failed") {
        setError(resp.error_message || "Failed to start generation");
        setGenerating(false);
        return;
      }

      setStatus("Generating video...");

      pollRef.current = window.setInterval(async () => {
        try {
          const st = await checkShotVideoStatus(resp.job_id, selectedModelId);
          if (st.status === "completed" && st.video_url) {
            if (pollRef.current) {
              window.clearInterval(pollRef.current);
              pollRef.current = null;
            }
            setStatus("Take generated!");
            setGenerating(false);

            try {
              const { fetchShots } = await import("@/lib/api");
              const fresh = await fetchShots(projectId);
              useStudioStore.getState().setShots(fresh);
            } catch (e) {
              console.error("Failed to refetch shots:", e);
            }
          } else if (st.status === "failed") {
            if (pollRef.current) {
              window.clearInterval(pollRef.current);
              pollRef.current = null;
            }
            setError(st.error_message || "Generation failed");
            setGenerating(false);
          } else {
            setStatus(`Status: ${st.status}...`);
          }
        } catch (err) {
          console.error("Poll error:", err);
        }
      }, 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate");
      setGenerating(false);
    }
  };

  const handleSelectTake = async (takeId: string) => {
    if (!selectedShot) return;
    try {
      await selectVideoTake(projectId, selectedShot.id, takeId);
      const { fetchShots } = await import("@/lib/api");
      const fresh = await fetchShots(projectId);
      useStudioStore.getState().setShots(fresh);
    } catch (err) {
      console.error("Failed to select take:", err);
    }
  };

  const handleSendToTimeline = async (take: VideoTake) => {
    if (!selectedShot) return;
    setTimelineProjectId(projectId);
    const url = take.path;
    const durationSec = await getMediaDuration(url);
    const existingClips = timeline.videoTracks?.[0]?.clips ?? [];
    const startTime = existingClips.reduce((max, c) => {
      const d = typeof c.trimOutSeconds === "number" && c.trimOutSeconds > (c.trimInSeconds ?? 0)
        ? c.trimOutSeconds - (c.trimInSeconds ?? 0)
        : typeof c.mediaDurationSeconds === "number" ? c.mediaDurationSeconds : 5;
      return Math.max(max, c.startTime + d);
    }, 0);

    addTimelineClip("video", {
      sourceType: "shot",
      sourceId: selectedShot.id,
      name: `${selectedShot.name} (Take ${take.id})`,
      sourceUrl: url,
      trimInSeconds: 0,
      trimOutSeconds: typeof durationSec === "number" ? durationSec : null,
      startTime,
      mediaDurationSeconds: typeof durationSec === "number" ? durationSec : null,
    });
  };

  // Available modes for current model
  const availableModes = MODE_TABS.filter((m) => {
    if (m.id === "t2v") return caps.supportsT2V;
    if (m.id === "i2v") return caps.supportsI2V;
    if (m.id === "r2v") return caps.supportsR2V;
    if (m.id === "ia2v") return caps.supportsIA2V;
    return false;
  });

  // ===========================================================================
  // Render
  // ===========================================================================

  // Empty state — no shot selected
  if (!selectedShot) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center max-w-md">
          <div className="w-20 h-20 rounded-full bg-studio-accent/10 border border-studio-accent/20 flex items-center justify-center mx-auto mb-5">
            <Camera className="w-10 h-10 text-studio-accent/60" />
          </div>
          <h2 className="text-lg font-semibold text-studio-text mb-2">No Shot Selected</h2>
          <p className="text-sm text-studio-muted leading-relaxed">
            Pick a shot from the library on the left to start generating video.
            <br />
            Click a storyboard frame or an existing video clip to load it here.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-3xl mx-auto p-6">
        {/* ===== Shot Header ===== */}
        <div className="flex items-start gap-4 mb-6">
          <div className="w-20 h-20 rounded-xl overflow-hidden bg-studio-panel border border-studio-border shrink-0">
            {selectedShot.frame_image_path ? (
              <img src={selectedShot.frame_image_path} alt="" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <Film className="w-8 h-8 text-studio-muted/30" />
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-semibold text-studio-text truncate">{selectedShot.name}</h1>
            {sceneName && (
              <p className="text-sm text-studio-muted">{sceneName}</p>
            )}
            <div className="flex items-center gap-2 mt-1">
              {selectedShot.video_takes && selectedShot.video_takes.length > 0 ? (
                <span className="text-xs text-studio-success flex items-center gap-1">
                  <Check className="w-3 h-3" />
                  {selectedShot.video_takes.length} take{selectedShot.video_takes.length > 1 ? "s" : ""}
                </span>
              ) : (
                <span className="text-xs text-studio-muted/50">No takes yet</span>
              )}
            </div>
          </div>
        </div>

        {/* ===== Mode Tabs ===== */}
        <div className="flex gap-1 mb-5 p-1 bg-studio-panel rounded-xl border border-studio-border">
          {availableModes.map((m) => {
            const Icon = m.icon;
            const isActive = mode === m.id;
            return (
              <button
                key={m.id}
                onClick={() => handleModeChange(m.id)}
                className={`flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  isActive
                    ? "bg-studio-accent text-white shadow-md shadow-studio-accent/20"
                    : "text-studio-muted hover:text-studio-text hover:bg-studio-panelHover"
                }`}
              >
                <Icon className="w-4 h-4" />
                <span className="hidden sm:inline">{m.label}</span>
                <span className="sm:hidden">{m.label.split(" ")[0]}</span>
              </button>
            );
          })}
        </div>

        {/* Mode description */}
        <p className="text-xs text-studio-muted/60 mb-5 text-center">
          {MODE_TABS.find((m) => m.id === mode)?.desc}
        </p>

        {/* ===== Model Selector ===== */}
        <div className="mb-5">
          <label className="text-xs font-semibold text-studio-muted uppercase tracking-wider mb-2 block">
            Video Model
          </label>
          <select
            value={selectedModelId}
            onChange={(e) => setSelectedModelId(e.target.value)}
            className="w-full bg-studio-panel border border-studio-border rounded-xl px-3 py-2.5 text-sm text-studio-text focus:outline-none focus:border-studio-accent"
          >
            {videoDrivers.map((d: any) => (
              <option key={d.driver_id} value={d.driver_id}>
                {d.display_name}{d.category === "cloud" ? " (Cloud)" : ""}
              </option>
            ))}
          </select>
        </div>

        {/* ===== Reference Slots (mode-dependent) ===== */}
        {mode !== "t2v" && (
          <div className="mb-5 space-y-2">
            <label className="text-xs font-semibold text-studio-muted uppercase tracking-wider mb-2 block">
              {mode === "i2v" ? "Frames" : mode === "ia2v" ? "Image + Audio" : "References"}
            </label>

            {/* IA2V mode: First Frame + Audio + Prompt Enhance toggle */}
            {mode === "ia2v" && (
              <>
                {caps.supportsFirstFrame && (
                  <RefSlot
                    label="First Frame"
                    icon={ImageIcon}
                    type="image"
                    value={firstFramePath}
                    onPick={() => setActivePicker("firstFrame")}
                    onClear={() => setFirstFramePath(null)}
                    placeholder="Pick character/scene image..."
                  />
                )}
                {caps.supportsReferenceAudio && (
                  <RefSlot
                    label="Audio (Dialogue / Music)"
                    icon={Mic}
                    type="audio"
                    value={refAudioPath}
                    onPick={() => setActivePicker("audio")}
                    onClear={() => setRefAudioPath(null)}
                    placeholder="Pick audio for lip-sync / dialogue..."
                  />
                )}
                {caps.supportsPromptEnhance && (
                  <label className="flex items-center gap-2 pt-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={enhancePrompt}
                      onChange={(e) => setEnhancePrompt(e.target.checked)}
                      className="w-4 h-4 rounded accent-studio-accent"
                    />
                    <span className="text-xs text-studio-muted">
                      Enhance prompt (LLM rewrites prompt for better LTX results)
                    </span>
                  </label>
                )}
              </>
            )}

            {/* I2V mode: First Frame / Last Frame */}
            {mode === "i2v" && (
              <>
                {caps.supportsFirstFrame && (
                  <RefSlot
                    label="First Frame"
                    icon={ImageIcon}
                    type="image"
                    value={firstFramePath}
                    onPick={() => setActivePicker("firstFrame")}
                    onClear={() => setFirstFramePath(null)}
                    placeholder="Pick storyboard frame..."
                  />
                )}
                {caps.supportsLastFrame && (
                  <RefSlot
                    label="Last Frame (optional)"
                    icon={ImageIcon}
                    type="image"
                    value={lastFramePath}
                    onPick={() => setActivePicker("lastFrame")}
                    onClear={() => setLastFramePath(null)}
                    placeholder="Pick end frame for interpolation..."
                  />
                )}
              </>
            )}

            {/* R2V mode: Images list (multiple) + Video + Audio */}
            {mode === "r2v" && caps.supportsReferenceImages && (
              <div className="space-y-2">
                {/* Reference images list */}
                {refImagePaths.map((imgPath, idx) => (
                  <RefSlot
                    key={idx}
                    label={`Image ${idx + 1}`}
                    icon={ImageIcon}
                    type="image"
                    value={imgPath}
                    onPick={() => setActivePicker(`refImage_${idx}`)}
                    onClear={() => setRefImagePaths((prev) => prev.filter((_, i) => i !== idx))}
                    placeholder={`Reference image ${idx + 1}...`}
                  />
                ))}
                {/* Add image button */}
                {refImagePaths.length < 9 && (
                  <button
                    onClick={() => setActivePicker(`refImage_${refImagePaths.length}`)}
                    className="w-full flex items-center justify-center gap-2 p-3 rounded-xl border border-dashed border-studio-border hover:border-studio-accent/50 text-studio-muted hover:text-studio-accent text-xs font-medium transition-all"
                  >
                    <Plus className="w-4 h-4" />
                    Add Image ({refImagePaths.length}/9)
                  </button>
                )}
              </div>
            )}

            {/* R2V-only: Video and Audio reference slots */}
            {mode === "r2v" && (
              <>
                {caps.supportsReferenceVideo && (
                  <RefSlot
                    label="Video Reference (Motion / Mocap)"
                    icon={Video}
                    type="video"
                    value={refVideoPath}
                    onPick={() => setActivePicker("refVideo")}
                    onClear={() => setRefVideoPath(null)}
                    placeholder="Pick video for motion transfer..."
                  />
                )}
                {caps.supportsReferenceAudio && (
                  <RefSlot
                    label="Audio Reference (Voice Lock)"
                    icon={Mic}
                    type="audio"
                    value={refAudioPath}
                    onPick={() => setActivePicker("audio")}
                    onClear={() => setRefAudioPath(null)}
                    placeholder="Pick audio for voice/music lock..."
                  />
                )}
              </>
            )}
          </div>
        )}

        {/* ===== Prompt ===== */}
        <div className="mb-4">
          <label className="text-xs font-semibold text-studio-muted uppercase tracking-wider mb-2 block">
            Prompt
          </label>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Describe the video motion, scene, and action..."
            rows={4}
            className="w-full bg-studio-panel border border-studio-border rounded-xl px-3 py-2.5 text-sm text-studio-text focus:outline-none focus:border-studio-accent resize-none"
          />
          {/* Camera movement hint preview */}
          {cameraHint && (
            <p className="text-[11px] text-studio-muted/50 mt-1.5 italic">
              Camera: {cameraHint}
            </p>
          )}
        </div>

        {/* ===== Negative Prompt ===== */}
        <div className="mb-5">
          <label className="text-xs font-semibold text-studio-muted uppercase tracking-wider mb-2 block">
            Negative Prompt <span className="opacity-50">(optional)</span>
          </label>
          <input
            value={negativePrompt}
            onChange={(e) => setNegativePrompt(e.target.value)}
            placeholder="What to avoid in the generation..."
            className="w-full bg-studio-panel border border-studio-border rounded-xl px-3 py-2.5 text-sm text-studio-text focus:outline-none focus:border-studio-accent"
          />
        </div>

        {/* ===== Controls Grid ===== */}
        <div className="mb-6 grid grid-cols-2 gap-4">
          {/* Camera movement */}
          {caps.supportsCameraControl && (
            <div>
              <label className="text-xs font-semibold text-studio-muted uppercase tracking-wider mb-2 block">
                Camera Movement
              </label>
              <select
                value={cameraMovement}
                onChange={(e) => setCameraMovement(e.target.value)}
                className="w-full bg-studio-panel border border-studio-border rounded-xl px-3 py-2.5 text-sm text-studio-text focus:outline-none focus:border-studio-accent"
              >
                {CAMERA_MOVEMENTS.map((m) => (
                  <option key={m.id} value={m.id}>{m.label}</option>
                ))}
              </select>
            </div>
          )}

          {/* Duration */}
          <div className={caps.supportsCameraControl ? "" : "col-span-2"}>
            <label className="text-xs font-semibold text-studio-muted uppercase tracking-wider mb-2 block">
              Duration (seconds) <span className="opacity-50">max {caps.maxDuration}s</span>
            </label>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={1}
                max={caps.maxDuration}
                step={1}
                value={duration}
                onChange={(e) => setDuration(parseInt(e.target.value))}
                className="flex-1 accent-studio-accent"
              />
              <span className="text-sm text-studio-text font-medium w-8 text-right">{duration}s</span>
            </div>
          </div>

          {/* Aspect ratio */}
          <div>
            <label className="text-xs font-semibold text-studio-muted uppercase tracking-wider mb-2 block">
              Aspect Ratio
            </label>
            <select
              value={aspectRatio}
              onChange={(e) => setAspectRatio(e.target.value)}
              className="w-full bg-studio-panel border border-studio-border rounded-xl px-3 py-2.5 text-sm text-studio-text focus:outline-none focus:border-studio-accent"
            >
              {ASPECT_RATIOS.map((ar) => (
                <option key={ar.id} value={ar.id}>{ar.label}</option>
              ))}
            </select>
          </div>

          {/* Seed */}
          <div>
            <label className="text-xs font-semibold text-studio-muted uppercase tracking-wider mb-2 block">
              Seed <span className="opacity-50">(optional)</span>
            </label>
            <input
              value={seed}
              onChange={(e) => setSeed(e.target.value.replace(/[^0-9]/g, ""))}
              placeholder="Random"
              className="w-full bg-studio-panel border border-studio-border rounded-xl px-3 py-2.5 text-sm text-studio-text focus:outline-none focus:border-studio-accent"
            />
          </div>
        </div>

        {/* ===== Generate Button ===== */}
        <button
          onClick={handleGenerate}
          disabled={generating || !prompt.trim()}
          className="w-full flex items-center justify-center gap-2 px-6 py-3.5 bg-studio-accent hover:bg-studio-accentHover disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl font-medium transition-all hover:scale-[1.01] shadow-lg shadow-studio-accent/20"
        >
          {generating ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <Wand2 className="w-5 h-5" />
          )}
          {generating ? status : "Generate Take"}
        </button>

        {error && (
          <div className="mt-4 p-3 bg-studio-danger/10 border border-studio-danger/30 rounded-xl text-sm text-studio-danger flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            {error}
          </div>
        )}

        {/* ===== Takes Gallery ===== */}
        {selectedShot.video_takes && selectedShot.video_takes.length > 0 && (
          <div className="mt-8 animate-fade-in">
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <Film className="w-4 h-4 text-studio-accent" />
              Takes ({selectedShot.video_takes.length})
            </h3>
            <div className="grid grid-cols-2 gap-3">
              {selectedShot.video_takes.map((take) => (
                <TakeCard
                  key={take.id}
                  take={take}
                  onSelect={() => handleSelectTake(take.id)}
                  onSendToTimeline={() => handleSendToTimeline(take)}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ===== Reference Picker Modal ===== */}
      {activePicker && (
        <RefPickerModal
          pickerType={activePicker}
          sameSceneFrames={sameSceneFrames}
          sameSceneVideos={sameSceneVideos}
          uploadedVideos={uploadedVideos}
          uploadedVideosLoading={uploadedVideosLoading}
          projectAssets={assets}
          uploadedImages={uploadedImages}
          uploadedImagesLoading={uploadedImagesLoading}
          audioFiles={audioFiles}
          audioLoading={audioLoading}
          onPick={(path) => {
            if (activePicker === "firstFrame") setFirstFramePath(path);
            else if (activePicker === "lastFrame") setLastFramePath(path);
            else if (activePicker === "refVideo") setRefVideoPath(path);
            else if (activePicker === "audio") setRefAudioPath(path);
            else if (activePicker?.startsWith("refImage_")) {
              const idx = parseInt(activePicker.split("_")[1]);
              setRefImagePaths((prev) => {
                const next = [...prev];
                if (idx < next.length) next[idx] = path;
                else next.push(path);
                return next;
              });
            }
            setActivePicker(null);
          }}
          onClose={() => setActivePicker(null)}
        />
      )}
    </div>
  );
}

// =============================================================================
// Helpers
// =============================================================================

function getMediaDuration(url: string): Promise<number | null> {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    video.preload = "metadata";
    video.onloadedmetadata = () => resolve(video.duration);
    video.onerror = () => resolve(null);
    video.src = url;
    setTimeout(() => resolve(null), 8000);
  });
}

// =============================================================================
// Reference Slot Component
// =============================================================================

function RefSlot({
  label,
  icon: Icon,
  type,
  value,
  onPick,
  onClear,
  placeholder,
}: {
  label: string;
  icon: any;
  type: "image" | "video" | "audio";
  value: string | null;
  onPick: () => void;
  onClear: () => void;
  placeholder: string;
}) {
  return (
    <div className="flex items-center gap-3 p-3 bg-studio-panel rounded-xl border border-studio-border">
      <div className="w-10 h-10 rounded-lg bg-studio-bg flex items-center justify-center shrink-0 overflow-hidden">
        {type === "image" && value ? (
          <img src={value} alt="" className="w-full h-full object-cover" />
        ) : (
          <Icon className="w-5 h-5 text-studio-muted" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-studio-text">{label}</p>
        {value ? (
          <p className="text-xs text-studio-muted truncate mt-0.5">{value.split("/").pop()}</p>
        ) : (
          <p className="text-xs text-studio-muted/50 mt-0.5">{placeholder}</p>
        )}
      </div>
      {value ? (
        <button
          onClick={onClear}
          className="p-1.5 rounded-lg hover:bg-studio-danger/10 text-studio-muted hover:text-studio-danger transition-all shrink-0"
        >
          <X className="w-4 h-4" />
        </button>
      ) : (
        <button
          onClick={onPick}
          className="px-3 py-1.5 rounded-lg bg-studio-accent/10 hover:bg-studio-accent/20 text-studio-accent text-xs font-medium transition-all shrink-0 flex items-center gap-1"
        >
          <Plus className="w-3 h-3" /> Pick
        </button>
      )}
    </div>
  );
}

// =============================================================================
// Reference Picker Modal
// =============================================================================

function RefPickerModal({
  pickerType,
  sameSceneFrames,
  sameSceneVideos,
  uploadedVideos,
  uploadedVideosLoading,
  projectAssets,
  uploadedImages,
  uploadedImagesLoading,
  audioFiles,
  audioLoading,
  onPick,
  onClose,
}: {
  pickerType: string;
  sameSceneFrames: any[];
  sameSceneVideos: any[];
  uploadedVideos: VideoAsset[];
  uploadedVideosLoading: boolean;
  projectAssets: AssetResponse[];
  uploadedImages: ImageAssetItem[];
  uploadedImagesLoading: boolean;
  audioFiles: AudioFileItem[];
  audioLoading: boolean;
  onPick: (path: string) => void;
  onClose: () => void;
}) {
  const isRefImagePicker = pickerType.startsWith("refImage_");
  const title = isRefImagePicker
    ? `Pick Reference Image ${parseInt(pickerType.split("_")[1]) + 1}`
    : {
        firstFrame: "Pick First Frame",
        lastFrame: "Pick Last Frame",
        refVideo: "Pick Video Reference (Motion / Mocap)",
        audio: "Pick Audio Reference (Voice Lock)",
      }[pickerType] || "Pick Reference";

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-studio-panel border border-studio-border rounded-2xl max-w-2xl w-full max-h-[80vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-studio-border">
          <h3 className="text-sm font-semibold">{title}</h3>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-studio-panelHover text-studio-muted hover:text-studio-text"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {(pickerType === "firstFrame" || pickerType === "lastFrame" || isRefImagePicker) && (
            <div className="space-y-4">
              {/* Section 1: Storyboard Frames (same scene) */}
              <div>
                <p className="text-[11px] font-semibold text-studio-muted uppercase tracking-wider mb-2">
                  Storyboard Frames ({sameSceneFrames.length})
                </p>
                {sameSceneFrames.length === 0 ? (
                  <p className="text-xs text-studio-muted/50 py-2">No frames in this scene</p>
                ) : (
                  <div className="grid grid-cols-3 gap-3">
                    {sameSceneFrames.map((shot) => (
                      <button
                        key={shot.id}
                        onClick={() => onPick(shot.frame_image_path)}
                        className="group relative aspect-video rounded-xl overflow-hidden border-2 border-transparent hover:border-studio-accent transition-all"
                      >
                        <img
                          src={shot.frame_image_path}
                          alt={shot.name}
                          className="w-full h-full object-cover"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
                        <p className="absolute bottom-1 left-2 right-2 text-xs text-white truncate">{shot.name}</p>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Section 2: Project Assets (characters, locations, props) */}
              {projectAssets.length > 0 && (
                <div>
                  <p className="text-[11px] font-semibold text-studio-muted uppercase tracking-wider mb-2">
                    Project Assets ({projectAssets.length})
                  </p>
                  <div className="grid grid-cols-3 gap-3">
                    {projectAssets.map((asset) => {
                      const thumb = getAssetThumbnailUrl(asset);
                      if (!thumb) return null;
                      return (
                        <button
                          key={asset.id}
                          onClick={() => onPick(thumb)}
                          className="group relative aspect-video rounded-xl overflow-hidden border-2 border-transparent hover:border-studio-accent transition-all"
                        >
                          <img
                            src={thumb}
                            alt={asset.name}
                            className="w-full h-full object-cover"
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
                          <p className="absolute bottom-1 left-2 right-2 text-xs text-white truncate">{asset.name}</p>
                          <span className="absolute top-1 left-1 text-[9px] uppercase bg-black/60 text-white px-1 rounded">{asset.type}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Section 3: Uploaded Images */}
              <div>
                <p className="text-[11px] font-semibold text-studio-muted uppercase tracking-wider mb-2">
                  Uploaded Images ({uploadedImages.length})
                </p>
                {uploadedImagesLoading && (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 className="w-5 h-5 animate-spin text-studio-muted" />
                  </div>
                )}
                {!uploadedImagesLoading && uploadedImages.length === 0 && (
                  <p className="text-xs text-studio-muted/50 py-2">No uploaded images</p>
                )}
                {!uploadedImagesLoading && uploadedImages.length > 0 && (
                  <div className="grid grid-cols-3 gap-3">
                    {uploadedImages.map((img) => (
                      <button
                        key={img.filename}
                        onClick={() => onPick(img.image_url)}
                        className="group relative aspect-video rounded-xl overflow-hidden border-2 border-transparent hover:border-studio-accent transition-all"
                      >
                        <img
                          src={img.image_url}
                          alt={img.filename}
                          className="w-full h-full object-cover"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
                        <p className="absolute bottom-1 left-2 right-2 text-xs text-white truncate">{img.filename}</p>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Empty state if nothing available at all */}
              {sameSceneFrames.length === 0 && projectAssets.length === 0 && uploadedImages.length === 0 && !uploadedImagesLoading && (
                <p className="text-sm text-studio-muted text-center py-8">
                  No images available. Generate storyboard frames, create assets, or upload images first.
                </p>
              )}
            </div>
          )}

          {pickerType === "refVideo" && (
            <div className="space-y-3">
              {/* Uploaded videos (mocap / performance footage) */}
              <div>
                <p className="text-[11px] font-semibold text-studio-muted uppercase tracking-wider mb-2">
                  Uploaded Footage (Motion / Mocap)
                </p>
                {uploadedVideosLoading && (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 className="w-5 h-5 animate-spin text-studio-muted" />
                  </div>
                )}
                {!uploadedVideosLoading && uploadedVideos.length === 0 && (
                  <p className="text-xs text-studio-muted text-center py-4">
                    No uploaded videos. Use the Library tab to upload mocap or performance footage.
                  </p>
                )}
                <div className="space-y-1.5">
                  {uploadedVideos.map((video) => (
                    <button
                      key={video.filename}
                      onClick={() => onPick(video.video_url)}
                      className="w-full flex items-center gap-3 p-2.5 rounded-xl hover:bg-studio-panelHover transition-all text-left"
                    >
                      <div className="w-16 h-10 rounded bg-studio-bg flex items-center justify-center shrink-0">
                        <Video className="w-5 h-5 text-studio-muted" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-studio-text truncate">{video.filename}</p>
                        <p className="text-xs text-studio-muted">
                          {video.duration_seconds ? `${video.duration_seconds.toFixed(1)}s` : ""}
                        </p>
                      </div>
                      <Plus className="w-4 h-4 text-studio-muted group-hover:text-studio-accent shrink-0" />
                    </button>
                  ))}
                </div>
              </div>

              {/* Same-scene generated clips */}
              {sameSceneVideos.length > 0 && (
                <div>
                  <p className="text-[11px] font-semibold text-studio-muted uppercase tracking-wider mb-2">
                    Same-Scene Clips
                  </p>
                  <div className="space-y-1.5">
                    {sameSceneVideos.map((shot) => (
                      <button
                        key={shot.id}
                        onClick={() => onPick(shot.video_clip_path)}
                        className="w-full flex items-center gap-3 p-2.5 rounded-xl hover:bg-studio-panelHover transition-all text-left"
                      >
                        <div className="w-16 h-10 rounded bg-studio-bg overflow-hidden shrink-0">
                          {shot.frame_image_path && (
                            <img src={shot.frame_image_path} alt="" className="w-full h-full object-cover" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-studio-text truncate">{shot.name}</p>
                          <p className="text-xs text-studio-muted">{shot.video_clip_path?.split("/").pop()}</p>
                        </div>
                        <Plus className="w-4 h-4 text-studio-muted group-hover:text-studio-accent shrink-0" />
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {pickerType === "audio" && (
            <div className="space-y-1">
              {audioLoading && (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-studio-muted" />
                </div>
              )}
              {!audioLoading && audioFiles.length === 0 && (
                <p className="text-sm text-studio-muted text-center py-8">
                  No audio files in the project library
                </p>
              )}
              {!audioLoading && audioFiles.map((file) => (
                <button
                  key={file.filename}
                  onClick={() => onPick(file.audio_url)}
                  className="w-full flex items-center gap-3 p-2.5 rounded-xl hover:bg-studio-panelHover transition-all text-left"
                >
                  <div className="w-10 h-10 rounded bg-studio-bg flex items-center justify-center shrink-0">
                    <Mic className="w-5 h-5 text-purple-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-studio-text truncate">{file.filename.replace(/\.[^./\\]+$/, "")}</p>
                    <p className="text-xs text-studio-muted">{(file.size_bytes / 1024).toFixed(1)} KB</p>
                  </div>
                  <Plus className="w-4 h-4 text-studio-muted shrink-0" />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// Take Card Component
// =============================================================================

function TakeCard({
  take,
  onSelect,
  onSendToTimeline,
}: {
  take: VideoTake;
  onSelect: () => void;
  onSendToTimeline: () => void;
}) {
  return (
    <div className={`relative rounded-xl overflow-hidden border-2 transition-all ${
      take.selected ? "border-studio-accent ring-2 ring-studio-accent/30" : "border-studio-border"
    }`}>
      <div className="aspect-video bg-studio-bg relative group">
        <video
          src={take.path}
          className="w-full h-full object-cover"
          muted
          loop
          onMouseEnter={(e) => (e.target as HTMLVideoElement).play()}
          onMouseLeave={(e) => (e.target as HTMLVideoElement).pause()}
        />
        {take.selected && (
          <div className="absolute top-1.5 right-1.5 bg-studio-accent rounded-full p-1">
            <Check className="w-3 h-3 text-white" />
          </div>
        )}
        {/* Hover overlay */}
        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
          {!take.selected && (
            <button
              onClick={onSelect}
              className="px-3 py-1.5 rounded-lg bg-studio-accent text-white text-xs font-medium flex items-center gap-1 hover:bg-studio-accentHover"
            >
              <Check className="w-3 h-3" /> Select
            </button>
          )}
          <button
            onClick={onSendToTimeline}
            className="px-3 py-1.5 rounded-lg bg-studio-panel text-studio-text text-xs font-medium flex items-center gap-1 hover:bg-studio-border"
          >
            <Send className="w-3 h-3" /> Timeline
          </button>
        </div>
      </div>
      <div className="p-2 bg-studio-panel">
        <p className="text-xs text-studio-muted truncate">Take {take.id} · {take.model_id}</p>
      </div>
    </div>
  );
}
