"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Film, Plus, Trash2, ArrowRight, FolderOpen, Clock } from "lucide-react";
import { listProjects, createProject, deleteProject, type ProjectResponse } from "@/lib/api";
import { useAuth } from "@/lib/useAuth";
import { UserMenu } from "@/components/UserMenu";

// Backend returns `id` but we use `project_id` in the frontend for consistency
interface ProjectItem {
  id: string;
  name: string;
  description: string;
  created_at: string;
  asset_count: number;
  shot_count: number;
}

export default function ProjectsPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) {
      router.replace("/");
    }
  }, [user, authLoading, router]);

  const loadProjects = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await listProjects();
      setProjects(res as ProjectItem[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load projects");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProjects();
  }, []);

  const handleCreate = async () => {
    if (!newName.trim()) {
      setError("Project name is required");
      return;
    }
    setCreating(true);
    setError(null);
    try {
      const res = await createProject(newName.trim(), newDesc.trim() || undefined);
      setNewName("");
      setNewDesc("");
      setShowCreate(false);
      router.push(`/project/${(res as ProjectItem).id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create project");
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (projectId: string, name: string) => {
    if (!window.confirm(`Delete project "${name}"? This cannot be undone.`)) return;
    try {
      await deleteProject(projectId);
      setProjects((prev) => prev.filter((p) => p.id !== projectId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete project");
    }
  };

  return (
    <div className="min-h-screen px-8 py-12">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <div className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-studio-accent/10 border border-studio-accent/20">
              <Film className="w-5 h-5 text-studio-accent" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Projects</h1>
              <p className="text-xs text-studio-muted">Manage your AI movie projects</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <UserMenu />
            <button
              onClick={() => setShowCreate(!showCreate)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-studio-accent hover:bg-studio-accentHover text-white rounded-lg text-sm font-medium transition-colors"
            >
              <Plus className="w-4 h-4" />
              New Project
            </button>
          </div>
        </div>

        {showCreate && (
          <div className="mb-6 p-5 bg-studio-panel border border-studio-border rounded-xl">
            <h2 className="text-sm font-semibold mb-4">Create New Project</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="text-[11px] font-medium text-studio-muted mb-1 block">Name</label>
                <input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="My Awesome Film"
                  className="w-full px-3 py-2 bg-studio-bg border border-studio-border rounded-lg text-sm focus:outline-none focus:border-studio-accent"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleCreate();
                  }}
                />
              </div>
              <div>
                <label className="text-[11px] font-medium text-studio-muted mb-1 block">Description (optional)</label>
                <input
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  placeholder="A short description..."
                  className="w-full px-3 py-2 bg-studio-bg border border-studio-border rounded-lg text-sm focus:outline-none focus:border-studio-accent"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleCreate();
                  }}
                />
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleCreate}
                disabled={creating || !newName.trim()}
                className="px-4 py-2 bg-studio-accent hover:bg-studio-accentHover disabled:bg-studio-border disabled:text-studio-muted text-white rounded-lg text-sm font-medium transition-colors"
              >
                {creating ? "Creating..." : "Create"}
              </button>
              <button
                onClick={() => {
                  setShowCreate(false);
                  setNewName("");
                  setNewDesc("");
                }}
                className="px-4 py-2 bg-studio-bg hover:bg-studio-border border border-studio-border text-studio-text rounded-lg text-sm transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {error && (
          <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-sm text-red-400">
            {error}
          </div>
        )}

        {loading ? (
          <div className="text-center py-16 text-studio-muted text-sm">Loading projects...</div>
        ) : projects.length === 0 ? (
          <div className="text-center py-16">
            <FolderOpen className="w-12 h-12 text-studio-muted/30 mx-auto mb-4" />
            <p className="text-studio-muted text-sm mb-2">No projects yet</p>
            <p className="text-studio-muted/50 text-xs">Click "New Project" to get started</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {projects.map((project) => (
              <div
                key={project.id}
                className="group p-5 bg-studio-panel hover:bg-studio-panel/80 rounded-xl border border-studio-border hover:border-studio-accent/30 transition-all hover:translate-y-[-2px]"
              >
                <Link href={`/project/${project.id}`} className="block">
                  <div className="flex items-start justify-between mb-3">
                    <div className="inline-flex items-center justify-center w-10 h-10 rounded-lg bg-studio-accent/10">
                      <Film className="w-5 h-5 text-studio-accent" />
                    </div>
                    <ArrowRight className="w-4 h-4 text-studio-muted opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                  <h3 className="text-sm font-semibold mb-1 truncate">{project.name}</h3>
                  {project.description && (
                    <p className="text-xs text-studio-muted line-clamp-2 mb-3">{project.description}</p>
                  )}
                  <div className="flex items-center gap-1 text-[10px] text-studio-muted/50">
                    <Clock className="w-3 h-3" />
                    {new Date(project.created_at).toLocaleDateString()}
                  </div>
                </Link>
                <div className="mt-3 pt-3 border-t border-studio-border/50 flex justify-end">
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      handleDelete(project.id, project.name);
                    }}
                    className="text-studio-muted hover:text-red-400 transition-colors"
                    title="Delete project"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
