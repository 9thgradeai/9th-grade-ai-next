"use client"

import type { KeyboardEvent, ReactNode } from "react"

export function AuthField({
  id,
  label,
  type = "text",
  value,
  onChange,
  onFocus,
  onBlur,
  onKeyDown,
  onKeyUp,
  error,
  autoComplete,
  placeholder,
  inputMode,
  name,
  leftIcon,
  rightSlot,
}: {
  id: string
  label: string
  type?: string
  value: string
  onChange: (value: string) => void
  onFocus?: () => void
  onBlur?: () => void
  onKeyDown?: (event: KeyboardEvent<HTMLInputElement>) => void
  onKeyUp?: (event: KeyboardEvent<HTMLInputElement>) => void
  error?: string
  autoComplete?: string
  placeholder?: string
  inputMode?: "email" | "text" | "tel" | "numeric"
  name?: string
  leftIcon?: ReactNode
  rightSlot?: ReactNode
}) {
  const describedBy = error ? `${id}-error` : undefined

  return (
    <div>
      <label
        htmlFor={id}
        className="mb-1 block text-xs font-medium uppercase tracking-wider text-[var(--text-muted)] sm:mb-1.5"
      >
        {label}
      </label>
      <div className="group relative">
        {leftIcon && (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 left-0 flex w-11 items-center justify-center text-[var(--text-muted)] transition-colors duration-200 group-focus-within:text-emerald-400"
          >
            {leftIcon}
          </span>
        )}
        <input
          id={id}
          name={name}
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={onFocus}
          onBlur={onBlur}
          onKeyDown={onKeyDown}
          onKeyUp={onKeyUp}
          autoComplete={autoComplete}
          placeholder={placeholder}
          inputMode={inputMode}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={`w-full rounded-xl border bg-[var(--surface-raised)] py-2 text-base text-[var(--foreground)] outline-none backdrop-blur-sm transition-all duration-200 placeholder:text-[var(--text-muted)] focus:border-emerald-400/70 focus:shadow-[0_0_0_4px_rgba(16,185,129,0.10),0_0_28px_rgba(16,185,129,0.16)] focus:ring-2 focus:ring-emerald-400/20 sm:py-3 ${
            leftIcon ? "pl-11" : "px-4"
          } ${rightSlot ? "pr-12" : "px-4"} ${error ? "border-red-500/70" : "border-[var(--border-muted)]"}`}
        />
        {rightSlot && (
          <div className="absolute inset-y-0 right-2 flex items-center">{rightSlot}</div>
        )}
      </div>
      {error && (
        <p id={describedBy} role="alert" className="mt-1 text-sm text-red-500 sm:mt-1.5">
          {error}
        </p>
      )}
    </div>
  )
}
