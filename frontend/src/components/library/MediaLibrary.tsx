"use client";

import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { useStudioStore } from "@/lib/store";
import {
  fetchAssets, uploadAsset, deleteAsset, getAssetThumbnailUrl,
  listVideoAssets, uploadVideoAsset, deleteVideoAsset, getVideoAssetUrl,
  listAudioFiles, uploadAudioFile, deleteAudioFile, getAudioUrl,
  listImageAssets, deleteImageAsset, uploadImageAsset,
  fetchShots, selectVideoTake, deleteVideoTake, cleanupStaleVideoRefs, VideoAsset, AudioFileItem, ShotResponse, VideoTake, ImageAssetItem,
} from "@/lib/api";
import {
  User, MapPin, Package, Car, Upload, Trash2, ImageIcon, Loader2,
  Film, Music, Video, Plus, ChevronDown, ChevronRight,
  Search, Send, Check, Clapperboard, Camera, Palette, Wand2, Play,
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
  onAdd,
  onDelete,
}: {
  item: AudioFileItem;
  onAdd: () => void;
  onDelete: () => void;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState<number | null>(null);
  const displayName = item.filename.replace(/\.[^./\\]+$/, "");

  const togglePlay = (e: React.MouseEvent) => {
    e.stopPropagation();
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
    } else {
      audio.play();
    }
    setPlaying(!playing);
  };

  const handleLoadedMetadata = () => {
    const audio = audioRef.current;
    if (audio && Number.isFinite(audio.duration) && audio.duration > 0) {
      setDuration(audio.duration);
    }
  };

  const formatDuration = (s: number) => {
    const mins = Math.floor(s / 60);
    const secs = Math.floor(s % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <div
      onClick={onAdd}
      className="group flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-studio-border/40 cursor-pointer transition-all"
    >
      <audio
        ref={audioRef}
        src={item.audio_url}
        onEnded={() => setPlaying(false)}
        onLoadedMetadata={handleLoadedMetadata}
        preload="metadata"
      />
      <button
        onClick={togglePlay}
        className="w-8 h-8 rounded bg-studio-bg flex items-center justify-center shrink-0 hover:bg-studio-accent/20 transition-colors"
      >
        {playing ? (
          <span className="text-studio-accent text-xs">⏸</span>
        ) : (
          <Play className="w-3.5 h-3.5 text-studio-muted group-hover:text-studio-accent" />
        )}
      </button>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-studio-text truncate">{displayName}</p>
        <p className="text-[10px] text-studio-muted">{item.filename}{duration !== null && ` · ${formatDuration(duration)}`}</p>
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
  const [universalUploading, setUniversalUploading] = useState(false);
  const universalFileRef = useRef<HTMLInputElement>(null);

  // Pending image upload (shows Create Asset dialog)
  const [pendingImage, setPendingImage] = useState<File | null>(null);
  const [pendingImageName, setPendingImageName] = useState("");
  const [pendingImageType, setPendingImageType] = useState("character");

  // Timeline mode state
  const [videoAssets, setVideoAssets] = useState<VideoAsset[]>([]);
  const [videoAssetsLoading, setVideoAssetsLoading] = useState(false);

  const [imageAssets, setImageAssets] = useState<ImageAssetItem[]>([]);
  const [imageAssetsLoading, setImageAssetsLoading] = useState(false);

  const [audioFiles, setAudioFiles] = useState<AudioFileItem[]>([]);
  const [audioLoading, setAudioLoading] = useState(false);


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
  const [previewTake, setPreviewTake] = useState<{ path: string; id: string; model_id: string; shotName: string } | null>(null);

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

  // Single mount effect: load assets, videos, audio, images, and shots
  useEffect(() => {
    void refresh();
    void loadVideoAssets();
    void loadAudioFiles();
    void loadImageAssets();
    if (storeShots.length === 0) {
      void loadShots();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  // Auto-cleanup stale video references on mount (run once)
  useEffect(() => {
    void (async () => {
      try {
        const result = await cleanupStaleVideoRefs(projectId);
        if (result.cleaned > 0) {
          const fresh = await fetchShots(projectId);
          useStudioStore.getState().setShots(fresh);
        }
      } catch {
        // Non-critical — ignore
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reload audio when refresh token changes (e.g. after TTS generation)
  useEffect(() => {
    if (audioLibraryRefreshToken > 0) {
      void loadAudioFiles();
    }
  }, [audioLibraryRefreshToken, loadAudioFiles]);

  const typeFiltered = filter === "all" ? assets : assets.filter((a) => a.type === filter);
  const selectedAsset = assets.find((a) => a.id === selectedAssetId);

  const handleUniversalUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUniversalUploading(true);
    try {
      const mimeType = file.type;
      if (mimeType.startsWith("video/")) {
        await uploadVideoAsset(file, projectId);
        await loadVideoAssets();
      } else if (mimeType.startsWith("audio/")) {
        await uploadAudioFile(file, projectId);
        await loadAudioFiles();
      } else if (mimeType.startsWith("image/")) {
        const name = file.name.replace(/\.[^.]+$/, "");
        setPendingImage(file);
        setPendingImageName(name);
        setPendingImageType(filter === "all" ? "character" : filter);
      } else {
        console.error("Unsupported file type:", mimeType);
      }
    } catch (err) {
      console.error("Upload failed:", err);
      alert(err instanceof Error ? err.message : "Upload failed");
    }
    setUniversalUploading(false);
    if (universalFileRef.current) universalFileRef.current.value = "";
  };

  const handleConfirmCreateAsset = async () => {
    if (!pendingImage || !pendingImageName.trim()) return;
    setUniversalUploading(true);
    try {
      await uploadAsset(projectId, pendingImageName.trim(), pendingImageType, pendingImage);
      await refresh();
      await loadImageAssets();
    } catch (err) {
      console.error("Asset creation failed:", err);
      alert(err instanceof Error ? err.message : "Upload failed");
    }
    setUniversalUploading(false);
    setPendingImage(null);
    setPendingImageName("");
  };

  const handleCancelCreateAsset = () => {
    setPendingImage(null);
    setPendingImageName("");
  };

  const handleQuickImageUpload = async () => {
    if (!pendingImage) return;
    setUniversalUploading(true);
    try {
      await uploadImageAsset(pendingImage, projectId);
      await loadImageAssets();
    } catch (err) {
      console.error("Image upload failed:", err);
      alert(err instanceof Error ? err.message : "Upload failed");
    }
    setUniversalUploading(false);
    setPendingImage(null);
    setPendingImageName("");
  };

  const handleDelete = async (assetId: string) => {
    if (!confirm("Delete this asset?")) return;
    await deleteAsset(projectId, assetId);
    await refresh();
  };

  // --- Timeline mode helpers ---

  // Unified media duration helper (works for both video and audio)
  const getMediaDurationSeconds = async (url: string, type: "video" | "audio" = "video"): Promise<number | null> => {
    try {
      const duration = await new Promise<number>((resolve, reject) => {
        const el = type === "video" ? document.createElement("video") : document.createElement("audio");
        el.preload = "metadata";
        if (type === "video") el.muted = true;
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
    const duration = await getMediaDurationSeconds(url, "audio");
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

  // Delete a take from a shot
  const handleDeleteTakeInLibrary = async (shotId: string, takeId: string) => {
    try {
      await deleteVideoTake(projectId, shotId, takeId);
      const fresh = await fetchShots(projectId);
      setStoreShots(fresh);
    } catch (err) {
      console.error("Failed to delete take:", err);
    }
  };

  // Remove references to video files that no longer exist on disk
  const handleCleanupStaleVideos = async () => {
    try {
      const result = await cleanupStaleVideoRefs(projectId);
      const fresh = await fetchShots(projectId);
      setStoreShots(fresh);
      console.log(`[MediaLibrary] cleaned ${result.cleaned} stale video references`);
    } catch (err) {
      console.error("Failed to cleanup stale videos:", err);
    }
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

  // Single-pass audio categorization
  const AUDIO_CATEGORIES = [
    { key: "voice", test: (f: string) => /chatterbox|fish.?speech|_tts|-tts|cosyvoice|bark|tortoise|voice|speech|dialogue|narration/i.test(f) },
    { key: "music", test: (f: string) => /stable.?audio|_music|-music|musicgen|audiogen|song|score/i.test(f) },
    { key: "foley", test: (f: string) => /hunyuan.?foley|_foley|-foley|foley/i.test(f) },
    { key: "sfx", test: (f: string) => /_sfx|-sfx|effect|impact|whoosh|ambient/i.test(f) },
  ] as const;

  const categorizedAudio = useMemo(() => {
    const groups: Record<string, AudioFileItem[]> = { voice: [], music: [], foley: [], sfx: [], other: [] };
    for (const file of audioFiles) {
      const matched = AUDIO_CATEGORIES.find((c) => c.test(file.filename));
      groups[matched ? matched.key : "other"].push(file);
    }
    return groups;
  }, [audioFiles]);

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

  // Apply search filter across all sections
  const searchLower = timelineSearch.toLowerCase();
  const filterShots = (shotList: any[]) =>
    !timelineSearch ? shotList : shotList.filter((s) => s.name.toLowerCase().includes(searchLower));
  const filterAudio = (fileList: AudioFileItem[]) =>
    !timelineSearch ? fileList : fileList.filter((a) => a.filename.toLowerCase().includes(searchLower));
  const filterAssets = (assetList: typeof assets) =>
    !timelineSearch ? assetList : assetList.filter((a) => a.name.toLowerCase().includes(searchLower));
  const filterImages = (imageList: ImageAssetItem[]) =>
    !timelineSearch ? imageList : imageList.filter((a) => a.filename.toLowerCase().includes(searchLower));
  const filterVideos = (videoList: VideoAsset[]) =>
    !timelineSearch ? videoList : videoList.filter((v) => v.filename.toLowerCase().includes(searchLower));

  const filteredVoiceFiles = filterAudio(categorizedAudio.voice);
  const filteredMusicFiles = filterAudio(categorizedAudio.music);
  const filteredFoleyFiles = filterAudio(categorizedAudio.foley);
  const filteredSfxFiles = filterAudio(categorizedAudio.sfx);
  const filteredOtherAudioFiles = filterAudio(categorizedAudio.other);
  const filtered = filterAssets(typeFiltered);
  const filteredImageAssets = filterImages(imageAssets);
  const filteredVideoAssets = filterVideos(videoAssets);

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
    <>
    <div className="p-3 overflow-y-auto h-full">
      {/* Header + Search */}
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xs font-semibold text-studio-muted uppercase tracking-wider">Library</h2>
        <button
          onClick={() => universalFileRef.current?.click()}
          className="p-1.5 rounded-lg hover:bg-studio-panelHover text-studio-muted hover:text-studio-accent transition-colors"
          title="Upload file (auto-categorizes by type)"
        >
          {universalUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
        </button>
        <input ref={universalFileRef} type="file" accept="image/*,video/*,audio/*" onChange={handleUniversalUpload} className="hidden" />
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
            <div className="grid grid-cols-3 gap-1.5">
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
                    <div className="absolute bottom-0 left-0 right-0 p-1">
                      <p className="text-[10px] text-white font-medium truncate">{asset.name}</p>
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
              Video Clips ({shotsWithVideo.length + filteredVideoAssets.length})
            </button>
            <button
              onClick={handleCleanupStaleVideos}
              className="p-1 rounded hover:bg-studio-panelHover text-studio-muted hover:text-red-400 transition-colors shrink-0"
              title="Clean up missing video files"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
          {expandedSections.videos && (
            <div className="space-y-2">
              {storeShots.length === 0 && <p className="text-[11px] text-studio-muted">Loading...</p>}

              {/* Uploaded videos pseudo-scene group (top) */}
              {filteredVideoAssets.length > 0 && (
                <div>
                  <p className="text-[10px] text-studio-muted uppercase tracking-wider px-2 mb-1">Uploaded ({filteredVideoAssets.length})</p>
                  <div className="space-y-1">
                    {filteredVideoAssets.map((video) => (
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
                              <button
                                onClick={(e) => { e.stopPropagation(); const activeTake = takes.find((t: any) => t.selected) || takes[0]; if (activeTake) setPreviewTake({ path: activeTake.path, id: activeTake.id, model_id: activeTake.model_id, shotName: shot.name }); }}
                                className="p-0.5 rounded hover:bg-studio-accent/20 text-studio-muted hover:text-studio-accent opacity-0 group-hover:opacity-100 transition-all shrink-0"
                                title="Preview video"
                              >
                                <Play className="w-3 h-3" />
                              </button>
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
                                    <button
                                      onClick={(e) => { e.stopPropagation(); setPreviewTake({ path: take.path, id: take.id, model_id: take.model_id, shotName: shot.name }); }}
                                      className="p-0.5 rounded hover:bg-studio-accent/20 text-studio-muted hover:text-studio-accent opacity-0 group-hover:opacity-100 transition-all shrink-0"
                                      title="Preview"
                                    >
                                      <Video className="w-3 h-3" />
                                    </button>
                                    {!isCameraMode && (
                                      <button
                                        onClick={(e) => { e.stopPropagation(); handleAddTakeToTimeline(shot, take); }}
                                        className="p-0.5 rounded hover:bg-studio-accent/20 text-studio-muted hover:text-studio-accent opacity-0 group-hover:opacity-100 transition-all shrink-0"
                                        title="Send to timeline"
                                      >
                                        <Send className="w-3 h-3" />
                                      </button>
                                    )}
                                    <button
                                      onClick={(e) => { e.stopPropagation(); if (confirm(`Delete take ${take.id}?`)) handleDeleteTakeInLibrary(shot.id, take.id); }}
                                      className="p-0.5 rounded hover:bg-red-500/20 text-studio-muted hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all shrink-0"
                                      title="Delete take"
                                    >
                                      <Trash2 className="w-3 h-3" />
                                    </button>
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
              {shotsWithVideo.length === 0 && filteredVideoAssets.length === 0 && (
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
              Images ({filteredImageAssets.length})
            </button>
          </div>
          {expandedSections.images && (
            <div className="space-y-1">
              {imageAssetsLoading && <p className="text-[11px] text-studio-muted">Loading...</p>}
              {filteredImageAssets.map((image) => (
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
              {filteredImageAssets.length === 0 && !imageAssetsLoading && (
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
          </div>
          {expandedSections.audio && (
            <div className="space-y-1">
              {audioLoading && <p className="text-[11px] text-studio-muted">Loading...</p>}

              {filteredVoiceFiles.length > 0 && (
                <div className="mb-1">
                  <p className="text-[10px] text-studio-muted uppercase tracking-wider px-2 mb-0.5">Voice ({filteredVoiceFiles.length})</p>
                  {filteredVoiceFiles.map((item) => (
                    <AudioRow key={item.filename} item={item} onAdd={() => handleAddAudioToTimeline(item)} onDelete={() => handleDeleteAudioFile(item)} />
                  ))}
                </div>
              )}

              {filteredMusicFiles.length > 0 && (
                <div className="mb-1">
                  <p className="text-[10px] text-studio-muted uppercase tracking-wider px-2 mb-0.5">Music ({filteredMusicFiles.length})</p>
                  {filteredMusicFiles.map((item) => (
                    <AudioRow key={item.filename} item={item} onAdd={() => handleAddAudioToTimeline(item)} onDelete={() => handleDeleteAudioFile(item)} />
                  ))}
                </div>
              )}

              {filteredFoleyFiles.length > 0 && (
                <div className="mb-1">
                  <p className="text-[10px] text-studio-muted uppercase tracking-wider px-2 mb-0.5">Foley ({filteredFoleyFiles.length})</p>
                  {filteredFoleyFiles.map((item) => (
                    <AudioRow key={item.filename} item={item} onAdd={() => handleAddAudioToTimeline(item)} onDelete={() => handleDeleteAudioFile(item)} />
                  ))}
                </div>
              )}

              {filteredSfxFiles.length > 0 && (
                <div className="mb-1">
                  <p className="text-[10px] text-studio-muted uppercase tracking-wider px-2 mb-0.5">SFX ({filteredSfxFiles.length})</p>
                  {filteredSfxFiles.map((item) => (
                    <AudioRow key={item.filename} item={item} onAdd={() => handleAddAudioToTimeline(item)} onDelete={() => handleDeleteAudioFile(item)} />
                  ))}
                </div>
              )}

              {filteredOtherAudioFiles.length > 0 && (
                <div className="mb-1">
                  <p className="text-[10px] text-studio-muted uppercase tracking-wider px-2 mb-0.5">Other ({filteredOtherAudioFiles.length})</p>
                  {filteredOtherAudioFiles.map((item) => (
                    <AudioRow key={item.filename} item={item} onAdd={() => handleAddAudioToTimeline(item)} onDelete={() => handleDeleteAudioFile(item)} />
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

      {/* Video Preview Modal */}
      {previewTake && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-8"
          onClick={() => setPreviewTake(null)}
        >
          <div
            className="relative max-w-3xl w-full bg-studio-panel rounded-2xl overflow-hidden border border-studio-border"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-3 border-b border-studio-border">
              <span className="text-sm font-medium text-studio-text">{previewTake.shotName} · Take {previewTake.id} · {previewTake.model_id}</span>
              <button
                onClick={() => setPreviewTake(null)}
                className="text-studio-muted hover:text-studio-text"
              >
                <ChevronDown className="w-5 h-5" />
              </button>
            </div>
            <video
              src={previewTake.path}
              className="w-full max-h-[70vh]"
              controls
              autoPlay
              loop
            />
          </div>
        </div>
      )}

      {/* Create Asset Dialog (when image uploaded) */}
      {pendingImage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in"
          onClick={handleCancelCreateAsset}
        >
          <div
            className="bg-studio-panel border border-studio-border rounded-xl shadow-2xl w-full max-w-sm p-4 space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2">
              <ImageIcon className="w-4 h-4 text-studio-accent" />
              <p className="text-sm font-semibold text-studio-text">Create Asset</p>
            </div>
            {/* Preview */}
            <div className="rounded-lg overflow-hidden border border-studio-border max-h-32">
              <img
                src={URL.createObjectURL(pendingImage)}
                alt="preview"
                className="w-full max-h-32 object-contain bg-studio-bg"
              />
            </div>
            {/* Name */}
            <div>
              <label className="text-[10px] font-semibold text-studio-muted uppercase tracking-wider mb-1 block">
                Asset Name
              </label>
              <input
                value={pendingImageName}
                onChange={(e) => setPendingImageName(e.target.value)}
                autoFocus
                className="w-full bg-studio-bg border border-studio-border rounded-lg px-2.5 py-1.5 text-xs text-studio-text focus:outline-none focus:border-studio-accent"
              />
            </div>
            {/* Type */}
            <div>
              <label className="text-[10px] font-semibold text-studio-muted uppercase tracking-wider mb-1 block">
                Type
              </label>
              <div className="flex flex-wrap gap-1">
                {typeFilters.filter((f) => f.id !== "all").map((f) => {
                  const Icon = typeIcons[f.id] || ImageIcon;
                  return (
                    <button
                      key={f.id}
                      onClick={() => setPendingImageType(f.id)}
                      className={`flex items-center gap-1 px-2 py-1 text-[10px] font-medium rounded-md transition-all border ${
                        pendingImageType === f.id
                          ? "bg-studio-accent/20 text-studio-accent border-studio-accent/40"
                          : "bg-studio-bg text-studio-muted border-studio-border hover:text-studio-text"
                      }`}
                    >
                      <Icon className="w-3 h-3" />
                      {f.label}
                    </button>
                  );
                })}
              </div>
            </div>
            {/* Actions */}
            <div className="flex gap-2 pt-1">
              <button
                onClick={handleConfirmCreateAsset}
                disabled={!pendingImageName.trim() || universalUploading}
                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-studio-accent hover:bg-studio-accentHover disabled:opacity-40 text-white text-xs rounded-lg font-medium transition-all"
              >
                {universalUploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                Create Asset
              </button>
              <button
                onClick={handleQuickImageUpload}
                disabled={universalUploading}
                className="flex items-center justify-center gap-1.5 px-3 py-2 bg-studio-panel hover:bg-studio-border disabled:opacity-40 text-studio-text text-xs rounded-lg font-medium transition-all border border-studio-border"
                title="Upload as simple image (no asset metadata)"
              >
                <Upload className="w-3.5 h-3.5" />
                Quick Upload
              </button>
              <button
                onClick={handleCancelCreateAsset}
                className="px-3 py-2 bg-studio-panel hover:bg-studio-border text-studio-muted hover:text-studio-text text-xs rounded-lg font-medium transition-all border border-studio-border"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
