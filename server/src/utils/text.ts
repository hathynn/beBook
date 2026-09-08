export function extractField(
  text: string,
  label: string
): string | undefined {

  const regex = new RegExp(
    `${label}\\s*[:：]\\s*(.+)`,
    "i"
  );

  return regex.exec(text)?.[1]?.trim();

}