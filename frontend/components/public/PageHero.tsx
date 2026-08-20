"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";

export type PageHeroAction = {
  href: string;
  label: string;
  variant?: "primary" | "ghost";
};

export default function PageHero({
  eyebrow,
  title,
  highlight,
  description,
  actions = [],
}: {
  eyebrow: string;
  title: string;
  highlight?: string;
  description?: string;
  actions?: PageHeroAction[];
}) {
  const shouldReduceMotion = useReducedMotion();

  return (
    <section className="relative pt-20 pb-14 md:pt-28 md:pb-20 px-4 sm:px-6 overflow-hidden">
      {/* Ambient aurora orbs — same language as the landing hero */}
      <motion.div
        className="absolute -top-24 left-1/4 w-[34rem] h-[34rem] bg-emerald-500/10 rounded-full blur-[120px]"
        aria-hidden="true"
        animate={
          shouldReduceMotion
            ? undefined
            : { opacity: [0.5, 0.9, 0.5], scale: [1, 1.06, 1] }
        }
        transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute -top-16 right-1/5 w-[26rem] h-[26rem] bg-indigo-500/10 rounded-full blur-[110px]"
        aria-hidden="true"
        animate={
          shouldReduceMotion
            ? undefined
            : { opacity: [0.4, 0.8, 0.4], scale: [1, 1.1, 1] }
        }
        transition={{ duration: 14, repeat: Infinity, ease: "easeInOut" }}
      />

      <div className="relative max-w-4xl mx-auto text-center">
        <motion.p
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="section-eyebrow justify-center mb-4"
        >
          <span className="text-emerald-400" aria-hidden="true">{"//"}</span>
          {eyebrow}
        </motion.p>
        <motion.h1
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, delay: 0.05 }}
          className="font-display text-4xl sm:text-5xl md:text-6xl font-semibold text-white leading-[1.05] tracking-tight"
        >
          {title}
          {highlight ? (
            <>
              <br />
              <span className="text-gradient">{highlight}</span>
            </>
          ) : null}
        </motion.h1>
        {description ? (
          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.12 }}
            className="mt-5 text-base sm:text-lg text-[var(--text-muted)] max-w-2xl mx-auto leading-relaxed"
          >
            {description}
          </motion.p>
        ) : null}
        {actions.length > 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.18 }}
            className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4"
          >
            {actions.map((action) =>
              action.variant === "ghost" ? (
                <Link
                  key={action.href}
                  href={action.href}
                  className="inline-flex items-center gap-2 px-7 py-3.5 rounded-full border border-white/15 text-white font-mono text-sm hover:border-emerald-400/50 hover:bg-white/5 transition-colors"
                >
                  {action.label}
                </Link>
              ) : (
                <Link
                  key={action.href}
                  href={action.href}
                  className="glow-border inline-flex items-center gap-2 px-7 py-3.5 rounded-full bg-emerald-500 text-zinc-950 font-mono font-semibold text-sm tracking-wide hover:bg-emerald-400 transition-colors shadow-[0_0_24px_rgba(16,185,129,0.3)]"
                >
                  {action.label}
                </Link>
              ),
            )}
          </motion.div>
        ) : null}
      </div>
    </section>
  );
}