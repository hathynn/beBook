import { createSession, FetchSession, getSource } from "../parsers";
import { NovelIndex } from "../types/novel";
import { AppError } from "../utils/errors";
import { describeHttpError, isPrivateAddressError } from "../utils/http";

// Cache ngắn hạn để bước "Analyze" và "Download" không phải tải lại trang mục lục
const INDEX_TTL_MS = 5 * 60_000;
const indexCache = new Map<string, { at: number; value: NovelIndex }>();

export function validateUrl(raw: unknown, toNovelPage = true): string {
  if (typeof raw !== "string" || !raw.trim()) {
    throw new AppError(400, "Please provide a novel URL.");
  }
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    throw new AppError(400, "That doesn't look like a valid URL.");
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    throw new AppError(400, "Only http(s) URLs are supported.");
  }
  // Mỗi nguồn có thể đưa link chương / link trang-N về link trang truyện
  const source = getSource(u.href);
  return toNovelPage && source.normalizeUrl ? source.normalizeUrl(u) : u.href;
}

export function normalizePasswords(raw: unknown): string[] {
  const list = Array.isArray(raw) ? raw : typeof raw === "string" ? raw.split(/\r?\n|,/) : [];
  return [...new Set(list.map((p) => String(p).trim()).filter(Boolean))].slice(0, 50);
}

export async function getNovelIndex(url: string, session: FetchSession = createSession()) {
  const key = `${url}\u0000${session.passwords.join("\u0000")}`;
  const hit = indexCache.get(key);
  if (hit && Date.now() - hit.at < INDEX_TTL_MS) return hit.value;

  let value: NovelIndex;
  try {
    value = await getSource(url).getIndex(url, session);
  } catch (err) {
    if (isPrivateAddressError(err)) {
      throw new AppError(400, "Internal/private addresses (localhost, 192.168.x.x, ...) are not allowed.");
    }
    const reason = describeHttpError(err);
    const hint = /HTTP 40[13]|HTTP 429|HTTP 503/.test(reason)
      ? " The site may be blocking automated requests – try again later."
      : "";
    throw new AppError(502, `Couldn't load the novel page (${reason}).${hint}`);
  }

  indexCache.set(key, { at: Date.now(), value });
  if (indexCache.size > 100) indexCache.delete(indexCache.keys().next().value!);
  return value;
}

export async function getNovelInfo(url: string, passwords: string[] = []) {
  const index = await getNovelIndex(url, createSession(passwords));
  return {
    ...index.info,
    summary: index.info.summary ?? "",
    chapterCount: index.chapters.length || index.info.chapterCount || 0,
    hasPasswordHints: index.passwordHints.length > 0,
    sourceType: getSource(url).name,
  };
}

export async function getNovelChapters(url: string) {
  return (await getNovelIndex(url)).chapters;
}

export async function getChapter(url: string, passwords: string[] = []) {
  return getSource(url).getChapter(url, createSession(passwords));
}
