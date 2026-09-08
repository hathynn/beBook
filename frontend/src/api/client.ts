import axios from "axios";
import type { NovelInfo } from "../types/novel";

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
}

function fallbackFileName(novel?: NovelInfo): string {
  const base = (novel?.title || "novel").trim().replace(/[\\/:*?"<>|]+/g, "_");
  return `${base || "novel"}.epub`;
}

/**
 * Pulls the filename out of a Content-Disposition header, e.g.
 * `attachment; filename="Some Title.epub"` or the RFC 5987
 * `filename*=UTF-8''Some%20Title.epub` form. Falls back to a name derived
 * from the novel title if the header is missing or unparsable.
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

/**
 * Calls the backend, which crawls every chapter, builds the EPUB, and
 * returns the finished file directly in the response body — there is no
 * job id / progress endpoint on the backend. The frontend simulates the
 * progress panel locally while this request is in flight (see
 * useDownloadEpub) and resolves it the moment this promise settles.
 */
export async function downloadEpub(
  url: string,
  novel?: NovelInfo
): Promise<DownloadEpubResult> {
  const response = await api.post("/novel/download", { url, novel }, {
    responseType: "blob",
    timeout: 0, // EPUB generation can take a while; don't time this one out
  });

  const fileName = parseFileName(
    response.headers["content-disposition"],
    fallbackFileName(novel)
  );

  return { blob: response.data as Blob, fileName };
}

/**
 * Axios resolves error bodies as a Blob too (since responseType is "blob"),
 * so a JSON `{ message: "..." }` error from the backend has to be read back
 * out of the blob manually.
 */
export async function extractDownloadErrorMessage(
  err: unknown,
  fallback: string
): Promise<string> {
  if (axios.isAxiosError(err) && err.response?.data instanceof Blob) {
    try {
      const text = await err.response.data.text();
      const parsed = JSON.parse(text) as { message?: string };
      if (typeof parsed.message === "string" && parsed.message.trim()) {
        return parsed.message;
      }
    } catch {
      // Body wasn't JSON — fall through to the generic message below.
    }
  }
  if (axios.isAxiosError(err) && err.message) return err.message;
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}
