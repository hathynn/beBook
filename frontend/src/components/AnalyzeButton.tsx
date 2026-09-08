import { Loader2, Sparkles } from "lucide-react";

interface AnalyzeButtonProps {
  onClick: () => void;
  loading: boolean;
  disabled?: boolean;
}

export function AnalyzeButton({ onClick, loading, disabled }: AnalyzeButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || loading}
      className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 py-4 text-[15px] font-semibold text-white shadow-soft transition-all duration-150 hover:bg-primary-dark active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-ink-faint disabled:active:scale-100"
    >
      {loading ? (
        <>
          <Loader2 size={18} className="animate-spin" />
          Analyzing…
        </>
      ) : (
        <>
          <Sparkles size={18} />
          Analyze
        </>
      )}
    </button>
  );
}
