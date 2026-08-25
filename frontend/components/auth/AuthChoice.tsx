"use client"

import { motion } from "framer-motion"
import { ArrowRight, Sparkles } from "lucide-react"

export function AuthChoice({ onChoose }: { onChoose: (kind: "login" | "signup") => void }) {
  const options = [
    {
      kind: "login" as const,
      title: "I have an account",
      subtitle: "Sign in — your admit card is waiting",
      tag: "EXAMINEE",
      icon: <ArrowRight className="h-5 w-5" aria-hidden="true" />,
    },
    {
      kind: "signup" as const,
      title: "I'm new here",
      subtitle: "Form fill-up — issue your first admit card",
      tag: "NEW ASPIRANT",
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
        <motion.button
          key={opt.kind}
          type="button"
          onClick={() => onChoose(opt.kind)}
          whileHover={{ y: -3 }}
          whileTap={{ scale: 0.985 }}
          transition={{ type: "spring", stiffness: 500, damping: 32 }}
          className="group relative flex w-full items-center justify-between gap-4 overflow-hidden rounded-2xl border border-[var(--border-muted)] bg-[var(--surface-raised)] px-5 py-4 text-left shadow-sm backdrop-blur-md transition-all hover:border-emerald-400/60 hover:shadow-[0_0_0_1px_rgba(16,185,129,0.28),0_12px_36px_rgba(6,214,160,0.10)]"
        >
          <span
            aria-hidden="true"
            className="pointer-events-none absolute -right-6 -top-6 h-16 w-16 rounded-full bg-emerald-500/10 blur-2xl transition-opacity duration-300 group-hover:opacity-100"
            style={{ opacity: 0 }}
          />
          <span>
            <span className="flex items-center gap-2">
              <span className="block text-base font-semibold text-[var(--foreground)]">
                {opt.title}
              </span>
              <span className="rounded border border-emerald-400/30 bg-emerald-500/10 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-emerald-400">
                {opt.tag}
              </span>
            </span>
            <span className="mt-0.5 block text-sm text-[var(--text-muted)]">{opt.subtitle}</span>
          </span>
          <span className="text-[var(--text-muted)] transition-all group-hover:translate-x-0.5 group-hover:text-emerald-400">
            {opt.icon}
          </span>
        </motion.button>
      ))}
    </motion.div>
  )
}
