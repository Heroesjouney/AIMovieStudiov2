"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useStudioStore } from "./store";

interface PollOptions {
  intervalMs?: number;
  maxErrors?: number;
  jobId?: string;
}

// Module-level timer tracking — keyed by job_id so concurrent polls don't
// conflict. Survives component unmount/remount so polling continues when the
// user switches tabs.
//
// NOTE: `_modulePollTimers` holds the sequential poll chain (setTimeout), NOT
// an interval. The chain re-schedules itself only if its own timer ID is still
// the registered one for the job — this is the cross-instance liveness guard
// that lets stopPolling / store-sync / takeover from another instance cleanly
// halt a chain even when a poll is in flight.
const _modulePollTimers = new Map<string, ReturnType<typeof setTimeout>>();
const _moduleTimers = new Map<string, ReturnType<typeof setInterval>>();
const _moduleRequests = new Map<string, Promise<unknown>>();

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
  const intervalRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const currentJobIdRef = useRef<string | null>(null);
  const runRef = useRef(0);

  const stopTimer = useCallback(() => {
    const jid = currentJobIdRef.current || "default";
    if (timerRef.current !== null) {
      clearInterval(timerRef.current);
      if (_moduleTimers.get(jid) === timerRef.current) _moduleTimers.delete(jid);
      timerRef.current = null;
    }
  }, []);

  const stopPolling = useCallback(() => {
    runRef.current++;
    const jid = currentJobIdRef.current || "default";
    if (intervalRef.current !== null) {
      clearTimeout(intervalRef.current);
      if (_modulePollTimers.get(jid) === intervalRef.current) _modulePollTimers.delete(jid);
      intervalRef.current = null;
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
      const jid = jobId || currentJobIdRef.current || "default";
      let pollErrors = 0;
      // Only stop THIS instance's previous chain — not other instances' polls
      stopPolling();
      if (jobId) currentJobIdRef.current = jobId;
      const previousPoll = _modulePollTimers.get(jid);
      if (previousPoll !== undefined) clearTimeout(previousPoll);
      const previousTimer = _moduleTimers.get(jid);
      if (previousTimer !== undefined) clearInterval(previousTimer);
      _moduleTimers.delete(jid);

      setIsRunning(true);
      setError(null);
      setStatus("Submitting...");
      startTimer();

      // Sequential polling chain: schedule the next poll only after the
      // previous completes. Prevents overlapping async status requests,
      // which is critical for endpoints that mutate state per poll (e.g.
      // retake persistence). The chain re-schedules only if its own timer
      // ID is still the registered one for the job — that guard is what
      // lets stopPolling / store-sync / takeover from another instance
      // cleanly halt a chain even when a poll is in flight.
      const pollOnce = async () => {
        // Liveness check: another instance took over, or stopPolling ran.
        if (intervalRef.current !== myTimerId || _modulePollTimers.get(jid) !== myTimerId) return;
        try {
          const pending = _moduleRequests.get(jid);
          if (pending) {
            await pending.catch(() => {});
            if (intervalRef.current !== myTimerId || _modulePollTimers.get(jid) !== myTimerId) return;
          }
          const request = checkFn();
          _moduleRequests.set(jid, request);
          let result: T;
          try {
            result = await request;
          } finally {
            if (_moduleRequests.get(jid) === request) _moduleRequests.delete(jid);
          }
          // Re-check after the await — stop may have fired during the request.
          if (intervalRef.current !== myTimerId || _modulePollTimers.get(jid) !== myTimerId) return;
          pollErrors = 0;

          if (result.status === "completed") {
            stopPolling();
            setStatus("Completed!");
            setIsRunning(false);
            useStudioStore.getState().removeActiveFrameJob(jid);
            const completionRun = runRef.current;
            try {
              await onComplete(result);
            } catch (completionError) {
              console.warn("[useGenerationPolling] completion error:", completionError);
              if (runRef.current === completionRun) {
                setError(completionError instanceof Error ? completionError.message : "Failed to save generation result");
              }
            }
            return;
          } else if (result.status === "failed") {
            stopPolling();
            setError(result.error_message || "Generation failed");
            setIsRunning(false);
            useStudioStore.getState().removeActiveFrameJob(jid);
            return;
          } else {
            setStatus(result.status === "in_queue" ? "In queue..." : "Processing...");
          }
        } catch (pollErr) {
          // Re-check: a stop during the failed request should not re-schedule.
          if (intervalRef.current !== myTimerId || _modulePollTimers.get(jid) !== myTimerId) return;
          pollErrors++;
          console.warn("[useGenerationPolling] poll error:", pollErr);
          if (pollErrors >= maxErrors) {
            stopPolling();
            setError("Lost connection to backend while polling. The job may still be running — refresh later.");
            setIsRunning(false);
            useStudioStore.getState().removeActiveFrameJob(jid);
            return;
          }
        }
        // Re-check before scheduling the next tick — stop may have fired
        // during the await or in a terminal branch above.
        if (intervalRef.current !== myTimerId || _modulePollTimers.get(jid) !== myTimerId) return;
        myTimerId = setTimeout(pollOnce, intervalMs);
        _modulePollTimers.set(jid, myTimerId);
        intervalRef.current = myTimerId;
      };

      // First poll fires after one interval (matches prior setInterval timing).
      let myTimerId = setTimeout(pollOnce, intervalMs);
      _modulePollTimers.set(jid, myTimerId);
      intervalRef.current = myTimerId;
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
      if (jid && (intervalRef.current !== null || timerRef.current !== null)) stopPolling();
    }
  }, [activeFrameJobs, stopPolling]);

  const reset = useCallback(() => {
    const jid = currentJobIdRef.current;
    const ownsJob = intervalRef.current !== null && _modulePollTimers.get(jid || "default") === intervalRef.current;
    stopPolling();
    setIsRunning(false);
    setStatus("");
    setError(null);
    setElapsedSeconds(0);
    if (jid && ownsJob) {
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
