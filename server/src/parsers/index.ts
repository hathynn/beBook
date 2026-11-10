import { NovelSource } from "./source";
import { TruyenFullParser } from "./truyenfull.parser";
import { WordPressParser } from "./wordpress.parser";

// Nguồn chuyên biệt đứng trước; WordPress là fallback cuối cùng.
const SOURCES: NovelSource[] = [new TruyenFullParser(), new WordPressParser()];

export function getSource(url: string): NovelSource {
  const u = new URL(url);
  return SOURCES.find((s) => s.canHandle(u))!;
}

export { createSession } from "./source";
export type { FetchSession, NovelSource } from "./source";
