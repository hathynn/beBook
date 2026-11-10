import axios from "axios";
import type { DownloadReport, JobView, NovelInfo } from "../types/novel";

export const api = axios.create({
  baseURL: "/api",
  timeout: 30_000,
});

export async function fetchNovelInfo(url: string): Promise<NovelInfo> {
  const { data } = await api.post<NovelInfo>("/novel/info", { url });
  return data;
}

export interface DownloadEpubResult {
  blob: Blob;
  fileName: string;
  report: DownloadReport | null;
}

function fallbackFileName(novel?: NovelInfo): string {
  const base = (novel?.title || "novel").trim().replace(/[\\/:*?"<>|]+/g, "_");
  return `${base || "novel"}.epub`;
}

/**
 * Pulls the filename out of a Content-Disposition header, e.g.
 * `attachment; filename="Some Title.epub"` or the RFC 5987
 * `filename*=UTF-8''Some%20Title.epub` form.
 */
function parseFileName(header: string | undefined, fallback: string): string {
  if (!header) return fallback;
  const starMatch = /filename\*=(?:UTF-8'')?([^;]+)/i.exec(header);
  if (starMatch?.[1]) {
    try {
      return decodeURIComponent(starMatch[1].replace(/"/g, ""));
    } catch {
      return starMatch[1];
    }
  }
  const plainMatch = /filename="?([^";]+)"?/i.exec(header);
  return plainMatch?.[1] ?? fallback;
}

function parseReport(header: string | undefined): DownloadReport | null {
  if (!header) return null;
  try {
    return JSON.parse(decodeURIComponent(header)) as DownloadReport;
  } catch {
    return null;
  }
}

// ===========================
// Job chạy nền
// ===========================
export async function createEpubJob(url: string, passwords: string[] = []): Promise<JobView> {
  const { data } = await api.post<JobView>("/novel/jobs", { url, passwords });
  return data;
}

export async function getEpubJob(id: string): Promise<JobView> {
  const { data } = await api.get<JobView>(`/novel/jobs/${encodeURIComponent(id)}`);
  return data;
}

export async function downloadJobFile(job: JobView, novel?: NovelInfo): Promise<DownloadEpubResult> {
  const response = await api.get(`/novel/jobs/${encodeURIComponent(job.id)}/file`, {
    responseType: "blob",
    timeout: 0,
  });
  return {
    blob: response.data as Blob,
    fileName:
      job.fileName ?? parseFileName(response.headers["content-disposition"], fallbackFileName(novel)),
    report: job.report ?? parseReport(response.headers["x-bebook-report"]),
  };
}

/**
 * Axios resolves error bodies as a Blob when responseType is "blob",
 * so a JSON `{ message: "..." }` error has to be read back out manually.
 */
export async function extractApiErrorMessage(err: unknown, fallback: string): Promise<string> {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data;
    if (data instanceof Blob) {
      try {
        const parsed = JSON.parse(await data.text()) as { message?: string };
        if (parsed.message?.trim()) return parsed.message;
      } catch {
        // not JSON
      }
    } else if (typeof data?.message === "string" && data.message.trim()) {
      return data.message;
    }
    if (err.response?.status === 401) return "Authentication required.";
    if (err.message) return err.message;
  }
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}
