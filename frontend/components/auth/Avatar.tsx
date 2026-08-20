"use client"

import { useEffect } from "react"
import { motion, useAnimationControls, useReducedMotion } from "framer-motion"
import {
  avatarStates,
  focusLean,
  type AuthAvatarState,
  type BrowKind,
  type EyeKind,
  type FocusField,
  type Gaze,
  type MouthKind,
} from "./auth-state"

const SKIN_DARK = "#d9935a"
const LINE = "#5a2c14"
const IRIS = "#33200f"

const GAZE_OFFSET: Record<Gaze, [number, number]> = {
  left: [-3.5, 0],
  right: [3.5, 0],
  up: [0, -3],
  down: [0, 3],
}

function Eye({ kind, cx, cy, gaze }: { kind: EyeKind; cx: number; cy: number; gaze?: Gaze }) {
  const [dx, dy] = gaze ? GAZE_OFFSET[gaze] : [0, 0]

  if (kind === "happy") {
    return (
      <path
        d={`M ${cx - 12} ${cy + 3} Q ${cx} ${cy - 12} ${cx + 12} ${cy + 3}`}
        fill="none"
        stroke={LINE}
        strokeWidth={4.5}
        strokeLinecap="round"
      />
    )
  }
  if (kind === "closed") {
    return (
      <path
        d={`M ${cx - 12} ${cy} Q ${cx} ${cy + 8} ${cx + 12} ${cy}`}
        fill="none"
        stroke={LINE}
        strokeWidth={4.5}
        strokeLinecap="round"
      />
    )
  }
  return (
    <g>
      <ellipse cx={cx} cy={cy} rx={11} ry={12.5} fill="#fff6ea" />
      <circle cx={cx + dx} cy={cy + dy} r={5.6} fill={IRIS} />
      <circle cx={cx + dx + 2.1} cy={cy + dy - 2.3} r={1.8} fill="#fff" />
      {kind === "lid" && (
        <path
          d={`M ${cx - 12} ${cy - 3} Q ${cx} ${cy - 8} ${cx + 12} ${cy - 3}`}
          fill="none"
          stroke={LINE}
          strokeWidth={3.5}
          strokeLinecap="round"
        />
      )}
    </g>
  )
}

function Brow({ kind, cx, cy }: { kind: BrowKind; cx: number; cy: number }) {
  const w = 13
  if (kind === "curious") {
    return (
      <path
        d={`M ${cx - w} ${cy - 3} Q ${cx - w / 2} ${cy - 8} ${cx} ${cy - 6} Q ${cx + w / 2} ${cy - 4} ${cx + w} ${cy - 1}`}
        fill="none"
        stroke={LINE}
        strokeWidth={3.5}
        strokeLinecap="round"
        opacity={0.7}
      />
    )
  }
  if (kind === "concerned") {
    return (
      <path
        d={`M ${cx - w} ${cy} Q ${cx - w / 2} ${cy - 6} ${cx} ${cy - 4} Q ${cx + w / 2} ${cy - 1} ${cx + w} ${cy - 3}`}
        fill="none"
        stroke={LINE}
        strokeWidth={3.5}
        strokeLinecap="round"
        opacity={0.75}
      />
    )
  }
  return (
    <path
      d={`M ${cx - w} ${cy + 1} Q ${cx} ${cy - 3} ${cx + w} ${cy + 1}`}
      fill="none"
      stroke={LINE}
      strokeWidth={3.5}
      strokeLinecap="round"
      opacity={0.55}
    />
  )
}

function Nose() {
  return (
    <path
      d="M 120 100 C 118 106 118 110 120 114"
      fill="none"
      stroke={SKIN_DARK}
      strokeWidth={2.4}
      strokeLinecap="round"
      opacity={0.9}
    />
  )
}

function Mouth({ kind }: { kind: MouthKind }) {
  if (kind === "wide") {
    return (
      <g>
        <path d="M 102 128 Q 120 150 138 128 Q 120 136 102 128 Z" fill="#7c2d12" />
        <path d="M 104 128 L 136 128 L 131 132 L 109 132 Z" fill="#fff8ef" opacity={0.92} />
        <path d="M 108 134 Q 120 144 132 134 Q 120 139 108 134 Z" fill="#c95b45" opacity={0.85} />
      </g>
    )
  }
  if (kind === "small") {
    return (
      <path
        d="M 112 134 Q 120 140 128 134"
        fill="none"
        stroke={LINE}
        strokeWidth={4}
        strokeLinecap="round"
      />
    )
  }
  if (kind === "flat") {
    return (
      <path
        d="M 110 137 L 130 137"
        fill="none"
        stroke={LINE}
        strokeWidth={4}
        strokeLinecap="round"
      />
    )
  }
  if (kind === "open") {
    return (
      <g>
        <ellipse cx={120} cy={135} rx={6.5} ry={8} fill="#7c2d12" />
        <ellipse cx={120} cy={139} rx={4} ry={3} fill="#c95b45" />
      </g>
    )
  }
  if (kind === "frown") {
    return (
      <path
        d="M 108 141 Q 120 129 132 141"
        fill="none"
        stroke={LINE}
        strokeWidth={5}
        strokeLinecap="round"
      />
    )
  }
  return (
    <path
      d="M 104 130 Q 120 143 136 130"
      fill="none"
      stroke={LINE}
      strokeWidth={5}
      strokeLinecap="round"
    />
  )
}

