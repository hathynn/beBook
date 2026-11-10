import { useCallback, useEffect, useRef, useState } from "react";
import { createEpubJob, downloadJobFile, extractApiErrorMessage, getEpubJob } from "../api/client";
import type {
  DownloadReport,
  JobProgress,
  JobStep,
  JobStepId,
  JobView,
  NovelInfo,
  StepState,
} from "../types/novel";

const STEP_LABELS: Record<JobStepId, string> = {
  queued: "Waiting in queue",
  "novel-info": "Loading novel information",
  "download-chapters": "Downloading chapters",
  "download-images": "Downloading images",
  "build-epub": "Building EPUB",
  finished: "Finished",
};
const STEP_ORDER: JobStepId[] = [
  "novel-info",
  "download-chapters",
  "download-images",
  "build-epub",
  "finished",
];

const POLL_MS = 1000;
const MAX_POLL_ERRORS = 5;

function stepOf(job: JobView): JobStepId {
  if (job.status === "queued") return "queued";
  if (job.status === "done") return "finished";
  switch (job.phase) {
    case "chapters":
      return "download-chapters";
    case "images":
      return "download-images";
    case "build":
      return "build-epub";
    default:
      return "novel-info";
  }
}

/** Phần trăm thật: chương chiếm 5→85%, ảnh 85→95%, đóng gói 95→100%. */
function percentOf(job: JobView): number {
  const frac = job.total > 0 ? job.done / job.total : 0;
  if (job.status === "done") return 100;
  if (job.status === "queued") return 0;
  switch (job.phase) {
    case "chapters":
      return 5 + frac * 80;
    case "images":
      return 85 + frac * 10;
    case "build":
      return 97;
    default:
      return 2;
  }
}

function labelOf(job: JobView): string {
  const step = stepOf(job);
  if (step === "queued") {
    return job.queuePosition > 0 ? `Waiting in queue (#${job.queuePosition})` : STEP_LABELS.queued;
  }
  if ((step === "download-chapters" || step === "download-images") && job.total > 0) {
    return `${STEP_LABELS[step]} (${job.done}/${job.total})`;
  }
  return STEP_LABELS[step];
}

function buildSteps(current: JobStepId, errored: boolean): JobStep[] {
  const idx = current === "queued" ? -1 : STEP_ORDER.indexOf(current);
  return STEP_ORDER.map((id, i) => {
    let status: StepState = "pending";
    if (current === "finished" || i < idx) status = "done";
    else if (i === idx) status = errored ? "error" : "current";
    else if (errored && idx === -1 && i === 0) status = "error";
    return { id, label: STEP_LABELS[id], status };
  });
}

function toProgress(job: JobView, errored = false, error: string | null = null): JobProgress {
  const step = stepOf(job);
  return {
    status: errored ? "error" : job.status === "done" ? "success" : "running",
    percent: percentOf(job),
    currentStepId: step,
    currentStepLabel: labelOf(job),
    steps: buildSteps(step, errored),
    error,
    fileName: job.fileName ?? null,
  };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface UseEpubDownloadResult {
  progress: JobProgress | null;
  start: (url: string, novel?: NovelInfo, passwords?: string[]) => Promise<void>;
  retry: () => Promise<void>;
  fileUrl: string | null;
  report: DownloadReport | null;
}

export function useEpubDownload(): UseEpubDownloadResult {
  const [progress, setProgress] = useState<JobProgress | null>(null);
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [report, setReport] = useState<DownloadReport | null>(null);

  const lastArgsRef = useRef<{ url: string; novel?: NovelInfo; passwords?: string[] } | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  /** Mỗi lần start tăng 1; vòng poll cũ thấy khác thì tự dừng. */
  const runIdRef = useRef(0);

  const revokeFile = useCallback(() => {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
  }, []);

  const start = useCallback(
    async (url: string, novel?: NovelInfo, passwords: string[] = []) => {
      const runId = ++runIdRef.current;
      const alive = () => runIdRef.current === runId;
      lastArgsRef.current = { url, novel, passwords };
      revokeFile();
      setFileUrl(null);
      setReport(null);

      let job: JobView = {
        id: "",
        status: "queued",
        phase: "info",
        done: 0,
        total: 0,
        queuePosition: 0,
      };
      setProgress(toProgress(job));

      try {
        job = await createEpubJob(url, passwords);
        let pollErrors = 0;

        while (alive() && job.status !== "done" && job.status !== "error") {
          setProgress(toProgress(job));
          await sleep(POLL_MS);
          try {
            job = await getEpubJob(job.id);
            pollErrors = 0;
          } catch (err) {
            // lỗi mạng thoáng qua → thử lại vài lần; 404 (job mất) → báo lỗi ngay
            const status = (err as { response?: { status?: number } }).response?.status;
            if (status === 404 || ++pollErrors >= MAX_POLL_ERRORS) throw err;
          }
        }
        if (!alive()) return;

        if (job.status === "error") {
          setProgress(toProgress(job, true, job.error ?? "Something went wrong while generating the EPUB."));
          return;
        }

        const { blob, fileName, report: rep } = await downloadJobFile(job, novel);
        if (!alive()) return;

        const objectUrl = URL.createObjectURL(blob);
        objectUrlRef.current = objectUrl;
        setFileUrl(objectUrl);
        setReport(rep);
        setProgress({ ...toProgress(job), fileName });
      } catch (err) {
        if (!alive()) return;
        const message = await extractApiErrorMessage(err, "Something went wrong while generating the EPUB.");
        setProgress(toProgress(job, true, message));
      }
    },
    [revokeFile]
  );

  const retry = useCallback(async () => {
    if (!lastArgsRef.current) return;
    const { url, novel, passwords } = lastArgsRef.current;
    await start(url, novel, passwords);
  }, [start]);

  useEffect(() => {
    return () => {
      runIdRef.current++; // dừng vòng poll khi unmount
      revokeFile();
    };
  }, [revokeFile]);

  return { progress, start, retry, fileUrl, report };
}
