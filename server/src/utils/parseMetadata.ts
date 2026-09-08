export function extractField(
  text: string,
  label: string
): string | undefined {
  const regex = new RegExp(`${label}\\s*[:：]\\s*(.+)`, "i");

  return regex.exec(text)?.[1]?.trim();
}

export function extractChapterCount(text: string): number | undefined {
  const value = extractField(text, "Số chương");

  if (!value) return;

  const match = value.match(/\d+/);

  return match ? Number(match[0]) : undefined;
}

export function extractStatus(text: string): string | undefined {
  const value = extractField(text, "Số chương");

  if (!value) return;

  if (value.includes("Hoàn")) return "Hoàn";
  if (value.includes("Đang")) return "Đang tiến hành";

  return;
}

export function cleanTitle(title: string) {
  return title
    .replace(/\[.*?\]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}