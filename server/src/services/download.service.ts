import path from "path";
import { randomUUID } from "crypto";

import { EpubBuilder } from "../builders/epub.builder";
import {
  getNovelInfo,
  getNovelChapters,
  getChapter,
} from "./novel.service";

import { ChapterContent } from "../types/chapterContent";

const builder = new EpubBuilder();

export async function downloadNovel(url: string) {
  // 1. Lấy thông tin truyện
  const info = await getNovelInfo(url);

  // 2. Lấy danh sách chương
  const chapterList = await getNovelChapters(url);

  // 3. Lấy nội dung từng chương
  const chapters: ChapterContent[] = [];

  for (const chapter of chapterList) {
    console.log("Downloading:", chapter.title);

    chapters.push(await getChapter(chapter.url));
  }

  // 4. Tạo tên file
  const filename = `${randomUUID()}.epub`;

  const output = path.join(
    process.cwd(),
    "output",
    filename
  );

  // 5. Build EPUB
  await builder.build(
    info,
    chapters,
    output
  );

  return output;
}