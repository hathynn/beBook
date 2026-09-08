import { Link2 } from "lucide-react";
import type { ChangeEvent, KeyboardEvent } from "react";

interface UrlInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  disabled?: boolean;
}

export function UrlInput({ value, onChange, onSubmit, disabled }: UrlInputProps) {
  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    onChange(e.target.value);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !disabled) {
      onSubmit();
    }
  };

  return (
    <div className="relative w-full">
      <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink-faint">
        <Link2 size={18} />
      </span>
      <input
        type="url"
        inputMode="url"
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        placeholder="Paste WordPress novel URL..."
        className="w-full rounded-xl border border-border bg-surface py-4 pl-11 pr-4 text-[15px] text-ink placeholder:text-ink-faint shadow-soft transition-colors duration-200 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:cursor-not-allowed disabled:bg-canvas disabled:text-ink-faint"
        aria-label="WordPress novel URL"
      />
    </div>
  );
}
