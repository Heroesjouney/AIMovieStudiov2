/**
 * AI Movie Studio 2 - Global State Store (Zustand)
 * 
 * Manages assets, shots, scenes, driver selection, timeline, and UI state.
 */

import { create } from "zustand";
import type {
  AssetResponse,
  ShotResponse,
  SceneResponse,
  DriverInfo,
  TimelineClip,
  TimelineTrack,
  TimelineFormat,
  TimelineState,
} from "./api";

interface StudioState {
  // Data
  assets: AssetResponse[];
  shots: ShotResponse[];
  scenes: SceneResponse[];
  
  // Driver selection
  imageDrivers: DriverInfo[];
  videoDrivers: DriverInfo[];
  audioDrivers: DriverInfo[];
  selectedImageDriver: string;
  selectedVideoDriver: string;
  selectedAudioDriver: string;
  
  // UI state
  selectedAssetId: string | null;
  selectedShotId: string | null;
  selectedSceneId: string | null;
  activeInspector: "generate" | "shot" | "camera" | "audio" | "library";
  timelineDockOpen: boolean;
  sidebarMode: "default" | "timeline" | "camera";
  loading: boolean;

  // Timeline state
  timeline: TimelineState;
  activeAudioTrackId: string;
  audioLibraryRefreshToken: number;
  
  // Actions
  setAssets: (assets: AssetResponse[]) => void;
  setShots: (shots: ShotResponse[]) => void;
  setScenes: (scenes: SceneResponse[]) => void;
  setDrivers: (image: DriverInfo[], video: DriverInfo[], audio: DriverInfo[]) => void;
  setSelectedImageDriver: (id: string) => void;
  setSelectedVideoDriver: (id: string) => void;
  setSelectedAudioDriver: (id: string) => void;
  setSelectedAssetId: (id: string | null) => void;
  setSelectedShotId: (id: string | null) => void;
  setSelectedSceneId: (id: string | null) => void;
  setActiveInspector: (inspector: StudioState["activeInspector"]) => void;
  setTimelineDockOpen: (open: boolean) => void;
  setSidebarMode: (mode: StudioState["sidebarMode"]) => void;
  setLoading: (loading: boolean) => void;

  // Timeline actions
  setTimelineProjectId: (projectId: string) => void;
  hydrateTimeline: (timeline: TimelineState) => void;
  setTimelineFormat: (format: Partial<TimelineFormat>) => void;
  setActiveAudioTrackId: (trackId: string) => void;
  addAudioTrack: () => void;
  removeAudioTrack: (trackId: string) => void;
  addVideoTrack: () => void;
  removeVideoTrack: (trackId: string) => void;
  setAudioTrackVolume: (trackId: string, volume: number) => void;
  moveAudioClipToTrack: (clipId: string, targetTrackId: string) => void;
  addTimelineClip: (trackType: "video" | "audio", clip: Partial<TimelineClip>, trackId?: string) => void;
  removeTimelineClip: (trackType: "video" | "audio", clipId: string) => void;
  moveTimelineClip: (trackType: "video" | "audio", clipId: string, direction: "up" | "down") => void;
  updateTimelineClip: (trackType: "video" | "audio", clipId: string, patch: Partial<TimelineClip>) => void;
  removeTimelineClipsBySourceId: (sourceId: string) => void;
  unlinkClipGroup: (clipId: string) => void;
  bumpAudioLibraryRefresh: () => void;

  // Undo/Redo
  undoStack: TimelineState[];
  redoStack: TimelineState[];
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
  pushUndoSnapshot: () => void;
  splitClipAtPlayhead: (trackType: "video" | "audio", clipId: string, splitTime: number) => void;

  // Markers
  markers: { id: string; time: number; label: string; color?: string }[];
  addMarker: (time: number, label?: string, color?: string) => void;
  removeMarker: (id: string) => void;
  clearMarkers: () => void;

  // Track lock/solo/mute
  lockedTrackIds: string[];
  soloTrackIds: string[];
  mutedTrackIds: string[];
  toggleTrackLock: (trackId: string) => void;
  toggleTrackSolo: (trackId: string) => void;
  toggleTrackMute: (trackId: string) => void;

