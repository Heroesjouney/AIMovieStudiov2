"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useStudioStore } from "@/lib/store";
import {
  fetchAssets, uploadAsset, deleteAsset, getAssetThumbnailUrl,
  listVideoAssets, uploadVideoAsset, deleteVideoAsset, getVideoAssetUrl,
  listAudioFiles, uploadAudioFile, deleteAudioFile, getAudioUrl,
  listImageAssets, uploadImageAsset, deleteImageAsset,
  fetchShots, selectVideoTake, VideoAsset, AudioFileItem, ShotResponse, VideoTake, ImageAssetItem,
} from "@/lib/api";
import {
  User, MapPin, Package, Car, Upload, Trash2, ImageIcon, Loader2,
  Film, Music, Mic, Video, Plus, ChevronDown, ChevronRight, Sparkles,
  Search, Send, Check, Clapperboard, Camera, Palette, Wand2,
} from "lucide-react";
import { AssetDetailPanel } from "./AssetDetailPanel";

const typeIcons: Record<string, any> = {
  character: User,
  location: MapPin,
  prop: Package,
  vehicle: Car,
  style: Palette,
  effect: Wand2,
};

const typeFilters = [
  { id: "all", label: "All" },
  { id: "character", label: "Characters" },
  { id: "location", label: "Locations" },
  { id: "prop", label: "Props" },
  { id: "vehicle", label: "Vehicles" },
  { id: "style", label: "Styles" },
  { id: "effect", label: "Effects" },
];

interface AssetLibraryProps {
  projectId: string;
  mode?: "default" | "timeline" | "camera";
}

function AudioRow({
  item,
  icon: Icon,
  iconColor,
  onAdd,
  onDelete,
}: {
  item: AudioFileItem;
  icon: any;
  iconColor: string;
  onAdd: () => void;
  onDelete: () => void;
}) {
  const displayName = item.filename.replace(/\.[^./\\]+$/, "");
  return (
    <div
      onClick={onAdd}
      className="group flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-studio-border/40 cursor-pointer transition-all"
    >
      <div className="w-8 h-8 rounded bg-studio-bg flex items-center justify-center shrink-0">
        <Icon className={`w-4 h-4 ${iconColor}`} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-studio-text truncate">{displayName}</p>
        <p className="text-[10px] text-studio-muted">{item.filename}</p>
      </div>
      <button
        onClick={(e) => { e.stopPropagation(); onDelete(); }}
        className="p-0.5 rounded hover:bg-red-500/20 text-studio-muted hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all shrink-0"
      >
        <Trash2 className="w-3 h-3" />
      </button>
      <Plus className="w-3.5 h-3.5 text-studio-muted group-hover:text-studio-accent shrink-0" />
    </div>
  );
}

