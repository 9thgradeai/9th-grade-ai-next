import type { Metadata } from "next";
import Link from "next/link";
import { BookMarked, ArrowUpRight, Layers, FileText, GraduationCap, Calculator, Globe } from "lucide-react";
import PublicShell from "@/components/public/PublicShell";
import PageHero from "@/components/public/PageHero";
import SectionHeading from "@/components/ui/SectionHeading";
import StatusPill from "@/components/ui/StatusPill";

export const metadata: Metadata = {
  alternates: { canonical: "/guides" },
  title: "Study Guides — 9Th-Grade AI",
  description:
    "Complete study guides and roadmaps for BCS, Bank, Teacher Recruitment, and other competitive exams in Bangladesh.",
};

const guides = [
  {
    icon: FileText,
    title: "BCS Preliminary Roadmap",
    level: "ALL LEVELS",
    description:
      "A full 5-month roadmap across the 10-subject prelim syllabus: monthly milestones, daily hour allocation, and the exact order to study subjects.",
    sections: ["Subject weightage map", "Monthly milestone plan", "Mock-test cadence"],
  },
  {
    icon: GraduationCap,
    title: "Bank Officer Exam Blueprint",
    level: "INTERMEDIATE",
    description:
      "AD, PO, Cash, and General officer papers decoded — section-wise marks, negative-marking strategy, and a speed-building math plan.",
    sections: ["Paper pattern breakdown", "Speed-math drills", "Time management tactics"],
  },
  {
    icon: BookMarked,
    title: "Teacher Recruitment Syllabus Guide",
    level: "ALL LEVELS",
    description:
      "NTRCA school, college, and madrasa category syllabi mapped to practice-ready question sets, with a focus on pedagogy and methods.",
    sections: ["Category-wise syllabus", "Pedagogy essentials", "Subject-wise question sets"],
  },
  {
    icon: Globe,
    title: "English for Govt Exams",
    level: "ALL LEVELS",
    description:
      "Grammar, vocabulary, and literature essentials for BCS and bank papers — from parts of speech to literary periods, with spaced-repetition decks.",
    sections: ["Grammar mastery path", "Vocabulary building", "Literature timeline"],
  },
  {
    icon: Calculator,
    title: "Math & Mental Ability Formula Sheet",
    level: "ALL LEVELS",
    description:
      "The complete formula reference for mathematical reasoning and mental ability — from ratio and percentage to set theory and probability.",
    sections: ["Topic-wise formulas", "Worked examples", "Shortcut techniques"],
  },
  {
    icon: Layers,
    title: "Mock Test Strategy Playbook",
    level: "ADVANCED",
    description:
      "How to design a mock-test schedule that compounds — the three-pass review system, difficulty scaling, and how to convert analytics into action.",
    sections: ["Test scheduling", "Review system", "Analytics to action"],
  },
];

export default function GuidesPage() {
  return (
    <PublicShell>
      <PageHero
        eyebrow="STUDY GUIDES"
        title="Roadmaps That"
        highlight="Remove the Guesswork"
        description="Every guide turns an overwhelming syllabus into a clear, ordered plan — what to study, in what order, and how to measure progress."
        actions={[{ href: "/dashboard?tab=study-planner", label: "Open Study Planner" }]}
      />

      <section className="py-16 md:py-24 px-4 sm:px-6">
        <div className="max-w-7xl mx-auto">
          <SectionHeading
            eyebrow="THE LIBRARY"
            title="Guides for Every"
            highlight="Exam Journey"
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {guides.map((guide) => {
              const Icon = guide.icon;
              return (
                <article
                  key={guide.title}
                  className="glass-card rounded-2xl border border-white/10 p-6 flex flex-col transition-[border-color,box-shadow] duration-300 hover:border-emerald-400/40 hover:shadow-card-hover group"
                >
                  <div className="flex items-center justify-between mb-5">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500/20 to-cyan-500/10 border border-emerald-500/25 flex items-center justify-center">
                      <Icon className="w-6 h-6 text-emerald-400" aria-hidden="true" />
                    </div>
                    <StatusPill label={guide.level} />
                  </div>

                  <h2 className="font-display text-lg font-semibold text-white group-hover:text-emerald-400 transition-colors">
                    {guide.title}
                  </h2>
                  <p className="mt-3 text-sm text-zinc-400 leading-relaxed flex-1">
                    {guide.description}
                  </p>

                  <ul className="mt-5 space-y-1.5">
                    {guide.sections.map((section) => (
                      <li key={section} className="flex items-center gap-2 text-xs text-zinc-400 font-mono">
                        <span className="w-1 h-1 rounded-full bg-emerald-400" aria-hidden="true" />
                        {section}
                      </li>
                    ))}
                  </ul>

                  <div className="mt-6 pt-4 border-t border-white/10">
                    <Link
                      href="/dashboard?tab=study-planner"
                      className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-400 hover:text-emerald-300 transition-colors"
                    >
                      Apply This Guide
                      <ArrowUpRight className="w-4 h-4 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" aria-hidden="true" />
                    </Link>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </section>
    </PublicShell>
  );
}