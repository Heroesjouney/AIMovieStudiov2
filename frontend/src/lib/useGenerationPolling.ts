"use client";

import { useState, useRef, useCallback, useEffect } from "react";

interface PollOptions {
  intervalMs?: number;
  maxErrors?: number;
}

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
 */
export function useGenerationPolling() {
  const [isRunning, setIsRunning] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const stopPolling = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    stopTimer();
  }, [stopTimer]);

  const startTimer = useCallback(() => {
    setElapsedSeconds(0);
    stopTimer();
    timerRef.current = setInterval(() => {
      setElapsedSeconds((s) => s + 1);
    }, 1000);
  }, [stopTimer]);

  /**
   * Start polling a generation job.
   * @param checkFn Function that checks job status (returns PollResult)
   * @param onComplete Called when status is "completed"
   * @param options Optional config
   */
  const startPolling = useCallback(
    <T extends PollResult<T>>(
      checkFn: () => Promise<T>,
      onComplete: (result: T) => void | Promise<void>,
      options: PollOptions = {}
    ) => {
      const { intervalMs = 3000, maxErrors = 5 } = options;
      setIsRunning(true);
      setError(null);
      setStatus("Submitting...");
      startTimer();

      let pollErrors = 0;
      stopPolling();

      intervalRef.current = setInterval(async () => {
        try {
          const result = await checkFn();
          pollErrors = 0;

          if (result.status === "completed") {
            stopPolling();
            setStatus("Completed!");
            setIsRunning(false);
            await onComplete(result);
          } else if (result.status === "failed") {
            stopPolling();
            setError(result.error_message || "Generation failed");
            setIsRunning(false);
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
          }
        }
      }, intervalMs);
    },
    [startTimer, stopPolling]
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const reset = useCallback(() => {
    stopPolling();
    setIsRunning(false);
    setStatus("");
    setError(null);
    setElapsedSeconds(0);
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
