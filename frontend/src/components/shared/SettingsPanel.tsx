"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  getApiKeys, saveApiKey, deleteApiKey,
  fetchModels, uploadModel,
  fetchLoras, uploadLora,
  listWorkflows, registerWorkflow, deleteWorkflow,
  type ApiKeyInfo, type CustomWorkflow, type LoRAInfo,
} from "@/lib/api";
import {
  X, Key, Upload, Loader2, Check, ExternalLink, Trash2,
  Plus, Box, ChevronDown, Settings, FileJson, Layers,
} from "lucide-react";

interface SettingsPanelProps {
  onClose: () => void;
}

export function SettingsPanel({ onClose }: SettingsPanelProps) {
  const [apiKeys, setApiKeys] = useState<Record<string, ApiKeyInfo>>({});
  const [loadingKeys, setLoadingKeys] = useState(true);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [keyValue, setKeyValue] = useState("");
  const [savingKey, setSavingKey] = useState(false);
  const [keyMsg, setKeyMsg] = useState<string | null>(null);
  const [keyError, setKeyError] = useState<string | null>(null);

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
    loadKeys();
    loadModels();
    loadLoras();
    loadWorkflows();
  }, [loadKeys, loadModels, loadLoras, loadWorkflows]);

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
      setWfMsg(`Workflow '${wfName}' registered! Refresh the page to see it in model dropdowns.`);
      setShowWorkflowForm(false);
      setWfName("");
      setWfId("");
      setWfJson("");
      await loadWorkflows();
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
      setWfMsg(`Workflow '${driverId}' removed.`);
      await loadWorkflows();
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

  const handleUploadLora = async (file: File) => {
    setUploadingLora(true);
    setLoraError(null);
    setLoraMsg(null);
    try {
      await uploadLora(file);
      setLoraMsg(`Uploaded ${file.name} — refreshing list...`);
      await loadLoras();
    } catch (err) {
      setLoraError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploadingLora(false);
    }
  };

  const handleUploadModel = async (file: File) => {
    setUploadingModel(true);
    setModelError(null);
    setModelMsg(null);
    try {
      await uploadModel(file);
      setModelMsg(`Uploaded ${file.name} — refreshing list...`);
      await loadModels();
    } catch (err) {
      setModelError(err instanceof Error ? err.message : "Upload failed");
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

        <div className="p-5 space-y-6">
          {/* API Keys Section */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <Key className="w-4 h-4 text-studio-accent" />
              <h3 className="text-sm font-semibold">Cloud API Keys</h3>
            </div>
            <p className="text-[11px] text-studio-muted mb-4">
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
          </section>

          {/* Model Upload Section */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <Box className="w-4 h-4 text-studio-accent" />
              <h3 className="text-sm font-semibold">ComfyUI Models</h3>
            </div>
            <p className="text-[11px] text-studio-muted mb-4">
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
                {loadingModels ? `${models.length} models` : `${models.length} models`}
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
          </section>

          {/* LoRAs Section */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <Layers className="w-4 h-4 text-studio-accent" />
              <h3 className="text-sm font-semibold">ComfyUI LoRAs</h3>
            </div>
            <p className="text-[11px] text-studio-muted mb-4">
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
          </section>

          {/* Custom Workflows Section */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <FileJson className="w-4 h-4 text-studio-accent" />
              <h3 className="text-sm font-semibold">Custom ComfyUI Workflows</h3>
            </div>
            <p className="text-[11px] text-studio-muted mb-4">
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
                    onClick={() => { setShowWorkflowForm(false); setWfName(""); setWfId(""); setWfJson(""); setWfError(null); }}
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
          </section>
        </div>
      </div>
    </div>
  );
}
