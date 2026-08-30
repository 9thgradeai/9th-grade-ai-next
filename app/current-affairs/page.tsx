import type { Metadata } from "next";
import Link from "next/link";
import { Newspaper, ArrowUpRight, Radio } from "lucide-react";
import PublicShell from "@/components/public/PublicShell";
import PageHero from "@/components/public/PageHero";
import SectionHeading from "@/components/ui/SectionHeading";
import StatusPill from "@/components/ui/StatusPill";
import { getFlashNews } from "~backend/services/content";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  alternates: { canonical: "/current-affairs" },
  title: "Current Affairs — 9Th-Grade AI",
  description:
    "Curated national and international current-affairs items for BCS, Bank, and Teacher recruitment exam preparation.",
};

export default async function CurrentAffairsPage() {
  const feed = await getFlashNews();

  return (
    <PublicShell>
      <PageHero
        eyebrow="CURRENT AFFAIRS"
        title="One Daily Feed,"
        highlight="Zero Missed Marks"
        description="National and international affairs distilled into exam-ready facts — tied to the current-affairs sections of every paper."
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

          {feed.length === 0 ? (
            <p className="text-center text-zinc-500 font-mono py-12">
              No current-affairs items available right now.
            </p>
          ) : (
            <div className="space-y-4">
              {feed.map((item) => (
                <article
                  key={item.id}
                  className="glass-card rounded-2xl border border-white/10 p-5 md:p-6 flex flex-col sm:flex-row sm:items-start gap-4 transition-[border-color,box-shadow] duration-300 hover:border-emerald-400/30"
                >
                  <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-emerald-500/20 to-cyan-500/10 border border-emerald-500/25 flex items-center justify-center flex-shrink-0">
                    <Newspaper className="w-5 h-5 text-emerald-400" aria-hidden="true" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-3 mb-1.5">
                      <StatusPill label={item.categoryBn || item.tag} />
                      {item.date ? (
                        <span className="text-xs text-zinc-500 font-mono">{item.date}</span>
                      ) : null}
                    </div>
                    <h2 className="font-display text-base md:text-lg font-semibold text-white leading-snug">
                      {item.titleBn || item.titleEn}
                    </h2>
                    <p className="mt-1.5 text-sm text-zinc-400 leading-relaxed">
                      {item.text}
                    </p>
                  </div>
                </article>
              ))}
            </div>
          )}

          <div className="mt-10 flex items-center justify-center gap-2 text-sm text-zinc-500 font-mono">
            <Radio className="w-4 h-4 text-emerald-400" aria-hidden="true" />
            {feed.length} curated item{feed.length === 1 ? "" : "s"}
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
