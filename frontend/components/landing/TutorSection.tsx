"use client";
import SectionHeading from "@/components/ui/SectionHeading";
import { useT } from "@/lib/i18n";
import Reveal from "@/components/ui/Reveal";
import TutorTimeline from "@/components/landing/TutorTimeline";

export default function TutorSection() {
  const t = useT();
  return (
    <section id="tutor" className="relative scroll-mt-16 px-4 py-24 sm:px-6 md:py-32" aria-labelledby="tutor-heading">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 44% 34% at 80% 30%, rgba(34,211,238,0.06), transparent 60%)",
        }}
      />
      <div className="relative mx-auto max-w-7xl">
        <SectionHeading
          eyebrow={t("landing.tutor.eyebrow")}
          title={t("landing.tutor.title")}
          highlight={t("landing.tutor.highlight")}
          description={t("landing.tutor.description")}
        />
        <Reveal>
          <TutorTimeline />
        </Reveal>
        <Reveal delay={0.1}>
          <p className="mt-12 text-center font-mono text-xs uppercase tracking-[0.16em] text-zinc-600">
            {t("landing.tutor.caption")}
          </p>
        </Reveal>
      </div>
    </section>
  );
}
