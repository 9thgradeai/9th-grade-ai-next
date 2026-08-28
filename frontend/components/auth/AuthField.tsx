"use client"

import { useState, type KeyboardEvent, type ReactNode } from "react"

/**
 * AuthField — a labelled text input with an animated floating label.
 *
 * The label rests inside the field as a placeholder (clear of the leading
 * icon) and lifts onto the top border once the field is focused or holds a
 * value. State is driven by local focus tracking + the controlled `value`,
 * so no extra JS hooks are required from callers. The label stays a real
 * <label htmlFor> in every position, so screen-reader + keyboard behaviour
 * is unchanged.
 */
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
  const [focused, setFocused] = useState(false)
  const describedBy = error ? `${id}-error` : undefined
  const floated = focused || value !== ""

  return (
    <div>
      <div className="group relative">
        {leftIcon && (
          <span
            aria-hidden="true"
            className={`pointer-events-none absolute inset-y-0 left-0 flex w-11 items-center justify-center text-[var(--text-muted)] transition-colors duration-200 ${
              focused ? "text-emerald-400" : ""
            }`}
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
          placeholder={focused && !value && placeholder ? placeholder : " "}
          inputMode={inputMode}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={`w-full rounded-xl border bg-[var(--surface-raised)] py-3 text-base text-[var(--foreground)] outline-none backdrop-blur-sm transition-all duration-200 placeholder:text-[var(--text-muted)] focus:border-emerald-400/70 focus:shadow-[0_0_0_4px_rgba(16,185,129,0.10),0_0_28px_rgba(16,185,129,0.16)] focus:ring-2 focus:ring-emerald-400/20 sm:py-3.5 ${
            leftIcon ? "pl-11" : "pl-4"
          } ${rightSlot ? "pr-12" : "pr-4"} ${
            error ? "border-red-500/70" : "border-[var(--border-muted)]"
          }`}
        />
        <label
          htmlFor={id}
          className={`pointer-events-none absolute z-10 transition-all duration-200 ease-out ${
            floated
              ? `top-0 left-3 -translate-y-1/2 bg-[var(--surface-raised)] px-1.5 text-[11px] font-medium uppercase tracking-wider ${
                  error ? "text-red-400" : focused ? "text-emerald-400" : "text-[var(--text-muted)]"
                }`
              : `top-1/2 -translate-y-1/2 text-base text-[var(--text-muted)] ${
                  leftIcon ? "left-11" : "left-4"
                }`
          }`}
        >
          {label}
        </label>
        {rightSlot && (
          <div className="absolute inset-y-0 right-2 flex items-center">{rightSlot}</div>
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