function Sparkle({ x, y, delay }: { x: number; y: number; delay?: number }) {
  return (
    <path
      d={`M ${x} ${y - 8} Q ${x} ${y} ${x + 8} ${y} Q ${x} ${y} ${x} ${y + 8} Q ${x} ${y} ${x - 8} ${y} Q ${x} ${y} ${x} ${y - 8} Z`}
      fill="#fbbf24"
      className="avatar-sparkle"
      style={{ animationDelay: delay ? `${delay}s` : undefined }}
    />
  )
}

/**
 * A friendly human companion (bust) guiding the sign-in journey. The whole
 * body is drawn in SVG and reacts to the auth flow: it gazes toward the
 * focused field, tilts its head, nods on each keystroke, reacts to password
 * strength, and raises a hand to wave when the user succeeds.
 */
export function Avatar({
  mood,
  focusField,
  tick,
  compact = false,
}: {
  mood: AuthAvatarState
  focusField?: FocusField
  tick?: number
  compact?: boolean
}) {
  const cfg = avatarStates[mood]
  const reduced = useReducedMotion() ?? false
  const headControls = useAnimationControls()

  // Explicit gaze wins; otherwise the companion watches the focused field.
  const lean = focusLean(focusField)
  const gaze = cfg.expression.gaze ?? lean?.gaze
  const tilt = (cfg.headTilt ?? 0) + (lean?.tilt ?? 0)

  // A quick friendly nod every time the user types.
  useEffect(() => {
    if (!tick || tick <= 0) return
    if (reduced) return
    void headControls.start({
      y: [0, -4, 0],
      rotate: [tilt, tilt + 2, tilt],
      transition: { duration: 0.28, ease: "easeInOut" },
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick])

  return (
    <div className="relative flex items-center justify-center">
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
        <div
          className={`avatar-breathe relative ${
            compact ? "h-20 w-20 sm:h-40 sm:w-40" : "h-40 w-40 sm:h-52 sm:w-52"
          }`}
        >
          <svg
            viewBox="0 0 240 264"
            className="h-full w-full"
            role="img"
            aria-label="A friendly companion guiding you through sign in"
          >
            <defs>
              <radialGradient id="human-skin" cx="38%" cy="30%" r="82%">
                <stop offset="0%" stopColor="#ffe0bd" />
                <stop offset="45%" stopColor="#f7bd85" />
                <stop offset="100%" stopColor="#e29e62" />
              </radialGradient>
              <linearGradient id="human-hair" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#2a3a55" />
                <stop offset="55%" stopColor="#16213a" />
                <stop offset="100%" stopColor="#0b1020" />
              </linearGradient>
              <linearGradient id="human-cloak" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#141d33" />
                <stop offset="60%" stopColor="#0a0f1e" />
                <stop offset="100%" stopColor="#05070c" />
              </linearGradient>
              <linearGradient id="cloak-trim" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#34d399" />
                <stop offset="50%" stopColor="#22d3ee" />
                <stop offset="100%" stopColor="#818cf8" />
              </linearGradient>
              <radialGradient id="human-halo" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="rgba(52,211,153,0.22)" />
                <stop offset="60%" stopColor="rgba(34,211,238,0.08)" />
                <stop offset="100%" stopColor="rgba(52,211,153,0)" />
              </radialGradient>
            </defs>

            {/* Halo glow behind the human */}
            <circle cx="120" cy="104" r="104" fill="url(#human-halo)" />

            {/* Rotating HUD ring — the futuristic touch */}
            <g className="hud-ring">
              <ellipse
                cx="120"
                cy="104"
                rx="92"
                ry="100"
                fill="none"
                stroke="url(#cloak-trim)"
                strokeWidth="1.6"
                strokeDasharray="6 12"
                opacity="0.55"
              />
            </g>
            <ellipse
              cx="120"
              cy="104"
              rx="84"
              ry="92"
              fill="none"
              stroke="rgba(52,211,153,0.28)"
              strokeWidth="1"
              strokeDasharray="1 9"
              strokeLinecap="round"
            />

            {/* Floor shadow */}
            <ellipse cx="120" cy="250" rx="70" ry="9" fill="#04060c" opacity="0.45" />

            {/* Futuristic cloak / torso */}
            <path
              d="M 36 264 L 36 240 C 36 196 88 180 104 164 L 136 164 C 152 180 204 196 204 240 L 204 264 Z"
              fill="url(#human-cloak)"
            />
            <path d="M 96 164 C 92 184 82 204 58 216 C 92 210 106 198 110 176 Z" fill="#101a30" />
            <path
              d="M 144 164 C 148 184 158 204 182 216 C 148 210 134 198 130 176 Z"
              fill="#101a30"
            />
            <path
              d="M 96 164 C 92 184 82 204 58 216"
              fill="none"
              stroke="url(#cloak-trim)"
              strokeWidth="2"
              strokeLinecap="round"
              opacity="0.7"
            />
            <path
              d="M 144 164 C 148 184 158 204 182 216"
              fill="none"
              stroke="url(#cloak-trim)"
              strokeWidth="2"
              strokeLinecap="round"
              opacity="0.7"
            />
            <path d="M 120 198 L 127 208 L 120 218 L 113 208 Z" fill="#34d399" opacity="0.9" />
            <circle cx="120" cy="208" r="14" fill="rgba(52,211,153,0.14)" />

            {/* Back hair silhouette gives the head natural volume */}
            <ellipse cx="120" cy="88" rx="70" ry="58" fill="url(#human-hair)" />

            {/* Neck */}
            <rect x="106" y="146" width="28" height="30" rx="12" fill={SKIN_DARK} />
            <ellipse cx="120" cy="150" rx="24" ry="6" fill="#05070c" opacity="0.14" />

            {/* ── Head group: breathes, tilts, and nods as one ── */}
            <motion.g animate={headControls} style={{ transformOrigin: "120px 118px" }}>
              {/* Head */}
              <path
                d="M 120 42 C 160 42 178 60 178 100 C 178 128 166 144 142 150 C 128 153 112 153 98 150 C 74 144 62 128 62 100 C 62 60 80 42 120 42 Z"
                fill="url(#human-skin)"
              />
              {/* Ears */}
              <ellipse
                cx="61"
                cy="102"
                rx="6"
                ry="11"
                fill={SKIN_DARK}
                transform="rotate(-8 61 102)"
              />
              <ellipse
                cx="179"
                cy="102"
                rx="6"
                ry="11"
                fill={SKIN_DARK}
                transform="rotate(8 179 102)"
              />

              {/* Front hair cap with a swept centre part */}
              <path
                d="M 62 96 C 62 56 82 38 120 38 C 158 38 178 56 178 96 C 178 102 172 106 166 104 C 162 84 150 68 132 62 C 126 84 120 90 120 90 C 120 90 114 84 108 62 C 90 68 78 84 74 104 C 68 106 62 102 62 96 Z"
                fill="url(#human-hair)"
              />
              {/* Hair sheen */}
              <path
                d="M 76 66 C 92 54 112 48 126 50"
                fill="none"
                stroke="#ffffff"
                strokeWidth="3"
                strokeLinecap="round"
                opacity="0.1"
              />
              <path
                d="M 172 92 C 170 74 162 60 148 52"
                fill="none"
                stroke="#ffffff"
                strokeWidth="2.5"
                strokeLinecap="round"
                opacity="0.08"
              />
              {/* Futuristic emerald hair accent */}
              <path
                d="M 88 60 C 102 52 118 50 128 52"
                fill="none"
                stroke="#34d399"
                strokeWidth="1.8"
                strokeLinecap="round"
                opacity="0.5"
              />

              {/* Face — keyed by mood so expressions cross-fade */}
              <g key={mood} className="avatar-face-fade">
                <Brow kind={cfg.expression.brows} cx={96} cy={84} />
                <Brow kind={cfg.expression.brows} cx={144} cy={84} />
                <g className="avatar-blink">
                  <Eye kind={cfg.expression.eyes} cx={96} cy={100} gaze={gaze} />
                  <Eye kind={cfg.expression.eyes} cx={144} cy={100} gaze={gaze} />
                </g>
                <Nose />
                {cfg.expression.blush && (
                  <g>
                    <ellipse cx="78" cy="123" rx="9" ry="4.5" fill="#f43f5e" opacity="0.28" />
                    <ellipse cx="162" cy="123" rx="9" ry="4.5" fill="#f43f5e" opacity="0.28" />
                  </g>
                )}
                <Mouth kind={cfg.expression.mouth} />
              </g>
            </motion.g>

            {/* Waving hand on success */}
            {cfg.wave && (
              <motion.g
                initial={{ rotate: 14, opacity: 0 }}
                animate={{ rotate: [-46, -54, -46, -54, -46, -54, -46], opacity: 1 }}
                transition={{ duration: 1.9, ease: "easeInOut" }}
                style={{ transformOrigin: "52px 186px" }}
              >
                <path
                  d="M 40 196 C 34 174 34 152 40 132 C 56 136 66 152 70 168 C 72 182 58 192 40 196 Z"
                  fill="#121c33"
                />
                <path
                  d="M 40 196 C 34 174 34 152 40 132"
                  fill="none"
                  stroke="url(#cloak-trim)"
                  strokeWidth="2"
                  strokeLinecap="round"
                  opacity="0.65"
                />
                <ellipse cx="40" cy="124" rx="9" ry="11" fill="url(#human-skin)" />
              </motion.g>
            )}

            {cfg.sparkle && (
              <g>
                <Sparkle x={40} y={52} />
                <Sparkle x={196} y={86} delay={0.5} />
                <Sparkle x={34} y={150} delay={0.9} />
              </g>
            )}
          </svg>
        </div>
      </motion.div>
    </div>
  )
}
