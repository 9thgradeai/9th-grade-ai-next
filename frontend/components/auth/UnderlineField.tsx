"use client"

import { useState, type KeyboardEvent, type ReactNode } from "react"

/**
 * UnderlineField — a document-style input with a label above and an
 * underline that expands from center on focus. Used for the auth forms'
 * "examination document" aesthetic.
 */
export function UnderlineField({
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
  rightSlot?: ReactNode
}) {
  const [focused, setFocused] = useState(false)
  const describedBy = error ? `${id}-error` : undefined
  const hasValue = value !== ""

  return (
    <div>
      <label
        htmlFor={id}
        className={`mb-1.5 block font-mono text-[10px] font-medium uppercase tracking-[0.22em] transition-colors duration-200 ${
          error ? "text-red-400" : focused ? "text-emerald-400" : "text-[var(--text-muted)]"
        }`}
      >
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          name={name}
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => {
            setFocused(true)
            onFocus?.()
          }}
          onBlur={() => {
            setFocused(false)
            onBlur?.()
          }}
          onKeyDown={onKeyDown}
          onKeyUp={onKeyUp}
          autoComplete={autoComplete}
          placeholder={focused && !hasValue && placeholder ? placeholder : " "}
          inputMode={inputMode}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={`w-full border-0 border-b bg-transparent py-2.5 text-base text-[var(--foreground)] outline-none transition-all duration-200 placeholder:text-[var(--text-muted)] ${
            rightSlot ? "pr-10" : "pr-0"
          } ${
            error
              ? "border-b-red-500/60 focus:border-b-red-400"
              : focused
                ? "border-b-emerald-400/60 shadow-[0_1px_0_0_rgba(52,211,153,0.4)]"
                : "border-b-[var(--border-muted)] hover:border-b-[var(--text-muted)]/40"
          }`}
          style={{ borderWidth: "0 0 1px 0" }}
        />
        {rightSlot && (
          <div className="absolute inset-y-0 right-0 flex items-center">{rightSlot}</div>
        )}
      </div>
      {error && (
        <p id={describedBy} role="alert" className="mt-1.5 text-sm text-red-500">
          {error}
        </p>
      )}
    </div>
  )
}
