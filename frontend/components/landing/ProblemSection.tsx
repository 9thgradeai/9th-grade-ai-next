"use client";

import { Shuffle, MapPinned, RadioTower } from "lucide-react";
import MotionText from "@/components/ui/MotionText";
import Reveal from "@/components/ui/Reveal";
import Interactive3DCard from "@/components/landing/Interactive3DCard";

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

export default function ProblemSection() {
  return (
    <section className="relative px-4 py-24 sm:px-6 md:py-32" aria-labelledby="problem-heading">
      <div className="mx-auto max-w-7xl">
        <div className="max-w-3xl">
          <Reveal>
            <p className="section-eyebrow mb-5">
              <span aria-hidden="true">{"//"}</span>
              THE REALITY
            </p>
          </Reveal>
          <h2
            id="problem-heading"
            className="font-display text-3xl font-semibold leading-[1.12] tracking-tight text-white sm:text-4xl md:text-[2.9rem]"
          >
            <MotionText>Lakh-strong applicant pools.</MotionText>
            <br />
            <MotionText delay={0.25} wordClassName="text-gradient">
              Single-digit selection.
            </MotionText>
          </h2>
          <Reveal delay={0.15}>
            <p className="mt-6 max-w-2xl text-base leading-relaxed text-[var(--text-muted)] sm:text-lg">
              For BCS, bank, and teacher-recruitment exams, the competition is
              not the hardest part — preparing alone, without signal, is. Most
              aspirants lose ground to three structural problems.
            </p>
          </Reveal>
        </div>

        <div className="mt-14 grid gap-5 md:mt-16 md:grid-cols-3 md:gap-6">
          {frictions.map((friction, i) => (
            <Reveal key={friction.title} delay={i * 0.09} className="h-full">
              <Interactive3DCard maxRotation={3} glow className="h-full rounded-2xl">
                <article className="glass-card flex h-full flex-col rounded-2xl p-6 transition-colors duration-300 [transform-style:preserve-3d] group-hover:border-emerald-400/30">
                  <div className="mb-6 flex items-center justify-between">
                    <span
                      className="flex h-11 w-11 items-center justify-center rounded-xl border border-emerald-500/25 bg-gradient-to-br from-emerald-500/20 to-cyan-500/10"
                      aria-hidden="true"
                    >
                      <friction.icon className="h-5 w-5 text-emerald-400" />
                    </span>
                    <span className="font-mono text-xs tabular-nums text-zinc-600" aria-hidden="true">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                  </div>
                  <h3 className="mb-2 font-display text-lg font-semibold text-white">
                    {friction.title}
                  </h3>
                  <p className="text-sm leading-relaxed text-zinc-400">{friction.body}</p>
                </article>
              </Interactive3DCard>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
