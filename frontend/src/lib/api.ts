/**
 * AI Movie Studio 2 - API Client
 * 
 * All backend API calls go through this module.
 */

const API_BASE = "/api";

// =============================================================================
// Types
// =============================================================================

export interface DriverInfo {
  driver_id: string;
  display_name: string;
  category: "local" | "cloud";
  description?: string;
  supported_features: string[];
  max_duration_seconds?: number;
  requires_api_key: boolean;
  api_key_env_var?: string;
  max_reference_images?: number;
  max_reference_videos?: number;
  max_reference_audio?: number;
  max_total_references?: number;
  resolution_tiers?: string[];
}

export interface DriversList {
  image: DriverInfo[];
  video: DriverInfo[];
  audio: DriverInfo[];
}

export interface AssetResponse {
  id: string;
  project_id: string;
  type: string;
  name: string;
  version: number;
  status: string;
  primary_image: string | null;
  thumbnail: string | null;
  folder_path: string | null;
  tags: string[];
  description: string | null;
  generation_prompt?: string | null;
  character_data?: any;
  location_data?: any;
  created_at: string;
  updated_at: string;
}

export interface GenerationResponse {
  job_id: string;
  status: string;
  image_urls?: string[];
  image_paths?: string[];
  video_url?: string;
  video_path?: string;
  audio_url?: string;
  audio_path?: string;
  error_message?: string;
  metadata?: any;
  sub_jobs?: { angle: string; sub_job_id: string }[];
}

export interface VideoTake {
  id: string;
  path: string;
  seed: number | null;
  prompt: string;
  negative_prompt: string | null;
  model_id: string;
  camera_movement: any;
  mode: string;
  created_at: string;
  selected: boolean;
  retake_of?: string;
  retake_range?: [number, number];
}

export interface ShotResponse {
  id: string;
  project_id: string;
  scene_id: string | null;
  name: string;
  shot_type: string;
  status: string;
  description: string;
  notes: string | null;
  sequence_order: number;
  assets: any[];
  frame_image_path: string | null;
  angle_images: Record<string, string>;
  video_clip_path: string | null;
  video_takes: VideoTake[];
  audio_clip_path: string | null;
  last_frame_path: string | null;
  camera_params: any;
  camera_movement: any;
  generation_recipe: any;
  created_at: string;
  updated_at: string;
}

export interface ProjectResponse {
  id: string;
  name: string;
  description: string;
  created_at: string;
  asset_count: number;
  shot_count: number;
}

export interface ShotAssetRef {
  asset_id: string;
  asset_type: string;
  asset_name: string;
  image_path: string | null;
  retention?: string;
}

export interface SceneAssetRef {
  asset_id: string;
  asset_type: string;
  asset_name: string;
  image_path: string | null;
}

export interface SceneResponse {
  id: string;
  project_id: string;
  name: string;
  description: string | null;
  sequence_order: number;
  time_of_day: string;
  mood: string;
  lighting: string;
  defaults: any;
  reference_assets: SceneAssetRef[];
  establishing_frame_path: string | null;
  shot_ids: string[];
  created_at: string;
  updated_at: string;
}

// =============================================================================
// API Functions
// =============================================================================

// Drivers
export async function getDrivers(): Promise<DriversList> {
  const resp = await fetch(`${API_BASE}/generate/drivers`);
  return resp.json();
}

// Assets
export async function fetchAssets(projectId: string, type?: string): Promise<AssetResponse[]> {
  const url = type
    ? `${API_BASE}/assets/${projectId}?asset_type=${type}`
    : `${API_BASE}/assets/${projectId}`;
  const resp = await fetch(url);
  return resp.json();
}

export async function createAsset(projectId: string, type: string, name: string, description?: string): Promise<AssetResponse> {
  const resp = await fetch(`${API_BASE}/assets/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ project_id: projectId, type, name, description }),
  });
  return resp.json();
}

export async function deleteAsset(projectId: string, assetId: string): Promise<void> {
  await fetch(`${API_BASE}/assets/${projectId}/${assetId}`, { method: "DELETE" });
}

export async function updateAsset(projectId: string, assetId: string, updates: Record<string, any>): Promise<AssetResponse> {
  const resp = await fetch(`${API_BASE}/assets/${projectId}/${assetId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(updates),
  });
  return resp.json();
}

