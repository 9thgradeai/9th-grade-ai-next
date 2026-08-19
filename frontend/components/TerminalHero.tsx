"use client";

import { useState, useEffect, useRef } from "react";
import {
  motion,
  useInView,
  useReducedMotion,
  useMotionValue,
  useTransform,
  type Variants,
} from "framer-motion";
import { trackHeroView, trackCtaClick } from "@/lib/analytics";
import { FeedbackButton } from "./dashboard/FeedbackButton";
import { transitions } from "@/lib/transitions";
import { ChevronDown, Sparkles } from "lucide-react";

type TerminalLine =
  | { type: "command"; text: string; delay: number }
  | { type: "output"; text: string; delay: number }
  | { type: "progress"; label: string; value: number; total: number; delay: number }
  | { type: "question"; text: string; options: string[]; correct: number; delay: number };

const terminalOutput: TerminalLine[] = [
  { type: "command", text: "$ 9th-grade-ai --prepare --bcs-51", delay: 500 },
  { type: "output", text: "[✓] System initialized", delay: 300 },
  { type: "output", text: "[✓] Loading syllabus: BCS 51st Prelim", delay: 300 },
  { type: "output", text: "[✓] AI models loaded: llama-3.1-70b, gpt-4o-mini", delay: 400 },
  { type: "output", text: "", delay: 200 },
  { type: "progress", label: "Bangla Literature", value: 78, total: 100, delay: 300 },
  { type: "progress", label: "English Language", value: 65, total: 100, delay: 250 },
  { type: "progress", label: "Bangladesh Affairs", value: 82, total: 100, delay: 250 },
  { type: "progress", label: "International Affairs", value: 45, total: 100, delay: 250 },
  { type: "progress", label: "Mathematical Reasoning", value: 71, total: 100, delay: 250 },
  { type: "progress", label: "Mental Ability", value: 88, total: 100, delay: 250 },
  { type: "output", text: "", delay: 300 },
  { type: "output", text: "[✓] Generating adaptive mock test...", delay: 400 },
  { type: "question", text: "Q1. Who was the first President of Bangladesh?", options: ["Sheikh Mujibur Rahman", "Syed Nazrul Islam", "Abu Sayeed Chowdhury", "Justice Abu Sadat Mohammad Sayem"], correct: 1, delay: 300 },
  { type: "question", text: "Q2. The Battle of Plassey was fought in:", options: ["1757", "1764", "1770", "1789"], correct: 0, delay: 300 },
  { type: "question", text: "Q3. GDP stands for:", options: ["Gross Domestic Product", "General Development Plan", "Global Domestic Policy", "Government Development Program"], correct: 0, delay: 300 },
  { type: "output", text: "", delay: 300 },
  { type: "output", text: "[✓] Mock test generated: 25 questions, 30 min", delay: 400 },
  { type: "output", text: "[✓] Ready for exam preparation", delay: 300 },
  { type: "command", text: "$ █", delay: 1000 },
];

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

function useTilt(max = 6) {
  const mx = useMotionValue(0.5);
  const my = useMotionValue(0.5);
  const rotateX = useTransform(my, [0, 1], [max, -max]);
  const rotateY = useTransform(mx, [0, 1], [-max, max]);

  const onMouseMove = (e: React.MouseEvent<HTMLElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    mx.set((e.clientX - r.left) / r.width);
    my.set((e.clientY - r.top) / r.height);
  };
  const onMouseLeave = () => {
    mx.set(0.5);
    my.set(0.5);
  };

  return { style: { rotateX, rotateY, transformPerspective: 1000 }, onMouseMove, onMouseLeave };
}

