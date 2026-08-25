import { ArrowRight, Compass } from "lucide-react";
import Button from "@/components/ui/Button";
import Reveal from "@/components/ui/Reveal";
import AuroraOrb from "@/components/ui/AuroraOrb";
import MotionText from "@/components/ui/MotionText";
import Magnetic from "@/components/landing/Magnetic";

const trustPoints = [
  "Free forever — no credit card",
  "Progress stays private & encrypted",
  "AI-assisted, aligned to official syllabi",
];

/**
 * Final conversion moment. Ambient lighting and the closing knowledge-field
 * echo are pure CSS/SVG — no canvas mounts this deep in the page.
 */
export default function FinalCtaSection() {
  return (
    <section className="relative px-4 py-24 sm:px-6 md:py-32" aria-labelledby="final-cta-heading">
      <div className="mx-auto max-w-5xl">
        <Reveal>
          <div className="relative overflow-hidden rounded-3xl border border-emerald-500/20 bg-gradient-to-b from-emerald-500/[0.06] via-indigo-500/[0.03] to-transparent p-8 text-center shadow-panel md:p-16">
            {/* Ambient radial light */}
            <AuroraOrb
              colorClass="bg-violet-500/[0.13]"
              size="34rem"
              duration={11}
              breatheTo={1.1}
              className="absolute -top-28 left-1/2 -translate-x-1/2"
            />
            {/* Knowledge-field echo — faint constellation arcs */}
            <svg
              aria-hidden="true"
              viewBox="0 0 600 200"
              className="pointer-events-none absolute inset-x-0 bottom-0 mx-auto w-full max-w-xl opacity-[0.35]"
            >
              <g fill="none" stroke="#818cf8" strokeWidth="0.6" strokeDasharray="2 7">
                <path d="M -20 170 Q 150 120, 300 160 T 620 130" />
                <path d="M -20 195 Q 180 155, 340 185 T 620 165" opacity="0.5" />
              </g>
              {[
                [70, 148], [210, 128], [300, 158], [430, 122], [520, 142],
              ].map(([cx, cy], i) => (
                <circle key={i} cx={cx} cy={cy} r={i % 2 ? 1.4 : 2.2} fill={i % 2 ? "#818cf8" : "#2dd4bf"} />
              ))}
            </svg>

            <div className="relative">
              <p className="section-eyebrow justify-center mb-4">
                <span aria-hidden="true">{"//"}</span>
                BEGIN YOUR PREPARATION
              </p>
              <h2
                id="final-cta-heading"
                className="font-display text-[clamp(2rem,6vw,3.75rem)] font-semibold uppercase leading-tight tracking-tight text-white"
              >
                <MotionText>Build your advantage.</MotionText>
              </h2>
              <p className="mx-auto mt-4 max-w-xl text-base leading-relaxed text-[var(--text-muted)] sm:text-lg">
                Turn preparation into an intelligent system.
              </p>

              <div className="mt-9 flex flex-col items-center justify-center gap-4 sm:flex-row">
                <Magnetic>
                  <Button href="/login?register=true" size="lg" className="glow-border w-full font-semibold sm:w-auto">
                    Start Preparing
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </Magnetic>
                <Button href="/tracks" size="lg" variant="secondary" className="w-full sm:w-auto">
                  Explore the Platform
                  <Compass className="h-4 w-4" aria-hidden="true" />
                </Button>
              </div>

              <ul className="mt-10 flex flex-col items-center justify-center gap-x-8 gap-y-3 sm:flex-row">
                {trustPoints.map((point) => (
                  <li key={point} className="flex items-center gap-2 font-mono text-xs text-zinc-500 sm:text-sm">
                    <span className="h-1 w-1 rounded-full bg-emerald-400" aria-hidden="true" />
                    {point}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
