"use client";

import { motion, useReducedMotion, type Variants } from "framer-motion";
import type { ReactNode } from "react";

const EASE = [0.22, 1, 0.36, 1] as const;

const containerVariants: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.055, delayChildren: 0.08 } },
};

const wordVariants: Variants = {
  hidden: { y: "112%", rotate: 2 },
  visible: {
    y: "0%",
    rotate: 0,
    transition: { duration: 0.7, ease: EASE },
  },
};

/**
 * Cinematic word-reveal heading. Words rise out of individual overflow
 * masks with a shared ease curve — one idea, executed quietly.
 * Reduced motion renders the plain text immediately.
 * `wordClassName` is applied to each word span (and the plain fallback),
 * so per-word paint styles like gradient text survive the transform.
 */
export default function MotionText({
  children,
  className = "",
  delay = 0,
  wordClassName,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
  wordClassName?: string;
}) {
  const shouldReduceMotion = useReducedMotion();
  const words = typeof children === "string" ? children.split(" ") : null;

  if (!words || shouldReduceMotion) {
    return (
      <span className={wordClassName ? `${className} ${wordClassName}` : className}>
        {children}
      </span>
    );
  }

  return (
    <motion.span
      className={className}
      style={{ display: "inline-block" }}
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      transition={{ delayChildren: delay }}
      aria-label={words.join(" ")}
    >
      {words.map((word, i) => (
        <span
          key={`${word}-${i}`}
          aria-hidden="true"
          className="inline-block overflow-hidden pb-[0.08em] -mb-[0.08em] align-bottom"
        >
          <motion.span
            className={`inline-block will-change-transform${wordClassName ? ` ${wordClassName}` : ""}`}
            variants={wordVariants}
          >
            {word}
            {i < words.length - 1 ? "\u00A0" : ""}
          </motion.span>
        </span>
      ))}
    </motion.span>
  );
}
