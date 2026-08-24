"use client";

/**
 * DialoguePanel Component
 * 
 * Panel for generating character dialogue audio.
 * Allows text input and generates speech using the audio API.
 */

import { useState, useEffect, useRef } from "react";
import { useStudioStore } from "@/lib/store";
import {
  startAudioJob,
  getAudioStatus,
  getAudioUrl,
  uploadAudioReference,
  listAudioReferences,
  deleteAudioReference,
  listShots,
  Shot,
  uploadFoleyVideo,
  listFoleyVideos,
  FoleyVideo,
} from "@/lib/api";
import {
  Mic,
  Play,
  Pause,
  Loader2,
  Volume2,
  Music,
  StopCircle,
  Upload,
  Trash2,
  ChevronDown,
  AlertCircle,
  Waves,
} from "lucide-react";

// Foley prompt presets for sound effects
const FOLEY_PROMPT_PRESETS = [
  { label: "Footsteps", value: "footsteps walking on ground" },
  { label: "Running", value: "quick running footsteps" },
  { label: "Door", value: "door opening and closing" },
  { label: "Car Engine", value: "car engine running, vehicle sounds" },
  { label: "Wind", value: "wind blowing, air movement" },
  { label: "Rain", value: "rain falling, water droplets" },
  { label: "Thunder", value: "thunder rumbling, storm sounds" },
  { label: "Crowd", value: "crowd murmuring, people talking in background" },
  { label: "Birds", value: "birds chirping, nature sounds" },
  { label: "Ocean", value: "ocean waves, water splashing" },
  { label: "Fire", value: "fire crackling, flames burning" },
  { label: "Glass", value: "glass breaking, shattering" },
  { label: "Metal", value: "metal clanging, metallic sounds" },
  { label: "Cloth", value: "clothing rustling, fabric movement" },
  { label: "Fight", value: "punches, impacts, fighting sounds" },
];

// Music prompt presets organized by category
const MUSIC_PROMPT_PRESETS = {
  genre: [
    { label: "Cinematic Orchestra", value: "cinematic orchestral score" },
    { label: "Electronic/Synth", value: "electronic synth music" },
    { label: "Ambient", value: "ambient atmospheric soundscape" },
    { label: "Jazz", value: "smooth jazz" },
    { label: "Rock", value: "rock music with electric guitar" },
    { label: "Hip Hop Beat", value: "hip hop beat with drums" },
    { label: "Classical", value: "classical piano composition" },
    { label: "Lo-Fi", value: "lo-fi chill beats" },
    { label: "Epic Trailer", value: "epic trailer music with brass and percussion" },
    { label: "Horror/Tension", value: "dark tense horror music" },
  ],
  mood: [
    { label: "Uplifting", value: "uplifting and inspiring" },
    { label: "Melancholic", value: "melancholic and emotional" },
    { label: "Energetic", value: "energetic and fast-paced" },
    { label: "Calm/Peaceful", value: "calm and peaceful" },
    { label: "Suspenseful", value: "suspenseful and tense" },
    { label: "Romantic", value: "romantic and heartfelt" },
    { label: "Mysterious", value: "mysterious and intriguing" },
    { label: "Triumphant", value: "triumphant and victorious" },
    { label: "Sad/Somber", value: "sad and somber" },
    { label: "Playful", value: "playful and lighthearted" },
  ],
  instruments: [
    { label: "Piano", value: "piano" },
    { label: "Strings", value: "strings (violin, cello)" },
    { label: "Guitar", value: "acoustic guitar" },
    { label: "Electric Guitar", value: "electric guitar" },
    { label: "Drums", value: "drums and percussion" },
    { label: "Synth/Pads", value: "synthesizer pads" },
    { label: "Brass", value: "brass section (horns, trumpets)" },
    { label: "Woodwinds", value: "woodwinds (flute, clarinet)" },
    { label: "Bass", value: "bass guitar" },
    { label: "Choir/Vocals", value: "choir vocals" },
  ],
  tempo: [
    { label: "Slow (60-80 BPM)", value: "slow tempo around 70 BPM" },
    { label: "Medium (90-110 BPM)", value: "medium tempo around 100 BPM" },
    { label: "Fast (120-140 BPM)", value: "fast tempo around 130 BPM" },
    { label: "Very Fast (150+ BPM)", value: "very fast tempo around 160 BPM" },
  ],
};

interface AudioJob {
  jobId: string;
  status: "pending" | "processing" | "completed" | "failed";
  audioUrl: string | null;
  videoUrl: string | null;
  errorMessage: string | null;
}

interface DialoguePanelProps {
  projectId?: string;
}

