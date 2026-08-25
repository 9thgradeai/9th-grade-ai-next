"use client";

import { useRef } from "react";
import { motion, useInView, useReducedMotion, useScroll, useSpring } from "framer-motion";
import { BookOpenCheck, BrainCircuit, FileText, Lightbulb, Network } from "lucide-react";
import { EASE_OUT_EXPO } from "@/lib/motion/variants";

/**
 * AI-tutor reasoning timeline. The spine draws itself as the user scrolls
 * (scroll-linked transform — no rAF loop), and each stage lights up once as
 * it enters the viewport. Shows conceptual processing stages only.
 */

const STAGES = [
  {
    icon: FileText,
    title: "Candidate Question",
    body: "A real exam-style question enters the tutor — typed, uploaded, or pulled straight from a mock test you just finished.",
    accent: false,
  },
  {
    icon: BrainCircuit,
    title: "AI Identifies Concepts",
    body: "Before answering anything, the tutor classifies which concepts the question actually tests.",
    concepts: ["সমাস (compounds)", "number agreement", "orthography"],
    accent: false,
  },
  {
    icon: Network,
    title: "Knowledge Nodes Illuminate",
    body: "Those concepts light up against your history: mastered, shaky, or never seen.",
    concepts: ["mastered ×14", "shaky ×3", "new"],
    accent: true,
  },
  {
    icon: Lightbulb,
    title: "Explanation Path Forms",
    body: "The explanation is assembled along your weakest connected concept first — in Bangla or English, your choice.",
    accent: false,
  },
  {
    icon: BookOpenCheck,
    title: "Understanding Expands",
    body: "The session closes the loop: similar questions queue up, a spaced-repetition card is drafted, and the graph updates.",
    accent: false,
  },
] as const;

export default function TutorTimeline() {
  const containerRef = useRef<HTMLOListElement>(null);
  const shouldReduceMotion = useReducedMotion();
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start 0.8", "end 0.55"],
  });
  const progress = useSpring(scrollYProgress, { stiffness: 90, damping: 24 });

  return (
    <ol ref={containerRef} className="relative mx-auto max-w-2xl" aria-label="How the AI tutor reasons">
      {/* Spine */}
      <span aria-hidden="true" className="absolute bottom-4 left-[15px] top-4 w-px bg-white/10" />
      {!shouldReduceMotion && (
        <motion.span
          aria-hidden="true"
          className="absolute bottom-4 left-[15px] top-4 w-px origin-top bg-gradient-to-b from-emerald-400 via-cyan-400 to-violet-400"
          style={{ scaleY: progress }}
        />
      )}

      {STAGES.map((stage, i) => (
        <Stage key={stage.title} stage={stage} index={i} />
      ))}
    </ol>
  );
}

function Stage({
  stage,
  index,
}: {
  stage: (typeof STAGES)[number];
  index: number;
}) {
  const ref = useRef<HTMLLIElement>(null);
  const inView = useInView(ref, { once: true, margin: "-18% 0px -18% 0px" });
  const Icon = stage.icon;

  return (
    <li ref={ref} className="relative flex gap-5 pb-12 last:pb-0">
      <span
        aria-hidden="true"
        className={`z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border transition-all duration-700 ${
          inView
            ? "border-emerald-400/70 bg-emerald-500/15 text-emerald-400 shadow-glow-sm"
            : "border-white/15 bg-[#071019] text-zinc-600"
        }`}
      >
        <Icon className="h-4 w-4" />
      </span>

      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={inView ? { opacity: 1, y: 0 } : undefined}
        transition={{ duration: 0.55, ease: EASE_OUT_EXPO, delay: index === 0 ? 0 : 0.08 }}
        className="min-w-0 flex-1 pt-1"
      >
        <div className="flex items-baseline gap-3">
          <h3 className="font-display text-lg font-semibold text-white">{stage.title}</h3>
          <span className="font-mono text-[0.65rem] tabular-nums text-zinc-600" aria-hidden="true">
            {String(index + 1).padStart(2, "0")}
          </span>
        </div>
        <p className="mt-1.5 max-w-lg text-sm leading-relaxed text-zinc-400">{stage.body}</p>

        {"concepts" in stage ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {stage.concepts.map((concept) => (
              <span
                key={concept}
                className={`rounded-full border px-3 py-1 font-mono text-xs transition-colors duration-500 ${
                  inView
                    ? stage.accent
                      ? "border-violet-400/40 bg-violet-500/10 text-violet-300"
                      : "border-emerald-400/30 bg-emerald-500/[0.07] text-emerald-300"
                    : "border-white/10 text-zinc-600"
                }`}
              >
                {concept}
              </span>
            ))}
          </div>
        ) : null}

        {index === 0 && (
          <div className="glass-card mt-4 max-w-md rounded-xl p-4">
            <p className="mb-2 font-mono text-[0.65rem] uppercase tracking-[0.16em] text-zinc-500">
              BCS Preliminary · Bangla
            </p>
            <p lang="bn" className="text-sm leading-relaxed text-zinc-200">
              &ldquo;দশ আনন&rdquo; এর সমাস কোনটি?
            </p>
          </div>
        )}
      </motion.div>
    </li>
  );
}
