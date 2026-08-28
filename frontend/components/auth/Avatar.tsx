"use client"

import { useEffect, useRef, useState } from "react"
import {
  motion,
  useAnimationControls,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
} from "framer-motion"
import {
  avatarStates,
  focusLean,
  type AuthAvatarState,
  type EyeKind,
  type FocusField,
} from "./auth-state"
import type { Unit9Behavior } from "./animation/AnimationDirector"
import { detectVisualQuality } from "@/lib/motion/device"
import {
  BEZEL_A,
  BEZEL_B,
  LedBrow,
  LedEye,
  LedMouth,
  UNIT9_GRADIENTS,
  paletteFor,
} from "./Unit9Face"

/**
 * ORACLE-9 — the product's living sigil.
 *
 * No longer a static robot tile: it is a floating crest of light that reads
 * as the exam hall's keeper. A shield-bezel frames a glowing visor; a ring of
 * orbiting knowledge nodes circles it; an aura breathes behind. Every state
 * of the auth journey reshapes it:
 *   - boots with a one-time scanline sweep across the visor
 *   - natural randomized blinking while eyes are open
 *   - the whole face + pupils track the cursor (pointer parallax, zero re-render)
 *   - each keystroke emits a ripple ring and pulses the nodes
 *   - focused field → the nearest node ignites; a privacy shutter drops on passwords
 *   - loading → the mouth becomes a live equalizer and the core ring spins
 *   - error → aura + rings flush red and shudder like a failed handshake
 *   - success → nodes burst outward, rings accelerate, sparkles rain
 */
