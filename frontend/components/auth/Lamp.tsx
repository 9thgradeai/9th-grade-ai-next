"use client"

import { motion, useAnimationControls, useReducedMotion } from "framer-motion"

/**
 * The midnight desk lamp — the opening interaction of the auth journey.
 *
 * Drama sources: an articulated arm, a pull-cord with a physical tug-and-
 * rebound, a volumetric light cone with fluorescent start-up flicker, and a
 * filament that pre-warms on hover ("it knows you're close").
 *
 * Accessibility: the entire fixture is one button labelled "Turn on the
 * light"; reduced motion swaps the flicker for a plain fade and stills the
 * idle sway.
 */
export function Lamp({
  lit,
  interactive,
  onActivate,
}: {
  lit: boolean
  interactive: boolean
  onActivate: () => void
}) {
  const reduced = useReducedMotion() ?? false
  const cord = useAnimationControls()

  const handleActivate = () => {
    if (!lit && !reduced) {
      // Physical tug: the chain stretches, then springs back.
      void cord.start({
        y: [0, 14, -3, 6, 0],
        transition: { duration: 0.55, ease: "easeOut" },
      })
    }
    onActivate()
  }

  const body = (
    <svg viewBox="0 0 220 330" className="h-48 w-32 sm:h-60 sm:w-40" role="img" aria-hidden="true">
      <defs>
        <radialGradient id="lamp-base" cx="50%" cy="30%" r="80%">
          <stop offset="0%" stopColor="#5b4220" />
          <stop offset="55%" stopColor="#33230f" />
          <stop offset="100%" stopColor="#1a1106" />
        </radialGradient>
        <linearGradient id="lamp-arm" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#120b04" />
          <stop offset="40%" stopColor="#4a3a22" />
          <stop offset="100%" stopColor="#1a1106" />
        </linearGradient>
        <linearGradient id="lamp-shade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#065f46" />
          <stop offset="60%" stopColor="#03301f" />
          <stop offset="100%" stopColor="#02180f" />
        </linearGradient>
        <radialGradient id="lamp-bulb" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#ffedb3" />
          <stop offset="70%" stopColor="#fbbf24" />
          <stop offset="100%" stopColor="#b45309" />
        </radialGradient>
        <radialGradient id="lamp-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="rgba(251,191,36,0.5)" />
          <stop offset="100%" stopColor="rgba(251,191,36,0)" />
        </radialGradient>
        {/* Volumetric cone — bright at the shade, dissolving onto the desk */}
        <linearGradient id="lamp-cone" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(251,191,36,0.34)" />
          <stop offset="55%" stopColor="rgba(251,191,36,0.12)" />
          <stop offset="100%" stopColor="rgba(251,191,36,0)" />
        </linearGradient>
      </defs>

      {/* Invitation halo — pulses gently while off so the lamp reads touchable */}
      {!lit && (
        <motion.circle
          cx="96"
          cy="196"
          r="88"
          fill="url(#lamp-glow)"
          animate={reduced ? undefined : { opacity: [0.12, 0.3, 0.12], scale: [0.9, 1.05, 0.9] }}
          transition={{ duration: 3.4, repeat: Infinity, ease: "easeInOut" }}
          style={{ transformOrigin: "96px 196px" }}
        />
      )}
      {/* Hover pre-light — warms up as you approach */}
      {!lit && (
        <circle
          cx="96"
          cy="196"
          r="76"
          fill="url(#lamp-glow)"
          className="opacity-0 transition-opacity duration-300 group-hover:opacity-80"
        />
      )}

      {/* Volumetric light cone — flickers on like a real tube */}
      {lit && (
        <>
          <motion.polygon
            points="66,118 130,118 176,268 16,268"
            fill="url(#lamp-cone)"
            initial={{ opacity: 0, scaleX: 0.7 }}
            animate={{ opacity: [0, 0.95, 0.3, 1, 0.55, 1], scaleX: [0.7, 0.94, 0.85, 1] }}
            transition={{ duration: 0.9, ease: "easeInOut" }}
            style={{ transformOrigin: "98px 118px" }}
          />
          {/* Pool of light on the desk */}
          <motion.ellipse
            cx="96"
            cy="286"
            rx="86"
            ry="16"
            fill="rgba(251,191,36,0.20)"
            initial={{ opacity: 0, scaleX: 0.5 }}
            animate={{ opacity: [0, 1, 0.5, 1], scaleX: [0.5, 1, 0.85, 1] }}
            transition={{ duration: 0.9, ease: "easeInOut" }}
            style={{ transformOrigin: "96px 286px" }}
          />
        </>
      )}

      {/* Desk */}
      <ellipse cx="110" cy="298" rx="92" ry="13" fill="url(#lamp-base)" />
      <ellipse cx="110" cy="292" rx="56" ry="9" fill="#0d0803" />

      {/* Articulated arm: base pillar → elbow → head */}
      <rect x="90" y="216" width="18" height="76" rx="9" fill="url(#lamp-arm)" />
      <circle cx="99" cy="214" r="8" fill="#241505" stroke="#4a3a22" strokeWidth="1.5" />
      <rect
        x="60"
        y="106"
        width="82"
        height="15"
        rx="7.5"
        fill="url(#lamp-arm)"
        transform="rotate(24 101 114)"
      />
      <circle cx="140" cy="128" r="7" fill="#241505" stroke="#4a3a22" strokeWidth="1.5" />

      {/* Shade head, tilted toward the desk */}
      <g transform="rotate(14 108 112)">
        <path
          d="M 74 84 Q 74 74 84 74 L 138 74 Q 148 74 148 84 L 158 116 Q 158 126 146 126 L 70 126 Q 58 126 58 116 Z"
          fill="url(#lamp-shade)"
        />
        <path
          d="M 84 74 L 138 74 L 146 126 L 62 126 Z"
          fill="none"
          stroke="rgba(52,211,153,0.35)"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
        <ellipse
          cx="104"
          cy="127"
          rx="11"
          ry="13"
          fill="url(#lamp-bulb)"
          className={`transition-opacity duration-500 ${lit ? "opacity-100" : "opacity-40"}`}
        />
        {/* Filament — pre-warms on hover even while off */}
        <path
          d="M 99 121 Q 104 115 109 121"
          fill="none"
          stroke="#ffedb3"
          strokeWidth="2"
          strokeLinecap="round"
          className={`transition-opacity duration-300 ${
            lit ? "opacity-100" : "opacity-0 group-hover:opacity-70"
          }`}
        />

        {/* Pull cord with bead — hangs from the shade lip */}
        <motion.g animate={cord} style={{ transformOrigin: "152px 122px" }}>
          {!reduced && !lit ? (
            <motion.g
              animate={{ rotate: [0, 2.5, -2.5, 0] }}
              transition={{ duration: 5.2, repeat: Infinity, ease: "easeInOut" }}
              style={{ transformOrigin: "152px 122px" }}
            >
              <line x1="152" y1="124" x2="152" y2="164" stroke="rgba(234,255,251,0.4)" strokeWidth="1.6" />
              <circle cx="152" cy="167" r="4" fill="#d4a24e" />
            </motion.g>
          ) : (
            <g>
              <line x1="152" y1="124" x2="152" y2="164" stroke="rgba(234,255,251,0.4)" strokeWidth="1.6" />
              <circle cx="152" cy="167" r="4" fill={lit ? "#ffedb3" : "#d4a24e"} />
            </g>
          )}
        </motion.g>
      </g>

      {/* Dust motes drifting in the cone once lit */}
      {lit &&
        !reduced &&
        [0, 1, 2].map((i) => (
          <motion.circle
            key={i}
            cx={72 + i * 24}
            r="1.6"
            fill="#ffedb3"
            initial={{ opacity: 0, y: 250 - i * 22 }}
            animate={{ opacity: [0, 0.75, 0], y: 250 - i * 22 - 46 }}
            transition={{ duration: 3.2, repeat: Infinity, delay: i * 0.9, ease: "easeInOut" }}
          />
        ))}
    </svg>
  )

  if (!interactive) {
    return <div aria-hidden="true">{body}</div>
  }

  return (
    <motion.button
      type="button"
      onClick={handleActivate}
      aria-label="Turn on the light"
      aria-pressed={lit}
      whileHover={lit || reduced ? { scale: 1.03 } : { scale: 1.06, rotate: -1.5, y: -4 }}
      whileTap={{ scale: 0.95 }}
      transition={{ type: "spring", stiffness: 420, damping: 22 }}
      className="group flex cursor-pointer flex-col items-center rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/80"
    >
      {/* Gentle sway once the room is lit */}
      <motion.div
        animate={lit && !reduced ? { rotate: [0, 1.2, -1.2, 0] } : { rotate: 0 }}
        transition={
          lit && !reduced ? { duration: 4.5, repeat: Infinity, ease: "easeInOut" } : { duration: 0.3 }
        }
      >
        {body}
      </motion.div>
      <span className="sr-only">Turn on the light</span>
    </motion.button>
  )
}
