"use client";

import { useRef } from "react";
import {
  motion,
  motionValue,
  useReducedMotion,
  useScroll,
  useTransform,
  type MotionValue,
} from "framer-motion";

const LINES = [
  { text: "DON'T JUST MEASURE PREPARATION.", gradient: false },
  { text: "UNDERSTAND IT.", gradient: false },
  { text: "IMPROVE IT.", gradient: true },
];

// Constant MotionValue so reduced-motion renders skip scroll linkage.
const FULL_OPACITY: MotionValue<number> = motionValue(1);

/**
 * Cinematic typography moment. Word opacity is scroll-linked (no timers),
 * the reveal window is short so readers never wait for the phrase, and
 * reduced motion renders everything fully visible.
 */
export default function PhilosophySection() {
  const ref = useRef<HTMLDivElement>(null);
  const shouldReduceMotion = useReducedMotion();
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start 0.85", "end 0.55"],
  });

  return (
    <section id="philosophy" className="relative scroll-mt-16 px-4 py-28 sm:px-6 md:py-40" aria-label="Philosophy">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 55% 42% at 50% 50%, rgba(129,140,248,0.06), transparent 62%)",
        }}
      />
      <div ref={ref} className="relative mx-auto max-w-5xl text-center">
        {LINES.map((line) => (
          <p
            key={line.text}
            className={`font-display font-semibold uppercase leading-[1.08] tracking-tight text-[clamp(1.7rem,5.4vw,4rem)] ${
              line.gradient ? "text-gradient" : "text-white"
            }`}
          >
            <Words text={line.text} progress={shouldReduceMotion ? FULL_OPACITY : scrollYProgress} />
          </p>
        ))}
      </div>
    </section>
  );
}

function Words({ text, progress }: { text: string; progress: MotionValue<number> }) {
  const words = text.split(" ");
  const total = words.length;

  return (
    <>
      {words.map((word, i) => (
        <Word
          key={`${word}-${i}`}
          word={word}
          range={[i / total, Math.min(1, (i + 1.2) / total)]}
          progress={progress}
        />
      ))}
    </>
  );
}

function Word({
  word,
  range,
  progress,
}: {
  word: string;
  range: [number, number];
  progress: MotionValue<number>;
}) {
  const opacity = useTransform(progress, range, [0.14, 1]);
  return (
    <motion.span style={{ opacity }} className="inline-block">
      {word}
      {"\u00A0"}
    </motion.span>
  );
}
