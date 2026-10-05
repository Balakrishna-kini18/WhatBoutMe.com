"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";

export const FIELD =
  "w-full rounded-xl border border-transparent bg-sand px-4 py-3.5 text-ink outline-none transition-colors placeholder:text-ink-soft/60 focus:border-gold-deep focus:bg-white";

/** Password input with a show/hide button. */
export default function PasswordField({
  value,
  onChange,
  autoComplete,
  minLength,
}: {
  value: string;
  onChange: (value: string) => void;
  autoComplete: "current-password" | "new-password";
  minLength?: number;
}) {
  const [show, setShow] = useState(false);

  return (
    <div className="relative">
      <input
        id="password"
        type={show ? "text" : "password"}
        autoComplete={autoComplete}
        required
        minLength={minLength}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`${FIELD} pr-12`}
      />
      <button
        type="button"
        onClick={() => setShow((v) => !v)}
        aria-label={show ? "Hide password" : "Show password"}
        aria-pressed={show}
        className="absolute right-1 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-lg text-ink-soft transition-colors hover:text-ink"
      >
        {show ? (
          <EyeOff className="h-5 w-5" strokeWidth={1.8} />
        ) : (
          <Eye className="h-5 w-5" strokeWidth={1.8} />
        )}
      </button>
    </div>
  );
}
