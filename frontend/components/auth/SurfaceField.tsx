"use client"

import { useState, type KeyboardEvent, type ReactNode } from "react"

/**
 * SurfaceField — an Outlier-inspired rounded field used by the auth forms.
 * Label sits above a rounded-rectangle surface input with a hairline border
 * and an emerald focus ring; errors render below the input. Keeps the exact
 * accessible-label contract of the old underline field so tests and the
 * ceremony's a11y stay intact.
 */
export function SurfaceField({
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

  return (
    <div>
      <label
        htmlFor={id}
        className={`mb-1.5 block text-sm font-medium transition-colors duration-200 ${
          error ? "text-red-400" : focused ? "text-emerald-400" : "text-[var(--foreground)]"
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
          placeholder={placeholder}
          inputMode={inputMode}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={`w-full rounded-xl border bg-white/[0.04] py-2.5 pl-4 text-base text-[var(--foreground)] outline-none transition-all duration-200 placeholder:text-[var(--text-muted)] ${
            rightSlot ? "pr-10" : "pr-4"
          } ${
            error
              ? "border-red-500/50 focus:border-red-400 focus:ring-2 focus:ring-red-500/20"
              : focused
                ? "border-emerald-400/70 shadow-[0_0_0_3px_rgba(52,211,153,0.15)]"
                : "border-white/10 hover:border-white/20"
          }`}
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