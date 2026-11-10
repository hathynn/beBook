import { Download, RotateCcw } from "lucide-react";

type DownloadButtonState = "idle" | "loading" | "success" | "error";

interface DownloadButtonProps {
  state: DownloadButtonState;
  onDownload: () => void;
  onRetry: () => void;
  fileUrl: string | null;
  fileName: string | null;
}

export function DownloadButton({
  state,
  onDownload,
  onRetry,
  fileUrl,
  fileName,
}: DownloadButtonProps) {
  if (state === "loading") {
    return null;
  }

  if (state === "error") {
    return (
      <button
        type="button"
        onClick={onRetry}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-error px-5 py-4 text-[15px] font-semibold text-white shadow-soft transition-all duration-150 hover:bg-error-dark active:scale-[0.98]"
      >
        <RotateCcw size={18} />
        Retry
      </button>
    );
  }

  if (state === "success" && fileUrl) {
    return (
      <div className="flex flex-col gap-2">
        <a
          href={fileUrl}
          download={fileName ?? "novel.epub"}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-success px-5 py-4 text-[15px] font-semibold text-white shadow-soft transition-all duration-150 hover:bg-success-dark active:scale-[0.98]"
        >
          <Download size={18} />
          Download Again
        </a>
        <button
          type="button"
          onClick={onDownload}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-surface px-5 py-3 text-[14px] font-medium text-ink-muted transition-colors duration-150 hover:text-ink"
        >
          <RotateCcw size={16} />
          Generate again (e.g. after adding passwords)
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onDownload}
      className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 py-4 text-[15px] font-semibold text-white shadow-soft transition-all duration-150 hover:bg-primary-dark active:scale-[0.98]"
    >
      <Download size={18} />
      Download EPUB
    </button>
  );
}
