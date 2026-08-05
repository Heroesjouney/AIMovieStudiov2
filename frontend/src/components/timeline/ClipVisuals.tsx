"use client";

import { useEffect, useState, useRef } from "react";
import { getWaveform, getVideoThumbnails } from "@/lib/api";

interface WaveformDisplayProps {
  projectId: string;
  filename: string;
  height?: number;
  color?: string;
}

export function WaveformDisplay({ projectId, filename, height = 24, color = "#10b981" }: WaveformDisplayProps) {
  const [peaks, setPeaks] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const cacheKey = `${projectId}:${filename}`;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void getWaveform(projectId, filename).then((res) => {
      if (!cancelled) {
        setPeaks(res.peaks);
        setLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, [cacheKey]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full" style={{ height }}>
        <div className="w-full h-full bg-studio-border/20 animate-pulse rounded" />
      </div>
    );
  }

  if (peaks.length === 0) return null;

  const midY = height / 2;

  return (
    <svg width="100%" height={height} className="overflow-hidden" preserveAspectRatio="none">
      {peaks.map((peak, i) => {
        const barWidth = 100 / peaks.length;
        const barHeight = Math.max(1, peak * height * 0.9);
        const x = (i / peaks.length) * 100;
        return (
          <rect
            key={i}
            x={`${x}%`}
            y={midY - barHeight / 2}
            width={`${barWidth * 0.7}%`}
            height={barHeight}
            fill={color}
            opacity={0.7}
          />
        );
      })}
    </svg>
  );
}

interface ThumbnailStripProps {
  projectId: string;
  filename: string;
  width: number;
  height: number;
}

export function ThumbnailStrip({ projectId, filename, width, height }: ThumbnailStripProps) {
  const [thumbnails, setThumbnails] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const cacheKey = `${projectId}:${filename}`;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const count = Math.max(3, Math.min(12, Math.ceil(width / 60)));
    void getVideoThumbnails(projectId, filename, count).then((res) => {
      if (!cancelled) {
        setThumbnails(res.thumbnails);
        setLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, [cacheKey, width]);

  if (loading) {
    return <div className="w-full h-full bg-studio-border/20 animate-pulse" />;
  }

  if (thumbnails.length === 0) return null;

  return (
    <div className="flex w-full h-full overflow-hidden">
      {thumbnails.map((thumb, i) => (
        <div
          key={i}
          className="flex-1 h-full overflow-hidden"
          style={{ minWidth: 0 }}
        >
          <img
            src={thumb}
            alt=""
            className="w-full h-full object-cover"
            style={{ opacity: 0.85 }}
          />
        </div>
      ))}
    </div>
  );
}
