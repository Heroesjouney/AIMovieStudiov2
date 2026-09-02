"use client";

import { useState, useEffect, useRef, useMemo, memo, useCallback } from "react";
import { useStudioStore } from "@/lib/store";
import {
  generateShotVideo,
  checkShotVideoStatus,
  selectVideoTake,
  deleteVideoTake,
  listAudioFiles,
  listVideoAssets,
  listImageAssets,
  getAssetThumbnailUrl,
  updateShot,
  createShot,
  fetchShots,
  type ShotVideoRequest,
  type AudioFileItem,
  type VideoAsset,
  type ImageAssetItem,
  type AssetResponse,
  type VideoTake,
} from "@/lib/api";
import {
  Camera, Loader2, Film, Video, Mic, Image as ImageIcon,
  Plus, Send, Check, X, AlertCircle, Sparkles, Play,
  Type, Layers, Wand2, Trash2, RotateCcw, Dices,
  ChevronDown, Settings, Clock,
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
  { id: "16:9", label: "16:9", sub: "Landscape", w: 28, h: 16 },
  { id: "9:16", label: "9:16", sub: "Portrait", w: 16, h: 28 },
  { id: "1:1", label: "1:1", sub: "Square", w: 20, h: 20 },
  { id: "21:9", label: "21:9", sub: "Cinema", w: 32, h: 14 },
  { id: "4:3", label: "4:3", sub: "Academy", w: 24, h: 18 },
];

const RESOLUTION_OPTIONS = [
  { id: "draft", label: "Draft", megapixels: 0.2, desc: "~480p · Fastest · Lowest VRAM" },
  { id: "standard", label: "Standard", megapixels: 0.4, desc: "~720p · Balanced" },
  { id: "high", label: "High", megapixels: 0.6, desc: "~1080p · Slower · High VRAM" },
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

const FRAMING_OPTIONS = [
  { value: "", label: "Framing: Auto" },
  { value: "wide shot, full scene visible", label: "Wide" },
  { value: "medium shot, waist-up framing", label: "Medium" },
  { value: "close-up on face, head and shoulders", label: "Close-Up" },
  { value: "extreme close-up, eyes and mouth only", label: "Extreme CU" },
  { value: "over the shoulder, foreground figure visible", label: "OTS" },
  { value: "two shot, both characters visible", label: "Two-Shot" },
  { value: "point of view shot, first person perspective", label: "POV" },
  { value: "insert shot, extreme close-up detail", label: "Insert" },
];

const LENS_OPTIONS = [
  { value: "", label: "Lens: Auto" },
  { value: "wide angle lens, 24mm, expansive view, slight distortion", label: "Wide 24mm" },
  { value: "standard lens, 35mm, natural perspective", label: "Standard 35mm" },
  { value: "normal lens, 50mm, lifelike perspective", label: "Normal 50mm" },
  { value: "portrait lens, 85mm, shallow depth of field, creamy bokeh", label: "Portrait 85mm" },
  { value: "telephoto lens, 135mm, compressed perspective, tight framing", label: "Telephoto 135mm" },
  { value: "macro lens, extreme close-up detail, razor-thin depth of field", label: "Macro" },
  { value: "anamorphic lens, 2.39:1 squeeze, oval bokeh, horizontal flares", label: "Anamorphic" },
  { value: "fisheye lens, 180 degree field of view, heavy distortion", label: "Fisheye" },
];

const LIGHTING_OPTIONS = [
  { value: "", label: "Lighting: Auto" },
  { value: "high-key lighting, bright even illumination, minimal shadows, cheerful mood", label: "High-Key" },
  { value: "low-key lighting, deep shadows, high contrast, dramatic mood, chiaroscuro", label: "Low-Key" },
  { value: "rembrandt lighting, triangular highlight on cheek, classic portrait lighting", label: "Rembrandt" },
  { value: "split lighting, one side lit one side dark, inner conflict", label: "Split" },
  { value: "backlight, rim light, silhouette, glowing edges", label: "Backlight" },
  { value: "soft diffused lighting, overcast, gentle wraparound light", label: "Soft Diffused" },
  { value: "hard directional lighting, sharp shadows, intense contrast", label: "Hard Directional" },
  { value: "golden hour lighting, warm sunset glow, long shadows", label: "Golden Hour" },
  { value: "blue hour lighting, cool twilight tones, ambient fill", label: "Blue Hour" },
  { value: "neon lighting, vibrant colored lights, cyberpunk atmosphere", label: "Neon" },
  { value: "practical lighting, motivated by in-scene sources, lamps and screens", label: "Practical" },
];

const COMPOSITION_OPTIONS = [
  { value: "", label: "Composition: Auto" },
  { value: "rule of thirds, subject placed at top-left intersection point of the thirds grid", label: "Thirds: Top-Left" },
  { value: "rule of thirds, subject placed at top-right intersection point of the thirds grid", label: "Thirds: Top-Right" },
  { value: "rule of thirds, subject placed at bottom-left intersection point of the thirds grid", label: "Thirds: Bottom-Left" },
  { value: "rule of thirds, subject placed at bottom-right intersection point of the thirds grid", label: "Thirds: Bottom-Right" },
  { value: "rule of thirds, horizon line on lower third, sky dominates upper two thirds", label: "Thirds: Horizon Low" },
  { value: "rule of thirds, horizon line on upper third, ground dominates lower two thirds", label: "Thirds: Horizon High" },
  { value: "centered composition, subject placed in center of frame", label: "Centered" },
  { value: "leading lines composition, converging lines point toward subject", label: "Leading Lines" },
  { value: "frame within a frame, subject framed through doorway or window", label: "Frame in Frame" },
  { value: "negative space composition, subject placed at edge with large empty area", label: "Negative Space" },
  { value: "headroom composition, subject placed lower in frame with space above", label: "Headroom" },
  { value: "lead room composition, subject placed at frame edge with space in facing direction", label: "Lead Room" },
];

const DURATION_PRESETS = [3, 5, 10];

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
  supportsNegativePrompt: boolean;
  maxDuration: number;
}

