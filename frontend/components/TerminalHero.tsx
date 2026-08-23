"use client";

import { useState, useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import {
  motion,
  useInView,
  useReducedMotion,
  useTransform,
  useScroll,
  useMotionTemplate,
  type Variants,
} from "framer-motion";
import { trackHeroView, trackCtaClick } from "@/lib/analytics";
import { FeedbackButton } from "./dashboard/FeedbackButton";
import Button from "./ui/Button";
import MotionText from "./ui/MotionText";
import { transitions } from "@/lib/transitions";
import { ArrowRight, ChevronDown, Sparkles, ShieldCheck, Lock, Zap } from "lucide-react";

// Cinematic neural environment — lazy island, never in the server bundle,
// self-pausing when offscreen/hidden (see component contract).
const NeuralScene = dynamic(() => import("./visual/neural/NeuralScene"), {
  ssr: false,
});

const heroContainer: Variants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.12, delayChildren: 0.1 },
  },
};

const heroItem: Variants = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0, transition: transitions.smooth },
};

const stats = [
  { value: 50, decimals: 0, suffix: "K+", label: "Active Students" },
  { value: 2.5, decimals: 1, suffix: "M+", label: "Questions Practiced" },
  { value: 94, decimals: 0, suffix: "%", label: "Success Rate" },
  { value: 14, decimals: 0, suffix: "", label: "Subjects Covered" },
];

const trustChips = [
  { icon: Zap, label: "AI-Powered" },
  { icon: ShieldCheck, label: "Syllabus-Aligned" },
  { icon: Lock, label: "Private & Secure" },
];