  // Ripple delete
  rippleDeleteClip: (trackType: "video" | "audio", clipId: string) => void;

  // Rename clip
  renameClip: (trackType: "video" | "audio", clipId: string, name: string) => void;
}

export const useStudioStore = create<StudioState>((set, get) => ({
  assets: [],
  shots: [],
  scenes: [],
  imageDrivers: [],
  videoDrivers: [],
  audioDrivers: [],
  selectedImageDriver: "qwen_image_edit",
  selectedVideoDriver: "minimax_h3",
  selectedAudioDriver: "fish_speech",
  selectedAssetId: null,
  selectedShotId: null,
  selectedSceneId: null,
  activeInspector: "generate",
  timelineDockOpen: false,
  sidebarMode: "default",
  loading: false,

  // Undo/Redo stacks
  undoStack: [],
  redoStack: [],

  // Markers
  markers: [],

  // Track lock/solo/mute
  lockedTrackIds: [],
  soloTrackIds: [],
  mutedTrackIds: [],

  // Timeline initial state
  timeline: {
    projectId: "default",
    fps: 24,
    format: {
      aspectRatio: "16:9",
      width: 1920,
      height: 1080,
    },
    videoTracks: [
      {
        id: "v1",
        name: "V1",
        type: "video",
        clips: [],
      },
    ],
    audioTracks: [
      {
        id: "a1",
        name: "A1",
        type: "audio",
        clips: [],
        volume: 1,
      },
    ],
  },
  activeAudioTrackId: "a1",
  audioLibraryRefreshToken: 0,

  setAssets: (assets) => set({ assets }),
  setShots: (shots) => set({ shots }),
  setScenes: (scenes) => set({ scenes }),
  setDrivers: (image, video, audio) =>
    set({ imageDrivers: image, videoDrivers: video, audioDrivers: audio }),
  setSelectedImageDriver: (id) => set({ selectedImageDriver: id }),
  setSelectedVideoDriver: (id) => set({ selectedVideoDriver: id }),
  setSelectedAudioDriver: (id) => set({ selectedAudioDriver: id }),
  setSelectedAssetId: (id) => set({ selectedAssetId: id }),
  setSelectedShotId: (id) => set({ selectedShotId: id }),
  setSelectedSceneId: (id) => set({ selectedSceneId: id }),
  setActiveInspector: (inspector) => set({ activeInspector: inspector }),
  setTimelineDockOpen: (open) => set({ timelineDockOpen: open }),
  setSidebarMode: (mode) => set({ sidebarMode: mode }),
  setLoading: (loading) => set({ loading }),

  // Timeline actions
  setTimelineProjectId: (projectId) =>
    set((state) => ({
      timeline: { ...state.timeline, projectId },
    })),

  hydrateTimeline: (tl) =>
    set(() => ({
      timeline: {
        projectId: tl.projectId,
        fps: tl.fps,
        format: {
          aspectRatio: tl.format?.aspectRatio ?? "16:9",
          width: typeof tl.format?.width === "number" ? tl.format.width : 1920,
          height: typeof tl.format?.height === "number" ? tl.format.height : 1080,
        },
        videoTracks: (tl.videoTracks ?? []).length > 0
          ? tl.videoTracks
          : [{ id: "v1", name: "V1", type: "video" as const, clips: [] }],
        audioTracks: (tl.audioTracks ?? []).length > 0
          ? (tl.audioTracks ?? []).map((t) => ({
              ...t,
              volume: typeof t.volume === "number" ? t.volume : 1,
            }))
          : [{ id: "a1", name: "A1", type: "audio" as const, clips: [], volume: 1 }],
      },
    })),

  setTimelineFormat: (format) =>
    set((state) => ({
      timeline: {
        ...state.timeline,
        format: {
          aspectRatio: format.aspectRatio ?? state.timeline.format?.aspectRatio ?? "16:9",
          width: format.width ?? state.timeline.format?.width ?? 1920,
          height: format.height ?? state.timeline.format?.height ?? 1080,
        },
      },
    })),

  setActiveAudioTrackId: (trackId) => set({ activeAudioTrackId: trackId }),

  addVideoTrack: () =>
    set((state) => {
      const nextIndex =
        state.timeline.videoTracks.reduce((max, t) => {
          const m = /^v(\d+)$/.exec(t.id);
          const n = m ? Number(m[1]) : 0;
          return Number.isFinite(n) ? Math.max(max, n) : max;
        }, 0) + 1;
      const id = `v${nextIndex}`;
      const nextTrack: TimelineTrack = {
        id,
        name: `V${nextIndex}`,
        type: "video",
        clips: [],
      };
      return {
        timeline: {
          ...state.timeline,
          videoTracks: [...state.timeline.videoTracks, nextTrack],
        },
      };
    }),

  removeVideoTrack: (trackId) =>
    set((state) => {
      if (state.timeline.videoTracks.length <= 1) return state;
      const nextTracks = state.timeline.videoTracks.filter((t) => t.id !== trackId);
      if (nextTracks.length <= 0) return state;
      const renumbered = nextTracks.map((t, i) => ({
        ...t,
        id: `v${i + 1}`,
        name: `V${i + 1}`,
      }));
      return {
        timeline: { ...state.timeline, videoTracks: renumbered },
      };
    }),

  addAudioTrack: () =>
    set((state) => {
      const nextIndex =
        state.timeline.audioTracks.reduce((max, t) => {
          const m = /^a(\d+)$/.exec(t.id);
          const n = m ? Number(m[1]) : 0;
          return Number.isFinite(n) ? Math.max(max, n) : max;
        }, 0) + 1;
      const id = `a${nextIndex}`;
      const nextTrack: TimelineTrack = {
        id,
        name: `A${nextIndex}`,
        type: "audio",
        clips: [],
        volume: 1,
      };
      return {
        timeline: {
          ...state.timeline,
          audioTracks: [...state.timeline.audioTracks, nextTrack],
        },
        activeAudioTrackId: id,
      };
    }),

  removeAudioTrack: (trackId) =>
    set((state) => {
      if (state.timeline.audioTracks.length <= 1) return state;
      const nextTracks = state.timeline.audioTracks.filter((t) => t.id !== trackId);
      if (nextTracks.length <= 0) return state;

      const idMap = new Map<string, string>();
      const renumbered = nextTracks.map((t, i) => {
        const newId = `a${i + 1}`;
        idMap.set(t.id, newId);
        return { ...t, id: newId, name: `A${i + 1}` };
      });

      let nextActive: string;
      if (state.activeAudioTrackId === trackId) {
        nextActive = renumbered[0].id;
      } else {
        nextActive = idMap.get(state.activeAudioTrackId) ?? renumbered[0].id;
      }
      return {
        timeline: { ...state.timeline, audioTracks: renumbered },
        activeAudioTrackId: nextActive,
      };
    }),

  setAudioTrackVolume: (trackId, volume) =>
    set((state) => {
      const v = Math.max(0, Math.min(1, Number.isFinite(volume) ? volume : 1));
      return {
        timeline: {
          ...state.timeline,
          audioTracks: state.timeline.audioTracks.map((t) =>
            t.id === trackId ? { ...t, volume: v } : t
          ),
        },
      };
    }),

  moveAudioClipToTrack: (clipId, targetTrackId) =>
    set((state) => {
      const tracks = state.timeline.audioTracks;
      if (!tracks.length) return state;
      if (!tracks.some((t) => t.id === targetTrackId)) return state;

      let moving: TimelineClip | null = null;
      const nextTracks = tracks.map((t) => {
        const has = t.clips.some((c) => c.id === clipId);
        if (!has) return t;
        const keep = t.clips.filter((c) => c.id !== clipId);
        moving = t.clips.find((c) => c.id === clipId) ?? null;
        return { ...t, clips: keep };
      });

      if (!moving) return state;
      if (nextTracks.find((t) => t.id === targetTrackId)?.clips.some((c) => c.id === clipId)) {
        return state;
      }

      const finalTracks = nextTracks.map((t) =>
        t.id === targetTrackId ? { ...t, clips: [...t.clips, moving as TimelineClip] } : t
      );

      return {
        timeline: { ...state.timeline, audioTracks: finalTracks },
        activeAudioTrackId: targetTrackId,
      };
    }),

  addTimelineClip: (trackType, clip, trackId) =>
    set((state) => {
      const id = `${trackType}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
      const targetAudioTrackId = trackId || state.activeAudioTrackId || state.timeline.audioTracks[0]?.id;
      
      let videoTracks = state.timeline.videoTracks;
      if (trackType === "video" && (!videoTracks || videoTracks.length === 0)) {
        videoTracks = [{ id: "v1", name: "V1", type: "video" as const, clips: [] }];
      }
      
      let audioTracks = state.timeline.audioTracks;
      if (trackType === "audio" && (!audioTracks || audioTracks.length === 0)) {
        audioTracks = [{ id: "a1", name: "A1", type: "audio" as const, clips: [], volume: 1 }];
      }
      
      const existingClips = trackType === "video"
        ? videoTracks[0]?.clips ?? []
        : (audioTracks.find((t) => t.id === targetAudioTrackId)?.clips ?? []);
      const lastClipEnd = existingClips.reduce((max, c) => {
        const duration = typeof c.trimOutSeconds === "number" && c.trimOutSeconds > (c.trimInSeconds ?? 0)
          ? c.trimOutSeconds - (c.trimInSeconds ?? 0)
          : typeof c.mediaDurationSeconds === "number" && c.mediaDurationSeconds > 0
            ? c.mediaDurationSeconds
            : 5;
        return Math.max(max, c.startTime + duration);
      }, 0);
      
      const nextClip: TimelineClip = {
        id,
        sourceType: clip.sourceType ?? "unknown",
        sourceId: clip.sourceId ?? "",
        name: clip.name ?? "Untitled",
        sourceUrl: clip.sourceUrl ?? "",
        trimInSeconds: typeof clip.trimInSeconds === "number" ? clip.trimInSeconds : 0,
        trimOutSeconds: typeof clip.trimOutSeconds === "number" ? clip.trimOutSeconds : null,
        startTime: typeof clip.startTime === "number" ? clip.startTime : lastClipEnd,
        mediaDurationSeconds: typeof clip.mediaDurationSeconds === "number" ? clip.mediaDurationSeconds : null,
        groupId: typeof clip.groupId === "string" ? clip.groupId : null,
      };

      if (trackType === "video") {
        const tracks = videoTracks;
        const first = tracks[0];
        const updatedFirst: TimelineTrack = { ...first, clips: [...first.clips, nextClip] };
        return {
          timeline: { ...state.timeline, videoTracks: [updatedFirst, ...tracks.slice(1)] },
        };
      }

      const tracks = audioTracks;
      const targetId = targetAudioTrackId || tracks[0]?.id;
      const updatedTracks = tracks.map((t) =>
        t.id === targetId ? { ...t, clips: [...t.clips, nextClip] } : t
      );
      return {
        timeline: { ...state.timeline, audioTracks: updatedTracks },
      };
    }),

  removeTimelineClip: (trackType, clipId) =>
    set((state) => {
      if (trackType === "video") {
        return {
          timeline: {
            ...state.timeline,
            videoTracks: state.timeline.videoTracks.map((t) => ({
              ...t,
              clips: t.clips.filter((c) => c.id !== clipId),
            })),
          },
        };
      }
      return {
        timeline: {
          ...state.timeline,
          audioTracks: state.timeline.audioTracks.map((t) => ({
            ...t,
            clips: t.clips.filter((c) => c.id !== clipId),
          })),
        },
      };
    }),

  moveTimelineClip: (trackType, clipId, direction) =>
    set((state) => {
      const tracks = trackType === "video" ? state.timeline.videoTracks : state.timeline.audioTracks;
      const track = tracks[0];
      const idx = track.clips.findIndex((c) => c.id === clipId);
      if (idx === -1) return state;

      const targetIdx = direction === "up" ? idx - 1 : idx + 1;
      if (targetIdx < 0 || targetIdx >= track.clips.length) return state;

      const nextClips = [...track.clips];
      const [moved] = nextClips.splice(idx, 1);
      nextClips.splice(targetIdx, 0, moved);

      const updatedFirst: TimelineTrack = { ...track, clips: nextClips };

      if (trackType === "video") {
        return {
          timeline: { ...state.timeline, videoTracks: [updatedFirst, ...tracks.slice(1)] },
        };
      }
      return {
        timeline: { ...state.timeline, audioTracks: [updatedFirst, ...tracks.slice(1)] },
      };
    }),

  updateTimelineClip: (trackType, clipId, patch) =>
    set((state) => {
      const linkPatch: Partial<TimelineClip> = {};
      if (typeof patch.startTime === "number") linkPatch.startTime = patch.startTime;
      if (typeof patch.trimInSeconds === "number") linkPatch.trimInSeconds = patch.trimInSeconds;
      if (typeof patch.trimOutSeconds === "number" || patch.trimOutSeconds === null) {
        linkPatch.trimOutSeconds = patch.trimOutSeconds as any;
      }

      const findGroupId = (): string | null => {
        for (const t of state.timeline.videoTracks) {
          const c = t.clips.find((x) => x.id === clipId);
          if (c) return typeof c.groupId === "string" ? c.groupId : null;
        }
        for (const t of state.timeline.audioTracks) {
          const c = t.clips.find((x) => x.id === clipId);
          if (c) return typeof c.groupId === "string" ? c.groupId : null;
        }
        return null;
      };

      const groupId = findGroupId();

      if (trackType === "video") {
        return {
          timeline: {
            ...state.timeline,
            videoTracks: state.timeline.videoTracks.map((t) => ({
              ...t,
              clips: t.clips.map((c) => {
                if (c.id === clipId) return { ...c, ...patch };
                if (groupId && c.groupId === groupId && Object.keys(linkPatch).length) {
                  return { ...c, ...linkPatch };
                }
                return c;
              }),
            })),
            audioTracks:
              groupId && Object.keys(linkPatch).length
                ? state.timeline.audioTracks.map((t) => ({
                    ...t,
                    clips: t.clips.map((c) =>
                      c.groupId === groupId ? { ...c, ...linkPatch } : c
                    ),
                  }))
                : state.timeline.audioTracks,
          },
        };
      }
      return {
        timeline: {
          ...state.timeline,
          audioTracks: state.timeline.audioTracks.map((t) => ({
            ...t,
            clips: t.clips.map((c) => {
              if (c.id === clipId) return { ...c, ...patch };
              if (groupId && c.groupId === groupId && Object.keys(linkPatch).length) {
                return { ...c, ...linkPatch };
              }
              return c;
            }),
          })),
          videoTracks:
            groupId && Object.keys(linkPatch).length
              ? state.timeline.videoTracks.map((t) => ({
                  ...t,
                  clips: t.clips.map((c) =>
                    c.groupId === groupId ? { ...c, ...linkPatch } : c
                  ),
                }))
              : state.timeline.videoTracks,
        },
      };
    }),

  removeTimelineClipsBySourceId: (sourceId) =>
    set((state) => {
      if (!sourceId) return state;
      return {
        timeline: {
          ...state.timeline,
          videoTracks: state.timeline.videoTracks.map((t) => ({
            ...t,
            clips: t.clips.filter((c) => c.sourceId !== sourceId),
          })),
          audioTracks: state.timeline.audioTracks.map((t) => ({
            ...t,
            clips: t.clips.filter((c) => c.sourceId !== sourceId),
          })),
        },
      };
    }),

  unlinkClipGroup: (clipId) =>
    set((state) => {
      let groupId: string | null = null;
      for (const t of state.timeline.videoTracks) {
        const c = t.clips.find((x) => x.id === clipId);
        if (c?.groupId) {
          groupId = c.groupId;
          break;
        }
      }
      if (!groupId) {
        for (const t of state.timeline.audioTracks) {
          const c = t.clips.find((x) => x.id === clipId);
          if (c?.groupId) {
            groupId = c.groupId;
            break;
          }
        }
      }
      if (!groupId) return state;

      return {
        timeline: {
          ...state.timeline,
          videoTracks: state.timeline.videoTracks.map((t) => ({
            ...t,
            clips: t.clips.map((c) => (c.groupId === groupId ? { ...c, groupId: null } : c)),
          })),
          audioTracks: state.timeline.audioTracks.map((t) => ({
            ...t,
            clips: t.clips.map((c) => (c.groupId === groupId ? { ...c, groupId: null } : c)),
          })),
        },
      };
    }),

  bumpAudioLibraryRefresh: () =>
    set((state) => ({ audioLibraryRefreshToken: state.audioLibraryRefreshToken + 1 })),

  // --- Undo/Redo ---
  undo: () => {
    const { undoStack, redoStack, timeline } = get();
    if (undoStack.length === 0) return;
    const prev = undoStack[undoStack.length - 1];
    set({
      timeline: prev,
      undoStack: undoStack.slice(0, -1),
      redoStack: [...redoStack, timeline],
    });
  },

  redo: () => {
    const { undoStack, redoStack, timeline } = get();
    if (redoStack.length === 0) return;
    const next = redoStack[redoStack.length - 1];
    set({
      timeline: next,
      redoStack: redoStack.slice(0, -1),
      undoStack: [...undoStack, timeline],
    });
  },

  canUndo: () => get().undoStack.length > 0,
  canRedo: () => get().redoStack.length > 0,

  pushUndoSnapshot: () => {
    const { timeline, undoStack } = get();
    set({ undoStack: [...undoStack, timeline].slice(-50), redoStack: [] });
  },

  splitClipAtPlayhead: (trackType, clipId, splitTime) =>
    set((state) => {
      // Push undo snapshot
      const undoStack = [...state.undoStack, state.timeline].slice(-50);

      const splitClip = (clip: TimelineClip): [TimelineClip, TimelineClip] | null => {
        if (clip.id !== clipId) return null;
        const clipStart = clip.startTime;
        const clipEnd = clip.startTime + (
          typeof clip.trimOutSeconds === "number" && typeof clip.trimInSeconds === "number"
            ? clip.trimOutSeconds - clip.trimInSeconds
            : 5
        );
        if (splitTime <= clipStart || splitTime >= clipEnd) return null;
        const offset = splitTime - clipStart;
        const firstDuration = offset;
        const secondDuration = (clipEnd - clipStart) - offset;
        const firstTrimOut = (clip.trimInSeconds ?? 0) + firstDuration;
        const secondTrimIn = (clip.trimInSeconds ?? 0) + firstDuration;
        const newId = `${trackType}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
        return [
          { ...clip, trimOutSeconds: firstTrimOut, groupId: null },
          { ...clip, id: newId, startTime: splitTime, trimInSeconds: secondTrimIn, trimOutSeconds: secondTrimIn + secondDuration, groupId: null },
        ];
      };

      if (trackType === "video") {
        const videoTracks = state.timeline.videoTracks.map((t) => {
          const clips: TimelineClip[] = [];
          for (const c of t.clips) {
            const result = splitClip(c);
            if (result) clips.push(...result);
            else clips.push(c);
          }
          return { ...t, clips };
        });
        return { timeline: { ...state.timeline, videoTracks }, undoStack, redoStack: [] };
      }

      const audioTracks = state.timeline.audioTracks.map((t) => {
        const clips: TimelineClip[] = [];
        for (const c of t.clips) {
          const result = splitClip(c);
          if (result) clips.push(...result);
          else clips.push(c);
        }
        return { ...t, clips };
      });
      return { timeline: { ...state.timeline, audioTracks }, undoStack, redoStack: [] };
    }),

  // --- Markers ---
  addMarker: (time, label, color) =>
    set((state) => ({
      markers: [
        ...state.markers,
        {
          id: `marker_${Date.now()}_${Math.random().toString(16).slice(2)}`,
          time,
          label: label || `Marker ${state.markers.length + 1}`,
          color: color || "#f59e0b",
        },
      ],
    })),

  removeMarker: (id) =>
    set((state) => ({
      markers: state.markers.filter((m) => m.id !== id),
    })),

  clearMarkers: () => set({ markers: [] }),

  toggleTrackLock: (trackId) =>
    set((state) => ({
      lockedTrackIds: state.lockedTrackIds.includes(trackId)
        ? state.lockedTrackIds.filter((id) => id !== trackId)
        : [...state.lockedTrackIds, trackId],
    })),

  toggleTrackSolo: (trackId) =>
    set((state) => ({
      soloTrackIds: state.soloTrackIds.includes(trackId)
        ? state.soloTrackIds.filter((id) => id !== trackId)
        : [...state.soloTrackIds, trackId],
    })),

  toggleTrackMute: (trackId) =>
    set((state) => ({
      mutedTrackIds: state.mutedTrackIds.includes(trackId)
        ? state.mutedTrackIds.filter((id) => id !== trackId)
        : [...state.mutedTrackIds, trackId],
    })),

  rippleDeleteClip: (trackType, clipId) =>
    set((state) => {
      if (trackType === "video") {
        const track = state.timeline.videoTracks[0];
        if (!track) return state;
        const idx = track.clips.findIndex((c) => c.id === clipId);
        if (idx === -1) return state;
        const removed = track.clips[idx];
        const removedDuration =
          typeof removed.trimOutSeconds === "number" && removed.trimOutSeconds > (removed.trimInSeconds ?? 0)
            ? removed.trimOutSeconds - (removed.trimInSeconds ?? 0)
            : typeof removed.mediaDurationSeconds === "number" && removed.mediaDurationSeconds > 0
              ? removed.mediaDurationSeconds
              : 5;
        const nextClips = track.clips
          .filter((c) => c.id !== clipId)
          .map((c) => {
            if (c.startTime >= removed.startTime + removedDuration) {
              return { ...c, startTime: c.startTime - removedDuration };
            }
            return c;
          });
        return {
          timeline: {
            ...state.timeline,
            videoTracks: [{ ...track, clips: nextClips }, ...state.timeline.videoTracks.slice(1)],
          },
        };
      }
      // audio: ripple delete from the track that has the clip
      const trackIdx = state.timeline.audioTracks.findIndex((t) => t.clips.some((c) => c.id === clipId));
      if (trackIdx === -1) return state;
      const track = state.timeline.audioTracks[trackIdx];
      const idx = track.clips.findIndex((c) => c.id === clipId);
      if (idx === -1) return state;
      const removed = track.clips[idx];
      const removedDuration =
        typeof removed.trimOutSeconds === "number" && removed.trimOutSeconds > (removed.trimInSeconds ?? 0)
          ? removed.trimOutSeconds - (removed.trimInSeconds ?? 0)
          : typeof removed.mediaDurationSeconds === "number" && removed.mediaDurationSeconds > 0
            ? removed.mediaDurationSeconds
            : 5;
      const nextClips = track.clips
        .filter((c) => c.id !== clipId)
        .map((c) => {
          if (c.startTime >= removed.startTime + removedDuration) {
            return { ...c, startTime: c.startTime - removedDuration };
          }
          return c;
        });
      const nextAudioTracks = [...state.timeline.audioTracks];
      nextAudioTracks[trackIdx] = { ...track, clips: nextClips };
      return {
        timeline: { ...state.timeline, audioTracks: nextAudioTracks },
      };
    }),

  renameClip: (trackType, clipId, name) =>
    set((state) => {
      if (trackType === "video") {
        return {
          timeline: {
            ...state.timeline,
            videoTracks: state.timeline.videoTracks.map((t) => ({
              ...t,
              clips: t.clips.map((c) => (c.id === clipId ? { ...c, name } : c)),
            })),
          },
        };
      }
      return {
        timeline: {
          ...state.timeline,
          audioTracks: state.timeline.audioTracks.map((t) => ({
            ...t,
            clips: t.clips.map((c) => (c.id === clipId ? { ...c, name } : c)),
          })),
        },
      };
    }),
}));
