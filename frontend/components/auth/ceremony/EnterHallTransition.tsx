"use client"

import { useEffect } from "react"
import { motion, useReducedMotion } from "framer-motion"

/**
 * "Enter the hall" — the departure transition.
 *
 * A short forward push: warm light expands from the center of the room,
 * the authentication world dissolves, then navigation happens. Total dwell
 * is ~850ms (250ms reduced) so the dashboard arrives fast.
 */
export function EnterHallTransition({ onNavigate }: { onNavigate: () => void }) {
  const reduced = useReducedMotion() ?? false
  const dwell = reduced ? 250 : 850

  useEffect(() => {
    const t = window.setTimeout(onNavigate, dwell)
    return () => window.clearTimeout(t)
  }, [dwell, onNavigate])

  return (
    <motion.div
      aria-hidden="true"
      className="fixed inset-0 z-[80] flex items-center justify-center overflow-hidden"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: reduced ? 0.2 : 0.3 }}
    >
      {/* Expanding hall light */}
      <motion.div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(circle at 50% 46%, rgba(251,191,36,0.30), rgba(4,6,12,0.96) 62%)",
        }}
        initial={reduced ? { opacity: 0.6 } : { scale: 0.35, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={reduced ? { duration: 0.25 } : { duration: 0.75, ease: [0.22, 1, 0.36, 1] }}
      />
      {!reduced && (
        <motion.p
          className="relative font-mono text-[11px] uppercase tracking-[0.34em] text-amber-200/90"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: [0, 1, 1], y: 0 }}
          transition={{ duration: 0.7, delay: 0.15 }}
        >
          Entering the hall
        </motion.p>
      )}
    </motion.div>
  )
}
