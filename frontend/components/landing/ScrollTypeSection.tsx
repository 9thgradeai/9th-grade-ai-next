"use client";

import { useT } from "@/lib/i18n";

const LINE_KEYS = ["scrollType.l1", "scrollType.l2", "scrollType.l3", "scrollType.l4"];

/**
 * Kinetic display-type band (Scroll Type inspiration). Each line is an
 * outlined "ghost" of itself that fills with the brand gradient as it
 * crosses the viewport — driven entirely by CSS scroll-driven animation
 * (animation-timeline: view()) declared in globals.css, so this section
 * ships ~1KB of markup and zero client JS behavior.
 *
 * Progressive enhancement: browsers without scroll-timeline support, and
 * users with prefers-reduced-motion, see the type fully lit from the start
 * (the fill simply defaults to clip-path:none). Nothing is ever hidden.
 */
export default function ScrollTypeSection() {
  const t = useT();
  const lines = LINE_KEYS.map((k) => t(k));

  return (
    <section className="relative px-4 py-24 sm:px-6 md:py-36" aria-labelledby="scroll-type-heading">
      <div className="mx-auto max-w-[1440px]">
        <p className="section-eyebrow mb-10 md:mb-14">
          <span aria-hidden="true">{"//"}</span>
          {t("scrollType.kicker")}
        </p>
        <h2 id="scroll-type-heading" className="sr-only">
          {t("scrollType.srTitle")}
        </h2>

        <div className="space-y-1 md:space-y-3">
          {lines.map((line, i) => (
            <p
              key={LINE_KEYS[i]}
              data-stagger={i}
              className={`scroll-type-line font-hero text-[clamp(2.4rem,10.5vw,8.5rem)] font-extrabold uppercase tracking-[-0.03em] ${
                i % 2 === 1 ? "text-right" : ""
              }`}
            >
              <span aria-hidden="true" className="scroll-type-base">
                {line}
              </span>
              <span aria-hidden="true" className="scroll-type-fill text-gradient">
                {line}
              </span>
            </p>
          ))}
        </div>

        <div className="mt-12 flex flex-col items-start gap-5 md:mt-16 md:flex-row md:items-center md:gap-8">
          <div className="h-px w-full flex-1 overflow-hidden bg-white/10">
            <div
              aria-hidden="true"
              className="scroll-type-progress h-full origin-left bg-gradient-to-r from-[var(--primary)] to-[var(--info)]"
            />
          </div>
          <p className="max-w-md text-sm leading-relaxed text-[var(--text-muted)] md:text-right md:text-base">
            {t("scrollType.note")}
          </p>
        </div>
      </div>
    </section>
  );
}
