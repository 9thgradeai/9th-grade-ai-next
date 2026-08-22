"use client";

import { Shuffle, MapPinned, RadioTower } from "lucide-react";
import Reveal from "./ui/Reveal";
import MotionText from "./ui/MotionText";

const frictions = [
  {
    icon: Shuffle,
    title: "Resources are scattered",
    body: "PDFs in one drive, questions in another, current affairs on social media — preparation becomes an archaeology project before it becomes studying.",
  },
  {
    icon: MapPinned,
    title: "Plans are generic",
    body: "The same 90-day schedule is handed to every aspirant, regardless of strengths, weaknesses, or how far away the exam actually is.",
  },
  {
    icon: RadioTower,
    title: "Feedback comes too late",
    body: "You discover your weak subjects on exam day — months after it would have mattered. Practice without diagnosis is just motion.",
  },
];

/**
 * The narrative hinge of the page: name the chaos before presenting the
 * system that resolves it. Editorial typography carries this section —
 * no cards competing for attention until the friction triad.
 */
export default function ProblemSection() {
  return (
    <section
      className="relative py-24 md:py-32 px-4 sm:px-6"
      aria-labelledby="reality-heading"
    >
      <div className="max-w-7xl mx-auto">
        <div className="max-w-3xl">
          <Reveal>
            <p className="section-eyebrow mb-5">
              <span aria-hidden="true">{"//"}</span>
              THE REALITY
            </p>
          </Reveal>
          <h2 id="reality-heading" className="font-display text-3xl sm:text-4xl md:text-[2.9rem] font-semibold text-white leading-[1.12] tracking-tight">
            <MotionText>Lakh-strong applicant pools.</MotionText>
            <br />
            <span className="text-gradient">
              <MotionText delay={0.25}>Single-digit selection.</MotionText>
            </span>
          </h2>
          <Reveal delay={0.15}>
            <p className="mt-6 text-base sm:text-lg text-[var(--text-muted)] leading-relaxed max-w-2xl">
              For BCS, bank, and teacher-recruitment exams, the competition is
              not the hardest part — preparing alone, without signal, is. Most
              aspirants lose ground to three structural problems.
            </p>
          </Reveal>
        </div>

        {/* Friction triad — quiet rows, distinct texture from the feature grid */}
        <div className="mt-14 md:mt-16 divide-y divide-white/[0.07] border-y border-white/[0.07]">
          {frictions.map((f, i) => (
            <Reveal key={f.title} delay={i * 0.08}>
              <div className="group grid sm:grid-cols-[auto_1fr_1.4fr] gap-x-6 gap-y-2 items-baseline py-7 md:py-8">
                <span className="font-mono text-xs text-zinc-600 tabular-nums" aria-hidden="true">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <h3 className="flex items-center gap-3 font-display text-lg font-semibold text-white transition-colors group-hover:text-emerald-400">
                  <f.icon
                    className="w-4.5 h-4.5 text-zinc-500 group-hover:text-emerald-400 transition-colors shrink-0"
                    aria-hidden="true"
                  />
                  {f.title}
                </h3>
                <p className="text-sm sm:text-[15px] leading-relaxed text-zinc-400">
                  {f.body}
                </p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