export async function saveGeneratedToAsset(
  projectId: string,
  imageUrl: string,
  name: string,
  assetType: string = "character",
  prompt?: string,
  description?: string,
  assetId?: string,
): Promise<AssetResponse> {
  const resp = await fetch(`${API_BASE}/assets/save-generated`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      project_id: projectId,
      image_url: imageUrl,
      name,
      asset_type: assetType,
      prompt,
      description,
      asset_id: assetId,
    }),
  });
  return resp.json();
}

export async function uploadAsset(projectId: string, name: string, type: string, file: File, description?: string): Promise<AssetResponse> {
  const formData = new FormData();
  formData.append("project_id", projectId);
  formData.append("name", name);
  formData.append("asset_type", type);
  formData.append("description", description || "");
  formData.append("file", file);
  const resp = await fetch(`${API_BASE}/assets/upload`, {
    method: "POST",
    body: formData,
  });
  return resp.json();
}

// Image Generation
export async function generateImage(
  prompt: string,
  modelId: string,
  negativePrompt?: string,
  width?: number,
  height?: number,
  seed?: number,
  referenceImagePaths?: string[],
): Promise<GenerationResponse> {
  const params = new URLSearchParams({ prompt, model_id: modelId });
  if (negativePrompt) params.set("negative_prompt", negativePrompt);
  if (width) params.set("width", String(width));
  if (height) params.set("height", String(height));
  if (seed !== undefined) params.set("seed", String(seed));
  if (referenceImagePaths?.length) {
    params.set("reference_image_paths", referenceImagePaths.join(","));
  }
  const resp = await fetch(`${API_BASE}/generate/image?${params}`, { method: "POST" });
  return resp.json();
}

export async function checkGenerationStatus(jobId: string, modelId: string): Promise<GenerationResponse> {
  const resp = await fetch(`${API_BASE}/generate/status/${jobId}?model_id=${modelId}`);
  return resp.json();
}

export async function generateAssetSheet(
  projectId: string,
  assetId: string,
  prompt?: string,
  seed?: number,
  modelId?: string,
): Promise<GenerationResponse> {
  const resp = await fetch(`${API_BASE}/generate/asset-sheet`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      project_id: projectId,
      asset_id: assetId,
      prompt: prompt || null,
      seed: seed || null,
      model_id: modelId || null,
    }),
  });
  return resp.json();
}

export async function generateTurnaroundSheet(
  projectId: string,
  assetId: string,
  characterDescription?: string,
  prompt?: string,
  seed?: number,
): Promise<GenerationResponse> {
  const resp = await fetch(`${API_BASE}/generate/turnaround-sheet`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      project_id: projectId,
      asset_id: assetId,
      character_description: characterDescription || null,
      prompt: prompt || null,
      seed: seed || null,
    }),
  });
  return resp.json();
}

export async function analyzeCharacter(
  projectId: string,
  assetId: string,
): Promise<GenerationResponse> {
  const resp = await fetch(`${API_BASE}/generate/analyze-character`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      project_id: projectId,
      asset_id: assetId,
    }),
  });
  return resp.json();
}

export async function checkAnalysisStatus(jobId: string): Promise<GenerationResponse> {
  const resp = await fetch(`${API_BASE}/generate/analyze-status/${jobId}`);
  return resp.json();
}

// Shots
export type Shot = ShotResponse;

export async function listShots(projectId: string, sceneId?: string): Promise<ShotResponse[]> {
  return fetchShots(projectId, sceneId);
}

export async function fetchShots(projectId: string, sceneId?: string): Promise<ShotResponse[]> {
  const url = sceneId
    ? `${API_BASE}/shots/${projectId}?scene_id=${sceneId}`
    : `${API_BASE}/shots/${projectId}`;
  const resp = await fetch(url);
  return resp.json();
}

