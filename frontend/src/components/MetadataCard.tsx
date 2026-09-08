import type { NovelInfo } from "../types/novel";

interface MetadataCardProps {
  novel: NovelInfo;
}

interface MetaItemProps {
  label: string;
  value: string;
}

function MetaItem({ label, value }: MetaItemProps) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium uppercase tracking-wide text-ink-faint">
        {label}
      </p>
      <p className="text-base font-semibold text-ink break-words">{value}</p>
    </div>
  );
}

export function MetadataCard({ novel }: MetadataCardProps) {
  return (
    <div className="grid grid-cols-2 gap-5 sm:grid-cols-2">
      <div className="col-span-2">
        <MetaItem label="Title" value={novel.title || "Untitled"} />
      </div>
      <MetaItem label="Author" value={novel.author || "Unknown"} />
      <MetaItem label="Status" value={novel.status || "Unknown"} />
      <MetaItem label="Source" value={novel.source || "—"} />
      <MetaItem label="Chapter Count" value={String(novel.chapterCount)} />
    </div>
  );
}
