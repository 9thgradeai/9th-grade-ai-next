"use client"

import type { ReactNode } from "react"
import { motion } from "framer-motion"
import { useReducedMotion } from "framer-motion"

interface ConstellationFormProps {
  children: ReactNode
  serial?: string
  showHub?: boolean
  hubActive?: boolean
}

export function ConstellationForm({
  children,
  serial = "FORM 9G-A1",
  showHub = true,
  hubActive = false,
}: ConstellationFormProps) {
  const reduced = useReducedMotion() ?? false
  const childArray = Array.isArray(children) ? children : [children]
  const fieldCount = childArray.filter(
    (child) => child && typeof child === "object" && "type" in child && child.type === "div"
  ).length

  return (
    <motion.div
      className="constellation-form relative w-full"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4 }}
    >
      {/* Outer constellation glow */}
      <div className="constellation-outer-glow pointer-events-none absolute inset-0 rounded-3xl opacity-30" />

      {/* Main container */}
      <div className="relative overflow-hidden rounded-3xl border border-[var(--border-muted)] bg-[var(--surface-raised)] shadow-[var(--shadow-elevation-2)]">
        {/* Constellation background pattern */}
        <div className="constellation-bg-pattern pointer-events-none absolute inset-0 opacity-[0.03]" aria-hidden="true">
          <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <pattern id="constellation-grid" x="0" y="0" width="60" height="60" patternUnits="userSpaceOnUse">
                {/* Constellation node points */}
                <circle cx="0" cy="0" r="1" fill="rgba(45, 212, 191, 0.4)" />
                <circle cx="60" cy="0" r="1" fill="rgba(45, 212, 191, 0.4)" />
                <circle cx="0" cy="60" r="1" fill="rgba(45, 212, 191, 0.4)" />
                <circle cx="60" cy="60" r="1" fill="rgba(45, 212, 191, 0.4)" />
                <circle cx="30" cy="30" r="1.5" fill="rgba(45, 212, 191, 0.6)" />
                {/* Constellation lines */}
                <line x1="0" y1="0" x2="30" y2="30" stroke="rgba(45, 212, 191, 0.15)" strokeWidth="0.5" />
                <line x1="60" y1="0" x2="30" y2="30" stroke="rgba(45, 212, 191, 0.15)" strokeWidth="0.5" />
                <line x1="0" y1="60" x2="30" y2="30" stroke="rgba(45, 212, 191, 0.15)" strokeWidth="0.5" />
                <line x1="60" y1="60" x2="30" y2="30" stroke="rgba(45, 212, 191, 0.15)" strokeWidth="0.5" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#constellation-grid)" />
          </svg>
        </div>

        {/* Header strip */}
        <div className="constellation-header relative z-10 border-b border-dashed border-white/10 px-5 py-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              {/* Orbiting node decorations */}
              <div className="constellation-orbit relative h-5 w-5">
                <motion.div
                  className="absolute inset-0 rounded-full"
                  animate={reduced ? undefined : { rotate: 360 }}
                  transition={{ duration: 12, repeat: Infinity, ease: "linear" }}
                >
                  <svg viewBox="0 0 20 20" className="h-5 w-5">
                    <circle cx="10" cy="10" r="2" fill="#2dd4bf" opacity="0.6" />
                    <circle cx="10" cy="10" r="6" fill="none" stroke="rgba(45, 212, 191, 0.3)" strokeWidth="0.5" strokeDasharray="2 3" />
                  </svg>
                </motion.div>
              </div>

              <div>
                <span className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.22em] text-emerald-400">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.9)]" />
                  Exam hall · entry pass
                </span>
                <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--text-muted)]">
                  {serial}
                </p>
              </div>
            </div>

            {/* Decorative constellation symbol */}
            <svg viewBox="0 0 24 24" className="h-6 w-6 opacity-40" aria-hidden="true">
              <circle cx="12" cy="12" r="3" fill="none" stroke="rgba(45, 212, 191, 0.6)" strokeWidth="1" />
              <circle cx="12" cy="4" r="1.5" fill="#2dd4bf" />
              <circle cx="4" cy="8" r="1.5" fill="#2dd4bf" />
              <circle cx="20" cy="8" r="1.5" fill="#2dd4bf" />
              <circle cx="12" cy="20" r="1.5" fill="#2dd4bf" />
              <line x1="12" y1="12" x2="12" y2="4" stroke="rgba(45, 212, 191, 0.4)" strokeWidth="0.5" />
              <line x1="12" y1="12" x2="4" y2="8" stroke="rgba(45, 212, 191, 0.4)" strokeWidth="0.5" />
              <line x1="12" y1="12" x2="20" y2="8" stroke="rgba(45, 212, 191, 0.4)" strokeWidth="0.5" />
              <line x1="12" y1="12" x2="12" y2="20" stroke="rgba(45, 212, 191, 0.4)" strokeWidth="0.5" />
            </svg>
          </div>
        </div>

        {/* Form content area with constellation connections */}
        <div className="constellation-content relative z-10 px-5 py-5 sm:px-7 sm:py-6">
          {/* Vertical constellation spine */}
          <div className="constellation-spine pointer-events-none absolute left-1/2 top-0 h-full -translate-x-1/2" aria-hidden="true">
            <div className="constellation-spine-line absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-gradient-to-b from-transparent via-[rgba(45,212,191,0.2)] to-transparent" />
            <div className="constellation-spine-glow absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-gradient-to-b from-transparent via-[rgba(45,212,191,0.1)] to-transparent blur-sm" />
          </div>

          {/* Fields container */}
          <div className="constellation-nodes relative flex flex-col gap-5">
            {children}
          </div>

          {/* Hub node at bottom */}
          {showHub && (
            <div className="constellation-hub mt-6 flex flex-col items-center">
              {/* Hub connection lines */}
              <div className="constellation-hub-lines relative h-8 w-full" aria-hidden="true">
                <div className="constellation-hub-line absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-gradient-to-b from-[rgba(45,212,191,0.3)] to-transparent" />
                <motion.div
                  className="constellation-hub-node absolute left-1/2 top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full"
                  animate={
                    reduced
                      ? undefined
                      : hubActive
                      ? {
                          scale: [1, 1.4, 1],
                          boxShadow: [
                            "0 0 8px rgba(45, 212, 191, 0.4)",
                            "0 0 20px rgba(45, 212, 191, 0.8)",
                            "0 0 8px rgba(45, 212, 191, 0.4)",
                          ],
                        }
                      : undefined
                  }
                  transition={{ duration: 1.5, repeat: hubActive ? Infinity : 0 }}
                  style={{
                    backgroundColor: "#2dd4bf",
                    boxShadow: hubActive ? "0 0 12px rgba(45, 212, 191, 0.6)" : "0 0 6px rgba(45, 212, 191, 0.3)",
                  }}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Outer glow effect */}
      <div
        className="pointer-events-none absolute inset-0 rounded-3xl"
        style={{
          boxShadow: "0 0 60px rgba(45, 212, 191, 0.08), 0 0 120px rgba(45, 212, 191, 0.04)",
        }}
      />
    </motion.div>
  )
}

export function ConstellationHeader({ serial }: { serial: string }) {
  return (
    <div className="mb-4">
      <div className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.22em] text-emerald-400/80">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.9)]" />
          Exam hall · entry pass
        </span>
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--text-muted)]">
          {serial}
        </span>
      </div>
      <div className="mt-3 h-px w-full bg-gradient-to-r from-transparent via-[var(--border-muted)] to-transparent" />
    </div>
  )
}
