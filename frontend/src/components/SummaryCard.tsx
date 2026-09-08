interface SummaryCardProps {
  summary: string;
}

export function SummaryCard({ summary }: SummaryCardProps) {
  const hasSummary = summary.trim().length > 0;

  return (
    <section className="card-elevate rounded-xl border border-border bg-surface p-6 shadow-card hover:shadow-card-hover">
      <h3 className="mb-3 text-sm font-semibold text-ink">Summary</h3>
      <div className="scroll-thin max-h-48 overflow-y-auto pr-2">
        {hasSummary ? (
          <p className="whitespace-pre-line text-[14px] leading-relaxed text-ink-muted">
            {summary}
          </p>
        ) : (
          <p className="text-[14px] italic text-ink-faint">
            No summary available.
          </p>
        )}
      </div>
    </section>
  );
}