export default function TerminalHero() {
  const [lines, setLines] = useState<typeof terminalOutput>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isComplete, setIsComplete] = useState(false);
  const terminalRef = useRef<HTMLDivElement>(null);
  const shouldReduceMotion = useReducedMotion();
  const tilt = useTilt();

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];

    const typeNextLine = () => {
      if (currentIndex >= terminalOutput.length) {
        setIsComplete(true);
        return;
      }

      setLines((prev) => [...prev, terminalOutput[currentIndex]]);
      setCurrentIndex((prev) => prev + 1);

      const nextDelay = terminalOutput[currentIndex]?.delay ?? 300;
      const t = setTimeout(typeNextLine, nextDelay);
      timers.push(t);
    };

    const initialTimer = setTimeout(typeNextLine, 800);
    timers.push(initialTimer);

    return () => {
      timers.forEach((t) => clearTimeout(t));
    };
  }, [currentIndex]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [lines]);

  // Track hero view time
  useEffect(() => {
    const start = Date.now();
    return () => {
      const duration = Date.now() - start;
      trackHeroView(duration);
    };
  }, []);

  const restartAnimation = () => {
    setLines([]);
    setCurrentIndex(0);
    setIsComplete(false);
  };

  return (
    <section className="relative min-h-[90vh] flex items-center justify-center pt-16 pb-20 px-4 overflow-hidden">
      {/* Ambient aurora orbs (GPU-friendly scale/opacity only) */}
      <motion.div
        className="absolute -top-32 left-1/4 w-[42rem] h-[42rem] bg-emerald-500/12 rounded-full blur-[120px]"
        aria-hidden="true"
        animate={shouldReduceMotion ? { opacity: 0.5 } : { opacity: [0.35, 0.6, 0.35], scale: [1, 1.08, 1] }}
        transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute bottom-0 right-1/5 w-[34rem] h-[34rem] bg-nebula-purple/12 rounded-full blur-[120px]"
        aria-hidden="true"
        animate={shouldReduceMotion ? { opacity: 0.5 } : { opacity: [0.3, 0.55, 0.3], scale: [1, 1.12, 1] }}
        transition={{ duration: 14, repeat: Infinity, ease: "easeInOut" }}
      />

      <div className="relative max-w-7xl mx-auto w-full">
        {/* Hero Content */}
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          {/* Left: Text Content */}
          <motion.div variants={heroContainer} initial="hidden" animate="visible">
            <motion.div variants={heroItem} className="mb-6">
              <motion.span
                className="inline-flex items-center gap-2 text-stellar-cyan font-mono text-sm tracking-wider uppercase"
              >
                <Sparkles className="w-4 h-4" aria-hidden="true" />
                {"// NEXT-GEN EXAM INTELLIGENCE"}
              </motion.span>
            </motion.div>

            <motion.h1
              variants={heroItem}
              className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold text-white leading-[1.08] mb-6"
            >
              Master Competitive Exams with
              <br />
              <span className="text-gradient">AI-Driven Precision</span>
            </motion.h1>

            <motion.p
              variants={heroItem}
              className="text-lg md:text-xl max-w-xl mb-8 leading-relaxed text-zinc-400"
            >
              Adaptive mock tests, automated flashcards, AI doubt solving, and daily streak tracking —
              all powered by cutting-edge AI to help you ace BCS, Bank, and Teacher recruitment exams.
            </motion.p>

            <motion.div
              variants={heroItem}
              className="flex flex-col sm:flex-row flex-wrap gap-3 sm:gap-4"
            >
              <motion.a
                href="/login?register=true"
                onClick={() => trackCtaClick("primary")}
                whileHover={shouldReduceMotion ? undefined : { scale: 1.04, y: -2 }}
                whileTap={shouldReduceMotion ? undefined : { scale: 0.97 }}
                transition={transitions.spring}
                className="w-full sm:w-auto px-6 py-3.5 text-base font-medium text-zinc-950 bg-emerald-500 rounded hover:bg-emerald-400 transition-colors font-mono shadow-neon-glow-lg flex items-center justify-center gap-2"
              >
                [ Start Free Prep ]
                <ChevronDown className="w-4 h-4" aria-hidden="true" />
              </motion.a>
              <motion.a
                href="#features"
                onClick={() => trackCtaClick("secondary")}
                whileHover={shouldReduceMotion ? undefined : { scale: 1.04, y: -2 }}
                whileTap={shouldReduceMotion ? undefined : { scale: 0.97 }}
                transition={transitions.spring}
                className="w-full sm:w-auto px-6 py-3.5 text-base font-medium text-zinc-100 border border-nebula-purple/30 rounded hover:bg-nebula-purple/10 transition-colors font-mono flex items-center justify-center gap-2"
              >
                [ Explore Features ]
              </motion.a>
            </motion.div>

            {/* Stats bar */}
            <motion.div
              variants={heroItem}
              className="mt-12 grid grid-cols-2 gap-6 sm:flex sm:flex-wrap sm:gap-10 text-center"
            >
              {stats.map((stat) => (
                <div key={stat.label}>
                  <div className="text-3xl font-bold text-emerald-500 font-mono tabular-nums">
                    <CountUp value={stat.value} decimals={stat.decimals} suffix={stat.suffix} />
                  </div>
                  <div className="text-sm text-zinc-400">{stat.label}</div>
                </div>
              ))}
            </motion.div>
          </motion.div>

          {/* Right: Terminal Simulation */}
          <motion.div
            initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, x: 30, scale: 0.96 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            transition={{ delay: 0.25, duration: 0.6, ease: "easeOut" }}
          >
            <motion.div
              onMouseMove={shouldReduceMotion ? undefined : tilt.onMouseMove}
              onMouseLeave={shouldReduceMotion ? undefined : tilt.onMouseLeave}
              style={shouldReduceMotion ? undefined : tilt.style}
              whileHover={shouldReduceMotion ? undefined : { scale: 1.015 }}
              transition={transitions.springStiff}
              className="glass-card rounded-terminal-rounded overflow-hidden border border-terminal-border shadow-neon-glow-lg"
            >
              {/* Terminal window bar */}
              <div className="terminal-window-bar">
                <div className="dot close" aria-label="Close" />
                <div className="dot minimize" aria-label="Minimize" />
                <div className="dot maximize" aria-label="Maximize" />
                <div className="flex-1 text-center text-xs text-zinc-500 font-mono">terminal.emulator.9th-grade-ai</div>
              </div>

              {/* Terminal content */}
              <div className="p-4 md:p-6 font-mono text-sm leading-relaxed h-[420px] sm:h-[500px] overflow-y-auto" ref={terminalRef}>
                <div className="space-y-1">
                  {lines.map((line, i) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.2 }}
                      className={line.type === "command" ? "text-emerald-400" :
                                line.type === "output" ? "text-zinc-300" :
                                line.type === "progress" ? "text-zinc-200" :
                                "text-emerald-300"}
                    >
                      {line.type === "command" && (
                        <>
                          <span className="text-stellar-cyan">$ </span>
                          <span className="cursor-blink">{line.text.replace("█", "")}</span>
                        </>
                      )}
                      {line.type === "output" && <span>{line.text}</span>}
                      {line.type === "progress" && (
                        <div className="flex items-center gap-3">
                          <span className="w-40 text-zinc-400">{line.label}</span>
                          <div className="flex-1 h-2 bg-zinc-800 rounded-full overflow-hidden">
                            <motion.div
                              initial={{ width: 0 }}
                              animate={{ width: `${(line.value / line.total) * 100}%` }}
                              transition={{ duration: 0.5, delay: 0.1 }}
                              className="h-full bg-gradient-to-r from-emerald-500 to-stellar-cyan rounded-full"
                            />
                          </div>
                          <span className="text-emerald-400 w-16 text-right font-mono">
                            {line.value}/{line.total}
                          </span>
                        </div>
                      )}
                      {line.type === "question" && (
                        <div className="ml-4 mt-2 space-y-1 border-l border-emerald-500/30 pl-3">
                          <p className="text-emerald-300">{line.text}</p>
                          {line.options.map((opt, oi) => (
                            <p key={oi} className={`text-sm ${oi === line.correct ? "text-emerald-400" : "text-zinc-400"}`}>
                              {oi === line.correct ? "▸ " : "  "}{opt}
                            </p>
                          ))}
                        </div>
                      )}
                    </motion.div>
                  ))}
                </div>

                {isComplete && (
                  <motion.button
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    onClick={restartAnimation}
                    className="mt-4 px-4 py-2 text-sm font-medium text-zinc-950 bg-emerald-500 rounded hover:bg-emerald-400 transition-colors font-mono flex items-center gap-2"
                  >
                    [ Restart Simulation ]
                  </motion.button>
                )}
              </div>
            </motion.div>
          </motion.div>
        </div>
      </div>

      {/* Scroll indicator */}
      <motion.div
        animate={shouldReduceMotion ? { opacity: 0.5 } : { y: [0, 10, 0] }}
        transition={{ duration: 1.5, repeat: Infinity }}
        className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 text-zinc-500"
        aria-hidden="true"
      >
        <span className="text-xs font-mono uppercase tracking-wider">Scroll</span>
        <ChevronDown className="w-5 h-5" />
      </motion.div>
      <FeedbackButton />
    </section>
  );
}