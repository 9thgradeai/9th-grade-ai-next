import type { Metadata } from "next";
import { Megaphone, Image, FileText, Mail, ArrowUpRight } from "lucide-react";
import { prisma } from "~backend/db";
import PublicShell from "@/components/public/PublicShell";
import PageHero from "@/components/public/PageHero";
import SectionHeading from "@/components/ui/SectionHeading";

export const metadata: Metadata = {
  alternates: { canonical: "/press" },
  title: "Press Kit — 9Th-Grade AI",
  description:
    "Brand assets, product facts, and media contacts for journalists and content creators covering 9Th-Grade AI.",
};

const facts = (subjectCount: number, questionCount: number) => [
  { label: "Launched", value: "2025" },
  { label: "Subjects covered", value: String(subjectCount) },
  { label: "Questions in bank", value: String(questionCount) },
  { label: "Coverage", value: "BCS · Bank · Teacher · PSC" },
  { label: "Languages", value: "English · বাংলা" },
  { label: "Model", value: "Free & open source" },
];

const assets = [
  {
    icon: Megaphone,
    title: "One-liner",
    text: "9Th-Grade AI is a free, open-source AI-powered exam preparation platform that helps Bangladeshi government job aspirants master BCS, Bank, and Teacher recruitment exams.",
  },
  {
    icon: Image,
    title: "Logo & Brand",
    text: "The brand mark is a knowledge constellation — four connected nodes orbiting a luminous core inside a deep-space tile, ringed in blue→cyan→violet. Fonts: Space Grotesk for display, Inter for body, JetBrains Mono for code.",
  },
  {
    icon: FileText,
    title: "Product Facts",
    text: "A syllabus explorer, a growing question bank, full-length mock tests, spaced-repetition flashcards, an AI question solver, a bilingual AI tutor, and a daily streak system.",
  },
];

export default async function PressPage() {
  const subjectCount = await prisma.subject.count();
  const questionCount = await prisma.question.count();
  return (
    <PublicShell>
      <PageHero
        eyebrow="PRESS KIT"
        title="Everything You Need"
        highlight="to Write About Us"
        description="Facts, figures, and brand guidance for journalists, educators, and content creators covering 9Th-Grade AI."
        actions={[{ href: "mailto:press@9thgrade.ai", label: "Contact Press Team" }]}
      />

      <section className="py-16 md:py-24 px-4 sm:px-6">
        <div className="max-w-5xl mx-auto">
          {/* Facts grid */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-14">
            {facts(subjectCount, questionCount).map((fact) => (
              <div key={fact.label} className="glass-card rounded-2xl border border-white/10 p-5">
                <p className="text-xs text-zinc-500 font-mono uppercase tracking-wider">{fact.label}</p>
                <p className="mt-1.5 text-lg font-display font-semibold text-white">{fact.value}</p>
              </div>
            ))}
          </div>

          <SectionHeading eyebrow="ASSETS" title="Quick Reference" highlight="Materials" />

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {assets.map((asset) => {
              const Icon = asset.icon;
              return (
                <div key={asset.title} className="glass-card rounded-2xl border border-white/10 p-6">
                  <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-emerald-500/20 to-cyan-500/10 border border-emerald-500/25 flex items-center justify-center mb-4">
                    <Icon className="w-5 h-5 text-emerald-400" aria-hidden="true" />
                  </div>
                  <h3 className="font-display text-base font-semibold text-white mb-2">{asset.title}</h3>
                  <p className="text-sm text-zinc-400 leading-relaxed">{asset.text}</p>
                </div>
              );
            })}
          </div>

          {/* Media contact */}
          <div className="mt-14 glass-card rounded-2xl border border-white/10 p-6 md:p-8 flex flex-col sm:flex-row items-center justify-between gap-5">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-emerald-500/20 to-cyan-500/10 border border-emerald-500/25 flex items-center justify-center flex-shrink-0">
                <Mail className="w-5 h-5 text-emerald-400" aria-hidden="true" />
              </div>
              <div>
                <p className="text-sm font-medium text-white">Media inquiries</p>
                <p className="text-xs text-zinc-500 mt-0.5">press@9thgrade.ai · replies within 24 hours</p>
              </div>
            </div>
            <a
              href="mailto:press@9thgrade.ai"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-full text-sm font-semibold text-zinc-950 bg-emerald-500 hover:bg-emerald-400 transition-colors shadow-[0_0_20px_rgba(16,185,129,0.25)] flex-shrink-0"
            >
              Get in Touch
              <ArrowUpRight className="w-4 h-4" aria-hidden="true" />
            </a>
          </div>
        </div>
      </section>
    </PublicShell>
  );
}