"use client"

import { useEffect, useState } from "react"
import { motion, useReducedMotion } from "framer-motion"
import { Check } from "lucide-react"

/**
 * Post-authentication verification ceremony.
 *
 * Runs AFTER the real API has resolved — it never gates or fakes backend
 * progress. If the network was slow, Unit-9's processing state already told
 * that story; this is the short, satisfying confirmation beat.
 */

const STEPS = ["Identity", "Credentials", "Session"] as const

export function VerificationSequence({
  kind,
  onComplete,
}: {
  kind: "login" | "signup"
  onComplete: () => void
}) {
  const reduced = useReducedMotion() ?? false
  const [revealed, setRevealed] = useState(0)

  const stepMs = reduced ? 90 : 330

  useEffect(() => {
    const timers: number[] = []
    STEPS.forEach((_, i) => {
      timers.push(window.setTimeout(() => setRevealed(i + 1), stepMs * (i + 1)))
    })
    // Authorized beat, then hand off to the admit card.
    timers.push(window.setTimeout(() => setRevealed(STEPS.length + 1), stepMs * (STEPS.length + 1)))
    timers.push(window.setTimeout(onComplete, stepMs * (STEPS.length + 2)))
    return () => timers.forEach((t) => window.clearTimeout(t))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const authorized = revealed > STEPS.length

  return (
    <div className="flex w-full flex-col items-center gap-5 text-center" aria-live="polite">
      <p className="font-mono text-[11px] uppercase tracking-[0.26em] text-emerald-400/80">
        {authorized ? "Access authorized" : "Verifying candidate"}
      </p>

      <ul className="w-full max-w-[260px] space-y-2.5">
        {STEPS.map((step, i) => {
          const done = revealed > i
          return (
            <motion.li
              key={step}
              initial={false}
              animate={{ opacity: done ? 1 : 0.35 }}
              className={`flex items-center justify-between rounded-xl border px-4 py-2.5 text-left font-mono text-xs transition-colors duration-300 ${
                done
                  ? "border-emerald-400/30 bg-emerald-500/[0.07] text-zinc-200"
                  : "border-white/10 bg-white/[0.02] text-zinc-500"
              }`}
            >
              {step}
              <span
                aria-hidden="true"
                className={`flex h-4 w-4 items-center justify-center rounded-full ${
                  done ? "bg-emerald-500 text-white" : "border border-white/20"
                }`}
              >
                {done && <Check className="h-3 w-3" />}
              </span>
            </motion.li>
          )
        })}
      </ul>

      {authorized && (
        <motion.p
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          className="font-display text-sm font-semibold text-emerald-300"
        >
          {kind === "signup" ? "Candidate registered" : "Candidate verified"}
        </motion.p>
      )}
    </div>
  )
}