export async function createShot(projectId: string, name: string, description: string, sceneId?: string, shotType?: string, hidden?: boolean): Promise<ShotResponse> {
  const resp = await fetch(`${API_BASE}/shots/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ project_id: projectId, name, description, scene_id: sceneId, shot_type: shotType || "medium", hidden: hidden || false }),
  });
  return resp.json();
}

export async function deleteShot(projectId: string, shotId: string): Promise<void> {
  await fetch(`${API_BASE}/shots/${projectId}/${shotId}`, { method: "DELETE" });
}

export async function reorderShots(projectId: string, shotIds: string[]): Promise<void> {
  await fetch(`${API_BASE}/shots/${projectId}/reorder`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(shotIds),
  });
}

export async function updateShot(projectId: string, shotId: string, updates: any): Promise<ShotResponse> {
  const resp = await fetch(`${API_BASE}/shots/${projectId}/${shotId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(updates),
  });
  return resp.json();
}

export async function generateShotFrame(
  shotId: string,
  prompt: string,
  modelId: string,
  negativePrompt?: string,
  width?: number,
  height?: number,
  seed?: number,
  referenceImagePaths?: string[],
  denoise?: number,
  cfg?: number,
  steps?: number,
  horizontalAngle?: number,
  verticalAngle?: number,
  zoom?: number,
  compositionPreset?: string,
): Promise<GenerationResponse> {
  const resp = await fetch(`${API_BASE}/shots/frame`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      shot_id: shotId,
      prompt,
      model_id: modelId,
      negative_prompt: negativePrompt,
      width: width || 1024,
      height: height || 1024,
      seed,
      denoise,
      cfg,
      steps,
      reference_image_paths: referenceImagePaths || [],
      horizontal_angle: horizontalAngle,
      vertical_angle: verticalAngle,
      zoom,
      composition_preset: compositionPreset,
    }),
  });
  return resp.json();
}

export async function checkShotFrameStatus(jobId: string, modelId: string): Promise<GenerationResponse> {
  const resp = await fetch(`${API_BASE}/shots/status/${jobId}?model_id=${modelId}`);
  return resp.json();
}

// Camera Angles
export const CAMERA_ANGLE_PRESETS = [
  { value: "front", label: "Front", icon: "👤" },
  { value: "three_quarter_left", label: "3/4 Left", icon: "↖️" },
  { value: "three_quarter_right", label: "3/4 Right", icon: "↗️" },
  { value: "side_left", label: "Side Left", icon: "⬅️" },
  { value: "side_right", label: "Side Right", icon: "➡️" },
  { value: "back", label: "Back", icon: "↩️" },
  { value: "back_left", label: "Back Left", icon: "↙️" },
  { value: "back_right", label: "Back Right", icon: "↘️" },
  { value: "overhead", label: "Overhead", icon: "⬇️" },
  { value: "low_angle", label: "Low Angle", icon: "⬆️" },
  { value: "high_angle", label: "High Angle", icon: "🔽" },
  { value: "close_up", label: "Close Up", icon: "🔍" },
  { value: "wide_shot", label: "Wide Shot", icon: "📐" },
  { value: "medium_shot", label: "Medium", icon: "📏" },
] as const;

export async function generateCameraAngles(
  sourceImagePath: string,
  angles?: string[],
  width?: number,
  height?: number,
  seed?: number,
  method?: string,
  basePrompt?: string,
  referenceImagePaths?: string[],
): Promise<GenerationResponse> {
  const resp = await fetch(`${API_BASE}/shots/angles`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      source_image_path: sourceImagePath,
      angles: angles || ["three_quarter_left", "three_quarter_right", "side_left", "overhead"],
      width: width || 1024,
      height: height || 1024,
      seed,
      method: method || "qwen_multiangle",
      base_prompt: basePrompt,
      reference_image_paths: referenceImagePaths || [],
    }),
  });
  return resp.json();
}

