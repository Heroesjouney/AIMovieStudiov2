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
  supports_loras?: boolean;
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
  hidden?: boolean;
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
  retention?: string;
}

export interface SceneScriptBreakdownShot {
  scene_index: number;
  shot_type: string;
  name: string;
  description: string;
  action: string;
  action_lines?: string[];
  dialogue: string;
  dialogue_blocks?: { character: string; parenthetical: string | null; text: string }[];
  transition: string | null;
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
  // Parsed screenplay breakdown (populated by screenplay import; consumed by
  // generateSceneShots). Absent on scenes not created from a screenplay.
  script_breakdown?: SceneScriptBreakdownShot[];
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

export interface LoRAInfo {
  name: string;
}

export async function fetchLoras(): Promise<{ loras: LoRAInfo[]; comfy_url: string }> {
  const resp = await fetch(`${API_BASE}/generate/loras`);
  return resp.json();
}

export async function uploadLora(file: File, overwrite = false): Promise<{ name: string; size_bytes: number; path: string; overwritten?: boolean }> {
  const formData = new FormData();
  formData.append("file", file);
  const resp = await fetch(`${API_BASE}/generate/loras/upload?overwrite=${overwrite}`, {
    method: "POST",
    body: formData,
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ detail: "Upload failed" }));
    throw new Error(err.detail || "Failed to upload LoRA");
  }
  return resp.json();
}

// Models (checkpoints)
export interface ModelInfo {
  name: string;
}

export async function fetchModels(): Promise<{ models: ModelInfo[]; comfy_url: string }> {
  const resp = await fetch(`${API_BASE}/generate/models`);
  return resp.json();
}

export async function uploadModel(file: File, overwrite = false): Promise<{ name: string; size_bytes: number; path: string; overwritten?: boolean }> {
  const formData = new FormData();
  formData.append("file", file);
  const resp = await fetch(`${API_BASE}/generate/models/upload?overwrite=${overwrite}`, {
    method: "POST",
    body: formData,
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ detail: "Upload failed" }));
    throw new Error(err.detail || "Failed to upload model");
  }
  return resp.json();
}

// Settings / API Keys
export interface ApiKeyInfo {
  label: string;
  description: string;
  url: string;
  is_set: boolean;
  masked_value: string;
}

export async function getApiKeys(): Promise<Record<string, ApiKeyInfo>> {
  const resp = await fetch(`${API_BASE}/settings/api-keys`);
  return resp.json();
}

export async function saveApiKey(keyName: string, value: string): Promise<{ status: string }> {
  const resp = await fetch(`${API_BASE}/settings/api-keys`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key_name: keyName, value }),
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ detail: "Save failed" }));
    throw new Error(err.detail || "Failed to save API key");
  }
  return resp.json();
}

export async function deleteApiKey(keyName: string): Promise<{ status: string }> {
  const resp = await fetch(`${API_BASE}/settings/api-keys/${keyName}`, {
    method: "DELETE",
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ detail: "Delete failed" }));
    throw new Error(err.detail || "Failed to delete API key");
  }
  return resp.json();
}

// ComfyUI Server Config
export interface ComfyConfig {
  url: string;
  auth_token: string;
  is_remote: boolean;
  models_dir: string;
  loras_dir: string;
  checkpoints_dir: string;
  extra_model_dirs: string[];
}

export async function getComfyConfig(): Promise<ComfyConfig> {
  const resp = await fetch(`${API_BASE}/settings/comfy-config`);
  return resp.json();
}

export async function saveComfyConfig(url: string, authToken: string, isRemote: boolean, modelsDir: string, lorasDir: string = "", checkpointsDir: string = "", extraModelDirs: string[] = []): Promise<{ status: string }> {
  const resp = await fetch(`${API_BASE}/settings/comfy-config`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url, auth_token: authToken, is_remote: isRemote, models_dir: modelsDir, loras_dir: lorasDir, checkpoints_dir: checkpointsDir, extra_model_dirs: extraModelDirs }),
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ detail: "Save failed" }));
    throw new Error(err.detail || "Failed to save ComfyUI config");
  }
  return resp.json();
}

// Custom Workflows
export interface CustomWorkflow {
  driver_id: string;
  display_name: string;
  category: string;
  supported_features: string[];
  workflow_file: string;
  supports_loras: boolean;
}

export async function listWorkflows(): Promise<{ workflows: CustomWorkflow[] }> {
  const resp = await fetch(`${API_BASE}/settings/workflows`);
  return resp.json();
}

