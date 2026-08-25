"use client"

import { motion } from "framer-motion"
import { ArrowRight, Sparkles } from "lucide-react"
import Interactive3DCard from "@/components/landing/Interactive3DCard"

/**
 * Candidate identification — two examination documents rather than generic
 * UI cards. Each carries a form serial and a candidate-class stamp; tilt,
 * lift and edge-lighting react to the pointer on capable devices.
 */
export function AuthChoice({ onChoose }: { onChoose: (kind: "login" | "signup") => void }) {
  const options = [
    {
      kind: "login" as const,
      title: "I have an account",
      kicker: "Returning candidate",
      subtitle: "Sign in — your admit card is waiting",
      tag: "EXAMINEE",
      serial: "FORM NO. 9G-A1",
      icon: <ArrowRight className="h-5 w-5" aria-hidden="true" />,
    },
    {
      kind: "signup" as const,
      title: "I'm new here",
      kicker: "First attempt",
      subtitle: "Form fill-up — issue your first admit card",
      tag: "NEW ASPIRANT",
      serial: "FORM NO. 9G-B7",
      icon: <Sparkles className="h-5 w-5" aria-hidden="true" />,
    },
  ]

  return (
    <motion.div
      role="group"
      aria-label="Do you already have an account?"
      className="flex w-full flex-col gap-3"
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.32, ease: "easeOut" }}
    >
      {options.map((opt) => (
        <motion.div
          key={opt.kind}
          whileHover={{ y: -3 }}
          whileTap={{ scale: 0.985 }}
          transition={{ type: "spring", stiffness: 500, damping: 32 }}
        >
          <Interactive3DCard maxRotation={2} glow className="rounded-2xl">
            <button
              type="button"
              onClick={() => onChoose(opt.kind)}
              className="group relative flex w-full items-center justify-between gap-4 overflow-hidden rounded-2xl border border-[var(--border-muted)] bg-[var(--surface-raised)] px-5 py-4 text-left backdrop-blur-md transition-all duration-300 hover:border-emerald-400/60 hover:shadow-[0_0_0_1px_rgba(16,185,129,0.28),0_12px_36px_rgba(6,214,160,0.10)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400"
            >
              {/* Document texture — faint ruled lines */}
              <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 opacity-[0.05]"
                style={{
                  backgroundImage:
                    "repeating-linear-gradient(0deg, rgba(234,255,251,0.7) 0 1px, transparent 1px 22px)",
                }}
              />
              <span className="relative min-w-0">
                <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-zinc-500">
                    {opt.serial}
                  </span>
                  <span className="rounded border border-emerald-400/30 bg-emerald-500/10 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.16em] text-emerald-400">
                    {opt.tag}
                  </span>
                </span>
                <span className="mt-1 block font-mono text-[10px] uppercase tracking-[0.18em] text-emerald-400/70">
                  {opt.kicker}
                </span>
                <span className="mt-0.5 block truncate text-base font-semibold text-[var(--foreground)]">
                  {opt.title}
                </span>
                <span className="mt-0.5 block text-sm text-[var(--text-muted)]">{opt.subtitle}</span>
              </span>
              <span className="relative shrink-0 text-[var(--text-muted)] transition-all group-hover:translate-x-0.5 group-hover:text-emerald-400">
                {opt.icon}
              </span>
            </button>
          </Interactive3DCard>
        </motion.div>
      ))}
    </motion.div>
  )
}