export async function checkAnglesStatus(jobId: string, modelId?: string): Promise<GenerationResponse> {
  const url = modelId
    ? `${API_BASE}/shots/angles/status/${jobId}?model_id=${modelId}`
    : `${API_BASE}/shots/angles/status/${jobId}`;
  const resp = await fetch(url);
  return resp.json();
}

// =============================================================================
// Shot Video Generation (multi-take, model-aware references)
// =============================================================================

export interface ShotVideoRequest {
  project_id?: string;
  shot_id: string;
  prompt: string;
  negative_prompt?: string;
  model_id: string;
  mode: "t2v" | "i2v" | "r2v" | "ia2v";
  duration_seconds?: number;
  seed?: number;
  first_frame_path?: string;
  last_frame_path?: string;
  reference_image_paths?: string[];
  reference_video_path?: string;
  reference_audio_path?: string;
  camera_movement?: { preset: string; intensity: number; amplitude?: string; speed?: string };
  aspect_ratio?: string;
  soundscape?: string;
  music?: string;
  prompt_override?: string;
  skip_continuity?: boolean;
  extra_params?: Record<string, any>;
}

export interface ShotVideoResponse extends GenerationResponse {
  take_id?: string;
  shot_id?: string;
}

export async function generateShotVideo(req: ShotVideoRequest): Promise<ShotVideoResponse> {
  const resp = await fetch(`${API_BASE}/shots/video`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      project_id: req.project_id || "default",
      shot_id: req.shot_id,
      prompt: req.prompt,
      negative_prompt: req.negative_prompt,
      model_id: req.model_id,
      mode: req.mode,
      duration_seconds: req.duration_seconds ?? 5.0,
      seed: req.seed,
      first_frame_path: req.first_frame_path,
      last_frame_path: req.last_frame_path,
      reference_image_paths: req.reference_image_paths || [],
      reference_video_path: req.reference_video_path,
      reference_audio_path: req.reference_audio_path,
      camera_movement: req.camera_movement,
      aspect_ratio: req.aspect_ratio || "16:9",
      soundscape: req.soundscape,
      music: req.music,
      prompt_override: req.prompt_override,
      skip_continuity: req.skip_continuity ?? false,
      extra_params: req.extra_params || {},
    }),
  });
  return resp.json();
}

export async function checkShotVideoStatus(jobId: string, modelId: string): Promise<ShotVideoResponse> {
  const resp = await fetch(`${API_BASE}/shots/video/status/${jobId}?model_id=${modelId}`);
  if (!resp.ok) {
    const text = await resp.text().catch(() => "Unknown error");
    throw new Error(`Status ${resp.status}: ${text}`);
  }
  return resp.json();
}

export async function selectVideoTake(projectId: string, shotId: string, takeId: string): Promise<{ status: string; take_id: string; video_clip_path: string }> {
  const params = new URLSearchParams({ project_id: projectId, shot_id: shotId, take_id: takeId });
  const resp = await fetch(`${API_BASE}/shots/video/take/select?${params}`, { method: "POST" });
  return resp.json();
}

// Retake Mode
export async function retakeVideo(
  projectId: string,
  shotId: string,
  startSeconds: number,
  endSeconds: number,
  prompt: string,
  modelId: string,
  seed?: number,
): Promise<ShotVideoResponse> {
  const params = new URLSearchParams({
    project_id: projectId,
    shot_id: shotId,
    start_seconds: String(startSeconds),
    end_seconds: String(endSeconds),
    prompt,
    model_id: modelId,
  });
  if (seed !== undefined) params.set("seed", String(seed));
  const resp = await fetch(`${API_BASE}/shots/retake?${params}`, { method: "POST" });
  return resp.json();
}

// Video Render
export async function renderVideo(
  prompt: string,
  modelId: string,
  firstFramePath?: string,
  lastFramePath?: string,
  durationSeconds?: number,
  seed?: number,
): Promise<GenerationResponse> {
  const params = new URLSearchParams({ prompt, model_id: modelId });
  if (firstFramePath) params.set("first_frame_path", firstFramePath);
  if (lastFramePath) params.set("last_frame_path", lastFramePath);
  if (durationSeconds) params.set("duration_seconds", String(durationSeconds));
  if (seed !== undefined) params.set("seed", String(seed));
  const resp = await fetch(`${API_BASE}/render/video?${params}`, { method: "POST" });
  return resp.json();
}

