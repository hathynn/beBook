import * as cheerio from "cheerio";
import type { AnyNode } from "domhandler";

import { EpubBuilder, EpubImage } from "../builders/epub.builder";
import { createSession, getSource } from "../parsers";
import { ChapterContent } from "../types/chapterContent";
import { mapLimit } from "../utils/concurrency";
import { AppError } from "../utils/errors";
import { fetchBinary } from "../utils/http";
import { escapeXml, serializeXhtml } from "../utils/xml";
import { getNovelIndex } from "./novel.service";

const IMAGE_CONCURRENCY = 6;

export interface DownloadReport {
  chapters: number;
  locked: string[];
  failed: string[];
  images: { embedded: number; failed: number };
}

export interface DownloadResult {
  buffer: Buffer;
  fileName: string;
  report: DownloadReport;
}

// ===========================
// Nhận diện định dạng ảnh qua magic bytes (content-type của CDN không đáng tin)
// ===========================
function sniffImage(data: Buffer, contentType: string): { ext: string; mediaType: string } | null {
  if (data.length < 12) return null;
  if (data[0] === 0xff && data[1] === 0xd8) return { ext: "jpg", mediaType: "image/jpeg" };
  if (data.subarray(0, 4).toString("hex") === "89504e47") return { ext: "png", mediaType: "image/png" };
  if (data.subarray(0, 3).toString("ascii") === "GIF") return { ext: "gif", mediaType: "image/gif" };
  if (data.subarray(0, 4).toString("ascii") === "RIFF" && data.subarray(8, 12).toString("ascii") === "WEBP")
    return { ext: "webp", mediaType: "image/webp" };
  const head = data.subarray(0, 512).toString("utf8").trimStart();
  if (contentType.includes("svg") || head.startsWith("<svg") || (head.startsWith("<?xml") && head.includes("<svg")))
    return { ext: "svg", mediaType: "image/svg+xml" };
  return null;
}

// sharp là tuỳ chọn: nếu không cài được (native module) thì giữ nguyên ảnh WebP/AVIF
type SharpFn = (input: Buffer) => {
  metadata(): Promise<{ hasAlpha?: boolean }>;
  jpeg(o: { quality: number; mozjpeg?: boolean }): { toBuffer(): Promise<Buffer> };
  png(): { toBuffer(): Promise<Buffer> };
};
let sharpFn: SharpFn | null | undefined;
function loadSharp(): SharpFn | null {
  if (sharpFn === undefined) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      sharpFn = require("sharp") as SharpFn;
    } catch {
      console.warn("[download] sharp not available – WebP images will be embedded as-is");
      sharpFn = null;
    }
  }
  return sharpFn;
}

/**
 * WebP/AVIF chưa được nhiều máy đọc EPUB hỗ trợ (Kindle, Kobo đời cũ...) → đổi sang JPEG
 * (hoặc PNG nếu ảnh có nền trong suốt).
 */
async function toCompatibleImage(data: Buffer, kind: { ext: string; mediaType: string }) {
  const isAvif = data.subarray(4, 12).toString("ascii").startsWith("ftypavi");
  if (kind.ext !== "webp" && !isAvif) return { data, ...kind };
  const sharp = loadSharp();
  if (!sharp) return { data, ...kind };
  try {
    const { hasAlpha } = await sharp(data).metadata();
    return hasAlpha
      ? { data: await sharp(data).png().toBuffer(), ext: "png", mediaType: "image/png" }
      : { data: await sharp(data).jpeg({ quality: 88, mozjpeg: true }).toBuffer(), ext: "jpg", mediaType: "image/jpeg" };
  } catch {
    return { data, ...kind };
  }
}

export type DownloadPhase = "info" | "chapters" | "images" | "build";

export interface ProgressUpdate {
  phase: DownloadPhase;
  done: number;
  total: number;
  title?: string;
}

export type ProgressFn = (update: ProgressUpdate) => void;

async function downloadImages(urls: string[], referer: string, onDone?: (done: number) => void) {
  const result = new Map<string, EpubImage>();
  let failed = 0;

  await mapLimit(urls, IMAGE_CONCURRENCY, async (url) => {
    try {
      const { data, contentType } = await fetchBinary(url, referer);
      const sniffed = data.subarray(4, 12).toString("ascii").startsWith("ftypavi")
        ? { ext: "avif", mediaType: "image/avif" }
        : sniffImage(data, contentType);
      if (!sniffed) throw new Error("not an image");
      const kind = await toCompatibleImage(data, sniffed);
      const n = String(result.size + 1).padStart(4, "0");
      result.set(url, {
        id: `img-${n}`,
        href: `images/img-${n}.${kind.ext}`,
        mediaType: kind.mediaType,
        data: kind.data,
      });
    } catch {
      failed++;
    } finally {
      onDone?.(result.size + failed);
    }
  });

  return { map: result, failed };
}

/** Ảnh xuất hiện ở phần lớn các chương (khung, banner, chữ ký) là ảnh trang trí → bỏ. */
function findDecorativeImages(chapters: ChapterContent[]): Set<string> {
  const ok = chapters.filter((c) => c.status === "ok");
  if (ok.length < 4) return new Set();
  const counts = new Map<string, number>();
  for (const ch of ok) for (const src of ch.images) counts.set(src, (counts.get(src) ?? 0) + 1);
  const threshold = Math.max(3, Math.ceil(ok.length * 0.5));
  return new Set([...counts].filter(([, n]) => n >= threshold).map(([src]) => src));
}

