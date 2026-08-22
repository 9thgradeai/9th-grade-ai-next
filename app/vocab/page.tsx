import type { Metadata } from "next";
import Link from "next/link";
import { BookOpenText, ArrowUpRight, Layers } from "lucide-react";
import PublicShell from "@/components/public/PublicShell";
import PageHero from "@/components/public/PageHero";
import SectionHeading from "@/components/ui/SectionHeading";

export const metadata: Metadata = {
  alternates: { canonical: "/vocab" },
  title: "Vocabulary Builder — 9Th-Grade AI",
  description:
    "Exam-focused English vocabulary decks with Bengali meanings, synonyms, and spaced-repetition flashcards for BCS, Bank, and Teacher recruitment exams.",
};

const decks = [
  {
    title: "BCS High-Frequency Words",
    words: 1500,
    level: "CORE",
    description: "The most-tested vocabulary across the last ten BCS preliminaries, with Bengali glosses.",
  },
  {
    title: "Bank Exam Idioms & Phrases",
    words: 800,
    level: "HIGH-YIELD",
    description: "Idioms, phrasal verbs, and collocations that regularly appear in bank officer papers.",
  },
  {
    title: "Synonyms & Antonyms Mega Deck",
    words: 2000,
    level: "MASTERY",
    description: "Paired synonym-antonym sets organized by difficulty for rapid expansion.",
  },
  {
    title: "Academic & Editorial Words",
    words: 1200,
    level: "WRITTEN",
    description: "Formal vocabulary for BCS written and descriptive papers, with usage examples.",
  },
  {
    title: "Roots, Prefixes & Suffixes",
    words: 600,
    level: "FOUNDATION",
    description: "Build the skill of decoding unfamiliar words by mastering high-yield word parts.",
  },
  {
    title: "Daily 20 Challenge",
    words: "∞",
    level: "HABIT",
    description: "Twenty fresh words every day, auto-scheduled into your spaced-repetition queue.",
  },
];

export default function VocabPage() {
  return (
    <PublicShell>
      <PageHero
        eyebrow="VOCABULARY BUILDER"
        title="Words That Win"
        highlight="Exam Marks"
        description="English vocabulary decks engineered for competitive exams — Bengali meanings, synonyms, antonyms, and spaced-repetition reviews that make words stick."
        actions={[{ href: "/dashboard?tab=flashcards", label: "Start a Deck" }]}
      />

      <section className="py-16 md:py-24 px-4 sm:px-6">
        <div className="max-w-7xl mx-auto">
          <SectionHeading
            eyebrow="DECKS"
            title="Six Decks,"
            highlight="Every Exam Level"
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {decks.map((deck) => (
              <article
                key={deck.title}
                className="glass-card rounded-2xl border border-white/10 p-6 flex flex-col transition-[border-color,box-shadow] duration-300 hover:border-emerald-400/40 hover:shadow-card-hover group"
              >
                <div className="flex items-center justify-between mb-4">
                  <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-emerald-500/20 to-cyan-500/10 border border-emerald-500/25 flex items-center justify-center">
                    <BookOpenText className="w-5 h-5 text-emerald-400" aria-hidden="true" />
                  </div>
                  <span className="text-[10px] font-mono text-emerald-400/90 uppercase tracking-[0.14em] px-2.5 py-1 bg-emerald-500/8 border border-emerald-500/20 rounded-full">
                    {deck.level}
                  </span>
                </div>

                <h2 className="font-display text-lg font-semibold text-white group-hover:text-emerald-400 transition-colors">
                  {deck.title}
                </h2>
                <p className="mt-2 text-sm text-zinc-400 leading-relaxed flex-1">
                  {deck.description}
                </p>

                <div className="mt-5 pt-4 border-t border-white/10 flex items-center justify-between">
                  <span className="inline-flex items-center gap-1.5 text-xs text-zinc-500 font-mono">
                    <Layers className="w-3.5 h-3.5" aria-hidden="true" />
                    {deck.words} words
                  </span>
                  <Link
                    href="/dashboard?tab=flashcards"
                    className="inline-flex items-center gap-1 text-sm font-medium text-emerald-400 hover:text-emerald-300 transition-colors"
                  >
                    Study
                    <ArrowUpRight className="w-4 h-4 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" aria-hidden="true" />
                  </Link>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>
    </PublicShell>
  );
}