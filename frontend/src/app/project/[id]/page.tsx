"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useStudioStore } from "@/lib/store";
import { getDrivers, fetchAssets, fetchShots, fetchScenes } from "@/lib/api";
import { AssetLibrary } from "@/components/library/MediaLibrary";
import { GenerationPanel } from "@/components/studio/GenerationPanel";
import { ShotComposer } from "@/components/shots/ShotComposer";
import { CameraDirector } from "@/components/camera/CameraDirector";
import { TimelineEditor } from "@/components/timeline/TimelineEditor";
import { DialoguePanel } from "@/components/timeline/DialoguePanel";
import { ExportButton } from "@/components/export/ExportButton";
import { UserMenu } from "@/components/UserMenu";
import { Film, Image, Clapperboard, Camera, Video, Music, Loader2, Home, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import Link from "next/link";
import { useAuth } from "@/lib/useAuth";
import { useRouter } from "next/navigation";

export default function ProjectWorkspacePage() {
  const params = useParams();
  const projectId = (params.id as string) || "default";
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { activeTab, setActiveTab, setDrivers, setAssets, setShots, setScenes } = useStudioStore();
  const [loaded, setLoaded] = useState(false);
  const [connected, setConnected] = useState(true);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

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

  const tabs = [
    { id: "assets" as const, label: "Assets", icon: Image, step: "1" },
    { id: "shots" as const, label: "Storyboard", icon: Clapperboard, step: "2" },
    { id: "camera" as const, label: "Camera", icon: Camera, step: "3" },
    { id: "audio" as const, label: "Audio", icon: Music, step: "4" },
    { id: "render" as const, label: "Timeline", icon: Video, step: "5" },
  ];

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

        {/* Tab navigation */}
        <nav className="ml-8 flex gap-1">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`relative flex items-center gap-2 px-3.5 py-1.5 text-xs font-medium rounded-lg transition-all ${
                  isActive
                    ? "bg-studio-accent text-white shadow-md shadow-studio-accent/20"
                    : "text-studio-muted hover:text-studio-text hover:bg-studio-panelHover"
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{tab.label}</span>
                <span className="text-[10px] opacity-50 hidden md:inline">{tab.step}</span>
              </button>
            );
          })}
        </nav>

        {/* Right side */}
        <div className="ml-auto flex items-center gap-3">
          {/* Connection status */}
          <div className="flex items-center gap-1.5 text-xs">
            <div className={`w-2 h-2 rounded-full ${connected ? "bg-studio-success" : "bg-studio-danger"} ${connected ? "animate-pulse" : ""}`} />
            <span className="text-studio-muted hidden sm:inline">{connected ? "Connected" : "Offline"}</span>
          </div>

          <div className="w-px h-5 bg-studio-border" />

          <ExportButton projectId={projectId} />

          <div className="w-px h-5 bg-studio-border" />

          <UserMenu />
        </div>
      </header>

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden min-h-0">
        {/* Sidebar */}
        <aside className={`bg-studio-panel/50 border-r border-studio-border overflow-hidden shrink-0 transition-all duration-200 ${sidebarCollapsed ? "w-10" : "w-64"}`}>
          {sidebarCollapsed ? (
            <div className="flex flex-col items-center pt-3 gap-3">
              <button
                onClick={() => setSidebarCollapsed(false)}
                className="p-1.5 rounded-lg hover:bg-studio-panelHover text-studio-muted hover:text-studio-accent transition-colors"
                title="Expand asset library"
              >
                <PanelLeftOpen className="w-4 h-4" />
              </button>
              <Image className="w-4 h-4 text-studio-muted/50" />
            </div>
          ) : (
            <div className="h-full flex flex-col">
              <div className="flex items-center justify-between px-3 pt-3 pb-1">
                <span className="text-[10px] text-studio-muted/50 uppercase tracking-wider">Assets</span>
                <button
                  onClick={() => setSidebarCollapsed(true)}
                  className="p-1 rounded-lg hover:bg-studio-panelHover text-studio-muted hover:text-studio-accent transition-colors"
                  title="Collapse asset library"
                >
                  <PanelLeftClose className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto">
                <AssetLibrary projectId={projectId} mode={activeTab === "render" ? "timeline" : activeTab === "camera" ? "camera" : "default"} />
              </div>
            </div>
          )}
        </aside>

        {/* Main workspace */}
        <main className="flex-1 overflow-auto min-h-0 bg-studio-bg">
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
            <div className="animate-fade-in h-full">
              {activeTab === "assets" && <GenerationPanel projectId={projectId} />}
              {activeTab === "shots" && <ShotComposer projectId={projectId} />}
              {activeTab === "camera" && <CameraDirector projectId={projectId} />}
              {activeTab === "audio" && <DialoguePanel projectId={projectId} />}
              {activeTab === "render" && <TimelineEditor projectId={projectId} />}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
