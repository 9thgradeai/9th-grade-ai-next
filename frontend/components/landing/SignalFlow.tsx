"use client";

import { useRef, useState, type ReactNode } from "react";
import { motion, useInView, useReducedMotion } from "framer-motion";
import { CheckCircle2, CircleHelp, FileQuestion, Gauge, Lightbulb } from "lucide-react";
import { EASE_OUT_EXPO } from "@/lib/motion/variants";
import { useMotionCapabilities } from "@/lib/motion/device";

type SignalMode = "idle" | "correct" | "wrong";

const STAGES = [
  { id: "question", label: "Question", icon: FileQuestion },
  { id: "response", label: "Response", icon: CircleHelp },
  { id: "analysis", label: "Analysis", icon: Gauge },
  { id: "insight", label: "Insight", icon: Lightbulb },
] as const;

/**
 * Live signal pipeline. Animations run ONLY while the section is near the
 * viewport; picking a mode replays one coherent sequence that communicates
 * where an answer's signal ends up. Reduced motion renders the end state
 * statically.
 */
export default function SignalFlow() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { margin: "-15% 0px -15% 0px" });
  const shouldReduceMotion = useReducedMotion();
  const [mode, setMode] = useState<SignalMode>("idle");
  const [cycle, setCycle] = useState(0);

  const { continuousEffects } = useMotionCapabilities();
  const animate = continuousEffects && inView;

  const activate = (next: Exclude<SignalMode, "idle">) => {
    setMode(next);
    if (!shouldReduceMotion) setCycle((c) => c + 1);
  };

  return (
    <div ref={ref} className="relative">
      <div className="mb-10 flex flex-wrap items-center justify-center gap-3" role="group" aria-label="Simulate an answer">
        <ModeButton active={mode === "correct"} onClick={() => activate("correct")} tone="emerald">
          <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
          Correct answer
        </ModeButton>
        <ModeButton active={mode === "wrong"} onClick={() => activate("wrong")} tone="amber">
          <CircleHelp className="h-4 w-4" aria-hidden="true" />
          Incorrect answer
        </ModeButton>
      </div>

      <p aria-live="polite" className="sr-only">
        {mode === "correct"
          ? "Correct answer: the signal strengthens the pathway and reinforces the underlying concepts."
          : mode === "wrong"
            ? "Incorrect answer: the signal exposes a weak concept and redirects toward a targeted review."
            : ""}
      </p>

      {/* Desktop pipeline */}
      <div className="hidden md:block" aria-hidden="true">
        <DesktopPipeline mode={mode} cycle={cycle} animate={animate} />
      </div>

      {/* Mobile vertical flow */}
      <MobilePipeline mode={mode} />
    </div>
  );
}