export async function checkRenderStatus(jobId: string, modelId: string): Promise<GenerationResponse> {
  const resp = await fetch(`${API_BASE}/render/status/${jobId}?model_id=${modelId}`);
  return resp.json();
}

// Scenes
export async function fetchScenes(projectId: string): Promise<SceneResponse[]> {
  const resp = await fetch(`${API_BASE}/scenes/${projectId}`);
  return resp.json();
}

export async function createScene(projectId: string, name: string, description?: string): Promise<SceneResponse> {
  const resp = await fetch(`${API_BASE}/scenes/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ project_id: projectId, name, description }),
  });
  return resp.json();
}

export async function updateScene(projectId: string, sceneId: string, updates: any): Promise<SceneResponse> {
  const resp = await fetch(`${API_BASE}/scenes/${projectId}/${sceneId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(updates),
  });
  return resp.json();
}

export async function deleteScene(projectId: string, sceneId: string): Promise<void> {
  await fetch(`${API_BASE}/scenes/${projectId}/${sceneId}`, { method: "DELETE" });
}

export async function addSceneReferenceAsset(projectId: string, sceneId: string, asset: SceneAssetRef): Promise<SceneResponse> {
  const resp = await fetch(`${API_BASE}/scenes/${projectId}/${sceneId}/reference-assets`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(asset),
  });
  return resp.json();
}

export async function removeSceneReferenceAsset(projectId: string, sceneId: string, assetId: string): Promise<SceneResponse> {
  const resp = await fetch(`${API_BASE}/scenes/${projectId}/${sceneId}/reference-assets/${assetId}`, {
    method: "DELETE",
  });
  return resp.json();
}

export async function generateShotVariation(
  projectId: string,
  sourceShotId: string,
  name: string,
  prompt: string,
  shotType?: string,
  modelId?: string,
  negativePrompt?: string,
  seed?: number,
): Promise<{ shot: ShotResponse; generation: GenerationResponse }> {
  const resp = await fetch(`${API_BASE}/shots/variation`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      project_id: projectId,
      source_shot_id: sourceShotId,
      name,
      prompt,
      shot_type: shotType || "medium",
      model_id: modelId || "qwen_image_edit",
      negative_prompt: negativePrompt,
      seed,
    }),
  });
  return resp.json();
}

// =============================================================================
// Timeline Types & API
// =============================================================================

export type TimelineTrackType = "video" | "audio";
export type TransitionType = "fade_black" | "fade_white" | "dissolve" | "wipe_left" | "wipe_right";

export interface ClipTransition {
  type: TransitionType;
  durationSeconds: number;
}

export interface TimelineClip {
  id: string;
  sourceType: string;
  sourceId: string;
  name: string;
  sourceUrl: string;
  trimInSeconds: number;
  trimOutSeconds: number | null;
  startTime: number;
  mediaDurationSeconds?: number | null;
  groupId?: string | null;
  transitionIn?: ClipTransition | null;
  transitionOut?: ClipTransition | null;
  speed?: number; // playback rate: 1 = normal, 0.5 = half speed, 2 = double speed
  volume?: number; // per-clip volume: 0-1
  fadeInSeconds?: number; // audio fade-in duration
  fadeOutSeconds?: number; // audio fade-out duration
}

export interface TimelineTrack {
  id: string;
  name: string;
  type: TimelineTrackType;
  clips: TimelineClip[];
  volume?: number;
}

export interface TimelineFormat {
  aspectRatio: string;
  width: number;
  height: number;
}

export interface TimelineState {
  projectId: string;
  fps: number;
  format?: TimelineFormat;
  videoTracks: TimelineTrack[];
  audioTracks: TimelineTrack[];
}

export async function getTimeline(projectId: string): Promise<TimelineState> {
  const resp = await fetch(`${API_BASE}/timeline/${projectId}`);
  return resp.json();
}

