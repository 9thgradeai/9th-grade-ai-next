import type { Metadata } from "next";
import Link from "next/link";
import { Target, Heart, Shield, Users, Sparkles, ArrowRight } from "lucide-react";
import PublicShell from "@/components/public/PublicShell";
import PageHero from "@/components/public/PageHero";
import SectionHeading from "@/components/ui/SectionHeading";

export const metadata: Metadata = {
  alternates: { canonical: "/about" },
  title: "About Us — 9Th-Grade AI",
  description:
    "9Th-Grade AI is a free, open-source AI-powered exam preparation platform for Bangladeshi government job aspirants.",
};

const stats = [
  { value: "50K+", label: "Active Students" },
  { value: "2.5M+", label: "Questions Practiced" },
  { value: "100K+", label: "Questions in Bank" },
  { value: "14", label: "Subjects Covered" },
];

const values = [
  {
    icon: Target,
    title: "Precision Over Volume",
    text: "We believe focused, syllabus-aligned practice beats endless random questions. Every feature is designed around what the exam actually tests.",
  },
  {
    icon: Heart,
    title: "Free, For Everyone",
    text: "Exam preparation should not be a privilege. The core platform is free and open source, funded only by optional community support.",
  },
  {
    icon: Shield,
    title: "Trusted & Transparent",
    text: "Your data is private and encrypted. AI answers are clearly labelled, and authorization never depends on AI output.",
  },
  {
    icon: Users,
    title: "Built With Aspirants",
    text: "From BCS preliminary to bank officer papers, the platform is shaped by the people who actually sit for these exams.",
  },
];

export default function AboutPage() {
  return (
    <PublicShell>
      <PageHero
        eyebrow="ABOUT US"
        title="Democratizing Exam"
        highlight="Preparation in Bangladesh"
        description="9Th-Grade AI exists to give every government job aspirant a free, intelligent, and complete preparation system — from the first syllabus page to the final mock test."
        actions={[{ href: "/login?register=true", label: "Join Free Today" }]}
      />

      {/* Stats */}
      <section className="py-10 px-4 sm:px-6">
        <div className="max-w-5xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
          {stats.map((stat) => (
            <div key={stat.label} className="glass-card rounded-2xl border border-white/10 p-6">
              <div className="text-3xl font-display font-semibold text-emerald-400 tabular-nums">
                {stat.value}
              </div>
              <div className="text-sm text-zinc-500 mt-1">{stat.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Mission */}
      <section className="py-16 md:py-24 px-4 sm:px-6">
        <div className="max-w-3xl mx-auto">
          <SectionHeading
            eyebrow="WHY WE EXIST"
            title="A Fair Shot at Every"
            highlight="Government Job"
            align="left"
          />
          <div className="space-y-5 text-zinc-400 leading-relaxed">
            <p>
              Every year, hundreds of thousands of aspirants sit for BCS, Bank, and Teacher
              recruitment exams. Most prepare with scattered PDFs, outdated question banks,
              and no real feedback loop — and the gap between preparation and the actual
              paper closes on exam day, not before.
            </p>
            <p>
              We set out to change that with an open platform that combines a complete
              syllabus map, a massive tagged question bank, adaptive mock tests, spaced
              repetition, and an AI tutor — all free, all in one place, and all in both
              Bangla and English.
            </p>
            <p>
              9Th-Grade AI is open source. Anyone can inspect the code, contribute a
              question, or suggest a feature. The product belongs to its community.
            </p>
          </div>
        </div>
      </section>

      {/* Values */}
      <section className="py-16 md:py-24 px-4 sm:px-6">
        <div className="max-w-7xl mx-auto">
          <SectionHeading
            eyebrow="OUR VALUES"
            title="What We Stand"
            highlight="For"
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {values.map((value) => {
              const Icon = value.icon;
              return (
                <div
                  key={value.title}
                  className="glass-card rounded-2xl border border-white/10 p-6 transition-[border-color,box-shadow] duration-300 hover:border-emerald-400/40 hover:shadow-card-hover"
                >
                  <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-emerald-500/20 to-cyan-500/10 border border-emerald-500/25 flex items-center justify-center mb-4">
                    <Icon className="w-5 h-5 text-emerald-400" aria-hidden="true" />
                  </div>
                  <h3 className="font-display text-base font-semibold text-white mb-2">{value.title}</h3>
                  <p className="text-sm text-zinc-400 leading-relaxed">{value.text}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Community CTA */}
      <section className="py-16 md:py-24 px-4 sm:px-6">
        <div className="max-w-5xl mx-auto">
          <div className="relative overflow-hidden rounded-3xl border border-emerald-500/20 bg-gradient-to-b from-emerald-500/[0.06] to-transparent p-8 md:p-14 text-center">
            <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-[28rem] h-[28rem] bg-emerald-500/10 rounded-full blur-[120px]" aria-hidden="true" />
            <div className="relative">
              <p className="section-eyebrow justify-center mb-4">
                <Sparkles className="w-4 h-4" aria-hidden="true" />
                OPEN SOURCE
              </p>
              <h2 className="font-display text-2xl sm:text-4xl font-semibold text-white leading-tight tracking-tight">
                Help us build the exam prep platform <span className="text-gradient">everyone deserves.</span>
              </h2>
              <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
                <Link
                  href="https://github.com/9thgradeai/9th-grade-ai-next"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="glow-border inline-flex items-center gap-2 px-7 py-3.5 rounded-full bg-emerald-500 text-zinc-950 font-mono font-semibold text-sm tracking-wide"
                >
                  Contribute on GitHub
                  <ArrowRight className="w-4 h-4" aria-hidden="true" />
                </Link>
                <Link
                  href="/careers"
                  className="inline-flex items-center gap-2 px-7 py-3.5 rounded-full border border-white/15 text-white font-mono text-sm hover:border-emerald-400/50 hover:bg-white/5 transition-colors"
                >
                  View Open Roles
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>
    </PublicShell>
  );
}