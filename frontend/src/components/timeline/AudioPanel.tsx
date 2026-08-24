"use client";

import { useState, useEffect } from "react";
import { useStudioStore } from "@/lib/store";
import { generateTTS, fetchAudioFiles } from "@/lib/api";
import { Loader2, Play, Music, Plus } from "lucide-react";

export function AudioPanel({ projectId }: { projectId: string }) {
  const { audioDrivers, selectedAudioDriver, setSelectedAudioDriver } = useStudioStore();
  const [text, setText] = useState("");
  const [language, setLanguage] = useState("en");
  const [generating, setGenerating] = useState(false);
  const [status, setStatus] = useState("");
  const [audioFiles, setAudioFiles] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchAudioFiles(projectId).then(setAudioFiles).catch(() => {});
  }, [projectId]);

  const handleGenerate = async () => {
    if (!text.trim()) return;
    setGenerating(true);
    setError(null);
    setStatus("Generating speech...");

    try {
      const resp = await generateTTS(text, language, selectedAudioDriver);
      if (resp.status === "failed") {
        setError(resp.error_message || "TTS failed");
        setGenerating(false);
        return;
      }

      let ttsPollErrors = 0;
      const interval = setInterval(async () => {
        try {
          const st = await fetch(`/api/audio/status/${resp.job_id}?model_id=${selectedAudioDriver}`).then(r => r.json());
          ttsPollErrors = 0;
          if (st.status === "completed") {
            clearInterval(interval);
            setStatus("Audio ready!");
            setGenerating(false);
            const refreshed = await fetchAudioFiles(projectId);
            setAudioFiles(refreshed);
          } else if (st.status === "failed") {
            clearInterval(interval);
            setError(st.error_message || "TTS failed");
            setGenerating(false);
          } else {
            setStatus(st.status === "in_queue" ? "In queue..." : "Processing...");
          }
        } catch (pollErr) {
          ttsPollErrors++;
          if (ttsPollErrors >= 5) {
            clearInterval(interval);
            setError("Lost connection to backend while polling.");
            setGenerating(false);
          }
        }
      }, 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
      setGenerating(false);
    }
  };

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="mb-6">
        <h2 className="text-lg font-semibold">Audio Generation</h2>
        <p className="text-sm text-studio-muted mt-1">Generate dialogue and narration using text-to-speech models</p>
      </div>

      {/* Model selector */}
      <div className="mb-5">
        <label className="block text-xs font-semibold text-studio-muted uppercase tracking-wider mb-2">TTS Model</label>
        <select
          value={selectedAudioDriver}
          onChange={(e) => setSelectedAudioDriver(e.target.value)}
          className="bg-studio-panel border border-studio-border rounded-xl px-3 py-2.5 text-sm focus:border-studio-accent focus:ring-2 focus:ring-studio-accent/20 focus:outline-none"
        >
          {audioDrivers.map((d) => (
            <option key={d.driver_id} value={d.driver_id}>{d.display_name}</option>
          ))}
        </select>
      </div>

      {/* TTS Input */}
      <div className="mb-5">
        <label className="block text-xs font-semibold text-studio-muted uppercase tracking-wider mb-2">Dialogue Text</label>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={4}
          placeholder="Enter dialogue for text-to-speech..."
          className="w-full bg-studio-panel border border-studio-border rounded-xl p-3 text-sm focus:border-studio-accent focus:ring-2 focus:ring-studio-accent/20 focus:outline-none resize-none"
        />
      </div>

      <div className="mb-5">
        <label className="block text-xs font-semibold text-studio-muted uppercase tracking-wider mb-2">Language</label>
        <select
          value={language}
          onChange={(e) => setLanguage(e.target.value)}
          className="bg-studio-panel border border-studio-border rounded-xl px-3 py-2.5 text-sm focus:border-studio-accent focus:ring-2 focus:ring-studio-accent/20 focus:outline-none"
        >
          <option value="en">English</option>
          <option value="zh">Chinese</option>
          <option value="ja">Japanese</option>
          <option value="ko">Korean</option>
          <option value="fr">French</option>
          <option value="de">German</option>
          <option value="es">Spanish</option>
        </select>
      </div>

      <button
        onClick={handleGenerate}
        disabled={generating || !text.trim()}
        className="flex items-center gap-2 px-6 py-3 bg-studio-accent hover:bg-studio-accentHover disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl font-medium transition-all hover:scale-[1.02] shadow-lg shadow-studio-accent/20"
      >
        {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Music className="w-4 h-4" />}
        {generating ? status : "Generate Speech"}
      </button>

      {error && (
        <div className="mt-4 p-3 bg-studio-danger/10 border border-studio-danger/30 rounded-xl text-sm text-studio-danger">
          {error}
        </div>
      )}

      {/* Audio files list */}
      <div className="mt-8">
        <h3 className="text-sm font-semibold mb-3">Audio Files</h3>
        <div className="space-y-2">
          {audioFiles.map((file) => (
            <div key={file.id} className="flex items-center gap-3 p-3 bg-studio-panel rounded-xl border border-studio-border hover:border-studio-accent/30 transition-colors">
              <div className="w-8 h-8 rounded-lg bg-studio-accent/10 flex items-center justify-center shrink-0">
                <Music className="w-4 h-4 text-studio-accent" />
              </div>
              <audio controls src={file.url} className="h-8" />
              <span className="text-xs text-studio-muted truncate">{file.name}</span>
            </div>
          ))}
          {audioFiles.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="w-12 h-12 rounded-full bg-studio-border/50 flex items-center justify-center mb-3">
                <Music className="w-6 h-6 text-studio-muted/50" />
              </div>
              <p className="text-xs text-studio-muted">No audio files yet</p>
              <p className="text-xs text-studio-muted/50 mt-1">Generate speech to get started</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
