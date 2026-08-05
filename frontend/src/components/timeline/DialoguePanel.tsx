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
  AudioJobStatus,
} from "@/lib/api";
import { 
  Mic, 
  Play, 
  Pause,
  Loader2, 
  Volume2,
  User,
  StopCircle,
  Upload,
  Trash2,
  ChevronDown,
  Film,
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
    
    const pollInterval = setInterval(async () => {
      try {
        const status = await getAudioStatus(speechJob.jobId);
        
        setSpeechJob({
          jobId: speechJob.jobId,
          status: status.status,
          audioUrl: status.audio_url || null,
          videoUrl: status.video_url || null,
          errorMessage: status.error_message || null,
        });
      } catch (err) {
        console.error("Failed to poll audio status:", err);
      }
    }, 1000);
    
    return () => clearInterval(pollInterval);
  }, [speechJob]);

  useEffect(() => {
    if (!musicJob) return;
    if (musicJob.status === "completed" || musicJob.status === "failed") return;

    const pollInterval = setInterval(async () => {
      try {
        const status = await getAudioStatus(musicJob.jobId);
        setMusicJob({
          jobId: musicJob.jobId,
          status: status.status,
          audioUrl: status.audio_url || null,
          videoUrl: status.video_url || null,
          errorMessage: status.error_message || null,
        });
      } catch (err) {
        console.error("Failed to poll audio status:", err);
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

    const pollInterval = setInterval(async () => {
      try {
        const status = await getAudioStatus(foleyJob.jobId);
        setFoleyJob({
          jobId: foleyJob.jobId,
          status: status.status,
          audioUrl: status.audio_url || null,
          videoUrl: status.video_url || null,
          errorMessage: status.error_message || null,
        });
      } catch (err) {
        console.error("Failed to poll foley status:", err);
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
  
  const card = "bg-studio-bg border border-studio-border rounded-lg p-4";
  const label = "text-[11px] font-medium text-studio-muted mb-1 block";
  const input = "w-full px-3 py-2 bg-studio-panel border border-studio-border rounded-lg text-sm focus:outline-none focus:border-studio-accent";
  const textarea = "w-full px-3 py-2 bg-studio-panel border border-studio-border rounded-lg text-sm focus:outline-none focus:border-studio-accent resize-none";

  const renderStatus = (job: AudioJob | null) => {
    if (!job) return <span className="text-[11px] text-studio-muted">Idle</span>;
    if (job.status === "pending") return <span className="text-[11px] text-yellow-400">Queued</span>;
    if (job.status === "processing") {
      return (
        <span className="text-[11px] text-blue-400 inline-flex items-center gap-1">
          <Loader2 className="w-3 h-3 animate-spin" />
          Generating
        </span>
      );
    }
    if (job.status === "completed") return <span className="text-[11px] text-green-400">Ready</span>;
    return <span className="text-[11px] text-red-400">Failed</span>;
  };
  
  return (
    <div className="bg-studio-panel border-t border-studio-border p-4 h-full flex flex-col">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className={card}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Mic className="w-4 h-4 text-studio-muted" />
              Speech
            </div>
            <div className="flex items-center gap-3">
              {renderStatus(speechJob)}
              {speechJob?.status === "failed" && speechJob.errorMessage && (
                <span className="text-[11px] text-red-400 max-w-[260px] truncate">{speechJob.errorMessage}</span>
              )}
              {speechJob?.status === "completed" && speechJob.audioUrl && (
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => handlePlayPause(speechJob.audioUrl!)}
                    className="h-7 w-7 inline-flex items-center justify-center rounded border border-studio-border bg-studio-panel hover:border-studio-accent/50 hover:bg-studio-border/40 transition-colors"
                    title={isPlaying && activeAudioUrl === speechJob.audioUrl ? "Pause" : "Play"}
                  >
                    {isPlaying && activeAudioUrl === speechJob.audioUrl ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                  </button>
                  <button
                    onClick={handleStop}
                    className="h-7 w-7 inline-flex items-center justify-center rounded border border-studio-border bg-studio-panel hover:border-studio-accent/50 hover:bg-studio-border/40 transition-colors"
                    title="Stop"
                  >
                    <StopCircle className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className={label}>Engine</label>
              <select value={speechGenerator} onChange={(e) => setSpeechGenerator(e.target.value as any)} className={input}>
                <option value="chatterbox_tts">Chatterbox TTS</option>
                <option value="fish_speech">Fish Speech</option>
              </select>
            </div>

            <div>
              <label className={label}>Clip Name</label>
              <input
                value={speechClipName}
                onChange={(e) => setSpeechClipName(e.target.value)}
                placeholder="Optional"
                className={input}
              />
            </div>

            <div>
              <label className={label}>Generate</label>
              <button
                onClick={handleGenerateSpeech}
                disabled={isSubmittingSpeech || speechJob?.status === "processing" || !speechText.trim()}
                className="w-full h-10 flex items-center justify-center gap-2 rounded-lg bg-studio-accent hover:bg-studio-accent/80 disabled:bg-studio-border disabled:text-studio-muted text-sm font-medium transition-colors"
              >
                {isSubmittingSpeech || speechJob?.status === "processing" ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Generating
                  </>
                ) : (
                  <>
                    <Volume2 className="w-4 h-4" />
                    Generate
                  </>
                )}
              </button>
            </div>
          </div>

          {speechGenerator === "chatterbox_tts" && (
            <div className="mt-3">
              <div className="flex items-center justify-between">
                <label className={label}>Reference Voice (optional)</label>
                <span className={"text-[11px] " + (referenceFilename ? "text-green-400" : "text-studio-muted")}>
                  {isUploadingReference ? "Uploading..." : referenceFilename ? referenceFilename : "No reference"}
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className={label}>Voice Library</label>
                  <select
                    value={referenceFilename || ""}
                    onChange={async (e) => {
                      const filename = e.target.value || null;
                      setReferenceFilename(filename);
                    }}
                    className={input}
                    disabled={isUploadingReference}
                  >
                    <option value="">None</option>
                    {referenceLibrary.map((r) => (
                      <option key={r.filename} value={r.filename}>
                        {r.filename}
                      </option>
                    ))}
                  </select>

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
                    className="mt-2 h-8 px-2 inline-flex items-center justify-center rounded border border-transparent bg-transparent text-xs text-studio-muted hover:text-red-300 hover:border-studio-border hover:bg-studio-border/40 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    title={referenceFilename ? `Delete ${referenceFilename}` : "Delete selected reference"}
                    type="button"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div>
                  <label className={label}>Upload New</label>
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
                    className="text-xs text-studio-muted"
                    disabled={isUploadingReference}
                  />
                  <div className="mt-1 flex items-center gap-1 text-[11px] text-studio-muted">
                    <Upload className="w-3 h-3" />
                    Staged into ComfyUI input folder
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="mt-3">
            <label className={label}>Text</label>
            <textarea
              value={speechText}
              onChange={(e) => setSpeechText(e.target.value)}
              placeholder="Enter dialogue..."
              rows={3}
              className={textarea}
              disabled={isSubmittingSpeech || speechJob?.status === "processing"}
            />
          </div>
        </div>

        <div className={card}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Volume2 className="w-4 h-4 text-studio-muted" />
              Music
            </div>
            <div className="flex items-center gap-3">
              {renderStatus(musicJob)}
              {musicJob?.status === "failed" && musicJob.errorMessage && (
                <span className="text-[11px] text-red-400 max-w-[260px] truncate">{musicJob.errorMessage}</span>
              )}
              {musicJob?.status === "completed" && musicJob.audioUrl && (
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => handlePlayPause(musicJob.audioUrl!)}
                    className="h-7 w-7 inline-flex items-center justify-center rounded border border-studio-border bg-studio-panel hover:border-studio-accent/50 hover:bg-studio-border/40 transition-colors"
                    title={isPlaying && activeAudioUrl === musicJob.audioUrl ? "Pause" : "Play"}
                  >
                    {isPlaying && activeAudioUrl === musicJob.audioUrl ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                  </button>
                  <button
                    onClick={handleStop}
                    className="h-7 w-7 inline-flex items-center justify-center rounded border border-studio-border bg-studio-panel hover:border-studio-accent/50 hover:bg-studio-border/40 transition-colors"
                    title="Stop"
                  >
                    <StopCircle className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className={label}>Engine</label>
              <div className={input + " text-studio-muted"}>Stable Audio</div>
            </div>
            <div>
              <label className={label}>Clip Name</label>
              <input
                value={musicClipName}
                onChange={(e) => setMusicClipName(e.target.value)}
                placeholder="Optional"
                className={input}
              />
            </div>
            <div>
              <label className={label}>Generate</label>
              <button
                onClick={handleGenerateMusic}
                disabled={isSubmittingMusic || musicJob?.status === "processing" || !musicPrompt.trim()}
                className="w-full h-10 flex items-center justify-center gap-2 rounded-lg bg-studio-accent hover:bg-studio-accent/80 disabled:bg-studio-border disabled:text-studio-muted text-sm font-medium transition-colors"
              >
                {isSubmittingMusic || musicJob?.status === "processing" ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Generating
                  </>
                ) : (
                  <>
                    <Volume2 className="w-4 h-4" />
                    Generate
                  </>
                )}
              </button>
            </div>
          </div>

          <div className="mt-3">
            <label className={label}>Add to Prompt</label>
            <div className="flex flex-wrap gap-2 mb-2">
              {/* Genre dropdown */}
              <div className="relative">
                <select
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val) {
                      setMusicPrompt((prev) => prev.trim() ? `${prev.trim()}, ${val}` : val);
                    }
                    e.target.selectedIndex = 0;
                  }}
                  className="h-8 pl-2 pr-7 text-xs rounded border border-studio-border bg-studio-bg appearance-none cursor-pointer hover:border-studio-accent/50 transition-colors"
                  disabled={isSubmittingMusic || musicJob?.status === "processing"}
                >
                  <option value="">Genre</option>
                  {MUSIC_PROMPT_PRESETS.genre.map((p) => (
                    <option key={p.value} value={p.value}>{p.label}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-studio-muted pointer-events-none" />
              </div>
              {/* Mood dropdown */}
              <div className="relative">
                <select
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val) {
                      setMusicPrompt((prev) => prev.trim() ? `${prev.trim()}, ${val}` : val);
                    }
                    e.target.selectedIndex = 0;
                  }}
                  className="h-8 pl-2 pr-7 text-xs rounded border border-studio-border bg-studio-bg appearance-none cursor-pointer hover:border-studio-accent/50 transition-colors"
                  disabled={isSubmittingMusic || musicJob?.status === "processing"}
                >
                  <option value="">Mood</option>
                  {MUSIC_PROMPT_PRESETS.mood.map((p) => (
                    <option key={p.value} value={p.value}>{p.label}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-studio-muted pointer-events-none" />
              </div>
              {/* Instruments dropdown */}
              <div className="relative">
                <select
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val) {
                      setMusicPrompt((prev) => prev.trim() ? `${prev.trim()}, ${val}` : val);
                    }
                    e.target.selectedIndex = 0;
                  }}
                  className="h-8 pl-2 pr-7 text-xs rounded border border-studio-border bg-studio-bg appearance-none cursor-pointer hover:border-studio-accent/50 transition-colors"
                  disabled={isSubmittingMusic || musicJob?.status === "processing"}
                >
                  <option value="">Instruments</option>
                  {MUSIC_PROMPT_PRESETS.instruments.map((p) => (
                    <option key={p.value} value={p.value}>{p.label}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-studio-muted pointer-events-none" />
              </div>
              {/* Tempo dropdown */}
              <div className="relative">
                <select
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val) {
                      setMusicPrompt((prev) => prev.trim() ? `${prev.trim()}, ${val}` : val);
                    }
                    e.target.selectedIndex = 0;
                  }}
                  className="h-8 pl-2 pr-7 text-xs rounded border border-studio-border bg-studio-bg appearance-none cursor-pointer hover:border-studio-accent/50 transition-colors"
                  disabled={isSubmittingMusic || musicJob?.status === "processing"}
                >
                  <option value="">Tempo</option>
                  {MUSIC_PROMPT_PRESETS.tempo.map((p) => (
                    <option key={p.value} value={p.value}>{p.label}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-studio-muted pointer-events-none" />
              </div>
              {/* Clear button */}
              {musicPrompt && (
                <button
                  onClick={() => setMusicPrompt("")}
                  className="h-8 px-2 text-xs rounded border border-studio-border bg-studio-bg text-studio-muted hover:text-red-300 hover:border-red-400/50 transition-colors"
                  type="button"
                >
                  Clear
                </button>
              )}
            </div>
            <label className={label}>Prompt</label>
            <textarea
              value={musicPrompt}
              onChange={(e) => setMusicPrompt(e.target.value)}
              placeholder="Describe music... (use dropdowns above or type directly)"
              rows={3}
              className={textarea}
              disabled={isSubmittingMusic || musicJob?.status === "processing"}
            />
          </div>

          <div className="mt-3">
            <label className={label}>Duration (sec)</label>
            <input
              type="number"
              min={1}
              max={60}
              value={musicDuration}
              onChange={(e) => setMusicDuration(Number(e.target.value) || 10)}
              className={input}
            />
          </div>
        </div>

        {/* Foley Section */}
        <div className={card}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Film className="w-4 h-4 text-studio-muted" />
              Foley (Sound Effects)
            </div>
            <div className="flex items-center gap-3">
              {renderStatus(foleyJob)}
              {foleyJob?.status === "failed" && foleyJob.errorMessage && (
                <span className="text-[11px] text-red-400 max-w-[260px] truncate">{foleyJob.errorMessage}</span>
              )}
              {foleyJob?.status === "completed" && foleyJob.audioUrl && (
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => handlePlayPause(foleyJob.audioUrl!)}
                    className="h-7 w-7 inline-flex items-center justify-center rounded border border-studio-border bg-studio-panel hover:border-studio-accent/50 hover:bg-studio-border/40 transition-colors"
                    title={isPlaying && activeAudioUrl === foleyJob.audioUrl ? "Pause" : "Play"}
                  >
                    {isPlaying && activeAudioUrl === foleyJob.audioUrl ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                  </button>
                  <button
                    onClick={handleStop}
                    className="h-7 w-7 inline-flex items-center justify-center rounded border border-studio-border bg-studio-panel hover:border-studio-accent/50 hover:bg-studio-border/40 transition-colors"
                    title="Stop"
                  >
                    <StopCircle className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Video Preview - shows when foley completes with video */}
          {foleyJob?.status === "completed" && foleyJob.videoUrl && (
            <div className="mt-4 rounded-lg border border-studio-border overflow-hidden bg-black">
              <video
                src={getAudioUrl(foleyJob.videoUrl)}
                controls
                className="w-full max-h-[300px] object-contain"
              />
              <div className="p-2 bg-studio-panel text-xs text-studio-muted flex items-center justify-between">
                <span>Video with Foley Audio</span>
                <a
                  href={getAudioUrl(foleyJob.videoUrl)}
                  download
                  className="text-studio-accent hover:text-white transition-colors"
                >
                  Download
                </a>
              </div>
            </div>
          )}

          <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className={label}>Engine</label>
              <div className={input + " text-studio-muted"}>Hunyuan Foley</div>
            </div>
            <div>
              <label className={label}>Clip Name</label>
              <input
                value={foleyClipName}
                onChange={(e) => setFoleyClipName(e.target.value)}
                placeholder="Optional"
                className={input}
              />
            </div>
            <div>
              <label className={label}>Generate</label>
              <button
                onClick={handleGenerateFoley}
                disabled={isSubmittingFoley || foleyJob?.status === "processing" || !foleyPrompt.trim() || !foleyVideoFilename.trim()}
                className="w-full h-10 flex items-center justify-center gap-2 rounded-lg bg-studio-accent hover:bg-studio-accent/80 disabled:bg-studio-border disabled:text-studio-muted text-sm font-medium transition-colors"
              >
                {isSubmittingFoley || foleyJob?.status === "processing" ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Generating
                  </>
                ) : (
                  <>
                    <Film className="w-4 h-4" />
                    Generate
                  </>
                )}
              </button>
            </div>
          </div>

          <div className="mt-3">
            <label className={label}>Video Source</label>
            <div className="flex gap-2 mb-2">
              <button
                type="button"
                onClick={() => { setFoleyVideoSource("library"); setFoleyVideoFilename(""); }}
                className={`flex-1 h-8 text-xs rounded border transition-colors ${
                  foleyVideoSource === "library"
                    ? "border-studio-accent bg-studio-accent/20 text-white"
                    : "border-studio-border bg-studio-bg text-studio-muted hover:border-studio-accent/50"
                }`}
              >
                From Library
              </button>
              <button
                type="button"
                onClick={() => { setFoleyVideoSource("upload"); setFoleyVideoFilename(""); }}
                className={`flex-1 h-8 text-xs rounded border transition-colors ${
                  foleyVideoSource === "upload"
                    ? "border-studio-accent bg-studio-accent/20 text-white"
                    : "border-studio-border bg-studio-bg text-studio-muted hover:border-studio-accent/50"
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
                  className="w-full h-10 pl-3 pr-8 text-xs rounded border border-studio-border bg-studio-bg appearance-none cursor-pointer hover:border-studio-accent/50 transition-colors"
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
                        <option key={v.filename} value={v.filename}>
                          {v.filename}
                        </option>
                      ))}
                    </optgroup>
                  )}
                </select>
                <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-studio-muted pointer-events-none" />
              </div>
            )}

            {foleyVideoSource === "upload" && (
              <div className="space-y-2">
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
                      // Refresh uploaded videos list
                      const res = await listFoleyVideos(projectId);
                      setUploadedFoleyVideos(res.videos || []);
                    } catch (err) {
                      setError(err instanceof Error ? err.message : "Failed to upload video");
                    } finally {
                      setIsUploadingFoleyVideo(false);
                    }
                  }}
                  className="w-full text-xs file:mr-3 file:py-2 file:px-3 file:rounded file:border-0 file:bg-studio-accent file:text-white file:cursor-pointer hover:file:bg-studio-accent/80"
                  disabled={isSubmittingFoley || foleyJob?.status === "processing" || isUploadingFoleyVideo}
                />
                {isUploadingFoleyVideo && (
                  <div className="flex items-center gap-2 text-xs text-studio-muted">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    Uploading video...
                  </div>
                )}
                {foleyVideoFilename && !isUploadingFoleyVideo && (
                  <div className="text-xs text-green-400">✓ Using: {foleyVideoFilename}</div>
                )}
              </div>
            )}
          </div>

          <div className="mt-3">
            <label className={label}>Sound Presets</label>
            <div className="flex flex-wrap gap-2 mb-2">
              <div className="relative">
                <select
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val) {
                      setFoleyPrompt((prev) => prev.trim() ? `${prev.trim()}, ${val}` : val);
                    }
                    e.target.selectedIndex = 0;
                  }}
                  className="h-8 pl-2 pr-7 text-xs rounded border border-studio-border bg-studio-bg appearance-none cursor-pointer hover:border-studio-accent/50 transition-colors"
                  disabled={isSubmittingFoley || foleyJob?.status === "processing"}
                >
                  <option value="">Add Sound...</option>
                  {FOLEY_PROMPT_PRESETS.map((p) => (
                    <option key={p.value} value={p.value}>{p.label}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-studio-muted pointer-events-none" />
              </div>
              {foleyPrompt && (
                <button
                  onClick={() => setFoleyPrompt("")}
                  className="h-8 px-2 text-xs rounded border border-studio-border bg-studio-bg text-studio-muted hover:text-red-300 hover:border-red-400/50 transition-colors"
                  type="button"
                >
                  Clear
                </button>
              )}
            </div>
            <label className={label}>Prompt</label>
            <textarea
              value={foleyPrompt}
              onChange={(e) => setFoleyPrompt(e.target.value)}
              placeholder="Describe the sound effects for the video... (e.g., footsteps on gravel, wind blowing, door creaking)"
              rows={3}
              className={textarea}
              disabled={isSubmittingFoley || foleyJob?.status === "processing"}
            />
          </div>
        </div>
      </div>
      
      <audio
        ref={audioRef}
        src={activeAudioUrl ? getAudioUrl(activeAudioUrl) : undefined}
        onEnded={() => setIsPlaying(false)}
        onPause={() => setIsPlaying(false)}
        onPlay={() => setIsPlaying(true)}
      />

      {error && (
        <div className="mt-3 text-xs text-red-400">{error}</div>
      )}
    </div>
  );
}