export function Avatar({
  mood,
  focusField,
  tick,
  compact = false,
  behavior = "idle",
}: {
  mood: AuthAvatarState
  focusField?: FocusField
  tick?: number
  compact?: boolean
  /** Behavioral hint from the Animation Director (gaze/departure nuance). */
  behavior?: Unit9Behavior
}) {
  const cfg = avatarStates[mood]
  const reduced = useReducedMotion() ?? false
  const quality = detectVisualQuality()
  const headControls = useAnimationControls()

  const containerRef = useRef<HTMLDivElement>(null)
  const [hovered, setHovered] = useState(false)

  // Pointer attention — springs keep the lean physical; never a re-render.
  const rawGazeX = useMotionValue(0)
  const rawGazeY = useMotionValue(0)
  const gazeSpring = { stiffness: 90, damping: 18 }
  const gazeX = useSpring(rawGazeX, gazeSpring)
  const gazeY = useSpring(rawGazeY, gazeSpring)
  const pointerGaze =
    !reduced && quality !== "low" && quality !== "medium" && behavior !== "departing"
  const faceX = useTransform(gazeX, (v) => v * (behavior === "observing" ? 3.2 : 2.2))
  const faceY = useTransform(gazeY, (v) => v * 2.2)
  // A second, subtler parallax layer (the visor core) for depth.
  const coreX = useTransform(gazeX, (v) => v * 5.5)
  const coreY = useTransform(gazeY, (v) => v * 5.5)

  const palette = paletteFor(mood)
  const lean = focusLean(focusField)
  const gaze = cfg.expression.gaze ?? lean?.gaze
  const tilt = (cfg.headTilt ?? 0) + (lean?.tilt ?? 0)
  const danger = mood === "error"
  const winning = mood === "success" || mood === "celebrating"
  const loading = mood === "loading"

  const [blink, setBlink] = useState(false)
  const bootedRef = useRef(false)
  const [booting, setBooting] = useState(false)

  // One-time power-on: visor scanline sweeps the first time the unit wakes.
  useEffect(() => {
    if (mood === "hidden" || bootedRef.current) return
    bootedRef.current = true
    if (!reduced) {
      const raf = requestAnimationFrame(() => setBooting(true))
      const t = window.setTimeout(() => setBooting(false), 950)
      return () => {
        cancelAnimationFrame(raf)
        window.clearTimeout(t)
      }
    }
  }, [mood, reduced])

  // Natural randomized blinking.
  useEffect(() => {
    if (reduced || cfg.expression.eyes !== "open") return
    let hideTimer: number
    let scheduleTimer: number
    const schedule = () => {
      scheduleTimer = window.setTimeout(() => {
        setBlink(true)
        hideTimer = window.setTimeout(() => {
          setBlink(false)
          schedule()
        }, 130)
      }, 2600 + Math.random() * 2400)
    }
    schedule()
    return () => {
      window.clearTimeout(scheduleTimer)
      window.clearTimeout(hideTimer)
    }
  }, [reduced, cfg.expression.eyes])

  // Keystroke response: a subtle nod on password fields only.
  useEffect(() => {
    if (!tick || tick <= 0 || reduced) return
    const isPassword = focusField === "password" || focusField === "confirm"
    if (!isPassword) return
    void headControls.start({
      y: [0, -4, 0],
      rotate: [tilt, tilt + 2, tilt],
      transition: { duration: 0.28, ease: "easeInOut" },
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick])

  // Error glitch — a hard little shudder.
  useEffect(() => {
    if (danger && !reduced) {
      void headControls.start({
        x: [0, -4, 4, -2.5, 2.5, 0],
        transition: { duration: 0.38, ease: "easeInOut" },
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mood])

  // Departing: settle toward the hall.
  useEffect(() => {
    if (behavior === "departing" && !reduced) {
      void headControls.start({
        rotate: [tilt, tilt + 7],
        x: [0, 8],
        transition: { duration: 0.6, ease: "easeInOut" },
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [behavior])

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!pointerGaze) return
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return
    gazeX.set(((e.clientX - rect.left) / rect.width - 0.5) * 2)
    gazeY.set(((e.clientY - rect.top) / rect.height - 0.5) * 2)
  }

  const effectiveEyes: EyeKind =
    blink && cfg.expression.eyes === "open" ? "closed" : cfg.expression.eyes
  const privacyOn = focusField === "password" || focusField === "confirm"

  // Orbit nodes — fixed angles, the group spins (cheap, GPU transform).
  const NODES = [0, 1, 2, 3, 4, 5].map((i) => {
    const a = (i * Math.PI) / 3
    return { x: 120 + 108 * Math.cos(a), y: 120 + 108 * Math.sin(a), i }
  })
  const ringDuration = winning ? 6 : loading ? 3.4 : hovered ? 9 : 15
  const nodeRingDuration = winning ? 3.4 : hovered ? 6 : 11

  const size = compact ? (quality === "ultra" ? "h-28 w-28" : "h-24 w-24") : "h-44 w-44 sm:h-56 sm:w-56"

  return (
    <div
      ref={containerRef}
      onPointerMove={onPointerMove}
      onPointerLeave={() => {
        gazeX.set(0)
        gazeY.set(0)
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="relative flex items-center justify-center"
    >
      <motion.div
        initial={{ opacity: 0, y: 18, scale: 0.9 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{
          opacity: { duration: 0.55, ease: "easeOut" },
          y: { duration: 0.55 },
          scale: { duration: 0.55 },
        }}
        className="relative"
      >
        <motion.div
          animate={quality === "ultra" && !reduced ? { y: [0, -5, 0] } : undefined}
          transition={{ duration: 4.4, repeat: Infinity, ease: "easeInOut" }}
          className={`relative ${size}`}
        >
          <svg viewBox="0 0 240 240" className="h-full w-full" role="img" aria-label="A friendly companion guiding you through sign in">
            {UNIT9_GRADIENTS}

            {/* Reactive aura — breathes, flushes with mood */}
            <motion.circle
              cx="120"
              cy="120"
              r="116"
              fill="url(#unit9-halo)"
              animate={
                reduced
                  ? undefined
                  : {
                      opacity: [danger ? 0.5 : 0.32, danger ? 0.78 : winning ? 0.62 : 0.46, danger ? 0.5 : 0.32],
                      scale: [1, danger ? 1.04 : 1.03, 1],
                    }
              }
              transition={{ duration: danger ? 1.1 : winning ? 1.6 : 3.6, repeat: Infinity, ease: "easeInOut" }}
              style={{ transformOrigin: "120px 120px", filter: `drop-shadow(0 0 26px ${palette.led})` }}
            />

            {/* Outer rotating ring */}
            <ellipse
              cx="120"
              cy="120"
              rx="110"
              ry="110"
              fill="none"
              stroke="url(#unit9-bezel)"
              strokeWidth="1.4"
              strokeDasharray="3 14"
              opacity={danger ? 0.7 : 0.55}
              className="hud-ring"
              style={{ transformOrigin: "120px 120px", animationDuration: `${ringDuration}s`, filter: `drop-shadow(0 0 4px ${palette.led})` }}
            />

            {/* Orbiting knowledge nodes */}
            <g className="hud-ring" style={{ transformOrigin: "120px 120px", animationDuration: `${nodeRingDuration}s` }}>
              {NODES.map((n) => (
                <motion.circle
                  key={n.i}
                  cx={n.x}
                  cy={n.y}
                  r={winning ? 5 : 3.6}
                  fill={palette.led}
                  animate={danger && !reduced ? { opacity: [1, 0.3, 1] } : { opacity: 1 }}
                  transition={{ duration: 0.7, repeat: danger ? Infinity : 0, ease: "easeInOut" }}
                  style={{ filter: `drop-shadow(0 0 6px ${palette.led})` }}
                />
              ))}
            </g>

            {/* ── Shield crest headframe ── */}
            <motion.g animate={headControls} style={{ transformOrigin: "120px 128px" }}>
              {/* Antenna sigil */}
              <rect x="117" y="14" width="6" height="22" rx="3" fill="#1f2b44" />
              <motion.circle
                cx="120"
                cy="12"
                r="6"
                fill={loading || danger ? palette.alert : BEZEL_A}
                animate={reduced ? undefined : loading || danger ? { opacity: [1, 0.25, 1] } : { opacity: [0.9, 0.55, 0.9] }}
                transition={{ duration: loading || danger ? 0.7 : 2.6, repeat: Infinity, ease: "easeInOut" }}
                style={{ filter: `drop-shadow(0 0 6px ${loading || danger ? palette.alert : BEZEL_A})` }}
              />

              {/* Crest body */}
              <path
                d="M 66 58 L 174 58 Q 184 58 184 70 L 184 122 C 184 162 154 190 120 210 C 86 190 56 162 56 122 L 56 70 Q 56 58 66 58 Z"
                fill="url(#unit9-chassis)"
                stroke="url(#unit9-bezel)"
                strokeWidth="3"
                style={{ filter: `drop-shadow(0 0 14px ${palette.led}66)` }}
              />
              <path
                d="M 66 58 L 174 58 Q 184 58 184 70 L 184 122 C 184 162 154 190 120 210 C 86 190 56 162 56 122 L 56 70 Q 56 58 66 58 Z"
                fill="none"
                stroke="#eafffb"
                strokeOpacity={0.22}
                strokeWidth={1}
              />

              {/* Visor */}
              <rect x="66" y="66" width="108" height="104" rx="20" fill="url(#unit9-visor)" />
              <rect x="66" y="66" width="108" height="104" rx="20" fill="none" stroke="#04101c" strokeWidth="2" />

              {/* Engraved brand mark on the crest chin */}
              <g opacity="0.92" stroke="#eafffb" fill="none">
                <circle cx="120" cy="180" r="5" strokeWidth="1.1" />
                <g strokeWidth="0.6" opacity="0.7">
                  <line x1="120" y1="180" x2="120" y2="174.8" />
                  <line x1="120" y1="180" x2="114.8" y2="177.2" />
                  <line x1="120" y1="180" x2="125.2" y2="177.2" />
                  <line x1="120" y1="180" x2="120" y2="185.2" />
                </g>
                <g fill="#eafffb" stroke="none">
                  <circle cx="120" cy="180" r="1.5" />
                  <circle cx="120" cy="174.8" r="0.9" />
                  <circle cx="114.8" cy="177.2" r="0.9" />
                  <circle cx="125.2" cy="177.2" r="0.9" />
                  <circle cx="120" cy="185.2" r="0.9" />
                </g>
              </g>

              {/* Face — keyed by mood so expressions cross-fade; tracks pointer */}
              <motion.g key={mood} className="avatar-face-fade" style={pointerGaze ? { x: faceX, y: faceY } : undefined}>
                <LedBrow kind={cfg.expression.brows} cx={94} cy={86} color={palette.led} />
                <LedBrow kind={cfg.expression.brows} cx={146} cy={86} color={palette.led} />
                <g className={effectiveEyes === "open" ? "avatar-blink" : undefined}>
                  <LedEye cx={94} cy={108} kind={effectiveEyes} gaze={gaze} color={palette.led} />
                  <LedEye cx={146} cy={108} kind={effectiveEyes} gaze={gaze} color={palette.led} />
                </g>
                {cfg.expression.blush && (
                  <g>
                    <circle cx="78" cy="130" r="3.5" fill={BEZEL_B} opacity="0.35" />
                    <circle cx="162" cy="130" r="3.5" fill={BEZEL_B} opacity="0.35" />
                  </g>
                )}
                <LedMouth kind={cfg.expression.mouth} color={palette.led} loading={loading} />
              </motion.g>

              {/* Visor core — a second parallax layer that also tracks the pointer */}
              <motion.circle
                cx="120"
                cy="120"
                r="9"
                fill="none"
                stroke={palette.led}
                strokeWidth="1.4"
                opacity="0.5"
                style={pointerGaze ? { x: coreX, y: coreY } : undefined}
              />

              {/* Privacy shutter while a password field is focused */}
              {privacyOn && (
                <g>
                  <rect x="150" y="72" width="20" height="11" rx="5.5" fill="#fbbf24" opacity="0.16" />
                  <circle cx="160" cy="77.5" r="2.6" fill="#fbbf24">
                    <animate attributeName="opacity" values="1;0.35;1" dur="1.8s" repeatCount="indefinite" />
                  </circle>
                </g>
              )}

              {/* Boot scanline */}
              {booting && (
                <motion.rect
                  x="66"
                  width="108"
                  height="10"
                  rx="5"
                  fill={BEZEL_B}
                  opacity="0.28"
                  initial={{ y: 68 }}
                  animate={{ y: 160 }}
                  transition={{ duration: 0.8, ease: "easeOut" }}
                />
              )}

              {/* Success light-sweep across the visor */}
              {winning && !reduced && (
                <motion.rect
                  x="-30"
                  y="66"
                  width="26"
                  height="104"
                  fill="#eafffb"
                  opacity="0.14"
                  initial={{ x: -30 }}
                  animate={{ x: 196 }}
                  transition={{ duration: 0.9, delay: 0.15, ease: "easeInOut" }}
                />
              )}
            </motion.g>

          </svg>
        </motion.div>
      </motion.div>
    </div>
  )
}

export default Avatar
