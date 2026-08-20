"use client"

import { motion } from "framer-motion"
import type { ReactNode } from "react"

// Deterministic ember field (seeded by index) — drifting light motes that make
// the room feel alive. Only opacity/transform, GPU-friendly.
const EMBERS = Array.from({ length: 18 }, (_, i) => {
  const seed = ((i * 7919) % 1000) / 1000
  return {
    id: i,
    left: `${8 + ((i * 53) % 84)}%`,
    size: 2 + (i % 3),
    duration: 8 + ((i * 37) % 9),
    delay: -(i * 1.3),
    drift: (seed - 0.5) * 44,
    opacity: 0.25 + ((i * 13) % 30) / 100,
  }
})

// The cinematic room: a dark scrim lifts as the lamp turns on, warm light
// blooms upward, and ambient aurora blobs + embers float behind a holographic
// floor grid. All animation is opacity/transform only (GPU-friendly).
export function AuthEnvironment({ lit, children }: { lit: boolean; children: ReactNode }) {
  return (
    <div className="relative min-h-dvh overflow-hidden">
      <motion.div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-0 bg-[#04060c]"
        initial={{ opacity: 0.84 }}
        animate={{ opacity: lit ? 0 : 0.84 }}
        transition={{ duration: 0.8, ease: "easeInOut" }}
      />
      <motion.div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-[8%] z-0 h-[80vh]"
        initial={{ opacity: 0, scale: 0.7 }}
        animate={{ opacity: lit ? 1 : 0, scale: lit ? 1 : 0.7 }}
        transition={{ duration: 1, ease: "easeOut" }}
        style={{
          background: "radial-gradient(closest-side, rgba(251,191,36,0.16), transparent 72%)",
        }}
      />

      {/* Ambient aurora blobs */}
      <div
        aria-hidden="true"
        className="aurora-blob"
        style={{
          left: "-12%",
          top: "-8%",
          width: 430,
          height: 430,
          background: "radial-gradient(circle, rgba(16,185,129,0.16), transparent 66%)",
        }}
      />
      <div
        aria-hidden="true"
        className="aurora-blob"
        style={{
          right: "-10%",
          top: "16%",
          width: 400,
          height: 400,
          background: "radial-gradient(circle, rgba(99,102,241,0.13), transparent 66%)",
          animationDelay: "-6s",
        }}
      />
      <div
        aria-hidden="true"
        className="aurora-blob"
        style={{
          left: "18%",
          bottom: "-12%",
          width: 340,
          height: 340,
          background: "radial-gradient(circle, rgba(34,211,238,0.12), transparent 64%)",
          animationDelay: "-11s",
        }}
      />

      {/* Ember motes */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-0">
        {EMBERS.map((e) => (
          <span
            key={e.id}
            className="ember"
            style={{
              left: e.left,
              width: e.size,
              height: e.size,
              backgroundColor: e.id % 3 === 0 ? "#22d3ee" : "#34d399",
              boxShadow: `0 0 ${e.size * 3}px ${e.id % 3 === 0 ? "#22d3ee" : "#34d399"}`,
              ["--ember-duration" as string]: `${e.duration}s`,
              ["--ember-delay" as string]: `${e.delay}s`,
              ["--ember-drift" as string]: `${e.drift}px`,
              ["--ember-opacity" as string]: e.opacity,
            }}
          />
        ))}
      </div>

      {/* Holographic floor grid */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 z-0 h-44 opacity-50"
        style={{
          background:
            "linear-gradient(to top, rgba(16,185,129,0.10), transparent 70%)," +
            "linear-gradient(rgb(148 163 184 / 0.06) 1px, transparent 1px)," +
            "linear-gradient(90deg, rgb(148 163 184 / 0.06) 1px, transparent 1px)",
          backgroundSize: "auto, 44px 44px, 44px 44px",
          maskImage: "linear-gradient(to top, black, transparent)",
          WebkitMaskImage: "linear-gradient(to top, black, transparent)",
        }}
      />

      <div className="relative z-10">{children}</div>
    </div>
  )
}