function getModelCaps(driverId: string): ModelCaps {
  const caps: Record<string, ModelCaps> = {
    fal_seedance: { supportsFirstFrame: true, supportsLastFrame: true, supportsReferenceImages: false, supportsReferenceVideo: false, supportsReferenceAudio: false, supportsCameraControl: true, supportsT2V: true, supportsI2V: true, supportsR2V: false, supportsIA2V: false, supportsPromptEnhance: false, supportsNegativePrompt: true, maxDuration: 10 },
    fal_seedance_2: { supportsFirstFrame: true, supportsLastFrame: true, supportsReferenceImages: false, supportsReferenceVideo: false, supportsReferenceAudio: false, supportsCameraControl: true, supportsT2V: true, supportsI2V: true, supportsR2V: false, supportsIA2V: false, supportsPromptEnhance: false, supportsNegativePrompt: true, maxDuration: 10 },
    fal_seedance_2_5: { supportsFirstFrame: true, supportsLastFrame: true, supportsReferenceImages: false, supportsReferenceVideo: false, supportsReferenceAudio: false, supportsCameraControl: true, supportsT2V: true, supportsI2V: true, supportsR2V: false, supportsIA2V: false, supportsPromptEnhance: false, supportsNegativePrompt: true, maxDuration: 10 },
    fal_minimax_h3: { supportsFirstFrame: true, supportsLastFrame: false, supportsReferenceImages: false, supportsReferenceVideo: false, supportsReferenceAudio: false, supportsCameraControl: false, supportsT2V: true, supportsI2V: true, supportsR2V: false, supportsIA2V: false, supportsPromptEnhance: false, supportsNegativePrompt: true, maxDuration: 6 },
    ltx_video_2_3: { supportsFirstFrame: true, supportsLastFrame: true, supportsReferenceImages: false, supportsReferenceVideo: false, supportsReferenceAudio: true, supportsCameraControl: true, supportsT2V: true, supportsI2V: true, supportsR2V: false, supportsIA2V: true, supportsPromptEnhance: true, supportsNegativePrompt: false, maxDuration: 10 },
    wan_video: { supportsFirstFrame: true, supportsLastFrame: true, supportsReferenceImages: false, supportsReferenceVideo: false, supportsReferenceAudio: false, supportsCameraControl: true, supportsT2V: true, supportsI2V: true, supportsR2V: false, supportsIA2V: false, supportsPromptEnhance: false, supportsNegativePrompt: true, maxDuration: 10 },
    minimax_h3: { supportsFirstFrame: true, supportsLastFrame: true, supportsReferenceImages: true, supportsReferenceVideo: true, supportsReferenceAudio: true, supportsCameraControl: true, supportsT2V: true, supportsI2V: true, supportsR2V: true, supportsIA2V: false, supportsPromptEnhance: false, supportsNegativePrompt: false, maxDuration: 15 },
  };
  return caps[driverId] || caps.ltx_video_2_3;
}

// =============================================================================
// Main Component
// =============================================================================

