"use client";

import { AnimatePresence, motion } from "framer-motion";

export function AuthMessage({ message }: { message: string }) {
  if (!message) return null;

  return (
    <p
      aria-live="polite"
      className="text-center font-display text-xl leading-snug text-[var(--foreground)] sm:text-2xl"
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={message}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.22, ease: "easeOut" }}
          className="block"
        >
          {message}
        </motion.span>
      </AnimatePresence>
    </p>
  );
}