import type { Metadata } from "next";
import Link from "next/link";
import { Newspaper, ArrowUpRight, Radio } from "lucide-react";
import PublicShell from "@/components/public/PublicShell";
import PageHero from "@/components/public/PageHero";
import SectionHeading from "@/components/ui/SectionHeading";
import StatusPill from "@/components/ui/StatusPill";

export const metadata: Metadata = {
  alternates: { canonical: "/current-affairs" },
  title: "Current Affairs — 9Th-Grade AI",
  description:
    "A daily-updated current affairs feed covering national and international events for BCS, Bank, and Teacher recruitment exam preparation.",
};

const feed = [
  {
    tag: "NATIONAL",
    date: "Aug 19, 2026",
    title: "Padma Bridge rail link completes final test run",
    excerpt:
      "The long-awaited rail connection across the Padma Bridge completed its final test run, a key milestone for regional connectivity and trade.",
  },
  {
    tag: "ECONOMY",
    date: "Aug 18, 2026",
    title: "Export earnings cross $50B for the first time",
    excerpt:
      "Bangladesh's export earnings crossed the $50 billion mark for the first time in a fiscal year, led by ready-made garments and remittance growth.",
  },
  {
    tag: "INTERNATIONAL",
    date: "Aug 17, 2026",
    title: "COP summit adopts new climate finance framework",
    excerpt:
      "Delegates at the annual climate summit adopted a new finance framework aimed at scaling adaptation funding for developing nations.",
  },
  {
    tag: "TECH",
    date: "Aug 16, 2026",
    title: "Bangladesh launches national AI strategy",
    excerpt:
      "The government unveiled a national AI strategy focused on public-service modernization, skills training, and ethical AI adoption.",
  },
  {
    tag: "NATIONAL",
    date: "Aug 15, 2026",
    title: "National budget targets 6.5% growth this fiscal year",
    excerpt:
      "The annual budget prioritizes infrastructure, social safety nets, and export diversification to support the growth target.",
  },
  {
    tag: "INTERNATIONAL",
    date: "Aug 14, 2026",
    title: "UN adopts resolution on digital public infrastructure",
    excerpt:
      "A UN resolution encouraging interoperable digital public infrastructure was adopted, with strong support from developing economies.",
  },
];

export default function CurrentAffairsPage() {
  return (
    <PublicShell>
      <PageHero
        eyebrow="CURRENT AFFAIRS"
        title="One Daily Feed,"
        highlight="Zero Missed Marks"
        description="National and international affairs distilled into exam-ready facts — refreshed daily and directly tied to the current-affairs sections of every paper."
        actions={[
          { href: "/login?register=true", label: "Start Free Preparation" },
          { href: "/dashboard?tab=flashcards", label: "Revise with Flashcards", variant: "ghost" },
        ]}
      />

      <section className="py-16 md:py-24 px-4 sm:px-6">
        <div className="max-w-5xl mx-auto">
          <SectionHeading
            eyebrow="THE FEED"
            title="What's Happening,"
            highlight="In Exam Terms"
            description="Every item is written as a question-ready fact. Skim daily, note weekly, revise monthly."
          />

          <div className="space-y-4">
            {feed.map((item) => (
              <article
                key={item.title}
                className="glass-card rounded-2xl border border-white/10 p-5 md:p-6 flex flex-col sm:flex-row sm:items-start gap-4 transition-[border-color,box-shadow] duration-300 hover:border-emerald-400/30"
              >
                <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-emerald-500/20 to-cyan-500/10 border border-emerald-500/25 flex items-center justify-center flex-shrink-0">
                  <Newspaper className="w-5 h-5 text-emerald-400" aria-hidden="true" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-3 mb-1.5">
                    <StatusPill label={item.tag} />
                    <span className="text-xs text-zinc-500 font-mono">{item.date}</span>
                  </div>
                  <h2 className="font-display text-base md:text-lg font-semibold text-white leading-snug">
                    {item.title}
                  </h2>
                  <p className="mt-1.5 text-sm text-zinc-400 leading-relaxed">
                    {item.excerpt}
                  </p>
                </div>
              </article>
            ))}
          </div>

          <div className="mt-10 flex items-center justify-center gap-2 text-sm text-zinc-500 font-mono">
            <Radio className="w-4 h-4 text-emerald-400" aria-hidden="true" />
            Feed refreshed daily · 4,200+ items archived for revision
          </div>

          <div className="mt-6 text-center">
            <Link
              href="/login?register=true"
              className="inline-flex items-center gap-2 px-7 py-3.5 rounded-full text-sm font-semibold text-zinc-950 bg-emerald-500 hover:bg-emerald-400 transition-colors shadow-[0_0_24px_rgba(16,185,129,0.3)]"
            >
              Track Current Affairs Daily
              <ArrowUpRight className="w-4 h-4" aria-hidden="true" />
            </Link>
          </div>
        </div>
      </section>
    </PublicShell>
  );
}