export function CameraDirector({ projectId }: { projectId: string }) {
  const {
    shots, selectedShotId, selectedSceneId,
    scenes, videoDrivers, assets,
    addTimelineClip, addAudioTrack, setTimelineProjectId, timeline,
    setSelectedShotId,
  } = useStudioStore();

  // Mode — explicit user selection (default to t2v when no shot selected)
  const [mode, setMode] = useState<GenMode>(selectedShotId ? "i2v" : "t2v");

  // Generation state
  const [selectedModelId, setSelectedModelId] = useState("minimax_h3");
  const [prompt, setPrompt] = useState("");
  const [artStyle, setArtStyle] = useState("");
  const [framing, setFraming] = useState("");
  const [lens, setLens] = useState("");
  const [lighting, setLighting] = useState("");
  const [composition, setComposition] = useState("");
  const [negativePrompt, setNegativePrompt] = useState("");
  const [cameraMovement, setCameraMovement] = useState("static");
  const [duration, setDuration] = useState(5);
  const [seed, setSeed] = useState<string>("");
  const [aspectRatio, setAspectRatio] = useState("16:9");
  const [resolutionQuality, setResolutionQuality] = useState("standard");
  const [freestyleResult, setFreestyleResult] = useState<{ videoUrl: string; prompt: string; lastFramePath?: string; shotId?: string } | null>(null);

  // Reference slots
  const [firstFramePath, setFirstFramePath] = useState<string | null>(null);
  const [lastFramePath, setLastFramePath] = useState<string | null>(null);
  const [refImagePaths, setRefImagePaths] = useState<string[]>([]);
  const [refVideoPath, setRefVideoPath] = useState<string | null>(null);
  const [refAudioPath, setRefAudioPath] = useState<string | null>(null);
  const [enhancePrompt, setEnhancePrompt] = useState(false);
  const [skipContinuity, setSkipContinuity] = useState(false);

  // Advanced settings toggle
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Prompt history
  const [promptHistory, setPromptHistory] = useState<string[]>([]);
  const [showPromptHistory, setShowPromptHistory] = useState(false);

  // Generation elapsed timer
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const elapsedRef = useRef<number | null>(null);

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

  const selectedShot = useMemo(
    () => shots.find((s) => s.id === selectedShotId),
    [shots, selectedShotId]
  );
  const caps = getModelCaps(selectedModelId);

  // Storyboard frames for reference picking — same scene when shot selected, all frames otherwise
  // Exclude hidden (scratch/freestyle) shots from pickers
  const sameSceneFrames = useMemo(() => {
    const visible = shots.filter((s: any) => !s.hidden);
    const sceneId = selectedShot?.scene_id || selectedSceneId;
    if (sceneId) {
      return visible.filter((s) => s.scene_id === sceneId && s.frame_image_path);
    }
    return visible.filter((s) => s.frame_image_path);
  }, [shots, selectedShot, selectedSceneId]);

  const sameSceneVideos = useMemo(() => {
    const visible = shots.filter((s: any) => !s.hidden);
    const sceneId = selectedShot?.scene_id || selectedSceneId;
    if (sceneId) {
      return visible.filter((s) => s.scene_id === sceneId && s.video_clip_path);
    }
    return visible.filter((s) => s.video_clip_path);
  }, [shots, selectedShot, selectedSceneId]);

  // Get scene name for header (from selected shot or selected scene)
  const sceneName = useMemo(() => {
    const sceneId = selectedShot?.scene_id || selectedSceneId;
    if (!sceneId) return null;
    const scene = scenes.find((s) => s.id === sceneId);
    return scene?.name || sceneId;
  }, [scenes, selectedShot, selectedSceneId]);

  // When shot changes, auto-fill refs for I2V/R2V modes (only if user hasn't manually picked something)
  useEffect(() => {
    if (selectedShot?.frame_image_path && (mode === "i2v" || mode === "r2v")) {
      setFirstFramePath((prev) => prev ?? selectedShot.frame_image_path!);
      if (mode === "r2v") {
        setRefImagePaths((prev) => prev.length > 0 ? prev : [selectedShot.frame_image_path!]);
      }
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

  // Track which pickers have already been loaded to avoid re-fetching
  const loadedPickersRef = useRef<Set<string>>(new Set());

  // Load audio files when audio picker opens
  useEffect(() => {
    if (activePicker !== "audio" || loadedPickersRef.current.has("audio")) return;
    loadedPickersRef.current.add("audio");
    setAudioLoading(true);
    listAudioFiles(projectId)
      .then((res) => setAudioFiles(res.files || []))
      .catch((err) => console.error("Failed to load audio:", err))
      .finally(() => setAudioLoading(false));
  }, [activePicker, projectId]);

  // Load uploaded videos when ref video picker opens
  useEffect(() => {
    if (activePicker !== "refVideo" || loadedPickersRef.current.has("refVideo")) return;
    loadedPickersRef.current.add("refVideo");
    setUploadedVideosLoading(true);
    listVideoAssets(projectId)
      .then((res) => setUploadedVideos(res.videos || []))
      .catch((err) => console.error("Failed to load video assets:", err))
      .finally(() => setUploadedVideosLoading(false));
  }, [activePicker, projectId]);

  // Load uploaded images when any image picker opens
  useEffect(() => {
    const isImagePicker = activePicker === "firstFrame" || activePicker === "lastFrame" || activePicker?.startsWith("refImage_");
    if (!isImagePicker || loadedPickersRef.current.has("images")) return;
    loadedPickersRef.current.add("images");
    setUploadedImagesLoading(true);
    listImageAssets(projectId)
      .then((res) => setUploadedImages(res.images || []))
      .catch((err) => console.error("Failed to load image assets:", err))
      .finally(() => setUploadedImagesLoading(false));
  }, [activePicker, projectId]);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current);
    };
  }, []);

  // Camera movement hint for prompt augmentation
  const cameraHint = CAMERA_MOVEMENTS.find((m) => m.id === cameraMovement)?.hint || "";

  // Stable callbacks for RefPickerModal to prevent re-renders
  const handlePickerPick = useCallback((path: string) => {
    setActivePicker((current) => {
      if (current === "firstFrame") setFirstFramePath(path);
      else if (current === "lastFrame") setLastFramePath(path);
      else if (current === "refVideo") setRefVideoPath(path);
      else if (current === "audio") setRefAudioPath(path);
      else if (current?.startsWith("refImage_")) {
        const idx = parseInt(current.split("_")[1]);
        setRefImagePaths((prev) => {
          const next = [...prev];
          if (idx < next.length) next[idx] = path;
          else next.push(path);
          return next;
        });
      }
      return null;
    });
  }, []);

  const handlePickerClose = useCallback(() => setActivePicker(null), []);

  const handleReset = () => {
    if (pollRef.current) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }
    if (elapsedRef.current) {
      window.clearInterval(elapsedRef.current);
      elapsedRef.current = null;
    }
    setSelectedShotId(null);
    setMode("t2v");
    setPrompt("");
    setArtStyle("");
    setFraming("");
    setLens("");
    setLighting("");
    setComposition("");
    setNegativePrompt("");
    setCameraMovement("static");
    setDuration(5);
    setSeed("");
    setAspectRatio("16:9");
    setResolutionQuality("standard");
    setFirstFramePath(null);
    setLastFramePath(null);
    setRefImagePaths([]);
    setRefVideoPath(null);
    setRefAudioPath(null);
    setEnhancePrompt(false);
    setSkipContinuity(false);
    setFreestyleResult(null);
    setError(null);
    setStatus("");
    setGenerating(false);
    setShowAdvanced(false);
    setShowPromptHistory(false);
    setElapsedSeconds(0);
  };

  const handleGenerate = async () => {
    const stopElapsedTimer = () => {
      if (elapsedRef.current) {
        window.clearInterval(elapsedRef.current);
        elapsedRef.current = null;
      }
    };
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

    // Save prompt to history
    if (prompt.trim()) {
      setPromptHistory((prev) => {
        const filtered = prev.filter((p) => p !== prompt.trim());
        return [prompt.trim(), ...filtered].slice(0, 10);
      });
    }

    // Start elapsed timer
    setElapsedSeconds(0);
    elapsedRef.current = window.setInterval(() => {
      setElapsedSeconds((s) => s + 1);
    }, 1000);

    // Auto-create a scratch shot if none selected.
    // If a scene is selected, link the shot to it (visible, with continuity).
    // If no scene, create a hidden freestyle shot.
    let effectiveShotId = selectedShot?.id;
    const isFreestyle = !effectiveShotId;
    if (isFreestyle) {
      try {
        const scene = selectedSceneId ? scenes.find((s) => s.id === selectedSceneId) : null;
        const scratchShot = await createShot(
          projectId,
          scene ? `${scene.name} — Clip ${new Date().toLocaleTimeString()}` : `Freestyle ${new Date().toLocaleTimeString()}`,
          prompt.trim().slice(0, 100),
          selectedSceneId || undefined, // link to scene if selected
          undefined,
          !selectedSceneId, // hidden only if truly freestyle (no scene)
        );
        effectiveShotId = scratchShot.id;
      } catch (e) {
        setError("Failed to create a shot for this video. Try selecting an existing shot.");
        stopElapsedTimer();
        setGenerating(false);
        return;
      }
    }

    const req: ShotVideoRequest = {
      project_id: projectId,
      shot_id: effectiveShotId!,
      prompt: [artStyle, framing, lens, lighting, composition, prompt.trim()].filter(Boolean).join(". "),
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
      extra_params: {
        ...(mode === "ia2v" ? { enhance_prompt: enhancePrompt } : {}),
        megapixels: RESOLUTION_OPTIONS.find((r) => r.id === resolutionQuality)?.megapixels ?? 0.4,
      },
      skip_continuity: skipContinuity,
    };

    try {
      const resp = await generateShotVideo(req);
      if (resp.status === "failed") {
        setError(resp.error_message || "Failed to start generation");
        stopElapsedTimer();
        setGenerating(false);
        return;
      }

      if (resp.continuity_warning) {
        setError(resp.continuity_warning);
      }

      setStatus("Generating video...");

      let pollErrors = 0;
      pollRef.current = window.setInterval(async () => {
        try {
          const st = await checkShotVideoStatus(resp.job_id, selectedModelId);
          pollErrors = 0;
          if (st.status === "completed" && st.video_url) {
            if (pollRef.current) {
              window.clearInterval(pollRef.current);
              pollRef.current = null;
            }
            setStatus("Take generated!");
            stopElapsedTimer();
            setGenerating(false);

            if (isFreestyle) {
              // Freestyle: show result locally, don't touch storyboard
              // Fetch the hidden shot to get the extracted last_frame_path for Continue
              let lastFrame: string | undefined;
              try {
                const { fetchShots } = await import("@/lib/api");
                const allShots = await fetchShots(projectId);
                // Update store so library reactively shows the new video
                useStudioStore.getState().setShots(allShots);
                const scratchShot = allShots.find((s: any) => s.id === effectiveShotId);
                lastFrame = scratchShot?.last_frame_path || undefined;
              } catch (e) {
                console.error("Failed to fetch scratch shot for last frame:", e);
              }
              setFreestyleResult({
                videoUrl: st.video_url,
                prompt: prompt.trim(),
                lastFramePath: lastFrame,
                shotId: effectiveShotId,
              });
            } else {
              // Shot-bound: refresh shots to show the new take
              try {
                const { fetchShots } = await import("@/lib/api");
                const fresh = await fetchShots(projectId);
                useStudioStore.getState().setShots(fresh);
              } catch (e) {
                console.error("Failed to refetch shots:", e);
              }
            }
          } else if (st.status === "failed") {
            if (pollRef.current) {
              window.clearInterval(pollRef.current);
              pollRef.current = null;
            }
            setError(st.error_message || "Generation failed");
            stopElapsedTimer();
            setGenerating(false);
          } else {
            setStatus(`Status: ${st.status}...`);
          }
        } catch (err) {
          pollErrors++;
          console.error("Poll error:", err);
          if (pollErrors >= 5) {
            if (pollRef.current) {
              window.clearInterval(pollRef.current);
              pollRef.current = null;
            }
            setError("Lost connection to backend while polling. The video may still be generating — refresh later.");
            stopElapsedTimer();
            setGenerating(false);
          }
        }
      }, 3000);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [generating, prompt]);

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

  const handleDeleteTake = async (takeId: string) => {
    if (!selectedShot) return;
    try {
      await deleteVideoTake(projectId, selectedShot.id, takeId);
      const fresh = await fetchShots(projectId);
      useStudioStore.getState().setShots(fresh);
    } catch (err) {
      console.error("Failed to delete take:", err);
      const msg = err instanceof Error ? err.message : "Failed to delete take";
      if (msg.includes("404")) {
        setError("Shot or take not found — server may have reloaded. Refreshing shots...");
        const fresh = await fetchShots(projectId);
        useStudioStore.getState().setShots(fresh);
      } else {
        setError(msg);
      }
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

    const groupId = `grp_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const dur = typeof durationSec === "number" ? durationSec : null;

    addTimelineClip("video", {
      sourceType: "shot",
      sourceId: selectedShot.id,
      name: `${selectedShot.name} (Take ${take.id})`,
      sourceUrl: url,
      trimInSeconds: 0,
      trimOutSeconds: dur,
      startTime,
      mediaDurationSeconds: dur,
      groupId,
    });

    // Also add audio clip so the video's audio is visible on an audio track
    const audioTracksList = timeline.audioTracks ?? [];
    const emptyTrack = audioTracksList.find((t) => (t.clips ?? []).length === 0);
    let targetAudioTrackId = emptyTrack?.id ?? null;
    if (!targetAudioTrackId) {
      const nextIdx = audioTracksList.reduce((max, t) => {
        const m = /^a(\d+)$/.exec(t.id);
        const n = m ? Number(m[1]) : 0;
        return Number.isFinite(n) ? Math.max(max, n) : max;
      }, 0) + 1;
      targetAudioTrackId = `a${nextIdx}`;
      addAudioTrack();
    }
    addTimelineClip("audio", {
      sourceType: "shot",
      sourceId: selectedShot.id,
      name: `${selectedShot.name} (Take ${take.id}) (Audio)`,
      sourceUrl: url,
      trimInSeconds: 0,
      trimOutSeconds: dur,
      startTime,
      mediaDurationSeconds: dur,
      groupId,
    }, targetAudioTrackId);
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

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-3xl mx-auto p-4">
        {/* ===== Header — shot info or freestyle banner ===== */}
        <div className="flex items-start gap-3 mb-4">
          <div className="w-12 h-12 rounded-lg overflow-hidden bg-studio-panel border border-studio-border shrink-0">
            {selectedShot?.frame_image_path ? (
              <img src={selectedShot.frame_image_path} alt="" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <Camera className="w-5 h-5 text-studio-accent/40" />
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-sm font-semibold text-studio-text truncate">
              {selectedShot ? selectedShot.name : "Freestyle Generation"}
            </h1>
            {selectedShot ? (
              <>
                {sceneName && <p className="text-sm text-studio-muted">{sceneName}</p>}
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
              </>
            ) : (
              <p className="text-sm text-studio-muted">No shot selected — a new shot will be created on generate.</p>
            )}
          </div>
        </div>

        {/* ===== Mode Tabs ===== */}
        <div className="flex gap-1 mb-3 p-0.5 bg-studio-panel rounded-lg border border-studio-border">
          {availableModes.map((m) => {
            const Icon = m.icon;
            const isActive = mode === m.id;
            return (
              <button
                key={m.id}
                onClick={() => handleModeChange(m.id)}
                className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md text-xs font-medium transition-all ${
                  isActive
                    ? "bg-studio-accent text-white shadow-sm shadow-studio-accent/20"
                    : "text-studio-muted hover:text-studio-text hover:bg-studio-panelHover"
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{m.label}</span>
                <span className="sm:hidden">{m.label.split(" ")[0]}</span>
              </button>
            );
          })}
        </div>

        {/* Mode description */}
        <p className="text-[11px] text-studio-muted/60 mb-3 text-center">
          {MODE_TABS.find((m) => m.id === mode)?.desc}
        </p>

        {/* ===== Model Selector ===== */}
        <div className="mb-3">
          <label className="text-[10px] font-semibold text-studio-muted uppercase tracking-wider mb-1.5 block">
            Video Model
          </label>
          <select
            value={selectedModelId}
            onChange={(e) => setSelectedModelId(e.target.value)}
            className="w-full bg-studio-panel border border-studio-border rounded-lg px-2.5 py-1.5 text-xs text-studio-text focus:outline-none focus:border-studio-accent"
          >
            {videoDrivers.map((d: any) => (
              <option key={d.driver_id} value={d.driver_id}>
                {d.display_name}{d.category === "cloud" ? " (Cloud)" : ""}
              </option>
            ))}
          </select>
          {/* Model capability badges */}
          <div className="flex flex-wrap gap-1.5 mt-2">
            <span className="px-2 py-0.5 text-[10px] rounded-full bg-studio-border/50 text-studio-muted">
              Max {caps.maxDuration}s
            </span>
            {caps.supportsNegativePrompt && (
              <span className="px-2 py-0.5 text-[10px] rounded-full bg-studio-border/50 text-studio-muted">Neg Prompt</span>
            )}
            {caps.supportsCameraControl && (
              <span className="px-2 py-0.5 text-[10px] rounded-full bg-studio-border/50 text-studio-muted">Camera Ctrl</span>
            )}
            {caps.supportsReferenceVideo && (
              <span className="px-2 py-0.5 text-[10px] rounded-full bg-studio-border/50 text-studio-muted">Ref Video</span>
            )}
            {caps.supportsReferenceAudio && (
              <span className="px-2 py-0.5 text-[10px] rounded-full bg-studio-border/50 text-studio-muted">Ref Audio</span>
            )}
            {caps.supportsPromptEnhance && (
              <span className="px-2 py-0.5 text-[10px] rounded-full bg-studio-border/50 text-studio-muted">Prompt Enhance</span>
            )}
          </div>
        </div>

        {/* ===== Reference Slots (mode-dependent) ===== */}
        {mode !== "t2v" && (
          <div className="mb-3 space-y-1.5">
            <label className="text-[10px] font-semibold text-studio-muted uppercase tracking-wider mb-1.5 block">
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
                    placeholder="Pick frame, asset, or image..."
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
        <div className="mb-3">
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-[10px] font-semibold text-studio-muted uppercase tracking-wider">
              Prompt
            </label>
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
                    <div className="absolute right-0 top-full mt-1 z-20 w-80 max-h-60 overflow-y-auto bg-studio-panel border border-studio-border rounded-xl shadow-xl">
                      {promptHistory.map((p, i) => (
                        <button
                          key={i}
                          onClick={() => { setPrompt(p); setShowPromptHistory(false); }}
                          className="w-full text-left px-3 py-2 text-xs text-studio-text hover:bg-studio-border/40 transition-colors border-b border-studio-border/30 last:border-0"
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
            placeholder="Describe the video motion, scene, and action..."
            rows={3}
            className="w-full bg-studio-panel border border-studio-border rounded-lg px-2.5 py-2 text-xs text-studio-text focus:outline-none focus:border-studio-accent resize-none"
          />
          {/* Style + Framing + Lens + Lighting + Camera movement dropdowns */}
          <div className="flex flex-wrap gap-2 mt-2">
            <select
              value={artStyle}
              onChange={(e) => setArtStyle(e.target.value)}
              className="bg-studio-panel border border-studio-border rounded-lg px-2 py-1 text-[10px] text-studio-text focus:border-studio-accent focus:outline-none"
            >
              {STYLE_OPTIONS.map((opt) => <option key={opt.label} value={opt.value}>{opt.label}</option>)}
            </select>
            <select
              value={framing}
              onChange={(e) => setFraming(e.target.value)}
              className="bg-studio-panel border border-studio-border rounded-lg px-2 py-1 text-[10px] text-studio-text focus:border-studio-accent focus:outline-none"
            >
              {FRAMING_OPTIONS.map((opt) => <option key={opt.label} value={opt.value}>{opt.label}</option>)}
            </select>
            <select
              value={lens}
              onChange={(e) => setLens(e.target.value)}
              className="bg-studio-panel border border-studio-border rounded-lg px-2 py-1 text-[10px] text-studio-text focus:border-studio-accent focus:outline-none"
            >
              {LENS_OPTIONS.map((opt) => <option key={opt.label} value={opt.value}>{opt.label}</option>)}
            </select>
            <select
              value={lighting}
              onChange={(e) => setLighting(e.target.value)}
              className="bg-studio-panel border border-studio-border rounded-lg px-2 py-1 text-[10px] text-studio-text focus:border-studio-accent focus:outline-none"
            >
              {LIGHTING_OPTIONS.map((opt) => <option key={opt.label} value={opt.value}>{opt.label}</option>)}
            </select>
            <select
              value={composition}
              onChange={(e) => setComposition(e.target.value)}
              className="bg-studio-panel border border-studio-border rounded-lg px-2 py-1 text-[10px] text-studio-text focus:border-studio-accent focus:outline-none"
            >
              {COMPOSITION_OPTIONS.map((opt) => <option key={opt.label} value={opt.value}>{opt.label}</option>)}
            </select>
            <select
              value={cameraMovement}
              onChange={(e) => setCameraMovement(e.target.value)}
              className="bg-studio-panel border border-studio-border rounded-lg px-2 py-1 text-[10px] text-studio-text focus:border-studio-accent focus:outline-none"
            >
              {CAMERA_MOVEMENTS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
          </div>
          {/* Camera movement hint preview */}
          {cameraHint && (
            <p className="text-[11px] text-studio-muted/50 mt-1.5 italic">
              Camera: {cameraHint}
            </p>
          )}
        </div>

        {/* ===== Controls Grid (Basic) ===== */}
        <div className="mb-3 grid grid-cols-2 gap-3">
          {/* Duration with presets */}
          <div className="col-span-2">
            <label className="text-[10px] font-semibold text-studio-muted uppercase tracking-wider mb-1.5 block">
              Duration <span className="opacity-50">max {caps.maxDuration}s</span>
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
            <div className="flex gap-1.5 mt-1.5">
              {DURATION_PRESETS.filter((p) => p <= caps.maxDuration).map((p) => (
                <button
                  key={p}
                  onClick={() => setDuration(p)}
                  className={`px-2 py-0.5 text-[10px] rounded-md transition-all ${
                    duration === p
                      ? "bg-studio-accent/20 text-studio-accent border border-studio-accent/40"
                      : "bg-studio-panel border border-studio-border text-studio-muted hover:text-studio-text"
                  }`}
                >
                  {p}s
                </button>
              ))}
            </div>
          </div>

          {/* Resolution quality */}
          <div>
            <label className="text-[10px] font-semibold text-studio-muted uppercase tracking-wider mb-1.5 block">
              Resolution
            </label>
            <select
              value={resolutionQuality}
              onChange={(e) => setResolutionQuality(e.target.value)}
              className="w-full bg-studio-panel border border-studio-border rounded-lg px-2.5 py-1.5 text-xs text-studio-text focus:outline-none focus:border-studio-accent"
            >
              {RESOLUTION_OPTIONS.map((r) => (
                <option key={r.id} value={r.id}>{r.label} — {r.desc}</option>
              ))}
            </select>
          </div>

          {/* Aspect ratio */}
          <div className="col-span-2">
            <label className="text-[10px] font-semibold text-studio-muted uppercase tracking-wider mb-1.5 block">
              Aspect Ratio
            </label>
            <div className="flex gap-1.5">
              {ASPECT_RATIOS.map((ar) => {
                const isActive = aspectRatio === ar.id;
                return (
                  <button
                    key={ar.id}
                    type="button"
                    onClick={() => setAspectRatio(ar.id)}
                    title={`${ar.label} ${ar.sub}`}
                    className={`flex flex-col items-center gap-1.5 px-2.5 py-2 rounded-lg border transition-all ${
                      isActive
                        ? "border-studio-accent bg-studio-accent/10 text-studio-accent"
                        : "border-studio-border bg-studio-panel text-studio-muted hover:text-studio-text hover:bg-studio-panelHover"
                    }`}
                  >
                    <div
                      className={`rounded-[2px] border-2 ${isActive ? "border-studio-accent" : "border-current"}`}
                      style={{ width: ar.w, height: ar.h }}
                    />
                    <span className="text-[10px] font-medium leading-none">{ar.label}</span>
                    <span className="text-[9px] leading-none opacity-60">{ar.sub}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* ===== Advanced Settings (collapsible) ===== */}
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
              {/* Negative Prompt */}
              {caps.supportsNegativePrompt && (
                <div>
                  <label className="text-[10px] font-semibold text-studio-muted uppercase tracking-wider mb-1.5 block">
                    Negative Prompt <span className="opacity-50">(optional)</span>
                  </label>
                  <input
                    value={negativePrompt}
                    onChange={(e) => setNegativePrompt(e.target.value)}
                    placeholder="What to avoid in the generation..."
                    className="w-full bg-studio-panel border border-studio-border rounded-lg px-2.5 py-1.5 text-xs text-studio-text focus:outline-none focus:border-studio-accent"
                  />
                </div>
              )}

              {/* Seed */}
              <div>
                <label className="text-[10px] font-semibold text-studio-muted uppercase tracking-wider mb-1.5 block">
                  Seed <span className="opacity-50">(optional)</span>
                </label>
                <div className="flex gap-1.5">
                  <input
                    value={seed}
                    onChange={(e) => setSeed(e.target.value.replace(/[^0-9]/g, ""))}
                    placeholder="Random"
                    className="flex-1 bg-studio-panel border border-studio-border rounded-lg px-2.5 py-1.5 text-xs text-studio-text focus:outline-none focus:border-studio-accent"
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

              {/* Continuity Toggle */}
              {mode === "t2v" && (
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={!skipContinuity}
                    onChange={(e) => setSkipContinuity(!e.target.checked)}
                    className="accent-studio-accent w-4 h-4"
                  />
                  <span className="text-xs text-studio-muted">
                    Auto-continue from previous shot's last frame
                  </span>
                </label>
              )}
            </div>
          )}
        </div>

        {/* ===== Generate / Reset Buttons ===== */}
        <div className="flex gap-2">
          <button
            onClick={handleGenerate}
            disabled={generating || !prompt.trim()}
            className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2 bg-studio-accent hover:bg-studio-accentHover disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs rounded-lg font-medium transition-all hover:scale-[1.01] shadow-md shadow-studio-accent/20"
          >
            {generating ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Wand2 className="w-4 h-4" />
            )}
            {generating ? (
              <span className="flex items-center gap-1.5">
                {status}
                <span className="text-[10px] opacity-70">({Math.floor(elapsedSeconds / 60)}:{(elapsedSeconds % 60).toString().padStart(2, "0")})</span>
              </span>
            ) : (
              <span className="flex items-center gap-1.5">
                Generate Take
                <kbd className="hidden sm:inline text-[9px] px-1 py-0.5 rounded bg-white/10 border border-white/20">Ctrl+↵</kbd>
              </span>
            )}
          </button>
          <button
            onClick={handleReset}
            disabled={generating}
            className="flex items-center justify-center gap-1.5 px-3 py-2 bg-studio-panel hover:bg-studio-border disabled:opacity-40 text-studio-muted hover:text-studio-text text-xs rounded-lg font-medium transition-all border border-studio-border"
            title="Clear all settings"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset
          </button>
        </div>

        {error && (
          <div className="mt-3 p-2 bg-studio-danger/10 border border-studio-danger/30 rounded-lg text-xs text-studio-danger flex items-start gap-1.5">
            <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            {error}
          </div>
        )}

        {/* ===== Freestyle Result ===== */}
        {freestyleResult && (
          <div className="mt-6 animate-fade-in">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <Film className="w-4 h-4 text-studio-accent" />
                Result
              </h3>
              <button
                onClick={() => setFreestyleResult(null)}
                className="text-xs text-studio-muted hover:text-studio-text transition-colors"
              >
                Dismiss
              </button>
            </div>
            <div className="rounded-xl overflow-hidden border border-studio-border bg-studio-panel">
              <video
                src={freestyleResult.videoUrl}
                controls
                autoPlay
                loop
                className="w-full"
              />
              <div className="p-3 flex items-center justify-between">
                <p className="text-xs text-studio-muted truncate flex-1 mr-3">{freestyleResult.prompt}</p>
                <div className="flex items-center gap-2 shrink-0">
                  {freestyleResult.lastFramePath && (
                    <button
                      onClick={() => {
                        handleModeChange("i2v");
                        setFirstFramePath(freestyleResult.lastFramePath!);
                        setPrompt("");
                        setFreestyleResult(null);
                        setStatus("Continuing from last frame...");
                      }}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-studio-accent/20 hover:bg-studio-accent/30 text-studio-accent rounded-lg text-xs font-medium transition-colors"
                    >
                      <Play className="w-3 h-3" />
                      Continue
                    </button>
                  )}
                  <button
                    onClick={async () => {
                      setTimelineProjectId(projectId);
                      const fGroupId = `grp_${Date.now()}_${Math.random().toString(16).slice(2)}`;
                      const fDur = await getMediaDuration(freestyleResult.videoUrl);
                      const fDurNum = typeof fDur === "number" ? fDur : null;
                      addTimelineClip("video", {
                        sourceType: "upload",
                        sourceId: `freestyle_${Date.now()}`,
                        name: `Freestyle Video`,
                        sourceUrl: freestyleResult.videoUrl,
                        trimInSeconds: 0,
                        trimOutSeconds: fDurNum,
                        mediaDurationSeconds: fDurNum,
                        groupId: fGroupId,
                      });
                      // Also add audio clip
                      const aTracks = timeline.audioTracks ?? [];
                      const emptyA = aTracks.find((t) => (t.clips ?? []).length === 0);
                      let aTrackId = emptyA?.id ?? null;
                      if (!aTrackId) {
                        const nextIdx = aTracks.reduce((max, t) => {
                          const m = /^a(\d+)$/.exec(t.id);
                          const n = m ? Number(m[1]) : 0;
                          return Number.isFinite(n) ? Math.max(max, n) : max;
                        }, 0) + 1;
                        aTrackId = `a${nextIdx}`;
                        addAudioTrack();
                      }
                      addTimelineClip("audio", {
                        sourceType: "upload",
                        sourceId: `freestyle_${Date.now()}`,
                        name: `Freestyle Video (Audio)`,
                        sourceUrl: freestyleResult.videoUrl,
                        trimInSeconds: 0,
                        trimOutSeconds: fDurNum,
                        mediaDurationSeconds: fDurNum,
                        groupId: fGroupId,
                      }, aTrackId);
                      setFreestyleResult(null);
                      setStatus("Sent to timeline!");
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-studio-accent hover:bg-studio-accentHover text-white rounded-lg text-xs font-medium transition-colors"
                  >
                    <Send className="w-3 h-3" />
                    Send to Timeline
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ===== Takes Gallery ===== */}
        {selectedShot?.video_takes && selectedShot.video_takes.length > 0 && (
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
                  onDelete={() => handleDeleteTake(take.id)}
                  onContinue={selectedShot.last_frame_path ? () => {
                    handleModeChange("i2v");
                    setFirstFramePath(selectedShot.last_frame_path!);
                    setPrompt("");
                    setError(null);
                  } : undefined}
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
          onPick={handlePickerPick}
          onClose={handlePickerClose}
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
    <div className="flex items-center gap-2 p-2 bg-studio-panel rounded-lg border border-studio-border">
      <div className="w-8 h-8 rounded-md bg-studio-bg flex items-center justify-center shrink-0 overflow-hidden">
        {type === "image" && value ? (
          <img src={value} alt="" className="w-full h-full object-cover" />
        ) : (
          <Icon className="w-4 h-4 text-studio-muted" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[11px] font-medium text-studio-text">{label}</p>
        {value ? (
          <p className="text-[10px] text-studio-muted truncate mt-0.5">{value.split("/").pop()}</p>
        ) : (
          <p className="text-[10px] text-studio-muted/50 mt-0.5">{placeholder}</p>
        )}
      </div>
      {value ? (
        <button
          onClick={onClear}
          className="p-1 rounded-md hover:bg-studio-danger/10 text-studio-muted hover:text-studio-danger transition-all shrink-0"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      ) : (
        <button
          onClick={onPick}
          className="px-2 py-1 rounded-md bg-studio-accent/10 hover:bg-studio-accent/20 text-studio-accent text-[11px] font-medium transition-all shrink-0 flex items-center gap-1"
        >
          <Plus className="w-2.5 h-2.5" /> Pick
        </button>
      )}
    </div>
  );
}

// =============================================================================
// Reference Picker Modal
// =============================================================================

const RefPickerModal = memo(function RefPickerModal({
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
              {/* Section 1: Storyboard Frames */}
              <div>
                <p className="text-[11px] font-semibold text-studio-muted uppercase tracking-wider mb-2">
                  Storyboard Frames ({sameSceneFrames.length})
                </p>
                {sameSceneFrames.length === 0 ? (
                  <p className="text-xs text-studio-muted/50 py-2">No frames available</p>
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
                    Shot Clips
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
});

// =============================================================================
// Take Card Component
// =============================================================================

function TakeCard({
  take,
  onSelect,
  onSendToTimeline,
  onDelete,
  onContinue,
}: {
  take: VideoTake;
  onSelect: () => void;
  onSendToTimeline: () => void;
  onDelete: () => void;
  onContinue?: () => void;
}) {
  const [showPreview, setShowPreview] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <>
      <div className={`relative rounded-xl overflow-hidden border-2 transition-all ${
        take.selected ? "border-studio-accent ring-2 ring-studio-accent/30" : "border-studio-border"
      }`}>
        <div className="aspect-video bg-studio-bg relative group cursor-pointer" onClick={() => setShowPreview(true)}>
          <video
            src={take.path}
            className="w-full h-full object-cover"
            muted
            loop
            onMouseEnter={(e) => (e.target as HTMLVideoElement).play()}
            onMouseLeave={(e) => (e.target as HTMLVideoElement).pause()}
          />
          {/* Selected badge */}
          {take.selected && (
            <div className="absolute top-2 right-2 bg-studio-accent rounded-full px-2 py-0.5 flex items-center gap-1 shadow-lg">
              <Check className="w-3 h-3 text-white" />
              <span className="text-[10px] font-bold text-white uppercase tracking-wide">Active</span>
            </div>
          )}
          {/* Play icon overlay on hover */}
          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
            <div className="w-12 h-12 rounded-full bg-white/90 flex items-center justify-center shadow-xl">
              <Play className="w-6 h-6 text-studio-bg ml-0.5" />
            </div>
          </div>
        </div>
        {/* Footer with label and actions */}
        <div className="p-2.5 bg-studio-panel space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-studio-text">Take {take.id.slice(0, 8)}</span>
            <span className="text-[10px] font-medium text-studio-muted bg-studio-bg px-1.5 py-0.5 rounded">
              {take.model_id}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            {!take.selected && (
              <button
                onClick={onSelect}
                className="flex-1 px-2 py-1.5 rounded-lg bg-studio-accent text-white text-xs font-medium flex items-center justify-center gap-1 hover:bg-studio-accentHover transition-colors"
              >
                <Check className="w-3.5 h-3.5" /> Select
              </button>
            )}
            <button
              onClick={onSendToTimeline}
              className="flex-1 px-2 py-1.5 rounded-lg bg-studio-bg text-studio-text text-xs font-medium flex items-center justify-center gap-1 hover:bg-studio-border transition-colors"
              title="Send to timeline"
            >
              <Send className="w-3.5 h-3.5" /> Timeline
            </button>
            {onContinue && (
              <button
                onClick={onContinue}
                className="px-2 py-1.5 rounded-lg bg-studio-bg text-studio-text text-xs font-medium flex items-center justify-center gap-1 hover:bg-studio-border transition-colors"
                title="Continue from last frame"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            )}
            {confirmDelete ? (
              <button
                onClick={() => { onDelete(); setConfirmDelete(false); }}
                className="px-2 py-1.5 rounded-lg bg-red-500 text-white text-xs font-medium flex items-center justify-center gap-1 hover:bg-red-600 transition-colors"
                title="Confirm delete"
              >
                <Trash2 className="w-3.5 h-3.5" /> Confirm
              </button>
            ) : (
              <button
                onClick={() => setConfirmDelete(true)}
                className="px-2 py-1.5 rounded-lg bg-studio-bg text-studio-muted text-xs font-medium flex items-center justify-center gap-1 hover:bg-red-500/20 hover:text-red-400 transition-colors"
                title="Delete take"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Preview Modal */}
      {showPreview && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-8"
          onClick={() => setShowPreview(false)}
        >
          <div
            className="relative max-w-3xl w-full bg-studio-panel rounded-2xl overflow-hidden border border-studio-border"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-3 border-b border-studio-border">
              <span className="text-sm font-medium text-studio-text">Take {take.id} · {take.model_id}</span>
              <button
                onClick={() => setShowPreview(false)}
                className="text-studio-muted hover:text-studio-text"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <video
              src={take.path}
              className="w-full max-h-[70vh]"
              controls
              autoPlay
              loop
            />
          </div>
        </div>
      )}
    </>
  );
}
