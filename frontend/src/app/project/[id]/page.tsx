"use client";

import { useEffect, useState, useRef } from "react";
import { useParams } from "next/navigation";
import { useStudioStore } from "@/lib/store";
import { getDrivers, fetchAssets, fetchShots, fetchScenes } from "@/lib/api";
import { AssetLibrary } from "@/components/library/MediaLibrary";
import { ShotComposer } from "@/components/shots/ShotComposer";
import { InspectorPanel } from "@/components/studio/InspectorPanel";
import { TimelineEditor } from "@/components/timeline/TimelineEditor";
import { UserMenu } from "@/components/UserMenu";
import { Film, Image, Loader2, PanelLeftClose, PanelLeftOpen, Sparkles, Video, ChevronDown, ChevronUp } from "lucide-react";
import Link from "next/link";
import { useAuth } from "@/lib/useAuth";
import { useRouter } from "next/navigation";

export default function ProjectWorkspacePage() {
  const params = useParams();
  const projectId = (params.id as string) || "default";
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const {
    setDrivers, setAssets, setShots, setScenes,
    timelineDockOpen, setTimelineDockOpen,
    activeInspector, setSidebarMode, sidebarMode,
    shots, selectedShotId, setSelectedShotId, setActiveInspector,
  } = useStudioStore();

  const [loaded, setLoaded] = useState(false);
  const [connected, setConnected] = useState(true);
  const [assetPanelCollapsed, setAssetPanelCollapsed] = useState(false);
  const [inspectorCollapsed, setInspectorCollapsed] = useState(false);
  const [storyboardCollapsed, setStoryboardCollapsed] = useState(false);
  const [timelineDockHeight, setTimelineDockHeight] = useState(45); // percentage
  const dragRef = useRef<HTMLDivElement | null>(null);

  // Derive sidebar mode from inspector + dock state
  useEffect(() => {
    if (activeInspector === "camera") setSidebarMode("camera");
    else if (timelineDockOpen) setSidebarMode("timeline");
    else setSidebarMode("default");
  }, [activeInspector, timelineDockOpen, setSidebarMode]);

  // Reset maximize when timeline dock closes
  // Reset storyboard collapse when timeline dock closes
  useEffect(() => {
    if (!timelineDockOpen && storyboardCollapsed) setStoryboardCollapsed(false);
  }, [timelineDockOpen, storyboardCollapsed]);

  // Toggle timeline dock — auto-collapse storyboard when opening, restore when closing
  const handleTimelineToggle = () => {
    const willOpen = !timelineDockOpen;
    setTimelineDockOpen(willOpen);
    setStoryboardCollapsed(willOpen);
  };

  // Drag-to-resize for timeline dock
  useEffect(() => {
    if (!timelineDockOpen || storyboardCollapsed) return;
    const el = dragRef.current;
    if (!el) return;

    let startY = 0;
    let startPct = 45;

    const onMouseMove = (e: MouseEvent) => {
      const container = el.parentElement;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const deltaPx = e.clientY - startY;
      const deltaPct = (deltaPx / rect.height) * 100;
      const newPct = Math.max(20, Math.min(80, startPct - deltaPct));
      setTimelineDockHeight(newPct);
    };

    const onMouseUp = () => {
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };

    const onMouseDown = (e: MouseEvent) => {
      e.preventDefault();
      startY = e.clientY;
      startPct = timelineDockHeight;
      document.body.style.cursor = "row-resize";
      document.body.style.userSelect = "none";
      window.addEventListener("mousemove", onMouseMove);
      window.addEventListener("mouseup", onMouseUp);
    };

    el.addEventListener("mousedown", onMouseDown);
    return () => {
      el.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [timelineDockOpen, storyboardCollapsed, timelineDockHeight]);

  useEffect(() => {
    if (!authLoading && !user) {
      router.replace("/");
    }
  }, [user, authLoading, router]);

  useEffect(() => {
    const init = async () => {
      try {
        const [drivers, assets, shots, scenes] = await Promise.all([
          getDrivers(),
          fetchAssets(projectId),
          fetchShots(projectId),
          fetchScenes(projectId),
        ]);
        setDrivers(drivers.image, drivers.video, drivers.audio);
        setAssets(assets);
        setShots(shots);
        setScenes(scenes);
        setConnected(true);
      } catch (e) {
        console.error("Failed to load project data:", e);
        setConnected(false);
      }
      setLoaded(true);
    };
    init();
  }, [projectId]);

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden">
      {/* Header */}
      <header className="h-14 bg-studio-panel/80 backdrop-blur-md border-b border-studio-border flex items-center px-4 shrink-0">
        {/* Logo + project name */}
        <Link href="/" className="flex items-center gap-2.5 group">
          <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-studio-accent/10 border border-studio-accent/20 group-hover:bg-studio-accent/20 transition-colors">
            <Film className="w-4 h-4 text-studio-accent" />
          </div>
          <span className="text-sm font-semibold">{projectId}</span>
        </Link>

        {/* Right side */}
        <div className="ml-auto flex items-center gap-3">
          {/* Connection status */}
          <div className="flex items-center gap-1.5 text-xs">
            <div className={`w-2 h-2 rounded-full ${connected ? "bg-studio-success" : "bg-studio-danger"} ${connected ? "animate-pulse" : ""}`} />
            <span className="text-studio-muted hidden sm:inline">{connected ? "Connected" : "Offline"}</span>
          </div>

          <div className="w-px h-5 bg-studio-border" />

          {/* Timeline dock toggle */}
          <button
            onClick={handleTimelineToggle}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
              timelineDockOpen
                ? "bg-studio-accent text-white"
                : "text-studio-muted hover:text-studio-text hover:bg-studio-panelHover"
            }`}
          >
            <Video className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Timeline</span>
            {timelineDockOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronUp className="w-3 h-3" />}
          </button>

          <div className="w-px h-5 bg-studio-border" />

          <UserMenu />
        </div>
      </header>

      {/* Main content — 3-pane layout */}
      <div className="flex-1 flex overflow-hidden min-h-0">
        {/* Far-left pane: Asset Library (collapsible, near scenes) */}
        {!loaded || !connected ? null : (
          <aside className={`bg-studio-panel/50 border-r border-studio-border overflow-hidden shrink-0 transition-all duration-200 ${assetPanelCollapsed ? "w-10" : "w-56"}`}>
            {assetPanelCollapsed ? (
              <div className="flex flex-col items-center pt-3 gap-3">
                <button
                  onClick={() => setAssetPanelCollapsed(false)}
                  className="p-1.5 rounded-lg hover:bg-studio-panelHover text-studio-muted hover:text-studio-accent transition-colors"
                  title="Expand asset library"
                >
                  <PanelLeftOpen className="w-4 h-4" />
                </button>
                <Image className="w-4 h-4 text-studio-muted/50" />
              </div>
            ) : (
              <div className="h-full flex flex-col">
                <div className="flex items-center justify-between px-3 pt-2 pb-1">
                  <span className="text-[10px] text-studio-muted/50 uppercase tracking-wider">Assets</span>
                  <button
                    onClick={() => setAssetPanelCollapsed(true)}
                    className="p-1 rounded-lg hover:bg-studio-panelHover text-studio-muted hover:text-studio-accent transition-colors"
                    title="Collapse asset library"
                  >
                    <PanelLeftClose className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto">
                  <AssetLibrary projectId={projectId} mode={sidebarMode} />
                </div>
              </div>
            )}
          </aside>
        )}

        {/* Left pane: Inspector (collapsible) */}
        {!loaded || !connected ? null : (
          <aside className={`shrink-0 overflow-hidden transition-all duration-200 ${inspectorCollapsed ? "w-10" : "w-[420px]"}`}>
            {inspectorCollapsed ? (
              <div className="flex flex-col items-center pt-3 gap-3 bg-studio-panel/30 border-r border-studio-border h-full">
                <button
                  onClick={() => setInspectorCollapsed(false)}
                  className="p-1.5 rounded-lg hover:bg-studio-panelHover text-studio-muted hover:text-studio-accent transition-colors"
                  title="Expand inspector"
                >
                  <PanelLeftOpen className="w-4 h-4" />
                </button>
                <Sparkles className="w-4 h-4 text-studio-muted/50" />
              </div>
            ) : (
              <div className="h-full flex flex-col">
                <div className="flex items-center justify-between px-2 pt-2 pb-1 bg-studio-panel/50 border-b border-studio-border shrink-0">
                  <span className="text-[10px] text-studio-muted/50 uppercase tracking-wider">Inspector</span>
                  <button
                    onClick={() => setInspectorCollapsed(true)}
                    className="p-1 rounded-lg hover:bg-studio-panelHover text-studio-muted hover:text-studio-accent transition-colors"
                    title="Collapse inspector"
                  >
                    <PanelLeftClose className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="flex-1 overflow-hidden min-h-0">
                  <InspectorPanel projectId={projectId} />
                </div>
              </div>
            )}
          </aside>
        )}

        {/* Center pane: Storyboard + Timeline dock */}
        <main className="flex-1 flex flex-col overflow-hidden min-h-0 bg-studio-bg">
          {!loaded ? (
            <div className="flex flex-col items-center justify-center h-full gap-3">
              <Loader2 className="w-8 h-8 animate-spin text-studio-accent" />
              <p className="text-sm text-studio-muted">Loading workspace...</p>
            </div>
          ) : !connected ? (
            <div className="flex flex-col items-center justify-center h-full gap-3">
              <div className="w-12 h-12 rounded-full bg-studio-danger/10 flex items-center justify-center">
                <span className="text-2xl">⚠</span>
              </div>
              <p className="text-sm text-studio-muted">Cannot connect to backend server</p>
              <p className="text-xs text-studio-muted/50">Make sure the FastAPI server is running on port 8001</p>
            </div>
          ) : (
            <>
              {/* Storyboard area (collapses to thumbnail strip) */}
              {!storyboardCollapsed && (
                <div className="flex-1 overflow-hidden min-h-0 flex flex-col" style={timelineDockOpen ? { height: `${100 - timelineDockHeight}%` } : undefined}>
                  <div className="flex-1 overflow-hidden min-h-0">
                    <ShotComposer projectId={projectId} />
                  </div>
                </div>
              )}

              {/* Storyboard collapsed — thumbnail strip */}
              {storyboardCollapsed && (
                <div className="flex items-center gap-2 px-3 py-1.5 bg-studio-panel/50 border-b border-studio-border shrink-0 overflow-x-auto">
                  <span className="text-[10px] text-studio-muted/60 uppercase tracking-wider shrink-0">Shots</span>
                  <div className="flex items-center gap-1 overflow-x-auto">
                    {[...shots].sort((a, b) => (a.sequence_order ?? 0) - (b.sequence_order ?? 0)).map((shot, idx) => (
                      <button
                        key={shot.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedShotId(shot.id);
                          setActiveInspector("shot");
                        }}
                        className={`relative shrink-0 rounded border transition-all overflow-hidden ${
                          selectedShotId === shot.id
                            ? "border-studio-accent ring-1 ring-studio-accent/40"
                            : "border-studio-border hover:border-studio-accent/40"
                        }`}
                        title={`${idx + 1}. ${shot.name}`}
                      >
                        <div className="w-16 h-9 bg-studio-bg flex items-center justify-center">
                          {shot.frame_image_path ? (
                            <img src={shot.frame_image_path} alt={shot.name} className="w-full h-full object-cover" />
                          ) : (
                            <span className="text-[8px] text-studio-muted/40">No frame</span>
                          )}
                        </div>
                        <div className="absolute top-0 left-0 px-0.5 text-[8px] font-bold bg-black/60 text-white rounded-br">
                          {idx + 1}
                        </div>
                      </button>
                    ))}
                    {shots.length === 0 && (
                      <span className="text-[10px] text-studio-muted/40">No shots yet</span>
                    )}
                  </div>
                  <button
                    onClick={() => setStoryboardCollapsed(false)}
                    className="flex items-center gap-1 px-2 py-0.5 text-[10px] text-studio-muted hover:text-studio-accent rounded transition-colors shrink-0 ml-auto"
                    title="Restore storyboard"
                  >
                    <ChevronDown className="w-3 h-3" />
                    Restore
                  </button>
                </div>
              )}

              {/* Timeline dock (collapsible bottom, resizable) */}
              {timelineDockOpen && (
                <div
                  className={`border-t border-studio-border animate-fade-in overflow-hidden flex flex-col ${storyboardCollapsed ? "flex-1" : ""}`}
                  style={storyboardCollapsed ? undefined : { height: `${timelineDockHeight}%` }}
                >
                  {/* Drag handle for resizing */}
                  {!storyboardCollapsed && (
                    <div
                      ref={dragRef}
                      className="h-1.5 bg-studio-border hover:bg-studio-accent/40 cursor-row-resize shrink-0 transition-colors"
                    />
                  )}
                  <div className="flex-1 overflow-hidden min-h-0">
                    <TimelineEditor projectId={projectId} />
                  </div>
                </div>
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
