"use client"

import { useEffect, type ReactNode } from "react"
import { motion } from "framer-motion"
import {
  EMBER_BUDGET,
  type AuthEnvironmentState,
} from "./animation/AnimationDirector"
import { useVisualQuality, type VisualQuality } from "@/lib/motion/device"

// Deterministic ember field (seeded by index) — drifting light motes that make
// the room feel alive. Only opacity/transform, GPU-friendly. The rendered
// count is clamped by the quality governor and the current scene state.
const EMBER_POOL = Array.from({ length: 12 }, (_, i) => {
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

const EMBER_BASE_COUNT: Record<VisualQuality, number> = {
  ultra: 12,
  high: 8,
  medium: 6,
  low: 3,
  reduced: 0,
}

/** Per-state lighting values — the room never jumps, it eases. */
const SCENE: Record<
  AuthEnvironmentState,
  { scrim: number; moonlight: number; vignette: number; bloom: number; bloomScale: number }
> = {
  dark: { scrim: 0.84, moonlight: 0.9, vignette: 0.85, bloom: 0, bloomScale: 0.7 },
  awakening: { scrim: 0.4, moonlight: 0.3, vignette: 0.5, bloom: 0.65, bloomScale: 0.92 },
  ready: { scrim: 0, moonlight: 0, vignette: 0.3, bloom: 1, bloomScale: 1 },
  choice: { scrim: 0, moonlight: 0, vignette: 0.34, bloom: 1, bloomScale: 1 },
  focused: { scrim: 0, moonlight: 0, vignette: 0.42, bloom: 0.8, bloomScale: 1 },
  verifying: { scrim: 0, moonlight: 0, vignette: 0.26, bloom: 1.15, bloomScale: 1.05 },
  success: { scrim: 0, moonlight: 0, vignette: 0.2, bloom: 1.1, bloomScale: 1.04 },
  departure: { scrim: 0.25, moonlight: 0, vignette: 0.15, bloom: 1.2, bloomScale: 1.08 },
}

/**
 * The cinematic room. State-driven lighting: cold moonlight → warm desk
 * light → focused authentication light → verification glow → success
 * illumination. All layers are opacity/transform only; ambient CSS loops
 * pause when the tab is hidden.
 *
 * `quietLevel` (0-3) progressively quiets the environment as the user
 * engages with the form — fewer embers, dimmer bloom.
 */
export function AuthEnvironment({
  state,
  quietLevel = 0,
  children,
}: {
  state: AuthEnvironmentState
  quietLevel?: 0 | 1 | 2 | 3
  children: ReactNode
}) {
  const quality: VisualQuality = useVisualQuality()
  const s = SCENE[state]
  const ambientMotion = quality !== "reduced" && quality !== "low"

  // Quiet mode: reduce embers progressively
  const quietMultiplier = quietLevel === 0 ? 1 : quietLevel === 1 ? 0.7 : quietLevel === 2 ? 0.4 : 0.2
  const base = EMBER_BASE_COUNT[quality]
  const embers = base === 0 ? 0 : Math.max(0, Math.round(base * EMBER_BUDGET[state] * quietMultiplier))

  // Quiet mode: dim bloom slightly during focused states
  const bloomQuietOffset = quietLevel >= 2 ? -0.15 : quietLevel === 1 ? -0.05 : 0

  // Pause every decorative CSS loop while the tab is hidden (battery).
  useEffect(() => {
    const apply = () => {
      document.documentElement.dataset.appHidden =
        document.visibilityState === "hidden" ? "true" : "false"
    }
    apply()
    document.addEventListener("visibilitychange", apply)
    return () => {
      document.removeEventListener("visibilitychange", apply)
      delete document.documentElement.dataset.appHidden
    }
  }, [])

  return (
    <div className="relative min-h-dvh overflow-hidden">
      {/* Dark scrim — lifts as the room wakes */}
      <motion.div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-0 bg-[#04060c]"
        initial={{ opacity: SCENE.dark.scrim }}
        animate={{ opacity: s.scrim }}
        transition={{ duration: 0.8, ease: "easeInOut" }}
      />

      {/* Cold moonlight shaft — the only light before the lamp is on */}
      <motion.div
        aria-hidden="true"
        className="pointer-events-none absolute -top-[12%] left-[-6%] z-0 h-[75vh] w-[46vw] rotate-[24deg]"
        initial={{ opacity: SCENE.dark.moonlight }}
        animate={{ opacity: s.moonlight }}
        transition={{ duration: 0.9, ease: "easeInOut" }}
        style={{
          background:
            "linear-gradient(180deg, rgba(129,140,248,0.16), rgba(129,140,248,0.05) 55%, transparent 80%)",
          maskImage: "linear-gradient(180deg, black 40%, transparent)",
          WebkitMaskImage: "linear-gradient(180deg, black 40%, transparent)",
          filter: "blur(6px)",
        }}
      />

      {/* Cinematic vignette */}
      <motion.div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-0"
        initial={{ opacity: SCENE.dark.vignette }}
        animate={{ opacity: s.vignette }}
        transition={{ duration: 0.9, ease: "easeInOut" }}
        style={{
          background:
            "radial-gradient(ellipse 72% 60% at 50% 44%, transparent 42%, rgba(2,4,10,0.55) 78%, rgba(2,4,10,0.8))",
        }}
      />

      {/* Warm lamp bloom */}
      <motion.div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-[8%] z-0 h-[80vh]"
        initial={{ opacity: 0, scale: 0.7 }}
        animate={{ opacity: Math.max(0, s.bloom + bloomQuietOffset), scale: s.bloomScale }}
        transition={{ duration: 1, ease: "easeOut" }}
        style={{
          background: "radial-gradient(closest-side, rgba(251,191,36,0.16), transparent 72%)",
        }}
      />

      {/* Ember motes — density follows scene state × device quality */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-0">
        {EMBER_POOL.slice(0, embers).map((e) => (
          <span
            key={e.id}
            className="ember"
            style={{
              left: e.left,
              width: e.size,
              height: e.size,
              backgroundColor: "#34d399",
              boxShadow: `0 0 ${e.size * 3}px #34d399`,
              ["--ember-duration" as string]: `${e.duration}s`,
              ["--ember-delay" as string]: `${e.delay}s`,
              ["--ember-drift" as string]: `${e.drift}px`,
              ["--ember-opacity" as string]: e.opacity,
              animationName: ambientMotion ? undefined : "none",
              opacity: ambientMotion ? undefined : e.opacity * 0.5,
            }}
          />
        ))}
      </div>

      <div className="relative z-10">{children}</div>
    </div>
  )
}
