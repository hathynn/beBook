import { CheckCircle2, Circle, Loader2, XCircle } from "lucide-react";
import type { JobProgress, JobStep, StepState } from "../types/novel";

interface ProgressPanelProps {
  progress: JobProgress;
}

function StepIcon({ status }: { status: StepState }) {
  switch (status) {
    case "done":
      return <CheckCircle2 size={16} className="shrink-0 text-success" />;
    case "current":
      return (
        <Loader2 size={16} className="shrink-0 animate-spin text-primary" />
      );
    case "error":
      return <XCircle size={16} className="shrink-0 text-error" />;
    default:
      return <Circle size={16} className="shrink-0 text-ink-faint" />;
  }
}

function StepRow({ step }: { step: JobStep }) {
  const textClass =
    step.status === "pending"
      ? "text-ink-faint"
      : step.status === "error"
      ? "text-error"
      : step.status === "current"
      ? "text-ink"
      : "text-ink-muted";

  return (
    <li className="flex items-center gap-2.5 py-1">
      <StepIcon status={step.status} />
      <span className={`text-[13px] leading-tight ${textClass}`}>
        {step.label}
      </span>
    </li>
  );
}

export function ProgressPanel({ progress }: ProgressPanelProps) {
  const isSuccess = progress.status === "success";
  const isError = progress.status === "error";

  const barColor = isError ? "bg-error" : isSuccess ? "bg-success" : "bg-primary";
  const percent = Math.min(100, Math.max(0, Math.round(progress.percent)));

  return (
    <section
      className={`animate-fadeIn rounded-xl border bg-surface p-6 shadow-card transition-colors duration-300 ${
        isError
          ? "border-error/40"
          : isSuccess
          ? "border-success/40"
          : "border-border"
      }`}
    >
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {isSuccess && <CheckCircle2 size={18} className="text-success" />}
          {isError && <XCircle size={18} className="text-error" />}
          <h3 className="text-sm font-semibold text-ink">
            {isError ? "Generation failed" : "Generating EPUB"}
          </h3>
        </div>
        <span
          className={`text-sm font-semibold tabular-nums ${
            isError ? "text-error" : isSuccess ? "text-success" : "text-ink"
          }`}
        >
          {percent}%
        </span>
      </div>

      {/* Progress bar */}
      <div className="mb-4 h-2 w-full overflow-hidden rounded-full bg-canvas">
        <div
          className={`h-full rounded-full transition-all duration-500 ease-out ${barColor}`}
          style={{ width: `${percent}%` }}
        />
      </div>

      {/* Current step / status line */}
      <p
        className={`mb-4 text-[13px] font-medium ${
          isError ? "text-error" : "text-ink-muted"
        }`}
      >
        {isError
          ? progress.error ?? "Something went wrong while generating the EPUB."
          : isSuccess
          ? "EPUB generated successfully"
          : progress.currentStepLabel}
      </p>

      {/* Checklist */}
      <ul className="space-y-0.5 border-t border-border-subtle pt-3">
        {progress.steps.map((step) => (
          <StepRow key={step.id} step={step} />
        ))}
      </ul>
    </section>
  );
}
