import * as cheerio from "cheerio";
import type { Cheerio, CheerioAPI } from "cheerio";
import type { AnyNode } from "domhandler";

import { Chapter } from "../types/chapter";
import { ChapterContent } from "../types/chapterContent";
import { NovelIndex } from "../types/novel";
import { createSession, FetchSession, NovelSource } from "./source";
import { cleanHtml, declaredWidth } from "../utils/htmlCleaner";
import {
  CookieJar,
  describeHttpError,
  fetchHtml,
  readSetCookies,
  requestWithRetry,
  cookieHeader,
} from "../utils/http";
import {
  blockText,
  cleanTitle,
  extractChapterCount,
  extractField,
  extractGenres,
  extractPasswordHints,
  extractStatus,
  extractSummary,
} from "../utils/parseMetadata";

const CONTENT_SELECTORS = [
  ".entry-content",
  ".post-content",
  ".single-content",
  ".td-post-content",
  ".post-entry",
  ".article-content",
  ".wp-block-post-content",
  "article .content",
  "article",
  "main",
];

const CHAPTER_TITLE =
  /^(?:(?:chương|chuong|chap(?:ter)?|ch\.?|hồi|tiết|phần|quyển|q|c)\s*\.?\s*\d+|\d+\s*(?:[-–.:)]|$)|ngoại\s*truyện|phiên\s*ngoại|pn\s*\d|extra|side\s*story|văn\s*án|tiết\s*tử|mở\s*đầu|kết\s*thúc|vĩ\s*thanh|lời\s*mở\s*đầu|prologue|epilogue|hậu\s*ký|đại\s*kết\s*cục)/iu;

const CHAPTER_SLUG =
  /(?:^|[-/])(?:chuong|chapter|chap|ngoai-truyen|phien-ngoai|extra|van-an|tiet-tu|c\d+|hoi-\d+|phan-\d+)(?:[-/]|$|\d)/i;

const NON_CHAPTER_PATH =
  /\/(?:category|tag|author|feed|comments|wp-content|wp-admin|wp-login\.php|wp-json|page\/\d+)(?:\/|$)|\.(?:jpe?g|png|gif|webp|pdf|zip)$/i;

const DATE_ARCHIVE = /^\/\d{4}\/\d{2}(?:\/\d{2})?\/?$/;
const DATE_PERMALINK = /^\/\d{4}\/\d{2}\/(?:\d{2}\/)?[^/]+\/?$/;

function normalizeUrl(href: string, base: string): URL | null {
  try {
    const u = new URL(href, base);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    u.hash = "";
    return u;
  } catch {
    return null;
  }
}

function sameSite(a: URL, b: URL) {
  return a.hostname.replace(/^www\./, "") === b.hostname.replace(/^www\./, "");
}

function urlKey(u: URL) {
  return `${u.hostname.replace(/^www\./, "")}${u.pathname.replace(/\/+$/, "")}${u.search}`;
}

export class WordPressParser implements NovelSource {
  readonly name = "wordpress";
  readonly concurrency = 5;

  /** WordPress là nguồn mặc định – xử lý mọi URL không thuộc nguồn chuyên biệt. */
  canHandle(): boolean {
    return true;
  }

  // ===========================
  // Helpers
  // ===========================
  private findContent($: CheerioAPI): Cheerio<AnyNode> {
    for (const sel of CONTENT_SELECTORS) {
      const el = $(sel).first();
      if (el.length && el.text().trim().length + el.find("img").length > 0) return el;
    }
    return $("body");
  }

  private findTitle($: CheerioAPI): string {
    const candidates = [
      $(".entry-title").first().text(),
      $("h1.post-title, .post-title, h1.title").first().text(),
      $('meta[property="og:title"]').attr("content"),
      $("h1").first().text(),
      $("title").text().split(/\s[–|-]\s/)[0],
    ];
    return candidates.map((t) => (t ?? "").replace(/\s+/g, " ").trim()).find(Boolean) ?? "";
  }

  isLocked($: CheerioAPI): boolean {
    if ($("form.post-password-form, input[name='post_password']").length) return true;
    if ($("form[action*='postpass']").length) return true;
    return this.findContent($).find("form input[type='password']").length > 0;
  }

