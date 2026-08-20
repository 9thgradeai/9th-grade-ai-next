import type { Metadata } from "next";
import Link from "next/link";
import { FolderArchive, CalendarRange, ChevronRight } from "lucide-react";
import PublicShell from "@/components/public/PublicShell";
import PageHero from "@/components/public/PageHero";
import SectionHeading from "@/components/ui/SectionHeading";
import StatusPill from "@/components/ui/StatusPill";
import { ARCHIVE_CATEGORIES } from "@/lib/data";

export const metadata: Metadata = {
  title: "Previous Year Papers — 9Th-Grade AI",
  description:
    "Browse the complete archive of BCS, Bank, Teacher Recruitment, and other competitive exam question papers with solutions.",
};

const accentStyles: Record<string, string> = {
  emerald: "from-emerald-500/15 to-emerald-500/5 border-emerald-500/25 text-emerald-400",
  sky: "from-sky-500/15 to-sky-500/5 border-sky-400/25 text-sky-400",
  yellow: "from-yellow-500/15 to-yellow-500/5 border-yellow-400/25 text-yellow-400",
  purple: "from-purple-500/15 to-purple-500/5 border-purple-400/25 text-purple-400",
};

export default function ArchivePage() {
  return (
    <PublicShell>
      <PageHero
        eyebrow="PREVIOUS YEAR PAPERS"
        title="The Full Archive of"
        highlight="Real Exam Papers"
        description="Every past question, organized by exam, year, and subject — with detailed solutions and full-length practice mode. Search, filter, and drill what matters."
        actions={[
          { href: "/dashboard?tab=question-bank", label: "Browse Question Bank" },
          { href: "/login?register=true", label: "Start Free Preparation", variant: "ghost" },
        ]}
      />

      <section className="py-16 md:py-24 px-4 sm:px-6">
        <div className="max-w-7xl mx-auto">
          <SectionHeading
            eyebrow="ARCHIVE"
            title="Papers by Exam,"
            highlight="Year After Year"
            description="From 1982 to today — a continuously growing repository of previous year papers across every major recruitment exam."
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {ARCHIVE_CATEGORIES.map((category) => {
              const accent = accentStyles[category.accent] ?? accentStyles.emerald;
              return (
                <Link
                  key={category.name}
                  href="/dashboard?tab=question-bank"
                  className="glass-card rounded-2xl border border-white/10 p-6 transition-[border-color,box-shadow] duration-300 hover:border-emerald-400/40 hover:shadow-card-hover group"
                >
                  <div className="flex items-center justify-between mb-5">
                    <div className={`w-12 h-12 rounded-xl bg-gradient-to-br border flex items-center justify-center text-2xl ${accent}`}>
                      <span aria-hidden="true">{category.icon}</span>
                    </div>
                    <StatusPill label={category.status} />
                  </div>

                  <h3 className="font-display text-lg font-semibold text-white mb-1 group-hover:text-emerald-400 transition-colors">
                    {category.name}
                  </h3>
                  <p className="text-sm text-zinc-500 font-mono">
                    {category.count} papers · {category.yearRange}
                  </p>

                  <div className="mt-5 pt-4 border-t border-white/10 flex items-center justify-between text-xs text-zinc-400">
                    <span className="inline-flex items-center gap-1.5 font-mono">
                      <CalendarRange className="w-3.5 h-3.5" aria-hidden="true" />
                      All years indexed
                    </span>
                    <ChevronRight className="w-4 h-4 text-emerald-400 group-hover:translate-x-0.5 transition-transform" aria-hidden="true" />
                  </div>
                </Link>
              );
            })}
          </div>

          <div className="mt-12 glass-card rounded-2xl border border-white/10 p-6 md:p-8 flex flex-col sm:flex-row items-center justify-between gap-5">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-emerald-500/20 to-cyan-500/10 border border-emerald-500/25 flex items-center justify-center flex-shrink-0">
                <FolderArchive className="w-5 h-5 text-emerald-400" aria-hidden="true" />
              </div>
              <div>
                <p className="text-sm font-medium text-white">Practice a paper in exam mode</p>
                <p className="text-xs text-zinc-500 mt-0.5">
                  Full-length timed attempt with solutions after submission.
                </p>
              </div>
            </div>
            <Link
              href="/dashboard?tab=practice"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-full text-sm font-semibold text-zinc-950 bg-emerald-500 hover:bg-emerald-400 transition-colors shadow-[0_0_20px_rgba(16,185,129,0.25)] flex-shrink-0"
            >
              Open Practice Mode
            </Link>
          </div>
        </div>
      </section>
    </PublicShell>
  );
}