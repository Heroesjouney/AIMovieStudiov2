"use client";

import { useState } from "react";
import { getExportUrl } from "@/lib/api";
import { Download, FileText, FileCode } from "lucide-react";

export function ExportButton({ projectId }: { projectId: string }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-studio-panel border border-studio-border hover:border-studio-accent/40 hover:text-studio-accent rounded-lg transition-all"
      >
        <Download className="w-3.5 h-3.5" />
        Export
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1.5 w-52 bg-studio-panel border border-studio-border rounded-xl shadow-2xl z-50 overflow-hidden">
            <a
              href={getExportUrl(projectId, "edl")}
              className="flex items-center gap-3 px-3.5 py-2.5 text-xs hover:bg-studio-panelHover transition-colors border-b border-studio-border/50"
            >
              <FileText className="w-4 h-4 text-studio-accent" />
              <div>
                <p className="font-medium">EDL (CMX 3600)</p>
                <p className="text-studio-muted text-[10px] mt-0.5">For DaVinci, Avid, Premiere</p>
              </div>
            </a>
            <a
              href={getExportUrl(projectId, "xml")}
              className="flex items-center gap-3 px-3.5 py-2.5 text-xs hover:bg-studio-panelHover transition-colors"
            >
              <FileCode className="w-4 h-4 text-studio-accent" />
              <div>
                <p className="font-medium">Premiere XML</p>
                <p className="text-studio-muted text-[10px] mt-0.5">For Adobe Premiere Pro</p>
              </div>
            </a>
          </div>
        </>
      )}
    </div>
  );
}
