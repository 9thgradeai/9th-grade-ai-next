"use client"

import { Keyboard } from "lucide-react"

/**
 * Inline "Caps Lock is on" hint for password fields. Rendered with
 * role="status" so screen readers hear it without stealing focus.
 * Purely advisory — never blocks submission.
 */
export function CapsLockWarning({ visible }: { visible: boolean }) {
  if (!visible) return null
  return (
    <p
      role="status"
      className="mt-1.5 flex items-center gap-1.5 text-xs text-amber-400"
    >
      <Keyboard className="h-3.5 w-3.5" aria-hidden="true" />
      Caps Lock is on — double-check your password.
    </p>
  )
}

/**
 * Accepts React's synthetic keyboard event (or a plain test double).
 * The narrow `"CapsLock"` key type stays contravariance-compatible with
 * DOM `KeyboardEvent.getModifierState`.
 */
export function readCapsLock(event: {
  getModifierState?: (key: "CapsLock") => boolean
} | null | undefined): boolean {
  try {
    return event?.getModifierState?.("CapsLock") ?? false
  } catch {
    return false
  }
}
