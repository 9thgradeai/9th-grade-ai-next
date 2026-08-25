"use client"

import { motion } from "framer-motion"
import type { BrowKind, EyeKind, Gaze, MouthKind } from "./auth-state"

/**
 * UNIT-9 visor hardware: LED eyes, eyebrow strips, equalizer mouth.
 * Every piece glows like a real display and is driven purely by props from
 * the auth stage machine. GPU-cheap: transform/opacity animations only.
 */

export const BEZEL_A = "#34d399" // emerald-400
export const BEZEL_B = "#22d3ee" // cyan-500
const VISOR_TOP = "#07131f"
const VISOR_BOTTOM = "#03101a"

export const UNIT9_GRADIENTS = (
  <defs>
    {/* The exact brand gradient of the logo tile */}
    <linearGradient id="unit9-bezel" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stopColor={BEZEL_A} />
      <stop offset="100%" stopColor={BEZEL_B} />
    </linearGradient>
    <linearGradient id="unit9-chassis" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stopColor="#182338" />
      <stop offset="60%" stopColor="#0c1526" />
      <stop offset="100%" stopColor="#070b16" />
    </linearGradient>
    <radialGradient id="unit9-halo" cx="50%" cy="42%" r="58%">
      <stop offset="0%" stopColor="rgba(52,211,153,0.20)" />
      <stop offset="60%" stopColor="rgba(34,211,238,0.07)" />
      <stop offset="100%" stopColor="rgba(52,211,153,0)" />
    </radialGradient>
    <radialGradient id="unit9-visor" cx="50%" cy="30%" r="90%">
      <stop offset="0%" stopColor={VISOR_TOP} />
      <stop offset="100%" stopColor={VISOR_BOTTOM} />
    </radialGradient>
  </defs>
)

export type Palette = { led: string; alert: string }

export function paletteFor(mood: string): Palette {
  switch (mood) {
    case "error":
      return { led: "#fb7185", alert: "#fb7185" }
    case "weak":
      return { led: "#fbbf24", alert: "#fbbf24" }
    case "moderate":
      return { led: "#fde68a", alert: "#fbbf24" }
    case "excellent":
    case "celebrating":
    case "success":
      return { led: "#67e8f9", alert: "#34d399" }
    default:
      return { led: "#34d399", alert: "#34d399" }
  }
}

const GAZE_OFFSET: Record<Gaze, [number, number]> = {
  left: [-3.5, 0],
  right: [3.5, 0],
  up: [0, -3],
  down: [0, 3],
}

export function LedEye({
  cx,
  cy,
  kind,
  gaze,
  color,
}: {
  cx: number
  cy: number
  kind: EyeKind
  gaze?: Gaze
  color: string
}) {
  const [dx, dy] = gaze ? GAZE_OFFSET[gaze] : [0, 0]

  if (kind === "happy") {
    return (
      <path
        d={`M ${cx - 13} ${cy + 4} Q ${cx} ${cy - 12} ${cx + 13} ${cy + 4}`}
        fill="none"
        stroke={color}
        strokeWidth={5}
        strokeLinecap="round"
        style={{ filter: `drop-shadow(0 0 5px ${color})` }}
      />
    )
  }
  if (kind === "closed") {
    return (
      <rect x={cx - 12} y={cy - 1} width={24} height={2.6} rx={1.3} fill={color} opacity={0.85} />
    )
  }

  return (
    <g>
      <rect
        x={cx - 12}
        y={cy - 11}
        width={24}
        height={22}
        rx={7}
        fill="#0a1626"
        stroke={color}
        strokeOpacity={0.45}
        strokeWidth={1.4}
      />
      <circle cx={cx + dx} cy={cy + dy} r={5.4} fill={color} />
      <circle cx={cx + dx + 1.8} cy={cy + dy - 1.8} r={1.6} fill="#eafffb" opacity={0.95} />
      {/* Privacy shutter — slides partway over the socket */}
      {kind === "lid" && (
        <motion.rect
          x={cx - 12}
          y={cy - 11}
          width={24}
          rx={4}
          fill={color}
          opacity={0.55}
          initial={{ height: 0 }}
          animate={{ height: 10 }}
          transition={{ duration: 0.25 }}
        />
      )}
    </g>
  )
}

