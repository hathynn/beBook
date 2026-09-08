import axios from "axios";
import * as cheerio from "cheerio";
import { Chapter } from "../types/chapter";
import { ChapterContent } from "../types/chapterContent";
import { cleanHtml } from "../utils/htmlCleaner";

export class WordPressParser {

  // ===========================
  // Lấy thông tin truyện
  // ===========================
  async getInfo(url: string) {
    const { data } = await axios.get(url);

    const $ = cheerio.load(data);

    return {
      title: $(".entry-title").first().text().trim(),
      text: $(".entry-content").first().text().trim(),
      html: $(".entry-content").first().html() ?? "",
    };
  }

  // ===========================
  // Lấy danh sách chương
  // ===========================
  async getChapters(url: string): Promise<Chapter[]> {

    const { data } = await axios.get(url);

    const $ = cheerio.load(data);

    const content = $(".entry-content").first();

    const chapters: Chapter[] = [];

    const seen = new Set<string>();

    content.find("a").each((_, element) => {

      const title = $(element).text().trim();
      const href = $(element).attr("href");

      if (!href) return;

      // Chỉ lấy http/https
      if (!href.startsWith("http")) return;

      // Bỏ link chia sẻ
      if (
        href.includes("?share=") ||
        href.includes("facebook.com") ||
        href.includes("twitter.com") ||
        href.includes("pinterest.com") ||
        href.includes("wattpad.com") ||
        href.startsWith("mailto:")
      ) {
        return;
      }

      // Bỏ link không có title
      if (!title) return;

      // Chỉ lấy chương
      const isChapter =
        /^\d+$/.test(title) ||
        /^\d+\s*[-–]\s*\d+$/.test(title) ||
        /^Chương/i.test(title) ||
        /^Ngoại truyện/i.test(title);

      if (!isChapter) return;

      // Bỏ link trùng
      if (seen.has(href)) return;

      seen.add(href);

      chapters.push({
        title,
        url: href,
      });

    });

    return chapters;
  }

  // ===========================
  // Lấy nội dung 1 chương
  // ===========================
  async getChapter(url: string): Promise<ChapterContent> {

    const { data } = await axios.get(url);

    const $ = cheerio.load(data);

    const title = $(".entry-title")
      .first()
      .text()
      .trim();

    const content = $(".entry-content").first();

    return {
      title,
      html: cleanHtml(content.html() ?? ""),
    };
  }
}