import { BookOpen } from "lucide-react";
import { MetadataCard } from "./MetadataCard";
import type { NovelInfo } from "../types/novel";

interface NovelPreviewCardProps {
  novel: NovelInfo;
}

export function NovelPreviewCard({ novel }: NovelPreviewCardProps) {
  return (
    <section className="card-elevate animate-fadeIn rounded-xl border border-border bg-surface p-6 shadow-card hover:shadow-card-hover">
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-[160px_1fr]">
        <div className="mx-auto w-full max-w-[160px] sm:mx-0">
          {novel.coverUrl ? (
            <img
              src={novel.coverUrl}
              alt={`Cover of ${novel.title}`}
              className="aspect-[2/3] w-full rounded-xl border border-border object-cover shadow-soft"
            />
          ) : (
            <div className="flex aspect-[2/3] w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-canvas text-ink-faint">
              <BookOpen size={32} strokeWidth={1.5} />
              <span className="text-xs font-medium">No Cover</span>
            </div>
          )}
        </div>

        <div className="flex items-center">
          <MetadataCard novel={novel} />
        </div>
      </div>
    </section>
  );
}
