import { Chapter } from "./chapter";

export interface NovelInfo {
  title: string;
  author?: string;
  coverUrl?: string | null;
  summary?: string;
  genres?: string[];
  source?: string;
  chapterCount?: number;
  status?: string;
  url?: string;
}

export interface NovelIndex {
  info: NovelInfo;
  chapters: Chapter[];
  /** Mật khẩu gợi ý tìm thấy trên trang mục lục. */
  passwordHints: string[];
}
