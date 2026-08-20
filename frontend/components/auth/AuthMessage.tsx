"use client"

import { motion } from "framer-motion"

export function AuthMessage({ message }: { message: string }) {
  if (!message) return null

  return (
    <p
      aria-live="polite"
      className="text-center font-display text-xl leading-snug text-[var(--foreground)] sm:text-2xl"
    >
      <motion.span
        key={message}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.22, ease: "easeOut" }}
        className="block"
      >
        {message}
      </motion.span>
    </p>
  )
}
