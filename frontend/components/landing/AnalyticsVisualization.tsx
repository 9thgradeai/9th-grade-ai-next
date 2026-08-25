"use client";

import { useEffect, useRef, useState } from "react";
import {
  motion,
  useInView,
  useReducedMotion,
} from "framer-motion";
import { EASE_OUT_EXPO } from "@/lib/motion/variants";

/**
 * Sample dashboard visualization. Metrics animate exactly once on entering
 * the viewport, then hold still — no continuous loops. Values are clearly
 * labelled as a sample preview by the section shell (data honesty).
 */

function useCountUp(target: number, decimals = 0) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-60px" });
  const shouldReduceMotion = useReducedMotion();
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    if (!inView) return;
    // Reduced motion: jump straight to the target, one frame out so the
    // effect body itself stays setState-free.
    if (shouldReduceMotion) {
      const id = requestAnimationFrame(() => setDisplay(target));
      return () => cancelAnimationFrame(id);
    }
    let raf = 0;
    const start = performance.now();
    const duration = 1100;
    const tick = (now: number) => {
      const p = Math.min((now - start) / duration, 1);
      setDisplay((1 - Math.pow(1 - p, 3)) * target);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [inView, target, shouldReduceMotion]);

  return {
    ref,
    text: display.toLocaleString(undefined, {
      maximumFractionDigits: decimals,
      minimumFractionDigits: decimals,
    }),
  };
}

