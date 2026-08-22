import type { Metadata } from "next";
import { Briefcase, MapPin, ArrowUpRight, Coffee, Users, Zap } from "lucide-react";
import PublicShell from "@/components/public/PublicShell";
import PageHero from "@/components/public/PageHero";
import SectionHeading from "@/components/ui/SectionHeading";
import StatusPill from "@/components/ui/StatusPill";

export const metadata: Metadata = {
  alternates: { canonical: "/careers" },
  title: "Careers — 9Th-Grade AI",
  description:
    "Join the 9Th-Grade AI team. Open roles in engineering, content, and design for the open-source exam preparation platform.",
};

const roles = [
  {
    title: "Full-Stack Engineer (Next.js)",
    team: "Engineering",
    location: "Remote · Dhaka, Bangladesh",
    type: "FULL-TIME",
    summary:
      "Own features end-to-end across the Next.js app, Prisma data layer, and AI integrations. React 19, TypeScript, and a taste for polished UI.",
  },
  {
    title: "Question Content Specialist",
    team: "Content",
    location: "Remote",
    type: "FULL-TIME",
    summary:
      "Author, tag, and review BCS, Bank, and Teacher recruitment questions with detailed solutions in Bangla and English.",
  },
  {
    title: "AI Prompt Engineer",
    team: "AI",
    location: "Remote",
    type: "CONTRACT",
    summary:
      "Design and evaluate system prompts for the AI solver and tutor — accuracy first, hallucinations never.",
  },
  {
    title: "Product Designer",
    team: "Design",
    location: "Remote",
    type: "PART-TIME",
    summary:
      "Refine the visual language of the platform — dark-first, glass, emerald-and-cyan — across web and mobile.",
  },
  {
    title: "Community & Growth Lead",
    team: "Community",
    location: "Remote",
    type: "FULL-TIME",
    summary:
      "Grow the aspirant community across social, campus chapters, and open-source contributions.",
  },
];

const perks = [
  { icon: Coffee, label: "Remote-first, async-friendly culture" },
  { icon: Users, label: "Work with a passionate open-source community" },
  { icon: Zap, label: "Ship to 50K+ active students" },
];

export default function CareersPage() {
  return (
    <PublicShell>
      <PageHero
        eyebrow="CAREERS"
        title="Build the Platform"
        highlight="Aspirants Rely On"
        description="We are a small, remote-first team building a free, open-source exam preparation platform for Bangladesh. If you care about craft and impact, there's a place for you here."
        actions={[{ href: "mailto:hello@9thgrade.ai?subject=Careers", label: "Email Us" }]}
      />

      <section className="py-16 md:py-24 px-4 sm:px-6">
        <div className="max-w-5xl mx-auto">
          <SectionHeading
            eyebrow="OPEN ROLES"
            title="Current"
            highlight="Opportunities"
          />

          <div className="space-y-5">
            {roles.map((role) => (
              <a
                key={role.title}
                href="mailto:hello@9thgrade.ai?subject=Job Application"
                className="glass-card rounded-2xl border border-white/10 p-6 md:p-7 flex flex-col md:flex-row md:items-start gap-5 transition-[border-color,box-shadow] duration-300 hover:border-emerald-400/40 hover:shadow-card-hover group"
              >
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500/20 to-cyan-500/10 border border-emerald-500/25 flex items-center justify-center flex-shrink-0">
                  <Briefcase className="w-6 h-6 text-emerald-400" aria-hidden="true" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-3 mb-1.5">
                    <h2 className="font-display text-lg font-semibold text-white group-hover:text-emerald-400 transition-colors">
                      {role.title}
                    </h2>
                    <StatusPill label={role.type} />
                  </div>
                  <p className="flex items-center gap-1.5 text-xs text-zinc-500 font-mono mb-2">
                    <MapPin className="w-3.5 h-3.5" aria-hidden="true" />
                    {role.location} · {role.team}
                  </p>
                  <p className="text-sm text-zinc-400 leading-relaxed">{role.summary}</p>
                </div>
                <ArrowUpRight className="w-5 h-5 text-emerald-400 flex-shrink-0 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" aria-hidden="true" />
              </a>
            ))}
          </div>

          <div className="mt-12 glass-card rounded-2xl border border-white/10 p-6 md:p-8">
            <h3 className="font-display text-lg font-semibold text-white mb-4">Why you&apos;ll like it here</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
              {perks.map((perk) => {
                const Icon = perk.icon;
                return (
                  <div key={perk.label} className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500/15 to-cyan-500/10 border border-emerald-500/20 flex items-center justify-center flex-shrink-0">
                      <Icon className="w-5 h-5 text-emerald-400" aria-hidden="true" />
                    </div>
                    <p className="text-sm text-zinc-300 leading-relaxed">{perk.label}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>
    </PublicShell>
  );
}