export function LedBrow({
  kind,
  cx,
  cy,
  color,
}: {
  kind: BrowKind
  cx: number
  cy: number
  color: string
}) {
  const w = 12
  if (kind === "curious") {
    return (
      <path
        d={`M ${cx - w} ${cy + 2} Q ${cx} ${cy - 5} ${cx + w} ${cy - 1}`}
        fill="none"
        stroke={color}
        strokeWidth={3.4}
        strokeLinecap="round"
        opacity={0.75}
      />
    )
  }
  if (kind === "concerned") {
    return (
      <path
        d={`M ${cx - w} ${cy - 1} Q ${cx} ${cy - 6} ${cx + w} ${cy + 3}`}
        fill="none"
        stroke={color}
        strokeWidth={3.4}
        strokeLinecap="round"
        opacity={0.8}
      />
    )
  }
  return <rect x={cx - w} y={cy} width={w * 2} height={3} rx={1.5} fill={color} opacity={0.6} />
}

/** LED mouth. While loading it becomes a live equalizer — the unit is thinking. */
export function LedMouth({
  kind,
  color,
  loading,
}: {
  kind: MouthKind
  color: string
  loading: boolean
}) {
  if (loading) {
    return (
      <g>
        {[0, 1, 2, 3].map((i) => (
          <motion.rect
            key={i}
            x={108 + i * 7}
            width={4}
            rx={2}
            fill={i % 2 ? BEZEL_B : color}
            style={{ originY: 1 }}
            initial={{ y: 134, height: 6 }}
            animate={{ y: [132, 122 - i * 3, 132], height: [6, 12 + i * 3, 6] }}
            transition={{ duration: 0.72, repeat: Infinity, delay: i * 0.11, ease: "easeInOut" }}
          />
        ))}
      </g>
    )
  }
  if (kind === "wide") {
    return (
      <path
        d={`M 102 126 Q 120 148 138 126`}
        fill="none"
        stroke={color}
        strokeWidth={5.5}
        strokeLinecap="round"
        style={{ filter: `drop-shadow(0 0 6px ${color})` }}
      />
    )
  }
  if (kind === "small") {
    return <rect x={114} y={132} width={12} height={3} rx={1.5} fill={color} opacity={0.9} />
  }
  if (kind === "flat") {
    return <rect x={110} y={134} width={20} height={3} rx={1.5} fill={color} opacity={0.75} />
  }
  if (kind === "open") {
    return (
      <rect x={112} y={127} width={16} height={11} rx={5.5} fill={color} opacity={0.92}>
        <animate attributeName="height" values="11;8;11" dur="0.9s" repeatCount="indefinite" />
      </rect>
    )
  }
  if (kind === "frown") {
    return (
      <path
        d={`M 107 140 Q 120 129 133 140`}
        fill="none"
        stroke={color}
        strokeWidth={5}
        strokeLinecap="round"
      />
    )
  }
  return (
    <path
      d={`M 104 128 Q 120 142 136 128`}
      fill="none"
      stroke={color}
      strokeWidth={5}
      strokeLinecap="round"
      opacity={0.95}
    />
  )
}

export function Sparkle({ x, y, delay }: { x: number; y: number; delay?: number }) {
  return (
    <path
      d={`M ${x} ${y - 8} Q ${x} ${y} ${x + 8} ${y} Q ${x} ${y} ${x} ${y + 8} Q ${x} ${y} ${x - 8} ${y} Q ${x} ${y} ${x} ${y - 8} Z`}
      fill="#fbbf24"
      className="avatar-sparkle"
      style={{ animationDelay: delay ? `${delay}s` : undefined }}
    />
  )
}
