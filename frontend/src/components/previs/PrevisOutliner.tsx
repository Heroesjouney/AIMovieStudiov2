"use client";

import { useState } from "react";
import {
  User, Box, Trash2, Plus, Check, X,
  Box as CubeIcon, Circle, Cylinder, Square, Triangle, Donut,
} from "lucide-react";
import { usePrevisStore, type ProxyKind } from "@/lib/usePrevisStore";

const ADD_OPTIONS: { kind: ProxyKind; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { kind: "character", label: "Character", icon: User },
  { kind: "set", label: "Set Piece", icon: Box },
  { kind: "cube", label: "Cube", icon: CubeIcon },
  { kind: "sphere", label: "Sphere", icon: Circle },
  { kind: "cylinder", label: "Cylinder", icon: Cylinder },
  { kind: "plane", label: "Plane", icon: Square },
  { kind: "cone", label: "Cone", icon: Triangle },
  { kind: "torus", label: "Torus", icon: Donut },
];

/**
 * Scene Outliner — left sidebar listing all scene proxies.
 * Click to select, double-click to rename, trash to delete.
 */
export function PrevisOutliner() {
  const proxies = usePrevisStore((s) => s.proxies);
  const selectedProxyId = usePrevisStore((s) => s.selectedProxyId);
  const selectProxy = usePrevisStore((s) => s.selectProxy);
  const addProxy = usePrevisStore((s) => s.addProxy);
  const removeProxy = usePrevisStore((s) => s.removeProxy);
  const renameProxy = usePrevisStore((s) => s.renameProxy);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [showAddMenu, setShowAddMenu] = useState(false);

  const startEdit = (id: string, currentLabel: string) => {
    setEditingId(id);
    setEditValue(currentLabel);
  };

  const commitEdit = () => {
    if (editingId && editValue.trim()) {
      renameProxy(editingId, editValue.trim());
    }
    setEditingId(null);
  };

  const handleAdd = (kind: ProxyKind) => {
    addProxy(kind);
    setShowAddMenu(false);
  };

  return (
    <div className="flex flex-col h-full bg-studio-panel/50">
      {/* Header */}
      <div className="px-2.5 py-1.5 border-b border-studio-border shrink-0">
        <div className="flex items-center justify-between mb-1.5">
          <span
            className="text-[9px] text-studio-muted/60 uppercase tracking-wider font-semibold cursor-help"
            title="Double-click an item to rename · Drag in 3D to move"
          >
            Scene
          </span>
          <div className="relative">
            <button
              onClick={() => setShowAddMenu(!showAddMenu)}
              className="flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] bg-studio-accent/15 hover:bg-studio-accent/25 text-studio-accent transition-colors"
              title="Add object"
            >
              <Plus className="w-2.5 h-2.5" />
              <span className="hidden md:inline">Add</span>
            </button>
            {showAddMenu && (
              <>
                {/* Click-away overlay */}
                <div className="fixed inset-0 z-40" onClick={() => setShowAddMenu(false)} />
                <div className="absolute right-0 top-full mt-1 z-50 w-32 bg-studio-panel border border-studio-border rounded-md shadow-xl py-1">
                  {ADD_OPTIONS.map((opt) => {
                    const Icon = opt.icon;
                    return (
                      <button
                        key={opt.kind}
                        onClick={() => handleAdd(opt.kind)}
                        className="w-full flex items-center gap-2 px-2 py-1 text-[10px] text-studio-muted hover:text-studio-text hover:bg-studio-panelHover transition-colors"
                      >
                        <Icon className="w-3 h-3 shrink-0" />
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Proxy list */}
      <div className="flex-1 overflow-y-auto min-h-0 py-1">
        {proxies.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-1.5 px-2">
            <Box className="w-5 h-5 text-studio-muted/20" />
            <p className="text-[10px] text-studio-muted/40 text-center">No objects in scene</p>
            <p className="text-[9px] text-studio-muted/30 text-center">Click <span className="text-studio-accent">Add</span> to insert</p>
          </div>
        )}
        {proxies.map((p) => {
          const isSelected = selectedProxyId === p.id;
          const isEditing = editingId === p.id;
          const Icon = ADD_OPTIONS.find((o) => o.kind === p.kind)?.icon ?? Box;
          return (
            <div
              key={p.id}
              onClick={() => selectProxy(p.id)}
              onDoubleClick={() => startEdit(p.id, p.label)}
              className={`group flex items-center gap-1.5 px-2.5 py-1 cursor-pointer transition-colors ${
                isSelected
                  ? "bg-studio-accent/15 border-l-2 border-studio-accent"
                  : "hover:bg-studio-panelHover border-l-2 border-transparent"
              }`}
            >
              {/* Color swatch */}
              <div
                className="w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: p.color }}
              />
              <Icon className="w-3 h-3 text-studio-muted shrink-0" />

              {/* Label (or rename input) */}
              {isEditing ? (
                <div className="flex items-center gap-0.5 flex-1 min-w-0">
                  <input
                    autoFocus
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") commitEdit();
                      if (e.key === "Escape") setEditingId(null);
                    }}
                    onBlur={commitEdit}
                    className="flex-1 min-w-0 px-1 py-0.5 bg-studio-bg border border-studio-accent/40 rounded text-[10px] text-studio-text focus:outline-none"
                  />
                  <button
                    onClick={(e) => { e.stopPropagation(); commitEdit(); }}
                    className="p-0.5 rounded hover:bg-studio-panelHover text-studio-success"
                  >
                    <Check className="w-2.5 h-2.5" />
                  </button>
                </div>
              ) : (
                <span
                  className={`flex-1 min-w-0 truncate text-[11px] ${
                    isSelected ? "text-studio-text font-medium" : "text-studio-muted"
                  }`}
                  title={p.label}
                >
                  {p.label}
                </span>
              )}

              {/* Delete (visible on hover) */}
              {!isEditing && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    removeProxy(p.id);
                  }}
                  className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-studio-danger/20 text-studio-muted hover:text-studio-danger transition-all shrink-0"
                  title="Delete"
                >
                  <Trash2 className="w-2.5 h-2.5" />
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer — removed; hint moved to header tooltip */}
    </div>
  );
}
