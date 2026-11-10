export type ChapterStatus = "ok" | "locked" | "error";

export interface ChapterContent {
  title: string;
  url?: string;
  /** Fragment XHTML hợp lệ. */
  html: string;
  /** URL tuyệt đối của ảnh trong chương (sẽ được tải và nhúng vào EPUB). */
  images: string[];
  textLength: number;
  status: ChapterStatus;
  error?: string;
}
