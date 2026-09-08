export interface NovelInfo {
  title: string;
  author?: string;
  cover?: string | null;
  summary?: string;
  genres?: string[];
  source?: string;
  chapterCount?: number;
  status?: string;
}