function CountUp({ value, decimals = 0, suffix = "" }: { value: number; decimals?: number; suffix?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-40px" });
  const shouldReduceMotion = useReducedMotion();
  const [display, setDisplay] = useState(shouldReduceMotion ? value : 0);

  useEffect(() => {
    if (!inView || shouldReduceMotion) return;
    let raf = 0;
    const start = performance.now();
    const duration = 1400;
    const tick = (now: number) => {
      const p = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplay(eased * value);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [inView, value, shouldReduceMotion]);

  return (
    <span ref={ref}>
      {display.toLocaleString(undefined, { maximumFractionDigits: decimals, minimumFractionDigits: decimals })}
      {suffix}
    </span>
  );
}

export default function TerminalHero() {
  const [allowBlur, setAllowBlur] = useState(false);
  const sectionRef = useRef<HTMLElement>(null);
  const shouldReduceMotion = useReducedMotion();

  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start start", "end start"],
  });
  const sceneOpacity = useTransform(scrollYProgress, [0, 0.85], [1, 0]);
  const sceneY = useTransform(scrollYProgress, [0, 1], [0, 110]);
  const sceneScale = useTransform(scrollYProgress, [0, 1], [1, 0.94]);
  const blurPx = useTransform(scrollYProgress, [0, 0.9], [0, 8]);
  const sceneFilter = useMotionTemplate`blur(${blurPx}px)`;

  useEffect(() => {
    if (shouldReduceMotion) return;
    const mq = window.matchMedia("(pointer: fine) and (min-width: 768px)");
    const update = () => setAllowBlur(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, [shouldReduceMotion]);

  useEffect(() => {
    const start = Date.now();
    return () => {
      trackHeroView(Date.now() - start);
    };
  }, []);

  return (
    <section
      ref={sectionRef}
      className="relative min-h-[92vh] flex items-center pt-16 pb-20 px-4 sm:px-6 overflow-hidden"
    >
      {/* Layer 0 — page void (body --background #04060f); no painted stage */}

      {/* Layer 1 — cinematic neural environment (WebGL island) */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.7, duration: 1.6, ease: "easeOut" }}
        className="absolute inset-0"
        aria-hidden="true"
      >
        <motion.div
          style={{
            opacity: sceneOpacity,
            y: sceneY,
            scale: sceneScale,
            filter: allowBlur ? sceneFilter : undefined,
          }}
          className="h-full w-full"
        >
          <NeuralScene />
        </motion.div>
      </motion.div>

      {/* Layer 2 — content, left column; the right side stays open for the neural scene */}
      <div className="relative z-10 w-full max-w-7xl mx-auto">
        <motion.div
          variants={heroContainer}
          initial="hidden"
          animate="visible"
          className="max-w-xl"
        >
          <motion.div variants={heroItem} className="mb-6">
            <motion.span className="section-eyebrow">
              <Sparkles className="w-4 h-4" aria-hidden="true" />
              {"// NEXT-GEN EXAM INTELLIGENCE"}
            </motion.span>
          </motion.div>

          <h1 className="font-display text-4xl sm:text-5xl md:text-6xl lg:text-[4.25rem] font-semibold text-white leading-[1.05] tracking-tight mb-6">
            <MotionText>Master Competitive Exams with</MotionText>
            <br />
            <span className="text-gradient">
              <MotionText delay={0.35}>AI-Driven Precision</MotionText>
            </span>
          </h1>

          <motion.p
            variants={heroItem}
            className="text-lg md:text-xl mb-8 leading-relaxed text-[var(--text-muted)]"
          >
            Adaptive mock tests, automated flashcards, AI doubt solving, and daily streak tracking —
            all powered by cutting-edge AI to help you ace BCS, Bank, and Teacher recruitment exams.
          </motion.p>

          <motion.div
            variants={heroItem}
            className="flex flex-col sm:flex-row flex-wrap gap-3 sm:gap-4"
          >
            <Button
              href="/login?register=true"
              size="lg"
              className="glow-border font-semibold w-full sm:w-auto"
              onClick={() => trackCtaClick("primary")}
            >
              Start Free Preparation
              <ArrowRight className="w-4 h-4" aria-hidden="true" />
            </Button>
            <Button
              href="#features"
              size="lg"
              variant="secondary"
              className="w-full sm:w-auto"
              onClick={() => trackCtaClick("secondary")}
            >
              Explore Features
              <ChevronDown className="w-4 h-4" aria-hidden="true" />
            </Button>
          </motion.div>

          <motion.div variants={heroItem} className="mt-7 flex flex-wrap gap-2.5">
            {trustChips.map((c) => (
              <span
                key={c.label}
                className="inline-flex items-center gap-1.5 text-xs text-zinc-400 font-mono px-3 py-1.5 rounded-full border border-white/10 bg-white/[0.03]"
              >
                <c.icon className="w-3.5 h-3.5 text-emerald-400" aria-hidden="true" />
                {c.label}
              </span>
            ))}
          </motion.div>

          <motion.div
            variants={heroItem}
            className="mt-12 grid grid-cols-2 gap-6 sm:flex sm:flex-wrap sm:gap-10 text-center sm:text-left"
          >
            {stats.map((stat) => (
              <div key={stat.label} className="sm:border-l sm:border-white/10 sm:pl-6 first:border-0 first:pl-0">
                <div className="text-3xl font-display font-semibold text-emerald-400 tabular-nums">
                  <CountUp value={stat.value} decimals={stat.decimals} suffix={stat.suffix} />
                </div>
                <div className="text-sm text-zinc-500 mt-1">{stat.label}</div>
              </div>
            ))}
          </motion.div>
        </motion.div>
      </div>

      {/* Scroll indicator */}
      <motion.div
        animate={shouldReduceMotion ? { opacity: 0.5 } : { y: [0, 10, 0] }}
        transition={{ duration: 1.5, repeat: Infinity }}
        className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 text-zinc-500 z-10"
        aria-hidden="true"
      >
        <span className="text-xs font-mono uppercase tracking-wider">Scroll</span>
        <ChevronDown className="w-5 h-5" />
      </motion.div>
      <FeedbackButton />
    </section>
  );
}
