import { Chapter } from "../types/chapter";
import { ChapterContent } from "../types/chapterContent";
import { NovelIndex } from "../types/novel";
import { CookieJar } from "../utils/http";

export interface FetchSession {
  /** Mật khẩu thử lần lượt cho chương bị khoá. */
  passwords: string[];
  /** Cookie mật khẩu gần nhất mở khoá thành công – dùng lại cho các chương sau. */
  unlockedCookies: CookieJar;
}

export function createSession(passwords: string[] = []): FetchSession {
  const unique = [...new Set(passwords.map((p) => p.trim()).filter(Boolean))];
  return { passwords: unique, unlockedCookies: new Map() };
}

/** Một trang nguồn truyện (WordPress, TruyenFull, ...). */
export interface NovelSource {
  readonly name: string;
  /** Số chương tải song song tối đa (tránh bị chặn/rate-limit). */
  readonly concurrency: number;
  canHandle(url: URL): boolean;
  /** Đưa URL người dùng dán (có thể là link chương) về URL trang truyện. */
  normalizeUrl?(url: URL): string;
  getIndex(url: string, session: FetchSession): Promise<NovelIndex>;
  getChapter(chapter: Chapter | string, session: FetchSession): Promise<ChapterContent>;
}
