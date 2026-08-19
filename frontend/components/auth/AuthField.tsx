"use client";

import type { ReactNode } from "react";

export function AuthField({
  id,
  label,
  type = "text",
  value,
  onChange,
  onFocus,
  onBlur,
  error,
  autoComplete,
  placeholder,
  inputMode,
  rightSlot,
}: {
  id: string;
  label: string;
  type?: string;
  value: string;
  onChange: (value: string) => void;
  onFocus?: () => void;
  onBlur?: () => void;
  error?: string;
  autoComplete?: string;
  placeholder?: string;
  inputMode?: "email" | "text" | "tel" | "numeric";
  rightSlot?: ReactNode;
}) {
  const describedBy = error ? `${id}-error` : undefined;

  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-[var(--text-muted)]">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={onFocus}
          onBlur={onBlur}
          autoComplete={autoComplete}
          placeholder={placeholder}
          inputMode={inputMode}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={`w-full rounded-xl border bg-[var(--surface-raised)] px-4 py-3 text-base text-[var(--foreground)] outline-none transition-colors placeholder:text-[var(--text-muted)] focus:border-emerald-400/70 focus:ring-2 focus:ring-emerald-400/20 ${
            rightSlot ? "pr-12" : ""
          } ${error ? "border-red-500/70" : "border-[var(--border-muted)]"}`}
        />
        {rightSlot && <div className="absolute inset-y-0 right-2 flex items-center">{rightSlot}</div>}
      </div>
      {error && (
        <p id={describedBy} role="alert" className="mt-1.5 text-sm text-red-500">
          {error}
        </p>
      )}
    </div>
  );
}