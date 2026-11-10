export interface NovelInfo {
  title: string;
  author: string;
  source: string;
  status: string;
  coverUrl: string | null;
  summary: string;
  chapterCount: number;
  genres?: string[];
  /** Trang mục lục có ghi mật khẩu (backend sẽ tự thử). */
  hasPasswordHints?: boolean;
  /** Nguồn backend nhận diện: "wordpress" | "truyenfull" */
  sourceType?: string;
}

/** Kết quả tải do backend trả về qua header X-Bebook-Report. */
export interface DownloadReport {
  chapters: number;
  locked: string[];
  failed: string[];
  images: { embedded: number; failed: number };
}

export interface NovelInfoRequest {
  url: string;
}

export type JobStatus = "idle" | "running" | "success" | "error";

export type JobStepId =
  | "queued"
  | "novel-info"
  | "download-chapters"
  | "download-images"
  | "build-epub"
  | "finished";

export type StepState = "pending" | "current" | "done" | "error";

export interface JobStep {
  id: JobStepId;
  label: string;
  status: StepState;
}

/**
 * Tiến độ thật từ backend: client tạo job (POST /api/novel/jobs) rồi hỏi
 * GET /api/novel/jobs/:id mỗi giây, cuối cùng tải file ở /jobs/:id/file.
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

/** Trạng thái job do backend trả về. */
export interface JobView {
  id: string;
  status: "queued" | "running" | "done" | "error";
  phase: "info" | "chapters" | "images" | "build";
  done: number;
  total: number;
  title?: string;
  error?: string;
  report?: DownloadReport;
  fileName?: string;
  queuePosition: number;
}
