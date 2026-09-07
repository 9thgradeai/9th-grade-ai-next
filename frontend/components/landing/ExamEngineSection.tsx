"use client";
import Link from "next/link";
import { useT } from "@/lib/i18n";
import { ArrowUpRight, Building2, GraduationCap, Landmark, Scale } from "lucide-react";
import SectionHeading from "@/components/ui/SectionHeading";
import Reveal from "@/components/ui/Reveal";

/**
 * Exam Engine — The coordinated card interaction
 * (rise, border, icon illumination, arrow slide) is CSS-only via group-hover,
 * so no client JS ships for this section.
 */
export default function ExamEngineSection() {
  const t = useT();
  const tracks = [
  {
    icon: Landmark,
    name: t("landing.examEngine.track.bcs"),
    blurb: t("landing.examEngine.track.bcs.blurb"),
    href: "/tracks#bcs-preliminary",
  },
  {
    icon: Building2,
    name: t("landing.examEngine.track.bank"),
    blurb: t("landing.examEngine.track.bank.blurb"),
    href: "/tracks#bank-jobs",
  },
  {
    icon: GraduationCap,
    name: t("landing.examEngine.track.ntrca"),
    blurb: t("landing.examEngine.track.ntrca.blurb"),
    href: "/tracks#teacher-recruitment",
  },
  {
    icon: Scale,
    name: t("landing.examEngine.track.other"),
    blurb: t("landing.examEngine.track.other.blurb"),
    href: "/tracks#psc-and-other",
  },
];
  return (
    <section id="exams" className="relative scroll-mt-16 px-4 py-24 sm:px-6 md:py-32" aria-labelledby="exams-heading">
      <div className="mx-auto max-w-7xl">
        <SectionHeading
          eyebrow={t("landing.examEngine.eyebrow")}
          title={t("landing.examEngine.title")}
          highlight={t("landing.examEngine.highlight")}
          description={t("landing.examEngine.description")}
        />

        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {tracks.map((track, i) => (
            <Reveal key={track.name} delay={i * 0.07} className="h-full">
              <Link
                href={track.href}
                className="group glass-card relative flex h-full flex-col overflow-hidden rounded-2xl p-6 transition-[border-color,box-shadow,transform] duration-300 hover:-translate-y-1 hover:border-emerald-400/40 hover:shadow-card-hover"
              >
                {/* Gradient shift on hover — single coordinated surface change */}
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0 bg-gradient-to-br from-emerald-500/[0.07] via-transparent to-violet-500/[0.07] opacity-0 transition-opacity duration-300 group-hover:opacity-100"
                />
                <span
                  aria-hidden="true"
                  className="relative mb-6 flex h-12 w-12 items-center justify-center rounded-xl border border-emerald-500/25 bg-gradient-to-br from-emerald-500/20 to-cyan-500/10 transition-all duration-300 group-hover:border-emerald-400/50 group-hover:shadow-glow-sm"
                >
                  <track.icon className="h-6 w-6 text-emerald-400 transition-transform duration-300 group-hover:scale-110" />
                </span>
                <h3 className="relative font-display text-xl font-semibold text-white transition-colors duration-300 group-hover:text-emerald-400">
                  {track.name}
                </h3>
                <p className="relative mt-2 flex-1 text-sm leading-relaxed text-zinc-400">
                  {track.blurb}
                </p>
                <span className="relative mt-6 inline-flex items-center gap-1.5 font-mono text-xs uppercase tracking-[0.14em] text-zinc-500 transition-colors duration-300 group-hover:text-emerald-400">
                  {t("landing.examEngine.openTrack")}
                  <ArrowUpRight className="h-3.5 w-3.5 translate-x-0 opacity-60 transition-all duration-300 group-hover:translate-x-0.5 group-hover:opacity-100" aria-hidden="true" />
                </span>
              </Link>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
