"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut, User as UserIcon, FolderOpen } from "lucide-react";
import { useAuth } from "@/lib/useAuth";

export function UserMenu() {
  const { user, signOut } = useAuth();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  if (!user) return null;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-studio-panel border border-studio-border hover:border-studio-accent/30 transition-colors"
      >
        <div className="w-6 h-6 rounded-full bg-studio-accent/20 flex items-center justify-center">
          <UserIcon className="w-3.5 h-3.5 text-studio-accent" />
        </div>
        <span className="text-sm text-white font-medium hidden sm:inline">{user.username}</span>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-2 w-56 bg-studio-panel border border-studio-border rounded-lg shadow-xl z-20 overflow-hidden">
            <div className="px-4 py-3 border-b border-studio-border">
              <div className="text-sm font-medium text-white">{user.username}</div>
              <div className="text-xs text-studio-muted">{user.email}</div>
            </div>
            <button
              onClick={() => {
                setOpen(false);
                router.push("/projects");
              }}
              className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-studio-muted hover:text-white hover:bg-studio-border/50 transition-colors"
            >
              <FolderOpen className="w-4 h-4" />
              My Projects
            </button>
            <button
              onClick={() => {
                signOut();
                setOpen(false);
                router.push("/");
              }}
              className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-studio-muted hover:text-white hover:bg-studio-border/50 transition-colors"
            >
              <LogOut className="w-4 h-4" />
              Sign Out
            </button>
          </div>
        </>
      )}
    </div>
  );
}