/** Đổi src ảnh sang file nhúng trong EPUB; ảnh không tải được thì bỏ. */
function rewriteImages(html: string, images: Map<string, EpubImage>, drop: Set<string>): string {
  if (!html.includes("<img")) return html;
  const $ = cheerio.load(html, { xml: true }, false);
  $("img").each((_, el) => {
    const src = $(el).attr("src") ?? "";
    const img = images.get(src);
    if (drop.has(src) || !img) {
      $(el).remove();
    } else {
      $(el).attr("src", img.href);
    }
  });
  return serializeXhtml($.root().contents().toArray() as AnyNode[]);
}

function notice(text: string) {
  return `<p class="notice">${escapeXml(text)}</p>`;
}

function safeFileName(title: string) {
  const base = title.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 150);
  return `${base || "novel"}.epub`;
}

export async function downloadNovel(
  url: string,
  passwords: string[] = [],
  onProgress: ProgressFn = () => {}
): Promise<DownloadResult> {
  onProgress({ phase: "info", done: 0, total: 1 });
  // 1. Thông tin + danh sách chương (dùng cache nếu vừa Analyze)
  const index = await getNovelIndex(url, createSession(passwords));
  if (!index.chapters.length) {
    throw new AppError(422, "No chapter links were found on this page.");
  }

  // Mật khẩu người dùng nhập được thử trước, sau đó tới mật khẩu gợi ý trên trang
  const session = createSession([...passwords, ...index.passwordHints]);

  // 2. Tải chương song song (có giới hạn); chương lỗi không làm hỏng cả cuốn
  console.log(`[download] [${getSource(url).name}] ${index.info.title}: ${index.chapters.length} chapters`);
  const source = getSource(url);
  const totalChapters = index.chapters.length;
  let chaptersDone = 0;
  onProgress({ phase: "chapters", done: 0, total: totalChapters, title: index.info.title });
  const chapters = await mapLimit(index.chapters, source.concurrency, async (ch) => {
    let result = await source.getChapter(ch, session);
    // Chương bị khoá trước khi tìm ra mật khẩu đúng → thử lại với cookie đã mở khoá
    if (result.status === "locked" && session.unlockedCookies.size) {
      result = await source.getChapter(ch, session);
    }
    chaptersDone++;
    onProgress({ phase: "chapters", done: chaptersDone, total: totalChapters, title: index.info.title });
    return result;
  });

  // 3. Ảnh: bỏ ảnh trang trí, tải + nhúng phần còn lại
  const decorative = findDecorativeImages(chapters);
  const imageUrls = [
    ...new Set(chapters.flatMap((c) => c.images).filter((src) => !decorative.has(src))),
  ];
  const coverUrl = index.info.coverUrl ?? undefined;
  const toDownload = coverUrl && !imageUrls.includes(coverUrl) ? [coverUrl, ...imageUrls] : imageUrls;
  onProgress({ phase: "images", done: 0, total: toDownload.length, title: index.info.title });
  const { map: images, failed: failedImages } = await downloadImages(toDownload, index.info.url ?? url, (done) =>
    onProgress({ phase: "images", done, total: toDownload.length, title: index.info.title })
  );

  // 4. Ghép nội dung
  const report: DownloadReport = {
    chapters: chapters.length,
    locked: [],
    failed: [],
    images: { embedded: 0, failed: failedImages },
  };

  const epubChapters = chapters.map((ch) => {
    if (ch.status === "locked") {
      report.locked.push(ch.title);
      return {
        title: ch.title,
        html: notice(
          "🔒 This chapter is password-protected and could not be unlocked. Enter the password and download again."
        ),
      };
    }
    if (ch.status === "error") {
      report.failed.push(ch.title);
      return { title: ch.title, html: notice(`⚠ Failed to download this chapter (${ch.error ?? "error"}).`) };
    }
    const html = rewriteImages(ch.html, images, decorative);
    return { title: ch.title, html: html || notice("(This chapter has no content.)") };
  });

  const cover = coverUrl ? images.get(coverUrl) : undefined;
  const coverIsChapterImage = cover && imageUrls.includes(coverUrl!);
  const usedImages = [...images.values()].filter((img) => img !== cover || coverIsChapterImage);
  report.images.embedded = usedImages.length;

  // 5. Build EPUB (trong bộ nhớ, không ghi file rác ra đĩa)
  onProgress({ phase: "build", done: 0, total: 1, title: index.info.title });
  const buffer = await new EpubBuilder().build({
    info: index.info,
    chapters: epubChapters,
    images: usedImages,
    cover: cover
      ? coverIsChapterImage
        ? { ...cover, id: "cover-image", href: cover.href.replace("images/", "images/cover-") }
        : { ...cover, id: "cover-image" }
      : null,
  });

  console.log(
    `[download] done: ${chapters.length} chapters, ${report.locked.length} locked, ${report.failed.length} failed, ${report.images.embedded} images`
  );

  return { buffer, fileName: safeFileName(index.info.title), report };
}
