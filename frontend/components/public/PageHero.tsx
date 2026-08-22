"use client";

import { motion, useReducedMotion } from "framer-motion";
import Button from "@/components/ui/Button";
import AuroraOrb from "@/components/ui/AuroraOrb";

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

  const enter = (delay: number) => ({
    initial: shouldReduceMotion ? false : ({ opacity: 0, y: 14 } as const),
    animate: { opacity: 1, y: 0 },
    transition: shouldReduceMotion ? { duration: 0 } : { duration: 0.55, delay },
  });

  return (
    <section className="relative pt-20 pb-14 md:pt-28 md:pb-20 px-4 sm:px-6 overflow-hidden">
      {/* Ambient aurora orbs — same language as the landing hero */}
      <AuroraOrb
        colorClass="bg-emerald-500/10"
        size="34rem"
        blur="120px"
        className="absolute -top-24 left-1/4"
      />
      <AuroraOrb
        colorClass="bg-indigo-500/10"
        size="26rem"
        blur="110px"
        duration={14}
        breatheTo={1.1}
        delay={1.2}
        className="absolute -top-16 right-1/5"
      />

      <div className="relative max-w-4xl mx-auto text-center">
        <motion.p {...enter(0)} className="section-eyebrow justify-center mb-4">
          <span className="text-emerald-400" aria-hidden="true">{"//"}</span>
          {eyebrow}
        </motion.p>
        <motion.h1
          {...enter(0.05)}
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
            {...enter(0.12)}
            className="mt-5 text-base sm:text-lg text-[var(--text-muted)] max-w-2xl mx-auto leading-relaxed"
          >
            {description}
          </motion.p>
        ) : null}
        {actions.length > 0 ? (
          <motion.div
            {...enter(0.18)}
            className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4"
          >
            {actions.map((action) => (
              <Button
                key={action.href}
                href={action.href}
                size="lg"
                variant={action.variant === "ghost" ? "secondary" : "primary"}
                className={
                  action.variant === "ghost"
                    ? "font-mono w-full sm:w-auto"
                    : "glow-border font-mono font-semibold tracking-wide w-full sm:w-auto"
                }
              >
                {action.label}
              </Button>
            ))}
          </motion.div>
        ) : null}
      </div>
    </section>
  );
}
