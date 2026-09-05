"use client";

import { useEffect, useState, useRef } from "react";
import { getWaveform, getVideoThumbnails } from "@/lib/api";

// Module-level caches to prevent refetching the same clip data
const waveformCache = new Map<string, number[]>();
const waveformFailed = new Set<string>();
const thumbnailCache = new Map<string, string[]>();
const thumbnailFailed = new Set<string>();
// In-flight promise deduplication (prevents Strict Mode double-fetch)
const waveformInflight = new Map<string, Promise<number[]>>();
const thumbnailInflight = new Map<string, Promise<string[]>>();

function fetchWaveform(projectId: string, filename: string, cacheKey: string): Promise<number[]> {
  if (waveformInflight.has(cacheKey)) return waveformInflight.get(cacheKey)!;
  const p = getWaveform(projectId, filename).then((res) => {
    if (res.peaks.length === 0) throw new Error("empty waveform");
    waveformCache.set(cacheKey, res.peaks);
    return res.peaks;
  }).catch((e) => {
    waveformFailed.add(cacheKey);
    throw e;
  }).finally(() => {
    waveformInflight.delete(cacheKey);
  });
  waveformInflight.set(cacheKey, p);
  return p;
}

function fetchThumbnails(projectId: string, filename: string, count: number, cacheKey: string): Promise<string[]> {
  if (thumbnailInflight.has(cacheKey)) return thumbnailInflight.get(cacheKey)!;
  const p = getVideoThumbnails(projectId, filename, count).then((res) => {
    if (res.thumbnails.length === 0) throw new Error("empty thumbnails");
    thumbnailCache.set(cacheKey, res.thumbnails);
    return res.thumbnails;
  }).catch((e) => {
    thumbnailFailed.add(cacheKey);
    throw e;
  }).finally(() => {
    thumbnailInflight.delete(cacheKey);
  });
  thumbnailInflight.set(cacheKey, p);
  return p;
}

interface WaveformDisplayProps {
  projectId: string;
  filename: string;
  height?: number;
  color?: string;
}

export function WaveformDisplay({ projectId, filename, height = 24, color = "#10b981" }: WaveformDisplayProps) {
  const [peaks, setPeaks] = useState<number[]>(() => waveformCache.get(`${projectId}:${filename}`) ?? []);
  const [loading, setLoading] = useState(() => !waveformCache.has(`${projectId}:${filename}`) && !waveformFailed.has(`${projectId}:${filename}`));
  const cacheKey = `${projectId}:${filename}`;

  useEffect(() => {
    if (waveformCache.has(cacheKey) || waveformFailed.has(cacheKey)) {
      setPeaks(waveformCache.get(cacheKey) ?? []);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void fetchWaveform(projectId, filename, cacheKey).then((peaks) => {
      if (!cancelled) {
        setPeaks(peaks);
        setLoading(false);
      }
    }).catch(() => {
      if (!cancelled) {
        setPeaks([]);
        setLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, [cacheKey, projectId, filename]);

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
  const cacheKey = `${projectId}:${filename}`;
  const [thumbnails, setThumbnails] = useState<string[]>(() => thumbnailCache.get(cacheKey) ?? []);
  const [loading, setLoading] = useState(() => !thumbnailCache.has(cacheKey) && !thumbnailFailed.has(cacheKey));

  useEffect(() => {
    if (thumbnailCache.has(cacheKey) || thumbnailFailed.has(cacheKey)) {
      setThumbnails(thumbnailCache.get(cacheKey) ?? []);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const count = Math.max(3, Math.min(12, Math.ceil(width / 60)));
    void fetchThumbnails(projectId, filename, count, cacheKey).then((thumbs) => {
      if (!cancelled) {
        setThumbnails(thumbs);
        setLoading(false);
      }
    }).catch(() => {
      if (!cancelled) {
        setThumbnails([]);
        setLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, [cacheKey, projectId, filename]);

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
