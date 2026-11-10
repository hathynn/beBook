import type { Cheerio, CheerioAPI } from "cheerio";
import type { AnyNode } from "domhandler";

const BLOCK_TAGS =
  "p, div, li, h1, h2, h3, h4, h5, h6, blockquote, tr, section, article, ul, ol, table, details, summary, figure, header";

/** Lấy text của 1 vùng, mỗi khối/`<br>` là một dòng (thay vì dính liền như `.text()`). */
export function blockText($: CheerioAPI, el: Cheerio<AnyNode>): string[] {
  const clone = el.clone();
  clone.find("script, style, noscript").remove();
  clone.find("br").replaceWith("\n");
  clone.find(BLOCK_TAGS).each((_, b) => {
    $(b).prepend("\n").append("\n");
  });
  return clone
    .text()
    .split("\n")
    .map((l) => l.replace(/[\s ]+/g, " ").trim())
    .filter(Boolean);
}

function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function extractField(lines: string[], labels: string[]): string | undefined {
  const re = new RegExp(`(?:^|[^\\p{L}])(?:${labels.map(escapeRegex).join("|")})\\s*[:：]\\s*(.+)`, "iu");
  for (const line of lines) {
    const value = re.exec(line)?.[1]?.trim();
    if (value) return value;
  }
  return undefined;
}

export function extractChapterCount(lines: string[]): number | undefined {
  const value = extractField(lines, ["Số chương", "Độ dài", "Chapters"]);
  const match = value?.match(/\d+/);
  return match ? Number(match[0]) : undefined;
}

export function extractStatus(lines: string[]): string | undefined {
  const value =
    extractField(lines, ["Tình trạng", "Trạng thái", "Status"]) ??
    extractField(lines, ["Số chương", "Độ dài"]);
  if (!value) return;
  if (/hoàn|full|completed?/i.test(value)) return "Hoàn";
  if (/đang|ongoing|tiến hành/i.test(value)) return "Đang tiến hành";
  if (/drop|tạm ngưng|ngừng/i.test(value)) return "Tạm ngưng";
  return;
}

export function extractGenres(lines: string[]): string[] {
  const value = extractField(lines, ["Thể loại", "Genre", "Genres"]);
  if (!value) return [];
  return value
    .split(/[,，、/|]/)
    .map((g) => g.trim().replace(/\.$/, ""))
    .filter(Boolean);
}

const SUMMARY_START = /^[^\p{L}\d]*(?:văn án|giới thiệu|tóm tắt|summary|synopsis|nội dung)[^\p{L}\d]*$/iu;
const SUMMARY_STOP =
  /^[^\p{L}\d]*(?:danh sách chương|mục lục|chương\s*\d+|chapter\s*\d+|fanart|giai điệu|đọc trên|tác giả|thể loại|pass(?:word)?\b|mật khẩu)/iu;

/** Lấy phần "Văn án / Giới thiệu" – chọn đoạn dài nhất trong các lần xuất hiện. */
export function extractSummary(lines: string[]): string {
  let best = "";
  lines.forEach((line, i) => {
    if (!SUMMARY_START.test(line)) return;
    const collected: string[] = [];
    for (let j = i + 1; j < lines.length && collected.length < 40; j++) {
      if (SUMMARY_STOP.test(lines[j]) || SUMMARY_START.test(lines[j])) break;
      collected.push(lines[j]);
    }
    const text = collected.join("\n").trim();
    if (text.length > best.length) best = text;
  });
  return best;
}

/**
 * Tìm gợi ý mật khẩu trên trang mục lục, ví dụ:
 * "Pass: abc123", "Mật khẩu là: xyz", "mk: 1234".
 */
export function extractPasswordHints(lines: string[]): string[] {
  const re =
    /(?:pass(?:word)?|mật\s*khẩu|mk)\s*(?:chương\s*[\d\s,–-]*)?(?:là|:|：|=)+\s*[:：]?\s*["“'«]?([^\s"”'»,;]{2,40})/giu;
  const hints = new Set<string>();
  for (const line of lines) {
    for (const m of line.matchAll(re)) {
      const pw = m[1].replace(/[.)]+$/, "");
      if (pw && !/^(là|:)$/i.test(pw)) hints.add(pw);
    }
  }
  return [...hints];
}

export function cleanTitle(title: string) {
  return title
    .replace(/\[.*?\]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
