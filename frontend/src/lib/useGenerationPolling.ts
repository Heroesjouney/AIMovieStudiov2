"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useStudioStore } from "./store";

interface PollOptions {
  intervalMs?: number;
  maxErrors?: number;
  jobId?: string;
}

// Module-level interval tracking — keyed by job_id so concurrent polls don't
// conflict. Survives component unmount/remount so polling continues when the
// user switches tabs.
const _moduleIntervals = new Map<string, ReturnType<typeof setInterval>>();
const _moduleTimers = new Map<string, ReturnType<typeof setInterval>>();

interface PollResult<T> {
  status: "completed" | "failed" | "in_queue" | "processing" | string;
  image_urls?: string[];
  error_message?: string;
  metadata?: any;
  sub_jobs?: any[];
  image_url?: string;
}

/**
 * Shared polling hook for generation jobs (frames, angles, variations, retakes).
 * Handles interval management, error counting, and cleanup.
 *
 * Each poll is keyed by `jobId` so multiple concurrent frame generations can
 * run in parallel without one killing another's interval.
 */
export function useGenerationPolling() {
  const [isRunning, setIsRunning] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const currentJobIdRef = useRef<string | null>(null);

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    const jid = currentJobIdRef.current;
    if (jid && _moduleTimers.has(jid)) {
      clearInterval(_moduleTimers.get(jid)!);
      _moduleTimers.delete(jid);
    }
  }, []);

  const stopPolling = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    const jid = currentJobIdRef.current;
    if (jid && _moduleIntervals.has(jid)) {
      clearInterval(_moduleIntervals.get(jid)!);
      _moduleIntervals.delete(jid);
    }
    stopTimer();
  }, [stopTimer]);

  const startTimer = useCallback(() => {
    setElapsedSeconds(0);
    stopTimer();
    const jid = currentJobIdRef.current;
    if (!jid) return;
    const id = setInterval(() => {
      setElapsedSeconds((s) => s + 1);
    }, 1000);
    _moduleTimers.set(jid, id);
    timerRef.current = id;
  }, [stopTimer]);

  /**
   * Start polling a generation job.
   * @param checkFn Function that checks job status (returns PollResult)
   * @param onComplete Called when status is "completed"
   * @param options Optional config (intervalMs, maxErrors, jobId)
   */
  const startPolling = useCallback(
    <T extends PollResult<T>>(
      checkFn: () => Promise<T>,
      onComplete: (result: T) => void | Promise<void>,
      options: PollOptions = {}
    ) => {
      const { intervalMs = 3000, maxErrors = 5, jobId } = options;
      if (jobId) {
        currentJobIdRef.current = jobId;
      }
      const jid = currentJobIdRef.current || "default";

      setIsRunning(true);
      setError(null);
      setStatus("Submitting...");
      startTimer();

      let pollErrors = 0;
      // Only stop THIS instance's previous interval — not other instances' polls
      stopPolling();

      const intervalId = setInterval(async () => {
        try {
          const result = await checkFn();
          pollErrors = 0;

          if (result.status === "completed") {
            stopPolling();
            setStatus("Completed!");
            setIsRunning(false);
            useStudioStore.getState().removeActiveFrameJob(jid);
            await onComplete(result);
          } else if (result.status === "failed") {
            stopPolling();
            setError(result.error_message || "Generation failed");
            setIsRunning(false);
            useStudioStore.getState().removeActiveFrameJob(jid);
          } else {
            setStatus(result.status === "in_queue" ? "In queue..." : "Processing...");
          }
        } catch (pollErr) {
          pollErrors++;
          console.warn("[useGenerationPolling] poll error:", pollErr);
          if (pollErrors >= maxErrors) {
            stopPolling();
            setError("Lost connection to backend while polling. The job may still be running — refresh later.");
            setIsRunning(false);
            useStudioStore.getState().removeActiveFrameJob(jid);
          }
        }
      }, intervalMs);
      _moduleIntervals.set(jid, intervalId);
      intervalRef.current = intervalId;
    },
    [startTimer, stopPolling]
  );

  // Sync isRunning from the global store on mount and when store changes.
  // The store is set by the caller before startPolling, and cleared when
  // the interval completes (even if this component is unmounted).
  const activeFrameJobs = useStudioStore((s) => s.activeFrameJobs);
  useEffect(() => {
    const jid = currentJobIdRef.current;
    const stillActive = jid ? activeFrameJobs.some((j) => j.job_id === jid) : false;
    if (stillActive) {
      setIsRunning(true);
    } else {
      setIsRunning(false);
      // Clean up this instance's interval if its job is no longer active
      if (jid) {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
        if (_moduleIntervals.has(jid)) {
          clearInterval(_moduleIntervals.get(jid)!);
          _moduleIntervals.delete(jid);
        }
        stopTimer();
      }
    }
  }, [activeFrameJobs, stopTimer]);

  const reset = useCallback(() => {
    stopPolling();
    setIsRunning(false);
    setStatus("");
    setError(null);
    setElapsedSeconds(0);
    const jid = currentJobIdRef.current;
    if (jid) {
      useStudioStore.getState().removeActiveFrameJob(jid);
    }
  }, [stopPolling]);

  const elapsedDisplay = `${Math.floor(elapsedSeconds / 60)}:${(elapsedSeconds % 60).toString().padStart(2, "0")}`;

  return {
    isRunning,
    status,
    error,
    elapsedSeconds,
    elapsedDisplay,
    startPolling,
    stopPolling,
    reset,
    setError,
    setStatus,
  };
}
