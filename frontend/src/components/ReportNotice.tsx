import { AlertTriangle, Lock } from "lucide-react";
import type { DownloadReport } from "../types/novel";

interface ReportNoticeProps {
  report: DownloadReport;
}

function ChapterList({ titles }: { titles: string[] }) {
  const shown = titles.slice(0, 8);
  return (
    <ul className="mt-1.5 list-disc space-y-0.5 pl-5 text-[13px] text-ink-muted">
      {shown.map((t) => (
        <li key={t}>{t}</li>
      ))}
      {titles.length > shown.length && <li>…and {titles.length - shown.length} more</li>}
    </ul>
  );
}

/** Cảnh báo sau khi tải: chương còn bị khoá / tải lỗi / ảnh lỗi. */
export function ReportNotice({ report }: ReportNoticeProps) {
  const { locked, failed, images } = report;
  if (!locked.length && !failed.length && !images.failed) return null;

  return (
    <section className="animate-fadeIn space-y-3 rounded-xl border border-error/30 bg-error-light/40 p-5">
      {locked.length > 0 && (
        <div>
          <p className="flex items-center gap-2 text-sm font-semibold text-ink">
            <Lock size={15} className="text-error" />
            {locked.length} chapter{locked.length > 1 ? "s are" : " is"} still locked
          </p>
          <ChapterList titles={locked} />
          <p className="mt-1.5 text-[13px] text-ink-muted">
            Add the correct password above and download again.
          </p>
        </div>
      )}
      {failed.length > 0 && (
        <div>
          <p className="flex items-center gap-2 text-sm font-semibold text-ink">
            <AlertTriangle size={15} className="text-error" />
            {failed.length} chapter{failed.length > 1 ? "s" : ""} failed to download
          </p>
          <ChapterList titles={failed} />
        </div>
      )}
      {images.failed > 0 && (
        <p className="flex items-center gap-2 text-[13px] text-ink-muted">
          <AlertTriangle size={14} className="text-error" />
          {images.failed} image{images.failed > 1 ? "s" : ""} couldn&apos;t be downloaded and were skipped.
        </p>
      )}
    </section>
  );
}