export async function saveTimeline(projectId: string, timeline: TimelineState): Promise<TimelineState> {
  const resp = await fetch(`${API_BASE}/timeline/${projectId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(timeline),
  });
  return resp.json();
}

// =============================================================================
// Timeline Render API
// =============================================================================

export interface TimelineRenderJob {
  job_id: string;
  project_id: string;
  status: "pending" | "processing" | "completed" | "failed";
  video_url: string | null;
  error_message: string | null;
  file_size?: number;
  created_at: string;
  updated_at: string;
}

export interface TimelineRenderItem {
  filename: string;
  video_url: string;
  size_bytes: number;
  modified_at: string;
}

export async function startTimelineRender(projectId: string, preset?: string): Promise<TimelineRenderJob> {
  const qs = preset && preset !== "source" ? `?preset=${encodeURIComponent(preset)}` : "";
  const resp = await fetch(`${API_BASE}/timeline/${projectId}/render${qs}`, { method: "POST" });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ detail: resp.statusText }));
    throw new Error(err.detail || "Failed to start render");
  }
  return resp.json();
}

export async function getTimelineRenderStatus(projectId: string, jobId: string): Promise<TimelineRenderJob> {
  const resp = await fetch(`${API_BASE}/timeline/${projectId}/render/${jobId}`);
  if (!resp.ok) throw new Error("Failed to get render status");
  return resp.json();
}

export async function listTimelineRenders(projectId: string): Promise<{ project_id: string; renders: TimelineRenderItem[] }> {
  const resp = await fetch(`${API_BASE}/timeline/${projectId}/renders`);
  if (!resp.ok) throw new Error("Failed to list renders");
  return resp.json();
}

// Export
export function getExportUrl(projectId: string, format: "edl" | "xml"): string {
  return `${API_BASE}/export/${projectId}/${format}`;
}

// =============================================================================
// Audio Types & API
// =============================================================================

export interface AudioRenderRequest {
  project_id?: string;
  clip_name?: string;
  text: string;
  actor_id?: string;
  voice_id?: string;
  language?: string;
  speed?: number;
  generator?: "fish_speech" | "chatterbox_tts" | "stable_audio_music" | "hunyuan_foley";
  duration_seconds?: number;
  reference_audio_filename?: string;
  input_video_filename?: string;
  use_mock?: boolean;
}

export interface AudioJobStatus {
  job_id: string;
  status: "pending" | "processing" | "completed" | "failed";
  audio_url?: string;
  video_url?: string;
  duration_seconds?: number;
  error_message?: string;
  created_at: string;
  updated_at: string;
}

export interface AudioFileItem {
  filename: string;
  audio_url: string;
  size_bytes: number;
  modified_at: string;
}

export interface AudioFileListResponse {
  project_id: string;
  files: AudioFileItem[];
}

export interface FoleyVideo {
  filename: string;
  size_bytes: number;
  modified_at: string;
}

export async function startAudioJob(request: AudioRenderRequest): Promise<{ job_id: string; status: string; message: string }> {
  const resp = await fetch(`${API_BASE}/audio/job`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
  if (!resp.ok) {
    const error = await resp.json().catch(() => ({ detail: resp.statusText }));
    throw new Error(error.detail || "Failed to start audio generation");
  }
  return resp.json();
}

export async function getAudioJobStatus(jobId: string): Promise<AudioJobStatus> {
  const resp = await fetch(`${API_BASE}/audio/status/${jobId}`);
  if (!resp.ok) throw new Error(`Failed to get audio status: ${resp.statusText}`);
  return resp.json();
}

export async function getAudioStatus(jobId: string): Promise<AudioJobStatus> {
  return getAudioJobStatus(jobId);
}

export function getAudioUrl(audioPath: string): string {
  if (audioPath.startsWith("http")) return audioPath;
  return audioPath;
}

export async function listAudioFiles(projectId: string = "default"): Promise<AudioFileListResponse> {
  const resp = await fetch(`${API_BASE}/audio/files/${projectId}`);
  if (!resp.ok) throw new Error(`Failed to list audio files: ${resp.statusText}`);
  const data = await resp.json();
  if (Array.isArray(data)) {
    return { project_id: projectId, files: data };
  }
  return data;
}

export async function deleteAudioFile(projectId: string, filename: string): Promise<{ deleted: boolean }> {
  const resp = await fetch(`${API_BASE}/audio/file/${projectId}/${encodeURIComponent(filename)}`, {
    method: "DELETE",
  });
  if (!resp.ok) throw new Error(`Failed to delete audio file: ${resp.statusText}`);
  return resp.json();
}

export async function uploadAudioFile(file: File, projectId: string = "default"): Promise<{ filename: string; audio_url: string }> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("project_id", projectId);
  const resp = await fetch(`${API_BASE}/audio/upload/${projectId}`, {
    method: "POST",
    body: formData,
  });
  if (!resp.ok) throw new Error(`Failed to upload audio: ${resp.statusText}`);
  return resp.json();
}

// Audio reference voices (for TTS voice cloning)
export async function listAudioReferences(projectId: string = "default"): Promise<{ project_id: string; files: { filename: string }[] }> {
  const resp = await fetch(`${API_BASE}/audio/references/${projectId}`);
  if (!resp.ok) throw new Error(`Failed to list reference audio: ${resp.statusText}`);
  return resp.json();
}

export async function uploadAudioReference(projectId: string, file: File): Promise<{ filename: string }> {
  const formData = new FormData();
  formData.append("file", file);
  const resp = await fetch(`${API_BASE}/audio/references/${projectId}`, {
    method: "POST",
    body: formData,
  });
  if (!resp.ok) throw new Error(`Failed to upload reference audio: ${resp.statusText}`);
  return resp.json();
}

export async function deleteAudioReference(projectId: string, filename: string): Promise<{ deleted: boolean }> {
  const resp = await fetch(`${API_BASE}/audio/references/${projectId}/${encodeURIComponent(filename)}`, {
    method: "DELETE",
  });
  if (!resp.ok) throw new Error(`Failed to delete reference audio: ${resp.statusText}`);
  return resp.json();
}

// Foley video upload
export async function uploadFoleyVideo(projectId: string, file: File): Promise<{ filename: string; path: string }> {
  const formData = new FormData();
  formData.append("file", file);
  const resp = await fetch(`${API_BASE}/audio/foley/video/${projectId}`, {
    method: "POST",
    body: formData,
  });
  if (!resp.ok) throw new Error(`Failed to upload foley video: ${resp.statusText}`);
  return resp.json();
}

export async function listFoleyVideos(projectId: string = "default"): Promise<{ project_id: string; videos: FoleyVideo[] }> {
  const resp = await fetch(`${API_BASE}/audio/foley/videos/${projectId}`);
  if (!resp.ok) throw new Error(`Failed to list foley videos: ${resp.statusText}`);
  return resp.json();
}

// Legacy TTS (query-param based, kept for backward compat)
export async function generateTTS(text: string, language?: string, modelId?: string): Promise<GenerationResponse> {
  const params = new URLSearchParams({ text, model_id: modelId || "fish_speech" });
  if (language) params.set("language", language);
  const resp = await fetch(`${API_BASE}/audio/tts?${params}`, { method: "POST" });
  return resp.json();
}

export async function fetchAudioFiles(projectId: string): Promise<any[]> {
  const resp = await fetch(`${API_BASE}/audio/files/${projectId}`);
  return resp.json();
}

// =============================================================================
// Video Asset API
// =============================================================================

export interface VideoAsset {
  filename: string;
  video_url: string;
  size_bytes: number;
  modified_at: string;
  duration_seconds?: number | null;
}

export async function uploadVideoAsset(
  file: File,
  projectId: string = "default"
): Promise<{ filename: string; video_url: string; size_bytes: number; duration_seconds?: number | null }> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("project_id", projectId);
  const resp = await fetch(`${API_BASE}/assets/videos/upload`, {
    method: "POST",
    body: formData,
  });
  if (!resp.ok) throw new Error(`Failed to upload video: ${resp.statusText}`);
  return resp.json();
}

export async function listVideoAssets(projectId: string = "default"): Promise<{ project_id: string; videos: VideoAsset[] }> {
  const resp = await fetch(`${API_BASE}/assets/videos/list?project_id=${projectId}`);
  if (!resp.ok) throw new Error(`Failed to list videos: ${resp.statusText}`);
  return resp.json();
}

export async function deleteVideoAsset(projectId: string, filename: string): Promise<{ deleted: boolean }> {
  const resp = await fetch(`${API_BASE}/assets/videos/${projectId}/${encodeURIComponent(filename)}`, {
    method: "DELETE",
  });
  if (!resp.ok) throw new Error(`Failed to delete video: ${resp.statusText}`);
  return resp.json();
}

export function getVideoAssetUrl(videoUrl: string): string {
  if (videoUrl.startsWith("http")) return videoUrl;
  return videoUrl;
}

// =============================================================================
// Image Assets (timeline library — plates, graphics, hold frames)
// =============================================================================

export interface ImageAssetItem {
  filename: string;
  image_url: string;
  size_bytes: number;
  modified_at: string;
}

export async function uploadImageAsset(
  file: File,
  projectId: string = "default"
): Promise<{ filename: string; image_url: string; size_bytes: number }> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("project_id", projectId);
  const resp = await fetch(`${API_BASE}/assets/images/upload`, {
    method: "POST",
    body: formData,
  });
  if (!resp.ok) throw new Error(`Failed to upload image: ${resp.statusText}`);
  return resp.json();
}

export async function listImageAssets(projectId: string = "default"): Promise<{ project_id: string; images: ImageAssetItem[] }> {
  const resp = await fetch(`${API_BASE}/assets/images/list?project_id=${projectId}`);
  if (!resp.ok) throw new Error(`Failed to list images: ${resp.statusText}`);
  return resp.json();
}

export async function deleteImageAsset(projectId: string, filename: string): Promise<{ deleted: boolean }> {
  const resp = await fetch(`${API_BASE}/assets/images/${projectId}/${encodeURIComponent(filename)}`, {
    method: "DELETE",
  });
  if (!resp.ok) throw new Error(`Failed to delete image: ${resp.statusText}`);
  return resp.json();
}

// Projects
export async function listProjects(): Promise<ProjectResponse[]> {
  const resp = await fetch(`${API_BASE}/projects/`);
  return resp.json();
}

export async function fetchProjects(): Promise<ProjectResponse[]> {
  return listProjects();
}

export async function createProject(name: string, description?: string): Promise<ProjectResponse> {
  const resp = await fetch(`${API_BASE}/projects/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, description }),
  });
  return resp.json();
}

