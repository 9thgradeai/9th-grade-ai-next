import type { Metadata } from "next";
import Link from "next/link";
import {
  Landmark,
  FileText,
  GraduationCap,
  Building2,
  Scale,
  CheckCircle,
  ArrowUpRight,
  Target,
} from "lucide-react";
import PublicShell from "@/components/public/PublicShell";
import PageHero from "@/components/public/PageHero";
import SectionHeading from "@/components/ui/SectionHeading";

export const metadata: Metadata = {
  alternates: { canonical: "/tracks" },
  title: "Exam Tracks — 9Th-Grade AI",
  description:
    "Structured preparation tracks for BCS Preliminary, BCS Written, Teacher Recruitment, Bank Jobs, and PSC & other competitive exams in Bangladesh.",
};

const trackNav = [
  { id: "bcs-preliminary", label: "BCS Preliminary" },
  { id: "bcs-written", label: "BCS Written" },
  { id: "teacher-recruitment", label: "Teacher Recruitment" },
  { id: "bank-jobs", label: "Bank Jobs" },
  { id: "psc-and-other", label: "PSC & Other Exams" },
];

const tracks = [
  {
    id: "bcs-preliminary",
    icon: Landmark,
    title: "BCS Preliminary",
    badge: "200 MARKS · 100 MCQ · 2 HRS",
    description:
      "The first gate to the Bangladesh Civil Service. Master all 10 syllabus subjects — Bangla, English, Bangladesh & International Affairs, Geography, Science, Computer, Math, Mental Ability, and Ethics — with syllabus-aligned practice and adaptive mocks.",
    points: [
      "Full BCS syllabus coverage with 35,000+ tagged questions",
      "Mock tests with real exam interface, timer & negative marking",
      "Weak-topic detection via AI performance analytics",
    ],
    cta: "Start BCS Preliminary Prep",
  },
  {
    id: "bcs-written",
    icon: FileText,
    title: "BCS Written",
    badge: "900 MARKS · 9 PAPERS",
    description:
      "From preliminary to the written examination. Deep-dive practice across Bangla, English, Bangladesh Affairs, General Science, Math & Mental Ability, and the optional papers with answer-evaluation drills.",
    points: [
      "Descriptive answer framework and marking-scheme guidance",
      "Past written questions organized by year and subject",
      "AI tutor feedback on structured answer outlines",
    ],
    cta: "Start BCS Written Prep",
  },
  {
    id: "teacher-recruitment",
    icon: GraduationCap,
    title: "Teacher Recruitment",
    badge: "NTRCA · 3 CATEGORIES",
    description:
      "Prepare for NTRCA school, college, and madrasa category examinations. Subject-wise practice aligned to the official recruitment syllabus for every teaching position.",
    points: [
      "Category-specific question banks and mock tests",
      "English & Bangla MCQ practice with instant solutions",
      "Spaced-repetition flashcards for pedagogy and methods",
    ],
    cta: "Start Teacher Recruitment Prep",
  },
  {
    id: "bank-jobs",
    icon: Building2,
    title: "Bank Jobs",
    badge: "AD · PO · CASH · GENERAL",
    description:
      "Conquer bank officer recruitment — Assistant Director, Probationary Officer, Cash, and General posts. Focused practice on math, reasoning, English, and current affairs with bank-level speed drills.",
    points: [
      "Numerical & reasoning drills tuned to bank exam difficulty",
      "Current-affairs tracker refreshed daily",
      "Full-length timed mocks mirroring bank paper patterns",
    ],
    cta: "Start Bank Jobs Prep",
  },
  {
    id: "psc-and-other",
    icon: Scale,
    title: "PSC & Other Exams",
    badge: "GOVT. JOBS · 9TH-GRADE PAY SCALE",
    description:
      "A unified track for PSC, departmental, and other public-sector recruitment — including 9th-grade pay-scale posts. One syllabus map, endless practice.",
    points: [
      "Generic-to-departmental question coverage",
      "Topic-wise practice across Bangla, GK, math & English",
      "Daily quiz and streak tracking to build exam habits",
    ],
    cta: "Start PSC & Other Prep",
  },
];

