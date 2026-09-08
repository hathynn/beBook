import { BookMarked } from "lucide-react";

export function Header() {
  return (
    <header className="flex flex-col items-center text-center gap-3 animate-fadeIn">
      <div className="flex items-center gap-2.5">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-white shadow-soft">
          <BookMarked size={18} strokeWidth={2.25} />
        </span>
        <span className="text-2xl font-bold tracking-tight text-ink">
          beBook
        </span>
      </div>
      <div className="space-y-1.5">
        <p className="text-base font-medium text-ink">
          Convert WordPress Novel to EPUB
        </p>
        <p className="text-sm text-ink-muted max-w-md mx-auto">
          Paste a WordPress novel URL, preview the novel information, then
          download it as an EPUB.
        </p>
      </div>
    </header>
  );
}
