"use client";

import { useRef } from "react";
import {
  motion,
  motionValue,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
  type MotionValue,
} from "framer-motion";
import { BookOpen, CircleAlert, GraduationCap, Repeat2, Target } from "lucide-react";

/**
 * Study-planner path: Weak Topic → Concept Review → Practice → Revision →
 * Mastery. The route draws itself as the user scrolls (scroll-linked
 * transforms only — no animation loop) and each stop activates in sequence.
 */

const STEPS = [
  {
    icon: CircleAlert,
    title: "Weak Topic",
    body: "Diagnosed by the engine, not guessed by you.",
    x: 0.03, y: 0.68, labelSide: "below" as const,
  },
  {
    icon: BookOpen,
    title: "Concept Review",
    body: "The shortest explanation that closes the gap.",
    x: 0.26, y: 0.36, labelSide: "above" as const,
  },
  {
    icon: Target,
    title: "Practice",
    body: "A right-sized set aimed exactly at that gap.",
    x: 0.49, y: 0.62, labelSide: "below" as const,
  },
  {
    icon: Repeat2,
    title: "Revision",
    body: "Spaced returns before forgetting begins.",
    x: 0.72, y: 0.3, labelSide: "above" as const,
  },
  {
    icon: GraduationCap,
    title: "Mastery",
    body: "Locked in — tracked, maintained, exam-ready.",
    x: 0.95, y: 0.44, labelSide: "below" as const,
  },
];

const ROUTE =
  "M 30 204 C 120 140, 180 108, 260 108 C 350 108, 400 186, 490 186 C 590 186, 630 90, 720 90 C 810 90, 880 132, 950 132";

// Constant MotionValue so reduced-motion renders share the same hook path.
const fullProgress: MotionValue<number> = motionValue(1);

export default function PlannerTimeline() {
  const ref = useRef<HTMLDivElement>(null);
  const shouldReduceMotion = useReducedMotion();
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start 0.82", "end 0.45"],
  });
  const progress = useSpring(scrollYProgress, { stiffness: 80, damping: 26 });
  const drawProgress = shouldReduceMotion ? null : progress;

  return (
    <div ref={ref}>
      {/* Desktop curved path */}
      <div className="relative mx-auto hidden aspect-[1000/300] w-full max-w-5xl md:block" aria-hidden="true">
        <svg viewBox="0 0 1000 300" className="absolute inset-0 h-full w-full">
          <defs>
            <linearGradient id="pl-route" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#fb923c" />
              <stop offset="35%" stopColor="#2dd4bf" />
              <stop offset="100%" stopColor="#a78bfa" />
            </linearGradient>
          </defs>
          {/* Ghost route */}
          <path d={ROUTE} fill="none" stroke="#1c2340" strokeWidth="2" strokeDasharray="2 8" strokeLinecap="round" />
          {/* Scroll-drawn route */}
          {drawProgress ? (
            <motion.path
              d={ROUTE}
              fill="none"
              stroke="url(#pl-route)"
              strokeWidth="2.5"
              strokeLinecap="round"
              style={{ pathLength: drawProgress }}
            />
          ) : (
            <path d={ROUTE} fill="none" stroke="url(#pl-route)" strokeWidth="2.5" strokeLinecap="round" />
          )}
        </svg>

        {STEPS.map((step, i) => (
          <PlannerStop key={step.title} step={step} index={i} progress={drawProgress} />
        ))}
      </div>

      {/* Mobile vertical timeline */}
      <ol className="relative mx-auto max-w-md md:hidden" aria-label="Planner stages">
        <span aria-hidden="true" className="absolute bottom-4 left-[15px] top-4 w-px bg-white/10" />
        {!shouldReduceMotion && (
          <motion.span
            aria-hidden="true"
            className="absolute bottom-4 left-[15px] top-4 w-px origin-top bg-gradient-to-b from-orange-400 via-emerald-400 to-violet-400"
            style={{ scaleY: scrollYProgress }}
          />
        )}
        {STEPS.map(({ icon: Icon, title, body }) => (
          <li key={title} className="relative flex gap-4 pb-8 last:pb-0">
            <span className="z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-emerald-500/30 bg-[#071019] text-emerald-400">
              <Icon className="h-4 w-4" />
            </span>
            <div className="min-w-0 pt-0.5">
              <h3 className="font-display text-base font-semibold text-white">{title}</h3>
              <p className="mt-0.5 text-sm leading-relaxed text-zinc-400">{body}</p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

function PlannerStop({
  step,
  index,
  progress,
}: {
  step: (typeof STEPS)[number];
  index: number;
  progress: MotionValue<number> | null;
}) {
  const appearAt = Math.max(0, (index - 0.35) / STEPS.length);
  const fullyAt = Math.min(1, (index + 0.65) / STEPS.length);
  const opacity = useTransform(progress ?? fullProgress, [appearAt, fullyAt], [0.15, 1]);
  const Icon = step.icon;
  const isLast = index === STEPS.length - 1;

  return (
    <motion.div
      // clamp() keeps the 160px-wide label inside the container at every
      // breakpoint — edge stops (x=0.03 / x=0.95) used to spill past the
      // viewport on tablet widths.
      style={{
        left: `clamp(5rem, ${step.x * 100}%, calc(100% - 5rem))`,
        top: `${step.y * 100}%`,
        opacity,
      }}
      className={`absolute flex w-40 -translate-x-1/2 flex-col items-center text-center ${
        step.labelSide === "above" ? "-translate-y-full pb-4" : "translate-y-0 pt-4"
      }`}
    >
      <span
        className={`flex h-11 w-11 items-center justify-center rounded-xl border transition-colors duration-500 ${
          isLast
            ? "border-violet-400/50 bg-violet-500/10 text-violet-300"
            : "border-emerald-500/30 bg-[#071019] text-emerald-400"
        }`}
      >
        <Icon className="h-5 w-5" />
      </span>
      <p className="mt-2 font-display text-sm font-semibold text-white">{step.title}</p>
      <p className="mt-1 font-mono text-[0.65rem] uppercase tracking-[0.12em] text-zinc-500">{step.body}</p>
    </motion.div>
  );
}
