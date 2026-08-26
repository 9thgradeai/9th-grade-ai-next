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
import KnowledgeField from "@/components/landing/KnowledgeField";
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

  // Pointer-reactive depth via MotionValues — zero re-renders while tracking.
  const rawX = useMotionValue(0);
  const rawY = useMotionValue(0);
  const springCfg = { stiffness: 55, damping: 18, mass: 0.7 };
  const fieldX = useSpring(rawX, springCfg);
  const fieldY = useSpring(rawY, springCfg);
  const copyX = useTransform(fieldX, (v) => v * -5);
  const copyY = useTransform(fieldY, (v) => v * -4);

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
      {/* Layer 1 — knowledge intelligence field (shared canvas) */}
      <motion.div style={pointerEffects ? { x: fieldX, y: fieldY } : undefined} className="absolute inset-[-40px] z-0">
        <KnowledgeField />
      </motion.div>

      {/* Layer 1b — aurora lighting */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-[1]"
        style={{
          background:
            "radial-gradient(ellipse 60% 46% at 72% 30%, rgba(129,140,248,0.13), transparent 60%), radial-gradient(ellipse 44% 38% at 18% 68%, rgba(45,212,191,0.10), transparent 62%)",
        }}
      />

      {/* Orbital ring — one quiet depth cue behind the copy */}
      <svg
        aria-hidden="true"
        viewBox="0 0 800 800"
        className="pointer-events-none absolute -right-40 top-1/2 z-[1] hidden w-[46rem] -translate-y-1/2 opacity-40 lg:block"
      >
        <defs>
          <linearGradient id="ring-glow" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#2dd4bf" stopOpacity="0.5" />
            <stop offset="55%" stopColor="#818cf8" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#a78bfa" stopOpacity="0.05" />
          </linearGradient>
        </defs>
        <ellipse cx="400" cy="400" rx="330" ry="330" fill="none" stroke="url(#ring-glow)" strokeWidth="1" />
        <ellipse cx="400" cy="400" rx="250" ry="250" fill="none" stroke="url(#ring-glow)" strokeWidth="0.6" strokeDasharray="2 9" />
        <ellipse cx="400" cy="400" rx="398" ry="120" fill="none" stroke="url(#ring-glow)" strokeWidth="0.6" transform="rotate(-16 400 400)" />
        <circle cx="730" cy="400" r="3.5" fill="#2dd4bf" />
        <circle cx="150" cy="400" r="2.5" fill="#a78bfa" />
      </svg>

      {/* Layer 2 — copy */}
      <motion.div
        style={pointerEffects ? { x: copyX, y: copyY } : undefined}
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
                  "Start passing." right as the field's diagnostic sweep
                  completes, ending in a quiet ✓. Reduced motion: static. */}
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
