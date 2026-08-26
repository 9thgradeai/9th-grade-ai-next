"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useInView } from "framer-motion";
import { Activity, Compass, SlidersHorizontal, ListChecks, ArrowRightCircle } from "lucide-react";
import { EASE_OUT_EXPO } from "@/lib/motion/variants";
import { useMotionCapabilities } from "@/lib/motion/device";

/**
 * The practice loop rendered as a circular system (desktop) and a vertical
 * pipeline (mobile). A single active-node cursor advances on a slow interval
 * ONLY while the section is on screen, the tab is visible, and the device
 * allows continuous effects.
 */

const LOOP_STEPS = [
  { id: "practice", label: "Practice", icon: Activity },
  { id: "track", label: "Track Accuracy", icon: Compass },
  { id: "review", label: "Review Flashcards", icon: SlidersHorizontal },
  { id: "focus", label: "Focus Weak Topics", icon: ListChecks },
  { id: "repeat", label: "Next Session", icon: ArrowRightCircle },
] as const;

// Polar placement on a 38%-radius orbit (percent coordinates).
const ORBIT_ANGLES = [-90, -18, 54, 126, 198] as const;
const NODE_POS = ORBIT_ANGLES.map((deg) => {
  const rad = (deg * Math.PI) / 180;
  return {
    x: 50 + 38 * Math.cos(rad),
    y: 50 + 38 * Math.sin(rad),
  };
});

export default function AdaptiveLoop() {
  const containerRef = useRef<HTMLDivElement>(null);
  const inView = useInView(containerRef, { margin: "-20% 0px -20% 0px" });
  const [activeIndex, setActiveIndex] = useState(0);
  const hoveringRef = useRef(false);

  const { continuousEffects } = useMotionCapabilities();

  useEffect(() => {
    if (!continuousEffects || !inView) return;
    const interval = setInterval(() => {
      if (!hoveringRef.current && document.visibilityState === "visible") {
        setActiveIndex((i) => (i + 1) % LOOP_STEPS.length);
      }
    }, 2200);
    return () => clearInterval(interval);
  }, [continuousEffects, inView]);

  return (
    <div ref={containerRef}>
      {/* Desktop orbital loop */}
      <div
        className="relative mx-auto hidden aspect-square w-full max-w-[560px] md:block"
        aria-hidden="true"
      >
        <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full">
          <defs>
            <linearGradient id="al-orbit" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#2dd4bf" stopOpacity="0.5" />
              <stop offset="100%" stopColor="#a78bfa" stopOpacity="0.4" />
            </linearGradient>
          </defs>
          <circle cx="50" cy="50" r="38" fill="none" stroke="#232a44" strokeWidth="0.35" />
          <circle
            cx="50" cy="50" r="38"
            fill="none"
            stroke="url(#al-orbit)"
            strokeWidth="0.7"
            strokeLinecap="round"
            strokeDasharray="24 215"
            className={continuousEffects ? "hud-ring" : undefined}
          />
          {/* Spokes that brighten toward the active node */}
          {LOOP_STEPS.map((step, i) => (
            <line
              key={`spoke-${step.id}`}
              x1="50" y1="50"
              x2={NODE_POS[i].x} y2={NODE_POS[i].y}
              stroke={i === activeIndex ? "#2dd4bf" : "#232a44"}
              strokeWidth={i === activeIndex ? 0.45 : 0.25}
              opacity={i === activeIndex ? 0.55 : 1}
              className="transition-all duration-700"
            />
          ))}
        </svg>

        {/* Core */}
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-center">
          <div className="glass-card flex h-36 w-36 flex-col items-center justify-center rounded-full border-emerald-500/25 sm:h-40 sm:w-40">
            <span className="pulse-soft mb-2 h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-glow-sm" />
            <span className="font-mono text-[0.6rem] uppercase tracking-[0.22em] text-zinc-400">
              Practice
            </span>
            <span className="font-display text-lg font-semibold text-white">Loop</span>
          </div>
        </div>

        {/* Nodes */}
        {LOOP_STEPS.map((step, i) => (
          <motion.button
            key={step.id}
            type="button"
            tabIndex={-1}
            initial={{ opacity: 0, scale: 0.8 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ duration: 0.45, delay: i * 0.09, ease: EASE_OUT_EXPO }}
            onMouseEnter={() => {
              hoveringRef.current = true;
              setActiveIndex(i);
            }}
            onMouseLeave={() => {
              hoveringRef.current = false;
            }}
            onFocus={() => setActiveIndex(i)}
            style={{ left: `${NODE_POS[i].x}%`, top: `${NODE_POS[i].y}%` }}
            className="absolute -translate-x-1/2 -translate-y-1/2"
          >
            <span
              className={`flex items-center gap-2 whitespace-nowrap rounded-full border px-3.5 py-2 font-mono text-xs backdrop-blur-sm transition-all duration-500 ${
                i === activeIndex
                  ? "border-emerald-400/70 bg-emerald-500/12 text-white shadow-glow-sm"
                  : "border-white/12 bg-white/[0.04] text-zinc-300"
              }`}
            >
              <step.icon className={`h-3.5 w-3.5 ${i === activeIndex ? "text-emerald-400" : "text-zinc-500"}`} aria-hidden="true" />
              {step.label}
            </span>
          </motion.button>
        ))}
      </div>

      {/* Mobile / low-tier vertical pipeline — shares the live cursor */}
      <ol className="mx-auto max-w-md space-y-0 md:hidden" aria-label="Practice loop stages">
        {LOOP_STEPS.map((step, i) => (
          <li key={step.id} className="relative flex gap-4 pb-7 last:pb-0">
            {i < LOOP_STEPS.length - 1 && (
              <span
                aria-hidden="true"
                className={`absolute bottom-0 left-[15px] top-10 w-px ${
                  i < activeIndex ? "bg-emerald-400/50" : "bg-white/10"
                }`}
              />
            )}
            <span
              className={`z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border transition-colors duration-500 ${
                i === activeIndex
                  ? "border-emerald-400/70 bg-emerald-500/12 text-emerald-400"
                  : "border-white/15 bg-[#071019] text-zinc-500"
              }`}
            >
              <step.icon className="h-4 w-4" aria-hidden="true" />
            </span>
            <div className="min-w-0 pt-1">
              <p className={`font-medium transition-colors duration-500 ${i === activeIndex ? "text-white" : "text-zinc-300"}`}>
                {step.label}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
