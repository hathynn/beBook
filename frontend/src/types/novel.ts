export interface NovelInfo {
  title: string;
  author: string;
  source: string;
  status: string;
  coverUrl: string | null;
  summary: string;
  chapterCount: number;
}

export interface NovelInfoRequest {
  url: string;
}

export type JobStatus = "idle" | "running" | "success" | "error";

export type JobStepId =
  | "novel-info"
  | "chapter-list"
  | "download-chapters"
  | "clean-html"
  | "build-epub"
  | "package-epub"
  | "finished";

export type StepState = "pending" | "current" | "done" | "error";

export interface JobStep {
  id: JobStepId;
  label: string;
  status: StepState;
}

/**
 * Progress is simulated entirely on the frontend — the backend has no
 * job-id / progress endpoint and just returns the finished EPUB file once
 * POST /api/novel/download resolves. `percent` and `steps` are a client-side
 * approximation that fills up while the request is in flight and snaps to
 * 100% / all-done the moment the response (or an error) comes back.
 */
export interface JobProgress {
  status: JobStatus;
  percent: number;
  currentStepId: JobStepId;
  currentStepLabel: string;
  steps: JobStep[];
  error: string | null;
  fileName: string | null;
}
