"use client"

import type { ReactNode } from "react"
import { Loader2 } from "lucide-react"

/**
 * AuthSubmitButton — the single primary CTA used across every auth form
 * (sign in, sign up, reset, recovery). Owns the premium gradient, the
 * shine sweep, press compression, focus ring and an inline loading state
 * that never changes the button's footprint (no layout jump on submit).
 */
export function AuthSubmitButton({
  busy,
  busyLabel,
  children,
  type = "submit",
  disabled,
  icon,
  form,
}: {
  busy?: boolean
  busyLabel?: string
  children: ReactNode
  type?: "submit" | "button"
  disabled?: boolean
  icon?: ReactNode
  form?: string
}) {
  return (
    <button
      type={type}
      form={form}
      disabled={busy || disabled}
      className="btn-shine group relative flex w-full items-center justify-center gap-2 overflow-hidden rounded-full bg-gradient-to-r from-emerald-500 to-teal-500 px-6 py-3.5 text-base font-semibold text-white shadow-[0_8px_24px_rgba(16,185,129,0.25)] transition-all duration-200 hover:shadow-[0_10px_32px_rgba(16,185,129,0.4)] active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-emerald-400/80 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
      <span className={busy ? "opacity-90" : undefined}>{busy ? busyLabel : children}</span>
      {!busy && icon}
    </button>
  )
}
