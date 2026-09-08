import { WordPressParser } from "../parsers/wordpress.parser";
import {
  cleanTitle,
  extractChapterCount,
  extractField,
  extractStatus,
} from "../utils/parseMetadata";

const parser = new WordPressParser();



export async function getNovelInfo(url: string) {
  const raw = await parser.getInfo(url);

  return {
    title: cleanTitle(raw.title),
    author: extractField(raw.text, "Tác giả"),
    source: extractField(raw.text, "Nguồn"),
    chapterCount: extractChapterCount(raw.text),
    status: extractStatus(raw.text),
    cover: null,
    summary: "", // sẽ làm ở bước sau
  };
}

export async function getNovelChapters(url: string) {
  return parser.getChapters(url);
}

export async function getChapter(url: string) {
  return parser.getChapter(url);
}