const ACCURACY = 0.78;
const RADIUS = 54;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export default function AnalyticsVisualization() {
  return (
    <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
      {/* Accuracy ring */}
      <Card className="lg:row-span-1">
        <CardLabel>Accuracy tracking</CardLabel>
        <div className="flex items-center justify-center py-4">
          <div className="relative h-36 w-36">
            <svg viewBox="0 0 128 128" className="h-full w-full -rotate-90" aria-hidden="true">
              <circle cx="64" cy="64" r={RADIUS} fill="none" stroke="#1c2340" strokeWidth="9" />
              <motion.circle
                cx="64" cy="64" r={RADIUS}
                fill="none"
                stroke="url(#an-ring)"
                strokeWidth="9"
                strokeLinecap="round"
                strokeDasharray={CIRCUMFERENCE}
                initial={{ strokeDashoffset: CIRCUMFERENCE }}
                whileInView={{ strokeDashoffset: CIRCUMFERENCE * (1 - ACCURACY) }}
                viewport={{ once: true, margin: "-80px" }}
                transition={{ duration: 1.2, ease: EASE_OUT_EXPO }}
              />
              <defs>
                <linearGradient id="an-ring" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#2dd4bf" />
                  <stop offset="100%" stopColor="#a78bfa" />
                </linearGradient>
              </defs>
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <RingNumber />
              <span className="font-mono text-[0.6rem] uppercase tracking-[0.18em] text-zinc-500">overall</span>
            </div>
          </div>
        </div>
        <p className="text-sm leading-relaxed text-zinc-400">
          Rolling accuracy across your last 200 attempts — trend-adjusted, not a lifetime average.
        </p>
      </Card>

      {/* Improvement trend */}
      <Card className="md:col-span-2">
        <CardLabel>Improvement trend</CardLabel>
        <div className="flex items-end gap-6">
          <TrendValue />
          <svg viewBox="0 0 320 96" className="mb-1 h-24 flex-1" preserveAspectRatio="none" aria-hidden="true">
            <defs>
              <linearGradient id="an-line" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#22d3ee" />
                <stop offset="100%" stopColor="#a78bfa" />
              </linearGradient>
              <linearGradient id="an-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#818cf8" stopOpacity="0.22" />
                <stop offset="100%" stopColor="#818cf8" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path
              d="M 0 74 C 40 70, 60 62, 90 58 S 150 52, 180 42 S 250 30, 320 14 L 320 96 L 0 96 Z"
              fill="url(#an-fill)"
            />
            <motion.path
              d="M 0 74 C 40 70, 60 62, 90 58 S 150 52, 180 42 S 250 30, 320 14"
              fill="none"
              stroke="url(#an-line)"
              strokeWidth="2.5"
              strokeLinecap="round"
              initial={{ pathLength: 0 }}
              whileInView={{ pathLength: 1 }}
              viewport={{ once: true, margin: "-80px" }}
              transition={{ duration: 1.4, ease: EASE_OUT_EXPO }}
            />
          </svg>
        </div>
        <p className="mt-2 text-sm leading-relaxed text-zinc-400">
          Projected score trajectory based on your last four weeks of practice velocity.
        </p>
      </Card>

      {/* Consistency */}
      <Card>
        <CardLabel>Consistency</CardLabel>
        <p className="mt-1 font-display text-3xl font-semibold text-white">Strong</p>
        <div className="mt-4 flex h-12 items-end gap-1.5" aria-hidden="true">
          {[38, 55, 44, 68, 60, 82, 74].map((height, i) => (
            <motion.span
              key={i}
              className={`w-full rounded-t-sm ${i === 5 ? "bg-emerald-400/90" : "bg-emerald-400/35"}`}
              initial={{ scaleY: 0 }}
              whileInView={{ scaleY: 1 }}
              viewport={{ once: true, margin: "-80px" }}
              transition={{ duration: 0.45, delay: 0.15 + i * 0.06, ease: EASE_OUT_EXPO }}
              style={{ height: `${height}%`, transformOrigin: "bottom" }}
            />
          ))}
        </div>
        <p className="mt-3 text-sm leading-relaxed text-zinc-400">Daily practice held across the week.</p>
      </Card>

      {/* Topic mastery */}
      <Card>
        <CardLabel>Topic mastery</CardLabel>
        <p className="mt-1 font-display text-3xl font-semibold tabular-nums text-white">
          <MasteryFraction />
          <span className="ml-1 text-base font-normal text-zinc-500">/48 topics</span>
        </p>
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/[0.07]" aria-hidden="true">
          <motion.div
            className="h-full w-full origin-left rounded-full bg-gradient-to-r from-emerald-400 to-cyan-400"
            initial={{ scaleX: 0 }}
            whileInView={{ scaleX: 12 / 48 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 1, delay: 0.2, ease: EASE_OUT_EXPO }}
          />
        </div>
        <p className="mt-3 text-sm leading-relaxed text-zinc-400">Mastered to a 90%+ retention threshold.</p>
      </Card>

      {/* Weaknesses found */}
      <Card>
        <CardLabel>Weaknesses found</CardLabel>
        <p className="mt-1 font-display text-3xl font-semibold tabular-nums text-amber-400">
          <WeaknessCount />
        </p>
        <ul className="mt-4 space-y-1.5" aria-hidden="true">
          {["সমাস — compound forms", "Percentage shortcuts", "Map-based geography"].map((item, i) => (
            <motion.li
              key={item}
              className="flex items-center gap-2 font-mono text-xs text-zinc-400"
              initial={{ opacity: 0, x: -8 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true, margin: "-80px" }}
              transition={{ duration: 0.4, delay: 0.25 + i * 0.09 }}
            >
              <span className="h-1 w-1 rounded-full bg-amber-400/80" />
              {item}
            </motion.li>
          ))}
        </ul>
        <p className="mt-3 text-sm leading-relaxed text-zinc-400">Each one queued into your revision plan.</p>
      </Card>
    </div>
  );
}

/* Animated numerals (isolated so hooks stay per-card) */

function RingNumber() {
  const { ref, text } = useCountUp(78);
  return (
    <span ref={ref} className="font-display text-3xl font-semibold tabular-nums text-white">
      {text}%
    </span>
  );
}

function TrendValue() {
  const { ref, text } = useCountUp(12);
  return (
    <span ref={ref} className="whitespace-nowrap font-display text-5xl font-semibold tabular-nums text-gradient">
      +{text}%
    </span>
  );
}

function MasteryFraction() {
  const { ref, text } = useCountUp(12);
  return <span ref={ref}>{text}</span>;
}

function WeaknessCount() {
  const { ref, text } = useCountUp(7);
  return <span ref={ref}>{text}</span>;
}

/* Shared card chrome */

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`glass-card rounded-2xl p-6 ${className}`}>
      {children}
    </div>
  );
}

function CardLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="font-mono text-xs uppercase tracking-[0.16em] text-zinc-500">{children}</p>
  );
}
