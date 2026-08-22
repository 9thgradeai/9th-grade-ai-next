import type { Metadata } from "next";
import Link from "next/link";
import { BookOpen, ArrowUpRight, CalendarDays, Clock } from "lucide-react";
import PublicShell from "@/components/public/PublicShell";
import PageHero from "@/components/public/PageHero";
import SectionHeading from "@/components/ui/SectionHeading";
import StatusPill from "@/components/ui/StatusPill";
import { BLOG_POSTS } from "@/lib/data/blog";

export const metadata: Metadata = {
  alternates: { canonical: "/blog" },
  title: "Blog & Tips — 9Th-Grade AI",
  description:
    "Study strategies, exam insights, and preparation tips from the 9Th-Grade AI team for BCS, Bank, and Teacher recruitment aspirants.",
};

const posts = BLOG_POSTS.map((post) => ({
  tag: post.tag,
  title: post.title,
  excerpt: post.excerpt,
  date: post.date,
  readTime: post.readTime,
  href: `/blog/${post.slug}`,
}));

export default function BlogPage() {
  return (
    <PublicShell>
      <PageHero
        eyebrow="BLOG & TIPS"
        title="Smarter Study,"
        highlight="Every Single Day"
        description="Tactical guides and exam insights distilled from how successful aspirants actually prepare — no fluff, just systems that work."
        actions={[{ href: "/login?register=true", label: "Start Free Preparation" }]}
      />

      <section className="py-16 md:py-24 px-4 sm:px-6">
        <div className="max-w-7xl mx-auto">
          <SectionHeading
            eyebrow="LATEST POSTS"
            title="Fresh from the"
            highlight="Prep Lab"
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {posts.map((post) => (
              <article
                key={post.title}
                className="glass-card rounded-2xl border border-white/10 p-6 flex flex-col transition-[border-color,box-shadow] duration-300 hover:border-emerald-400/40 hover:shadow-card-hover group"
              >
                <div className="flex items-center justify-between mb-5">
                  <StatusPill label={post.tag} />
                  <span className="text-xs text-zinc-500 font-mono inline-flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5" aria-hidden="true" />
                    {post.readTime}
                  </span>
                </div>

                <h2 className="font-display text-lg font-semibold text-white leading-snug group-hover:text-emerald-400 transition-colors">
                  <Link href={post.href}>{post.title}</Link>
                </h2>
                <p className="mt-3 text-sm text-zinc-400 leading-relaxed flex-1">
                  {post.excerpt}
                </p>

                <div className="mt-5 pt-4 border-t border-white/10 flex items-center justify-between text-xs text-zinc-500">
                  <span className="inline-flex items-center gap-1.5 font-mono">
                    <CalendarDays className="w-3.5 h-3.5" aria-hidden="true" />
                    {post.date}
                  </span>
                  <Link
                    href={post.href}
                    className="inline-flex items-center gap-1 text-emerald-400 hover:text-emerald-300 transition-colors font-medium"
                    aria-label={`Read ${post.title}`}
                  >
                    Read
                    <ArrowUpRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" aria-hidden="true" />
                  </Link>
                </div>
              </article>
            ))}
          </div>

          <div className="mt-12 text-center">
            <p className="inline-flex items-center gap-2 text-sm text-zinc-500 font-mono">
              <BookOpen className="w-4 h-4 text-emerald-400" aria-hidden="true" />
              New guides published weekly. Coming soon — full article pages.
            </p>
          </div>
        </div>
      </section>
    </PublicShell>
  );
}