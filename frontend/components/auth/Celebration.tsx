"use client"

import { motion } from "framer-motion"

const COLORS = ["#34d399", "#22d3ee", "#fbbf24", "#818cf8", "#f472b6"]

/** One-shot particle burst around the avatar when authentication succeeds.
 *  Opacity/transform only, ~16 elements, runs once — cheap. */
export function Celebration({ active }: { active: boolean }) {
  if (!active) return null

  const particles = Array.from({ length: 16 }, (_, i) => {
    const angle = (i / 16) * Math.PI * 2 - Math.PI / 2
    const dist = 64 + (i % 4) * 20
    return {
      id: i,
      x: Math.cos(angle) * dist,
      y: Math.sin(angle) * dist,
      color: COLORS[i % COLORS.length],
      size: 7 + (i % 3) * 3,
      delay: (i % 6) * 0.03,
      rotate: (i % 2 ? 1 : -1) * 160,
    }
  })

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 flex items-center justify-center"
    >
      {particles.map((p) => (
        <motion.span
          key={p.id}
          className="absolute rounded-full"
          style={{ width: p.size, height: p.size, backgroundColor: p.color }}
          initial={{ opacity: 0, x: 0, y: 0, scale: 0 }}
          animate={{
            opacity: [0, 1, 1, 0],
            x: p.x,
            y: p.y,
            scale: [0, 1, 0.6, 0],
            rotate: p.rotate,
          }}
          transition={{ duration: 0.95, delay: p.delay, ease: "easeOut" }}
        />
      ))}
    </div>
  )
}
