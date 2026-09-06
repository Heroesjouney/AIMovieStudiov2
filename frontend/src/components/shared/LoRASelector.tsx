"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { fetchLoras, uploadLora, type LoRAInfo } from "@/lib/api";
import { Plus, X, ChevronDown, Layers, Loader2, Search, Upload } from "lucide-react";

export interface LoRASelection {
  name: string;
  strength: number;
}

interface LoRASelectorProps {
  selected: LoRASelection[];
  onChange: (loras: LoRASelection[]) => void;
  compact?: boolean;
}

export function LoRASelector({ selected, onChange, compact }: LoRASelectorProps) {
  const [available, setAvailable] = useState<LoRAInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const loadLoras = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const resp = await fetchLoras();
      setAvailable(resp.loras);
    } catch (e) {
      setError("Failed to load LoRAs — is ComfyUI running?");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadLoras();
  }, [loadLoras]);

  const addLora = (name: string) => {
    if (selected.some((l) => l.name === name)) return;
    onChange([...selected, { name, strength: 0.8 }]);
    setShowDropdown(false);
    setSearch("");
  };

  const removeLora = (name: string) => {
    onChange(selected.filter((l) => l.name !== name));
  };

  const updateStrength = (name: string, strength: number) => {
    onChange(selected.map((l) => (l.name === name ? { ...l, strength } : l)));
  };

  const filtered = available.filter((l) =>
    l.name.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex items-center gap-1.5 text-[10px] text-studio-muted">
        <Loader2 className="w-3 h-3 animate-spin" />
        Loading LoRAs...
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* Selected LoRAs */}
      {selected.length > 0 && (
        <div className="space-y-1.5">
          {selected.map((lora) => (
            <div
              key={lora.name}
              className="flex items-center gap-2 p-2 bg-studio-panel rounded-lg border border-studio-border"
            >
              <Layers className="w-3 h-3 text-studio-accent shrink-0" />
              <span className="text-[11px] truncate flex-1" title={lora.name}>
                {lora.name}
              </span>
              <div className="flex items-center gap-1.5 shrink-0">
                <input
                  type="range"
                  min="0"
                  max="2"
                  step="0.05"
                  value={lora.strength}
                  onChange={(e) => updateStrength(lora.name, Number(e.target.value))}
                  className="w-16 h-1 accent-studio-accent cursor-pointer"
                  title={`Strength: ${lora.strength.toFixed(2)}`}
                />
                <span className="text-[10px] text-studio-muted w-8 text-right tabular-nums">
                  {lora.strength.toFixed(2)}
                </span>
              </div>
              <button
                onClick={() => removeLora(lora.name)}
                className="p-0.5 rounded hover:bg-studio-danger/20 text-studio-muted hover:text-studio-danger transition-colors shrink-0"
                title="Remove LoRA"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Add LoRA dropdown + Upload */}
      <div className="relative">
        <div className="flex gap-1.5">
          <button
            onClick={() => setShowDropdown(!showDropdown)}
            className="flex-1 flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-medium rounded-lg bg-studio-panel border border-studio-border hover:border-studio-accent/50 text-studio-muted hover:text-studio-text transition-all justify-center"
          >
            <Plus className="w-3 h-3" />
            Add LoRA
            <ChevronDown className={`w-3 h-3 transition-transform ${showDropdown ? "rotate-180" : ""}`} />
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-medium rounded-lg bg-studio-panel border border-studio-border hover:border-studio-accent/50 text-studio-muted hover:text-studio-text transition-all disabled:opacity-40"
            title="Upload a LoRA file to ComfyUI"
          >
            {uploading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
          </button>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".safetensors,.pt,.pth,.ckpt,.gguf"
          className="hidden"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            setUploading(true);
            setUploadMsg(null);
            setError(null);
            try {
              await uploadLora(file);
              setUploadMsg(`Uploaded ${file.name} — refreshing list...`);
              await loadLoras();
            } catch (err) {
              setError(err instanceof Error ? err.message : "Upload failed");
            } finally {
              setUploading(false);
              if (e.target) e.target.value = "";
            }
          }}
        />

        {showDropdown && (
          <div className="absolute z-30 left-0 right-0 mt-1 bg-studio-panel border border-studio-border rounded-lg shadow-xl max-h-60 overflow-hidden flex flex-col">
            {/* Search */}
            <div className="p-2 border-b border-studio-border/50 shrink-0">
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-studio-muted/50" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search LoRAs..."
                  className="w-full pl-7 pr-2 py-1 text-[11px] bg-studio-bg border border-studio-border rounded-md focus:border-studio-accent focus:outline-none"
                  autoFocus
                />
              </div>
            </div>
            {/* List */}
            <div className="overflow-y-auto flex-1">
              {available.length === 0 ? (
                <p className="px-3 py-3 text-[10px] text-studio-muted text-center">
                  No LoRAs found. Click the upload button to add one.
                </p>
              ) : filtered.length === 0 ? (
                <p className="px-3 py-2 text-[10px] text-studio-muted text-center">
                  No LoRAs match &quot;{search}&quot;
                </p>
              ) : (
                filtered.map((lora) => {
                  const isSelected = selected.some((l) => l.name === lora.name);
                  return (
                    <button
                      key={lora.name}
                      onClick={() => !isSelected && addLora(lora.name)}
                      disabled={isSelected}
                      className={`w-full text-left px-3 py-1.5 text-[11px] border-b border-studio-border/30 last:border-0 transition-colors ${
                        isSelected
                          ? "text-studio-muted/40 cursor-not-allowed"
                          : "text-studio-text hover:bg-studio-border/40"
                      }`}
                    >
                      <div className="flex items-center gap-1.5">
                        <Layers className="w-2.5 h-2.5 text-studio-accent/60 shrink-0" />
                        <span className="truncate">{lora.name}</span>
                        {isSelected && (
                          <span className="text-[9px] text-studio-muted ml-auto shrink-0">Added</span>
                        )}
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>

      {uploadMsg && (
        <p className="text-[10px] text-studio-success">{uploadMsg}</p>
      )}

      {error && (
        <p className="text-[10px] text-studio-danger">{error}</p>
      )}

      {selected.length === 0 && !error && available.length > 0 && !compact && (
        <p className="text-[10px] text-studio-muted/50">
          Select LoRAs to apply style or character modifications to your generations.
        </p>
      )}
    </div>
  );
}
