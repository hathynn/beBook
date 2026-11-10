import { randomUUID } from "crypto";

import { AppError } from "../utils/errors";
import { describeHttpError } from "../utils/http";
import { DownloadPhase, DownloadReport, downloadNovel } from "./download.service";

/**
 * Hàng đợi tạo EPUB chạy nền (lưu trong bộ nhớ).
 * Client tạo job → hỏi tiến độ định kỳ → tải file khi xong. Nhờ vậy request không
 * bị proxy/hosting cắt khi truyện dài, và thanh tiến trình hiện số chương thật.
 *
 * Lưu ý: dữ liệu mất khi server khởi động lại; chỉ chạy đúng với 1 instance.
 */

export type JobStatus = "queued" | "running" | "done" | "error";

interface Job {
  id: string;
  url: string;
  passwords: string[];
  owner: string;
  status: JobStatus;
  phase: DownloadPhase;
  done: number;
  total: number;
  title?: string;
  error?: string;
  report?: DownloadReport;
  fileName?: string;
  buffer?: Buffer;
  createdAt: number;
  finishedAt?: number;
}

const MAX_RUNNING = Number(process.env.MAX_CONCURRENT_JOBS) || 2;
const MAX_QUEUED = 20;
const MAX_JOBS_PER_OWNER = 2;
const JOB_TTL_MS = 30 * 60_000;

const jobs = new Map<string, Job>();
const queue: string[] = [];
let running = 0;

function publicView(job: Job) {
  return {
    id: job.id,
    status: job.status,
    phase: job.phase,
    done: job.done,
    total: job.total,
    title: job.title,
    error: job.error,
    report: job.report,
    fileName: job.fileName,
    queuePosition: job.status === "queued" ? queue.indexOf(job.id) + 1 : 0,
  };
}

export type JobView = ReturnType<typeof publicView>;

function pump() {
  while (running < MAX_RUNNING && queue.length) {
    const job = jobs.get(queue.shift()!);
    if (!job) continue;
    running++;
    void run(job).finally(() => {
      running--;
      pump();
    });
  }
}

async function run(job: Job) {
  job.status = "running";
  try {
    const result = await downloadNovel(job.url, job.passwords, (p) => {
      job.phase = p.phase;
      job.done = p.done;
      job.total = p.total;
      if (p.title) job.title = p.title;
    });
    job.buffer = result.buffer;
    job.fileName = result.fileName;
    job.report = result.report;
    job.status = "done";
  } catch (err) {
    job.status = "error";
    job.error = err instanceof AppError ? err.message : `Failed to generate EPUB (${describeHttpError(err)}).`;
    if (!(err instanceof AppError)) console.error("[job]", job.id, err);
  } finally {
    job.finishedAt = Date.now();
    job.passwords = [];
  }
}

export function createJob(url: string, passwords: string[], owner: string): JobView {
  const active = [...jobs.values()].filter(
    (j) => j.owner === owner && (j.status === "queued" || j.status === "running")
  );
  if (active.length >= MAX_JOBS_PER_OWNER) {
    throw new AppError(429, "You already have EPUBs being generated. Please wait for them to finish.");
  }
  if (queue.length >= MAX_QUEUED) {
    throw new AppError(503, "The server is busy right now. Please try again in a few minutes.");
  }

  const job: Job = {
    id: randomUUID(),
    url,
    passwords,
    owner,
    status: "queued",
    phase: "info",
    done: 0,
    total: 0,
    createdAt: Date.now(),
  };
  jobs.set(job.id, job);
  queue.push(job.id);
  pump();
  return publicView(job);
}

// Job id là UUID ngẫu nhiên (không đoán được) nên dùng làm "chìa khoá" truy cập;
// không ràng buộc theo IP vì IP người dùng có thể đổi giữa các lần hỏi tiến độ (mạng di động).
function getJobById(id: string): Job {
  const job = jobs.get(id);
  if (!job) {
    throw new AppError(404, "This job no longer exists (it may have expired or the server restarted). Please try again.");
  }
  return job;
}

export function getJob(id: string): JobView {
  return publicView(getJobById(id));
}

export function getJobFile(id: string) {
  const job = getJobById(id);
  if (job.status !== "done" || !job.buffer) throw new AppError(409, "The EPUB is not ready yet.");
  return { buffer: job.buffer, fileName: job.fileName!, report: job.report! };
}

// Dọn job cũ để giải phóng bộ nhớ (file EPUB giữ 30 phút sau khi xong)
setInterval(() => {
  const now = Date.now();
  for (const [id, job] of jobs) {
    if (job.finishedAt && now - job.finishedAt > JOB_TTL_MS) jobs.delete(id);
  }
}, 60_000).unref();