  /**
   * Mở khoá trang được bảo vệ bằng mật khẩu.
   * Hỗ trợ form mặc định của WordPress (wp-login.php?action=postpass) và
   * phần lớn plugin dùng form có ô input[type=password].
   */
  private async unlock(
    pageUrl: string,
    lockedHtml: string,
    session: FetchSession
  ): Promise<{ html: string; jar: CookieJar } | null> {
    if (!session.passwords.length) return null;

    const $ = cheerio.load(lockedHtml);
    let form = $("form.post-password-form").first();
    if (!form.length) form = $("form[action*='postpass']").first();
    if (!form.length) form = this.findContent($).find("form:has(input[type='password'])").first();
    if (!form.length) return null;

    const action = new URL(form.attr("action") || pageUrl, pageUrl).href;
    const method = (form.attr("method") || "post").toLowerCase();
    const pwInput = form.find("input[type='password']").first();
    const pwName = pwInput.attr("name") || "post_password";

    const baseFields: Record<string, string> = {};
    form.find("input[name], select[name], textarea[name]").each((_, el) => {
      const $el = $(el);
      const type = ($el.attr("type") || "").toLowerCase();
      if (type === "password" || type === "checkbox" || type === "radio") return;
      baseFields[$el.attr("name")!] = $el.attr("value") ?? "";
    });

    for (const password of session.passwords) {
      const jar: CookieJar = new Map(session.unlockedCookies);
      const body = new URLSearchParams({ ...baseFields, [pwName]: password });

      try {
        const res = await requestWithRetry<string>({
          url: method === "get" ? `${action}${action.includes("?") ? "&" : "?"}${body}` : action,
          method: method === "get" ? "GET" : "POST",
          data: method === "get" ? undefined : body.toString(),
          responseType: "text",
          maxRedirects: 0,
          validateStatus: (s) => s < 400,
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            Referer: pageUrl,
            ...(jar.size ? { Cookie: cookieHeader(jar) } : {}),
          },
        });
        readSetCookies(res, jar);

        // Một số plugin trả nội dung ngay trong response (200) thay vì redirect
        if (res.status === 200 && typeof res.data === "string") {
          const $res = cheerio.load(res.data);
          if (!this.isLocked($res) && this.findContent($res).text().trim()) {
            this.rememberCookies(session, jar, password);
            return { html: res.data, jar };
          }
        }

        const page = await fetchHtml(pageUrl, jar);
        if (!this.isLocked(cheerio.load(page.html))) {
          this.rememberCookies(session, jar, password);
          return { html: page.html, jar };
        }
      } catch {
        // thử mật khẩu tiếp theo
      }
    }
    return null;
  }

  private rememberCookies(session: FetchSession, jar: CookieJar, password: string) {
    session.unlockedCookies = new Map(jar);
    // Đưa mật khẩu đúng lên đầu để chương sau thử trước
    session.passwords = [password, ...session.passwords.filter((p) => p !== password)];
  }

  /** Tải trang, tự mở khoá nếu bị đặt mật khẩu. */
  private async loadPage(url: string, session: FetchSession) {
    const jar: CookieJar = new Map(session.unlockedCookies);
    const page = await fetchHtml(url, jar);
    let $ = cheerio.load(page.html);
    let locked = false;

    if (this.isLocked($)) {
      const unlocked = await this.unlock(page.url, page.html, session);
      if (unlocked) {
        $ = cheerio.load(unlocked.html);
        for (const [k, v] of unlocked.jar) jar.set(k, v);
      } else {
        locked = true;
      }
    }
    return { $, url: page.url, jar, locked };
  }

  // ===========================
  // Trang mục lục: thông tin + danh sách chương (1 request)
  // ===========================
  async getIndex(url: string, session: FetchSession = createSession()): Promise<NovelIndex> {
    const { $, url: finalUrl } = await this.loadPage(url, session);
    const content = this.findContent($);
    const lines = blockText($, content);

    const chapters = this.extractChapters($, content, finalUrl);

    const coverCandidate = this.findCover($, content);

    return {
      info: {
        title: cleanTitle(this.findTitle($)),
        author: extractField(lines, ["Tác giả", "Author"]),
        source: extractField(lines, ["Nguồn", "Source"]),
        genres: extractGenres(lines),
        chapterCount: chapters.length || extractChapterCount(lines),
        status: extractStatus(lines),
        coverUrl: coverCandidate ? new URL(coverCandidate, finalUrl).href : null,
        summary:
          extractSummary(lines) ||
          ($('meta[property="og:description"]').attr("content") ?? "").trim(),
        url: finalUrl,
      },
      chapters,
      passwordHints: extractPasswordHints(lines),
    };
  }

  /** Ảnh bìa: ảnh đại diện (og:image) → ảnh lớn đầu tiên trong bài (bỏ gif/sticker/icon). */
  private findCover($: CheerioAPI, content: Cheerio<AnyNode>): string | undefined {
    const bad = /blank\.jpg|site-?icon|gravatar|emoji|smilies|logo|avatar/i;
    const og = $('meta[property="og:image"]').attr("content");
    if (og && !bad.test(og)) return og;

    return content
      .find("img")
      .toArray()
      .filter((img) => declaredWidth($(img).attr("width"), $(img).attr("style")) > 150)
      .map((img) => $(img).attr("data-orig-file") || $(img).attr("data-src") || $(img).attr("src"))
      .find((src) => src && !src.startsWith("data:") && !bad.test(src) && !/\.gif(?:$|\?)/i.test(src));
  }

  private extractChapters($: CheerioAPI, content: Cheerio<AnyNode>, pageUrl: string): Chapter[] {
    const page = new URL(pageUrl);
    const pageKey = urlKey(page);
    const seen = new Set<string>();
    const candidates: (Chapter & { score: number; dated: boolean })[] = [];

    content.find("a[href]").each((_, el) => {
      const $a = $(el);
      const u = normalizeUrl($a.attr("href")!, pageUrl);
      if (!u || !sameSite(u, page)) return;
      if (u.searchParams.has("share") || u.searchParams.has("replytocom")) return;
      if (NON_CHAPTER_PATH.test(u.pathname) || DATE_ARCHIVE.test(u.pathname)) return;

      const key = urlKey(u);
      if (key === pageKey || seen.has(key)) return;
      seen.add(key);

      const text = $a.text().replace(/\s+/g, " ").trim();
      const slug = decodeURIComponent(u.pathname);
      const title = text || $a.attr("title") || slug.split("/").filter(Boolean).pop() || u.href;

      const score = (CHAPTER_TITLE.test(text) ? 2 : 0) + (CHAPTER_SLUG.test(slug) ? 1 : 0);
      candidates.push({ title, url: u.href, score, dated: DATE_PERMALINK.test(u.pathname) });
    });

    let picked = candidates.filter((c) => c.score > 0);
    // Không nhận diện được theo tên → lấy các link bài viết (permalink có ngày)
    if (!picked.length) picked = candidates.filter((c) => c.dated);

    return picked.map(({ title, url }) => ({ title, url }));
  }

  async getChapters(url: string, session?: FetchSession): Promise<Chapter[]> {
    return (await this.getIndex(url, session)).chapters;
  }

  // ===========================
  // Nội dung 1 chương
  // ===========================
  async getChapter(
    chapter: Chapter | string,
    session: FetchSession = createSession()
  ): Promise<ChapterContent> {
    const { url, title: listTitle } =
      typeof chapter === "string" ? { url: chapter, title: "" } : chapter;

    try {
      const { $, url: finalUrl, jar, locked } = await this.loadPage(url, session);
      const title = cleanTitle(this.findTitle($)) || listTitle || "Untitled";

      if (locked) {
        return {
          title: listTitle || title,
          url,
          html: "",
          images: [],
          textLength: 0,
          status: "locked",
          error: session.passwords.length
            ? "Wrong password – none of the provided passwords unlocked this chapter."
            : "This chapter is password-protected.",
        };
      }

      let rawHtml = this.findContent($).html() ?? "";

      // Bài viết chia nhiều trang (<!--nextpage-->)
      const extraPages = this.findPageLinks($, finalUrl);
      for (const pageUrl of extraPages) {
        try {
          const next = await fetchHtml(pageUrl, jar);
          const $next = cheerio.load(next.html);
          rawHtml += this.findContent($next).html() ?? "";
        } catch {
          // bỏ qua trang phụ lỗi
        }
      }

      const cleaned = cleanHtml(rawHtml, finalUrl);
      return { title, url, ...cleaned, status: "ok" };
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

  private findPageLinks($: CheerioAPI, pageUrl: string): string[] {
    const base = normalizeUrl(pageUrl, pageUrl);
    if (!base) return [];
    const baseKey = urlKey(base);
    const urls = new Set<string>();
    $(".page-links a[href], .post-page-numbers[href]").each((_, el) => {
      const u = normalizeUrl($(el).attr("href")!, pageUrl);
      if (u && sameSite(u, base) && urlKey(u) !== baseKey) urls.add(u.href);
    });
    return [...urls].slice(0, 50);
  }
}