export function AssetLibrary({ projectId, mode = "default" }: AssetLibraryProps) {
  const {
    assets, setAssets, selectedAssetId, setSelectedAssetId,
    addTimelineClip, addAudioTrack, timeline, removeTimelineClipsBySourceId,
    setTimelineProjectId, audioLibraryRefreshToken,
    scenes, selectedShotId, setSelectedShotId,
    shots: storeShots, setShots: setStoreShots,
  } = useStudioStore();
  const [filter, setFilter] = useState("all");
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Timeline mode state
  const [videoAssets, setVideoAssets] = useState<VideoAsset[]>([]);
  const [videoAssetsLoading, setVideoAssetsLoading] = useState(false);
  const [videoUploadStatus, setVideoUploadStatus] = useState<string | null>(null);
  const videoFileRef = useRef<HTMLInputElement>(null);

  const [imageAssets, setImageAssets] = useState<ImageAssetItem[]>([]);
  const [imageAssetsLoading, setImageAssetsLoading] = useState(false);
  const [imageUploadStatus, setImageUploadStatus] = useState<string | null>(null);
  const imageFileRef = useRef<HTMLInputElement>(null);

  const [audioFiles, setAudioFiles] = useState<AudioFileItem[]>([]);
  const [audioLoading, setAudioLoading] = useState(false);
  const [audioUploadStatus, setAudioUploadStatus] = useState<string | null>(null);
  const audioFileRef = useRef<HTMLInputElement>(null);


  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    assets: true,
    videos: true,
    uploadedVideos: true,
    audio: true,
    frames: true,
    images: true,
  });

  // Collapsed scene groups (keyed by "section:sceneId", e.g. "frames:scene_1")
  const [collapsedScenes, setCollapsedScenes] = useState<Record<string, boolean>>({});
  const toggleScene = (section: string, sceneId: string) =>
    setCollapsedScenes((prev) => ({ ...prev, [`${section}:${sceneId}`]: !prev[`${section}:${sceneId}`] }));
  const isSceneCollapsed = (section: string, sceneId: string) => !!collapsedScenes[`${section}:${sceneId}`];

  // Timeline library: search + expanded takes
  const [timelineSearch, setTimelineSearch] = useState("");
  const [expandedTakes, setExpandedTakes] = useState<Record<string, boolean>>({});

  const toggleSection = (section: string) => {
    setExpandedSections((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  const refresh = async () => {
    const data = await fetchAssets(projectId);
    setAssets(data);
  };

  const loadVideoAssets = useCallback(async () => {
    setVideoAssetsLoading(true);
    try {
      const res = await listVideoAssets(projectId);
      setVideoAssets(res.videos || []);
    } catch (err) {
      console.error("Failed to load video assets:", err);
    }
    setVideoAssetsLoading(false);
  }, [projectId]);

  const loadImageAssets = useCallback(async () => {
    setImageAssetsLoading(true);
    try {
      const res = await listImageAssets(projectId);
      setImageAssets(res.images || []);
    } catch (err) {
      console.error("Failed to load image assets:", err);
    }
    setImageAssetsLoading(false);
  }, [projectId]);

  const loadAudioFiles = useCallback(async () => {
    setAudioLoading(true);
    try {
      const res = await listAudioFiles(projectId);
      setAudioFiles(res.files || []);
    } catch (err) {
      console.error("Failed to load audio files:", err);
    }
    setAudioLoading(false);
  }, [projectId]);

  const loadShots = useCallback(async () => {
    try {
      const res = await fetchShots(projectId);
      setStoreShots(res);
    } catch (err) {
      console.error("Failed to load shots:", err);
    }
  }, [projectId, setStoreShots]);

  useEffect(() => {
    refresh();
  }, [projectId]);

  useEffect(() => {
    if (mode === "timeline" || mode === "camera" || mode === "default") {
      void loadVideoAssets();
      void loadAudioFiles();
      void loadImageAssets();
    }
    // Always ensure shots are loaded from the store (reactive)
    if (storeShots.length === 0) {
      void loadShots();
    }
  }, [mode, loadVideoAssets, loadAudioFiles, loadShots, loadImageAssets]);

  useEffect(() => {
    if (mode === "timeline" || mode === "camera" || mode === "default") {
      void loadAudioFiles();
    }
  }, [audioLibraryRefreshToken, loadAudioFiles, mode]);

  const filtered = filter === "all" ? assets : assets.filter((a) => a.type === filter);
  const selectedAsset = assets.find((a) => a.id === selectedAssetId);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const name = file.name.replace(/\.[^.]+$/, "");
      const type = filter === "all" ? "character" : filter;
      await uploadAsset(projectId, name, type, file);
      await refresh();
    } catch (err) {
      console.error("Upload failed:", err);
    }
    setUploading(false);
    if (fileRef.current) fileRef.current.value = "";
  };

  const handleDelete = async (assetId: string) => {
    if (!confirm("Delete this asset?")) return;
    await deleteAsset(projectId, assetId);
    await refresh();
  };

  // --- Timeline mode helpers ---

  const getMediaDurationSeconds = async (url: string): Promise<number | null> => {
    try {
      const duration = await new Promise<number>((resolve, reject) => {
        const el = document.createElement("video");
        el.preload = "metadata";
        el.muted = true;
        el.src = url;
        let timeoutId: number | null = null;
        const cleanup = () => {
          if (timeoutId !== null) window.clearTimeout(timeoutId);
          el.removeEventListener("loadedmetadata", onLoaded);
          el.removeEventListener("error", onError);
          el.src = "";
        };
        const onLoaded = () => {
          if (Number.isFinite(el.duration) && el.duration > 0) {
            cleanup();
            resolve(el.duration);
          }
        };
        const onError = () => { cleanup(); reject(new Error("media metadata error")); };
        timeoutId = window.setTimeout(() => { cleanup(); reject(new Error("timeout")); }, 8000);
        el.addEventListener("loadedmetadata", onLoaded, { once: true });
        el.addEventListener("error", onError, { once: true });
        el.load();
      });
      return Number.isFinite(duration) && duration > 0 ? duration : null;
    } catch { return null; }
  };

  const getAudioDurationSeconds = async (url: string): Promise<number | null> => {
    try {
      const duration = await new Promise<number>((resolve, reject) => {
        const el = document.createElement("audio");
        el.preload = "metadata";
        el.src = url;
        let timeoutId: number | null = null;
        const cleanup = () => {
          if (timeoutId !== null) window.clearTimeout(timeoutId);
          el.removeEventListener("loadedmetadata", onLoaded);
          el.removeEventListener("error", onError);
          el.src = "";
        };
        const onLoaded = () => {
          if (Number.isFinite(el.duration) && el.duration > 0) {
            cleanup();
            resolve(el.duration);
          }
        };
        const onError = () => { cleanup(); reject(new Error("audio metadata error")); };
        timeoutId = window.setTimeout(() => { cleanup(); reject(new Error("timeout")); }, 8000);
        el.addEventListener("loadedmetadata", onLoaded, { once: true });
        el.addEventListener("error", onError, { once: true });
        el.load();
      });
      return Number.isFinite(duration) && duration > 0 ? duration : null;
    } catch { return null; }
  };

  // Shared helper: add any media (video or audio) to the timeline.
  // Extracts the duplicated start-time/group-id/audio-track logic.
  const addMediaToTimeline = async (
    url: string,
    name: string,
    sourceId: string,
    sourceType: "shot" | "asset_image" | "audio",
    duration: number | null,
    options?: { placeAudioTrack?: boolean; isImage?: boolean }
  ) => {
    setTimelineProjectId(projectId);
    const groupId = `grp_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const existingClips = timeline.videoTracks?.[0]?.clips ?? [];
    const startTime = existingClips.reduce((max, c) => {
      const d = typeof c.trimOutSeconds === "number" && c.trimOutSeconds > (c.trimInSeconds ?? 0)
        ? c.trimOutSeconds - (c.trimInSeconds ?? 0)
        : typeof c.mediaDurationSeconds === "number" && c.mediaDurationSeconds > 0
          ? c.mediaDurationSeconds
          : 5;
      return Math.max(max, c.startTime + d);
    }, 0);

    const dur = typeof duration === "number" && duration > 0 ? duration : options?.isImage ? 5 : null;

    addTimelineClip("video", {
      sourceType,
      sourceId,
      name,
      sourceUrl: url,
      trimInSeconds: 0,
      trimOutSeconds: dur,
      startTime,
      mediaDurationSeconds: dur,
      groupId,
    });

    if (options?.placeAudioTrack && !options?.isImage) {
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
        sourceType,
        sourceId,
        name: `${name} (Audio)`,
        sourceUrl: url,
        trimInSeconds: 0,
        trimOutSeconds: dur,
        startTime,
        mediaDurationSeconds: dur,
        groupId,
      }, targetAudioTrackId);
    }
  };

  const handleAddAssetToTimeline = async (asset: any) => {
    const url = getAssetThumbnailUrl(asset);
    if (!url) return;
    addMediaToTimeline(url, asset.name, asset.id, "asset_image", null, { isImage: true });
  };

  const handleAddShotToTimeline = async (shot: any) => {
    const videoUrl = shot.video_clip_path;
    const imageUrl = shot.frame_image_path;
    if (!videoUrl && !imageUrl) return;
    if (videoUrl) {
      const duration = await getMediaDurationSeconds(videoUrl);
      addMediaToTimeline(videoUrl, shot.name, shot.id, "shot", duration, { placeAudioTrack: true });
    } else if (imageUrl) {
      addMediaToTimeline(imageUrl, shot.name, shot.id, "asset_image", null, { isImage: true });
    }
  };

  const handleAddVideoAssetToTimeline = async (video: VideoAsset) => {
    const url = getVideoAssetUrl(video.video_url);
    let duration = await getMediaDurationSeconds(url);
    if ((!duration || duration <= 0) && video.duration_seconds && video.duration_seconds > 0) {
      duration = video.duration_seconds;
    }
    addMediaToTimeline(url, video.filename, video.filename, "shot", duration, { placeAudioTrack: true });
  };

  const handleAddAudioToTimeline = async (item: AudioFileItem) => {
    const url = getAudioUrl(item.audio_url);
    const duration = await getAudioDurationSeconds(url);
    setTimelineProjectId(projectId);
    addTimelineClip("audio", {
      sourceType: "audio",
      sourceId: item.filename,
      name: item.filename,
      sourceUrl: url,
      trimInSeconds: 0,
      trimOutSeconds: typeof duration === "number" ? duration : null,
      mediaDurationSeconds: typeof duration === "number" ? duration : null,
    });
  };

  // Send a specific take to the timeline
  const handleAddTakeToTimeline = async (shot: ShotResponse, take: VideoTake) => {
    const duration = await getMediaDurationSeconds(take.path);
    addMediaToTimeline(take.path, `${shot.name} (Take ${take.id})`, `${shot.id}_${take.id}`, "shot", duration, { placeAudioTrack: true });
  };

  // Select a take as the shot's active video
  const handleSelectTakeInLibrary = async (shotId: string, takeId: string) => {
    try {
      await selectVideoTake(projectId, shotId, takeId);
      const fresh = await fetchShots(projectId);
      setStoreShots(fresh);
    } catch (err) {
      console.error("Failed to select take:", err);
    }
  };

  const handleUploadVideo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setVideoUploadStatus("Uploading...");
    try {
      await uploadVideoAsset(file, projectId);
      await loadVideoAssets();
      setVideoUploadStatus(null);
    } catch (err) {
      setVideoUploadStatus(err instanceof Error ? err.message : "Upload failed");
    }
    if (videoFileRef.current) videoFileRef.current.value = "";
  };

  const handleUploadAudio = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAudioUploadStatus("Uploading...");
    try {
      await uploadAudioFile(file, projectId);
      await loadAudioFiles();
      setAudioUploadStatus(null);
    } catch (err) {
      setAudioUploadStatus(err instanceof Error ? err.message : "Upload failed");
    }
    if (audioFileRef.current) audioFileRef.current.value = "";
  };

  const handleDeleteVideoAsset = async (video: VideoAsset) => {
    if (!window.confirm(`Delete video '${video.filename}'?`)) return;
    try {
      await deleteVideoAsset(projectId, video.filename);
      removeTimelineClipsBySourceId(video.filename);
      await loadVideoAssets();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete video");
    }
  };

  const handleUploadImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageUploadStatus("Uploading...");
    try {
      await uploadImageAsset(file, projectId);
      await loadImageAssets();
      setImageUploadStatus(null);
    } catch (err) {
      setImageUploadStatus(err instanceof Error ? err.message : "Upload failed");
    }
    if (imageFileRef.current) imageFileRef.current.value = "";
  };

  const handleDeleteImageAsset = async (image: ImageAssetItem) => {
    if (!window.confirm(`Delete image '${image.filename}'?`)) return;
    try {
      await deleteImageAsset(projectId, image.filename);
      removeTimelineClipsBySourceId(image.filename);
      await loadImageAssets();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete image");
    }
  };

  const handleAddImageToTimeline = async (image: ImageAssetItem) => {
    addMediaToTimeline(image.image_url, image.filename.replace(/\.[^./\\]+$/, ""), image.filename, "asset_image", null, { isImage: true });
  };

  const handleDeleteAudioFile = async (item: AudioFileItem) => {
    if (!window.confirm(`Delete audio '${item.filename}'?`)) return;
    try {
      await deleteAudioFile(projectId, item.filename);
      removeTimelineClipsBySourceId(item.filename);
      await loadAudioFiles();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete audio");
    }
  };

  // Categorize audio files — improved filename + path pattern matching
  const isVoiceFile = (filename: string) => {
    const lower = filename.toLowerCase();
    return lower.includes("chatterbox") || lower.includes("fish_speech") || lower.includes("fish-speech")
      || lower.includes("_tts") || lower.includes("-tts") || lower.includes("cosyvoice")
      || lower.includes("bark") || lower.includes("tortoise") || lower.includes("voice")
      || lower.includes("speech") || lower.includes("dialogue") || lower.includes("narration");
  };
  const isMusicFile = (filename: string) => {
    const lower = filename.toLowerCase();
    return lower.includes("stable_audio") || lower.includes("stable-audio")
      || lower.includes("_music") || lower.includes("-music") || lower.includes("musicgen")
      || lower.includes("audiogen") || lower.includes("song") || lower.includes("score");
  };
  const isFoleyFile = (filename: string) => {
    const lower = filename.toLowerCase();
    return lower.includes("hunyuan_foley") || lower.includes("hunyuan-foley")
      || lower.includes("_foley") || lower.includes("-foley") || lower.includes("foley");
  };
  const isSfxFile = (filename: string) => {
    const lower = filename.toLowerCase();
    return lower.includes("_sfx") || lower.includes("-sfx") || lower.includes("effect")
      || lower.includes("impact") || lower.includes("whoosh") || lower.includes("ambient");
  };
  const voiceFiles = audioFiles.filter((a) => isVoiceFile(a.filename));
  const musicFiles = audioFiles.filter((a) => isMusicFile(a.filename));
  const foleyFiles = audioFiles.filter((a) => isFoleyFile(a.filename));
  const sfxFiles = audioFiles.filter((a) => isSfxFile(a.filename) && !isFoleyFile(a.filename));
  const otherAudioFiles = audioFiles.filter((a) => !isVoiceFile(a.filename) && !isMusicFile(a.filename) && !isFoleyFile(a.filename) && !isSfxFile(a.filename));

  // Split shots into video clips (have video_clip_path) and storyboard frames (only frame_image_path)
  const shotsWithVideo = storeShots.filter((s) => s.video_clip_path);
  const shotsWithFramesOnly = storeShots.filter((s) => s.frame_image_path && !s.video_clip_path);

  // Group by scene
  const groupShotsByScene = (shotList: any[]) => {
    const groups: Record<string, any[]> = {};
    for (const shot of shotList) {
      const sceneId = shot.scene_id || "__unassigned__";
      if (!groups[sceneId]) groups[sceneId] = [];
      groups[sceneId].push(shot);
    }
    return groups;
  };

  const videoByScene = groupShotsByScene(shotsWithVideo);
  const framesByScene = groupShotsByScene(shotsWithFramesOnly);

  const getSceneName = (sceneId: string) => {
    if (sceneId === "__unassigned__") return "Unassigned";
    const scene = scenes.find((s) => s.id === sceneId);
    return scene?.name || sceneId;
  };

  // Apply search filter
  const searchLower = timelineSearch.toLowerCase();
  const filterShots = (shotList: any[]) =>
    !timelineSearch ? shotList : shotList.filter((s) => s.name.toLowerCase().includes(searchLower));
  const filterAudio = (fileList: AudioFileItem[]) =>
    !timelineSearch ? fileList : fileList.filter((a) => a.filename.toLowerCase().includes(searchLower));

  const filteredVoiceFiles = filterAudio(voiceFiles);
  const filteredMusicFiles = filterAudio(musicFiles);
  const filteredFoleyFiles = filterAudio(foleyFiles);
  const filteredSfxFiles = filterAudio(sfxFiles);
  const filteredOtherAudioFiles = filterAudio(otherAudioFiles);

  const isCameraMode = mode === "camera";
  const isTimelineMode = mode === "timeline";
  const handleShotClick = (shot: any) => {
    if (isCameraMode) {
      setSelectedShotId(shot.id);
    } else if (isTimelineMode) {
      handleAddShotToTimeline(shot);
    }
  };

  return (
    <div className="p-3 overflow-y-auto h-full">
      {/* Header + Search */}
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xs font-semibold text-studio-muted uppercase tracking-wider">Library</h2>
        <button
          onClick={() => fileRef.current?.click()}
          className="p-1.5 rounded-lg hover:bg-studio-panelHover text-studio-muted hover:text-studio-accent transition-colors"
          title="Upload asset"
        >
          {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
        </button>
        <input ref={fileRef} type="file" accept="image/*" onChange={handleUpload} className="hidden" />
      </div>
      <div className="relative mb-4">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-studio-muted/50" />
        <input
          value={timelineSearch}
          onChange={(e) => setTimelineSearch(e.target.value)}
          placeholder="Search assets, clips, audio..."
          className="w-full bg-studio-panel border border-studio-border rounded-lg pl-8 pr-3 py-1.5 text-xs text-studio-text focus:outline-none focus:border-studio-accent"
        />
      </div>

      {/* ===== ASSETS (characters, locations, props, etc.) ===== */}
      <div className="mb-4">
        <button
          onClick={() => toggleSection("assets")}
          className="flex items-center gap-1.5 text-xs font-medium text-studio-text mb-2 w-full"
        >
          {expandedSections.assets ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
          <ImageIcon className="w-3.5 h-3.5 text-studio-accent" />
          Assets ({filtered.length})
        </button>
        {expandedSections.assets && (
          <>
            <div className="flex flex-wrap gap-1 mb-2">
              {typeFilters.map((f) => (
                <button
                  key={f.id}
                  onClick={() => setFilter(f.id)}
                  className={`px-2 py-0.5 text-[10px] font-medium rounded-full transition-all ${
                    filter === f.id
                      ? "bg-studio-accent text-white"
                      : "bg-studio-border/50 text-studio-muted hover:text-studio-text hover:bg-studio-border"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2">
              {filtered.map((asset) => {
                const Icon = typeIcons[asset.type] || ImageIcon;
                const thumbUrl = getAssetThumbnailUrl(asset);
                const isSelected = selectedAssetId === asset.id;
                return (
                  <div
                    key={asset.id}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData("application/json", JSON.stringify({
                        id: asset.id,
                        type: asset.type,
                        name: asset.name,
                        primary_image: asset.primary_image,
                      }));
                      e.dataTransfer.effectAllowed = "copy";
                    }}
                    onClick={() => setSelectedAssetId(isSelected ? null : asset.id)}
                    className={`group relative aspect-square rounded-xl overflow-hidden border-2 cursor-pointer transition-all ${
                      isSelected
                        ? "border-studio-accent ring-2 ring-studio-accent/30 scale-[1.02]"
                        : "border-transparent hover:border-studio-accent/40 hover:scale-[1.02]"
                    }`}
                  >
                    {thumbUrl ? (
                      <img src={thumbUrl} alt={asset.name} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-studio-bg">
                        <Icon className="w-8 h-8 text-studio-muted" />
                      </div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
                    <div className="absolute bottom-0 left-0 right-0 p-1.5">
                      <p className="text-[11px] text-white font-medium truncate">{asset.name}</p>
                    </div>
                    <div className="absolute top-1 left-1 p-0.5 rounded-md bg-black/60 backdrop-blur-sm">
                      <Icon className="w-3 h-3 text-studio-accent" />
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDelete(asset.id); }}
                      className="absolute top-1 right-1 p-1 rounded-full bg-black/60 backdrop-blur-sm hover:bg-studio-danger text-white opacity-0 group-hover:opacity-100 transition-all"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                );
              })}
            </div>
            {filtered.length === 0 && (
              <p className="text-[11px] text-studio-muted/50 px-2 py-2">No assets yet</p>
            )}
          </>
        )}
      </div>

      {selectedAsset && (
        <AssetDetailPanel projectId={projectId} asset={selectedAsset} />
      )}

        {/* ===== VIDEO CLIPS (by scene, includes uploaded) ===== */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <button
              onClick={() => toggleSection("videos")}
              className="flex items-center gap-1.5 text-xs font-medium text-studio-text w-full"
            >
              {expandedSections.videos ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
              <Film className="w-3.5 h-3.5 text-studio-accent" />
              Video Clips ({shotsWithVideo.length + videoAssets.length})
            </button>
            <button
              onClick={() => videoFileRef.current?.click()}
              className="p-1 rounded hover:bg-studio-panelHover text-studio-muted hover:text-studio-accent transition-colors shrink-0"
              title="Upload video"
            >
              {videoUploadStatus === "Uploading..." ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
            </button>
            <input ref={videoFileRef} type="file" accept="video/mp4,video/mov,video/avi,video/mkv,video/webm" onChange={handleUploadVideo} className="hidden" />
          </div>
          {videoUploadStatus && videoUploadStatus !== "Uploading..." && (
            <p className="text-[10px] text-red-400 mb-1 px-2">{videoUploadStatus}</p>
          )}
          {expandedSections.videos && (
            <div className="space-y-2">
              {storeShots.length === 0 && <p className="text-[11px] text-studio-muted">Loading...</p>}

              {/* Uploaded videos pseudo-scene group (top) */}
              {videoAssets.length > 0 && (
                <div>
                  <p className="text-[10px] text-studio-muted uppercase tracking-wider px-2 mb-1">Uploaded ({videoAssets.length})</p>
                  <div className="space-y-1">
                    {videoAssets.map((video) => (
                      <div
                        key={video.filename}
                        onClick={() => handleAddVideoAssetToTimeline(video)}
                        className="group flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-studio-border/40 cursor-pointer transition-all"
                      >
                        <div className="w-8 h-8 rounded bg-studio-bg flex items-center justify-center shrink-0">
                          <Video className="w-4 h-4 text-sky-400" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-studio-text truncate">{video.filename}</p>
                          <p className="text-[10px] text-studio-muted">{(video.size_bytes / 1024 / 1024).toFixed(1)} MB{video.duration_seconds ? ` · ${video.duration_seconds.toFixed(1)}s` : ""}</p>
                        </div>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDeleteVideoAsset(video); }}
                          className="p-0.5 rounded hover:bg-red-500/20 text-studio-muted hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all shrink-0"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                        <Plus className="w-3.5 h-3.5 text-studio-muted group-hover:text-studio-accent shrink-0" />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Generated video clips grouped by scene */}
              {Object.entries(videoByScene).map(([sceneId, sceneShots]) => {
                const filtered = filterShots(sceneShots);
                if (filtered.length === 0) return null;
                const collapsed = isSceneCollapsed("videos", sceneId);
                return (
                  <div key={sceneId}>
                    <button
                      onClick={() => toggleScene("videos", sceneId)}
                      className="flex items-center gap-1 w-full px-2 mb-1 text-[10px] text-studio-muted uppercase tracking-wider hover:text-studio-text transition-colors"
                    >
                      {collapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                      {getSceneName(sceneId)} ({filtered.length})
                    </button>
                    {!collapsed && (
                    <div className="space-y-1">
                      {filtered.map((shot) => {
                        const takes = shot.video_takes || [];
                        const isExpanded = expandedTakes[shot.id];
                        const hasMultipleTakes = takes.length > 1;
                        return (
                          <div key={shot.id}>
                            <div
                              onClick={() => isCameraMode ? setSelectedShotId(shot.id) : hasMultipleTakes ? setExpandedTakes((prev) => ({ ...prev, [shot.id]: !prev[shot.id] })) : handleAddShotToTimeline(shot)}
                              className={`group flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer transition-all ${
                                isCameraMode && selectedShotId === shot.id
                                  ? "bg-studio-accent/20 ring-1 ring-studio-accent/40"
                                  : "hover:bg-studio-border/40"
                              }`}
                            >
                              <div className="w-8 h-8 rounded overflow-hidden bg-studio-bg shrink-0 relative">
                                {shot.frame_image_path && (
                                  <img src={shot.frame_image_path} alt="" className="w-full h-full object-cover" />
                                )}
                                <div className="absolute bottom-0 right-0 bg-studio-accent rounded-tl px-0.5">
                                  <Video className="w-2.5 h-2.5 text-white" />
                                </div>
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-xs text-studio-text truncate">{shot.name}</p>
                                <p className="text-[10px] text-studio-muted">
                                  {hasMultipleTakes ? `${takes.length} takes` : "Video"}
                                </p>
                              </div>
                              {hasMultipleTakes && (
                                <button
                                  onClick={(e) => { e.stopPropagation(); setExpandedTakes((prev) => ({ ...prev, [shot.id]: !prev[shot.id] })); }}
                                  className="p-0.5 text-studio-muted shrink-0"
                                >
                                  {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                                </button>
                              )}
                              {isCameraMode ? (
                                <Camera className="w-3.5 h-3.5 text-studio-muted group-hover:text-studio-accent shrink-0" />
                              ) : (
                                <Plus className="w-3.5 h-3.5 text-studio-muted group-hover:text-studio-accent shrink-0" />
                              )}
                            </div>
                            {/* Expanded takes */}
                            {hasMultipleTakes && isExpanded && (
                              <div className="ml-4 mt-1 space-y-1 border-l border-studio-border pl-2">
                                {takes.map((take: any) => (
                                  <div
                                    key={take.id}
                                    className="group flex items-center gap-2 px-2 py-1 rounded-lg hover:bg-studio-border/40 cursor-pointer transition-all"
                                  >
                                    <div className="w-6 h-6 rounded bg-studio-bg flex items-center justify-center shrink-0">
                                      {take.selected ? (
                                        <Check className="w-3 h-3 text-studio-accent" />
                                      ) : (
                                        <Video className="w-3 h-3 text-studio-muted" />
                                      )}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <p className="text-[11px] text-studio-text truncate">Take {take.id}</p>
                                      <p className="text-[9px] text-studio-muted">{take.model_id}</p>
                                    </div>
                                    {!take.selected && (
                                      <button
                                        onClick={(e) => { e.stopPropagation(); handleSelectTakeInLibrary(shot.id, take.id); }}
                                        className="p-0.5 rounded hover:bg-studio-accent/20 text-studio-muted hover:text-studio-accent opacity-0 group-hover:opacity-100 transition-all shrink-0"
                                        title="Select as active"
                                      >
                                        <Check className="w-3 h-3" />
                                      </button>
                                    )}
                                    {!isCameraMode && (
                                      <button
                                        onClick={(e) => { e.stopPropagation(); handleAddTakeToTimeline(shot, take); }}
                                        className="p-0.5 rounded hover:bg-studio-accent/20 text-studio-muted hover:text-studio-accent opacity-0 group-hover:opacity-100 transition-all shrink-0"
                                        title="Send to timeline"
                                      >
                                        <Send className="w-3 h-3" />
                                      </button>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    )}
                  </div>
                );
              })}
              {shotsWithVideo.length === 0 && videoAssets.length === 0 && (
                <p className="text-[11px] text-studio-muted/50 px-2">No video clips yet</p>
              )}
            </div>
          )}
        </div>

        {/* ===== STORYBOARD FRAMES (by scene) ===== */}
        <div className="mb-4">
          <button
            onClick={() => toggleSection("frames")}
            className="flex items-center gap-1.5 text-xs font-medium text-studio-text mb-2 w-full"
          >
            {expandedSections.frames ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
            <Clapperboard className="w-3.5 h-3.5 text-sky-400" />
            Storyboard Frames ({shotsWithFramesOnly.length})
          </button>
          {expandedSections.frames && (
            <div className="space-y-2">
              {Object.entries(framesByScene).map(([sceneId, sceneShots]) => {
                const filtered = filterShots(sceneShots);
                if (filtered.length === 0) return null;
                const collapsed = isSceneCollapsed("frames", sceneId);
                return (
                  <div key={sceneId}>
                    <button
                      onClick={() => toggleScene("frames", sceneId)}
                      className="flex items-center gap-1 w-full px-2 mb-1 text-[10px] text-studio-muted uppercase tracking-wider hover:text-studio-text transition-colors"
                    >
                      {collapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                      {getSceneName(sceneId)} ({filtered.length})
                    </button>
                    {!collapsed && (
                    <div className="space-y-1">
                      {filtered.map((shot) => (
                        <div
                          key={shot.id}
                          onClick={() => handleShotClick(shot)}
                          className={`group flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer transition-all ${
                            isCameraMode && selectedShotId === shot.id
                              ? "bg-studio-accent/20 ring-1 ring-studio-accent/40"
                              : "hover:bg-studio-border/40"
                          }`}
                        >
                          <div className="w-8 h-8 rounded overflow-hidden bg-studio-bg shrink-0">
                            <img src={shot.frame_image_path} alt="" className="w-full h-full object-cover" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs text-studio-text truncate">{shot.name}</p>
                            <p className="text-[10px] text-studio-muted">{isCameraMode ? "Frame" : "Frame (5s hold)"}</p>
                          </div>
                          {isCameraMode ? (
                            <Camera className="w-3.5 h-3.5 text-studio-muted group-hover:text-studio-accent shrink-0" />
                          ) : (
                            <Plus className="w-3.5 h-3.5 text-studio-muted group-hover:text-studio-accent shrink-0" />
                          )}
                        </div>
                      ))}
                    </div>
                    )}
                  </div>
                );
              })}
              {shotsWithFramesOnly.length === 0 && (
                <p className="text-[11px] text-studio-muted/50 px-2">No storyboard frames</p>
              )}
            </div>
          )}
        </div>

        {/* ===== IMAGES (uploaded — plates, graphics, hold frames) ===== */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <button
              onClick={() => toggleSection("images")}
              className="flex items-center gap-1.5 text-xs font-medium text-studio-text"
            >
              {expandedSections.images ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
              <ImageIcon className="w-3.5 h-3.5 text-yellow-400" />
              Images ({imageAssets.length})
            </button>
            <button
              onClick={() => imageFileRef.current?.click()}
              className="p-1 rounded hover:bg-studio-panelHover text-studio-muted hover:text-studio-accent transition-colors"
              title="Upload image"
            >
              {imageUploadStatus === "Uploading..." ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
            </button>
            <input ref={imageFileRef} type="file" accept="image/png,image/jpeg,image/jpg,image/webp,image/bmp,image/gif" onChange={handleUploadImage} className="hidden" />
          </div>
          {imageUploadStatus && imageUploadStatus !== "Uploading..." && (
            <p className="text-[10px] text-red-400 mb-1 px-2">{imageUploadStatus}</p>
          )}
          {expandedSections.images && (
            <div className="space-y-1">
              {imageAssetsLoading && <p className="text-[11px] text-studio-muted">Loading...</p>}
              {imageAssets.map((image) => (
                <div
                  key={image.filename}
                  onClick={() => handleAddImageToTimeline(image)}
                  className="group flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-studio-border/40 cursor-pointer transition-all"
                >
                  <div className="w-8 h-8 rounded overflow-hidden bg-studio-bg shrink-0">
                    <img src={image.image_url} alt="" className="w-full h-full object-cover" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-studio-text truncate">{image.filename}</p>
                    <p className="text-[10px] text-studio-muted">{(image.size_bytes / 1024).toFixed(0)} KB · 5s hold</p>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDeleteImageAsset(image); }}
                    className="p-0.5 rounded hover:bg-red-500/20 text-studio-muted hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all shrink-0"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                  <Plus className="w-3.5 h-3.5 text-studio-muted group-hover:text-studio-accent shrink-0" />
                </div>
              ))}
              {imageAssets.length === 0 && !imageAssetsLoading && (
                <p className="text-[11px] text-studio-muted/50 px-2">No uploaded images</p>
              )}
            </div>
          )}
        </div>

        {/* ===== AUDIO ===== */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <button
              onClick={() => toggleSection("audio")}
              className="flex items-center gap-1.5 text-xs font-medium text-studio-text"
            >
              {expandedSections.audio ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
              <Music className="w-3.5 h-3.5 text-emerald-400" />
              Audio ({audioFiles.length})
            </button>
            <button
              onClick={() => audioFileRef.current?.click()}
              className="p-1 rounded hover:bg-studio-panelHover text-studio-muted hover:text-studio-accent transition-colors"
              title="Upload audio"
            >
              {audioUploadStatus === "Uploading..." ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
            </button>
            <input ref={audioFileRef} type="file" accept="audio/*" onChange={handleUploadAudio} className="hidden" />
          </div>
          {audioUploadStatus && audioUploadStatus !== "Uploading..." && (
            <p className="text-[10px] text-red-400 mb-1 px-2">{audioUploadStatus}</p>
          )}
          {expandedSections.audio && (
            <div className="space-y-1">
              {audioLoading && <p className="text-[11px] text-studio-muted">Loading...</p>}

              {filteredVoiceFiles.length > 0 && (
                <div className="mb-1">
                  <p className="text-[10px] text-studio-muted uppercase tracking-wider px-2 mb-0.5">Voice ({filteredVoiceFiles.length})</p>
                  {filteredVoiceFiles.map((item) => (
                    <AudioRow key={item.filename} item={item} icon={Mic} iconColor="text-purple-400" onAdd={() => handleAddAudioToTimeline(item)} onDelete={() => handleDeleteAudioFile(item)} />
                  ))}
                </div>
              )}

              {filteredMusicFiles.length > 0 && (
                <div className="mb-1">
                  <p className="text-[10px] text-studio-muted uppercase tracking-wider px-2 mb-0.5">Music ({filteredMusicFiles.length})</p>
                  {filteredMusicFiles.map((item) => (
                    <AudioRow key={item.filename} item={item} icon={Music} iconColor="text-emerald-400" onAdd={() => handleAddAudioToTimeline(item)} onDelete={() => handleDeleteAudioFile(item)} />
                  ))}
                </div>
              )}

              {filteredFoleyFiles.length > 0 && (
                <div className="mb-1">
                  <p className="text-[10px] text-studio-muted uppercase tracking-wider px-2 mb-0.5">Foley ({filteredFoleyFiles.length})</p>
                  {filteredFoleyFiles.map((item) => (
                    <AudioRow key={item.filename} item={item} icon={Sparkles} iconColor="text-orange-400" onAdd={() => handleAddAudioToTimeline(item)} onDelete={() => handleDeleteAudioFile(item)} />
                  ))}
                </div>
              )}

              {filteredSfxFiles.length > 0 && (
                <div className="mb-1">
                  <p className="text-[10px] text-studio-muted uppercase tracking-wider px-2 mb-0.5">SFX ({filteredSfxFiles.length})</p>
                  {filteredSfxFiles.map((item) => (
                    <AudioRow key={item.filename} item={item} icon={Sparkles} iconColor="text-cyan-400" onAdd={() => handleAddAudioToTimeline(item)} onDelete={() => handleDeleteAudioFile(item)} />
                  ))}
                </div>
              )}

              {filteredOtherAudioFiles.length > 0 && (
                <div className="mb-1">
                  <p className="text-[10px] text-studio-muted uppercase tracking-wider px-2 mb-0.5">Other ({filteredOtherAudioFiles.length})</p>
                  {filteredOtherAudioFiles.map((item) => (
                    <AudioRow key={item.filename} item={item} icon={Music} iconColor="text-studio-muted" onAdd={() => handleAddAudioToTimeline(item)} onDelete={() => handleDeleteAudioFile(item)} />
                  ))}
                </div>
              )}

              {audioFiles.length === 0 && !audioLoading && (
                <p className="text-[11px] text-studio-muted/50 px-2">No audio files</p>
              )}
            </div>
          )}
        </div>
      </div>
    );
}
