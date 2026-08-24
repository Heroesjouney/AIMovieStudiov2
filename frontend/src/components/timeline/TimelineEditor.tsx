"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useStudioStore } from "@/lib/store";
import {
  getTimeline, saveTimeline,
  startTimelineRender, getTimelineRenderStatus, listTimelineRenders,
  type TimelineRenderJob,
  uploadVideoAsset, getVideoAssetUrl,
  uploadAudioReference, getAudioUrl,
} from "@/lib/api";
import {
  Film,
  Pause,
  Play,
  Trash2,
  Plus,
  Volume2,
  RectangleHorizontal,
  RectangleVertical,
  Square,
  Blend,
  Moon,
  Sun,
  ArrowLeft,
  ArrowRight,
  Clapperboard,
  Loader2,
  Download,
  Scissors,
  Undo2,
  Redo2,
  Magnet,
  Keyboard as KeyboardIcon,
  Maximize2,
  Copy,
  ClipboardPaste,
  Lock,
  Headphones,
  VolumeX,
  Pencil,
} from "lucide-react";
import type { TransitionType, TimelineClip } from "@/lib/api";
import { WaveformDisplay, ThumbnailStrip } from "./ClipVisuals";

interface TimelineEditorProps {
  projectId?: string;
}

export function TimelineEditor({ projectId = "default" }: TimelineEditorProps) {
  const {
    timeline,
    setTimelineFormat,
    activeAudioTrackId,
    setActiveAudioTrackId,
    addAudioTrack,
    removeAudioTrack,
    setAudioTrackVolume,
    moveAudioClipToTrack,
    unlinkClipGroup,
    removeTimelineClip,
    moveTimelineClip,
    updateTimelineClip,
    addTimelineClip,
    setTimelineProjectId,
    hydrateTimeline,
    undo, redo, pushUndoSnapshot, splitClipAtPlayhead,
    undoStack, redoStack,
    markers, addMarker, removeMarker,
    rippleDeleteClip, renameClip,
    lockedTrackIds, soloTrackIds, mutedTrackIds,
    toggleTrackLock, toggleTrackSolo, toggleTrackMute,
  } = useStudioStore();

  const TIMELINE_FORMATS = [
    { id: "16:9_1920x1080", label: "16:9", aspectRatio: "16:9", width: 1920, height: 1080 },
    { id: "9:16_1080x1920", label: "9:16", aspectRatio: "9:16", width: 1080, height: 1920 },
    { id: "1:1_1080x1080", label: "1:1", aspectRatio: "1:1", width: 1080, height: 1080 },
    { id: "4:3_1440x1080", label: "4:3", aspectRatio: "4:3", width: 1440, height: 1080 },
    { id: "2.39:1_1920x804", label: "2.39:1", aspectRatio: "2.39:1", width: 1920, height: 804 },
  ];

  const selectedTimelineFormat = useMemo(() => {
    const w = timeline.format?.width ?? 1920;
    const h = timeline.format?.height ?? 1080;
    return TIMELINE_FORMATS.find((f) => f.width === w && f.height === h) ?? TIMELINE_FORMATS[0];
  }, [TIMELINE_FORMATS, timeline.format?.height, timeline.format?.width]);

  const SelectedFormatIcon = useMemo(() => {
    const w = selectedTimelineFormat.width;
    const h = selectedTimelineFormat.height;
    if (w === h) return Square;
    if (w > h) return RectangleHorizontal;
    return RectangleVertical;
  }, [selectedTimelineFormat.height, selectedTimelineFormat.width]);

  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [selectedTransitionKey, setSelectedTransitionKey] = useState<string | null>(null);
  const [playheadSeconds, setPlayheadSeconds] = useState(0);
  const [pxPerSecond, setPxPerSecond] = useState(30);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [draggingClip, setDraggingClip] = useState<{ type: "video" | "audio"; clipId: string } | null>(null);
  const [dragHoverIndex, setDragHoverIndex] = useState<number | null>(null);
  const [dragHoverAudioTrackId, setDragHoverAudioTrackId] = useState<string | null>(null);
  const [previewMode, setPreviewMode] = useState<"video" | "image">("video");
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);
  const [playbackError, setPlaybackError] = useState<string | null>(null);
  const [formatFlash, setFormatFlash] = useState(false);
  const formatFlashTimerRef = useRef<number | null>(null);
  const [draggingTransition, setDraggingTransition] = useState<{
    type: TransitionType;
    label: string;
  } | null>(null);
  const [transitionDropTarget, setTransitionDropTarget] = useState<string | null>(null); // clipId where transition will be dropped

  // Snap-to-grid
  const [snapEnabled, setSnapEnabled] = useState(true);
  const snapThresholdSeconds = 0.25; // snap within 0.25s

  // Copy/paste
  const [clipboardClip, setClipboardClip] = useState<TimelineClip | null>(null);

  // Fullscreen preview
  const [fullscreenPreview, setFullscreenPreview] = useState(false);

  // Shortcuts panel
  const [showShortcutsPanel, setShowShortcutsPanel] = useState(false);

  // Transitions dropdown
  const [showTransitionsMenu, setShowTransitionsMenu] = useState(false);

  // Right-click context menu
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; clipId: string; trackType: "video" | "audio" } | null>(null);

  // Clip rename (inline edit)
  const [renamingClipId, setRenamingClipId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  // Marquee selection
  const [marquee, setMarquee] = useState<{ startX: number; startY: number; endX: number; endY: number } | null>(null);
  const [selectedClipIds, setSelectedClipIds] = useState<string[]>([]);

  // Playhead center mode
  const [playheadCenter, setPlayheadCenter] = useState(false);

  // Export presets
  const [exportPreset, setExportPreset] = useState<"source" | "720p" | "1080p" | "4k">("source");

  // Fade handle dragging
  const [draggingFade, setDraggingFade] = useState<{ clipId: string; type: "in" | "out"; startX: number; startVal: number } | null>(null);

  // Clip properties panel
  const [showPropertiesPanel, setShowPropertiesPanel] = useState(false);

  // Auto-save indicator
  const [autoSaveState, setAutoSaveState] = useState<"idle" | "saving" | "saved">("idle");

  // Render state
  const [renderStatus, setRenderStatus] = useState<"idle" | "pending" | "processing" | "completed" | "failed">("idle");
  const [renderResultUrl, setRenderResultUrl] = useState<string | null>(null);
  const [renderError, setRenderError] = useState<string | null>(null);
  const renderPollRef = useRef<number | null>(null);

  const [trimmingClip, setTrimmingClip] = useState<
    | {
        type: "video" | "audio";
        clipId: string;
        edge: "in" | "out";
        startClientX: number;
        baseTrimIn: number;
        baseTrimOut: number | null;
      }
    | null
  >(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const audioRefs = useRef<Record<string, HTMLAudioElement | null>>({});
  const dissolveNextVideoRef = useRef<HTMLVideoElement | null>(null);
  const dissolvePrevVideoRef = useRef<HTMLVideoElement | null>(null);
  const dissolveNextAudioRef = useRef<HTMLAudioElement | null>(null);
  const dissolvePrevAudioRef = useRef<HTMLAudioElement | null>(null);
  const [isDissolveNextReady, setIsDissolveNextReady] = useState(false);
  const [isDissolvePrevReady, setIsDissolvePrevReady] = useState(false);
  const [isDissolveCompositing, setIsDissolveCompositing] = useState(false);
  const playingAudioClipIdByTrackRef = useRef<Record<string, string | null>>({});
  const timelineCanvasRef = useRef<HTMLDivElement | null>(null);
  const timelineScrollRef = useRef<HTMLDivElement | null>(null);
  const hasLoadedTimelineRef = useRef(false);
  const saveTimerRef = useRef<number | null>(null);
  const imagePlaybackTimerRef = useRef<number | null>(null);
  const dragLastClientXRef = useRef<number | null>(null);
  const dragLastClientYRef = useRef<number | null>(null);
  const dragHoverIndexRef = useRef<number | null>(null);
  const [isPlayingSequence, setIsPlayingSequence] = useState(false);
  const [playingIndex, setPlayingIndex] = useState<number | null>(null);
  const [playingAudioIndex, setPlayingAudioIndex] = useState<number | null>(null);
  const playingAudioIndexRef = useRef<number | null>(null);

  useEffect(() => {
    setFormatFlash(true);
    if (formatFlashTimerRef.current) {
      window.clearTimeout(formatFlashTimerRef.current);
      formatFlashTimerRef.current = null;
    }
    formatFlashTimerRef.current = window.setTimeout(() => {
      setFormatFlash(false);
      formatFlashTimerRef.current = null;
    }, 650);
    return () => {
      if (formatFlashTimerRef.current) {
        window.clearTimeout(formatFlashTimerRef.current);
        formatFlashTimerRef.current = null;
      }
    };
  }, [timeline.format?.height, timeline.format?.width]);

  useEffect(() => {
    setTimelineProjectId(projectId);
  }, [projectId, setTimelineProjectId]);

  useEffect(() => {
    let cancelled = false;
    hasLoadedTimelineRef.current = false;
    const run = async () => {
      try {
        const loaded = await getTimeline(projectId);
        if (cancelled) return;
        hydrateTimeline(loaded as any);
        hasLoadedTimelineRef.current = true;
      } catch (e) {
        console.error(e);
        hasLoadedTimelineRef.current = true;
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [hydrateTimeline, projectId]);

  useEffect(() => {
    if (!hasLoadedTimelineRef.current) return;
    if (timeline.projectId !== projectId) return;

    if (saveTimerRef.current) {
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }

    setAutoSaveState("saving");
    saveTimerRef.current = window.setTimeout(() => {
      void saveTimeline(projectId, timeline as any).then(() => {
        setAutoSaveState("saved");
        window.setTimeout(() => setAutoSaveState("idle"), 1500);
      }).catch((e) => {
        console.error(e);
        setAutoSaveState("idle");
      });
    }, 600);

    return () => {
      if (saveTimerRef.current) {
        window.clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
    };
  }, [projectId, timeline]);

  // --- Render to MP4 ---

  const handleRender = useCallback(async () => {
    setRenderStatus("pending");
    setRenderError(null);
    setRenderResultUrl(null);
    try {
      // Save timeline first
      await saveTimeline(projectId, timeline as any);
      const job = await startTimelineRender(projectId, exportPreset);
      setRenderStatus(job.status as any);

      // Poll for status
      if (renderPollRef.current) window.clearInterval(renderPollRef.current);
      let renderPollErrors = 0;
      renderPollRef.current = window.setInterval(async () => {
        try {
          const status = await getTimelineRenderStatus(projectId, job.job_id);
          renderPollErrors = 0;
          setRenderStatus(status.status as any);
          if (status.status === "completed") {
            setRenderResultUrl(status.video_url);
            if (renderPollRef.current) {
              window.clearInterval(renderPollRef.current);
              renderPollRef.current = null;
            }
          } else if (status.status === "failed") {
            setRenderError(status.error_message || "Render failed");
            if (renderPollRef.current) {
              window.clearInterval(renderPollRef.current);
              renderPollRef.current = null;
            }
          }
        } catch (pollErr) {
          renderPollErrors++;
          if (renderPollErrors >= 5) {
            setRenderStatus("failed");
            setRenderError("Lost connection to backend while polling render status.");
            if (renderPollRef.current) {
              window.clearInterval(renderPollRef.current);
              renderPollRef.current = null;
            }
          }
        }
      }, 2000);
    } catch (err) {
      setRenderStatus("failed");
      setRenderError(err instanceof Error ? err.message : "Failed to start render");
    }
  }, [projectId, timeline, exportPreset]);

  useEffect(() => {
    return () => {
      if (renderPollRef.current) {
        window.clearInterval(renderPollRef.current);
        renderPollRef.current = null;
      }
    };
  }, []);

  const v1 = timeline.videoTracks[0];
  const audioTracks = timeline.audioTracks;
  const a1 =
    audioTracks.find((t) => t.id === activeAudioTrackId) ||
    audioTracks[0];

  const trackLabelWidth = 72;
  const timelinePaddingX = 16;
  const defaultClipSeconds = 5;
  const defaultTransitionSeconds = 0.8;

  const videoLayout = useMemo(() => {
    const clips = v1?.clips ?? [];
    return clips.map((c) => {
      const speed = c.speed || 1;
      const rawDuration =
        typeof c.trimOutSeconds === "number" && c.trimOutSeconds > c.trimInSeconds
          ? c.trimOutSeconds - c.trimInSeconds
          : typeof c.mediaDurationSeconds === "number" && c.mediaDurationSeconds > 0
            ? c.mediaDurationSeconds
            : defaultClipSeconds;
      const duration = rawDuration / speed;
      // Use startTime for free positioning (default to 0 for legacy clips)
      const start = typeof c.startTime === "number" ? c.startTime : 0;
      const end = start + duration;
      return { id: c.id, start, end, duration };
    });
  }, [v1?.clips]);

  // Compute transition overlay opacity for preview
  const transitionOverlay = useMemo(() => {
    if (!v1?.clips.length) return null;
    const layout = videoLayout.find((l) => playheadSeconds >= l.start && playheadSeconds < l.end);
    if (!layout) return null;
    const clip = v1.clips.find((c) => c.id === layout.id);
    if (!clip) return null;

    const timeInClip = playheadSeconds - layout.start;
    const clipDuration = layout.duration;

    // Check transition in (fade from black/white at start)
    if (
      clip.transitionIn &&
      (clip.transitionIn.type === "fade_black" || clip.transitionIn.type === "fade_white") &&
      timeInClip < clip.transitionIn.durationSeconds
    ) {
      const progress = timeInClip / clip.transitionIn.durationSeconds;
      const opacity = 1 - progress;
      const color = clip.transitionIn.type === "fade_white" ? "white" : "black";
      return { color, opacity };
    }

    // Check transition out (fade to black/white at end)
    if (clip.transitionOut && (clip.transitionOut.type === "fade_black" || clip.transitionOut.type === "fade_white")) {
      const timeFromEnd = clipDuration - timeInClip;
      if (timeFromEnd < clip.transitionOut.durationSeconds) {
        const progress = timeFromEnd / clip.transitionOut.durationSeconds;
        const opacity = 1 - progress;
        const color = clip.transitionOut.type === "fade_white" ? "white" : "black";
        return { color, opacity };
      }
    }

    return null;
  }, [playheadSeconds, v1?.clips, videoLayout]);

  // Cross-dissolve preview overlay: renders a second video element and crossfades it
  const dissolveOverlay = useMemo(() => {
    if (!v1?.clips.length) return null;
    const layout = videoLayout.find((l) => playheadSeconds >= l.start && playheadSeconds < l.end);
    if (!layout) return null;
    const clip = v1.clips.find((c) => c.id === layout.id);
    if (!clip) return null;

    const idx = videoLayout.findIndex((vl) => vl.id === clip.id);
    const timeInClip = playheadSeconds - layout.start;
    const clipDuration = layout.duration;

    const smoothstep01 = (x: number) => {
      const t = Math.max(0, Math.min(1, x));
      return t * t * (3 - 2 * t);
    };

    const preloadMarginSeconds = 0.6;

    // Identify a dissolve junction (prev -> next) regardless of which side the playhead is on.
    const findJunction = (): {
      prevClip: any;
      nextClip: any;
      prevLayout: { id: string; start: number; end: number; duration: number };
      nextLayout: { id: string; start: number; end: number; duration: number };
    } | null => {
      // If current clip has dissolve out and next has dissolve in
      if (clip.transitionOut?.type === "dissolve" && idx >= 0 && idx < videoLayout.length - 1) {
        const nextLayout = videoLayout[idx + 1];
        const nextClip = v1.clips.find((c) => c.id === nextLayout.id);
        if (nextClip?.transitionIn?.type === "dissolve") {
          return { prevClip: clip, nextClip, prevLayout: layout, nextLayout };
        }
      }

      // If current clip has dissolve in and previous has dissolve out
      if (clip.transitionIn?.type === "dissolve" && idx > 0) {
        const prevLayout = videoLayout[idx - 1];
        const prevClip = v1.clips.find((c) => c.id === prevLayout.id);
        if (prevClip?.transitionOut?.type === "dissolve") {
          return { prevClip, nextClip: clip, prevLayout, nextLayout: layout };
        }
      }

      return null;
    };

    const j = findJunction();
    if (!j?.prevClip?.sourceUrl || !j?.nextClip?.sourceUrl) return null;

    const prevDur = j.prevLayout.duration;
    const nextDur = j.nextLayout.duration;
    const outDur = Math.max(0.1, Math.min(j.prevClip.transitionOut?.durationSeconds ?? 0, prevDur));
    const inDur = Math.max(0.1, Math.min(j.nextClip.transitionIn?.durationSeconds ?? 0, nextDur));
    const total = Math.max(0.001, outDur + inDur);

    // Keep compositing active briefly after the dissolve window ends.
    // This prevents a 1-frame flash when the base video swaps sources at the cut.
    const postHoldSeconds = 0.12;

    const cutTime = j.prevLayout.end;
    const tRel = playheadSeconds - cutTime;

    // Only return overlay info within a small window around the dissolve to enable preloading.
    if (tRel < -outDur - preloadMarginSeconds) return null;
    if (tRel > inDur + postHoldSeconds + preloadMarginSeconds) return null;

    const mixInput = (tRel + outDur) / total;
    const mix = smoothstep01(mixInput);
    const prevOpacity = 1 - mix;
    const nextOpacity = mix;

    const prevTrimIn = typeof j.prevClip.trimInSeconds === "number" ? j.prevClip.trimInSeconds : 0;
    const nextTrimIn = typeof j.nextClip.trimInSeconds === "number" ? j.nextClip.trimInSeconds : 0;

    const prevGroupId = typeof j.prevClip.groupId === "string" ? (j.prevClip.groupId as string) : null;
    const nextGroupId = typeof j.nextClip.groupId === "string" ? (j.nextClip.groupId as string) : null;

    const findLinkedAudioSrcAndTrimIn = (groupId: string | null, fallbackSrc: string, fallbackTrimIn: number) => {
      if (!groupId) return { src: fallbackSrc, trimIn: fallbackTrimIn };
      for (const t of audioTracks) {
        const ac = t.clips.find((c) => c?.groupId === groupId && typeof c?.sourceUrl === "string" && c.sourceUrl.length > 0);
        if (ac) {
          return {
            src: ac.sourceUrl as string,
            trimIn: typeof ac.trimInSeconds === "number" ? ac.trimInSeconds : 0,
          };
        }
      }
      return { src: fallbackSrc, trimIn: fallbackTrimIn };
    };

    // Time mapping for an overlap-based dissolve:
    // - before the cut, we show the head of the next clip "early" (as if it started outDur earlier)
    // - after the cut, we continue from that point.
    // This makes the dissolve continuous and matches what an NLE does with media handles.
    const prevWindowStart = Math.max(0, prevDur - outDur);
    const tOverlap = tRel + outDur; // continues past the dissolve for postHoldSeconds
    const prevTimeIn = Math.max(0, Math.min(prevDur - 0.01, prevWindowStart + tOverlap));
    const nextTimeIn = Math.max(0, Math.min(nextDur - 0.01, tOverlap));

    const active = tRel >= -outDur && tRel <= inDur + postHoldSeconds;

    const prevAudio = findLinkedAudioSrcAndTrimIn(prevGroupId, j.prevClip.sourceUrl as string, prevTrimIn);
    const nextAudio = findLinkedAudioSrcAndTrimIn(nextGroupId, j.nextClip.sourceUrl as string, nextTrimIn);

    return {
      prev: {
        src: j.prevClip.sourceUrl as string,
        clipId: j.prevClip.id as string,
        groupId: prevGroupId,
        timeSeconds: prevTrimIn + prevTimeIn,
        audioSrc: prevAudio.src,
        audioTimeSeconds: prevAudio.trimIn + prevTimeIn,
        opacity: prevOpacity,
        active,
      },
      next: {
        src: j.nextClip.sourceUrl as string,
        clipId: j.nextClip.id as string,
        groupId: nextGroupId,
        timeSeconds: nextTrimIn + nextTimeIn,
        audioSrc: nextAudio.src,
        audioTimeSeconds: nextAudio.trimIn + nextTimeIn,
        opacity: nextOpacity,
        active,
      },
      active,
      tRelSeconds: tRel,
      cutTimeSeconds: cutTime,
    };

    return null;
  }, [audioTracks, defaultClipSeconds, playheadSeconds, v1?.clips, videoLayout]);

  const nextOverlay = dissolveOverlay?.next ?? null;
  const prevOverlay = dissolveOverlay?.prev ?? null;
  const dissolveActive = dissolveOverlay?.active ?? false;
  const dissolveTRelSeconds = (dissolveOverlay as any)?.tRelSeconds ?? null;
  const hideBaseAroundCut = typeof dissolveTRelSeconds === "number" && Math.abs(dissolveTRelSeconds) < 0.08;

  const shouldCompositeNow =
    dissolveActive &&
    !!nextOverlay &&
    !!prevOverlay &&
    nextOverlay.active &&
    prevOverlay.active &&
    isDissolveNextReady &&
    isDissolvePrevReady;

  useEffect(() => {
    // Avoid flicker: once both overlays are ready and the dissolve is active,
    // keep compositing mode enabled until the dissolve window ends.
    if (shouldCompositeNow) {
      setIsDissolveCompositing(true);
      return;
    }
    if (!dissolveActive) {
      setIsDissolveCompositing(false);
    }
  }, [dissolveActive, shouldCompositeNow]);

  const lastDissolveActiveRef = useRef(false);
  useEffect(() => {
    // When scrubbing across the cut, we may hide the base video during the dissolve.
    // As soon as the dissolve ends, force the base video to re-sync to the correct frame
    // to avoid a 1-frame flash/jump.
    const wasActive = lastDissolveActiveRef.current;
    lastDissolveActiveRef.current = dissolveActive;
    if (isPlayingSequence) return;
    if (!wasActive || dissolveActive) return;

    const v = videoRef.current;
    if (!v) return;

    const layoutIndex = videoLayout.findIndex((l) => playheadSeconds >= l.start && playheadSeconds < l.end);
    if (layoutIndex < 0) return;
    const layout = videoLayout[layoutIndex];
    const clip = v1?.clips?.[layoutIndex];
    if (!clip || !clip.sourceUrl) return;
    if (clip.sourceType === "asset_image") return;

    const targetTimeRaw = clip.trimInSeconds + (playheadSeconds - layout.start);
    const maxMediaTime =
      typeof clip.trimOutSeconds === "number"
        ? clip.trimOutSeconds
        : typeof (clip as any).mediaDurationSeconds === "number"
          ? (clip as any).mediaDurationSeconds
          : null;
    const targetTime =
      typeof maxMediaTime === "number" ? Math.min(targetTimeRaw, Math.max(0, maxMediaTime - 0.01)) : targetTimeRaw;

    const nextSrc = clip.sourceUrl;
    const currentSrc = v.src;
    const resolvedNextSrc = nextSrc.startsWith("http") ? nextSrc : new URL(nextSrc, window.location.origin).href;
    if (currentSrc !== resolvedNextSrc) {
      v.src = nextSrc;
      v.load();
    }
    try {
      v.currentTime = Math.max(0, targetTime);
    } catch {
      // ignore
    }
  }, [dissolveActive, isPlayingSequence, playheadSeconds, v1?.clips, videoLayout]);

  const audioLayouts = useMemo(() => {
    return (audioTracks ?? []).map((track) => {
      const clips = track.clips ?? [];
      const layout = clips.map((c) => {
        const duration =
          typeof c.trimOutSeconds === "number" && c.trimOutSeconds > c.trimInSeconds
            ? c.trimOutSeconds - c.trimInSeconds
            : typeof c.mediaDurationSeconds === "number" && c.mediaDurationSeconds > 0
              ? c.mediaDurationSeconds
              : defaultClipSeconds;
        const start = typeof c.startTime === "number" ? c.startTime : 0;
        const end = start + duration;
        return { id: c.id, start, end, duration };
      });
      return { trackId: track.id, trackName: track.name, layout };
    });
  }, [audioTracks]);

  const findAudioClipById = useCallback(
    (clipId: string): { trackId: string; clip: any } | null => {
      for (const t of audioTracks) {
        const clip = t.clips.find((c) => c.id === clipId);
        if (clip) return { trackId: t.id, clip };
      }
      return null;
    },
    [audioTracks]
  );

  const audioLayout = useMemo(() => {
    return audioLayouts.find((t) => t.trackId === a1?.id)?.layout ?? [];
  }, [a1?.id, audioLayouts]);

  const totalSeconds = useMemo(() => {
    // Find the maximum end time across all clips (not just the last one since clips can be anywhere)
    const maxV = videoLayout.reduce((max, l) => Math.max(max, l.end), 0);
    const maxA = audioLayouts.reduce(
      (max, t) => Math.max(max, t.layout.reduce((m, l) => Math.max(m, l.end), 0)),
      0
    );
    return Math.max(maxV, maxA, 10);
  }, [audioLayouts, videoLayout]);

  const getTrackClips = useCallback(
    (type: "video" | "audio") => {
      return type === "video" ? (v1?.clips ?? []) : (a1?.clips ?? []);
    },
    [a1?.clips, v1?.clips]
  );

  const reorderClip = useCallback(
    (type: "video" | "audio", clipId: string, toIndex: number) => {
      const clips = getTrackClips(type);
      const fromIndex = clips.findIndex((c) => c.id === clipId);
      if (fromIndex < 0 || toIndex < 0 || toIndex >= clips.length) return;

      if (fromIndex === toIndex) return;
      if (fromIndex < toIndex) {
        for (let i = fromIndex; i < toIndex; i += 1) {
          moveTimelineClip(type, clipId, "down");
        }
      } else {
        for (let i = fromIndex; i > toIndex; i -= 1) {
          moveTimelineClip(type, clipId, "up");
        }
      }
    },
    [getTrackClips, moveTimelineClip]
  );

  const getDropIndex = useCallback(
    (type: "video" | "audio", clipId: string, dropTimeSeconds: number) => {
      const layout = type === "video" ? videoLayout : audioLayout;
      const others = layout.filter((l) => l.id !== clipId);
      let idx = 0;
      for (const l of others) {
        const mid = (l.start + l.end) / 2;
        if (dropTimeSeconds >= mid) idx += 1;
      }
      return idx;
    },
    [audioLayout, videoLayout]
  );

  const clientXToTimelineSeconds = useCallback(
    (clientX: number) => {
      const el = timelineCanvasRef.current;
      if (!el) return 0;
      const rect = el.getBoundingClientRect();
      const scrollLeft = timelineScrollRef.current?.scrollLeft ?? 0;
      const xRaw = clientX - rect.left - trackLabelWidth + scrollLeft;
      const x = Math.max(0, xRaw);
      return x / pxPerSecond;
    },
    [pxPerSecond]
  );

  const timeTicks = useMemo(() => {
    const ticks: { t: number; major: boolean }[] = [];
    const max = Math.ceil(totalSeconds);
    for (let t = 0; t <= max; t += 1) {
      ticks.push({ t, major: t % 5 === 0 });
    }
    return ticks;
  }, [totalSeconds]);

  const selectedVideoIndex = useMemo(() => {
    if (!selectedClipId) return null;
    const idx = v1?.clips.findIndex((c) => c.id === selectedClipId) ?? -1;
    return idx >= 0 ? idx : null;
  }, [selectedClipId, v1?.clips]);

  const selectedAudioIndex = useMemo(() => {
    if (!selectedClipId) return null;
    const idx = a1?.clips.findIndex((c) => c.id === selectedClipId) ?? -1;
    return idx >= 0 ? idx : null;
  }, [a1?.clips, selectedClipId]);

  const selectedClip = useMemo(
    () =>
      v1?.clips.find((c) => c.id === selectedClipId) ||
      audioTracks.flatMap((t) => t.clips).find((c) => c.id === selectedClipId) ||
      null,
    [audioTracks, selectedClipId, v1?.clips]
  );

  const selectedTrackType = useMemo<"video" | "audio" | null>(() => {
    if (!selectedClipId) return null;
    if (v1?.clips.some((c) => c.id === selectedClipId)) return "video";
    if (audioTracks.some((t) => t.clips.some((c) => c.id === selectedClipId))) return "audio";
    return null;
  }, [audioTracks, selectedClipId, v1?.clips]);

  // --- Copy/Paste ---
  const handleCopyClip = useCallback(() => {
    if (!selectedClipId) return;
    const allClips = [...(v1?.clips ?? []), ...audioTracks.flatMap((t) => t.clips)];
    const clip = allClips.find((c) => c.id === selectedClipId);
    if (clip) setClipboardClip({ ...clip });
  }, [selectedClipId, v1?.clips, audioTracks]);

  const handlePasteClip = useCallback(() => {
    if (!clipboardClip) return;
    const trackType = selectedTrackType ?? "video";
    const existingClips = trackType === "video"
      ? (v1?.clips ?? [])
      : (audioTracks.find((t) => t.id === activeAudioTrackId)?.clips ?? []);
    const lastEnd = existingClips.reduce((max, c) => {
      const d = typeof c.trimOutSeconds === "number" && c.trimOutSeconds > (c.trimInSeconds ?? 0)
        ? c.trimOutSeconds - (c.trimInSeconds ?? 0)
        : typeof (c as any).mediaDurationSeconds === "number" ? (c as any).mediaDurationSeconds : 5;
      return Math.max(max, c.startTime + d);
    }, 0);
    pushUndoSnapshot();
    addTimelineClip(trackType, {
      ...clipboardClip,
      startTime: lastEnd,
      groupId: null,
    }, trackType === "audio" ? activeAudioTrackId : undefined);
  }, [clipboardClip, selectedTrackType, v1?.clips, audioTracks, activeAudioTrackId, pushUndoSnapshot, addTimelineClip]);

  const stopPlayback = useCallback(() => {
    if (imagePlaybackTimerRef.current) {
      window.clearInterval(imagePlaybackTimerRef.current);
      imagePlaybackTimerRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.muted = false;
    }
    if (dissolveNextAudioRef.current) {
      dissolveNextAudioRef.current.pause();
    }
    if (dissolvePrevAudioRef.current) {
      dissolvePrevAudioRef.current.pause();
    }
    for (const a of Object.values(audioRefs.current)) {
      if (a) a.pause();
    }
    setIsPlayingSequence(false);
    setPlayingIndex(null);
    setPlayingAudioIndex(null);
  }, []);

  const audioTrackById = useMemo(() => {
    const map = new Map<string, { clips: typeof audioTracks[0]["clips"]; layout: typeof audioLayouts[0]["layout"] }>();
    for (const t of audioTracks) {
      const layout = audioLayouts.find((l) => l.trackId === t.id)?.layout ?? [];
      map.set(t.id, { clips: t.clips, layout });
    }
    return map;
  }, [audioLayouts, audioTracks]);

  const findAudioClipAtTimeInTrack = useCallback(
    (trackId: string, timeSeconds: number): { clip: any; layout: any } | null => {
      const info = audioTrackById.get(trackId);
      if (!info) return null;
      const { clips, layout } = info;
      for (const l of layout) {
        if (timeSeconds >= l.start && timeSeconds < l.end) {
          const clip = clips.find((c) => c.id === l.id);
          if (clip) return { clip, layout: l };
        }
      }
      return null;
    },
    [audioTrackById]
  );

  const updateVideoMuteForTime = useCallback(
    (timeSeconds: number, videoClip: any | null) => {
      const v = videoRef.current;
      if (!v) return;

      if (dissolveActive || shouldCompositeNow || isDissolveCompositing) {
        v.muted = true;
        return;
      }

      const groupId = typeof videoClip?.groupId === "string" ? (videoClip.groupId as string) : null;
      if (!videoClip || !videoClip.sourceUrl) {
        v.muted = false;
        return;
      }

      let shouldMute = false;
      for (const t of audioTracks) {
        const found = findAudioClipAtTimeInTrack(t.id, timeSeconds);
        if (!found) continue;
        if (groupId && found.clip?.groupId === groupId) {
          shouldMute = true;
          break;
        }
        if (!groupId && found.clip?.sourceType === "shot" && found.clip?.sourceUrl === videoClip.sourceUrl) {
          shouldMute = true;
          break;
        }
      }

      v.muted = shouldMute;
    },
    [audioTracks, dissolveActive, findAudioClipAtTimeInTrack, isDissolveCompositing, shouldCompositeNow]
  );

  const syncDissolveAudio = useCallback(
    async (
      a: HTMLAudioElement,
      lastSrcRef: ReturnType<typeof useRef<string | null>>,
      overlay: { src: string; timeSeconds: number; volume: number } | null,
      enabled: boolean
    ) => {
      if (!enabled || !overlay) {
        a.pause();
        return;
      }

      const targetVolume = Math.max(0, Math.min(1, overlay.volume));
      a.volume = targetVolume;
      a.muted = false;
      a.preload = "auto";

      const nextSrc = overlay.src;
      const domHasSrc = (a.currentSrc && a.currentSrc.length > 0) || (a.src && a.src.length > 0);
      const isSameSrc = lastSrcRef.current === nextSrc && domHasSrc;
      if (!isSameSrc) {
        lastSrcRef.current = nextSrc;
        a.pause();
        a.src = nextSrc;
        a.load();
        if (a.readyState < 1) {
          await new Promise<void>((resolve, reject) => {
            const timeout = window.setTimeout(() => reject(new Error("Audio load timeout")), 7000);
            const onLoaded = () => {
              window.clearTimeout(timeout);
              resolve();
            };
            const onErr = () => {
              window.clearTimeout(timeout);
              reject(new Error("Audio load error"));
            };
            a.addEventListener("loadedmetadata", onLoaded, { once: true });
            a.addEventListener("error", onErr, { once: true });
          });
        }
      }

      const targetTime = Math.max(0, overlay.timeSeconds);
      const drift = Math.abs((a.currentTime ?? 0) - targetTime);
      if (drift > 0.15) {
        try {
          a.currentTime = targetTime;
        } catch {
          // ignore
        }
      }

      if (isPlayingSequence) {
        try {
          await a.play();
        } catch {
          // ignore
        }
      } else {
        a.pause();
      }
    },
    [isPlayingSequence]
  );

  const syncAudioTrackAtTime = useCallback(
    async (trackId: string, timeSeconds: number) => {
      const a = audioRefs.current[trackId];
      if (!a) return;

      const trackVolume = audioTracks.find((t) => t.id === trackId)?.volume;
      a.volume = typeof trackVolume === "number" ? Math.max(0, Math.min(1, trackVolume)) : 1;

      const found = findAudioClipAtTimeInTrack(trackId, timeSeconds);
      if (!found) {
        a.pause();
        playingAudioClipIdByTrackRef.current[trackId] = null;
        return;
      }

      if (dissolveActive || shouldCompositeNow || isDissolveCompositing) {
        const gid = found.clip?.groupId;
        const prevGid = prevOverlay?.groupId ?? null;
        const nextGid = nextOverlay?.groupId ?? null;
        const isLinked =
          (typeof gid === "string" && ((prevGid && gid === prevGid) || (nextGid && gid === nextGid))) ||
          (!gid && ((prevOverlay?.src && found.clip?.sourceUrl === prevOverlay.src) || (nextOverlay?.src && found.clip?.sourceUrl === nextOverlay.src)));
        if (isLinked) {
          a.pause();
          playingAudioClipIdByTrackRef.current[trackId] = null;
          return;
        }
      }

      const { clip, layout } = found;
      const offsetInClip = timeSeconds - layout.start;
      const audioStartTime = clip.trimInSeconds + offsetInClip;

      const currentlyPlayingClipId = playingAudioClipIdByTrackRef.current[trackId] ?? null;
      if (currentlyPlayingClipId === clip.id && !a.paused) {
        return;
      }

      try {
        a.pause();

        if (a.src !== clip.sourceUrl) {
          a.src = clip.sourceUrl;
          a.load();
          if (a.readyState < 1) {
            await new Promise<void>((resolve, reject) => {
              const timeout = setTimeout(() => reject(new Error("Audio load timeout")), 5000);
              a.addEventListener(
                "loadedmetadata",
                () => {
                  clearTimeout(timeout);
                  resolve();
                },
                { once: true }
              );
              a.addEventListener(
                "error",
                () => {
                  clearTimeout(timeout);
                  reject(new Error("Audio load error"));
                },
                { once: true }
              );
            });
          }
        }

        a.currentTime = Math.max(0, audioStartTime);
        await a.play();
        playingAudioClipIdByTrackRef.current[trackId] = clip.id;

        // Keep legacy state in sync for UI/debug (active track only)
        if (trackId === a1?.id) {
          const idx = a1?.clips.findIndex((c) => c.id === clip.id) ?? -1;
          setPlayingAudioIndex(idx >= 0 ? idx : null);
          playingAudioIndexRef.current = idx >= 0 ? idx : null;
        }
      } catch (e: unknown) {
        if (e instanceof Error && e.name === "AbortError") return;
        playingAudioClipIdByTrackRef.current[trackId] = null;
        if (trackId === a1?.id) {
          setPlayingAudioIndex(null);
          playingAudioIndexRef.current = null;
        }
      }
    },
    [a1?.clips, a1?.id, audioTracks, dissolveActive, findAudioClipAtTimeInTrack, isDissolveCompositing, nextOverlay?.groupId, nextOverlay?.src, prevOverlay?.groupId, prevOverlay?.src, shouldCompositeNow]
  );

  const syncAllAudioAtTime = useCallback(
    async (timeSeconds: number) => {
      await Promise.all(audioTracks.map((t) => syncAudioTrackAtTime(t.id, timeSeconds)));
    },
    [audioTracks, syncAudioTrackAtTime]
  );

  const clearPreview = useCallback(() => {
    stopPlayback();
    setPreviewImageUrl(null);
    setPreviewMode("video");
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.removeAttribute("src");
      videoRef.current.load();
    }
  }, [stopPlayback]);

  // Auto-scroll timeline to follow playhead during playback
  useEffect(() => {
    if (!isPlayingSequence) return;
    const scrollEl = timelineScrollRef.current;
    if (!scrollEl) return;
    const targetX = trackLabelWidth + playheadSeconds * pxPerSecond;
    if (playheadCenter) {
      // Keep playhead centered
      scrollEl.scrollLeft = Math.max(0, targetX - scrollEl.clientWidth * 0.5);
    } else {
      // Scroll only when playhead reaches edge
      const left = scrollEl.scrollLeft;
      const right = left + scrollEl.clientWidth;
      if (targetX > right - 64 || targetX < left + trackLabelWidth + 64) {
        scrollEl.scrollLeft = Math.max(0, targetX - scrollEl.clientWidth * 0.35);
      }
    }
  }, [playheadSeconds, isPlayingSequence, pxPerSecond, trackLabelWidth, playheadCenter]);

  useEffect(() => {
    if (!selectedClipId) {
      clearPreview();
      return;
    }

    const existsInVideo = v1?.clips.some((c) => c.id === selectedClipId) ?? false;
    const existsInAudio = audioTracks.some((t) => t.clips.some((c) => c.id === selectedClipId));
    if (!existsInVideo && !existsInAudio) {
      setSelectedClipId(null);
      clearPreview();
    }
  }, [audioTracks, clearPreview, selectedClipId, v1?.clips]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") return;

      // Undo/Redo (global, works even without selection)
      if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === "y" || (e.key === "z" && e.shiftKey))) {
        e.preventDefault();
        redo();
        return;
      }
      // Spacebar play/pause
      if (e.key === " " && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        togglePlaySequence();
        return;
      }
      // Copy/Paste
      if ((e.ctrlKey || e.metaKey) && e.key === "c" && selectedClipId) {
        e.preventDefault();
        handleCopyClip();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "v" && clipboardClip) {
        e.preventDefault();
        handlePasteClip();
        return;
      }
      // Zoom controls
      if ((e.ctrlKey || e.metaKey) && e.key === "=") {
        e.preventDefault();
        setPxPerSecond((v) => Math.min(200, v + 10));
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "-") {
        e.preventDefault();
        setPxPerSecond((v) => Math.max(2, v - 10));
        return;
      }
      // Shortcuts panel
      if (e.key === "?" || (e.shiftKey && e.key === "/")) {
        e.preventDefault();
        setShowShortcutsPanel((v) => !v);
        return;
      }
      // Snap toggle
      if (e.key === "n" && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        setSnapEnabled((v) => !v);
        return;
      }
      // J/K/L transport
      if (e.key === "j" && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        seekToTimelineTime(Math.max(0, playheadSeconds - 5));
        return;
      }
      if (e.key === "l" && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        seekToTimelineTime(Math.min(totalSeconds, playheadSeconds + 5));
        return;
      }
      if (e.key === "k" && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        togglePlaySequence();
        return;
      }
      // I/O for in/out points (trim selected clip)
      if (e.key === "i" && !e.ctrlKey && !e.metaKey && selectedClipId && selectedTrackType) {
        e.preventDefault();
        const clip = selectedClip;
        if (clip) {
          const clipStart = clip.startTime;
          const newTrimIn = (clip.trimInSeconds ?? 0) + (playheadSeconds - clipStart);
          if (newTrimIn >= (clip.trimInSeconds ?? 0) && newTrimIn < (clip.trimOutSeconds ?? Infinity)) {
            pushUndoSnapshot();
            updateTimelineClip(selectedTrackType, selectedClipId, { trimInSeconds: newTrimIn });
          }
        }
        return;
      }
      if (e.key === "o" && !e.ctrlKey && !e.metaKey && selectedClipId && selectedTrackType) {
        e.preventDefault();
        const clip = selectedClip;
        if (clip) {
          const clipStart = clip.startTime;
          const newTrimOut = (clip.trimInSeconds ?? 0) + (playheadSeconds - clipStart);
          if (newTrimOut > (clip.trimInSeconds ?? 0)) {
            pushUndoSnapshot();
            updateTimelineClip(selectedTrackType, selectedClipId, { trimOutSeconds: newTrimOut });
          }
        }
        return;
      }
      // Razor tool: split selected clip at playhead
      if (e.key === "s" && !e.ctrlKey && !e.metaKey && selectedClipId && selectedTrackType) {
        e.preventDefault();
        splitClipAtPlayhead(selectedTrackType, selectedClipId, playheadSeconds);
        return;
      }
      // Marker: add marker at playhead
      if (e.key === "m" && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        addMarker(playheadSeconds);
        return;
      }
      if (!selectedClipId || !selectedTrackType) return;
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        if (e.shiftKey) {
          pushUndoSnapshot();
          rippleDeleteClip(selectedTrackType, selectedClipId);
        } else {
          pushUndoSnapshot();
          removeTimelineClip(selectedTrackType, selectedClipId);
        }
        setSelectedClipId(null);
        clearPreview();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [clearPreview, removeTimelineClip, rippleDeleteClip, selectedClipId, selectedTrackType, undo, redo, pushUndoSnapshot, splitClipAtPlayhead, addMarker, playheadSeconds, handleCopyClip, handlePasteClip, clipboardClip, selectedClip, updateTimelineClip]);

  const setPreviewClip = useCallback(
    (clipId: string) => {
      setSelectedClipId(clipId);
      const clip = v1?.clips.find((c) => c.id === clipId);
      if (!clip) return;

      if (clip.sourceType === "asset_image") {
        stopPlayback();
        setPreviewMode("image");
        setPreviewImageUrl(clip.sourceUrl);
        const layout = videoLayout.find((l) => l.id === clipId);
        if (layout) setPlayheadSeconds(layout.start);
        return;
      }

      if (!videoRef.current) return;

      setPreviewMode("video");
      setPreviewImageUrl(null);

      const v = videoRef.current;
      v.pause();
      v.src = clip.sourceUrl;
      v.load();

      const seekTo = () => {
        try {
          const maxT = Number.isFinite(v.duration) ? Math.max(0, v.duration - 0.01) : clip.trimInSeconds;
          v.currentTime = Math.min(Math.max(0, clip.trimInSeconds), maxT);
        } catch {
          // ignore
        }
      };

      if (v.readyState >= 1) {
        seekTo();
      } else {
        v.addEventListener("loadedmetadata", seekTo, { once: true });
      }

      setIsPlayingSequence(false);
      setPlayingIndex(null);

      const layout = videoLayout.find((l) => l.id === clipId);
      if (layout) setPlayheadSeconds(layout.start);
    },
    [stopPlayback, v1?.clips, videoLayout]
  );

  // Audio mixing is handled by syncAllAudioAtTime()

  const startPlaybackFromIndex = useCallback(
    async (index: number, startAtSeconds?: number) => {
      const clip = v1?.clips[index];
      if (!clip) return;

      // Check if this is an image asset (either by sourceType or by file extension)
      // Also check URL path without query params
      const urlPath = (clip.sourceUrl || "").split("?")[0].toLowerCase();
      const isImage = clip.sourceType === "asset_image" || 
        clip.sourceType === "unknown" ||
        /\.(jpg|jpeg|png|gif|webp|bmp|svg|tiff|ico)$/i.test(urlPath);
      
      // Also check if it's NOT a video format
      const isVideo = /\.(mp4|mov|avi|mkv|webm|m4v|ogv)$/i.test(urlPath);
      
      if (isImage && !isVideo) {
        // Clear any existing image timer without stopping everything
        if (imagePlaybackTimerRef.current) {
          window.clearInterval(imagePlaybackTimerRef.current);
          imagePlaybackTimerRef.current = null;
        }
        // Pause video element if it was playing
        if (videoRef.current) {
          videoRef.current.pause();
        }
        setPlaybackError(null);

        setPreviewMode("image");
        setPreviewImageUrl(clip.sourceUrl);
        setPlayingIndex(index);
        setSelectedClipId(clip.id);

        const layout = videoLayout[index];
        const startTimelineSeconds =
          typeof startAtSeconds === "number" && layout
            ? Math.max(layout.start, Math.min(layout.end, startAtSeconds))
            : layout?.start ?? 0;
        if (layout) setPlayheadSeconds(startTimelineSeconds);

        const durationSeconds =
          typeof clip.trimOutSeconds === "number" && clip.trimOutSeconds > clip.trimInSeconds
            ? clip.trimOutSeconds - clip.trimInSeconds
            : defaultClipSeconds;

        const elapsedOffsetSeconds = layout ? Math.max(0, startTimelineSeconds - layout.start) : 0;
        const startedAt = performance.now() - elapsedOffsetSeconds * 1000;
        setIsPlayingSequence(true);
        
        void syncAllAudioAtTime(startTimelineSeconds);

        // Calculate timeline end once
        const lastVideoEnd = videoLayout.length ? videoLayout[videoLayout.length - 1].end : 0;
        const lastAudioEnd = audioLayout.length ? audioLayout[audioLayout.length - 1].end : 0;
        const timelineEnd = Math.max(lastVideoEnd, lastAudioEnd);
        
        imagePlaybackTimerRef.current = window.setInterval(() => {
          const now = performance.now();
          const elapsed = (now - startedAt) / 1000;
          const nextT = (layout?.start ?? 0) + elapsed;
          
          // Update playhead - don't clamp to layout.end if we're continuing past video track
          const isVideoTrackEnded = elapsed >= durationSeconds && (index + 1) >= (v1?.clips.length || 0);
          if (isVideoTrackEnded) {
            // Video track ended, continue playhead for audio
            setPlayheadSeconds(nextT);
          } else {
            setPlayheadSeconds(Math.min(layout?.end ?? nextT, nextT));
          }
          
          void syncAllAudioAtTime(nextT);

          // Check if we've reached the end of the entire timeline
          if (nextT >= timelineEnd) {
            if (imagePlaybackTimerRef.current) {
              window.clearInterval(imagePlaybackTimerRef.current);
              imagePlaybackTimerRef.current = null;
            }
            stopPlayback();
            return;
          }
          
          // Check if current image clip has ended
          if (elapsed >= durationSeconds) {
            const nextIndex = index + 1;
            if (nextIndex >= (v1?.clips.length || 0)) {
              // Video track ended but timeline continues (audio still playing)
              // Keep timer running - don't clear it
              return;
            }
            // Move to next video clip
            if (imagePlaybackTimerRef.current) {
              window.clearInterval(imagePlaybackTimerRef.current);
              imagePlaybackTimerRef.current = null;
            }
            void startPlaybackFromIndex(nextIndex);
          }
        }, 33);

        return;
      }

      // Clear any existing image timer when switching to video
      if (imagePlaybackTimerRef.current) {
        window.clearInterval(imagePlaybackTimerRef.current);
        imagePlaybackTimerRef.current = null;
      }
      
      setPreviewMode("video");
      setPreviewImageUrl(null);

      setPlayingIndex(index);
      setSelectedClipId(clip.id);
      if (!videoRef.current) {
        setPlaybackError("Video element not ready");
        return;
      }

      const layout = videoLayout[index];
      const startTimelineSeconds =
        typeof startAtSeconds === "number" && layout
          ? Math.max(layout.start, Math.min(layout.end, startAtSeconds))
          : layout?.start ?? 0;
      if (layout) setPlayheadSeconds(startTimelineSeconds);

      try {
        setPlaybackError(null);
        const v = videoRef.current;
        
        // Validate source URL exists
        if (!clip.sourceUrl) {
          throw new Error("No video source URL");
        }
        
        // Only change source if different to avoid unnecessary reloads
        const currentSrc = v.src;
        const newSrc = clip.sourceUrl.startsWith("http") ? clip.sourceUrl : new URL(clip.sourceUrl, window.location.origin).href;
        
        if (currentSrc !== newSrc) {
          v.src = clip.sourceUrl;
          v.load();

          if (v.readyState < 1) {
            await new Promise<void>((resolve, reject) => {
              const timeout = setTimeout(() => {
                reject(new Error("Video load timeout"));
              }, 10000);
              const onLoaded = () => {
                clearTimeout(timeout);
                resolve();
              };
              const onErr = () => {
                clearTimeout(timeout);
                // Get more details about the error
                const mediaError = v.error;
                const errorMsg = mediaError ? `Video error: ${mediaError.code} - ${mediaError.message || "Unknown"}` : "Failed to load video";
                reject(new Error(errorMsg));
              };
              v.addEventListener("loadedmetadata", onLoaded, { once: true });
              v.addEventListener("error", onErr, { once: true });
            });
          }
        }

        const offsetSeconds = layout ? Math.max(0, startTimelineSeconds - layout.start) : 0;
        const rawStartAt = clip.trimInSeconds + offsetSeconds;

        const mediaCeiling =
          typeof clip.trimOutSeconds === "number"
            ? clip.trimOutSeconds
            : typeof (clip as any).mediaDurationSeconds === "number"
              ? (clip as any).mediaDurationSeconds
              : null;

        const maxT = Number.isFinite(v.duration)
          ? Math.max(0, v.duration - 0.01)
          : typeof mediaCeiling === "number"
            ? Math.max(0, mediaCeiling - 0.01)
            : rawStartAt;

        const startAt = Math.min(Math.max(0, rawStartAt), maxT);
        try {
          v.currentTime = startAt;
        } catch {
          // If seeking fails for any reason, try playing from 0.
          try {
            v.currentTime = 0;
          } catch {
            // ignore
          }
        }
        console.log("[Video Playback] Starting video play...");
        await videoRef.current.play();
        console.log("[Video Playback] Video playing successfully");
        setIsPlayingSequence(true);
        
        void syncAllAudioAtTime(startTimelineSeconds);
        updateVideoMuteForTime(startTimelineSeconds, clip as any);
      } catch (e) {
        console.error("[Video Playback] Error:", e);
        setPlaybackError(e instanceof Error ? e.message : "Playback failed");
        setIsPlayingSequence(false);
      }
    },
    [defaultClipSeconds, stopPlayback, syncAllAudioAtTime, updateVideoMuteForTime, v1?.clips, videoLayout]
  );

  const startAudioOnlyFromTime = useCallback(
    (startSeconds: number) => {
      // Clear any existing timers
      if (imagePlaybackTimerRef.current) {
        window.clearInterval(imagePlaybackTimerRef.current);
        imagePlaybackTimerRef.current = null;
      }

      if (videoRef.current) {
        videoRef.current.pause();
      }

      setPlayingIndex(null);
      setIsPlayingSequence(true);
      setPlayheadSeconds(startSeconds);

      const startedAt = performance.now();
      const startT = startSeconds;
      const timelineEnd = totalSeconds;

      void syncAllAudioAtTime(startT);
      updateVideoMuteForTime(startT, null);

      imagePlaybackTimerRef.current = window.setInterval(() => {
        const elapsed = (performance.now() - startedAt) / 1000;
        const nextT = startT + elapsed;
        setPlayheadSeconds(nextT);
        void syncAllAudioAtTime(nextT);
        updateVideoMuteForTime(nextT, null);
        if (nextT >= timelineEnd) {
          if (imagePlaybackTimerRef.current) {
            window.clearInterval(imagePlaybackTimerRef.current);
            imagePlaybackTimerRef.current = null;
          }
          stopPlayback();
        }
      }, 33);
    },
    [stopPlayback, syncAllAudioAtTime, totalSeconds, updateVideoMuteForTime]
  );

  const togglePlaySequence = useCallback(async () => {
    if (!v1 || v1.clips.length === 0) return;

    if (isPlayingSequence) {
      stopPlayback();
      return;
    }

    const t = playheadSeconds;
    const idxAtTime = videoLayout.findIndex((l) => t >= l.start && t < l.end);
    if (idxAtTime >= 0) {
      await startPlaybackFromIndex(idxAtTime, t);
      return;
    }

    // If cursor isn't inside a clip, start from the next clip after the cursor.
    const idxNext = videoLayout.findIndex((l) => l.start >= t);
    if (idxNext >= 0) {
      await startPlaybackFromIndex(idxNext, videoLayout[idxNext]?.start);
      return;
    }

    // No more video clips: still allow audio-only playback from cursor.
    startAudioOnlyFromTime(t);
  }, [isPlayingSequence, playheadSeconds, startAudioOnlyFromTime, startPlaybackFromIndex, stopPlayback, v1, videoLayout]);

  const handleTimeUpdate = useCallback(() => {
    if (!videoRef.current || playingIndex === null || !isPlayingSequence) return;

    const clip = v1?.clips[playingIndex];
    if (!clip) return;

    const layout = videoLayout[playingIndex];
    let currentTimelineTime = playheadSeconds;
    if (layout) {
      const local = Math.max(0, videoRef.current.currentTime - clip.trimInSeconds);
      currentTimelineTime = Math.min(layout.end, layout.start + local);
      setPlayheadSeconds(currentTimelineTime);
    }

    updateVideoMuteForTime(currentTimelineTime, clip as any);

    void syncAllAudioAtTime(currentTimelineTime);

    const trimOut = clip.trimOutSeconds;
    if (typeof trimOut === "number" && videoRef.current.currentTime >= trimOut) {
      const nextIndex = playingIndex + 1;
      
      // Calculate the end of the entire timeline
      const lastVideoEnd = videoLayout.length ? videoLayout[videoLayout.length - 1].end : 0;
      const lastAudioEnd = audioLayout.length ? audioLayout[audioLayout.length - 1].end : 0;
      const timelineEnd = Math.max(lastVideoEnd, lastAudioEnd);
      
      if (nextIndex >= (v1?.clips.length || 0)) {
        // Video track ended, but check if we haven't reached the end of the timeline
        if (currentTimelineTime < timelineEnd) {
          // Continue playback for audio - switch to audio-only playback mode
          videoRef.current.pause();
          setPlayingIndex(null);
          
          // Start audio-only playback timer
          const audioOnlyStartTime = performance.now();
          const audioOnlyStartSeconds = currentTimelineTime;
          
          imagePlaybackTimerRef.current = window.setInterval(() => {
            const elapsed = (performance.now() - audioOnlyStartTime) / 1000;
            const nextT = audioOnlyStartSeconds + elapsed;
            setPlayheadSeconds(nextT);
            
            void syncAllAudioAtTime(nextT);
            updateVideoMuteForTime(nextT, null);

            // Check if we've reached the end of the timeline
            if (nextT >= timelineEnd) {
              if (imagePlaybackTimerRef.current) {
                window.clearInterval(imagePlaybackTimerRef.current);
                imagePlaybackTimerRef.current = null;
              }
              stopPlayback();
            }
          }, 33);
          return;
        }
        stopPlayback();
        return;
      }
      void startPlaybackFromIndex(nextIndex);
    }
  }, [audioLayout, isPlayingSequence, playheadSeconds, playingIndex, startPlaybackFromIndex, stopPlayback, syncAllAudioAtTime, updateVideoMuteForTime, v1?.clips, v1?.clips.length, videoLayout]);

  const formatTime = (seconds: number) => {
    const s = Math.max(0, Math.floor(seconds));
    const mm = Math.floor(s / 60);
    const ss = s % 60;
    return `${mm}:${ss.toString().padStart(2, "0")}`;
  };

  const formatSMPTE = (seconds: number) => {
    const fps = timeline.fps || 24;
    const totalFrames = Math.floor(seconds * fps);
    const ff = totalFrames % fps;
    const totalSeconds = Math.floor(totalFrames / fps);
    const ss = totalSeconds % 60;
    const mm = Math.floor(totalSeconds / 60) % 60;
    const hh = Math.floor(totalSeconds / 3600);
    return `${hh.toString().padStart(2, "0")}:${mm.toString().padStart(2, "0")}:${ss.toString().padStart(2, "0")}:${ff.toString().padStart(2, "0")}`;
  };

  // --- Snap-to-grid ---
  const snapTime = useCallback((t: number): number => {
    if (!snapEnabled) return t;
    const threshold = snapThresholdSeconds;
    const candidates: number[] = [0];

    // Clip edges from video track
    for (const l of videoLayout) {
      candidates.push(l.start, l.end);
    }

    // Clip edges from audio tracks
    for (const track of audioLayouts) {
      for (const l of track.layout) {
        candidates.push(l.start, l.end);
      }
    }

    // Markers
    for (const m of markers) {
      candidates.push(m.time);
    }

    // Grid intervals (every 5 seconds)
    const gridInterval = 5;
    for (let g = 0; g <= totalSeconds + gridInterval; g += gridInterval) {
      candidates.push(g);
    }

    // Find nearest candidate within threshold
    let best = t;
    let bestDist = threshold;
    for (const c of candidates) {
      const dist = Math.abs(c - t);
      if (dist < bestDist) {
        bestDist = dist;
        best = c;
      }
    }
    return best;
  }, [snapEnabled, videoLayout, audioLayouts, markers, totalSeconds]);

  const seekToTimelineTime = useCallback(
    (t: number) => {
      const snapped = snapTime(t);
      const clamped = Math.max(0, Math.min(totalSeconds, snapped));
      setPlayheadSeconds(clamped);

      if (isPlayingSequence) {
        stopPlayback();
      }

      const scrollEl = timelineScrollRef.current;
      if (scrollEl) {
        const targetX = trackLabelWidth + clamped * pxPerSecond;
        const left = scrollEl.scrollLeft;
        const right = left + scrollEl.clientWidth;
        if (targetX < left + 32 || targetX > right - 32) {
          scrollEl.scrollLeft = Math.max(0, targetX - scrollEl.clientWidth * 0.35);
        }
      }

      const layoutIndex = videoLayout.findIndex((l) => clamped >= l.start && clamped < l.end);
      if (layoutIndex < 0) return;

      const layout = videoLayout[layoutIndex];
      const clip = v1?.clips[layoutIndex];
      if (!clip) return;

      setSelectedClipId(clip.id);

      if (clip.sourceType === "asset_image") {
        stopPlayback();
        setPreviewMode("image");
        setPreviewImageUrl(clip.sourceUrl);
        return;
      }

      if (!videoRef.current) return;

      setPreviewMode("video");
      setPreviewImageUrl(null);

      const v = videoRef.current;
      v.pause();

      const targetTimeRaw = clip.trimInSeconds + (clamped - layout.start);
      const maxMediaTime =
        typeof clip.trimOutSeconds === "number"
          ? clip.trimOutSeconds
          : typeof (clip as any).mediaDurationSeconds === "number"
            ? (clip as any).mediaDurationSeconds
            : null;
      const targetTime =
        typeof maxMediaTime === "number"
          ? Math.min(targetTimeRaw, Math.max(0, maxMediaTime - 0.01))
          : targetTimeRaw;

      const nextSrc = clip.sourceUrl;
      const isSameSrc = lastPreviewVideoSrcRef.current === nextSrc;
      if (!isSameSrc) {
        lastPreviewVideoSrcRef.current = nextSrc;
        let applied = false;
        const applySeek = () => {
          if (applied) return;
          applied = true;
          try {
            v.currentTime = Math.max(0, targetTime);
          } catch {
            // ignore
          }
        };
        const onLoaded = () => {
          v.removeEventListener("loadeddata", onLoaded);
          v.removeEventListener("loadedmetadata", onLoaded);
          applySeek();
        };
        v.addEventListener("loadedmetadata", onLoaded);
        v.addEventListener("loadeddata", onLoaded);
        v.src = nextSrc;
        v.load();
      } else {
        try {
          v.currentTime = Math.max(0, targetTime);
        } catch {
          // ignore
        }
      }

      updateVideoMuteForTime(clamped, clip as any);
    },
    [isPlayingSequence, pxPerSecond, snapTime, stopPlayback, totalSeconds, updateVideoMuteForTime, v1?.clips, videoLayout]
  );

  const scrubToClientX = useCallback(
    (clientX: number) => {
      lastScrubClientXRef.current = clientX;
      if (scrubRAFRef.current !== null) return;
      scrubRAFRef.current = requestAnimationFrame(() => {
        scrubRAFRef.current = null;
        if (lastScrubClientXRef.current === null) return;
        seekToTimelineTime(clientXToTimelineSeconds(lastScrubClientXRef.current));
      });
    },
    [clientXToTimelineSeconds, seekToTimelineTime]
  );

  useEffect(() => {
    if (!isScrubbing) return;

    const onMove = (e: MouseEvent) => {
      scrubToClientX(e.clientX);
    };
    const onUp = () => {
      setIsScrubbing(false);
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [isScrubbing, scrubToClientX]);

  // Ref for throttling trim updates
  const trimRAFRef = useRef<number | null>(null);
  const lastTrimClientXRef = useRef<number | null>(null);
  const scrubRAFRef = useRef<number | null>(null);
  const lastScrubClientXRef = useRef<number | null>(null);
  const lastPreviewVideoSrcRef = useRef<string | null>(null);
  const lastDissolveNextVideoSrcRef = useRef<string | null>(null);
  const lastDissolvePrevVideoSrcRef = useRef<string | null>(null);
  const lastDissolveNextAudioSrcRef = useRef<string | null>(null);
  const lastDissolvePrevAudioSrcRef = useRef<string | null>(null);

  const deleteSelectedTransition = useCallback(() => {
    if (!selectedTransitionKey) return;
    if (selectedTransitionKey.startsWith("in:")) {
      const clipId = selectedTransitionKey.slice("in:".length);
      updateTimelineClip("video", clipId, { transitionIn: null });
      setSelectedTransitionKey(null);
      return;
    }
    if (selectedTransitionKey.startsWith("out:")) {
      const clipId = selectedTransitionKey.slice("out:".length);
      updateTimelineClip("video", clipId, { transitionOut: null });
      setSelectedTransitionKey(null);
      return;
    }
    if (selectedTransitionKey.startsWith("dissolve:")) {
      const rest = selectedTransitionKey.slice("dissolve:".length);
      const [prevId, currId] = rest.split(":");
      if (prevId) updateTimelineClip("video", prevId, { transitionOut: null });
      if (currId) updateTimelineClip("video", currId, { transitionIn: null });
      setSelectedTransitionKey(null);
      return;
    }
  }, [selectedTransitionKey, setSelectedTransitionKey, updateTimelineClip]);

  useEffect(() => {
    if (!selectedTransitionKey) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        deleteSelectedTransition();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [deleteSelectedTransition, selectedTransitionKey]);

  const seekVideoPreviewTo = useCallback(
    (clip: any, timeSeconds: number) => {
      if (!videoRef.current || !clip?.sourceUrl) return;

      const v = videoRef.current;
      v.pause();

      setPreviewMode("video");
      setPreviewImageUrl(null);

      const nextSrc = clip.sourceUrl;
      const isSameSrc = lastPreviewVideoSrcRef.current === nextSrc;

      const applySeek = () => {
        try {
          v.currentTime = Math.max(0, timeSeconds);
        } catch {
          // ignore
        }
      };

      if (!isSameSrc) {
        lastPreviewVideoSrcRef.current = nextSrc;
        let applied = false;
        const applyOnce = () => {
          if (applied) return;
          applied = true;
          applySeek();
        };

        const onLoaded = () => {
          applyOnce();
        };

        v.addEventListener("loadedmetadata", onLoaded, { once: true });
        v.addEventListener("loadeddata", onLoaded, { once: true });
        v.src = nextSrc;
        v.load();
        return;
      }

      applySeek();
    },
    []
  );

  const syncOverlayVideo = useCallback(
    async (
      v: HTMLVideoElement,
      lastSrcRef: ReturnType<typeof useRef<string | null>>,
      overlay: { src: string; timeSeconds: number } | null,
      setReady: (ready: boolean) => void
    ) => {
      if (!overlay) {
        setReady(false);
        return;
      }

      v.muted = true;
      v.preload = "auto";

      const nextSrc = overlay.src;
      const targetTime = Math.max(0, overlay.timeSeconds);

      const waitFor = (eventName: keyof HTMLMediaElementEventMap, timeoutMs: number) => {
        return new Promise<void>((resolve, reject) => {
          const onEvent = () => {
            cleanup();
            resolve();
          };
          const onError = () => {
            cleanup();
            reject(new Error("overlay video error"));
          };
          const cleanup = () => {
            v.removeEventListener(eventName, onEvent);
            v.removeEventListener("error", onError);
            if (timeoutId) window.clearTimeout(timeoutId);
          };
          const timeoutId = window.setTimeout(() => {
            cleanup();
            reject(new Error(`overlay video timeout: ${eventName}`));
          }, timeoutMs);
          v.addEventListener(eventName, onEvent, { once: true });
          v.addEventListener("error", onError, { once: true });
        });
      };

      const ensurePlaybackState = async () => {
        if (!isPlayingSequence) {
          v.pause();
          return;
        }
        try {
          await v.play();
        } catch {
          // ignore autoplay restrictions
        }
      };

      const seekAndGate = async () => {
        setReady(false);
        try {
          v.currentTime = targetTime;
        } catch {
          // ignore
        }
        try {
          if (v.readyState < 1) {
            await waitFor("loadedmetadata", 6000);
            try {
              v.currentTime = targetTime;
            } catch {
              // ignore
            }
          }
          await waitFor("seeked", 6000);
        } catch {
          try {
            await waitFor("canplay", 6000);
          } catch {
            // ignore
          }
        }
        setReady(true);
      };

      const domHasSrc = (v.currentSrc && v.currentSrc.length > 0) || (v.src && v.src.length > 0);
      const isSameSrc = lastSrcRef.current === nextSrc && domHasSrc;
      if (!isSameSrc) {
        lastSrcRef.current = nextSrc;
        v.pause();
        setReady(false);
        v.src = nextSrc;
        v.load();
        await seekAndGate();
        await ensurePlaybackState();
        return;
      }

      // Same source: avoid toggling ready state (can cause visible flashing).
      // Just seek directly if drift is noticeable.
      const drift = Math.abs((v.currentTime ?? 0) - targetTime);
      const driftThreshold = isPlayingSequence ? 0.2 : 0.05;
      if (drift > driftThreshold) {
        try {
          v.currentTime = targetTime;
        } catch {
          // ignore
        }
      }

      setReady(true);
      await ensurePlaybackState();
    },
    [isPlayingSequence]
  );

  useEffect(() => {
    const v = dissolveNextVideoRef.current;
    if (!v) return;
    void syncOverlayVideo(
      v,
      lastDissolveNextVideoSrcRef,
      nextOverlay ? { src: nextOverlay.src, timeSeconds: nextOverlay.timeSeconds } : null,
      setIsDissolveNextReady
    );
  }, [nextOverlay?.src, nextOverlay?.timeSeconds, syncOverlayVideo]);

  useEffect(() => {
    const v = dissolvePrevVideoRef.current;
    if (!v) return;
    void syncOverlayVideo(
      v,
      lastDissolvePrevVideoSrcRef,
      prevOverlay ? { src: prevOverlay.src, timeSeconds: prevOverlay.timeSeconds } : null,
      setIsDissolvePrevReady
    );
  }, [prevOverlay?.src, prevOverlay?.timeSeconds, syncOverlayVideo]);

  useEffect(() => {
    const a = dissolvePrevAudioRef.current;
    if (!a) return;
    const enabled =
      previewMode === "video" &&
      (dissolveActive || shouldCompositeNow || isDissolveCompositing) &&
      !!prevOverlay?.active;

    void syncDissolveAudio(
      a,
      lastDissolvePrevAudioSrcRef,
      prevOverlay
        ? {
            src: (prevOverlay as any).audioSrc ?? prevOverlay.src,
            timeSeconds: (prevOverlay as any).audioTimeSeconds ?? prevOverlay.timeSeconds,
            volume: prevOverlay.opacity,
          }
        : null,
      enabled
    );
  }, [dissolveActive, isDissolveCompositing, previewMode, prevOverlay, shouldCompositeNow, syncDissolveAudio]);

  useEffect(() => {
    const a = dissolveNextAudioRef.current;
    if (!a) return;
    const enabled =
      previewMode === "video" &&
      (dissolveActive || shouldCompositeNow || isDissolveCompositing) &&
      !!nextOverlay?.active;

    void syncDissolveAudio(
      a,
      lastDissolveNextAudioSrcRef,
      nextOverlay
        ? {
            src: (nextOverlay as any).audioSrc ?? nextOverlay.src,
            timeSeconds: (nextOverlay as any).audioTimeSeconds ?? nextOverlay.timeSeconds,
            volume: nextOverlay.opacity,
          }
        : null,
      enabled
    );
  }, [dissolveActive, isDissolveCompositing, nextOverlay, previewMode, shouldCompositeNow, syncDissolveAudio]);
  
  useEffect(() => {
    if (!draggingClip && !trimmingClip) return;

    const onMove = (e: MouseEvent) => {
      if (draggingClip) {
        // Store latest position and use RAF for smooth updates
        dragLastClientXRef.current = e.clientX;
        dragLastClientYRef.current = e.clientY;
        
        if (trimRAFRef.current !== null) return; // Reuse the same RAF ref for both drag and trim
        
        trimRAFRef.current = requestAnimationFrame(() => {
          trimRAFRef.current = null;
          if (dragLastClientXRef.current === null) return;
          
          const t = clientXToTimelineSeconds(dragLastClientXRef.current);
          const snapThresholdSeconds = 8 / Math.max(1, pxPerSecond);

          const getDurationSeconds = (clip: any): number => {
            const out = clip?.trimOutSeconds;
            const inp = clip?.trimInSeconds;
            if (typeof out === "number" && typeof inp === "number" && out > inp) return out - inp;
            return defaultClipSeconds;
          };

          const computeSnappedStartTime = (candidateStart: number, durationSeconds: number, snapPoints: { starts: number[]; ends: number[] }): number => {
            const candStart = candidateStart;
            const candEnd = candStart + durationSeconds;

            let bestStart = candStart;
            let bestDelta = snapThresholdSeconds + 1;

            // Snap start to other clip ends (connect after)
            for (const end of snapPoints.ends) {
              const d = Math.abs(candStart - end);
              if (d <= snapThresholdSeconds && d < bestDelta) {
                bestDelta = d;
                bestStart = end;
              }
            }

            // Snap end to other clip starts (connect before)
            for (const start of snapPoints.starts) {
              const d = Math.abs(candEnd - start);
              if (d <= snapThresholdSeconds && d < bestDelta) {
                bestDelta = d;
                bestStart = start - durationSeconds;
              }
            }

            // Snap to timeline start
            {
              const d = Math.abs(candStart - 0);
              if (d <= snapThresholdSeconds && d < bestDelta) {
                bestDelta = d;
                bestStart = 0;
              }
            }

            return Math.max(0, bestStart);
          };

          let candidateStart = Math.max(0, t);
          if (draggingClip.type === "video") {
            const clip = v1?.clips.find((c) => c.id === draggingClip.clipId);
            if (clip) {
              const clipIdx = videoLayout.findIndex((vl) => vl.id === draggingClip.clipId);
              const clipLayout = videoLayout.find((vl) => vl.id === draggingClip.clipId);

              // If this clip is part of a dissolve connection, lock it to its neighbor
              // so they move together and can't be separated.
              let groupStartId: string | null = null;
              let groupEndId: string | null = null;

              if (clipLayout && clipIdx >= 0) {
                // Linked to previous? (prev out dissolve -> this in dissolve)
                if (clip.transitionIn?.type === "dissolve" && clipIdx > 0) {
                  const prevId = videoLayout[clipIdx - 1]?.id;
                  const prevClip = prevId ? v1?.clips.find((c) => c.id === prevId) : null;
                  if (prevClip?.transitionOut?.type === "dissolve") {
                    groupStartId = prevClip.id;
                    groupEndId = clip.id;
                  }
                }

                // Linked to next? (this out dissolve -> next in dissolve)
                if (!groupStartId && clip.transitionOut?.type === "dissolve" && clipIdx < videoLayout.length - 1) {
                  const nextId = videoLayout[clipIdx + 1]?.id;
                  const nextClip = nextId ? v1?.clips.find((c) => c.id === nextId) : null;
                  if (nextClip?.transitionIn?.type === "dissolve") {
                    groupStartId = clip.id;
                    groupEndId = nextClip.id;
                  }
                }
              }

              if (groupStartId && groupEndId) {
                const startLayout = videoLayout.find((vl) => vl.id === groupStartId);
                const endLayout = videoLayout.find((vl) => vl.id === groupEndId);
                const draggedLayout = clipLayout;
                if (startLayout && endLayout && draggedLayout) {
                  const groupDurationSeconds = Math.max(0.01, endLayout.end - startLayout.start);
                  const draggedOffsetSeconds = draggedLayout.start - startLayout.start;
                  const candidateGroupStart = candidateStart - draggedOffsetSeconds;

                  const starts: number[] = [];
                  const ends: number[] = [];
                  for (const l of videoLayout) {
                    if (l.id === groupStartId || l.id === groupEndId) continue;
                    starts.push(l.start);
                    ends.push(l.end);
                  }

                  const snappedGroupStart = computeSnappedStartTime(candidateGroupStart, groupDurationSeconds, { starts, ends });
                  const newGroupStartTime = Math.round(snappedGroupStart * 100) / 100;
                  const groupInternalOffset = endLayout.start - startLayout.start;
                  const newGroupEndTime = Math.round((newGroupStartTime + groupInternalOffset) * 100) / 100;

                  updateTimelineClip("video", groupStartId, { startTime: newGroupStartTime });
                  updateTimelineClip("video", groupEndId, { startTime: newGroupEndTime });

                  // Prevent updating the dragged clip again below.
                  return;
                }
              }

              // Normal (non-linked) video drag
              const durationSeconds = getDurationSeconds(clip);
              const starts: number[] = [];
              const ends: number[] = [];
              for (const l of videoLayout) {
                if (l.id === draggingClip.clipId) continue;
                starts.push(l.start);
                ends.push(l.end);
              }
              candidateStart = computeSnappedStartTime(candidateStart, durationSeconds, { starts, ends });
            }
          } else {
            const hoverTrackId = dragHoverAudioTrackId;
            const audioInfo = findAudioClipById(draggingClip.clipId);
            const clip = audioInfo?.clip;
            const referenceTrackId = hoverTrackId || audioInfo?.trackId || null;
            const layoutForTrack = referenceTrackId
              ? audioLayouts.find((x) => x.trackId === referenceTrackId)?.layout
              : null;
            if (clip && layoutForTrack) {
              const durationSeconds = getDurationSeconds(clip);
              const starts: number[] = [];
              const ends: number[] = [];
              for (const l of layoutForTrack) {
                if (l.id === draggingClip.clipId) continue;
                starts.push(l.start);
                ends.push(l.end);
              }
              candidateStart = computeSnappedStartTime(candidateStart, durationSeconds, { starts, ends });
            }
          }

          const newStartTime = Math.round(candidateStart * 100) / 100;
          updateTimelineClip(draggingClip.type, draggingClip.clipId, {
            startTime: newStartTime,
          });

          if (draggingClip.type === "audio" && dragLastClientYRef.current !== null) {
            const canvas = timelineCanvasRef.current;
            const scrollEl = timelineScrollRef.current;
            if (canvas && scrollEl) {
              const rect = canvas.getBoundingClientRect();
              const y = dragLastClientYRef.current - rect.top + (scrollEl.scrollTop ?? 0);
              const row = Math.floor(y / 64);
              const audioRowIndex = row - 1;
              const hoverId =
                audioRowIndex >= 0 && audioRowIndex < audioTracks.length
                  ? (audioTracks[audioRowIndex]?.id ?? null)
                  : null;
              setDragHoverAudioTrackId(hoverId);
            }
          }
        });
        return;
      }

      if (trimmingClip) {
        // Store the latest mouse position and use RAF to throttle updates
        lastTrimClientXRef.current = e.clientX;
        
        if (trimRAFRef.current !== null) return; // Already scheduled
        
        trimRAFRef.current = requestAnimationFrame(() => {
          trimRAFRef.current = null;
          if (lastTrimClientXRef.current === null) return;
          
          const clientX = lastTrimClientXRef.current;
          const deltaSeconds = (clientX - trimmingClip.startClientX) / pxPerSecond;
          const minIn = 0;
          const minDurationSeconds = 0.1;

          const baseClip =
            trimmingClip.type === "video"
              ? v1?.clips.find((c) => c.id === trimmingClip.clipId)
              : findAudioClipById(trimmingClip.clipId)?.clip;

          const mediaLimit =
            typeof baseClip?.mediaDurationSeconds === "number" && baseClip.mediaDurationSeconds > 0
              ? baseClip.mediaDurationSeconds
              : null;
          if (trimmingClip.type === "video" && baseClip?.sourceType === "asset_image") {
            const baseOut =
              typeof trimmingClip.baseTrimOut === "number"
                ? trimmingClip.baseTrimOut
                : defaultClipSeconds;
            const nextOut = Math.max(0.1, baseOut + deltaSeconds);
            updateTimelineClip("video", trimmingClip.clipId, {
              trimInSeconds: 0,
              trimOutSeconds: nextOut,
            });
            return;
          }

          if (trimmingClip.edge === "in") {
            const effectiveOut =
              typeof trimmingClip.baseTrimOut === "number"
                ? trimmingClip.baseTrimOut
                : typeof mediaLimit === "number"
                  ? mediaLimit
                  : null;
            const maxIn =
              typeof effectiveOut === "number" ? Math.max(minIn, effectiveOut - minDurationSeconds) : Infinity;
            const nextIn = Math.min(maxIn, Math.max(minIn, trimmingClip.baseTrimIn + deltaSeconds));
            updateTimelineClip(trimmingClip.type, trimmingClip.clipId, {
              trimInSeconds: nextIn,
            });

            // Live preview: update video position without stopping playback
            if (trimmingClip.type === "video") {
              const clip = v1?.clips.find((c) => c.id === trimmingClip.clipId);
              if (clip && videoRef.current) {
                seekVideoPreviewTo(clip, nextIn);
              }
            }
          } else {
            const baseOut =
              typeof trimmingClip.baseTrimOut === "number"
                ? trimmingClip.baseTrimOut
                : trimmingClip.baseTrimIn + defaultClipSeconds;
            let nextOut = Math.max(trimmingClip.baseTrimIn + minDurationSeconds, baseOut + deltaSeconds);
            if (typeof mediaLimit === "number") {
              nextOut = Math.min(nextOut, mediaLimit);
            }
            updateTimelineClip(trimmingClip.type, trimmingClip.clipId, {
              trimOutSeconds: nextOut,
            });

            // Live preview: update video position without stopping playback
            if (trimmingClip.type === "video") {
              const clip = v1?.clips.find((c) => c.id === trimmingClip.clipId);
              if (clip && videoRef.current) {
                const safeOut =
                  typeof mediaLimit === "number" ? Math.min(nextOut, Math.max(0, mediaLimit - 0.01)) : nextOut;
                seekVideoPreviewTo(clip, safeOut);
              }
            }
          }
        });
      }
    };

    const onUp = () => {
      // Position is already updated during drag via RAF, just clean up
      if (draggingClip?.type === "audio" && dragLastClientYRef.current !== null) {
        const canvas = timelineCanvasRef.current;
        const scrollEl = timelineScrollRef.current;
        if (canvas && scrollEl) {
          const rect = canvas.getBoundingClientRect();
          const y = dragLastClientYRef.current - rect.top + (scrollEl.scrollTop ?? 0);
          const row = Math.floor(y / 64);
          const audioRowIndex = row - 1;
          if (audioRowIndex >= 0 && audioRowIndex < audioTracks.length) {
            const targetTrackId = audioTracks[audioRowIndex]?.id;
            if (targetTrackId) {
              const currentTrackId = audioTracks.find((t) => t.clips.some((c) => c.id === draggingClip.clipId))?.id;
              if (currentTrackId && currentTrackId !== targetTrackId) {
                moveAudioClipToTrack(draggingClip.clipId, targetTrackId);
              }
            }
          }
        }
      }
      setDraggingClip(null);
      setDragHoverIndex(null);
      setDragHoverAudioTrackId(null);
      setTrimmingClip(null);
      dragLastClientXRef.current = null;
      dragLastClientYRef.current = null;
      dragHoverIndexRef.current = null;
      lastTrimClientXRef.current = null;
      // Cancel any pending RAF
      if (trimRAFRef.current !== null) {
        cancelAnimationFrame(trimRAFRef.current);
        trimRAFRef.current = null;
      }
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      // Cancel any pending RAF on cleanup
      if (trimRAFRef.current !== null) {
        cancelAnimationFrame(trimRAFRef.current);
        trimRAFRef.current = null;
      }
    };
  }, [a1?.clips, audioTracks, clientXToTimelineSeconds, defaultClipSeconds, draggingClip, findAudioClipById, getDropIndex, moveAudioClipToTrack, pxPerSecond, reorderClip, stopPlayback, trimmingClip, updateTimelineClip, v1?.clips]);

  return (
    <div className="h-full min-h-0 flex flex-col bg-studio-bg">
      <div className="border-b border-studio-border bg-studio-panel p-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Film className="w-4 h-4 text-green-400" />
          <span className="text-sm font-medium">Timeline</span>
          <span className="text-xs text-studio-muted">(MVP)</span>
        </div>
      </div>

      <div className="flex-1 min-h-0 flex flex-col">
        <div className="p-3 border-b border-studio-border bg-black">
          <div className="flex justify-center">
            <div className="w-full max-w-[960px]">
              <div
                className={
                  "bg-black rounded overflow-hidden relative border " +
                  (formatFlash ? "border-studio-accent shadow-[0_0_0_1px_rgba(255,255,255,0.06)]" : "border-studio-border")
                }
                style={{
                  aspectRatio: `${timeline.format?.width ?? 1920} / ${timeline.format?.height ?? 1080}`,
                  height: "clamp(200px, 38vh, 520px)",
                  width: "auto",
                  maxWidth: "100%",
                  marginLeft: "auto",
                  marginRight: "auto",
                }}
              >
                <video
                  ref={videoRef}
                  className={
                    "w-full h-full " +
                    (previewMode === "image" && previewImageUrl ? "opacity-0 pointer-events-none" : "")
                  }
                  style={
                    previewMode === "video" && (nextOverlay || prevOverlay)
                      ? {
                          opacity:
                            (() => {
                              // Only hard-hide the base right at the cut when we have a stable composite.
                              // Otherwise we risk showing a black/dim frame if overlays aren't ready yet.
                              if (hideBaseAroundCut && shouldCompositeNow) return 0;

                              // During compositing, rely exclusively on the two overlay videos.
                              // This prevents a "restart" at the cut caused by the base video switching sources.
                              if (shouldCompositeNow || isDissolveCompositing) return 0;

                              const nextOk = !!(nextOverlay && isDissolveNextReady && nextOverlay.active);
                              const prevOk = !!(prevOverlay && isDissolvePrevReady && prevOverlay.active);
                              if (!nextOk && !prevOk) return 1;

                              const nextOp = nextOk && nextOverlay ? nextOverlay.opacity : 0;
                              const prevOp = prevOk && prevOverlay ? prevOverlay.opacity : 0;
                              return Math.max(0, Math.min(1, 1 - nextOp - prevOp));
                            })(),
                          willChange: "opacity",
                          transition: hideBaseAroundCut && shouldCompositeNow ? "none" : "opacity 80ms linear",
                        }
                      : undefined
                  }
                  controls={false}
                  onTimeUpdate={handleTimeUpdate}
                  onEnded={() => {
                    if (!isPlayingSequence || playingIndex === null) return;
                    const nextIndex = playingIndex + 1;
                    if (nextIndex >= (v1?.clips.length || 0)) {
                      stopPlayback();
                      return;
                    }
                    void startPlaybackFromIndex(nextIndex);
                  }}
                />
                {/* Cross-dissolve overlay videos (next + prev) */}
                {previewMode === "video" && (
                  <>
                    <video
                      ref={dissolveNextVideoRef}
                      className="absolute inset-0 w-full h-full pointer-events-none"
                      style={{
                        opacity: isDissolveNextReady && nextOverlay?.active ? (nextOverlay?.opacity ?? 0) : 0,
                        willChange: "opacity",
                        transition: "opacity 80ms linear",
                      }}
                      controls={false}
                      muted
                      playsInline
                    />
                    <video
                      ref={dissolvePrevVideoRef}
                      className="absolute inset-0 w-full h-full pointer-events-none"
                      style={{
                        opacity: isDissolvePrevReady && prevOverlay?.active ? (prevOverlay?.opacity ?? 0) : 0,
                        willChange: "opacity",
                        transition: "opacity 80ms linear",
                      }}
                      controls={false}
                      muted
                      playsInline
                    />
                  </>
                )}
                {previewMode === "image" && previewImageUrl && (
                  <img
                    src={previewImageUrl}
                    alt="Preview"
                    className="absolute inset-0 w-full h-full object-contain"
                  />
                )}
                {/* Transition fade overlay */}
                {transitionOverlay && (
                  <div
                    className="absolute inset-0 pointer-events-none transition-opacity duration-75"
                    style={{
                      backgroundColor: transitionOverlay.color,
                      opacity: transitionOverlay.opacity,
                    }}
                  />
                )}
              </div>

              <div className="mt-3 flex items-center gap-3">
                <button
                  className="px-2 py-1 rounded bg-studio-border hover:bg-studio-border/80 text-xs"
                  onClick={() => {
                    stopPlayback();
                    seekToTimelineTime(0);
                  }}
                  title="Go to start"
                >
                  |&lt;
                </button>

                <div className="text-xs text-studio-muted w-20 text-right font-mono" title="SMPTE timecode">{formatSMPTE(playheadSeconds)}</div>

                {/* Auto-save indicator */}
                <div className="text-[10px] text-studio-muted flex items-center gap-1">
                  {autoSaveState === "saving" && <><Loader2 className="w-3 h-3 animate-spin" /> Saving...</>}
                  {autoSaveState === "saved" && <span className="text-green-400">Saved</span>}
                </div>

                <input
                  type="range"
                  min={0}
                  max={Math.max(totalSeconds, 0.01)}
                  step={0.01}
                  value={playheadSeconds}
                  onMouseDown={() => {
                    stopPlayback();
                  }}
                  onChange={(e) => {
                    stopPlayback();
                    seekToTimelineTime(Number(e.target.value) || 0);
                  }}
                  className="flex-1"
                />

                <div className="text-xs text-studio-muted w-14">{formatTime(totalSeconds)}</div>

                <button
                  className="px-2 py-1 rounded bg-studio-border hover:bg-studio-border/80 text-xs"
                  onClick={() => {
                    stopPlayback();
                    seekToTimelineTime(totalSeconds);
                  }}
                  title="Go to end"
                >
                  &gt;|
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="flex-1 min-h-0 flex flex-col">
          <div className="flex-1 min-h-0 flex flex-col">
            <div className="p-3 border-b border-studio-border bg-studio-panel flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Film className="w-4 h-4 text-studio-muted" />
                <span className="text-sm font-medium">Sequence</span>

                <button
                  onClick={togglePlaySequence}
                  disabled={!v1 || v1.clips.length === 0}
                  className="inline-flex items-center justify-center h-7 w-7 rounded border border-studio-border bg-studio-bg hover:border-studio-accent/50 hover:bg-studio-border/40 disabled:opacity-50 disabled:hover:bg-studio-bg disabled:hover:border-studio-border transition-colors"
                  title={isPlayingSequence ? "Pause" : "Play"}
                >
                  {isPlayingSequence ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                </button>

                {/* Divider */}
                <div className="w-px h-6 bg-studio-border mx-1" />

                {/* Undo/Redo */}
                <button
                  className="inline-flex items-center justify-center h-7 w-7 rounded border border-studio-border bg-studio-bg hover:border-studio-accent/50 hover:bg-studio-border/40 disabled:opacity-30 transition-colors"
                  onClick={() => undo()}
                  disabled={undoStack.length === 0}
                  title="Undo (Ctrl+Z)"
                >
                  <Undo2 className="w-3.5 h-3.5" />
                </button>
                <button
                  className="inline-flex items-center justify-center h-7 w-7 rounded border border-studio-border bg-studio-bg hover:border-studio-accent/50 hover:bg-studio-border/40 disabled:opacity-30 transition-colors"
                  onClick={() => redo()}
                  disabled={redoStack.length === 0}
                  title="Redo (Ctrl+Y)"
                >
                  <Redo2 className="w-3.5 h-3.5" />
                </button>

                {/* Razor/Split */}
                <button
                  className="inline-flex items-center justify-center h-7 w-7 rounded border border-studio-border bg-studio-bg hover:border-studio-accent/50 hover:bg-studio-border/40 disabled:opacity-30 transition-colors"
                  onClick={() => {
                    if (selectedClipId && selectedTrackType) {
                      splitClipAtPlayhead(selectedTrackType, selectedClipId, playheadSeconds);
                    }
                  }}
                  disabled={!selectedClipId}
                  title="Split clip at playhead (S)"
                >
                  <Scissors className="w-3.5 h-3.5" />
                </button>

                {/* Snap toggle */}
                <button
                  className={"inline-flex items-center justify-center h-7 w-7 rounded border transition-colors " + (snapEnabled ? "border-studio-accent bg-studio-accent/20 text-studio-accent" : "border-studio-border bg-studio-bg text-studio-muted hover:border-studio-accent/50 hover:bg-studio-border/40")}
                  onClick={() => setSnapEnabled((v) => !v)}
                  title="Toggle snap-to-grid (N)"
                >
                  <Magnet className="w-3.5 h-3.5" />
                </button>

                {/* Copy/Paste */}
                <button
                  className="inline-flex items-center justify-center h-7 w-7 rounded border border-studio-border bg-studio-bg hover:border-studio-accent/50 hover:bg-studio-border/40 disabled:opacity-30 transition-colors"
                  onClick={() => handleCopyClip()}
                  disabled={!selectedClipId}
                  title="Copy clip (Ctrl+C)"
                >
                  <Copy className="w-3.5 h-3.5" />
                </button>
                <button
                  className="inline-flex items-center justify-center h-7 w-7 rounded border border-studio-border bg-studio-bg hover:border-studio-accent/50 hover:bg-studio-border/40 disabled:opacity-30 transition-colors"
                  onClick={() => handlePasteClip()}
                  disabled={!clipboardClip}
                  title="Paste clip (Ctrl+V)"
                >
                  <ClipboardPaste className="w-3.5 h-3.5" />
                </button>

                {/* Divider */}
                <div className="w-px h-6 bg-studio-border mx-1" />

                {/* Transitions dropdown */}
                <div className="relative">
                  <button
                    className="inline-flex items-center gap-1 h-7 px-2 rounded border border-studio-border bg-studio-bg hover:border-purple-400/50 hover:bg-studio-border/40 transition-colors text-xs text-studio-muted"
                    onClick={() => setShowTransitionsMenu((v) => !v)}
                    title="Transitions (drag onto a clip)"
                  >
                    <Blend className="w-3.5 h-3.5 text-purple-400" />
                    Transition
                  </button>
                  {showTransitionsMenu && (
                    <>
                      <div className="fixed inset-0 z-30" style={{ pointerEvents: draggingTransition ? "none" : "auto" }} onClick={() => setShowTransitionsMenu(false)} />
                      <div className="absolute top-8 left-0 z-40 bg-studio-panel border border-studio-border rounded-md shadow-lg py-1 min-w-[140px]">
                        {([
                          { type: "fade_black" as TransitionType, label: "Fade Black", color: "bg-gray-800", Icon: Moon },
                          { type: "fade_white" as TransitionType, label: "Fade White", color: "bg-gray-100", Icon: Sun },
                          { type: "dissolve" as TransitionType, label: "Dissolve", color: "bg-purple-600", Icon: Blend },
                          { type: "wipe_left" as TransitionType, label: "Wipe Left", color: "bg-blue-600", Icon: ArrowLeft },
                          { type: "wipe_right" as TransitionType, label: "Wipe Right", color: "bg-blue-600", Icon: ArrowRight },
                        ]).map((t) => (
                          <div
                            key={t.type}
                            draggable
                            onDragStart={(e) => {
                              e.dataTransfer.setData("application/x-transition", JSON.stringify({ type: t.type, label: t.label }));
                              e.dataTransfer.effectAllowed = "copy";
                              setDraggingTransition({ type: t.type, label: t.label });
                            }}
                            onDragEnd={() => {
                              setDraggingTransition(null);
                              setShowTransitionsMenu(false);
                            }}
                            title={`Drag ${t.label} onto a clip`}
                            className={`flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-studio-border/40 cursor-grab active:cursor-grabbing ${t.type === "fade_white" ? "text-gray-700" : "text-white"}`}
                          >
                            <div className={`flex items-center justify-center w-5 h-5 rounded ${t.color}`}>
                              <t.Icon className="w-3 h-3" />
                            </div>
                            {t.label}
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>

                {/* Divider */}
                <div className="w-px h-6 bg-studio-border mx-1" />

                {/* Fullscreen preview */}
                <button
                  className="inline-flex items-center justify-center h-7 w-7 rounded border border-studio-border bg-studio-bg hover:border-studio-accent/50 hover:bg-studio-border/40 transition-colors"
                  onClick={() => setFullscreenPreview(true)}
                  title="Fullscreen preview"
                >
                  <Maximize2 className="w-3.5 h-3.5" />
                </button>

                {/* Playhead center mode */}
                <button
                  className={"inline-flex items-center justify-center h-7 w-7 rounded border transition-colors " + (playheadCenter ? "border-studio-accent bg-studio-accent/20 text-studio-accent" : "border-studio-border bg-studio-bg text-studio-muted hover:border-studio-accent/50 hover:bg-studio-border/40")}
                  onClick={() => setPlayheadCenter((v) => !v)}
                  title="Toggle playhead center mode (scroll timeline under playhead)"
                >
                  <RectangleHorizontal className="w-3.5 h-3.5" />
                </button>

                {/* Keyboard shortcuts */}
                <button
                  className="inline-flex items-center justify-center h-7 w-7 rounded border border-studio-border bg-studio-bg hover:border-studio-accent/50 hover:bg-studio-border/40 transition-colors"
                  onClick={() => setShowShortcutsPanel(true)}
                  title="Keyboard shortcuts (?)"
                >
                  <KeyboardIcon className="w-3.5 h-3.5" />
                </button>

                {playbackError && <div className="text-[11px] text-red-400 max-w-[320px]">{playbackError}</div>}
              </div>
              <div className="flex items-center gap-3">
                <div className="text-xs text-studio-muted">{formatTime(totalSeconds)}</div>

                <div className="flex items-center gap-2">
                  <button
                    className="inline-flex items-center justify-center h-8 w-8 rounded-md bg-studio-bg border border-studio-border hover:border-studio-accent/60 hover:bg-studio-border/40 transition-colors"
                    onClick={() => {
                      const idx = TIMELINE_FORMATS.findIndex((f) => f.id === selectedTimelineFormat.id);
                      const next = TIMELINE_FORMATS[(Math.max(-1, idx) + 1) % TIMELINE_FORMATS.length];
                      setTimelineFormat({
                        aspectRatio: next.aspectRatio,
                        width: next.width,
                        height: next.height,
                      });
                    }}
                    title={`Format: ${selectedTimelineFormat.label} (${selectedTimelineFormat.width}×${selectedTimelineFormat.height})\nClick to change`}
                  >
                    <SelectedFormatIcon className="w-4 h-4 text-studio-muted" />
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    className="px-2 py-1 rounded bg-studio-border hover:bg-studio-border/80 text-xs"
                    onClick={() => setPxPerSecond((v) => Math.max(2, v - 10))}
                  >
                    -
                  </button>
                  <input
                    type="range"
                    min={2}
                    max={200}
                    step={5}
                    value={pxPerSecond}
                    onChange={(e) => setPxPerSecond(Number(e.target.value) || 30)}
                    className="w-28"
                  />
                  <button
                    className="px-2 py-1 rounded bg-studio-border hover:bg-studio-border/80 text-xs"
                    onClick={() => setPxPerSecond((v) => Math.min(200, v + 10))}
                  >
                    +
                  </button>
                </div>

                {/* Export preset */}
                <select
                  className="h-7 px-1 rounded bg-studio-bg border border-studio-border text-xs text-studio-muted hover:border-studio-accent/50 transition-colors"
                  value={exportPreset}
                  onChange={(e) => setExportPreset(e.target.value as typeof exportPreset)}
                  title="Export quality preset"
                >
                  <option value="source">Source</option>
                  <option value="720p">720p</option>
                  <option value="1080p">1080p</option>
                  <option value="4k">4K</option>
                </select>

                {/* Render to MP4 button */}
                <button
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-green-600/20 border border-green-600/40 text-green-400 hover:bg-green-600/30 transition-colors text-xs font-medium disabled:opacity-50"
                  onClick={handleRender}
                  disabled={renderStatus === "processing" || renderStatus === "pending"}
                  title="Render timeline to MP4"
                >
                  {renderStatus === "processing" || renderStatus === "pending" ? (
                    <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Rendering...</>
                  ) : (
                    <><Clapperboard className="w-3.5 h-3.5" /> Render MP4</>
                  )}
                </button>
                {renderResultUrl && renderStatus === "completed" && (
                  <a
                    href={renderResultUrl}
                    download
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-studio-bg border border-studio-border hover:border-studio-accent/50 text-xs text-studio-muted hover:text-studio-accent transition-colors"
                    title="Download rendered video"
                  >
                    <Download className="w-3.5 h-3.5" /> Download
                  </a>
                )}
                {renderError && <span className="text-[10px] text-red-400 max-w-[200px] truncate" title={renderError}>{renderError}</span>}
              </div>
            </div>

            <div className="flex-1 flex overflow-hidden">
              {/* Timeline tracks area */}
              <div ref={timelineScrollRef} className="flex-1 overflow-auto bg-studio-bg"
                onDragOver={(e) => {
                  if (e.dataTransfer.types.includes("Files")) {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "copy";
                  }
                }}
                onDrop={async (e) => {
                  if (!e.dataTransfer.files.length) return;
                  e.preventDefault();
                  const files = Array.from(e.dataTransfer.files);
                  for (const file of files) {
                    const ext = file.name.split(".").pop()?.toLowerCase() || "";
                    if (["mp4", "mov", "avi", "mkv", "webm"].includes(ext)) {
                      try {
                        const result = await uploadVideoAsset(file, projectId);
                        const url = getVideoAssetUrl(result.video_url);
                        const duration = result.duration_seconds ?? null;
                        const existingClips = timeline.videoTracks?.[0]?.clips ?? [];
                        const startTime = existingClips.reduce((max, c) => {
                          const d = typeof c.trimOutSeconds === "number" && c.trimOutSeconds > (c.trimInSeconds ?? 0)
                            ? c.trimOutSeconds - (c.trimInSeconds ?? 0)
                            : typeof (c as any).mediaDurationSeconds === "number" ? (c as any).mediaDurationSeconds : 5;
                          return Math.max(max, c.startTime + d);
                        }, 0);
                        setTimelineProjectId(projectId);
                        addTimelineClip("video", {
                          sourceType: "shot",
                          sourceId: result.filename,
                          name: result.filename,
                          sourceUrl: url,
                          trimInSeconds: 0,
                          trimOutSeconds: typeof duration === "number" && duration > 0 ? duration : null,
                          startTime,
                          mediaDurationSeconds: typeof duration === "number" && duration > 0 ? duration : null,
                        });
                      } catch (err) { console.error("Drag-drop upload failed:", err); }
                    } else if (["mp3", "wav", "aac", "flac", "ogg", "m4a"].includes(ext)) {
                      try {
                        const result = await uploadAudioReference(projectId, file);
                        const url = getAudioUrl(result.filename);
                        setTimelineProjectId(projectId);
                        addTimelineClip("audio", {
                          sourceType: "audio",
                          sourceId: result.filename,
                          name: result.filename,
                          sourceUrl: url,
                          trimInSeconds: 0,
                          trimOutSeconds: null,
                          mediaDurationSeconds: null,
                        });
                      } catch (err) { console.error("Drag-drop audio upload failed:", err); }
                    }
                  }
                }}
              >
              <div className="min-w-max" style={{ paddingLeft: timelinePaddingX, paddingRight: timelinePaddingX }}>
                <div className="sticky top-0 z-10 bg-studio-panel border-b border-studio-border" style={{ width: trackLabelWidth + totalSeconds * pxPerSecond }}>
                  <div className="flex items-end" style={{ height: 34 }}>
                    <div style={{ width: trackLabelWidth }} className="h-full border-r border-studio-border" />
                    <div className="relative flex-1 h-full">
                      {timeTicks.map((tick) => (
                        <div
                          key={tick.t}
                          className="absolute bottom-0"
                          style={{ left: tick.t * pxPerSecond }}
                        >
                          <div
                            className={tick.major ? "bg-studio-muted" : "bg-studio-border"}
                            style={{ width: 1, height: tick.major ? 16 : 8 }}
                          />
                          {tick.major && (
                            <div className="text-[10px] text-studio-muted mt-0.5" style={{ transform: "translateX(-2px)" }}>
                              {formatTime(tick.t)}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div
                  className="relative"
                  style={{
                    width: trackLabelWidth + totalSeconds * pxPerSecond,
                    height: Math.max(164, 24 + 64 + 64 * (audioTracks?.length ?? 0) + 28),
                  }}
                  ref={timelineCanvasRef}
                  onMouseDown={(e) => {
                    if (e.target === e.currentTarget || (e.target as HTMLElement).classList.contains("absolute")) {
                      const rect = e.currentTarget.getBoundingClientRect();
                      setMarquee({ startX: e.clientX - rect.left, startY: e.clientY - rect.top, endX: e.clientX - rect.left, endY: e.clientY - rect.top });
                      setSelectedClipId(null);
                      setSelectedClipIds([]);
                    }
                  }}
                  onMouseMove={(e) => {
                    if (!marquee) return;
                    const rect = e.currentTarget.getBoundingClientRect();
                    setMarquee({ ...marquee, endX: e.clientX - rect.left, endY: e.clientY - rect.top });
                  }}
                  onMouseUp={(e) => {
                    if (!marquee) return;
                    const rect = e.currentTarget.getBoundingClientRect();
                    const x1 = Math.min(marquee.startX, e.clientX - rect.left);
                    const x2 = Math.max(marquee.startX, e.clientX - rect.left);
                    const scrollLeft = timelineScrollRef.current?.scrollLeft ?? 0;
                    const t1 = (x1 + scrollLeft - trackLabelWidth) / pxPerSecond;
                    const t2 = (x2 + scrollLeft - trackLabelWidth) / pxPerSecond;
                    const allClips = [
                      ...(v1?.clips ?? []).map((c) => ({ id: c.id, start: c.startTime, duration: (typeof c.trimOutSeconds === "number" && c.trimOutSeconds > (c.trimInSeconds ?? 0) ? c.trimOutSeconds - (c.trimInSeconds ?? 0) : c.mediaDurationSeconds ?? 5) })),
                      ...audioTracks.flatMap((t) => t.clips.map((c) => ({ id: c.id, start: c.startTime, duration: (typeof c.trimOutSeconds === "number" && c.trimOutSeconds > (c.trimInSeconds ?? 0) ? c.trimOutSeconds - (c.trimInSeconds ?? 0) : c.mediaDurationSeconds ?? 5) }))),
                    ];
                    const hitIds = allClips.filter((c) => c.start < t2 && c.start + c.duration > t1).map((c) => c.id);
                    setSelectedClipIds(hitIds);
                    if (hitIds.length === 1) setSelectedClipId(hitIds[0]);
                    setMarquee(null);
                  }}
                >
                  {/* Marquee selection rectangle */}
                  {marquee && (
                    <div
                      className="absolute z-30 border border-studio-accent/60 bg-studio-accent/10 pointer-events-none"
                      style={{
                        left: Math.min(marquee.startX, marquee.endX),
                        top: Math.min(marquee.startY, marquee.endY),
                        width: Math.abs(marquee.endX - marquee.startX),
                        height: Math.abs(marquee.endY - marquee.startY),
                      }}
                    />
                  )}

                  {/* Playhead line - draggable */}
                  <div
                    className="absolute top-0 bottom-0 cursor-ew-resize z-20"
                    style={{ left: trackLabelWidth + playheadSeconds * pxPerSecond - 4, width: 10 }}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setIsScrubbing(true);
                      scrubToClientX(e.clientX);
                    }}
                  >
                    <div className="absolute left-1 w-0.5 h-full bg-studio-accent" />
                  </div>

                  {/* Playhead triangle handle */}
                  <div
                    className="absolute cursor-ew-resize z-20"
                    style={{
                      left: trackLabelWidth + playheadSeconds * pxPerSecond - 8,
                      top: -2,
                      width: 16,
                      height: 14,
                    }}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setIsScrubbing(true);
                      scrubToClientX(e.clientX);
                    }}
                  >
                    <div
                      style={{
                        position: "absolute",
                        left: 2,
                        top: 2,
                        width: 0,
                        height: 0,
                        borderLeft: "6px solid transparent",
                        borderRight: "6px solid transparent",
                        borderTop: "10px solid #6366f1",
                      }}
                    />
                  </div>

                  {/* Marker Bar */}
                  <div className="absolute top-0 left-0 right-0 h-6 border-b border-studio-border/50 bg-studio-bg/50"
                    onDoubleClick={(e) => {
                      const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
                      const x = e.clientX - rect.left - trackLabelWidth;
                      const scrollLeft = timelineScrollRef.current?.scrollLeft ?? 0;
                      const time = (x + scrollLeft) / pxPerSecond;
                      addMarker(time);
                    }}
                  >
                    <div className="absolute left-0 top-0 h-full flex items-center justify-center text-[10px] text-studio-muted border-r border-studio-border" style={{ width: trackLabelWidth }}>
                      Mk
                    </div>
                    <div className="absolute top-0 h-full" style={{ left: trackLabelWidth, width: totalSeconds * pxPerSecond }}>
                      {markers.map((m) => (
                        <div
                          key={m.id}
                          className="absolute top-0 h-full flex flex-col items-center group cursor-pointer"
                          style={{ left: m.time * pxPerSecond - 5 }}
                          onClick={(e) => {
                            e.stopPropagation();
                            seekToTimelineTime(m.time);
                          }}
                          onDoubleClick={(e) => {
                            e.stopPropagation();
                            removeMarker(m.id);
                          }}
                          title={`${m.label} (${formatTime(m.time)})\nDouble-click to delete`}
                        >
                          <div style={{ width: 0, height: 0, borderLeft: "5px solid transparent", borderRight: "5px solid transparent", borderTop: `8px solid ${m.color || "#f59e0b"}` }} />
                          <div className="text-[8px] text-studio-muted truncate max-w-[60px] hidden group-hover:block">{m.label}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Video Track V1 */}
                  <div className="absolute left-0 right-0 h-16 border-b border-studio-border" style={{ top: 24 }}>
                    <div className="group absolute left-0 top-0 h-full flex items-center justify-center text-xs text-studio-muted border-r border-studio-border" style={{ width: trackLabelWidth }}>
                      <div className="flex items-center gap-1">
                        V1
                        <button
                          className={"transition-opacity " + (lockedTrackIds.includes("v1") ? "opacity-100 text-studio-accent" : "opacity-0 group-hover:opacity-100 text-studio-muted hover:text-studio-accent")}
                          onMouseDown={(e) => { e.stopPropagation(); e.preventDefault(); toggleTrackLock("v1"); }}
                          title={lockedTrackIds.includes("v1") ? "Unlock track" : "Lock track"}
                        >
                          <Lock className="w-2.5 h-2.5" />
                        </button>
                      </div>
                    </div>
                    <div
                      className="absolute left-0 top-0 h-full cursor-pointer"
                      style={{ marginLeft: trackLabelWidth }}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
                        const x = e.clientX - rect.left;
                        const scrollLeft = timelineScrollRef.current?.scrollLeft ?? 0;
                        const time = (x + scrollLeft) / pxPerSecond;
                        seekToTimelineTime(time);
                        setIsScrubbing(true);
                      }}
                    >
                      {draggingClip?.type === "video" && dragHoverIndex !== null && (() => {
                        const layoutWithout = videoLayout.filter((l) => l.id !== draggingClip.clipId);
                        const prev = layoutWithout[Math.min(layoutWithout.length - 1, Math.max(0, dragHoverIndex - 1))];
                        const x = dragHoverIndex === 0 ? 0 : (prev?.end ?? 0) * pxPerSecond;
                        return (
                          <div
                            className="absolute top-2 h-12 bg-studio-accent/50"
                            style={{ left: x, width: 2 }}
                          />
                        );
                      })()}

                      {/* Render dissolve transitions at clip junctions */}
                      {videoLayout.map((l, idx) => {
                        if (idx === 0) return null;
                        const prevLayout = videoLayout[idx - 1];
                        const prevClip = v1?.clips.find((c) => c.id === prevLayout.id);
                        const currClip = v1?.clips.find((c) => c.id === l.id);
                        if (!prevClip || !currClip) return null;
                        
                        // Check if there's a dissolve connection between these clips
                        const hasDissolve = prevClip.transitionOut?.type === "dissolve" && currClip.transitionIn?.type === "dissolve";
                        if (!hasDissolve) return null;
                        
                        const maxOut = Math.max(0.1, prevLayout.duration - 0.01);
                        const maxIn = Math.max(0.1, l.duration - 0.01);
                        const outDur = Math.max(0.1, Math.min(maxOut, prevClip.transitionOut?.durationSeconds ?? 0.5));
                        const inDur = Math.max(0.1, Math.min(maxIn, currClip.transitionIn?.durationSeconds ?? 0.5));
                        const totalDur = Math.max(0.2, outDur + inDur);
                        const junctionX = prevLayout.end * pxPerSecond;
                        const width = Math.max(28, totalDur * pxPerSecond);
                        const transitionKey = `dissolve:${prevClip.id}:${currClip.id}`;
                        const isSelectedTransition = selectedTransitionKey === transitionKey;
                        
                        return (
                          <div
                            key={`dissolve-${prevClip.id}-${currClip.id}`}
                            className={
                              "absolute bg-orange-500 rounded flex items-center justify-center z-30 shadow-lg border-2 " +
                              (isSelectedTransition ? "border-white" : "border-orange-300") +
                              (isSelectedTransition ? " opacity-100" : " opacity-60 hover:opacity-90")
                            }
                            style={{
                              left: junctionX - (outDur * pxPerSecond),
                              top: 8,
                              width,
                              height: 28,
                              transform: "translateY(50%)",
                            }}
                            title={`Cross Dissolve (out ${outDur.toFixed(1)}s / in ${inDur.toFixed(1)}s) - drag center to slide, drag edges to resize, double-click to remove`}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (e.detail === 1) {
                                setSelectedTransitionKey(transitionKey);
                                setSelectedClipId(null);
                              }
                              if (e.detail === 2) {
                                // Double-click to remove both transitions
                                updateTimelineClip("video", prevClip.id, { transitionOut: null });
                                updateTimelineClip("video", currClip.id, { transitionIn: null });
                              }
                            }}
                          >
                            {/* Left handle: resize OUT portion */}
                            <div
                              className={
                                "absolute left-0 top-0 h-full w-2 " +
                                (isSelectedTransition ? "cursor-ew-resize bg-orange-300/60 hover:bg-orange-200/80" : "pointer-events-none")
                              }
                              onMouseDown={(e) => {
                                e.stopPropagation();
                                if (!isSelectedTransition) {
                                  setSelectedTransitionKey(transitionKey);
                                  setSelectedClipId(null);
                                  return;
                                }
                                setDraggingTransition({ type: "dissolve", label: "junction-left" });
                                const startX = e.clientX;
                                const baseOut = outDur;
                                const baseIn = inDur;
                                const onMove = (ev: MouseEvent) => {
                                  // Left handle changes total duration by changing the OUT portion
                                  // Dragging left => longer OUT; dragging right => shorter OUT
                                  const delta = (startX - ev.clientX) / pxPerSecond;
                                  const nextOut = Math.max(0.1, Math.min(maxOut, baseOut + delta));
                                  const nextIn = Math.max(0.1, Math.min(maxIn, baseIn));
                                  const roundedOut = Math.round(nextOut * 10) / 10;
                                  const roundedIn = Math.round(nextIn * 10) / 10;
                                  if (roundedOut !== outDur) {
                                    updateTimelineClip("video", prevClip.id, {
                                      transitionOut: { type: "dissolve", durationSeconds: roundedOut },
                                    });
                                  }
                                  if (roundedIn !== inDur) {
                                    updateTimelineClip("video", currClip.id, {
                                      transitionIn: { type: "dissolve", durationSeconds: roundedIn },
                                    });
                                  }
                                };
                                const onUp = () => {
                                  setDraggingTransition(null);
                                  window.removeEventListener("mousemove", onMove);
                                  window.removeEventListener("mouseup", onUp);
                                };
                                window.addEventListener("mousemove", onMove);
                                window.addEventListener("mouseup", onUp);
                              }}
                            />

                            {/* Center: move/slide across the cut (bias out vs in) */}
                            <div
                              className={
                                "px-2 h-full flex items-center justify-center select-none " +
                                (isSelectedTransition ? "cursor-move" : "cursor-pointer")
                              }
                              onMouseDown={(e) => {
                                e.stopPropagation();
                                if (!isSelectedTransition) {
                                  setSelectedTransitionKey(transitionKey);
                                  setSelectedClipId(null);
                                  return;
                                }
                                setDraggingTransition({ type: "dissolve", label: "junction-move" });
                                const startX = e.clientX;
                                const baseOut = outDur;
                                const baseIn = inDur;
                                const total = Math.max(0.2, Math.min(baseOut + baseIn, maxOut + maxIn));
                                const onMove = (ev: MouseEvent) => {
                                  // Dragging right shifts more duration into OUT; dragging left shifts more into IN
                                  const delta = (ev.clientX - startX) / pxPerSecond;
                                  let nextOut = baseOut + delta;
                                  nextOut = Math.max(0.1, Math.min(Math.min(maxOut, total - 0.1), nextOut));
                                  let nextIn = Math.max(0.1, total - nextOut);
                                  if (nextIn > maxIn) {
                                    nextIn = maxIn;
                                    nextOut = Math.max(0.1, Math.min(maxOut, total - nextIn));
                                  }
                                  updateTimelineClip("video", prevClip.id, {
                                    transitionOut: { type: "dissolve", durationSeconds: Math.round(nextOut * 10) / 10 },
                                  });
                                  updateTimelineClip("video", currClip.id, {
                                    transitionIn: { type: "dissolve", durationSeconds: Math.round(nextIn * 10) / 10 },
                                  });
                                };
                                const onUp = () => {
                                  setDraggingTransition(null);
                                  window.removeEventListener("mousemove", onMove);
                                  window.removeEventListener("mouseup", onUp);
                                };
                                window.addEventListener("mousemove", onMove);
                                window.addEventListener("mouseup", onUp);
                              }}
                            >
                              <Blend className="w-4 h-4 text-white" />
                            </div>

                            {/* Right handle: resize IN portion */}
                            <div
                              className={
                                "absolute right-0 top-0 h-full w-2 " +
                                (isSelectedTransition ? "cursor-ew-resize bg-orange-300/60 hover:bg-orange-200/80" : "pointer-events-none")
                              }
                              onMouseDown={(e) => {
                                e.stopPropagation();
                                if (!isSelectedTransition) {
                                  setSelectedTransitionKey(transitionKey);
                                  setSelectedClipId(null);
                                  return;
                                }
                                setDraggingTransition({ type: "dissolve", label: "junction-right" });
                                const startX = e.clientX;
                                const baseOut = outDur;
                                const baseIn = inDur;
                                const onMove = (ev: MouseEvent) => {
                                  // Right handle changes total duration by changing the IN portion
                                  // Dragging right => longer IN; dragging left => shorter IN
                                  const delta = (ev.clientX - startX) / pxPerSecond;
                                  const nextIn = Math.max(0.1, Math.min(maxIn, baseIn + delta));
                                  const nextOut = Math.max(0.1, Math.min(maxOut, baseOut));
                                  const roundedIn = Math.round(nextIn * 10) / 10;
                                  const roundedOut = Math.round(nextOut * 10) / 10;
                                  if (roundedIn !== inDur) {
                                    updateTimelineClip("video", currClip.id, {
                                      transitionIn: { type: "dissolve", durationSeconds: roundedIn },
                                    });
                                  }
                                  if (roundedOut !== outDur) {
                                    updateTimelineClip("video", prevClip.id, {
                                      transitionOut: { type: "dissolve", durationSeconds: roundedOut },
                                    });
                                  }
                                };
                                const onUp = () => {
                                  setDraggingTransition(null);
                                  window.removeEventListener("mousemove", onMove);
                                  window.removeEventListener("mouseup", onUp);
                                };
                                window.addEventListener("mousemove", onMove);
                                window.addEventListener("mouseup", onUp);
                              }}
                            />
                          </div>
                        );
                      })}

                      {videoLayout.map((l) => {
                        const clip = v1?.clips.find((c) => c.id === l.id);
                        if (!clip) return null;
                        const isSelected = clip.id === selectedClipId || selectedClipIds.includes(clip.id);
                        const isDragging = draggingClip?.type === "video" && draggingClip.clipId === clip.id;
                        
                        // Determine clip type for color coding
                        const urlPath = (clip.sourceUrl || "").split("?")[0].toLowerCase();
                        const isImage = clip.sourceType === "asset_image" || 
                          /\.(jpg|jpeg|png|gif|webp|bmp|svg|tiff|ico)$/i.test(urlPath);
                        const isVideo = /\.(mp4|mov|avi|mkv|webm|m4v|ogv)$/i.test(urlPath);
                        const isShot = clip.sourceType === "shot";

                        // Color: images = yellow, shots = purple, videos = blue, other = gray
                        const clipBgColor = isImage
                          ? "bg-yellow-600/40"
                          : isShot && !isVideo
                            ? "bg-purple-500/40"
                            : isVideo
                              ? "bg-sky-500/40"
                              : "bg-studio-bg";
                        const clipBorderColor = isImage
                          ? "border-yellow-500"
                          : isShot && !isVideo
                            ? "border-purple-400"
                            : isVideo
                              ? "border-sky-400"
                              : "border-studio-border";
                        
                        // Calculate visual offset when trimming left edge
                        const isTrimmingThisClipLeft = trimmingClip?.clipId === clip.id && trimmingClip?.edge === "in";
                        const trimLeftOffset = isTrimmingThisClipLeft 
                          ? (clip.trimInSeconds - (trimmingClip?.baseTrimIn ?? 0)) * pxPerSecond 
                          : 0;
                        
                        const rawWidth = Math.max(0, l.duration * pxPerSecond - trimLeftOffset);
                        const minWidth = 6;
                        const clipWidth = Math.max(minWidth, rawWidth);
                        const showText = clipWidth >= 80;

                        return (
                          <div
                            key={clip.id}
                            className={
                              `absolute top-2 h-12 rounded border text-left overflow-hidden ` +
                              (isSelected
                                ? `border-studio-accent ${clipBgColor}`
                                : transitionDropTarget === clip.id
                                  ? `border-purple-400 ${clipBgColor}`
                                  : `${clipBorderColor} ${clipBgColor} hover:border-studio-accent/50`)
                            }
                            style={{ 
                              left: l.start * pxPerSecond + trimLeftOffset, 
                              width: clipWidth
                            }}
                            onMouseDown={(e) => {
                              if (lockedTrackIds.includes("v1")) return;
                              e.stopPropagation();
                              setSelectedClipId(clip.id);
                              setSelectedTransitionKey(null);
                              setPreviewClip(clip.id);
                              setDraggingClip({ type: "video", clipId: clip.id });
                              dragLastClientXRef.current = e.clientX;
                              const idx = getDropIndex("video", clip.id, clientXToTimelineSeconds(e.clientX));
                              dragHoverIndexRef.current = idx;
                              setDragHoverIndex(idx);
                            }}
                            onContextMenu={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setSelectedClipId(clip.id);
                              setContextMenu({ x: e.clientX, y: e.clientY, clipId: clip.id, trackType: "video" });
                            }}
                            onDoubleClick={() => {
                              if (lockedTrackIds.includes("v1")) return;
                              setRenamingClipId(clip.id);
                              setRenameValue(clip.name);
                            }}
                            onDragOver={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              if (e.dataTransfer.types.includes("application/x-transition")) {
                                setTransitionDropTarget(clip.id);
                              }
                            }}
                            onDragLeave={(e) => {
                              e.preventDefault();
                              if (transitionDropTarget === clip.id) {
                                setTransitionDropTarget(null);
                              }
                            }}
                            onDrop={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              const data = e.dataTransfer.getData("application/x-transition");
                              if (data) {
                                try {
                                  const transition = JSON.parse(data) as { type: TransitionType; label: string };
                                  // Detect which half of the clip was dropped on
                                  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                                  const dropX = e.clientX - rect.left;
                                  const isLeftHalf = dropX < rect.width / 2;
                                  
                                  // For dissolve, straddle the junction between clips
                                  if (transition.type === "dissolve") {
                                    const clipIndex = videoLayout.findIndex((vl) => vl.id === clip.id);
                                    if (isLeftHalf && clipIndex > 0) {
                                      // Dropped on left half - dissolve from previous clip into this one
                                      const prevClipId = videoLayout[clipIndex - 1].id;
                                      const prevLayout = videoLayout[clipIndex - 1];
                                      const currLayout = videoLayout[clipIndex];
                                      const durOut = Math.min(
                                        Math.max(0.1, defaultTransitionSeconds),
                                        Math.max(0.01, prevLayout.duration - 0.01)
                                      );
                                      const durIn = Math.min(
                                        Math.max(0.1, defaultTransitionSeconds),
                                        Math.max(0.01, currLayout.duration - 0.01)
                                      );
                                      updateTimelineClip("video", prevClipId, {
                                        transitionOut: { type: "dissolve", durationSeconds: durOut },
                                      });
                                      updateTimelineClip("video", clip.id, {
                                        transitionIn: { type: "dissolve", durationSeconds: durIn },
                                      });
                                    } else if (!isLeftHalf && clipIndex < videoLayout.length - 1) {
                                      // Dropped on right half - dissolve from this clip into next one
                                      const nextClipId = videoLayout[clipIndex + 1].id;
                                      const currLayout = videoLayout[clipIndex];
                                      const nextLayout = videoLayout[clipIndex + 1];
                                      const durOut = Math.min(
                                        Math.max(0.1, defaultTransitionSeconds),
                                        Math.max(0.01, currLayout.duration - 0.01)
                                      );
                                      const durIn = Math.min(
                                        Math.max(0.1, defaultTransitionSeconds),
                                        Math.max(0.01, nextLayout.duration - 0.01)
                                      );
                                      updateTimelineClip("video", clip.id, {
                                        transitionOut: { type: "dissolve", durationSeconds: durOut },
                                      });
                                      updateTimelineClip("video", nextClipId, {
                                        transitionIn: { type: "dissolve", durationSeconds: durIn },
                                      });
                                    } else {
                                      // No adjacent clip, just apply to this clip's edge
                                      const currLayout = videoLayout[clipIndex];
                                      const dur = Math.min(
                                        Math.max(0.1, defaultTransitionSeconds),
                                        Math.max(0.01, currLayout.duration - 0.01)
                                      );
                                      if (isLeftHalf) {
                                        updateTimelineClip("video", clip.id, {
                                          transitionIn: { type: "dissolve", durationSeconds: dur },
                                        });
                                      } else {
                                        updateTimelineClip("video", clip.id, {
                                          transitionOut: { type: "dissolve", durationSeconds: dur },
                                        });
                                      }
                                    }
                                  } else {
                                    // Non-dissolve transitions apply to single clip edge
                                    const clipIndex = videoLayout.findIndex((vl) => vl.id === clip.id);
                                    const currLayout = clipIndex >= 0 ? videoLayout[clipIndex] : null;
                                    const maxDur = currLayout ? Math.max(0.01, currLayout.duration - 0.01) : 0.8;
                                    const dur = Math.min(Math.max(0.1, defaultTransitionSeconds), maxDur);
                                    if (isLeftHalf) {
                                      updateTimelineClip("video", clip.id, {
                                        transitionIn: { type: transition.type, durationSeconds: dur },
                                      });
                                    } else {
                                      updateTimelineClip("video", clip.id, {
                                        transitionOut: { type: transition.type, durationSeconds: dur },
                                      });
                                    }
                                  }
                                } catch (err) {
                                  console.error("Failed to parse transition data", err);
                                }
                              }
                              setTransitionDropTarget(null);
                            }}
                          >
                            <div className={"h-full w-full px-2 pt-1 relative " + (isDragging ? "opacity-60" : "")}
                              onClick={(e) => {
                                e.stopPropagation();
                                setPreviewClip(clip.id);
                              }}
                            >
                              {isVideo && clipWidth >= 40 && (
                                <div className="absolute inset-0 opacity-50">
                                  <ThumbnailStrip
                                    projectId={timeline.projectId || projectId}
                                    filename={clip.sourceUrl.split("/").pop() || ""}
                                    width={clipWidth}
                                    height={48}
                                  />
                                </div>
                              )}
                              {showText && (
                                <>
                                  {renamingClipId === clip.id ? (
                                    <input
                                      className="relative text-[11px] text-white bg-studio-bg border border-studio-accent rounded px-1 w-full max-w-full"
                                      value={renameValue}
                                      autoFocus
                                      onMouseDown={(e) => e.stopPropagation()}
                                      onChange={(e) => setRenameValue(e.target.value)}
                                      onBlur={() => {
                                        if (renameValue.trim()) {
                                          renameClip("video", clip.id, renameValue.trim());
                                        }
                                        setRenamingClipId(null);
                                      }}
                                      onKeyDown={(e) => {
                                        if (e.key === "Enter") {
                                          if (renameValue.trim()) renameClip("video", clip.id, renameValue.trim());
                                          setRenamingClipId(null);
                                        } else if (e.key === "Escape") {
                                          setRenamingClipId(null);
                                        }
                                      }}
                                    />
                                  ) : (
                                    <div className="relative text-[11px] text-white truncate">{clip.name}</div>
                                  )}
                                  <div className="relative text-[10px] text-studio-muted truncate">{formatTime(l.duration)}</div>
                                </>
                              )}
                            </div>

                            {isSelected && (
                              <div className="absolute bottom-0 left-0 right-0 h-4 bg-black/40 flex items-center justify-between px-1">
                                <div className="text-[10px] text-white/80 flex items-center gap-1">
                                  In {formatTime(clip.trimInSeconds)} Out {typeof clip.trimOutSeconds === "number" ? formatTime(clip.trimOutSeconds) : "end"}
                                  <select
                                    className="ml-1 bg-studio-bg text-[10px] text-white/80 border border-studio-border rounded px-0.5"
                                    value={clip.speed || 1}
                                    onMouseDown={(e) => e.stopPropagation()}
                                    onChange={(e) => {
                                      e.stopPropagation();
                                      updateTimelineClip("video", clip.id, { speed: Number(e.target.value) });
                                    }}
                                    title="Clip speed"
                                  >
                                    <option value={0.25}>0.25x</option>
                                    <option value={0.5}>0.5x</option>
                                    <option value={1}>1x</option>
                                    <option value={1.5}>1.5x</option>
                                    <option value={2}>2x</option>
                                    <option value={4}>4x</option>
                                  </select>
                                </div>
                                <div className="flex items-center gap-1">
                                  {clip.groupId && (
                                    <button
                                      className="p-0.5 rounded hover:bg-white/10"
                                      onMouseDown={(e) => e.stopPropagation()}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        unlinkClipGroup(clip.id);
                                      }}
                                      title="Unlink audio/video"
                                    >
                                      <div className="text-[10px] text-white/80">Unlink</div>
                                    </button>
                                  )}
                                  <button
                                    className="p-0.5 rounded hover:bg-white/10"
                                    onMouseDown={(e) => e.stopPropagation()}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      removeTimelineClip("video", clip.id);
                                      setSelectedClipId(null);
                                    }}
                                    title="Remove clip"
                                  >
                                    <Trash2 className="w-3 h-3 text-white/80" />
                                  </button>
                                </div>
                              </div>
                            )}

                            {/* Left trim handle - adjusts IN point (head) */}
                            <div
                              className={
                                "absolute left-0 top-0 h-full w-3 cursor-ew-resize group " +
                                (isSelected ? "bg-yellow-500/30" : "bg-transparent hover:bg-yellow-500/30")
                              }
                              onMouseDown={(e) => {
                                e.stopPropagation();
                                if (selectedTransitionKey) return;
                                stopPlayback();
                                if (selectedClipId !== clip.id) {
                                  setSelectedClipId(clip.id);
                                  setSelectedTransitionKey(null);
                                  return;
                                }
                                setPreviewClip(clip.id);
                                setTrimmingClip({
                                  type: "video",
                                  clipId: clip.id,
                                  edge: "in",
                                  startClientX: e.clientX,
                                  baseTrimIn: clip.trimInSeconds,
                                  baseTrimOut: typeof clip.trimOutSeconds === "number" ? clip.trimOutSeconds : null,
                                });
                              }}
                            >
                              <div className="absolute left-0 top-0 w-1 h-full bg-yellow-400 opacity-0 group-hover:opacity-100" />
                            </div>
                            {/* Right trim handle - adjusts OUT point (tail) */}
                            <div
                              className={
                                "absolute right-0 top-0 h-full w-3 cursor-ew-resize group " +
                                (isSelected ? "bg-cyan-500/30" : "bg-transparent hover:bg-cyan-500/30")
                              }
                              onMouseDown={(e) => {
                                e.stopPropagation();
                                if (selectedTransitionKey) return;
                                stopPlayback();
                                if (selectedClipId !== clip.id) {
                                  setSelectedClipId(clip.id);
                                  setSelectedTransitionKey(null);
                                  return;
                                }
                                setPreviewClip(clip.id);
                                setTrimmingClip({
                                  type: "video",
                                  clipId: clip.id,
                                  edge: "out",
                                  startClientX: e.clientX,
                                  baseTrimIn: clip.trimInSeconds,
                                  baseTrimOut: typeof clip.trimOutSeconds === "number" ? clip.trimOutSeconds : null,
                                });
                              }}
                            >
                              <div className="absolute right-0 top-0 w-1 h-full bg-cyan-400 opacity-0 group-hover:opacity-100" />
                            </div>

                            {/* Transition In - Rush style: small rectangle at left edge, centered vertically */}
                            {/* Hide if this is part of a dissolve junction (rendered separately) */}
                            {clip.transitionIn && !(clip.transitionIn.type === "dissolve" && (() => {
                              const clipIdx = videoLayout.findIndex((vl) => vl.id === clip.id);
                              if (clipIdx > 0) {
                                const prevClip = v1?.clips.find((c) => c.id === videoLayout[clipIdx - 1].id);
                                return prevClip?.transitionOut?.type === "dissolve";
                              }
                              return false;
                            })()) && (
                              (() => {
                                const transitionKey = `in:${clip.id}`;
                                const isSelectedTransition = selectedTransitionKey === transitionKey;
                                return (
                              <div
                                className={
                                  "absolute bg-orange-500 rounded flex items-center justify-center z-20 shadow-md border-2 " +
                                  (isSelectedTransition ? "border-white" : "border-orange-300") +
                                  (isSelectedTransition ? " opacity-100" : " opacity-60 hover:opacity-90") +
                                  " cursor-ew-resize"
                                }
                                style={{ 
                                  left: -8,
                                  top: "50%",
                                  transform: "translateY(-50%)",
                                  width: Math.max(20, clip.transitionIn.durationSeconds * pxPerSecond * 0.6),
                                  height: 26,
                                }}
                                title={`${clip.transitionIn.type.replace("_", " ")} (${clip.transitionIn.durationSeconds.toFixed(1)}s) - drag to resize`}
                                onMouseDown={(e) => {
                                  e.stopPropagation();
                                  if (!isSelectedTransition) {
                                    setSelectedTransitionKey(transitionKey);
                                    setSelectedClipId(null);
                                    return;
                                  }
                                  setDraggingTransition({ type: clip.transitionIn!.type, label: "in" });
                                  const startX = e.clientX;
                                  const baseDur = clip.transitionIn!.durationSeconds;
                                  const onMove = (ev: MouseEvent) => {
                                    const delta = (ev.clientX - startX) / pxPerSecond;
                                    const newDur = Math.max(0.1, Math.min(l.duration - 0.01, baseDur + delta));
                                    const rounded = Math.round(newDur * 10) / 10;
                                    if (rounded !== clip.transitionIn!.durationSeconds) {
                                      updateTimelineClip("video", clip.id, {
                                        transitionIn: { ...clip.transitionIn!, durationSeconds: rounded },
                                      });
                                    }
                                  };
                                  const onUp = () => {
                                    setDraggingTransition(null);
                                    window.removeEventListener("mousemove", onMove);
                                    window.removeEventListener("mouseup", onUp);
                                  };
                                  window.addEventListener("mousemove", onMove);
                                  window.addEventListener("mouseup", onUp);
                                }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (e.detail === 1) {
                                    setSelectedTransitionKey(transitionKey);
                                    setSelectedClipId(null);
                                  }
                                  if (e.detail === 2) {
                                    updateTimelineClip("video", clip.id, { transitionIn: null });
                                  }
                                }}
                              >
                                <span className="text-[7px] text-white font-bold uppercase tracking-tight">
                                  {clip.transitionIn.type === "dissolve" ? (
                                    <Blend className="w-3 h-3 text-white" />
                                  ) : (
                                    clip.transitionIn.type.replace("fade_", "").charAt(0).toUpperCase()
                                  )}
                                </span>
                              </div>
                                );
                              })()
                            )}

                            {/* Transition Out - Rush style: small rectangle at right edge, centered vertically */}
                            {/* Hide if this is part of a dissolve junction (rendered separately) */}
                            {clip.transitionOut && !(clip.transitionOut.type === "dissolve" && (() => {
                              const clipIdx = videoLayout.findIndex((vl) => vl.id === clip.id);
                              if (clipIdx < videoLayout.length - 1) {
                                const nextClip = v1?.clips.find((c) => c.id === videoLayout[clipIdx + 1].id);
                                return nextClip?.transitionIn?.type === "dissolve";
                              }
                              return false;
                            })()) && (
                              (() => {
                                const transitionKey = `out:${clip.id}`;
                                const isSelectedTransition = selectedTransitionKey === transitionKey;
                                return (
                              <div
                                className={
                                  "absolute bg-orange-500 rounded flex items-center justify-center z-20 shadow-md border-2 " +
                                  (isSelectedTransition ? "border-white" : "border-orange-300") +
                                  (isSelectedTransition ? " opacity-100" : " opacity-60 hover:opacity-90") +
                                  " cursor-ew-resize"
                                }
                                style={{ 
                                  right: -8,
                                  top: "50%",
                                  transform: "translateY(-50%)",
                                  width: Math.max(20, clip.transitionOut.durationSeconds * pxPerSecond * 0.6),
                                  height: 26,
                                }}
                                title={`${clip.transitionOut.type.replace("_", " ")} (${clip.transitionOut.durationSeconds.toFixed(1)}s) - drag to resize, double-click to remove`}
                                onMouseDown={(e) => {
                                  e.stopPropagation();
                                  if (!isSelectedTransition) {
                                    setSelectedTransitionKey(transitionKey);
                                    setSelectedClipId(null);
                                    return;
                                  }
                                  setDraggingTransition({ type: clip.transitionOut!.type, label: "out" });
                                  const startX = e.clientX;
                                  const baseDur = clip.transitionOut!.durationSeconds;
                                  const onMove = (ev: MouseEvent) => {
                                    // Right-edge transitions should extend into the clip when dragging left
                                    // (i.e. smaller clientX => longer duration)
                                    const delta = (startX - ev.clientX) / pxPerSecond;
                                    const newDur = Math.max(0.1, Math.min(l.duration - 0.01, baseDur + delta));
                                    const rounded = Math.round(newDur * 10) / 10;
                                    if (rounded !== clip.transitionOut!.durationSeconds) {
                                      updateTimelineClip("video", clip.id, {
                                        transitionOut: { ...clip.transitionOut!, durationSeconds: rounded },
                                      });
                                    }
                                  };
                                  const onUp = () => {
                                    setDraggingTransition(null);
                                    window.removeEventListener("mousemove", onMove);
                                    window.removeEventListener("mouseup", onUp);
                                  };
                                  window.addEventListener("mousemove", onMove);
                                  window.addEventListener("mouseup", onUp);
                                }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (e.detail === 1) {
                                    setSelectedTransitionKey(transitionKey);
                                    setSelectedClipId(null);
                                  }
                                  if (e.detail === 2) {
                                    updateTimelineClip("video", clip.id, { transitionOut: null });
                                  }
                                }}
                              >
                                <span className="text-[7px] text-white font-bold uppercase tracking-tight">
                                  {clip.transitionOut.type === "dissolve" ? (
                                    <Blend className="w-3 h-3 text-white" />
                                  ) : (
                                    clip.transitionOut.type.replace("fade_", "").charAt(0).toUpperCase()
                                  )}
                                </span>
                              </div>
                                );
                              })()
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {audioLayouts.map((track, trackIdx) => {
                    // 24px marker bar + 64px V1 + 64px per audio track
                    const top = 24 + 64 + (64 * trackIdx);
                    const isActive = track.trackId === a1?.id;
                    const clips = audioTracks.find((t) => t.id === track.trackId)?.clips ?? [];
                    const trackVolume =
                      audioTracks.find((t) => t.id === track.trackId)?.volume;
                    const volumeValue =
                      typeof trackVolume === "number" ? trackVolume : 1;
                    const isHoverTarget =
                      draggingClip?.type === "audio" && dragHoverAudioTrackId === track.trackId;

                    const draggingAudioInfo =
                      draggingClip?.type === "audio" ? findAudioClipById(draggingClip.clipId) : null;
                    const draggingAudioClip = draggingAudioInfo?.clip ?? null;
                    const draggingFromTrackId = draggingAudioInfo?.trackId ?? null;
                    const showGhostHere =
                      !!draggingAudioClip &&
                      !!dragHoverAudioTrackId &&
                      dragHoverAudioTrackId === track.trackId &&
                      dragHoverAudioTrackId !== draggingFromTrackId;

                    const ghostDuration =
                      draggingAudioClip &&
                      typeof draggingAudioClip.trimOutSeconds === "number" &&
                      draggingAudioClip.trimOutSeconds > draggingAudioClip.trimInSeconds
                        ? draggingAudioClip.trimOutSeconds - draggingAudioClip.trimInSeconds
                        : defaultClipSeconds;
                    const ghostRawWidth = Math.max(0, ghostDuration * pxPerSecond);
                    const ghostMinWidth = 6;
                    const ghostWidth = Math.max(ghostMinWidth, ghostRawWidth);
                    const ghostShowText = ghostWidth >= 80;
                    return (
                      <div key={track.trackId} className="absolute left-0 right-0 h-16" style={{ top }}>
                        {isHoverTarget && (
                          <div className="absolute inset-0 bg-studio-accent/10 pointer-events-none" />
                        )}
                        <div
                          className={
                            "group absolute left-0 top-0 h-full flex flex-col items-center justify-center gap-1 text-xs border-r border-studio-border cursor-pointer " +
                            (isActive ? "text-white" : "text-studio-muted")
                          }
                          style={{ width: trackLabelWidth }}
                          onMouseDown={(e) => {
                            e.preventDefault();
                            setActiveAudioTrackId(track.trackId);
                          }}
                          title="Select active audio track"
                        >
                          <div className="leading-none flex items-center gap-1">
                            {track.trackName}
                            {(audioTracks?.length ?? 0) > 1 && (
                              <button
                                className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-300 transition-opacity"
                                onMouseDown={(e) => {
                                  e.stopPropagation();
                                  e.preventDefault();
                                  removeAudioTrack(track.trackId);
                                }}
                                title={`Delete ${track.trackName}`}
                              >
                                <Trash2 className="w-2.5 h-2.5" />
                              </button>
                            )}
                          </div>
                          <div className="flex items-center gap-1">
                            <Volume2 className="w-3.5 h-3.5" />
                            <div className="text-[10px] tabular-nums">{Math.round(volumeValue * 100)}%</div>
                          </div>
                          <div className="w-14 h-2 rounded bg-studio-border/80 relative overflow-hidden">
                            <div
                              className="absolute left-0 top-0 bottom-0 bg-emerald-400/80"
                              style={{ width: `${Math.round(volumeValue * 100)}%` }}
                            />
                            <input
                              type="range"
                              min={0}
                              max={1}
                              step={0.01}
                              value={volumeValue}
                              onMouseDown={(e) => {
                                e.stopPropagation();
                              }}
                              onChange={(e) => {
                                e.stopPropagation();
                                setAudioTrackVolume(track.trackId, Number(e.target.value));
                              }}
                              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                              title={`Volume: ${Math.round(volumeValue * 100)}%`}
                            />
                          </div>
                          <div className="flex items-center gap-1 mt-0.5">
                            <button
                              className={"transition-opacity " + (lockedTrackIds.includes(track.trackId) ? "opacity-100 text-studio-accent" : "opacity-0 group-hover:opacity-100 text-studio-muted hover:text-studio-accent")}
                              onMouseDown={(e) => { e.stopPropagation(); e.preventDefault(); toggleTrackLock(track.trackId); }}
                              title={lockedTrackIds.includes(track.trackId) ? "Unlock track" : "Lock track"}
                            >
                              <Lock className="w-2.5 h-2.5" />
                            </button>
                            <button
                              className={"transition-opacity " + (soloTrackIds.includes(track.trackId) ? "opacity-100 text-yellow-400" : "opacity-0 group-hover:opacity-100 text-studio-muted hover:text-yellow-400")}
                              onMouseDown={(e) => { e.stopPropagation(); e.preventDefault(); toggleTrackSolo(track.trackId); }}
                              title={soloTrackIds.includes(track.trackId) ? "Un-solo track" : "Solo track"}
                            >
                              <Headphones className="w-2.5 h-2.5" />
                            </button>
                            <button
                              className={"transition-opacity " + (mutedTrackIds.includes(track.trackId) ? "opacity-100 text-red-400" : "opacity-0 group-hover:opacity-100 text-studio-muted hover:text-red-400")}
                              onMouseDown={(e) => { e.stopPropagation(); e.preventDefault(); toggleTrackMute(track.trackId); }}
                              title={mutedTrackIds.includes(track.trackId) ? "Unmute track" : "Mute track"}
                            >
                              <VolumeX className="w-2.5 h-2.5" />
                            </button>
                          </div>
                        </div>
                        <div
                          className="absolute left-0 top-0 h-full cursor-pointer"
                          style={{ marginLeft: trackLabelWidth }}
                          onMouseDown={(e) => {
                            e.preventDefault();
                            setActiveAudioTrackId(track.trackId);
                            const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
                            const x = e.clientX - rect.left;
                            const scrollLeft = timelineScrollRef.current?.scrollLeft ?? 0;
                            const time = (x + scrollLeft) / pxPerSecond;
                            seekToTimelineTime(time);
                            setIsScrubbing(true);
                          }}
                        >
                          {showGhostHere && (
                            <div
                              className="absolute top-2 h-12 rounded border border-dashed border-studio-accent bg-emerald-500/20 pointer-events-none"
                              style={{ left: (draggingAudioClip?.startTime ?? 0) * pxPerSecond, width: ghostWidth }}
                            >
                              <div className="h-full w-full px-2 pt-1 opacity-80">
                                {ghostShowText && (
                                  <>
                                    <div className="text-[11px] text-white truncate">{draggingAudioClip?.name}</div>
                                    <div className="text-[10px] text-studio-muted truncate">{formatTime(ghostDuration)}</div>
                                  </>
                                )}
                              </div>
                            </div>
                          )}
                          {track.layout.map((l) => {
                            const clip = clips.find((c) => c.id === l.id);
                            if (!clip) return null;
                            const isSelected = clip.id === selectedClipId || selectedClipIds.includes(clip.id);
                            const isDragging = draggingClip?.type === "audio" && draggingClip.clipId === clip.id;

                            const isTrimmingThisClipLeft = trimmingClip?.clipId === clip.id && trimmingClip?.edge === "in";
                            const trimLeftOffset = isTrimmingThisClipLeft
                              ? (clip.trimInSeconds - (trimmingClip?.baseTrimIn ?? 0)) * pxPerSecond
                              : 0;

                            const rawWidth = Math.max(0, l.duration * pxPerSecond - trimLeftOffset);
                            const minWidth = 6;
                            const clipWidth = Math.max(minWidth, rawWidth);
                            const showText = clipWidth >= 80;

                            return (
                              <div
                                key={clip.id}
                                className={
                                  `absolute top-2 h-12 rounded border text-left overflow-hidden ` +
                                  (isSelected
                                    ? "border-studio-accent bg-emerald-500/40"
                                    : "border-emerald-500 bg-emerald-500/40 hover:border-studio-accent/50")
                                }
                                style={{ left: l.start * pxPerSecond + trimLeftOffset, width: clipWidth }}
                                onMouseDown={(e) => {
                                  if (lockedTrackIds.includes(track.trackId)) return;
                                  e.stopPropagation();
                                  setActiveAudioTrackId(track.trackId);
                                  setSelectedClipId(clip.id);
                                  setDraggingClip({ type: "audio", clipId: clip.id });
                                  dragLastClientXRef.current = e.clientX;
                                  dragLastClientYRef.current = e.clientY;
                                  setDragHoverAudioTrackId(track.trackId);
                                }}
                                onContextMenu={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  setActiveAudioTrackId(track.trackId);
                                  setSelectedClipId(clip.id);
                                  setContextMenu({ x: e.clientX, y: e.clientY, clipId: clip.id, trackType: "audio" });
                                }}
                                onDoubleClick={() => {
                                  if (lockedTrackIds.includes(track.trackId)) return;
                                  setRenamingClipId(clip.id);
                                  setRenameValue(clip.name);
                                }}
                              >
                                <div
                                  className={
                                    "h-full w-full px-2 pt-1 relative " +
                                    (isDragging ? "opacity-40" : "")
                                  }
                                >
                                  {clipWidth >= 30 && (
                                    <div className="absolute inset-0">
                                      <WaveformDisplay
                                        projectId={timeline.projectId || projectId}
                                        filename={clip.sourceUrl.split("/").pop() || ""}
                                        height={48}
                                        color="#10b981"
                                      />
                                    </div>
                                  )}
                                  {showText && (
                                    <>
                                      {renamingClipId === clip.id ? (
                                        <input
                                          className="relative text-[11px] text-white bg-studio-bg border border-studio-accent rounded px-1 w-full max-w-full"
                                          value={renameValue}
                                          autoFocus
                                          onMouseDown={(e) => e.stopPropagation()}
                                          onChange={(e) => setRenameValue(e.target.value)}
                                          onBlur={() => {
                                            if (renameValue.trim()) {
                                              renameClip("audio", clip.id, renameValue.trim());
                                            }
                                            setRenamingClipId(null);
                                          }}
                                          onKeyDown={(e) => {
                                            if (e.key === "Enter") {
                                              if (renameValue.trim()) renameClip("audio", clip.id, renameValue.trim());
                                              setRenamingClipId(null);
                                            } else if (e.key === "Escape") {
                                              setRenamingClipId(null);
                                            }
                                          }}
                                        />
                                      ) : (
                                        <div className="relative text-[11px] text-white truncate">{clip.name}</div>
                                      )}
                                      <div className="relative text-[10px] text-studio-muted truncate">{formatTime(l.duration)}</div>
                                    </>
                                  )}
                                </div>

                                {isSelected && (
                                  <div className="absolute bottom-0 left-0 right-0 h-4 bg-black/40 flex items-center justify-between px-1">
                                    <div className="text-[10px] text-white/80 flex items-center gap-1">
                                      In {formatTime(clip.trimInSeconds)} Out {typeof clip.trimOutSeconds === "number" ? formatTime(clip.trimOutSeconds) : "end"}
                                      <input
                                        type="range"
                                        min={0}
                                        max={1}
                                        step={0.05}
                                        value={clip.volume ?? 1}
                                        className="ml-1 w-12 h-1"
                                        onMouseDown={(e) => e.stopPropagation()}
                                        onChange={(e) => {
                                          updateTimelineClip("audio", clip.id, { volume: Number(e.target.value) });
                                        }}
                                        title="Clip volume"
                                      />
                                    </div>
                                    <div className="flex items-center gap-1">
                                      {clip.groupId && (
                                        <button
                                          className="p-0.5 rounded hover:bg-white/10"
                                          onMouseDown={(e) => e.stopPropagation()}
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            unlinkClipGroup(clip.id);
                                          }}
                                          title="Unlink audio/video"
                                        >
                                          <div className="text-[10px] text-white/80">Unlink</div>
                                        </button>
                                      )}
                                      <button
                                        className="p-0.5 rounded hover:bg-white/10"
                                        onMouseDown={(e) => e.stopPropagation()}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          removeTimelineClip("audio", clip.id);
                                          setSelectedClipId(null);
                                        }}
                                        title="Remove clip"
                                      >
                                        <Trash2 className="w-3 h-3 text-white/80" />
                                      </button>
                                    </div>
                                  </div>
                                )}

                                {/* Fade-in handle (top-left triangle) */}
                                {(clip.fadeInSeconds ?? 0) > 0 && (
                                  <div
                                    className="absolute top-0 left-0 z-10 pointer-events-none"
                                    style={{
                                      width: (clip.fadeInSeconds ?? 0) * pxPerSecond,
                                      height: "100%",
                                    }}
                                  >
                                    <svg className="absolute inset-0 w-full h-full pointer-events-none" preserveAspectRatio="none">
                                      <line x1="0" y1="100%" x2="100%" y2="0" stroke="rgba(255,255,255,0.5)" strokeWidth="1" />
                                    </svg>
                                  </div>
                                )}
                                <div
                                  className="absolute top-0 left-0 z-20 cursor-ew-resize"
                                  style={{ width: 8, height: 8 }}
                                  onMouseDown={(e) => {
                                    e.stopPropagation();
                                    setDraggingFade({ clipId: clip.id, type: "in", startX: e.clientX, startVal: clip.fadeInSeconds ?? 0 });
                                    const onMove = (ev: MouseEvent) => {
                                      const delta = (ev.clientX - e.clientX) / pxPerSecond;
                                      const newFade = Math.max(0, Math.min(l.duration / 2, (clip.fadeInSeconds ?? 0) + delta));
                                      const rounded = Math.round(newFade * 10) / 10;
                                      if (rounded !== (clip.fadeInSeconds ?? 0)) {
                                        updateTimelineClip("audio", clip.id, { fadeInSeconds: rounded });
                                      }
                                    };
                                    const onUp = () => {
                                      setDraggingFade(null);
                                      window.removeEventListener("mousemove", onMove);
                                      window.removeEventListener("mouseup", onUp);
                                    };
                                    window.addEventListener("mousemove", onMove);
                                    window.addEventListener("mouseup", onUp);
                                  }}
                                  title={`Fade in: ${(clip.fadeInSeconds ?? 0).toFixed(1)}s (drag to adjust)`}
                                >
                                  <div className="w-2 h-2 bg-white/60 rounded-sm" />
                                </div>

                                {/* Fade-out handle (top-right triangle) */}
                                {(clip.fadeOutSeconds ?? 0) > 0 && (
                                  <div
                                    className="absolute top-0 right-0 z-10 pointer-events-none"
                                    style={{
                                      width: (clip.fadeOutSeconds ?? 0) * pxPerSecond,
                                      height: "100%",
                                    }}
                                  >
                                    <svg className="absolute inset-0 w-full h-full pointer-events-none" preserveAspectRatio="none">
                                      <line x1="100%" y1="100%" x2="0" y2="0" stroke="rgba(255,255,255,0.5)" strokeWidth="1" />
                                    </svg>
                                  </div>
                                )}
                                <div
                                  className="absolute top-0 right-0 z-20 cursor-ew-resize"
                                  style={{ width: 8, height: 8 }}
                                  onMouseDown={(e) => {
                                    e.stopPropagation();
                                    setDraggingFade({ clipId: clip.id, type: "out", startX: e.clientX, startVal: clip.fadeOutSeconds ?? 0 });
                                    const onMove = (ev: MouseEvent) => {
                                      const delta = (e.clientX - ev.clientX) / pxPerSecond;
                                      const newFade = Math.max(0, Math.min(l.duration / 2, (clip.fadeOutSeconds ?? 0) + delta));
                                      const rounded = Math.round(newFade * 10) / 10;
                                      if (rounded !== (clip.fadeOutSeconds ?? 0)) {
                                        updateTimelineClip("audio", clip.id, { fadeOutSeconds: rounded });
                                      }
                                    };
                                    const onUp = () => {
                                      setDraggingFade(null);
                                      window.removeEventListener("mousemove", onMove);
                                      window.removeEventListener("mouseup", onUp);
                                    };
                                    window.addEventListener("mousemove", onMove);
                                    window.addEventListener("mouseup", onUp);
                                  }}
                                  title={`Fade out: ${(clip.fadeOutSeconds ?? 0).toFixed(1)}s (drag to adjust)`}
                                >
                                  <div className="w-2 h-2 bg-white/60 rounded-sm" />
                                </div>

                                {/* Left trim handle - adjusts IN point (head) */}
                                <div
                                  className={
                                    "absolute left-0 top-0 h-full w-3 cursor-ew-resize group " +
                                    (isSelected ? "bg-yellow-500/30" : "bg-transparent hover:bg-yellow-500/30")
                                  }
                                  onMouseDown={(e) => {
                                    e.stopPropagation();
                                    setActiveAudioTrackId(track.trackId);
                                    setSelectedClipId(clip.id);
                                    setTrimmingClip({
                                      type: "audio",
                                      clipId: clip.id,
                                      edge: "in",
                                      startClientX: e.clientX,
                                      baseTrimIn: clip.trimInSeconds,
                                      baseTrimOut: typeof clip.trimOutSeconds === "number" ? clip.trimOutSeconds : null,
                                    });
                                  }}
                                >
                                  <div className="absolute left-0 top-0 w-1 h-full bg-yellow-400 opacity-0 group-hover:opacity-100" />
                                </div>
                                {/* Right trim handle - adjusts OUT point (tail) */}
                                <div
                                  className={
                                    "absolute right-0 top-0 h-full w-3 cursor-ew-resize group " +
                                    (isSelected ? "bg-cyan-500/30" : "bg-transparent hover:bg-cyan-500/30")
                                  }
                                  onMouseDown={(e) => {
                                    e.stopPropagation();
                                    setActiveAudioTrackId(track.trackId);
                                    setSelectedClipId(clip.id);
                                    setTrimmingClip({
                                      type: "audio",
                                      clipId: clip.id,
                                      edge: "out",
                                      startClientX: e.clientX,
                                      baseTrimIn: clip.trimInSeconds,
                                      baseTrimOut: typeof clip.trimOutSeconds === "number" ? clip.trimOutSeconds : null,
                                    });
                                  }}
                                >
                                  <div className="absolute right-0 top-0 w-1 h-full bg-cyan-400 opacity-0 group-hover:opacity-100" />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}

                  {/* Add audio track button - inside canvas for correct positioning */}
                  <div
                    className="absolute left-0 flex items-center px-2 z-10"
                    style={{ top: 24 + 64 + 64 * (audioTracks?.length ?? 0), height: 28 }}
                  >
                    <button
                      className="inline-flex items-center justify-center h-6 w-6 rounded border border-studio-border bg-studio-bg hover:border-studio-accent/50 hover:bg-studio-border/40 text-studio-muted hover:text-studio-accent transition-colors"
                      onClick={() => addAudioTrack()}
                      title="Add audio track"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      {/* Hidden audio elements for timeline audio track playback (one per track) */}
      <div style={{ display: "none" }}>
        {audioTracks.map((t) => {
          const isMuted = mutedTrackIds.includes(t.id) || (soloTrackIds.length > 0 && !soloTrackIds.includes(t.id));
          return (
            <audio
              key={t.id}
              muted={isMuted}
              ref={(el) => {
                audioRefs.current[t.id] = el;
              }}
            />
          );
        })}

        <audio
          ref={dissolvePrevAudioRef}
          preload="auto"
        />
        <audio
          ref={dissolveNextAudioRef}
          preload="auto"
        />
      </div>

      {/* Right-click Context Menu */}
      {contextMenu && (
        <>
          <div className="fixed inset-0 z-50" onClick={() => setContextMenu(null)} onContextMenu={(e) => { e.preventDefault(); setContextMenu(null); }} />
          <div
            className="fixed z-50 bg-studio-panel border border-studio-border rounded-md shadow-lg py-1 min-w-[160px]"
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            <button
              className="w-full text-left px-3 py-1.5 text-xs hover:bg-studio-border/40 flex items-center gap-2"
              onClick={() => {
                if (contextMenu) {
                  pushUndoSnapshot();
                  removeTimelineClip(contextMenu.trackType, contextMenu.clipId);
                  setSelectedClipId(null);
                  clearPreview();
                }
                setContextMenu(null);
              }}
            >
              <Trash2 className="w-3 h-3" /> Delete
            </button>
            <button
              className="w-full text-left px-3 py-1.5 text-xs hover:bg-studio-border/40 flex items-center gap-2"
              onClick={() => {
                if (contextMenu) {
                  pushUndoSnapshot();
                  rippleDeleteClip(contextMenu.trackType, contextMenu.clipId);
                  setSelectedClipId(null);
                  clearPreview();
                }
                setContextMenu(null);
              }}
            >
              <Trash2 className="w-3 h-3" /> Ripple Delete <span className="text-studio-muted ml-auto">Shift+Del</span>
            </button>
            <button
              className="w-full text-left px-3 py-1.5 text-xs hover:bg-studio-border/40 flex items-center gap-2"
              onClick={() => {
                if (contextMenu) {
                  splitClipAtPlayhead(contextMenu.trackType, contextMenu.clipId, playheadSeconds);
                }
                setContextMenu(null);
              }}
            >
              <Scissors className="w-3 h-3" /> Split at Playhead <span className="text-studio-muted ml-auto">S</span>
            </button>
            <button
              className="w-full text-left px-3 py-1.5 text-xs hover:bg-studio-border/40 flex items-center gap-2"
              onClick={() => {
                if (contextMenu) {
                  const allClips = [...(v1?.clips ?? []), ...audioTracks.flatMap((t) => t.clips)];
                  const clip = allClips.find((c) => c.id === contextMenu.clipId);
                  if (clip) setClipboardClip({ ...clip });
                }
                setContextMenu(null);
              }}
            >
              <Copy className="w-3 h-3" /> Copy <span className="text-studio-muted ml-auto">Ctrl+C</span>
            </button>
            <div className="border-t border-studio-border my-1" />
            <button
              className="w-full text-left px-3 py-1.5 text-xs hover:bg-studio-border/40 flex items-center gap-2"
              onClick={() => {
                if (contextMenu) {
                  const allClips = [...(v1?.clips ?? []), ...audioTracks.flatMap((t) => t.clips)];
                  const clip = allClips.find((c) => c.id === contextMenu.clipId);
                  if (clip) {
                    setRenamingClipId(clip.id);
                    setRenameValue(clip.name);
                  }
                }
                setContextMenu(null);
              }}
            >
              <Film className="w-3 h-3" /> Rename
            </button>
            <button
              className="w-full text-left px-3 py-1.5 text-xs hover:bg-studio-border/40 flex items-center gap-2"
              onClick={() => {
                if (contextMenu) {
                  setSelectedClipId(contextMenu.clipId);
                  setShowPropertiesPanel(true);
                }
                setContextMenu(null);
              }}
            >
              <Film className="w-3 h-3" /> Properties
            </button>
          </div>
        </>
      )}

      {/* Keyboard Shortcuts Panel */}
      {showShortcutsPanel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setShowShortcutsPanel(false)}>
          <div className="bg-studio-panel border border-studio-border rounded-lg p-6 max-w-md w-full mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-medium text-studio-accent">Keyboard Shortcuts</h3>
              <button className="text-studio-muted hover:text-studio-accent" onClick={() => setShowShortcutsPanel(false)}>✕</button>
            </div>
            <div className="space-y-1.5 text-xs">
              {[
                ["Space", "Play / Pause"],
                ["J", "Seek backward 5s"],
                ["K", "Play / Pause"],
                ["L", "Seek forward 5s"],
                ["I", "Set IN point at playhead"],
                ["O", "Set OUT point at playhead"],
                ["S", "Split clip at playhead (Razor)"],
                ["M", "Add marker at playhead"],
                ["N", "Toggle snap-to-grid"],
                ["Ctrl+Z", "Undo"],
                ["Ctrl+Y / Ctrl+Shift+Z", "Redo"],
                ["Ctrl+C", "Copy selected clip"],
                ["Ctrl+V", "Paste clip"],
                ["Ctrl+=", "Zoom in"],
                ["Ctrl+-", "Zoom out"],
                ["Delete", "Remove selected clip"],
                ["Shift+Delete", "Ripple delete (close gap)"],
                ["Right-click", "Context menu on clip"],
                ["?", "Toggle this panel"],
              ].map(([key, desc]) => (
                <div key={key} className="flex items-center justify-between py-1 border-b border-studio-border/30">
                  <span className="text-studio-muted">{desc}</span>
                  <kbd className="px-1.5 py-0.5 rounded bg-studio-bg border border-studio-border text-studio-accent font-mono text-[10px]">{key}</kbd>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Fullscreen Preview */}
      {fullscreenPreview && (
        <div className="fixed inset-0 z-50 bg-black flex items-center justify-center" onClick={() => setFullscreenPreview(false)}>
          <button className="absolute top-4 right-4 text-white/60 hover:text-white text-2xl" onClick={() => setFullscreenPreview(false)}>✕</button>
          <div className="relative w-full h-full flex items-center justify-center">
            {previewImageUrl ? (
              <img src={previewImageUrl} alt="Fullscreen preview" className="max-w-full max-h-full object-contain" />
            ) : (
              <video ref={videoRef} className="max-w-full max-h-full" playsInline />
            )}
          </div>
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white/60 text-xs font-mono">{formatSMPTE(playheadSeconds)}</div>
        </div>
      )}

      {/* Clip Properties Panel */}
      {showPropertiesPanel && selectedClip && (
        <div className="fixed right-0 top-0 bottom-0 z-40 w-72 bg-studio-panel border-l border-studio-border overflow-y-auto shadow-xl">
          <div className="flex items-center justify-between p-3 border-b border-studio-border">
            <h3 className="text-sm font-medium text-studio-accent">Clip Properties</h3>
            <button className="text-studio-muted hover:text-studio-accent" onClick={() => setShowPropertiesPanel(false)}>✕</button>
          </div>
          <div className="p-3 space-y-3 text-xs">
            <div>
              <label className="text-studio-muted block mb-1">Name</label>
              <input
                className="w-full bg-studio-bg border border-studio-border rounded px-2 py-1 text-white"
                value={selectedClip.name}
                onChange={(e) => {
                  if (selectedTrackType) renameClip(selectedTrackType, selectedClip.id, e.target.value);
                }}
              />
            </div>
            <div>
              <label className="text-studio-muted block mb-1">Source Type</label>
              <div className="text-white">{selectedClip.sourceType}</div>
            </div>
            <div>
              <label className="text-studio-muted block mb-1">Source URL</label>
              <div className="text-studio-muted truncate" title={selectedClip.sourceUrl}>{selectedClip.sourceUrl}</div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-studio-muted block mb-1">Start</label>
                <div className="text-white font-mono">{formatTime(selectedClip.startTime)}</div>
              </div>
              <div>
                <label className="text-studio-muted block mb-1">Duration</label>
                <div className="text-white font-mono">
                  {typeof selectedClip.trimOutSeconds === "number" && selectedClip.trimOutSeconds > (selectedClip.trimInSeconds ?? 0)
                    ? formatTime(selectedClip.trimOutSeconds - (selectedClip.trimInSeconds ?? 0))
                    : typeof selectedClip.mediaDurationSeconds === "number"
                      ? formatTime(selectedClip.mediaDurationSeconds)
                      : "—"}
                </div>
              </div>
              <div>
                <label className="text-studio-muted block mb-1">Trim In</label>
                <div className="text-white font-mono">{formatTime(selectedClip.trimInSeconds)}</div>
              </div>
              <div>
                <label className="text-studio-muted block mb-1">Trim Out</label>
                <div className="text-white font-mono">{typeof selectedClip.trimOutSeconds === "number" ? formatTime(selectedClip.trimOutSeconds) : "end"}</div>
              </div>
            </div>
            {selectedTrackType === "video" && (
              <div>
                <label className="text-studio-muted block mb-1">Speed</label>
                <select
                  className="w-full bg-studio-bg border border-studio-border rounded px-2 py-1 text-white"
                  value={selectedClip.speed || 1}
                  onChange={(e) => {
                    if (selectedTrackType) updateTimelineClip(selectedTrackType, selectedClip.id, { speed: Number(e.target.value) });
                  }}
                >
                  <option value={0.25}>0.25x</option>
                  <option value={0.5}>0.5x</option>
                  <option value={1}>1x (Normal)</option>
                  <option value={1.5}>1.5x</option>
                  <option value={2}>2x</option>
                  <option value={4}>4x</option>
                </select>
              </div>
            )}
            <div>
              <label className="text-studio-muted block mb-1">Volume</label>
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={selectedClip.volume ?? 1}
                  onChange={(e) => {
                    if (selectedTrackType) updateTimelineClip(selectedTrackType, selectedClip.id, { volume: Number(e.target.value) });
                  }}
                  className="flex-1"
                />
                <span className="text-white font-mono w-10 text-right">{Math.round((selectedClip.volume ?? 1) * 100)}%</span>
              </div>
            </div>
            {selectedTrackType === "audio" && (
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-studio-muted block mb-1">Fade In</label>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      min={0}
                      step={0.1}
                      className="w-full bg-studio-bg border border-studio-border rounded px-2 py-1 text-white font-mono"
                      value={selectedClip.fadeInSeconds ?? 0}
                      onChange={(e) => updateTimelineClip("audio", selectedClip.id, { fadeInSeconds: Math.max(0, Number(e.target.value) || 0) })}
                    />
                    <span className="text-studio-muted">s</span>
                  </div>
                </div>
                <div>
                  <label className="text-studio-muted block mb-1">Fade Out</label>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      min={0}
                      step={0.1}
                      className="w-full bg-studio-bg border border-studio-border rounded px-2 py-1 text-white font-mono"
                      value={selectedClip.fadeOutSeconds ?? 0}
                      onChange={(e) => updateTimelineClip("audio", selectedClip.id, { fadeOutSeconds: Math.max(0, Number(e.target.value) || 0) })}
                    />
                    <span className="text-studio-muted">s</span>
                  </div>
                </div>
              </div>
            )}
            {selectedClip.transitionIn && (
              <div>
                <label className="text-studio-muted block mb-1">Transition In</label>
                <div className="flex items-center gap-2">
                  <span className="text-white capitalize">{selectedClip.transitionIn.type.replace("_", " ")}</span>
                  <span className="text-studio-muted font-mono">{selectedClip.transitionIn.durationSeconds.toFixed(1)}s</span>
                  <button
                    className="ml-auto text-red-400 hover:text-red-300"
                    onClick={() => { if (selectedTrackType) updateTimelineClip(selectedTrackType, selectedClip.id, { transitionIn: null }); }}
                    title="Remove transition"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>
            )}
            {selectedClip.transitionOut && (
              <div>
                <label className="text-studio-muted block mb-1">Transition Out</label>
                <div className="flex items-center gap-2">
                  <span className="text-white capitalize">{selectedClip.transitionOut.type.replace("_", " ")}</span>
                  <span className="text-studio-muted font-mono">{selectedClip.transitionOut.durationSeconds.toFixed(1)}s</span>
                  <button
                    className="ml-auto text-red-400 hover:text-red-300"
                    onClick={() => { if (selectedTrackType) updateTimelineClip(selectedTrackType, selectedClip.id, { transitionOut: null }); }}
                    title="Remove transition"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>
            )}
            {selectedClip.groupId && (
              <div>
                <label className="text-studio-muted block mb-1">Linked Group</label>
                <div className="flex items-center gap-2">
                  <span className="text-white font-mono">{selectedClip.groupId}</span>
                  <button
                    className="ml-auto text-red-400 hover:text-red-300 text-[10px]"
                    onClick={() => unlinkClipGroup(selectedClip.id)}
                  >
                    Unlink
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

    </div>
  );
}
