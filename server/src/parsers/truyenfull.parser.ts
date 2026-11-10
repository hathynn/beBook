import * as cheerio from "cheerio";
import type { CheerioAPI } from "cheerio";

import { Chapter } from "../types/chapter";
import { ChapterContent } from "../types/chapterContent";
import { NovelIndex } from "../types/novel";
import { mapLimit } from "../utils/concurrency";
import { cleanHtml, removeHiddenElements } from "../utils/htmlCleaner";
import { describeHttpError, fetchHtml } from "../utils/http";
import { blockText, cleanTitle, extractSummary } from "../utils/parseMetadata";
import { FetchSession, NovelSource } from "./source";

const PAGE_CONCURRENCY = 4;
const MAX_LIST_PAGES = 500;

const text = (s: string | undefined) => (s ?? "").replace(/\s+/g, " ").trim();

/** "Chương 1: Chương 1" → "Chương 1", "Chương 67: Chương 67: Hoàn" → "Chương 67: Hoàn" */
const tidyTitle = (t: string) =>
  t
    .replace(/^(chương\s*\d+)\s*[:.-]\s*\1(?!\d)\s*/i, "$1: ")
    .replace(/[\s:.-]+$/, "")
    .trim();

/**
 * TruyenFull đổi tên miền liên tục (truyenfull.vn, .live, .vision, .io, ...)
 * nhưng cấu trúc trang giữ nguyên, nên nhận diện theo chữ "truyenfull" trong hostname.
 *
 * Trang có bẫy chống cào dữ liệu: các mục thông tin giả bị ẩn bằng CSS
 * (vd. "Tác giả: Khuyết danh") và watermark `display:none` trong nội dung,
 * nên ở đây luôn đọc theo `itemprop` và xoá phần tử ẩn trước khi lấy dữ liệu.
 */
export class TruyenFullParser implements NovelSource {
  readonly name = "truyenfull";
  readonly concurrency = 4;

  canHandle(url: URL): boolean {
    return /truyenfull/i.test(url.hostname);
  }

  /** Link chương / link trang-N → link trang truyện. */
  normalizeUrl(url: URL): string {
    const slug = url.pathname.split("/").filter(Boolean)[0];
    return slug ? `${url.origin}/${slug}/` : url.href;
  }

  // ===========================
  // Trang truyện: thông tin + danh sách chương (có phân trang)
  // ===========================
  async getIndex(url: string): Promise<NovelIndex> {
    const rootUrl = this.normalizeUrl(new URL(url));
    const page = await fetchHtml(rootUrl);
    const $ = cheerio.load(page.html);
    removeHiddenElements($);

    const book = $("[itemtype*='schema.org/Book']").first();
    const scope = book.length ? book : $("#truyen");

    const title =
      text(scope.find("h3.title, [itemprop='name']").first().text()) ||
      text($('meta[property="og:title"]').attr("content")) ||
      text($("h1").first().text());

    const author = scope
      .find("[itemprop='author']")
      .map((_, el) => text($(el).text()))
      .get()
      .filter(Boolean)
      .join(", ");

    const genres = [
      ...new Set(
        scope
          .find("[itemprop='genre']")
          .map((_, el) => text($(el).text()))
          .get()
          .filter(Boolean)
      ),
    ];

    const infoText = text(scope.find(".info, .info-holder").first().text());
    const status = /\bfull\b|hoàn/i.test(infoText)
      ? "Hoàn"
      : /đang ra|đang cập nhật/i.test(infoText)
      ? "Đang tiến hành"
      : undefined;

    const cover =
      scope.find("[itemprop='image']").attr("src") ||
      $('meta[property="og:image"]').attr("content");

    const desc = scope.find("[itemprop='description'], .desc-text").first();
    desc.find("a[aria-hidden='true']").remove();
    const descLines = blockText($, desc);
    const summary = extractSummary(descLines) || descLines.join("\n");

    const chapters = await this.collectChapters($, rootUrl);

    return {
      info: {
        title: cleanTitle(title),
        author: author || undefined,
        genres,
        source: text(scope.find(".source").first().text()) || undefined,
        status,
        coverUrl: cover ? new URL(cover, rootUrl).href : null,
        summary,
        chapterCount: chapters.length,
        url: rootUrl,
      },
      chapters,
      passwordHints: [],
    };
  }

