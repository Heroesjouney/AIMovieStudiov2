"use client";

import { useState, useRef } from "react";
import {
  Upload, FileText, X, Loader2, Film, Clapperboard,
  ChevronDown, ChevronRight, CheckCircle2, AlertCircle,
} from "lucide-react";
import {
  previewScreenplay, importScreenplay, uploadScreenplay,
  type ScreenplayPreview,
} from "@/lib/api";
import { fetchShots, fetchScenes } from "@/lib/api";
import { useStudioStore } from "@/lib/store";

interface ScreenplayImportModalProps {
  projectId: string;
  onClose: () => void;
}

export function ScreenplayImportModal({ projectId, onClose }: ScreenplayImportModalProps) {
  const [text, setText] = useState("");
  const [preview, setPreview] = useState<ScreenplayPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [expandedScenes, setExpandedScenes] = useState<Set<number>>(new Set());
  const fileRef = useRef<HTMLInputElement>(null);

  const { setShots, setScenes } = useStudioStore();

  const handleFileUpload = async (file: File) => {
    setError(null);
    setSuccess(null);
    if (!file.name.match(/\.(fountain|txt|spmd|fdx)$/i)) {
      setError("File must be .fountain, .txt, .spmd, or .fdx format");
      return;
    }
    setLoading(true);
    try {
      const reader = new FileReader();
      reader.onload = async (e) => {
        const content = e.target?.result as string;
        setText(content);
        try {
          const p = await previewScreenplay(projectId, content);
          setPreview(p);
        } catch (err) {
          setError(err instanceof Error ? err.message : "Failed to parse screenplay");
        }
        setLoading(false);
      };
      reader.readAsText(file);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to read file");
      setLoading(false);
    }
  };

  const handlePreview = async () => {
    if (!text.trim()) {
      setError("Please paste screenplay text or upload a file");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const p = await previewScreenplay(projectId, text);
      setPreview(p);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to parse screenplay");
    } finally {
      setLoading(false);
    }
  };

  const handleImport = async () => {
    if (!text.trim()) return;
    setError(null);
    setSuccess(null);
    setImporting(true);
    try {
      const result = await importScreenplay(projectId, text);
      setSuccess(
        result.scenes_created > 0
          ? `Created ${result.scenes_created} scenes. Each scene's recipe now has the script breakdown as a reference — copy shot text into new shots as you build the storyboard.`
          : "Import complete.",
      );

      // Refresh store data (scenes now carry the script breakdown)
      const [freshShots, freshScenes] = await Promise.all([
        fetchShots(projectId),
        fetchScenes(projectId),
      ]);
      setShots(freshShots);
      setScenes(freshScenes);

      // Auto-close after a brief delay
      setTimeout(() => onClose(), 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to import screenplay");
    } finally {
      setImporting(false);
    }
  };

  const toggleScene = (idx: number) => {
    setExpandedScenes((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-[800px] max-h-[85vh] bg-studio-panel border border-studio-border rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-studio-border shrink-0">
          <div className="flex items-center gap-2">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-studio-accent/10 border border-studio-accent/20">
              <Film className="w-4 h-4 text-studio-accent" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-studio-text">Import Screenplay</h2>
              <p className="text-[10px] text-studio-muted">Fountain (.fountain, .txt) or Final Draft (.fdx)</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-studio-muted hover:text-studio-text hover:bg-studio-panelHover transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Upload area */}
          <div
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const file = e.dataTransfer.files[0];
              if (file) handleFileUpload(file);
            }}
            className="border-2 border-dashed border-studio-border rounded-xl p-6 text-center cursor-pointer hover:border-studio-accent/50 hover:bg-studio-accent/5 transition-all"
          >
            <input
              ref={fileRef}
              type="file"
              accept=".fountain,.txt,.spmd,.fdx"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFileUpload(file);
              }}
            />
            <Upload className="w-6 h-6 text-studio-muted mx-auto mb-2" />
            <p className="text-xs text-studio-muted">
              Drop a .fountain or .fdx file here or <span className="text-studio-accent">browse</span>
            </p>
          </div>

          {/* Or paste text */}
          <div className="space-y-1">
            <label className="text-[10px] text-studio-muted/50 uppercase tracking-wider">
              Or paste screenplay text
            </label>
            <textarea
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                setPreview(null);
                setError(null);
              }}
              placeholder={`INT. COFFEE SHOP - DAY\n\nA barista wipes the counter.\n\nBARISTA\nWhat can I get you?\n\nCUSTOMER\nA large coffee, please.\n\nCLOSE-UP: The coffee cup on the counter.`}
              className="w-full h-32 bg-studio-bg border border-studio-border rounded-lg px-3 py-2 text-xs text-studio-text font-mono resize-y focus:border-studio-accent focus:outline-none"
            />
          </div>

          {/* Preview button */}
          <div className="flex items-center gap-2">
            <button
              onClick={handlePreview}
              disabled={!text.trim() || loading}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-studio-panel border border-studio-border text-studio-text hover:bg-studio-panelHover disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileText className="w-3.5 h-3.5" />}
              Preview
            </button>
          </div>

          {/* Error */}
          {error && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-400">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              {error}
            </div>
          )}

          {/* Success */}
          {success && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-green-500/10 border border-green-500/20 text-xs text-green-400">
              <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
              {success}
            </div>
          )}

          {/* Preview results */}
          {preview && (
            <div className="space-y-3">
              {/* Title info */}
              {(preview.title || preview.author) && (
                <div className="px-3 py-2 rounded-lg bg-studio-bg border border-studio-border">
                  {preview.title && (
                    <p className="text-sm font-semibold text-studio-text">{preview.title}</p>
                  )}
                  {preview.author && (
                    <p className="text-[10px] text-studio-muted">by {preview.author}</p>
                  )}
                </div>
              )}

              {/* Summary */}
              <div className="flex items-center gap-4 text-xs text-studio-muted">
                <span className="flex items-center gap-1">
                  <Clapperboard className="w-3 h-3" />
                  {preview.scene_count} scenes
                </span>
                <span className="flex items-center gap-1">
                  <Film className="w-3 h-3" />
                  {preview.shot_count} shots
                </span>
              </div>

              {/* Scene breakdown */}
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {preview.scenes.map((scene, idx) => {
                  const expanded = expandedScenes.has(idx);
                  const sceneShots = preview.shots.filter((s) => s.scene_index === idx);
                  return (
                    <div key={idx} className="rounded-lg bg-studio-bg border border-studio-border overflow-hidden">
                      <button
                        onClick={() => toggleScene(idx)}
                        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-studio-panel/50 transition-colors"
                      >
                        {expanded ? (
                          <ChevronDown className="w-3 h-3 text-studio-muted shrink-0" />
                        ) : (
                          <ChevronRight className="w-3 h-3 text-studio-muted shrink-0" />
                        )}
                        <span className="text-xs font-medium text-studio-text flex-1 truncate">
                          {scene.name}
                        </span>
                        <span className="text-[10px] text-studio-muted">
                          {sceneShots.length} shots
                        </span>
                      </button>
                      {expanded && (
                        <div className="px-3 pb-2 space-y-1.5 border-t border-studio-border/50">
                          {/* Scene metadata */}
                          <div className="flex flex-wrap gap-1.5 pt-1.5">
                            {scene.int_ext && (
                              <span className="text-[9px] px-1.5 py-0.5 rounded bg-studio-panel text-studio-muted">
                                {scene.int_ext}
                              </span>
                            )}
                            {scene.location && (
                              <span className="text-[9px] px-1.5 py-0.5 rounded bg-studio-panel text-studio-muted">
                                {scene.location}
                              </span>
                            )}
                            {scene.time_of_day && (
                              <span className="text-[9px] px-1.5 py-0.5 rounded bg-studio-panel text-studio-muted">
                                {scene.time_of_day}
                              </span>
                            )}
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-studio-panel text-studio-muted">
                              mood: {scene.mood}
                            </span>
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-studio-panel text-studio-muted">
                              light: {scene.lighting}
                            </span>
                          </div>
                          {/* Shots */}
                          {sceneShots.map((shot, shIdx) => (
                            <div key={shIdx} className="pl-4 py-1 border-l border-studio-border/30">
                              <div className="flex items-center gap-1.5">
                                <span className="text-[9px] px-1 py-0.5 rounded bg-studio-accent/10 text-studio-accent font-mono">
                                  {shot.shot_type}
                                </span>
                                <span className="text-xs text-studio-text">{shot.name}</span>
                              </div>
                              {shot.action && (
                                <p className="text-[10px] text-studio-muted mt-0.5 line-clamp-2">
                                  {shot.action}
                                </p>
                              )}
                              {shot.dialogue && (
                                <p className="text-[10px] text-studio-muted/70 mt-0.5 italic line-clamp-2">
                                  {shot.dialogue}
                                </p>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-studio-border shrink-0">
          <p className="text-[10px] text-studio-muted">
            {preview
              ? "Review the preview, then import to create scenes and shots."
              : "Upload or paste a Fountain screenplay to preview."}
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-3 py-1.5 text-xs font-medium rounded-lg text-studio-muted hover:text-studio-text hover:bg-studio-panelHover transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleImport}
              disabled={!text.trim() || importing || !preview}
              className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-medium rounded-lg bg-studio-accent text-white hover:bg-studio-accent/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {importing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
              Import
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
