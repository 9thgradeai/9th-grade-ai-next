"use client";

import { useEffect, useRef, type PointerEvent } from "react";
import {
  motion,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
  type Variants,
} from "framer-motion";
import { ArrowRight, ChevronDown, Sparkles } from "lucide-react";
import Button from "@/components/ui/Button";
import MotionText from "@/components/ui/MotionText";
import Magnetic from "@/components/landing/Magnetic";
import BlackholeCanvas from "@/components/landing/BlackholeCanvas";
import { trackCtaClick, trackHeroView } from "@/lib/analytics";
import { useMotionCapabilities } from "@/lib/motion/device";
import { EASE_OUT_EXPO, heroItem, staggerParent } from "@/lib/motion/variants";

const stats = (subjectCount: number) => [
  { value: String(subjectCount), label: "Subjects" },
  { value: "2", label: "Languages" },
  { value: "100%", label: "Free" },
];

const heroContainer: Variants = staggerParent(0.12, 0.1);

export default function HeroSection({ subjectCount }: { subjectCount: number }) {
  const sectionRef = useRef<HTMLElement>(null);
  const shouldReduceMotion = useReducedMotion();

  // Pointer-reactive depth for the copy layer — zero re-renders while tracking.
  const rawX = useMotionValue(0);
  const rawY = useMotionValue(0);
  const springCfg = { stiffness: 55, damping: 18, mass: 0.7 };
  const fieldX = useSpring(rawX, springCfg);
  const fieldY = useSpring(rawY, springCfg);
  const copyX = useTransform(fieldX, (v) => v * -6);
  const copyY = useTransform(fieldY, (v) => v * -5);

  useEffect(() => {
    const start = Date.now();
    return () => trackHeroView(Date.now() - start);
  }, []);

  const { pointerEffects } = useMotionCapabilities();

  const handlePointerMove = (e: PointerEvent<HTMLElement>) => {
    if (!pointerEffects) return;
    const rect = sectionRef.current?.getBoundingClientRect();
    if (!rect) return;
    rawX.set(((e.clientX - rect.left) / rect.width - 0.5) * 2);
    rawY.set(((e.clientY - rect.top) / rect.height - 0.5) * 2);
  };

  const handlePointerLeave = () => {
    rawX.set(0);
    rawY.set(0);
  };

  return (
    <section
      ref={sectionRef}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      className="relative flex min-h-[92vh] items-center overflow-hidden px-4 pb-24 pt-28 sm:px-6"
      aria-label="Introduction"
    >
      {/* Layer 0 — the black hole: event horizon + accretion disk, the
          gravitational center of the product vision. Raw WebGL, no deps. */}
      <BlackholeCanvas />

      {/* Layer 1 — legibility scrim, viewport-aware so the disk stays visible and
          the copy stays readable on every screen size.
          - Always: a soft vignette darkening the edges.
          - ≥sm (desktop/tablet landscape): darken the left where the copy sits.
          - <sm (phones/portrait): darken the bottom where the stacked copy sits. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-[1]"
        style={{
          background:
            "radial-gradient(125% 125% at 50% 38%, transparent 30%, rgba(5,5,9,0.5) 100%)",
        }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-[1] hidden sm:block"
        style={{
          background:
            "linear-gradient(100deg, rgba(5,5,9,0.92) 0%, rgba(5,5,9,0.55) 30%, rgba(5,5,9,0.08) 60%, transparent 100%)",
        }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-[1] block sm:hidden"
        style={{
          background:
            "linear-gradient(to top, rgba(5,5,9,0.92) 0%, rgba(5,5,9,0.5) 38%, rgba(5,5,9,0.12) 70%, transparent 100%)",
        }}
      />

      {/* Layer 2 — copy */}
      <motion.div
        style={
          pointerEffects
            ? { x: copyX, y: copyY, textShadow: "0 1px 22px rgba(0,0,0,0.55)" }
            : { textShadow: "0 1px 22px rgba(0,0,0,0.55)" }
        }
        className="relative z-10 mx-auto w-full max-w-7xl"
      >
        <motion.div variants={heroContainer} initial="hidden" animate="visible" className="max-w-2xl">
          <motion.p variants={heroItem} className="section-eyebrow mb-6">
            <Sparkles className="h-4 w-4" aria-hidden="true" />
            AI-Powered Application, Built for Job Aspirants
          </motion.p>

          <h1 className="mb-6 font-display text-[clamp(2.75rem,8vw,5.25rem)] font-semibold leading-[1.02] tracking-tight text-white">
            <MotionText>Stop guessing.</MotionText>
            <br />
            <span className="relative inline-block">
              <MotionText delay={0.3} wordClassName="text-gradient">
                Start passing.
              </MotionText>
              {/* The examiner's pen — a gradient mark that draws itself under
                  "Start passing." ending in a quiet ✓. Reduced motion: static. */}
              <svg
                aria-hidden="true"
                viewBox="0 0 300 14"
                preserveAspectRatio="none"
                className="absolute -bottom-[0.06em] left-0 h-[0.14em] w-full overflow-visible"
              >
                <defs>
                  <linearGradient id="pen-stroke" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#2dd4bf" />
                    <stop offset="60%" stopColor="#22d3ee" />
                    <stop offset="100%" stopColor="#a78bfa" />
                  </linearGradient>
                </defs>
                <motion.path
                  d="M 4 10 C 80 5, 190 12, 296 6"
                  fill="none"
                  stroke="url(#pen-stroke)"
                  strokeWidth="4"
                  strokeLinecap="round"
                  vectorEffect="non-scaling-stroke"
                  initial={shouldReduceMotion ? { pathLength: 1 } : { pathLength: 0 }}
                  animate={{ pathLength: 1 }}
                  transition={
                    shouldReduceMotion
                      ? { duration: 0 }
                      : { delay: 1.25, duration: 0.5, ease: EASE_OUT_EXPO }
                  }
                />
              </svg>
              <motion.svg
                aria-hidden="true"
                viewBox="0 0 16 16"
                className="absolute -right-[0.32em] top-[0.42em] h-[0.3em] w-[0.3em]"
                initial={shouldReduceMotion ? { scale: 1, opacity: 1 } : { scale: 0.4, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={
                  shouldReduceMotion
                    ? { duration: 0 }
                    : { delay: 1.72, duration: 0.28, ease: EASE_OUT_EXPO }
                }
              >
                <motion.path
                  d="M 3 8.5 L 6.5 12 L 13 4"
                  fill="none"
                  stroke="#34d399"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  initial={shouldReduceMotion ? { pathLength: 1 } : { pathLength: 0 }}
                  animate={{ pathLength: 1 }}
                  transition={
                    shouldReduceMotion
                      ? { duration: 0 }
                      : { delay: 1.72, duration: 0.3, ease: EASE_OUT_EXPO }
                  }
                />
              </motion.svg>
            </span>
          </h1>

          <motion.p
            variants={heroItem}
            className="mb-9 max-w-xl text-lg leading-relaxed text-[var(--text-muted)] md:text-xl"
          >
            AI that learns your weak spots, builds custom practice sets, and turns
            9th-grade pay-scale exams into predictable outcomes.
          </motion.p>

          <motion.div variants={heroItem} className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:gap-4">
            <Magnetic>
              <Button
                href="/login?register=true"
                size="lg"
                className="glow-border w-full font-semibold sm:w-auto"
                onClick={() => trackCtaClick("primary")}
              >
                Start for free
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Button>
            </Magnetic>
            <Button
              href="#signal"
              size="lg"
              variant="secondary"
              className="w-full sm:w-auto"
              onClick={() => trackCtaClick("secondary")}
            >
              See how it works
              <ChevronDown className="h-4 w-4" aria-hidden="true" />
            </Button>
          </motion.div>

          <motion.dl
            variants={heroItem}
            className="mt-12 flex flex-wrap items-center gap-x-8 gap-y-4 sm:gap-x-12"
          >
            {stats(subjectCount).map((stat, i) => (
              <div key={stat.label} className={`flex items-baseline gap-8 sm:gap-12 ${i > 0 ? "sm:border-l sm:border-white/10 sm:pl-12" : ""}`}>
                <dt className="sr-only">{stat.label}</dt>
                <dd className="font-display text-2xl font-semibold text-emerald-400 tabular-nums sm:text-3xl">
                  {stat.value}
                  <span className="ml-2 align-middle text-sm font-normal text-zinc-500">{stat.label}</span>
                </dd>
              </div>
            ))}
          </motion.dl>
        </motion.div>
      </motion.div>

      {/* Scroll cue */}
      <motion.div
        aria-hidden="true"
        initial={{ opacity: 0 }}
        animate={{ opacity: shouldReduceMotion ? 0.5 : [0, 0.7, 0.5] }}
        transition={shouldReduceMotion ? { duration: 0.3 } : { duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
        className="absolute bottom-7 left-1/2 z-10 flex -translate-x-1/2 flex-col items-center gap-1.5 text-zinc-500"
      >
        <span className="font-mono text-[0.65rem] uppercase tracking-[0.22em]">Scroll</span>
        <ChevronDown className="h-4 w-4" />
      </motion.div>
    </section>
  );
}
