import { useCallback, useEffect, useRef, useState } from "react";
import { downloadEpub, extractDownloadErrorMessage } from "../api/client";
import type { JobProgress, JobStep, JobStepId, NovelInfo, StepState } from "../types/novel";

interface StepDef {
  id: JobStepId;
  label: string;
  /** Simulated percent at which this step is considered complete. */
  upTo: number;
}

// Rough shape of the work the backend is actually doing — downloading
// chapters dominates the timeline, so it gets the widest simulated band.
const STEP_DEFS: StepDef[] = [
  { id: "novel-info", label: "Novel information loaded", upTo: 8 },
  { id: "chapter-list", label: "Chapter list parsed", upTo: 18 },
  { id: "download-chapters", label: "Downloading chapters", upTo: 75 },
  { id: "clean-html", label: "Cleaning HTML", upTo: 85 },
  { id: "build-epub", label: "Building EPUB", upTo: 93 },
  { id: "package-epub", label: "Packaging EPUB", upTo: 98 },
  { id: "finished", label: "Finished", upTo: 100 },
];

const CAP_WHILE_PENDING = 96; // never let the simulation claim 100% on its own
const TICK_MS = 450;

function computeSteps(
  percent: number,
  errored: boolean
): { steps: JobStep[]; currentStepId: JobStepId; currentStepLabel: string } {
  let activeIdx = STEP_DEFS.findIndex((s) => percent < s.upTo);
  if (activeIdx === -1) activeIdx = STEP_DEFS.length - 1;

  const steps: JobStep[] = STEP_DEFS.map((def, idx) => {
    let status: StepState;
    if (errored && idx === activeIdx) status = "error";
    else if (idx < activeIdx) status = "done";
    else if (idx === activeIdx) status = "current";
    else status = "pending";
    return { id: def.id, label: def.label, status };
  });

  return {
    steps,
    currentStepId: STEP_DEFS[activeIdx].id,
    currentStepLabel: STEP_DEFS[activeIdx].label,
  };
}

function markAllDone(): JobStep[] {
  return STEP_DEFS.map((def) => ({ id: def.id, label: def.label, status: "done" as const }));
}

const IDLE_PROGRESS: JobProgress = {
  status: "idle",
  percent: 0,
  currentStepId: STEP_DEFS[0].id,
  currentStepLabel: STEP_DEFS[0].label,
  steps: STEP_DEFS.map((def) => ({ id: def.id, label: def.label, status: "pending" })),
  error: null,
  fileName: null,
};

interface UseEpubDownloadResult {
  progress: JobProgress | null;
  start: (url: string, novel?: NovelInfo) => Promise<void>;
  retry: () => Promise<void>;
  fileUrl: string | null;
}

export function useEpubDownload(): UseEpubDownloadResult {
  const [progress, setProgress] = useState<JobProgress | null>(null);
  const [fileUrl, setFileUrl] = useState<string | null>(null);

  const lastArgsRef = useRef<{ url: string; novel?: NovelInfo } | null>(null);
  const intervalRef = useRef<number | null>(null);
  const objectUrlRef = useRef<string | null>(null);

  const clearTicker = useCallback(() => {
    if (intervalRef.current !== null) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const revokeFile = useCallback(() => {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
  }, []);

  const start = useCallback(
    async (url: string, novel?: NovelInfo) => {
      lastArgsRef.current = { url, novel };
      clearTicker();
      revokeFile();
      setFileUrl(null);

      let percent = 0;
      const initial = computeSteps(0, false);
      setProgress({
        status: "running",
        percent,
        currentStepId: initial.currentStepId,
        currentStepLabel: initial.currentStepLabel,
        steps: initial.steps,
        error: null,
        fileName: null,
      });

      // Simulated progress: faster early, slows as it approaches the cap so
      // it never visually "finishes" before the request actually resolves.
      intervalRef.current = window.setInterval(() => {
        const remaining = CAP_WHILE_PENDING - percent;
        const step = Math.max(0.4, remaining / 14);
        percent = Math.min(CAP_WHILE_PENDING, percent + step);
        const computed = computeSteps(percent, false);
        setProgress((prev) =>
          prev && prev.status === "running"
            ? {
                ...prev,
                percent,
                currentStepId: computed.currentStepId,
                currentStepLabel: computed.currentStepLabel,
                steps: computed.steps,
              }
            : prev
        );
      }, TICK_MS);

      try {
        const { blob, fileName } = await downloadEpub(url, novel);
        clearTicker();

        const objectUrl = URL.createObjectURL(blob);
        objectUrlRef.current = objectUrl;
        setFileUrl(objectUrl);

        setProgress({
          status: "success",
          percent: 100,
          currentStepId: "finished",
          currentStepLabel: "Finished",
          steps: markAllDone(),
          error: null,
          fileName,
        });
      } catch (err) {
        clearTicker();
        const message = await extractDownloadErrorMessage(
          err,
          "Something went wrong while generating the EPUB."
        );
        setProgress((prev) => {
          const base = prev ?? { ...IDLE_PROGRESS, status: "running" as const };
          const computed = computeSteps(base.percent, true);
          return {
            ...base,
            status: "error",
            error: message,
            steps: computed.steps,
            currentStepId: computed.currentStepId,
            currentStepLabel: computed.currentStepLabel,
          };
        });
      }
    },
    [clearTicker, revokeFile]
  );

  const retry = useCallback(async () => {
    if (!lastArgsRef.current) return;
    await start(lastArgsRef.current.url, lastArgsRef.current.novel);
  }, [start]);

  useEffect(() => {
    return () => {
      clearTicker();
      revokeFile();
    };
  }, [clearTicker, revokeFile]);

  return { progress, start, retry, fileUrl };
}
