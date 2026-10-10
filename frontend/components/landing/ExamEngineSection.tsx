"use client";
import Link from "next/link";
import { useT } from "@/lib/i18n";
import { ArrowUpRight, Buildings, GraduationCap, Bank, Scales, CheckCircle, GithubLogo } from "@phosphor-icons/react";
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
    icon: Bank,
    name: t("landing.examEngine.track.bcs"),
    blurb: t("landing.examEngine.track.bcs.blurb"),
    href: "/tracks#bcs-preliminary",
  },
  {
    icon: Buildings,
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
    icon: Scales,
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

        {/* Proof row — evidence, not metaphor: a real bank question and the
            open-source guarantee, CSS-only like the rest of the section. */}
        <div className="mt-5 grid gap-5 lg:grid-cols-2">
          <Reveal className="h-full">
            <div className="glass-card relative flex h-full flex-col overflow-hidden rounded-2xl p-6">
              <p className="mb-4 font-mono text-[11px] uppercase tracking-[0.18em] text-zinc-500">
                {t("landing.proof.sample.eyebrow")}
              </p>
              <p className="font-display text-lg font-semibold leading-relaxed text-white">
                {t("landing.proof.sample.question")}
              </p>
              <ul className="mt-4 grid gap-2 sm:grid-cols-2" aria-label="Sample options">
                {["মুনীর চৌধুরী", "সৈয়দ ওয়ালীউল্লাহ", "আবদুল্লাহ আল-মামুন", "সেলিম আল দীন"].map((opt, i) => (
                  <li
                    key={opt}
                    className={`flex items-center gap-2.5 rounded-xl border px-3.5 py-2.5 text-sm ${
                      i === 0
                        ? "border-emerald-400/50 bg-emerald-500/10 text-emerald-300"
                        : "border-white/10 bg-white/[0.03] text-zinc-400"
                    }`}
                  >
                    <span className="font-mono text-xs text-zinc-500">{String.fromCharCode(65 + i)}</span>
                    {opt}
                    {i === 0 && <CheckCircle className="ml-auto h-4 w-4 shrink-0" aria-label="Correct answer" />}
                  </li>
                ))}
              </ul>
              <p className="mt-4 text-sm leading-relaxed text-zinc-400">
                {t("landing.proof.sample.answer")}
              </p>
            </div>
          </Reveal>
          <Reveal delay={0.07} className="h-full">
            <a
              href="https://github.com/9thgradeai/9th-grade-ai-next"
              target="_blank"
              rel="noreferrer"
              className="group glass-card relative flex h-full flex-col overflow-hidden rounded-2xl p-6 transition-[border-color,box-shadow,transform] duration-300 hover:-translate-y-1 hover:border-emerald-400/40 hover:shadow-card-hover"
            >
              <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 bg-gradient-to-br from-emerald-500/[0.07] via-transparent to-violet-500/[0.07] opacity-0 transition-opacity duration-300 group-hover:opacity-100"
              />
              <p className="relative mb-4 font-mono text-[11px] uppercase tracking-[0.18em] text-zinc-500">
                {t("landing.proof.oss.eyebrow")}
              </p>
              <span className="relative mb-6 flex h-12 w-12 items-center justify-center rounded-xl border border-emerald-500/25 bg-gradient-to-br from-emerald-500/20 to-cyan-500/10 transition-all duration-300 group-hover:border-emerald-400/50 group-hover:shadow-glow-sm">
                <GithubLogo className="h-6 w-6 text-emerald-400 transition-transform duration-300 group-hover:scale-110" aria-hidden="true" />
              </span>
              <h3 className="relative font-display text-xl font-semibold text-white transition-colors duration-300 group-hover:text-emerald-400">
                {t("landing.proof.oss.title")}
              </h3>
              <p className="relative mt-2 flex-1 text-sm leading-relaxed text-zinc-400">
                {t("landing.proof.oss.body")}
              </p>
              <span className="relative mt-6 inline-flex items-center gap-1.5 font-mono text-xs uppercase tracking-[0.14em] text-zinc-500 transition-colors duration-300 group-hover:text-emerald-400">
                {t("landing.proof.oss.cta")}
                <ArrowUpRight className="h-3.5 w-3.5 translate-x-0 opacity-60 transition-all duration-300 group-hover:translate-x-0.5 group-hover:opacity-100" aria-hidden="true" />
              </span>
            </a>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