export default function TracksPage() {
  return (
    <PublicShell>
      <PageHero
        eyebrow="EXAM TRACKS"
        title="Structured Tracks for Every"
        highlight="Competitive Exam"
        description="Pick a track, follow the syllabus map, and let adaptive practice close your weak areas — from your first question to the final mock test."
        actions={[
          { href: "/login?register=true", label: "Start Free Preparation" },
          { href: "/dashboard?tab=practice", label: "Open Practice", variant: "ghost" },
        ]}
      />

      {/* In-page anchor nav for the five tracks */}
      <nav
        aria-label="Track quick navigation"
        className="max-w-7xl mx-auto px-4 sm:px-6 pb-4 -mt-4 flex flex-wrap justify-center gap-2.5"
      >
        {trackNav.map((track) => (
          <a
            key={track.id}
            href={`#${track.id}`}
            className="inline-flex items-center gap-1.5 text-xs font-mono text-zinc-400 px-3.5 py-2 rounded-full border border-white/10 bg-white/[0.03] hover:border-emerald-400/40 hover:text-emerald-400 transition-colors"
          >
            {track.label}
            <ArrowUpRight className="w-3 h-3" aria-hidden="true" />
          </a>
        ))}
      </nav>

      <section className="py-16 md:py-24 px-4 sm:px-6">
        <div className="max-w-7xl mx-auto">
          <SectionHeading
            eyebrow="THE TRACKS"
            title="Choose Your Exam,"
            highlight="Own the Syllabus"
            description="Every track ships with a complete syllabus map, tagged question bank, adaptive mocks, and AI-driven feedback."
          />

          <div className="space-y-8">
            {tracks.map((track) => {
              const Icon = track.icon;
              return (
                <article
                  key={track.id}
                  id={track.id}
                  className="glass-card rounded-2xl border border-white/10 p-6 md:p-8 transition-[border-color,box-shadow] duration-300 hover:border-emerald-400/30 hover:shadow-card-hover scroll-mt-28"
                >
                  <div className="grid lg:grid-cols-[1fr_auto] gap-6 lg:items-start">
                    <div>
                      <div className="flex items-center gap-3 mb-4">
                        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500/20 to-cyan-500/10 border border-emerald-500/25 flex items-center justify-center flex-shrink-0">
                          <Icon className="w-6 h-6 text-emerald-400" aria-hidden="true" />
                        </div>
                        <div>
                          <h2 className="font-display text-xl md:text-2xl font-semibold text-white tracking-tight">
                            {track.title}
                          </h2>
                          <p className="text-[11px] font-mono uppercase tracking-[0.14em] text-emerald-400/90 mt-0.5">
                            {track.badge}
                          </p>
                        </div>
                      </div>

                      <p className="text-sm sm:text-base text-zinc-400 leading-relaxed max-w-3xl">
                        {track.description}
                      </p>

                      <ul className="mt-5 space-y-2">
                        {track.points.map((point) => (
                          <li key={point} className="flex items-start gap-2 text-sm text-zinc-300">
                            <CheckCircle className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" aria-hidden="true" />
                            {point}
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div className="lg:w-56 flex flex-col gap-3 lg:items-end lg:pt-14">
                      <Link
                        href="/login?register=true"
                        className="inline-flex items-center justify-center gap-2 w-full px-6 py-3 rounded-full text-sm font-semibold text-zinc-950 bg-emerald-500 hover:bg-emerald-400 transition-colors shadow-[0_0_20px_rgba(16,185,129,0.25)]"
                      >
                        {track.cta}
                      </Link>
                      <Link
                        href="/dashboard?tab=practice"
                        className="inline-flex items-center justify-center gap-2 w-full px-6 py-3 rounded-full text-sm font-medium text-white border border-white/15 hover:border-emerald-400/50 hover:bg-white/5 transition-colors"
                      >
                        Practice Now
                      </Link>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>

          {/* Bottom CTA */}
          <div className="mt-16 text-center">
            <div className="inline-flex items-center gap-2 text-sm text-zinc-500 font-mono">
              <Target className="w-4 h-4 text-emerald-400" aria-hidden="true" />
              Not sure which track fits? All tracks share the same question bank.
            </div>
          </div>
        </div>
      </section>
    </PublicShell>
  );
}