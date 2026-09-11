"use client";

import { useState, useEffect, useCallback, useRef, type ReactNode } from "react";
import {
  getApiKeys, saveApiKey, deleteApiKey,
  getComfyConfig, saveComfyConfig,
  fetchModels, uploadModel,
  fetchLoras, uploadLora,
  listWorkflows, registerWorkflow, deleteWorkflow,
  analyzeWorkflow, uploadModelToSubdir,
  checkWorkflowModels,
  getDrivers,
  type ApiKeyInfo, type CustomWorkflow, type LoRAInfo, type ComfyConfig, type WorkflowModelRef, type ModelCheckResult,
} from "@/lib/api";
import { useStudioStore } from "@/lib/store";
import {
  X, Key, Upload, Loader2, Check, ExternalLink, Trash2,
  Plus, Box, ChevronDown, Settings, FileJson, Layers, Server, AlertCircle,
} from "lucide-react";

interface SettingsPanelProps {
  onClose: () => void;
}

function CollapsibleSection({
  icon: Icon,
  title,
  badge,
  defaultOpen = false,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  badge?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="rounded-xl border border-studio-border bg-studio-panel/30 overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2.5 px-4 py-3 hover:bg-studio-panel/60 transition-colors"
      >
        <Icon className="w-4 h-4 text-studio-accent shrink-0" />
        <span className="text-sm font-semibold flex-1 text-left">{title}</span>
        {badge && (
          <span className="text-[10px] text-studio-muted bg-studio-border/40 px-2 py-0.5 rounded-full">{badge}</span>
        )}
        <ChevronDown className={`w-4 h-4 text-studio-muted transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="px-4 pb-4 pt-1">
          {children}
        </div>
      )}
    </section>
  );
}

export function SettingsPanel({ onClose }: SettingsPanelProps) {
  const [apiKeys, setApiKeys] = useState<Record<string, ApiKeyInfo>>({});
  const [loadingKeys, setLoadingKeys] = useState(true);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [keyValue, setKeyValue] = useState("");
  const [savingKey, setSavingKey] = useState(false);
  const [keyMsg, setKeyMsg] = useState<string | null>(null);
  const [keyError, setKeyError] = useState<string | null>(null);

  // ComfyUI Config
  const [comfyUrl, setComfyUrl] = useState("http://127.0.0.1:8188");
  const [comfyAuth, setComfyAuth] = useState("");
  const [comfyRemote, setComfyRemote] = useState(false);
  const [comfyModelsDir, setComfyModelsDir] = useState("");
  const [comfyLorasDir, setComfyLorasDir] = useState("");
  const [comfyCheckpointsDir, setComfyCheckpointsDir] = useState("");
  const [comfyExtraModelDirs, setComfyExtraModelDirs] = useState<string[]>([]);
  const [loadingComfy, setLoadingComfy] = useState(true);
  const [savingComfy, setSavingComfy] = useState(false);
  const [comfyMsg, setComfyMsg] = useState<string | null>(null);
  const [comfyError, setComfyError] = useState<string | null>(null);

  // Models
  const [models, setModels] = useState<{ name: string }[]>([]);
  const [loadingModels, setLoadingModels] = useState(true);
  const [showModels, setShowModels] = useState(false);
  const [uploadingModel, setUploadingModel] = useState(false);
  const [modelMsg, setModelMsg] = useState<string | null>(null);
  const [modelError, setModelError] = useState<string | null>(null);
  const modelFileRef = useRef<HTMLInputElement | null>(null);

  // LoRAs
  const [loras, setLoras] = useState<LoRAInfo[]>([]);
  const [loadingLoras, setLoadingLoras] = useState(true);
  const [showLoras, setShowLoras] = useState(false);
  const [uploadingLora, setUploadingLora] = useState(false);
  const [loraMsg, setLoraMsg] = useState<string | null>(null);
  const [loraError, setLoraError] = useState<string | null>(null);
  const loraFileRef = useRef<HTMLInputElement | null>(null);

  // Workflows
  const [workflows, setWorkflows] = useState<CustomWorkflow[]>([]);
  const [loadingWorkflows, setLoadingWorkflows] = useState(true);
  const [showWorkflowForm, setShowWorkflowForm] = useState(false);
  const [wfName, setWfName] = useState("");
  const [wfId, setWfId] = useState("");
  const [wfCategory, setWfCategory] = useState("image");
  const [wfJson, setWfJson] = useState("");
  const [registeringWf, setRegisteringWf] = useState(false);
  const [wfMsg, setWfMsg] = useState<string | null>(null);
  const [wfError, setWfError] = useState<string | null>(null);
  const wfFileRef = useRef<HTMLInputElement | null>(null);

  // Workflow model analysis
  const [requiredModels, setRequiredModels] = useState<WorkflowModelRef[]>([]);
  const [analyzingModels, setAnalyzingModels] = useState(false);
  const [modelCheckResults, setModelCheckResults] = useState<ModelCheckResult[]>([]);
  const [uploadingModelIdx, setUploadingModelIdx] = useState<number | null>(null);
  const [modelUploadMsgs, setModelUploadMsgs] = useState<Record<number, string>>({});
  const modelUploadRefs = useRef<Record<number, HTMLInputElement | null>>({});

  const { setDrivers } = useStudioStore();

  const refreshDrivers = useCallback(async () => {
    try {
      const drivers = await getDrivers();
      setDrivers(drivers.image, drivers.video, drivers.audio);
    } catch {
      // Silent fail — not critical
    }
  }, [setDrivers]);

  const loadKeys = useCallback(async () => {
    setLoadingKeys(true);
    try {
      const keys = await getApiKeys();
      setApiKeys(keys);
    } catch {
      setKeyError("Failed to load API keys");
    } finally {
      setLoadingKeys(false);
    }
  }, []);

  const loadComfy = useCallback(async () => {
    setLoadingComfy(true);
    try {
      const cfg = await getComfyConfig();
      setComfyUrl(cfg.url);
      setComfyAuth(cfg.auth_token || "");
      setComfyRemote(cfg.is_remote);
      setComfyModelsDir(cfg.models_dir || "");
      setComfyLorasDir(cfg.loras_dir || "");
      setComfyCheckpointsDir(cfg.checkpoints_dir || "");
      setComfyExtraModelDirs(cfg.extra_model_dirs || []);
    } catch {
      setComfyError("Failed to load ComfyUI config");
    } finally {
      setLoadingComfy(false);
    }
  }, []);

  const loadModels = useCallback(async () => {
    setLoadingModels(true);
    try {
      const resp = await fetchModels();
      setModels(resp.models);
    } catch {
      setModelError("Failed to load models");
    } finally {
      setLoadingModels(false);
    }
  }, []);

  const loadLoras = useCallback(async () => {
    setLoadingLoras(true);
    try {
      const resp = await fetchLoras();
      setLoras(resp.loras);
    } catch {
      setLoraError("Failed to load LoRAs");
    } finally {
      setLoadingLoras(false);
    }
  }, []);

  const loadWorkflows = useCallback(async () => {
    setLoadingWorkflows(true);
    try {
      const resp = await listWorkflows();
      setWorkflows(resp.workflows);
    } catch {
      setWfError("Failed to load workflows");
    } finally {
      setLoadingWorkflows(false);
    }
  }, []);

  useEffect(() => {
    loadComfy();
    loadKeys();
    loadModels();
    loadLoras();
    loadWorkflows();
  }, [loadComfy, loadKeys, loadModels, loadLoras, loadWorkflows]);

  const handleSaveComfy = async () => {
    setSavingComfy(true);
    setComfyError(null);
    setComfyMsg(null);
    try {
      await saveComfyConfig(comfyUrl.trim(), comfyAuth.trim(), comfyRemote, comfyModelsDir.trim(), comfyLorasDir.trim(), comfyCheckpointsDir.trim(), comfyExtraModelDirs.filter(d => d.trim()));
      setComfyMsg("ComfyUI server config saved! Restart backend to apply.");
    } catch (err) {
      setComfyError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSavingComfy(false);
    }
  };

  const handleSaveKey = async (keyName: string) => {
    if (!keyValue.trim()) return;
    setSavingKey(true);
    setKeyError(null);
    setKeyMsg(null);
    try {
      await saveApiKey(keyName, keyValue);
      setKeyMsg(`${keyName} saved! Refresh to see new cloud drivers.`);
      setEditingKey(null);
      setKeyValue("");
      await loadKeys();
    } catch (err) {
      setKeyError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSavingKey(false);
    }
  };

  const handleDeleteKey = async (keyName: string) => {
    setKeyError(null);
    try {
      await deleteApiKey(keyName);
      setKeyMsg(`${keyName} removed.`);
      await loadKeys();
    } catch (err) {
      setKeyError(err instanceof Error ? err.message : "Failed to delete");
    }
  };

  const handleRegisterWorkflow = async () => {
    if (!wfName.trim() || !wfId.trim() || !wfJson.trim()) return;
    setRegisteringWf(true);
    setWfError(null);
    setWfMsg(null);
    try {
      let parsed: Record<string, any>;
      try {
        parsed = JSON.parse(wfJson);
      } catch {
        throw new Error("Invalid JSON — please paste a valid ComfyUI workflow (API format)");
      }
      await registerWorkflow(wfId.trim(), wfName.trim(), wfCategory, parsed);
      setWfMsg(`Workflow '${wfName}' registered! Drivers updated.`);
      setShowWorkflowForm(false);
      setWfName("");
      setWfId("");
      setWfJson("");
      setRequiredModels([]);
      setModelCheckResults([]);
      await loadWorkflows();
      await refreshDrivers();
    } catch (err) {
      setWfError(err instanceof Error ? err.message : "Failed to register workflow");
    } finally {
      setRegisteringWf(false);
    }
  };

  const handleDeleteWorkflow = async (driverId: string) => {
    setWfError(null);
    try {
      await deleteWorkflow(driverId);
      setWfMsg(`Workflow '${driverId}' removed. Drivers updated.`);
      await loadWorkflows();
      await refreshDrivers();
    } catch (err) {
      setWfError(err instanceof Error ? err.message : "Failed to delete workflow");
    }
  };

  const handleWorkflowFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      setWfJson(e.target?.result as string);
      if (!wfName) setWfName(file.name.replace(/\.json$/i, ""));
      if (!wfId) setWfId(file.name.replace(/\.json$/i, "").replace(/[^a-zA-Z0-9_]/g, "_").toLowerCase());
    };
    reader.readAsText(file);
  };

  // Auto-analyze workflow JSON when it changes (debounced)
  useEffect(() => {
    if (!wfJson.trim()) {
      setRequiredModels([]);
      setModelCheckResults([]);
      return;
    }
    let parsed: Record<string, any>;
    try {
      parsed = JSON.parse(wfJson);
    } catch {
      return; // Not valid JSON yet — skip analysis
    }
    const timer = setTimeout(async () => {
      setAnalyzingModels(true);
      try {
        const result = await analyzeWorkflow(parsed);
        setRequiredModels(result.models);
        // Check which models already exist in ComfyUI
        if (result.models.length > 0) {
          try {
            const checkResult = await checkWorkflowModels(result.models);
            setModelCheckResults(checkResult.results);
          } catch {
            setModelCheckResults([]);
          }
        } else {
          setModelCheckResults([]);
        }
      } catch {
        setRequiredModels([]);
        setModelCheckResults([]);
      } finally {
        setAnalyzingModels(false);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [wfJson]);

  const handleUploadRequiredModel = async (idx: number, file: File) => {
    const model = requiredModels[idx];
    if (!model) return;
    setUploadingModelIdx(idx);
    setModelUploadMsgs((prev) => ({ ...prev, [idx]: "" }));
    try {
      await uploadModelToSubdir(model.subdirectory, file);
      setModelUploadMsgs((prev) => ({ ...prev, [idx]: `Uploaded ${file.name}` }));
    } catch (err) {
      setModelUploadMsgs((prev) => ({ ...prev, [idx]: `Failed: ${err instanceof Error ? err.message : "Upload error"}` }));
    } finally {
      setUploadingModelIdx(null);
    }
  };

  const handleUploadLora = async (file: File, overwrite = false) => {
    setUploadingLora(true);
    setLoraError(null);
    setLoraMsg(null);
    try {
      await uploadLora(file, overwrite);
      setLoraMsg(`Uploaded ${file.name} — refreshing list...`);
      await loadLoras();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Upload failed";
      if (msg.includes("already exists")) {
        setLoraError(msg);
        if (window.confirm(`A LoRA named '${file.name}' already exists. Overwrite it?`)) {
          setLoraError(null);
          try {
            await uploadLora(file, true);
            setLoraMsg(`Overwrote ${file.name} — refreshing list...`);
            await loadLoras();
          } catch (err2) {
            setLoraError(err2 instanceof Error ? err2.message : "Overwrite failed");
          }
        }
      } else {
        setLoraError(msg);
      }
    } finally {
      setUploadingLora(false);
    }
  };

  const handleUploadModel = async (file: File, overwrite = false) => {
    setUploadingModel(true);
    setModelError(null);
    setModelMsg(null);
    try {
      await uploadModel(file, overwrite);
      setModelMsg(`Uploaded ${file.name} — refreshing list...`);
      await loadModels();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Upload failed";
      if (msg.includes("already exists")) {
        setModelError(msg);
        if (window.confirm(`A model named '${file.name}' already exists. Overwrite it?`)) {
          setModelError(null);
          try {
            await uploadModel(file, true);
            setModelMsg(`Overwrote ${file.name} — refreshing list...`);
            await loadModels();
          } catch (err2) {
            setModelError(err2 instanceof Error ? err2.message : "Overwrite failed");
          }
        }
      } else {
        setModelError(msg);
      }
    } finally {
      setUploadingModel(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-studio-panel border border-studio-border rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-studio-border sticky top-0 bg-studio-panel z-10 rounded-t-2xl">
          <div className="flex items-center gap-2">
            <Settings className="w-5 h-5 text-studio-accent" />
            <h2 className="text-base font-semibold">Settings</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-studio-border text-studio-muted hover:text-studio-text transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-3">
          {/* ComfyUI Server */}
          <CollapsibleSection icon={Server} title="ComfyUI Server" defaultOpen>
            <p className="text-[11px] text-studio-muted mb-3">
              Connect to a local or remote ComfyUI instance. Use <code className="text-studio-accent">http://127.0.0.1:8188</code> for local, or any URL for a cloud-hosted ComfyUI.
            </p>

            {loadingComfy ? (
              <div className="flex items-center gap-2 text-xs text-studio-muted">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Loading...
              </div>
            ) : (
              <div className="space-y-3">
                <div>
                  <label className="block text-[10px] font-semibold text-studio-muted uppercase tracking-wider mb-1">Server URL</label>
                  <input
                    value={comfyUrl}
                    onChange={(e) => setComfyUrl(e.target.value)}
                    placeholder="http://127.0.0.1:8188"
                    className="w-full bg-studio-panel border border-studio-border rounded-lg px-2.5 py-1.5 text-xs focus:border-studio-accent focus:outline-none font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-studio-muted uppercase tracking-wider mb-1">
                    Auth Token <span className="normal-case opacity-50">(optional — for cloud instances)</span>
                  </label>
                  <input
                    value={comfyAuth}
                    onChange={(e) => setComfyAuth(e.target.value)}
                    type="password"
                    placeholder="Bearer token or API key"
                    className="w-full bg-studio-panel border border-studio-border rounded-lg px-2.5 py-1.5 text-xs focus:border-studio-accent focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-studio-muted uppercase tracking-wider mb-1">
                    Models Directory <span className="normal-case opacity-50">(local installs — path to ComfyUI/models)</span>
                  </label>
                  <input
                    value={comfyModelsDir}
                    onChange={(e) => setComfyModelsDir(e.target.value)}
                    placeholder="D:\AI_Master\ComfyUI-Easy-Install\ComfyUI-Easy-Install\ComfyUI\models"
                    className="w-full bg-studio-panel border border-studio-border rounded-lg px-2.5 py-1.5 text-xs focus:border-studio-accent focus:outline-none font-mono"
                  />
                  <p className="text-[10px] text-studio-muted/60 mt-1">
                    Set this to your ComfyUI <code className="text-studio-accent">models</code> folder so LoRA and model uploads go to the right place. Leave empty for remote/cloud servers.
                  </p>
                </div>

                {/* Extra model directories (under Models Directory) */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-[10px] font-semibold text-studio-muted uppercase tracking-wider">
                      Extra Model Directories <span className="normal-case opacity-50">(optional)</span>
                    </label>
                    <button
                      type="button"
                      onClick={() => setComfyExtraModelDirs([...comfyExtraModelDirs, ""])}
                      className="flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-medium rounded bg-studio-accent/20 hover:bg-studio-accent/30 text-studio-accent transition-colors"
                      title="Add another model directory"
                    >
                      <Plus className="w-3 h-3" />
                      Add
                    </button>
                  </div>
                  {comfyExtraModelDirs.length === 0 ? (
                    <p className="text-[10px] text-studio-muted/50">
                      Add extra directories to scan for model files (e.g. a shared models folder on another drive).
                    </p>
                  ) : (
                    <div className="space-y-1.5">
                      {comfyExtraModelDirs.map((dir, idx) => (
                        <div key={idx} className="flex items-center gap-1.5">
                          <input
                            value={dir}
                            onChange={(e) => {
                              const next = [...comfyExtraModelDirs];
                              next[idx] = e.target.value;
                              setComfyExtraModelDirs(next);
                            }}
                            placeholder="D:\SharedModels\checkpoints"
                            className="flex-1 bg-studio-panel border border-studio-border rounded-lg px-2.5 py-1.5 text-xs focus:border-studio-accent focus:outline-none font-mono"
                          />
                          <button
                            type="button"
                            onClick={() => setComfyExtraModelDirs(comfyExtraModelDirs.filter((_, i) => i !== idx))}
                            className="p-1 rounded hover:bg-studio-danger/20 text-studio-muted hover:text-studio-danger transition-colors shrink-0"
                            title="Remove this directory"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 gap-2">
                  <div>
                    <label className="block text-[10px] font-semibold text-studio-muted uppercase tracking-wider mb-1">
                      LoRAs Directory <span className="normal-case opacity-50">(optional override)</span>
                    </label>
                    <input
                      value={comfyLorasDir}
                      onChange={(e) => setComfyLorasDir(e.target.value)}
                      placeholder="{models_dir}/loras"
                      className="w-full bg-studio-panel border border-studio-border rounded-lg px-2.5 py-1.5 text-xs focus:border-studio-accent focus:outline-none font-mono"
                    />
                    <p className="text-[10px] text-studio-muted/60 mt-1">
                      Optional: override the LoRAs folder if your setup uses a non-standard path. Leave empty to use <code className="text-studio-accent">models_dir/loras</code>.
                    </p>
                  </div>
                </div>
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={comfyRemote}
                    onChange={(e) => setComfyRemote(e.target.checked)}
                    className="accent-studio-accent w-4 h-4"
                  />
                  <span className="text-xs text-studio-muted">
                    Remote / cloud server (uses API for file uploads instead of filesystem)
                  </span>
                </label>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleSaveComfy}
                    disabled={savingComfy || !comfyUrl.trim()}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-studio-accent hover:bg-studio-accentHover disabled:opacity-40 text-white text-xs rounded-lg font-medium transition-all"
                  >
                    {savingComfy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                    Save
                  </button>
                  {comfyMsg && <p className="text-[10px] text-green-500">{comfyMsg}</p>}
                  {comfyError && <p className="text-[10px] text-studio-danger">{comfyError}</p>}
                </div>
              </div>
            )}
          </CollapsibleSection>

          {/* Cloud API Keys */}
          <CollapsibleSection icon={Key} title="Cloud API Keys" badge={Object.values(apiKeys).filter(k => k.is_set).length > 0 ? `${Object.values(apiKeys).filter(k => k.is_set).length} connected` : undefined}>
            <p className="text-[11px] text-studio-muted mb-3">
              Connect cloud generation services. Keys are stored locally in <code className="text-studio-accent">settings.json</code> and loaded into environment variables on backend restart.
            </p>

            {loadingKeys ? (
              <div className="flex items-center gap-2 text-xs text-studio-muted">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Loading...
              </div>
            ) : (
              <div className="space-y-3">
                {Object.entries(apiKeys).map(([keyName, info]) => (
                  <div key={keyName} className="p-3 bg-studio-bg rounded-lg border border-studio-border">
                    <div className="flex items-start justify-between mb-1.5">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium">{info.label}</span>
                          {info.is_set ? (
                            <span className="flex items-center gap-1 text-[9px] text-green-500 bg-green-500/10 px-1.5 py-0.5 rounded-full">
                              <Check className="w-2.5 h-2.5" />
                              Connected
                            </span>
                          ) : (
                            <span className="text-[9px] text-studio-muted bg-studio-border/50 px-1.5 py-0.5 rounded-full">
                              Not set
                            </span>
                          )}
                        </div>
                        <p className="text-[10px] text-studio-muted mt-0.5">{info.description}</p>
                      </div>
                      {info.url && (
                        <a
                          href={info.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-[10px] text-studio-accent hover:underline shrink-0"
                        >
                          Get key <ExternalLink className="w-2.5 h-2.5" />
                        </a>
                      )}
                    </div>

                    {info.is_set && !editingKey && (
                      <div className="flex items-center gap-2 mt-2">
                        <code className="text-[10px] text-studio-muted bg-studio-panel px-2 py-1 rounded font-mono">
                          {info.masked_value}
                        </code>
                        <button
                          onClick={() => handleDeleteKey(keyName)}
                          className="flex items-center gap-1 text-[10px] text-studio-danger hover:text-red-400 transition-colors ml-auto"
                        >
                          <Trash2 className="w-3 h-3" />
                          Remove
                        </button>
                      </div>
                    )}

                    {editingKey === keyName ? (
                      <div className="mt-2 space-y-2">
                        <input
                          type="password"
                          value={keyValue}
                          onChange={(e) => setKeyValue(e.target.value)}
                          placeholder={`Enter ${info.label}...`}
                          className="w-full bg-studio-panel border border-studio-border rounded-lg px-2.5 py-1.5 text-xs focus:border-studio-accent focus:outline-none font-mono"
                          autoFocus
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleSaveKey(keyName)}
                            disabled={savingKey || !keyValue.trim()}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-studio-accent hover:bg-studio-accentHover disabled:opacity-40 text-white text-xs rounded-lg font-medium transition-all"
                          >
                            {savingKey ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                            Save
                          </button>
                          <button
                            onClick={() => { setEditingKey(null); setKeyValue(""); }}
                            className="px-3 py-1.5 bg-studio-panel border border-studio-border text-studio-muted text-xs rounded-lg hover:text-studio-text transition-colors"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      !info.is_set && (
                        <button
                          onClick={() => { setEditingKey(keyName); setKeyValue(""); setKeyMsg(null); setKeyError(null); }}
                          className="flex items-center gap-1.5 mt-2 px-3 py-1.5 bg-studio-panel border border-studio-border hover:border-studio-accent/50 text-studio-muted hover:text-studio-text text-xs rounded-lg transition-all"
                        >
                          <Plus className="w-3 h-3" />
                          Add Key
                        </button>
                      )
                    )}

                    {info.is_set && editingKey !== keyName && (
                      <button
                        onClick={() => { setEditingKey(keyName); setKeyValue(""); setKeyMsg(null); setKeyError(null); }}
                        className="flex items-center gap-1 text-[10px] text-studio-accent hover:underline mt-2"
                      >
                        Update key
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}

            {keyMsg && <p className="text-[10px] text-green-500 mt-2">{keyMsg}</p>}
            {keyError && <p className="text-[10px] text-studio-danger mt-2">{keyError}</p>}
          </CollapsibleSection>

          {/* ComfyUI Models */}
          <CollapsibleSection icon={Box} title="ComfyUI Models" badge={models.length > 0 ? `${models.length} models` : undefined}>
            <p className="text-[11px] text-studio-muted mb-3">
              Upload checkpoint models (.safetensors, .ckpt, .pt) to ComfyUI's <code className="text-studio-accent">models/checkpoints/</code> directory.
            </p>

            <div className="flex gap-2 mb-3">
              <button
                onClick={() => modelFileRef.current?.click()}
                disabled={uploadingModel}
                className="flex items-center gap-1.5 px-3 py-2 bg-studio-panel border border-studio-border hover:border-studio-accent/50 text-studio-muted hover:text-studio-text text-xs rounded-lg transition-all disabled:opacity-40"
              >
                {uploadingModel ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                Upload Model
              </button>
              <button
                onClick={() => setShowModels(!showModels)}
                className="flex items-center gap-1.5 px-3 py-2 bg-studio-panel border border-studio-border hover:border-studio-accent/50 text-studio-muted hover:text-studio-text text-xs rounded-lg transition-all"
              >
                {models.length} models
                <ChevronDown className={`w-3 h-3 transition-transform ${showModels ? "rotate-180" : ""}`} />
              </button>
              <input
                ref={modelFileRef}
                type="file"
                accept=".safetensors,.pt,.pth,.ckpt,.gguf"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleUploadModel(file);
                  if (e.target) e.target.value = "";
                }}
              />
            </div>

            {modelMsg && <p className="text-[10px] text-green-500 mb-2">{modelMsg}</p>}
            {modelError && <p className="text-[10px] text-studio-danger mb-2">{modelError}</p>}

            {showModels && (
              <div className="max-h-48 overflow-y-auto bg-studio-bg rounded-lg border border-studio-border">
                {loadingModels ? (
                  <div className="flex items-center gap-2 p-3 text-xs text-studio-muted">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Loading models...
                  </div>
                ) : models.length === 0 ? (
                  <p className="p-3 text-[10px] text-studio-muted text-center">
                    No models found. Is ComfyUI running?
                  </p>
                ) : (
                  models.map((model) => (
                    <div
                      key={model.name}
                      className="flex items-center gap-2 px-3 py-2 text-[11px] border-b border-studio-border/30 last:border-0"
                    >
                      <Box className="w-3 h-3 text-studio-accent/60 shrink-0" />
                      <span className="truncate">{model.name}</span>
                    </div>
                  ))
                )}
              </div>
            )}
          </CollapsibleSection>

          {/* ComfyUI LoRAs */}
          <CollapsibleSection icon={Layers} title="ComfyUI LoRAs" badge={loras.length > 0 ? `${loras.length} LoRAs` : undefined}>
            <p className="text-[11px] text-studio-muted mb-3">
              Upload LoRA files (.safetensors, .pt, .pth) to ComfyUI's <code className="text-studio-accent">models/loras/</code> directory. These appear in the LoRA selector in all generation tabs.
            </p>

            <div className="flex gap-2 mb-3">
              <button
                onClick={() => loraFileRef.current?.click()}
                disabled={uploadingLora}
                className="flex items-center gap-1.5 px-3 py-2 bg-studio-panel border border-studio-border hover:border-studio-accent/50 text-studio-muted hover:text-studio-text text-xs rounded-lg transition-all disabled:opacity-40"
              >
                {uploadingLora ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                Upload LoRA
              </button>
              <button
                onClick={() => setShowLoras(!showLoras)}
                className="flex items-center gap-1.5 px-3 py-2 bg-studio-panel border border-studio-border hover:border-studio-accent/50 text-studio-muted hover:text-studio-text text-xs rounded-lg transition-all"
              >
                {loras.length} LoRAs
                <ChevronDown className={`w-3 h-3 transition-transform ${showLoras ? "rotate-180" : ""}`} />
              </button>
              <input
                ref={loraFileRef}
                type="file"
                accept=".safetensors,.pt,.pth,.ckpt,.gguf"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleUploadLora(file);
                  if (e.target) e.target.value = "";
                }}
              />
            </div>

            {loraMsg && <p className="text-[10px] text-green-500 mb-2">{loraMsg}</p>}
            {loraError && <p className="text-[10px] text-studio-danger mb-2">{loraError}</p>}

            {showLoras && (
              <div className="max-h-48 overflow-y-auto bg-studio-bg rounded-lg border border-studio-border">
                {loadingLoras ? (
                  <div className="flex items-center gap-2 p-3 text-xs text-studio-muted">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Loading LoRAs...
                  </div>
                ) : loras.length === 0 ? (
                  <p className="p-3 text-[10px] text-studio-muted text-center">
                    No LoRAs found. Is ComfyUI running?
                  </p>
                ) : (
                  loras.map((lora) => (
                    <div
                      key={lora.name}
                      className="flex items-center gap-2 px-3 py-2 text-[11px] border-b border-studio-border/30 last:border-0"
                    >
                      <Layers className="w-3 h-3 text-studio-accent/60 shrink-0" />
                      <span className="truncate">{lora.name}</span>
                    </div>
                  ))
                )}
              </div>
            )}
          </CollapsibleSection>

          {/* Custom Workflows */}
          <CollapsibleSection icon={FileJson} title="Custom ComfyUI Workflows" badge={workflows.length > 0 ? `${workflows.length} workflows` : undefined}>
            <p className="text-[11px] text-studio-muted mb-3">
              Build a workflow in ComfyUI, export it as JSON (API format), then upload it here. It will appear as a new model in the dropdowns — no code changes needed.
            </p>

            {wfMsg && <p className="text-[10px] text-green-500 mb-2">{wfMsg}</p>}
            {wfError && <p className="text-[10px] text-studio-danger mb-2">{wfError}</p>}

            {/* Existing workflows */}
            {loadingWorkflows ? (
              <div className="flex items-center gap-2 text-xs text-studio-muted mb-3">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Loading workflows...
              </div>
            ) : workflows.length > 0 ? (
              <div className="space-y-2 mb-3">
                {workflows.map((wf) => (
                  <div key={wf.driver_id} className="flex items-center gap-2 p-2.5 bg-studio-bg rounded-lg border border-studio-border">
                    <FileJson className="w-3.5 h-3.5 text-studio-accent/60 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium truncate">{wf.display_name}</div>
                      <div className="text-[10px] text-studio-muted">
                        {wf.category} · {wf.driver_id} · {wf.supported_features.join(", ")}
                      </div>
                    </div>
                    <button
                      onClick={() => handleDeleteWorkflow(wf.driver_id)}
                      className="p-1 rounded hover:bg-studio-danger/20 text-studio-muted hover:text-studio-danger transition-colors shrink-0"
                      title="Delete workflow"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[10px] text-studio-muted mb-3">No custom workflows registered yet.</p>
            )}

            {/* Add workflow form */}
            {showWorkflowForm ? (
              <div className="p-3 bg-studio-bg rounded-lg border border-studio-border space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] font-semibold text-studio-muted uppercase tracking-wider mb-1 block">Display Name</label>
                    <input
                      value={wfName}
                      onChange={(e) => setWfName(e.target.value)}
                      placeholder="My Custom Model"
                      className="w-full bg-studio-panel border border-studio-border rounded-lg px-2.5 py-1.5 text-xs focus:border-studio-accent focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold text-studio-muted uppercase tracking-wider mb-1 block">Driver ID</label>
                    <input
                      value={wfId}
                      onChange={(e) => setWfId(e.target.value.replace(/[^a-zA-Z0-9_]/g, "_").toLowerCase())}
                      placeholder="my_custom_model"
                      className="w-full bg-studio-panel border border-studio-border rounded-lg px-2.5 py-1.5 text-xs focus:border-studio-accent focus:outline-none font-mono"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-[10px] font-semibold text-studio-muted uppercase tracking-wider mb-1 block">Category</label>
                  <select
                    value={wfCategory}
                    onChange={(e) => setWfCategory(e.target.value)}
                    className="w-full bg-studio-panel border border-studio-border rounded-lg px-2.5 py-1.5 text-xs focus:border-studio-accent focus:outline-none"
                  >
                    <option value="image">Image</option>
                    <option value="video">Video</option>
                    <option value="audio">Audio</option>
                  </select>
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[10px] font-semibold text-studio-muted uppercase tracking-wider">Workflow JSON</label>
                    <button
                      onClick={() => wfFileRef.current?.click()}
                      className="flex items-center gap-1 text-[10px] text-studio-accent hover:underline"
                    >
                      <Upload className="w-3 h-3" />
                      Load from file
                    </button>
                    <input
                      ref={wfFileRef}
                      type="file"
                      accept=".json"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleWorkflowFile(file);
                        if (e.target) e.target.value = "";
                      }}
                    />
                  </div>
                  <textarea
                    value={wfJson}
                    onChange={(e) => setWfJson(e.target.value)}
                    placeholder='Paste ComfyUI workflow JSON here (API format)...'
                    className="w-full h-32 bg-studio-panel border border-studio-border rounded-lg px-2.5 py-1.5 text-[10px] font-mono focus:border-studio-accent focus:outline-none resize-y"
                  />
                </div>

                {/* Required Models */}
                {analyzingModels && (
                  <div className="flex items-center gap-2 text-[10px] text-studio-muted">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    Analyzing workflow for required models...
                  </div>
                )}
                {!analyzingModels && requiredModels.length > 0 && (
                  <div>
                    <label className="text-[10px] font-semibold text-studio-muted uppercase tracking-wider mb-1.5 block flex items-center gap-1">
                      <AlertCircle className="w-3 h-3 text-studio-accent" />
                      Required Models ({requiredModels.length})
                    </label>
                    <p className="text-[10px] text-studio-muted mb-2">
                      These models are referenced in the workflow. Models already in ComfyUI are marked as found. Upload the missing ones before using this driver.
                    </p>
                    <div className="space-y-1.5">
                      {requiredModels.map((model, idx) => {
                        const checkResult = modelCheckResults[idx];
                        const found = checkResult?.found;
                        return (
                          <div key={`${model.subdirectory}-${model.filename}-${idx}`} className={`flex items-center gap-2 p-2 rounded-lg border ${found ? "bg-green-500/5 border-green-500/20" : "bg-studio-panel border-studio-border"}`}>
                            <Box className={`w-3 h-3 shrink-0 ${found ? "text-green-500" : "text-studio-accent/60"}`} />
                            <div className="flex-1 min-w-0">
                              <div className="text-[10px] font-medium truncate">{model.filename}</div>
                              <div className="text-[9px] text-studio-muted">{model.label} · {model.subdirectory}/</div>
                            </div>
                            {found && (
                              <span className="flex items-center gap-1 text-[9px] text-green-500 shrink-0">
                                <Check className="w-2.5 h-2.5" />
                                In ComfyUI
                              </span>
                            )}
                            {modelUploadMsgs[idx] && (
                              <span className={`text-[9px] shrink-0 ${modelUploadMsgs[idx].startsWith("Failed") ? "text-studio-danger" : "text-green-500"}`}>
                                {modelUploadMsgs[idx]}
                              </span>
                            )}
                            {!found && (
                              <>
                                <button
                                  onClick={() => modelUploadRefs.current[idx]?.click()}
                                  disabled={uploadingModelIdx !== null}
                                  className="flex items-center gap-1 px-2 py-1 bg-studio-bg border border-studio-border hover:border-studio-accent/50 text-studio-muted hover:text-studio-text text-[9px] rounded-lg transition-all disabled:opacity-40 shrink-0"
                                >
                                  {uploadingModelIdx === idx ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : <Upload className="w-2.5 h-2.5" />}
                                  Upload
                                </button>
                                <input
                                  ref={(el) => { modelUploadRefs.current[idx] = el; }}
                                  type="file"
                                  accept=".safetensors,.pt,.pth,.ckpt,.gguf,.bin"
                                  className="hidden"
                                  onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    if (file) handleUploadRequiredModel(idx, file);
                                    if (e.target) e.target.value = "";
                                  }}
                                />
                              </>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
                {!analyzingModels && wfJson.trim() && requiredModels.length === 0 && (
                  <p className="text-[10px] text-studio-muted flex items-center gap-1">
                    <Check className="w-3 h-3 text-green-500" />
                    No model references found in workflow JSON.
                  </p>
                )}

                <div className="flex gap-2">
                  <button
                    onClick={handleRegisterWorkflow}
                    disabled={registeringWf || !wfName.trim() || !wfId.trim() || !wfJson.trim()}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-studio-accent hover:bg-studio-accentHover disabled:opacity-40 text-white text-xs rounded-lg font-medium transition-all"
                  >
                    {registeringWf ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                    Register Workflow
                  </button>
                  <button
                    onClick={() => { setShowWorkflowForm(false); setWfName(""); setWfId(""); setWfJson(""); setWfError(null); setRequiredModels([]); setModelCheckResults([]); setModelUploadMsgs({}); }}
                    className="px-3 py-1.5 bg-studio-panel border border-studio-border text-studio-muted text-xs rounded-lg hover:text-studio-text transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => { setShowWorkflowForm(true); setWfMsg(null); setWfError(null); }}
                className="flex items-center gap-1.5 px-3 py-2 bg-studio-panel border border-studio-border hover:border-studio-accent/50 text-studio-muted hover:text-studio-text text-xs rounded-lg transition-all"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Custom Workflow
              </button>
            )}
          </CollapsibleSection>
        </div>
      </div>
    </div>
  );
}
