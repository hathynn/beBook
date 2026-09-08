import { useEffect, useState } from "react";
import axios from "axios";
import { Header } from "./components/Header";
import { UrlInput } from "./components/UrlInput";
import { AnalyzeButton } from "./components/AnalyzeButton";
import { NovelPreviewCard } from "./components/NovelPreviewCard";
import { SummaryCard } from "./components/SummaryCard";
import { ProgressPanel } from "./components/ProgressPanel";
import { DownloadButton } from "./components/DownloadButton";
import { ToastNotification, notifyError, notifySuccess } from "./components/ToastNotification";
import { Footer } from "./components/Footer";
import { useNovelInfo } from "./hooks/useNovelInfo";
import { useEpubDownload } from "./hooks/useDownloadEpub";

function extractErrorMessage(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err)) {
    const apiMessage = err.response?.data?.message;
    if (typeof apiMessage === "string" && apiMessage.trim()) return apiMessage;
  }
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

export default function App() {
  const [url, setUrl] = useState("");
  const novelInfo = useNovelInfo();
  const { progress, start, retry, fileUrl } = useEpubDownload();

  const novel = novelInfo.data ?? null;

  const handleAnalyze = () => {
    const trimmed = url.trim();
    if (!trimmed) {
      notifyError("Paste a WordPress novel URL first.");
      return;
    }
    novelInfo.mutate(trimmed, {
      onError: (err) => {
        notifyError(extractErrorMessage(err, "Couldn't read that novel page."));
      },
    });
  };

  const handleDownload = () => {
    if (!novel) return;
    start(url.trim(), novel);
  };

  useEffect(() => {
    if (progress?.status === "success") {
      notifySuccess("EPUB generated successfully");
    }
    if (progress?.status === "error" && progress.error) {
      notifyError(progress.error);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [progress?.status]);

  const downloadState: "idle" | "loading" | "success" | "error" = !progress
    ? "idle"
    : progress.status === "success"
    ? "success"
    : progress.status === "error"
    ? "error"
    : "loading";

  return (
    <div className="min-h-screen bg-canvas">
      <ToastNotification />
      <main className="mx-auto flex w-full max-w-xl flex-col gap-8 px-4 pb-16 pt-16 sm:pt-24">
        <Header />

        <div className="flex flex-col gap-3">
          <UrlInput
            value={url}
            onChange={setUrl}
            onSubmit={handleAnalyze}
            disabled={novelInfo.isPending}
          />
          <AnalyzeButton
            onClick={handleAnalyze}
            loading={novelInfo.isPending}
          />
        </div>

        {novel && (
          <div className="flex flex-col gap-5">
            <NovelPreviewCard novel={novel} />
            <SummaryCard summary={novel.summary} />

            {progress && (progress.status === "running" || progress.status === "error" || progress.status === "success") && (
              <ProgressPanel progress={progress} />
            )}

            <DownloadButton
              state={downloadState}
              onDownload={handleDownload}
              onRetry={retry}
              fileUrl={fileUrl}
              fileName={progress?.fileName ?? null}
            />
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
}