function ModeButton({
  active,
  onClick,
  tone,
  children,
}: {
  active: boolean;
  onClick: () => void;
  tone: "emerald" | "amber";
  children: ReactNode;
}) {
  const activeCls =
    tone === "emerald"
      ? "border-emerald-400/70 bg-emerald-500/12 text-white shadow-glow-sm"
      : "border-amber-400/70 bg-amber-500/10 text-white shadow-[0_0_20px_rgba(251,191,36,0.18)]";
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex min-h-[44px] items-center gap-2 rounded-full border px-5 py-2 font-mono text-sm transition-all duration-200 ${
        active
          ? activeCls
          : "border-white/12 bg-white/[0.03] text-zinc-300 hover:border-emerald-400/40 hover:text-white"
      }`}
    >
      {children}
    </button>
  );
}

/* ---------- Desktop ---------- */

const X = [90, 330, 570, 810];
const Y = 110;
const WEAK = { x: 570, y: 196 };

function Segment({
  x1, y1, x2, y2,
  color,
  delay,
  animate,
}: {
  x1: number; y1: number; x2: number; y2: number;
  color: string;
  delay: number;
  animate: boolean;
}) {
  if (!animate) {
    return <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth="1.6" strokeLinecap="round" />;
  }
  return (
    <motion.line
      x1={x1} y1={y1} x2={x2} y2={y2}
      stroke={color}
      strokeWidth="1.6"
      strokeLinecap="round"
      initial={{ pathLength: 0 }}
      animate={{ pathLength: 1 }}
      transition={{ duration: 0.45, delay, ease: EASE_OUT_EXPO }}
    />
  );
}

function DesktopPipeline({ mode, cycle, animate }: { mode: SignalMode; cycle: number; animate: boolean }) {
  const lit = mode !== "idle";
  const correct = mode === "correct";
  const segColor = correct ? "#2dd4bf" : "#fbbf24";

  return (
    <svg viewBox="0 0 900 240" className="mx-auto w-full max-w-4xl">
      {/* Base connectors */}
      {[0, 1, 2].map((i) => (
        <line
          key={`base-${i}`}
          x1={X[i] + 34} y1={Y} x2={X[i + 1] - 38} y2={Y}
          stroke="#3f4a63" strokeWidth="1" strokeDasharray="3 7"
        />
      ))}
      <path d={`M ${X[2]} ${Y + 26} L ${WEAK.x} ${WEAK.y - 16}`} stroke="#3f4a63" strokeWidth="1" strokeDasharray="3 7" fill="none" opacity="0.6" />

      {/* Lit overlays */}
      {lit && (
        <g key={`lit-${mode}-${cycle}`}>
          {[0, 1].map((i) => (
            <Segment key={`seg-${i}`} x1={X[i] + 34} y1={Y} x2={X[i + 1] - 38} y2={Y} color={segColor} delay={0.15 + i * 0.42} animate={animate} />
          ))}
          {!correct ? (
            <>
              <Segment x1={X[2] + 34} y1={Y} x2={X[3] - 38} y2={Y} color="#3f4a63" delay={1} animate={false} />
              <Segment x1={X[2]} y1={Y + 26} x2={WEAK.x} y2={WEAK.y - 16} color={segColor} delay={1.45} animate={animate} />
            </>
          ) : (
            <Segment x1={X[2] + 34} y1={Y} x2={X[3] - 38} y2={Y} color={segColor} delay={0.99} animate={animate} />
          )}
        </g>
      )}

      {/* Travelling pulse */}
      {lit && animate && (
        <motion.g
          key={`pulse-${mode}-${cycle}`}
          initial={{ x: X[0], y: Y, opacity: 0 }}
          animate={
            correct
              ? { x: [X[0], X[1], X[2], X[3]], y: [Y, Y, Y, Y], opacity: [0, 1, 1, 0.9] }
              : { x: [X[0], X[1], X[2], WEAK.x], y: [Y, Y, Y, WEAK.y], opacity: [0, 1, 1, 0.9] }
          }
          transition={{ duration: 1.7, delay: 0.2, times: [0, 0.33, 0.66, 1], ease: "linear" }}
        >
          <circle r="4" fill={segColor} opacity="0.35" />
          <circle r="2" fill={segColor} />
        </motion.g>
      )}

      {/* Stage nodes */}
      {STAGES.map(({ id, label }, i) => {
        const reached = !lit || (correct ? true : i <= 2);
        return (
          <g key={id} opacity={reached ? 1 : 0.4}>
            <circle
              cx={X[i]} cy={Y} r="26"
              fill="rgba(11,14,30,0.9)"
              stroke={reached && lit ? segColor : "#3f4a63"}
              strokeWidth={reached && lit && i === 3 ? 2 : 1.1}
            />
            <text
              x={X[i]} y={Y + 58}
              textAnchor="middle"
              fill={reached && lit ? "#e7ecff" : "#8f97b2"}
              fontSize="13"
              fontFamily="var(--font-mono)"
            >
              {label}
            </text>
          </g>
        );
      })}

      {/* Weakness node */}
      <g opacity={mode === "wrong" ? 1 : 0.3}>
        <rect
          x={WEAK.x - 74} y={WEAK.y - 16} width="148" height="32" rx="16"
          fill="rgba(25,17,4,0.92)"
          stroke={mode === "wrong" ? "#fbbf24" : "#3f4a63"}
          strokeWidth="1.1"
        />
        <text
          x={WEAK.x} y={WEAK.y + 4}
          textAnchor="middle"
          fill={mode === "wrong" ? "#fbbf24" : "#8f97b2"}
          fontSize="11"
          fontFamily="var(--font-mono)"
        >
          WEAK CONCEPT
        </text>
      </g>

      {/* Outcome caption */}
      <text
        x="450" y="228" textAnchor="middle" fontSize="11.5" fontFamily="var(--font-mono)"
        fill={mode === "idle" ? "#5b6478" : correct ? "#2dd4bf" : "#fbbf24"}
        opacity={lit ? 1 : 0.7}
      >
        {mode === "idle"
          ? "SIMULATE AN ANSWER TO TRACE ITS SIGNAL"
          : correct
            ? "PATHWAY STRENGTHENED — CONCEPT NODE REINFORCED"
            : "SIGNAL REDIRECTED — WEAKNESS QUEUED FOR REVIEW"}
      </text>
    </svg>
  );
}

/* ---------- Mobile ---------- */

function MobilePipeline({ mode }: { mode: SignalMode }) {
  const lit = mode !== "idle";
  const correct = mode === "correct";

  return (
    <ol className="mx-auto max-w-sm space-y-0 md:hidden" aria-hidden="true">
      {STAGES.map(({ id, label, icon: Icon }, i) => {
        const reached = !lit || (correct ? true : i <= 2);
        const accent = reached && lit ? (correct ? "text-emerald-400 border-emerald-400/70" : "text-amber-400 border-amber-400/70") : "text-zinc-500 border-white/15";
        const connector = lit && (correct ? i < STAGES.length - 1 : i < 2)
          ? correct ? "bg-emerald-400/60" : "bg-amber-400/60"
          : "bg-white/10";
        return (
          <li key={id} className="relative flex flex-col items-center pb-9 last:pb-0">
            {i < STAGES.length - 1 && (
              <span aria-hidden="true" className={`absolute left-1/2 top-11 h-[calc(100%-2.75rem)] w-px ${connector}`} />
            )}
            <span className={`flex h-11 w-11 items-center justify-center rounded-full border bg-[#071019] ${accent}`}>
              <Icon className="h-5 w-5" aria-hidden="true" />
            </span>
            <span className="mt-2 font-mono text-xs text-zinc-300">{label}</span>
          </li>
        );
      })}
      {mode === "wrong" && (
        <li className="flex justify-center pt-2">
          <span className="rounded-full border border-amber-400/60 bg-amber-500/10 px-4 py-1.5 font-mono text-xs text-amber-400">
            WEAK CONCEPT — QUEUED FOR REVIEW
          </span>
        </li>
      )}
    </ol>
  );
}