export function DialoguePanel({ projectId = "default" }: DialoguePanelProps) {
  const { bumpAudioLibraryRefresh } = useStudioStore();

  const [audioTab, setAudioTab] = useState<"speech" | "music" | "foley">("speech");
  const [speechClipName, setSpeechClipName] = useState("");
  const [musicClipName, setMusicClipName] = useState("");
  const [foleyClipName, setFoleyClipName] = useState("");
  const [speechText, setSpeechText] = useState("");
  const [musicPrompt, setMusicPrompt] = useState("");
  const [foleyPrompt, setFoleyPrompt] = useState("");
  const [foleyVideoFilename, setFoleyVideoFilename] = useState("");
  const [foleyVideoSource, setFoleyVideoSource] = useState<"library" | "upload">("library");
  const [availableVideos, setAvailableVideos] = useState<{ id: string; name: string; video_path: string }[]>([]);
  const [uploadedFoleyVideos, setUploadedFoleyVideos] = useState<FoleyVideo[]>([]);
  const [isUploadingFoleyVideo, setIsUploadingFoleyVideo] = useState(false);
  const [speechGenerator, setSpeechGenerator] = useState<"fish_speech" | "chatterbox_tts">("chatterbox_tts");
  const [musicDuration, setMusicDuration] = useState(10);
  const [referenceFilename, setReferenceFilename] = useState<string | null>(null);
  const [isUploadingReference, setIsUploadingReference] = useState(false);
  const [referenceLibrary, setReferenceLibrary] = useState<{ filename: string }[]>([]);
  const [speechJob, setSpeechJob] = useState<AudioJob | null>(null);
  const [musicJob, setMusicJob] = useState<AudioJob | null>(null);
  const [foleyJob, setFoleyJob] = useState<AudioJob | null>(null);
  const [isSubmittingSpeech, setIsSubmittingSpeech] = useState(false);
  const [isSubmittingMusic, setIsSubmittingMusic] = useState(false);
  const [isSubmittingFoley, setIsSubmittingFoley] = useState(false);
  const [activeAudioUrl, setActiveAudioUrl] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const shouldAutoPlayRef = useRef(false);
  const notifiedCompletedJobsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        const refs = await listAudioReferences(projectId);
        if (cancelled) return;
        setReferenceLibrary((refs.files || []).map((f) => ({ filename: f.filename })));
      } catch (e) {
        console.error(e);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  // Load available videos from shots for foley
  useEffect(() => {
    let cancelled = false;
    const loadVideos = async () => {
      try {
        const res = await listShots(projectId);
        if (cancelled) return;
        const videosWithPath = (res as Shot[])
          .filter((s) => s.video_clip_path)
          .map((s) => ({
            id: s.id,
            name: s.name || `Shot ${s.sequence_order}`,
            video_path: s.video_clip_path!,
          }));
        setAvailableVideos(videosWithPath);
      } catch (e) {
        console.error("Failed to load videos for foley:", e);
      }
    };
    void loadVideos();
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  // Load uploaded foley videos
  useEffect(() => {
    let cancelled = false;
    const loadUploadedVideos = async () => {
      try {
        const res = await listFoleyVideos(projectId);
        if (cancelled) return;
        setUploadedFoleyVideos(res.videos || []);
      } catch (e) {
        console.error("Failed to load uploaded foley videos:", e);
      }
    };
    void loadUploadedVideos();
    return () => {
      cancelled = true;
    };
  }, [projectId]);
  
  // Poll for job status
  useEffect(() => {
    if (!speechJob) return;
    if (speechJob.status === "completed" || speechJob.status === "failed") return;
    
    let speechPollErrors = 0;
    const pollInterval = setInterval(async () => {
      try {
        const status = await getAudioStatus(speechJob.jobId);
        speechPollErrors = 0;
        
        setSpeechJob({
          jobId: speechJob.jobId,
          status: status.status,
          audioUrl: status.audio_url || null,
          videoUrl: status.video_url || null,
          errorMessage: status.error_message || null,
        });
      } catch (err) {
        speechPollErrors++;
        console.error("Failed to poll audio status:", err);
        if (speechPollErrors >= 5) {
          clearInterval(pollInterval);
          setSpeechJob({
            jobId: speechJob.jobId,
            status: "failed",
            audioUrl: null,
            videoUrl: null,
            errorMessage: "Lost connection to backend while polling.",
          });
        }
      }
    }, 1000);
    
    return () => clearInterval(pollInterval);
  }, [speechJob]);

  useEffect(() => {
    if (!musicJob) return;
    if (musicJob.status === "completed" || musicJob.status === "failed") return;

    let musicPollErrors = 0;
    const pollInterval = setInterval(async () => {
      try {
        const status = await getAudioStatus(musicJob.jobId);
        musicPollErrors = 0;
        setMusicJob({
          jobId: musicJob.jobId,
          status: status.status,
          audioUrl: status.audio_url || null,
          videoUrl: status.video_url || null,
          errorMessage: status.error_message || null,
        });
      } catch (err) {
        musicPollErrors++;
        console.error("Failed to poll audio status:", err);
        if (musicPollErrors >= 5) {
          clearInterval(pollInterval);
          setMusicJob({
            jobId: musicJob.jobId,
            status: "failed",
            audioUrl: null,
            videoUrl: null,
            errorMessage: "Lost connection to backend while polling.",
          });
        }
      }
    }, 1000);

    return () => clearInterval(pollInterval);
  }, [musicJob]);

  useEffect(() => {
    if (!speechJob || speechJob.status !== "completed" || !speechJob.audioUrl) return;
    if (notifiedCompletedJobsRef.current.has(speechJob.jobId)) return;
    notifiedCompletedJobsRef.current.add(speechJob.jobId);
    bumpAudioLibraryRefresh();
  }, [speechJob, bumpAudioLibraryRefresh]);

  useEffect(() => {
    if (!musicJob || musicJob.status !== "completed" || !musicJob.audioUrl) return;
    if (notifiedCompletedJobsRef.current.has(musicJob.jobId)) return;
    notifiedCompletedJobsRef.current.add(musicJob.jobId);
    bumpAudioLibraryRefresh();
  }, [musicJob, bumpAudioLibraryRefresh]);

  // Poll foley job status
  useEffect(() => {
    if (!foleyJob || foleyJob.status === "completed" || foleyJob.status === "failed") return;

    let foleyPollErrors = 0;
    const pollInterval = setInterval(async () => {
      try {
        const status = await getAudioStatus(foleyJob.jobId);
        foleyPollErrors = 0;
        setFoleyJob({
          jobId: foleyJob.jobId,
          status: status.status,
          audioUrl: status.audio_url || null,
          videoUrl: status.video_url || null,
          errorMessage: status.error_message || null,
        });
      } catch (err) {
        foleyPollErrors++;
        console.error("Failed to poll foley status:", err);
        if (foleyPollErrors >= 5) {
          clearInterval(pollInterval);
          setFoleyJob({
            jobId: foleyJob.jobId,
            status: "failed",
            audioUrl: null,
            videoUrl: null,
            errorMessage: "Lost connection to backend while polling.",
          });
        }
      }
    }, 2000);

    return () => clearInterval(pollInterval);
  }, [foleyJob]);

  useEffect(() => {
    if (!foleyJob || foleyJob.status !== "completed" || !foleyJob.audioUrl) return;
    if (notifiedCompletedJobsRef.current.has(foleyJob.jobId)) return;
    notifiedCompletedJobsRef.current.add(foleyJob.jobId);
    bumpAudioLibraryRefresh();
  }, [foleyJob, bumpAudioLibraryRefresh]);

  useEffect(() => {
    if (!activeAudioUrl) return;
    if (!audioRef.current) return;
    if (!shouldAutoPlayRef.current) return;
    shouldAutoPlayRef.current = false;

    const playPromise = audioRef.current.play();
    if (playPromise && typeof (playPromise as Promise<void>).catch === "function") {
      (playPromise as Promise<void>).catch((e: any) => {
        if (e?.name === "AbortError") return;
        console.error(e);
      });
    }
  }, [activeAudioUrl]);
  
  const handleGenerateSpeech = async () => {
    if (!speechText.trim()) {
      setError("Please enter dialogue text");
      return;
    }

    setIsSubmittingSpeech(true);
    setError(null);

    try {
      const response = await startAudioJob({
        project_id: projectId,
        clip_name: speechClipName.trim() || undefined,
        text: speechText,
        generator: speechGenerator,
        reference_audio_filename: speechGenerator === "chatterbox_tts" ? referenceFilename || undefined : undefined,
        use_mock: false,
      });

      setSpeechJob({
        jobId: response.job_id,
        status: "pending",
        audioUrl: null,
        videoUrl: null,
        errorMessage: null,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate speech");
    } finally {
      setIsSubmittingSpeech(false);
    }
  };

  const handleGenerateMusic = async () => {
    if (!musicPrompt.trim()) {
      setError("Please enter a music prompt");
      return;
    }

    setIsSubmittingMusic(true);
    setError(null);

    try {
      const response = await startAudioJob({
        project_id: projectId,
        clip_name: musicClipName.trim() || undefined,
        text: musicPrompt,
        generator: "stable_audio_music",
        duration_seconds: musicDuration,
        use_mock: false,
      });

      setMusicJob({
        jobId: response.job_id,
        status: "pending",
        audioUrl: null,
        videoUrl: null,
        errorMessage: null,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate music");
    } finally {
      setIsSubmittingMusic(false);
    }
  };

  const handleGenerateFoley = async () => {
    if (!foleyPrompt.trim()) {
      setError("Please enter a foley prompt describing the sound effects");
      return;
    }
    if (!foleyVideoFilename.trim()) {
      setError("Please enter the video filename for foley generation");
      return;
    }

    setIsSubmittingFoley(true);
    setError(null);

    try {
      const response = await startAudioJob({
        project_id: projectId,
        clip_name: foleyClipName.trim() || undefined,
        text: foleyPrompt,
        generator: "hunyuan_foley",
        input_video_filename: foleyVideoFilename.trim(),
        use_mock: false,
      });

      setFoleyJob({
        jobId: response.job_id,
        status: "pending",
        audioUrl: null,
        videoUrl: null,
        errorMessage: null,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate foley");
    } finally {
      setIsSubmittingFoley(false);
    }
  };
  
  // Handle audio playback
  const handlePlayPause = (audioUrl: string) => {
    if (!audioRef.current) return;

    const isSame = activeAudioUrl === audioUrl;

    if (isSame && isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
      return;
    }

    // If switching source, defer play until after React updates <audio src=...>
    if (!isSame) {
      shouldAutoPlayRef.current = true;
      setActiveAudioUrl(audioUrl);
      return;
    }

    const playPromise = audioRef.current.play();
    if (playPromise && typeof (playPromise as Promise<void>).catch === "function") {
      (playPromise as Promise<void>).catch((e: any) => {
        if (e?.name === "AbortError") return;
        console.error(e);
      });
    }
  };
  
  const handleStop = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      setIsPlaying(false);
    }
  };
  
  const label = "text-[11px] font-semibold text-studio-muted uppercase tracking-wider mb-1.5 block";
  const input = "w-full px-3 py-2.5 bg-studio-panel border border-studio-border rounded-lg text-sm text-studio-text focus:outline-none focus:border-studio-accent transition-colors";
  const textarea = "w-full px-3 py-2.5 bg-studio-panel border border-studio-border rounded-lg text-sm text-studio-text focus:outline-none focus:border-studio-accent resize-none transition-colors";

  const renderStatusBadge = (job: AudioJob | null) => {
    if (!job) return <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-studio-border/50 text-studio-muted">Idle</span>;
    if (job.status === "pending") return <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-yellow-500/10 text-yellow-400 border border-yellow-500/20">Queued</span>;
    if (job.status === "processing") {
      return (
        <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20 inline-flex items-center gap-1">
          <Loader2 className="w-2.5 h-2.5 animate-spin" />
          Generating
        </span>
      );
    }
    if (job.status === "completed") return <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-green-500/10 text-green-400 border border-green-500/20">Ready</span>;
    return <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-red-500/10 text-red-400 border border-red-500/20">Failed</span>;
  };

  const renderAudioControls = (job: AudioJob | null) => {
    if (job?.status === "completed" && job.audioUrl) {
      return (
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => handlePlayPause(job.audioUrl!)}
            className="h-8 w-8 inline-flex items-center justify-center rounded-lg bg-studio-accent/10 hover:bg-studio-accent/20 text-studio-accent transition-colors"
            title={isPlaying && activeAudioUrl === job.audioUrl ? "Pause" : "Play"}
          >
            {isPlaying && activeAudioUrl === job.audioUrl ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
          </button>
          <button
            onClick={handleStop}
            className="h-8 w-8 inline-flex items-center justify-center rounded-lg bg-studio-panel hover:bg-studio-border/40 text-studio-muted hover:text-studio-text transition-colors"
            title="Stop"
          >
            <StopCircle className="w-4 h-4" />
          </button>
        </div>
      );
    }
    return null;
  };

  const AUDIO_TABS = [
    { id: "speech" as const, label: "Speech", icon: Mic },
    { id: "music" as const, label: "Music", icon: Music },
    { id: "foley" as const, label: "Foley", icon: Waves },
  ];

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-2xl mx-auto p-6">
        {/* ===== Tab Bar ===== */}
        <div className="flex gap-1 mb-5 p-1 bg-studio-panel rounded-xl border border-studio-border">
          {AUDIO_TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = audioTab === tab.id;
            const tabJob = tab.id === "speech" ? speechJob : tab.id === "music" ? musicJob : foleyJob;
            const hasResult = tabJob?.status === "completed";
            return (
              <button
                key={tab.id}
                onClick={() => setAudioTab(tab.id)}
                className={`flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  isActive
                    ? "bg-studio-accent text-white shadow-md shadow-studio-accent/20"
                    : "text-studio-muted hover:text-studio-text hover:bg-studio-panelHover"
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
                {hasResult && (
                  <span className={`w-1.5 h-1.5 rounded-full ${isActive ? "bg-white/70" : "bg-green-400"}`} />
                )}
              </button>
            );
          })}
        </div>

        {/* ===== Error Alert ===== */}
        {error && (
          <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-xl flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
            <p className="text-xs text-red-400">{error}</p>
          </div>
        )}

        {/* ===== Speech Tab ===== */}
        {audioTab === "speech" && (
          <div className="space-y-5">
            {/* Status + playback header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {renderStatusBadge(speechJob)}
                {speechJob?.status === "failed" && speechJob.errorMessage && (
                  <span className="text-xs text-red-400 truncate max-w-[300px]">{speechJob.errorMessage}</span>
                )}
              </div>
              {renderAudioControls(speechJob)}
            </div>

            {/* Engine + Clip Name */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={label}>Engine</label>
                <select value={speechGenerator} onChange={(e) => setSpeechGenerator(e.target.value as any)} className={input}>
                  <option value="chatterbox_tts">Chatterbox TTS</option>
                  <option value="fish_speech">Fish Speech</option>
                </select>
              </div>
              <div>
                <label className={label}>Clip Name <span className="opacity-50 normal-case">(optional)</span></label>
                <input
                  value={speechClipName}
                  onChange={(e) => setSpeechClipName(e.target.value)}
                  placeholder="e.g. Narrator Line 1"
                  className={input}
                />
              </div>
            </div>

            {/* Reference Voice (chatterbox only) */}
            {speechGenerator === "chatterbox_tts" && (
              <div className="p-4 bg-studio-bg rounded-xl border border-studio-border space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-studio-muted uppercase tracking-wider">Reference Voice</label>
                  <span className={"text-[10px] font-medium px-2 py-0.5 rounded-full " + (referenceFilename ? "bg-green-500/10 text-green-400" : "bg-studio-border/50 text-studio-muted")}>
                    {isUploadingReference ? "Uploading..." : referenceFilename ? "Selected" : "None"}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] text-studio-muted mb-1 block">Voice Library</label>
                    <select
                      value={referenceFilename || ""}
                      onChange={(e) => setReferenceFilename(e.target.value || null)}
                      className={input}
                      disabled={isUploadingReference}
                    >
                      <option value="">None</option>
                      {referenceLibrary.map((r) => (
                        <option key={r.filename} value={r.filename}>{r.filename}</option>
                      ))}
                    </select>
                    {referenceFilename && (
                      <button
                        onClick={async () => {
                          if (!referenceFilename) return;
                          const ok = window.confirm(`Delete reference voice "${referenceFilename}"?`);
                          if (!ok) return;
                          setIsUploadingReference(true);
                          setError(null);
                          try {
                            await deleteAudioReference(projectId, referenceFilename);
                            setReferenceLibrary((prev) => prev.filter((p) => p.filename !== referenceFilename));
                            setReferenceFilename(null);
                          } catch (err) {
                            setError(err instanceof Error ? err.message : "Failed to delete reference audio");
                          } finally {
                            setIsUploadingReference(false);
                          }
                        }}
                        disabled={!referenceFilename || isUploadingReference}
                        className="mt-2 text-xs text-studio-muted hover:text-red-400 inline-flex items-center gap-1 transition-colors"
                        type="button"
                      >
                        <Trash2 className="w-3 h-3" /> Delete selected
                      </button>
                    )}
                  </div>

                  <div>
                    <label className="text-[11px] text-studio-muted mb-1 block">Upload New</label>
                    <div className="relative">
                      <input
                        type="file"
                        accept="audio/*"
                        onChange={async (e) => {
                          const f = e.target.files?.[0];
                          if (!f) return;
                          setIsUploadingReference(true);
                          setError(null);
                          try {
                            const res = await uploadAudioReference(projectId, f);
                            setReferenceFilename(res.filename);
                            setReferenceLibrary((prev) => [{ filename: res.filename }, ...prev.filter((p) => p.filename !== res.filename)]);
                          } catch (err) {
                            setReferenceFilename(null);
                            setError(err instanceof Error ? err.message : "Failed to upload reference audio");
                          } finally {
                            setIsUploadingReference(false);
                          }
                        }}
                        className="hidden"
                        id="ref-voice-upload"
                        disabled={isUploadingReference}
                      />
                      <label
                        htmlFor="ref-voice-upload"
                        className="flex items-center justify-center gap-2 h-10 px-3 rounded-lg border border-dashed border-studio-border hover:border-studio-accent/50 text-xs text-studio-muted hover:text-studio-accent cursor-pointer transition-colors"
                      >
                        <Upload className="w-3.5 h-3.5" />
                        {isUploadingReference ? "Uploading..." : "Choose file"}
                      </label>
                    </div>
                    <p className="mt-1.5 text-[10px] text-studio-muted/60">Staged into ComfyUI input folder</p>
                  </div>
                </div>
              </div>
            )}

            {/* Dialogue Text */}
            <div>
              <label className={label}>Dialogue Text</label>
              <textarea
                value={speechText}
                onChange={(e) => setSpeechText(e.target.value)}
                placeholder="Enter the dialogue you want to generate..."
                rows={4}
                className={textarea}
                disabled={isSubmittingSpeech || speechJob?.status === "processing"}
              />
            </div>

            {/* Generate */}
            <button
              onClick={handleGenerateSpeech}
              disabled={isSubmittingSpeech || speechJob?.status === "processing" || !speechText.trim()}
              className="w-full flex items-center justify-center gap-2 px-6 py-3.5 bg-studio-accent hover:bg-studio-accentHover disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl font-medium transition-all"
            >
              {isSubmittingSpeech || speechJob?.status === "processing" ? (
                <><Loader2 className="w-5 h-5 animate-spin" /> Generating...</>
              ) : (
                <><Volume2 className="w-5 h-5" /> Generate Speech</>
              )}
            </button>
          </div>
        )}

        {/* ===== Music Tab ===== */}
        {audioTab === "music" && (
          <div className="space-y-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {renderStatusBadge(musicJob)}
                {musicJob?.status === "failed" && musicJob.errorMessage && (
                  <span className="text-xs text-red-400 truncate max-w-[300px]">{musicJob.errorMessage}</span>
                )}
              </div>
              {renderAudioControls(musicJob)}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={label}>Engine</label>
                <div className="px-3 py-2.5 bg-studio-panel border border-studio-border rounded-lg text-sm text-studio-muted">
                  Stable Audio
                </div>
              </div>
              <div>
                <label className={label}>Clip Name <span className="opacity-50 normal-case">(optional)</span></label>
                <input
                  value={musicClipName}
                  onChange={(e) => setMusicClipName(e.target.value)}
                  placeholder="e.g. Opening Theme"
                  className={input}
                />
              </div>
            </div>

            {/* Duration */}
            <div>
              <label className={label}>Duration</label>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min={1}
                  max={60}
                  value={musicDuration}
                  onChange={(e) => setMusicDuration(Number(e.target.value) || 10)}
                  className="flex-1 accent-studio-accent"
                />
                <span className="text-sm text-studio-text font-medium w-16 text-right">{musicDuration}s</span>
              </div>
            </div>

            {/* Prompt builder */}
            <div className="p-4 bg-studio-bg rounded-xl border border-studio-border space-y-3">
              <label className="text-xs font-semibold text-studio-muted uppercase tracking-wider">Prompt Builder</label>
              <div className="flex flex-wrap gap-2">
                {([
                  { group: "Genre", items: MUSIC_PROMPT_PRESETS.genre },
                  { group: "Mood", items: MUSIC_PROMPT_PRESETS.mood },
                  { group: "Instruments", items: MUSIC_PROMPT_PRESETS.instruments },
                  { group: "Tempo", items: MUSIC_PROMPT_PRESETS.tempo },
                ] as const).map(({ group, items }) => (
                  <div key={group} className="relative">
                    <select
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val) setMusicPrompt((prev) => prev.trim() ? `${prev.trim()}, ${val}` : val);
                        e.target.selectedIndex = 0;
                      }}
                      className="h-8 pl-3 pr-8 text-xs rounded-lg border border-studio-border bg-studio-panel text-studio-text appearance-none cursor-pointer hover:border-studio-accent/50 transition-colors"
                      disabled={isSubmittingMusic || musicJob?.status === "processing"}
                    >
                      <option value="">{group}</option>
                      {items.map((p) => (
                        <option key={p.value} value={p.value}>{p.label}</option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-studio-muted pointer-events-none" />
                  </div>
                ))}
                {musicPrompt && (
                  <button
                    onClick={() => setMusicPrompt("")}
                    className="h-8 px-3 text-xs rounded-lg border border-studio-border bg-studio-panel text-studio-muted hover:text-red-400 hover:border-red-400/30 transition-colors"
                    type="button"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>

            {/* Prompt textarea */}
            <div>
              <label className={label}>Prompt</label>
              <textarea
                value={musicPrompt}
                onChange={(e) => setMusicPrompt(e.target.value)}
                placeholder="Describe the music you want... (use the prompt builder above or type directly)"
                rows={3}
                className={textarea}
                disabled={isSubmittingMusic || musicJob?.status === "processing"}
              />
            </div>

            <button
              onClick={handleGenerateMusic}
              disabled={isSubmittingMusic || musicJob?.status === "processing" || !musicPrompt.trim()}
              className="w-full flex items-center justify-center gap-2 px-6 py-3.5 bg-studio-accent hover:bg-studio-accentHover disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl font-medium transition-all"
            >
              {isSubmittingMusic || musicJob?.status === "processing" ? (
                <><Loader2 className="w-5 h-5 animate-spin" /> Generating...</>
              ) : (
                <><Music className="w-5 h-5" /> Generate Music</>
              )}
            </button>
          </div>
        )}

        {/* ===== Foley Tab ===== */}
        {audioTab === "foley" && (
          <div className="space-y-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {renderStatusBadge(foleyJob)}
                {foleyJob?.status === "failed" && foleyJob.errorMessage && (
                  <span className="text-xs text-red-400 truncate max-w-[300px]">{foleyJob.errorMessage}</span>
                )}
              </div>
              {renderAudioControls(foleyJob)}
            </div>

            {/* Video result preview */}
            {foleyJob?.status === "completed" && foleyJob.videoUrl && (
              <div className="rounded-xl border border-studio-border overflow-hidden bg-black">
                <video
                  src={getAudioUrl(foleyJob.videoUrl)}
                  controls
                  className="w-full max-h-[280px] object-contain"
                />
                <div className="p-2.5 bg-studio-panel text-xs text-studio-muted flex items-center justify-between">
                  <span>Video with Foley Audio</span>
                  <a
                    href={getAudioUrl(foleyJob.videoUrl)}
                    download
                    className="text-studio-accent hover:text-white transition-colors font-medium"
                  >
                    Download
                  </a>
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={label}>Engine</label>
                <div className="px-3 py-2.5 bg-studio-panel border border-studio-border rounded-lg text-sm text-studio-muted">
                  Hunyuan Foley
                </div>
              </div>
              <div>
                <label className={label}>Clip Name <span className="opacity-50 normal-case">(optional)</span></label>
                <input
                  value={foleyClipName}
                  onChange={(e) => setFoleyClipName(e.target.value)}
                  placeholder="e.g. Scene 1 Ambience"
                  className={input}
                />
              </div>
            </div>

            {/* Video Source */}
            <div>
              <label className={label}>Video Source</label>
              <div className="flex gap-2 mb-3">
                <button
                  type="button"
                  onClick={() => { setFoleyVideoSource("library"); setFoleyVideoFilename(""); }}
                  className={`flex-1 h-9 text-xs font-medium rounded-lg border transition-colors ${
                    foleyVideoSource === "library"
                      ? "border-studio-accent bg-studio-accent/10 text-studio-accent"
                      : "border-studio-border bg-studio-panel text-studio-muted hover:text-studio-text hover:bg-studio-panelHover"
                  }`}
                >
                  From Library
                </button>
                <button
                  type="button"
                  onClick={() => { setFoleyVideoSource("upload"); setFoleyVideoFilename(""); }}
                  className={`flex-1 h-9 text-xs font-medium rounded-lg border transition-colors ${
                    foleyVideoSource === "upload"
                      ? "border-studio-accent bg-studio-accent/10 text-studio-accent"
                      : "border-studio-border bg-studio-panel text-studio-muted hover:text-studio-text hover:bg-studio-panelHover"
                  }`}
                >
                  Upload New
                </button>
              </div>

              {foleyVideoSource === "library" && (
                <div className="relative">
                  <select
                    value={foleyVideoFilename}
                    onChange={(e) => setFoleyVideoFilename(e.target.value)}
                    className="w-full h-10 pl-3 pr-8 text-sm rounded-lg border border-studio-border bg-studio-panel text-studio-text appearance-none cursor-pointer hover:border-studio-accent/50 transition-colors"
                    disabled={isSubmittingFoley || foleyJob?.status === "processing"}
                  >
                    <option value="">Select a video...</option>
                    {availableVideos.length > 0 && (
                      <optgroup label="Shot Videos">
                        {availableVideos.map((v) => (
                          <option key={v.id} value={v.video_path?.split("/").pop() || v.video_path}>
                            {v.name}
                          </option>
                        ))}
                      </optgroup>
                    )}
                    {uploadedFoleyVideos.length > 0 && (
                      <optgroup label="Uploaded Videos">
                        {uploadedFoleyVideos.map((v) => (
                          <option key={v.filename} value={v.filename}>{v.filename}</option>
                        ))}
                      </optgroup>
                    )}
                  </select>
                  <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-studio-muted pointer-events-none" />
                </div>
              )}

              {foleyVideoSource === "upload" && (
                <div className="space-y-2">
                  <div className="relative">
                    <input
                      type="file"
                      accept="video/mp4,video/mov,video/avi,video/mkv,video/webm"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        setIsUploadingFoleyVideo(true);
                        setError(null);
                        try {
                          const result = await uploadFoleyVideo(projectId, file);
                          setFoleyVideoFilename(result.filename);
                          const res = await listFoleyVideos(projectId);
                          setUploadedFoleyVideos(res.videos || []);
                        } catch (err) {
                          setError(err instanceof Error ? err.message : "Failed to upload video");
                        } finally {
                          setIsUploadingFoleyVideo(false);
                        }
                      }}
                      className="hidden"
                      id="foley-video-upload"
                      disabled={isSubmittingFoley || foleyJob?.status === "processing" || isUploadingFoleyVideo}
                    />
                    <label
                      htmlFor="foley-video-upload"
                      className="flex items-center justify-center gap-2 h-10 px-3 rounded-lg border border-dashed border-studio-border hover:border-studio-accent/50 text-sm text-studio-muted hover:text-studio-accent cursor-pointer transition-colors"
                    >
                      <Upload className="w-4 h-4" />
                      {isUploadingFoleyVideo ? "Uploading..." : "Choose video file"}
                    </label>
                  </div>
                  {foleyVideoFilename && !isUploadingFoleyVideo && (
                    <div className="text-xs text-green-400 flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
                      Using: {foleyVideoFilename}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Sound presets */}
            <div className="p-4 bg-studio-bg rounded-xl border border-studio-border space-y-3">
              <label className="text-xs font-semibold text-studio-muted uppercase tracking-wider">Sound Presets</label>
              <div className="flex flex-wrap gap-2">
                <div className="relative">
                  <select
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val) setFoleyPrompt((prev) => prev.trim() ? `${prev.trim()}, ${val}` : val);
                      e.target.selectedIndex = 0;
                    }}
                    className="h-8 pl-3 pr-8 text-xs rounded-lg border border-studio-border bg-studio-panel text-studio-text appearance-none cursor-pointer hover:border-studio-accent/50 transition-colors"
                    disabled={isSubmittingFoley || foleyJob?.status === "processing"}
                  >
                    <option value="">Add Sound...</option>
                    {FOLEY_PROMPT_PRESETS.map((p) => (
                      <option key={p.value} value={p.value}>{p.label}</option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-studio-muted pointer-events-none" />
                </div>
                {foleyPrompt && (
                  <button
                    onClick={() => setFoleyPrompt("")}
                    className="h-8 px-3 text-xs rounded-lg border border-studio-border bg-studio-panel text-studio-muted hover:text-red-400 hover:border-red-400/30 transition-colors"
                    type="button"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>

            {/* Prompt */}
            <div>
              <label className={label}>Foley Prompt</label>
              <textarea
                value={foleyPrompt}
                onChange={(e) => setFoleyPrompt(e.target.value)}
                placeholder="Describe the sound effects for the video... (e.g., footsteps on gravel, wind blowing, door creaking)"
                rows={3}
                className={textarea}
                disabled={isSubmittingFoley || foleyJob?.status === "processing"}
              />
            </div>

            <button
              onClick={handleGenerateFoley}
              disabled={isSubmittingFoley || foleyJob?.status === "processing" || !foleyPrompt.trim() || !foleyVideoFilename.trim()}
              className="w-full flex items-center justify-center gap-2 px-6 py-3.5 bg-studio-accent hover:bg-studio-accentHover disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl font-medium transition-all"
            >
              {isSubmittingFoley || foleyJob?.status === "processing" ? (
                <><Loader2 className="w-5 h-5 animate-spin" /> Generating...</>
              ) : (
                <><Waves className="w-5 h-5" /> Generate Foley</>
              )}
            </button>
          </div>
        )}
      </div>

      <audio
        ref={audioRef}
        src={activeAudioUrl ? getAudioUrl(activeAudioUrl) : undefined}
        onEnded={() => setIsPlaying(false)}
        onPause={() => setIsPlaying(false)}
        onPlay={() => setIsPlaying(true)}
      />
    </div>
  );
}
