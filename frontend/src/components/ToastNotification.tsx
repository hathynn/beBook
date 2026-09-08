import { Toaster, toast } from "react-hot-toast";
import { CheckCircle2, XCircle } from "lucide-react";

export function ToastNotification() {
  return (
    <Toaster
      position="top-center"
      toastOptions={{
        duration: 4000,
        style: {
          background: "#FFFFFF",
          color: "#111827",
          border: "1px solid #E5E7EB",
          borderRadius: "12px",
          padding: "10px 14px",
          fontSize: "13px",
          fontWeight: 500,
          boxShadow:
            "0 4px 10px -2px rgba(17,24,39,0.08), 0 2px 6px -2px rgba(17,24,39,0.06)",
        },
      }}
    />
  );
}

export function notifySuccess(message: string) {
  toast.custom((t) => (
    <div
      className={`flex items-center gap-2 rounded-xl border border-success/30 bg-white px-3.5 py-2.5 text-[13px] font-medium text-ink shadow-card transition-opacity ${
        t.visible ? "opacity-100" : "opacity-0"
      }`}
    >
      <CheckCircle2 size={16} className="shrink-0 text-success" />
      {message}
    </div>
  ));
}

export function notifyError(message: string) {
  toast.custom((t) => (
    <div
      className={`flex items-center gap-2 rounded-xl border border-error/30 bg-white px-3.5 py-2.5 text-[13px] font-medium text-ink shadow-card transition-opacity ${
        t.visible ? "opacity-100" : "opacity-0"
      }`}
    >
      <XCircle size={16} className="shrink-0 text-error" />
      {message}
    </div>
  ));
}