  private parseChapterList($: CheerioAPI, base: string): Chapter[] {
    return $("#list-chapter ul.list-chapter li a[href], #list-chapter .list-chapter a[href]")
      .map((_, el) => {
        const $a = $(el);
        const href = new URL($a.attr("href")!, base).href;
        return { title: tidyTitle(text($a.text()) || text($a.attr("title"))), url: href };
      })
      .get();
  }

  private totalPages($: CheerioAPI): number {
    const fromInput = Number($("#total-page").attr("value"));
    if (Number.isFinite(fromInput) && fromInput > 0) return Math.min(fromInput, MAX_LIST_PAGES);

    let max = 1;
    $(".pagination a[href]").each((_, el) => {
      const n = Number(/\/trang-(\d+)\//.exec($(el).attr("href") ?? "")?.[1]);
      if (n > max) max = n;
    });
    return Math.min(max, MAX_LIST_PAGES);
  }

  private async collectChapters($: CheerioAPI, rootUrl: string): Promise<Chapter[]> {
    const first = this.parseChapterList($, rootUrl);
    const total = this.totalPages($);

    const pageNumbers = Array.from({ length: Math.max(0, total - 1) }, (_, i) => i + 2);
    const rest = await mapLimit(pageNumbers, PAGE_CONCURRENCY, async (n) => {
      const res = await fetchHtml(`${rootUrl}trang-${n}/`);
      return this.parseChapterList(cheerio.load(res.html), rootUrl);
    });

    const seen = new Set<string>();
    return [first, ...rest].flat().filter((c) => {
      const key = c.url.replace(/\/+$/, "");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  // ===========================
  // Nội dung chương
  // ===========================
  async getChapter(chapter: Chapter | string, _session?: FetchSession): Promise<ChapterContent> {
    const { url, title: listTitle } =
      typeof chapter === "string" ? { url: chapter, title: "" } : chapter;

    try {
      const page = await fetchHtml(url);
      const $ = cheerio.load(page.html);
      removeHiddenElements($);

      const title =
        text($("a.chapter-title").first().text()) ||
        text($(".chapter-title").first().attr("title")).split(" - ").pop() ||
        listTitle ||
        "Untitled";

      const content = $("#chapter-c, .chapter-c, [itemprop='articleBody']").first();
      if (!content.length) {
        throw new Error("chapter content not found (layout changed or blocked)");
      }
      content.find("[id^='ads'], [class*='ads'], .chapter-nav").remove();

      // Đoạn đầu thường lặp lại tên chương ("Chương 1") → bỏ cho gọn
      const firstP = content.children("p").first();
      const firstText = text(firstP.text()).toLowerCase();
      if (firstText && (title.toLowerCase().startsWith(firstText) || /^chương\s*\d+$/i.test(firstText))) {
        firstP.remove();
      }

      const cleaned = cleanHtml(content.html() ?? "", page.url);
      if (!cleaned.textLength && !cleaned.images.length) {
        throw new Error("empty chapter");
      }
      // Ưu tiên tên đầy đủ trong danh sách ("Chương 67: Hoàn") nếu trang chương chỉ có "Chương 67"
      const best = listTitle && listTitle.length > title.length && listTitle.toLowerCase().startsWith(title.toLowerCase())
        ? listTitle
        : tidyTitle(title);
      return { title: cleanTitle(best), url, ...cleaned, status: "ok" };
    } catch (err) {
      return {
        title: listTitle || url,
        url,
        html: "",
        images: [],
        textLength: 0,
        status: "error",
        error: describeHttpError(err),
      };
    }
  }
}
