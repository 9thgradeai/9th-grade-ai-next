import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarDays, Clock, ArrowLeft } from "lucide-react";
import PublicShell from "@/components/public/PublicShell";
import StatusPill from "@/components/ui/StatusPill";
import { BLOG_POSTS } from "@/lib/data/blog";

type BlogArticlePageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateStaticParams() {
  return BLOG_POSTS.map((post) => ({ slug: post.slug }));
}

export async function generateMetadata({
  params,
}: BlogArticlePageProps): Promise<Metadata> {
  const { slug } = await params;
  const post = BLOG_POSTS.find((p) => p.slug === slug);
  if (!post) return { title: "Article — 9Th-Grade AI" };
  return {
    title: `${post.title} — 9Th-Grade AI`,
    description: post.excerpt,
    alternates: { canonical: `/blog/${slug}` },
    openGraph: {
      title: post.title,
      description: post.excerpt,
      type: "article",
      publishedTime: post.date,
    },
  };
}

export default async function BlogArticlePage({
  params,
}: BlogArticlePageProps) {
  const { slug } = await params;
  const post = BLOG_POSTS.find((p) => p.slug === slug);
  if (!post) notFound();

  return (
    <PublicShell>
      <article className="max-w-3xl mx-auto px-4 sm:px-6 py-16 md:py-24">
        <Link
          href="/blog"
          className="inline-flex items-center gap-2 text-sm text-zinc-400 font-mono hover:text-emerald-400 transition-colors mb-8"
        >
          <ArrowLeft className="w-4 h-4" aria-hidden="true" />
          Back to Blog
        </Link>

        <header className="mb-10">
          <div className="flex items-center gap-3 mb-5">
            <StatusPill label={post.tag} />
            <span className="text-xs text-zinc-500 font-mono inline-flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5" aria-hidden="true" />
              {post.readTime}
            </span>
            <span className="text-xs text-zinc-500 font-mono inline-flex items-center gap-1.5">
              <CalendarDays className="w-3.5 h-3.5" aria-hidden="true" />
              {post.date}
            </span>
          </div>
          <h1 className="font-display text-3xl sm:text-4xl md:text-5xl font-semibold text-white leading-tight tracking-tight">
            {post.title}
          </h1>
          <p className="mt-4 text-base sm:text-lg text-[var(--text-muted)] leading-relaxed">
            {post.excerpt}
          </p>
        </header>

        <div className="glass-card rounded-2xl border border-white/10 p-6 md:p-10 space-y-6">
          {post.body.map((paragraph, index) => (
            <p key={index} className="text-zinc-300 leading-relaxed">
              {paragraph}
            </p>
          ))}
        </div>

        <div className="mt-10 text-center">
          <Link
            href="/login?register=true"
            className="glow-border inline-flex items-center gap-2 px-7 py-3.5 rounded-full bg-emerald-500 text-zinc-950 font-mono font-semibold text-sm tracking-wide hover:bg-emerald-400 transition-colors shadow-[0_0_24px_rgba(16,185,129,0.3)]"
          >
            Put These Tips Into Practice
          </Link>
        </div>
      </article>
    </PublicShell>
  );
}