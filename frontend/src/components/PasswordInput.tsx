import { KeyRound } from "lucide-react";
import type { ChangeEvent } from "react";

interface PasswordInputProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  hasHints?: boolean;
}

/** Mật khẩu cho chương bị khoá – mỗi dòng 1 mật khẩu, backend thử lần lượt. */
export function PasswordInput({ value, onChange, disabled, hasHints }: PasswordInputProps) {
  return (
    <section className="rounded-xl border border-border bg-surface p-5 shadow-card">
      <label htmlFor="chapter-passwords" className="mb-1 flex items-center gap-2 text-sm font-semibold text-ink">
        <KeyRound size={16} className="text-primary-dark" />
        Chapter passwords <span className="font-normal text-ink-faint">(optional)</span>
      </label>
      <p className="mb-3 text-[13px] leading-relaxed text-ink-muted">
        Some chapters are locked with a password. Enter one password per line — every password is
        tried on each locked chapter.
        {hasHints && " Passwords written on the novel page are tried automatically."}
      </p>
      <textarea
        id="chapter-passwords"
        rows={2}
        value={value}
        disabled={disabled}
        onChange={(e: ChangeEvent<HTMLTextAreaElement>) => onChange(e.target.value)}
        placeholder={"password1\npassword2"}
        spellCheck={false}
        autoComplete="off"
        className="w-full resize-y rounded-lg border border-border bg-canvas px-3 py-2 font-mono text-[14px] text-ink placeholder:text-ink-faint focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:cursor-not-allowed"
      />
    </section>
  );
}