export async function registerWorkflow(
  driverId: string,
  displayName: string,
  category: string,
  workflowJson: Record<string, any>,
  supportedFeatures?: string[],
): Promise<{ status: string; driver_id: string }> {
  const resp = await fetch(`${API_BASE}/settings/workflows`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      driver_id: driverId,
      display_name: displayName,
      category,
      workflow_json: workflowJson,
      supported_features: supportedFeatures || ["text_to_image"],
    }),
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ detail: "Registration failed" }));
    throw new Error(err.detail || "Failed to register workflow");
  }
  return resp.json();
}

export async function deleteWorkflow(driverId: string): Promise<{ status: string }> {
  const resp = await fetch(`${API_BASE}/settings/workflows/${driverId}`, {
    method: "DELETE",
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ detail: "Delete failed" }));
    throw new Error(err.detail || "Failed to delete workflow");
  }
  return resp.json();
}

// Workflow Model Analysis
export interface WorkflowModelRef {
  node_type: string;
  field: string;
  filename: string;
  subdirectory: string;
  label: string;
}

export async function analyzeWorkflow(
  workflowJson: Record<string, any>,
): Promise<{ models: WorkflowModelRef[] }> {
  const resp = await fetch(`${API_BASE}/settings/workflows/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ workflow_json: workflowJson }),
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ detail: "Analysis failed" }));
    throw new Error(err.detail || "Failed to analyze workflow");
  }
  return resp.json();
}

export interface ModelCheckResult {
  filename: string;
  subdirectory: string;
  found: boolean;
}

export async function checkWorkflowModels(
  models: WorkflowModelRef[],
): Promise<{ results: ModelCheckResult[] }> {
  const resp = await fetch(`${API_BASE}/settings/workflows/check-models`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ models }),
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ detail: "Check failed" }));
    throw new Error(err.detail || "Failed to check models");
  }
  return resp.json();
}

export async function uploadModelToSubdir(
  subdirectory: string,
  file: File,
): Promise<{ name: string; size_bytes: number; path: string; subdirectory: string }> {
  const formData = new FormData();
  formData.append("file", file);
  const resp = await fetch(
    `${API_BASE}/generate/models/upload-to?subdirectory=${encodeURIComponent(subdirectory)}`,
    { method: "POST", body: formData },
  );
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ detail: "Upload failed" }));
    throw new Error(err.detail || "Failed to upload model");
  }
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
  const resp = await fetch(`${API_BASE}/assets/${projectId}/${assetId}`, { method: "DELETE" });
  if (!resp.ok) throw new Error(`Failed to delete asset: ${resp.statusText}`);
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
  extraParams?: Record<string, any>,
): Promise<GenerationResponse> {
  const params = new URLSearchParams({ prompt, model_id: modelId });
  if (negativePrompt) params.set("negative_prompt", negativePrompt);
  if (width) params.set("width", String(width));
  if (height) params.set("height", String(height));
  if (seed !== undefined) params.set("seed", String(seed));
  if (referenceImagePaths?.length) {
    params.set("reference_image_paths", referenceImagePaths.join(","));
  }
  if (extraParams && Object.keys(extraParams).length > 0) {
    params.set("extra_params", JSON.stringify(extraParams));
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
  extraParams?: Record<string, any>,
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
      extra_params: extraParams || {},
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
  continuity_warning?: string | null;
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

export async function deleteVideoTake(projectId: string, shotId: string, takeId: string): Promise<{ status: string; take_id: string; remaining_takes: number }> {
  const params = new URLSearchParams({ project_id: projectId, shot_id: shotId, take_id: takeId });
  const resp = await fetch(`${API_BASE}/shots/video/take?${params}`, { method: "DELETE" });
  if (!resp.ok) {
    const text = await resp.text().catch(() => "Unknown error");
    throw new Error(`Status ${resp.status}: ${text}`);
  }
  return resp.json();
}

export async function cleanupStaleVideoRefs(projectId: string): Promise<{ status: string; cleaned: number }> {
  const params = new URLSearchParams({ project_id: projectId });
  const resp = await fetch(`${API_BASE}/shots/video/cleanup?${params}`, { method: "POST" });
  if (!resp.ok) {
    const text = await resp.text().catch(() => "Unknown error");
    throw new Error(`Status ${resp.status}: ${text}`);
  }
  return resp.json();
}

// =============================================================================
// Long Take — Keyframe interpolation for continuous shots >15s
// =============================================================================

export interface LongTakeRequest {
  project_id?: string;
  shot_id: string;
  prompt: string;
  negative_prompt?: string;
  model_id: string;
  keyframe_paths: string[];
  keyframe_prompts?: string[];
  segment_duration?: number;
  seed?: number;
  aspect_ratio?: string;
  camera_movement?: { preset: string; intensity: number };
  extra_params?: Record<string, any>;
  skip_continuity?: boolean;
}

export interface LongTakeResponse {
  job_id: string;
  take_id: string;
  shot_id: string;
  total_segments: number;
  total_duration: number;
  status: string;
}

export interface LongTakeStatusResponse {
  status: string;
  progress: { current: number; total: number };
  error?: string | null;
  video_url?: string;
  take_id?: string;
  shot_id?: string;
  t2i_progress?: { current: number; total: number };
}

export async function generateLongTake(req: LongTakeRequest): Promise<LongTakeResponse> {
  const resp = await fetch(`${API_BASE}/shots/long-take`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      project_id: req.project_id || "default",
      shot_id: req.shot_id,
      prompt: req.prompt,
      negative_prompt: req.negative_prompt,
      model_id: req.model_id,
      keyframe_paths: req.keyframe_paths,
      keyframe_prompts: req.keyframe_prompts || [],
      segment_duration: req.segment_duration ?? 5.0,
      seed: req.seed,
      aspect_ratio: req.aspect_ratio || "16:9",
      camera_movement: req.camera_movement,
      extra_params: req.extra_params || {},
      skip_continuity: req.skip_continuity ?? false,
    }),
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => "Unknown error");
    throw new Error(`Status ${resp.status}: ${text}`);
  }
  return resp.json();
}

export async function checkLongTakeStatus(jobId: string): Promise<LongTakeStatusResponse> {
  const resp = await fetch(`${API_BASE}/shots/long-take/status/${jobId}`);
  if (!resp.ok) {
    const text = await resp.text().catch(() => "Unknown error");
    throw new Error(`Status ${resp.status}: ${text}`);
  }
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
  extraParams?: Record<string, any>,
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
  if (extraParams && Object.keys(extraParams).length > 0) {
    params.set("extra_params", JSON.stringify(extraParams));
  }
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

export interface DeleteAllScenesResult {
  status: string;
  project_id: string;
  scenes_deleted: number;
  shots_deleted: number;
}

export async function deleteAllScenes(projectId: string): Promise<DeleteAllScenesResult> {
  const resp = await fetch(`${API_BASE}/scenes/${projectId}/all`, { method: "DELETE" });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ detail: "Delete failed" }));
    throw new Error(err.detail || "Failed to delete all scenes");
  }
  return resp.json();
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

export async function updateSceneReferenceRetention(
  projectId: string, sceneId: string, assetId: string, retention: string,
): Promise<SceneResponse> {
  const resp = await fetch(`${API_BASE}/scenes/${projectId}/${sceneId}/reference-assets/${assetId}/retention`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ retention }),
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ detail: "Unknown error" }));
    throw new Error(err.detail || "Failed to update retention");
  }
  return resp.json();
}

export interface SyncRecipeResult {
  status: string;
  scene_id: string;
  shots_synced: number;
  recipe_asset_count: number;
}

export async function syncSceneRecipeToShots(projectId: string, sceneId: string): Promise<SyncRecipeResult> {
  const resp = await fetch(`${API_BASE}/scenes/${projectId}/${sceneId}/sync-recipe`, {
    method: "POST",
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ detail: "Unknown error" }));
    throw new Error(err.detail || "Failed to sync recipe to shots");
  }
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
  generator?: "fish_speech" | "chatterbox_tts" | "stable_audio_music" | "hunyuan_foley" | "comfy_audio" | "minimax_music3" | "fal_music" | "fal_foley" | "replicate_foley" | "fal_elevenlabs" | "fal_chatterbox_hd" | "fal_chatterbox";
  duration_seconds?: number;
  reference_audio_filename?: string;
  input_video_filename?: string;
  input_video_url?: string;
  use_mock?: boolean;
  lyrics?: string;
  seed?: number;
  steps?: number;
  cfg?: number;
  negative_prompt?: string;
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

export async function saveImageFromUrl(projectId: string, imageUrl: string, filename?: string): Promise<{ filename: string; image_url: string }> {
  const params = new URLSearchParams({ project_id: projectId, image_url: imageUrl });
  if (filename) params.set("filename", filename);
  const resp = await fetch(`${API_BASE}/assets/images/save-from-url?${params}`, { method: "POST" });
  if (!resp.ok) throw new Error(`Failed to save image: ${resp.statusText}`);
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
  if (!resp.ok) throw new Error(`Waveform fetch failed: ${resp.status}`);
  return resp.json();
}

export async function getVideoThumbnails(projectId: string, filename: string, count: number = 6): Promise<ThumbnailResponse> {
  const resp = await fetch(`${API_BASE}/assets/thumbnails/${projectId}/${encodeURIComponent(filename)}?count=${count}`);
  if (!resp.ok) throw new Error(`Thumbnail fetch failed: ${resp.status}`);
  return resp.json();
}

// =============================================================================
// Screenplay Import (Fountain format)
// =============================================================================

export interface ScreenplayPreviewScene {
  name: string;
  description: string;
  time_of_day: string;
  mood: string;
  lighting: string;
  int_ext: string;
  location: string;
}

export interface ScreenplayPreviewShot {
  scene_index: number;
  shot_type: string;
  name: string;
  description: string;
  action: string;
  dialogue: string;
  transition: string | null;
}

export interface ScreenplayPreview {
  title: string;
  author: string;
  scene_count: number;
  shot_count: number;
  scenes: ScreenplayPreviewScene[];
  shots: ScreenplayPreviewShot[];
}

export interface ScreenplayImportResult {
  status: string;
  project_id: string;
  scenes_created: number;
  shots_created: number;
  scene_ids: string[];
  shot_ids: string[];
  preview: ScreenplayPreview | null;
}

export async function previewScreenplay(projectId: string, text: string): Promise<ScreenplayPreview> {
  const resp = await fetch(`${API_BASE}/screenplay/preview`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ project_id: projectId, text }),
  });
  if (!resp.ok) {
    const err = await resp.text().catch(() => "Unknown error");
    throw new Error(`Screenplay preview failed: ${err}`);
  }
  return resp.json();
}

export async function importScreenplay(projectId: string, text: string): Promise<ScreenplayImportResult> {
  const resp = await fetch(`${API_BASE}/screenplay/import`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ project_id: projectId, text, dry_run: false }),
  });
  if (!resp.ok) {
    const err = await resp.text().catch(() => "Unknown error");
    throw new Error(`Screenplay import failed: ${err}`);
  }
  return resp.json();
}

export async function uploadScreenplay(projectId: string, file: File): Promise<ScreenplayImportResult> {
  const formData = new FormData();
  formData.append("project_id", projectId);
  formData.append("dry_run", "false");
  formData.append("file", file);
  const resp = await fetch(`${API_BASE}/screenplay/upload`, {
    method: "POST",
    body: formData,
  });
  if (!resp.ok) {
    const err = await resp.text().catch(() => "Unknown error");
    throw new Error(`Screenplay upload failed: ${err}`);
  }
  return resp.json();
}

/**
 * Render a recorded previs WebM clip to MP4 on the backend using the bundled
 * ffmpeg. The MP4 is stored in the project's video library and can be used as
 * a reference clip or motion reference. Does NOT require ComfyUI or any AI
 * model — this is a pure video transcode.
 *
 * @param blob    Recorded WebM blob from the viewfinder canvas.
 * @param projectId   Project ID for library storage.
 * @param resolution  Target resolution ("480p" | "720p" | "1080p"). ffmpeg
 *                    scales the WebM to this height while preserving aspect
 *                    ratio. Default "720p".
 * @param aspectRatio Target aspect ratio ("16:9" | "2.39:1"). ffmpeg pads/
 *                    crops to this ratio. Default "16:9".
 */
export async function renderPrevisToMp4(
  blob: Blob,
  projectId: string = "default",
  resolution: string = "720p",
  aspectRatio: string = "16:9",
): Promise<{ filename: string; video_url: string; size_bytes: number; duration_seconds: number | null; format: string }> {
  const formData = new FormData();
  const ext = blob.type.includes("mp4") ? "mp4" : "webm";
  formData.append("file", blob, `previs_recording.${ext}`);
  formData.append("project_id", projectId);
  formData.append("resolution", resolution);
  formData.append("aspect_ratio", aspectRatio);
  const resp = await fetch(`${API_BASE}/generate/previs/render`, {
    method: "POST",
    body: formData,
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ detail: "Failed to render previs" }));
    throw new Error(err.detail || "Failed to render previs to MP4");
  }
  return resp.json();
}

/**
 * Load the saved previs scene for a project (null when never saved).
 * The document schema is owned by usePrevisStore (versioned).
 */
export async function fetchPrevisScene(
  projectId: string = "default",
): Promise<{ scene: import("./usePrevisStore").PrevisScenePayload | null }> {
  const resp = await fetch(`${API_BASE}/previs/${projectId}`);
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ detail: "Failed to load previs scene" }));
    throw new Error(err.detail || "Failed to load previs scene");
  }
  return resp.json();
}

/** Persist the previs scene (proxies, camera channels, timeline settings) to the Vault. */
export async function savePrevisScene(
  projectId: string,
  scene: import("./usePrevisStore").PrevisScenePayload,
): Promise<{ status: string; bytes: number }> {
  const resp = await fetch(`${API_BASE}/previs/${projectId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(scene),
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ detail: "Failed to save previs scene" }));
    throw new Error(err.detail || "Failed to save previs scene");
  }
  return resp.json();
}
