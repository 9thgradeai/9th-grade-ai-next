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
  Sparkle,
  UNIT9_GRADIENTS,
  paletteFor,
} from "./Unit9Face"

/**
 * UNIT-9 — the product's robotic companion.
 *
 * The head IS the brand mark: a rounded tile wearing the signature
 * emerald→cyan gradient bezel with the brand constellation engraved on its
 * chin, wrapped around a dark
 * LED visor where every expression plays out. The chest carries the ⌁ energy
 * mark from the header logo; an antenna telegraphs system status.
 *
 * Reactivity map (all derived from the auth stage machine):
 *  - boots with a one-time visor scanline when it first wakes
 *  - natural randomized blinking while its eyes are open
 *  - gazes toward the focused field; a privacy LED lights on password focus
 *  - nods on each keystroke (`tick`) and blips the chest core
 *  - mouth becomes an equalizer while checking the register (loading)
 *  - error → visor glitch shudder + red LEDs; strength moods retune LED hues
 *  - success → visor light sweep, happy arcs, waving gripper, sparkles
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
  const bodyControls = useAnimationControls()

  const containerRef = useRef<HTMLDivElement>(null)
  // Pointer attention — springs keep the lean physical; never a re-render.
  const rawGazeX = useMotionValue(0)
  const rawGazeY = useMotionValue(0)
  const gazeSpring = { stiffness: 90, damping: 18 }
  const gazeX = useSpring(rawGazeX, gazeSpring)
  const gazeY = useSpring(rawGazeY, gazeSpring)
  const pointerGaze =
    !reduced && quality !== "low" && quality !== "medium" && behavior !== "departing"
  const faceX = useTransform(gazeX, (v) => v * (behavior === "observing" ? 2.4 : 1.6))
  const faceY = useTransform(gazeY, (v) => v * 1.6)

  const palette = paletteFor(mood)
  const lean = focusLean(focusField)
  const gaze = cfg.expression.gaze ?? lean?.gaze
  const tilt = (cfg.headTilt ?? 0) + (lean?.tilt ?? 0)

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

  // Natural randomized blinking — organic machines blink; so do well-built ones.
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

  // Keystroke response: quick nod + core blip.
  useEffect(() => {
    if (!tick || tick <= 0 || reduced) return
    void headControls.start({
      y: [0, -4, 0],
      rotate: [tilt, tilt + 2, tilt],
      transition: { duration: 0.28, ease: "easeInOut" },
    })
    void bodyControls.start({
      scale: [1, 1.02, 1],
      transition: { duration: 0.24 },
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick])
  // Error glitch — a hard little shudder, like a failed handshake.
  useEffect(() => {
    if (mood === "error" && !reduced) {
      void headControls.start({
        x: [0, -4, 4, -2.5, 2.5, 0],
        transition: { duration: 0.38, ease: "easeInOut" },
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mood])

  // Departing: the unit turns toward the hall and settles.
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

  // Pointer attention — the whole face leans a couple of pixels toward the
  // cursor (MotionValues; zero re-renders while tracking).
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!pointerGaze) return
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return
    gazeX.set(((e.clientX - rect.left) / rect.width - 0.5) * 2)
    gazeY.set(((e.clientY - rect.top) / rect.height - 0.5) * 2)
  }

  const effectiveEyes: EyeKind =
    blink && cfg.expression.eyes === "open" ? "closed" : cfg.expression.eyes
  const loading = mood === "loading"
  const privacyOn = focusField === "password" || focusField === "confirm"

  return (
    <div
      ref={containerRef}
      onPointerMove={onPointerMove}
      onPointerLeave={() => {
        gazeX.set(0)
        gazeY.set(0)
      }}
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
        {/* Hover bob only at ultra quality — alive, never distracting */}
        <motion.div
          animate={quality === "ultra" && !reduced ? { y: [0, -4, 0] } : undefined}
          transition={{ duration: 4.4, repeat: Infinity, ease: "easeInOut" }}
          className={`relative ${compact ? "h-24 w-24 md:h-40 md:w-40" : "h-40 w-40 sm:h-52 sm:w-52"}`}
        >
          <svg
            viewBox="0 0 240 264"
            className="h-full w-full"
            role="img"
            aria-label="A friendly companion guiding you through sign in"
          >
            {UNIT9_GRADIENTS}

            <circle cx="120" cy="104" r="104" fill="url(#unit9-halo)" />

            {/* Rotating HUD ring */}
            <g className="hud-ring">
              <ellipse
                cx="120"
                cy="106"
                rx="94"
                ry="102"
                fill="none"
                stroke="url(#unit9-bezel)"
                strokeWidth="1.6"
                strokeDasharray="6 12"
                opacity="0.5"
              />
            </g>

            <ellipse cx="120" cy="252" rx="62" ry="8" fill="#04060c" opacity="0.45" />

            {/* ── Chassis ── */}
            <motion.g animate={bodyControls} style={{ transformOrigin: "120px 216px" }}>
              <path
                d="M 74 264 L 74 236 C 74 210 92 196 120 196 C 148 196 166 210 166 236 L 166 264 Z"
                fill="url(#unit9-chassis)"
                stroke="#1f2b44"
                strokeWidth="1.5"
              />
              {/* Shoulder pods */}
              <rect x="58" y="212" width="18" height="30" rx="8" fill="#101a30" stroke="#1f2b44" strokeWidth="1.4" />
              <rect x="164" y="212" width="18" height="30" rx="8" fill="#101a30" stroke="#1f2b44" strokeWidth="1.4" />

              {/* Chest core — the ⌁ energy mark from the logo */}
              <circle cx="120" cy="228" r="17" fill="#050a14" stroke="#1f2b44" strokeWidth="1.4" />
              {loading && (
                <circle
                  cx="120"
                  cy="228"
                  r="17"
                  fill="none"
                  stroke={palette.alert}
                  strokeWidth="2"
                  strokeDasharray="10 80"
                  strokeLinecap="round"
                  className="hud-ring"
                />
              )}
              <polyline
                points="110,228 116,228 119,220 123,236 126,228 130,228"
                fill="none"
                stroke={palette.alert}
                strokeWidth={2.6}
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ filter: `drop-shadow(0 0 4px ${palette.alert})` }}
              />
            </motion.g>

            {/* Neck servo */}
            <rect x="104" y="176" width="32" height="22" rx="8" fill="#0c1526" stroke="#1f2b44" strokeWidth="1.4" />
            <rect x="108" y="181" width="24" height="3" rx="1.5" fill="#1f2b44" />
            <rect x="108" y="188" width="24" height="3" rx="1.5" fill="#1f2b44" />

            {/* ── Head group: THE LOGO TILE ── */}
            <motion.g animate={headControls} style={{ transformOrigin: "120px 106px" }}>
              {/* Antenna */}
              <rect x="117" y="16" width="6" height="22" rx="3" fill="#1f2b44" />
              <motion.circle
                cx="120"
                cy="14"
                r="6"
                fill={loading || mood === "error" ? palette.alert : BEZEL_A}
                animate={
                  reduced
                    ? undefined
                    : loading || mood === "error"
                      ? { opacity: [1, 0.25, 1] }
                      : { opacity: [0.9, 0.55, 0.9] }
                }
                transition={{
                  duration: loading || mood === "error" ? 0.7 : 2.6,
                  repeat: Infinity,
                  ease: "easeInOut",
                }}
                style={{
                  filter: `drop-shadow(0 0 6px ${loading || mood === "error" ? palette.alert : BEZEL_A})`,
                }}
              />

              {/* Logo bezel */}
              <rect x="54" y="36" width="132" height="140" rx="30" fill="url(#unit9-bezel)" />
              <rect
                x="54"
                y="36"
                width="132"
                height="140"
                rx="30"
                fill="none"
                stroke="#eafffb"
                strokeOpacity={0.35}
                strokeWidth={1.5}
              />

              {/* Visor screen */}
              <rect x="64" y="58" width="112" height="96" rx="18" fill="url(#unit9-visor)" />
              <rect
                x="64"
                y="58"
                width="112"
                height="96"
                rx="18"
                fill="none"
                stroke="#04101c"
                strokeWidth="2"
              />

              {/* Official brand mark, engraved in white on the bezel chin */}
              <g opacity="0.95" stroke="#eafffb" fill="none">
                <circle cx="120" cy="161" r="5.4" strokeWidth="1.1" />
                <g strokeWidth="0.6" opacity="0.7">
                  <line x1="120" y1="161" x2="120" y2="155.6" />
                  <line x1="120" y1="161" x2="114.6" y2="158.3" />
                  <line x1="120" y1="161" x2="125.4" y2="158.3" />
                  <line x1="120" y1="161" x2="120" y2="166.4" />
                </g>
                <g fill="#eafffb" stroke="none">
                  <circle cx="120" cy="161" r="1.5" />
                  <circle cx="120" cy="155.6" r="0.9" />
                  <circle cx="114.6" cy="158.3" r="0.9" />
                  <circle cx="125.4" cy="158.3" r="0.9" />
                  <circle cx="120" cy="166.4" r="0.9" />
                </g>
              </g>

              {/* Face — keyed by mood so expressions cross-fade */}
              <motion.g
                key={mood}
                className="avatar-face-fade"
                style={pointerGaze ? { x: faceX, y: faceY } : undefined}
              >
                <LedBrow kind={cfg.expression.brows} cx={94} cy={74} color={palette.led} />
                <LedBrow kind={cfg.expression.brows} cx={146} cy={74} color={palette.led} />
                <g className={effectiveEyes === "open" ? "avatar-blink" : undefined}>
                  <LedEye cx={94} cy={96} kind={effectiveEyes} gaze={gaze} color={palette.led} />
                  <LedEye cx={146} cy={96} kind={effectiveEyes} gaze={gaze} color={palette.led} />
                </g>
                {cfg.expression.blush && (
                  <g>
                    <circle cx="78" cy="118" r="3.5" fill={BEZEL_B} opacity="0.35" />
                    <circle cx="162" cy="118" r="3.5" fill={BEZEL_B} opacity="0.35" />
                  </g>
                )}
                <LedMouth kind={cfg.expression.mouth} color={palette.led} loading={loading} />
              </motion.g>

              {/* Privacy indicator — lit while a password field has focus */}
              {privacyOn && (
                <g>
                  <rect x="152" y="64" width="18" height="10" rx="5" fill="#fbbf24" opacity="0.16" />
                  <circle cx="161" cy="69" r="2.6" fill="#fbbf24">
                    <animate attributeName="opacity" values="1;0.35;1" dur="1.8s" repeatCount="indefinite" />
                  </circle>
                </g>
              )}

              {/* Boot scanline — one sweep when the unit powers on */}
              {booting && (
                <motion.rect
                  x="64"
                  width="112"
                  height="10"
                  rx="5"
                  fill={BEZEL_B}
                  opacity="0.28"
                  initial={{ y: 60 }}
                  animate={{ y: 144 }}
                  transition={{ duration: 0.8, ease: "easeOut" }}
                />
              )}

              {/* Success light-sweep across the visor */}
              {(mood === "success" || mood === "celebrating") && !reduced && (
                <motion.rect
                  x="-30"
                  y="58"
                  width="26"
                  height="96"
                  fill="#eafffb"
                  opacity="0.14"
                  initial={{ x: -30 }}
                  animate={{ x: 190 }}
                  transition={{ duration: 0.9, delay: 0.15, ease: "easeInOut" }}
                />
              )}
            </motion.g>

            {/* Waving gripper on success */}
            {cfg.wave && (
              <motion.g
                initial={{ rotate: 12, opacity: 0 }}
                animate={{ rotate: [-40, -50, -40, -50, -40, -50, -40], opacity: 1 }}
                transition={{ duration: 1.9, ease: "easeInOut" }}
                style={{ transformOrigin: "62px 216px" }}
              >
                <rect x="46" y="188" width="13" height="34" rx="6.5" fill="#101a30" stroke="#1f2b44" strokeWidth="1.4" />
                <circle cx="52.5" cy="184" r="7.5" fill={BEZEL_A} opacity="0.9" />
              </motion.g>
            )}

            {cfg.sparkle && (
              <g>
                <Sparkle x={40} y={48} />
                <Sparkle x={198} y={84} delay={0.5} />
                <Sparkle x={32} y={148} delay={0.9} />
              </g>
            )}
          </svg>
        </motion.div>
      </motion.div>
    </div>
  )
}

export default Avatar