export async function deleteProject(projectId: string): Promise<void> {
  await fetch(`${API_BASE}/projects/${projectId}`, { method: "DELETE" });
}

// Utility
export function getAssetImageUrl(asset: AssetResponse): string {
  return asset.primary_image || "";
}

export function getAssetThumbnailUrl(asset: AssetResponse): string {
  return asset.thumbnail || asset.primary_image || "";
}

// =============================================================================
// Waveform & Thumbnail API
// =============================================================================

export interface WaveformResponse {
  peaks: number[];
  duration_seconds: number;
}

export interface ThumbnailResponse {
  thumbnails: string[];
  duration_seconds: number;
}

export async function getWaveform(projectId: string, filename: string): Promise<WaveformResponse> {
  const resp = await fetch(`${API_BASE}/assets/waveform/${projectId}/${encodeURIComponent(filename)}`);
  if (!resp.ok) return { peaks: [], duration_seconds: 0 };
  return resp.json();
}

export async function getVideoThumbnails(projectId: string, filename: string, count: number = 6): Promise<ThumbnailResponse> {
  const resp = await fetch(`${API_BASE}/assets/thumbnails/${projectId}/${encodeURIComponent(filename)}?count=${count}`);
  if (!resp.ok) return { thumbnails: [], duration_seconds: 0 };
  return resp.json();
}
