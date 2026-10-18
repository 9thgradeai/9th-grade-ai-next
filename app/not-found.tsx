import type { Metadata } from "next";
import Link from "next/link";
import PublicShell from "@/components/public/PublicShell";
import Breadcrumbs from "@/components/ui/Breadcrumbs";
import GoBackButton from "@/components/ui/GoBackButton";

export const metadata: Metadata = {
  title: "Page not found",
  description:
    "The page you are looking for does not exist. Explore exam tracks, study guides, vocabulary, current affairs, and more on 9Th-Grade AI.",
  robots: { index: false, follow: false },
};

const SUGGESTIONS = [
  { href: "/", label: "Home" },
  { href: "/tracks", label: "Exam Tracks" },
  { href: "/guides", label: "Study Guides" },
  { href: "/vocab", label: "Vocabulary" },
  { href: "/current-affairs", label: "Current Affairs" },
  { href: "/blog", label: "Blog" },
];

export default function NotFound() {
  return (
    <PublicShell>
      <section className="relative px-4 sm:px-6 pt-16 pb-20 md:pt-24 md:pb-28">
        <div className="mx-auto max-w-2xl">
          <Breadcrumbs
            items={[{ label: "Home", href: "/" }, { label: "Page not found" }]}
            className="mb-8"
          />

          <div className="glass rounded-3xl border border-[var(--border)] p-8 text-center md:p-12">
            <p className="font-display text-6xl font-bold leading-none text-[var(--primary)]/25 md:text-7xl">
              404
            </p>
            <h1 className="mt-4 font-display text-3xl font-semibold tracking-tight text-[var(--text-primary)] md:text-4xl">
              This page could not be found
            </h1>
            <p className="mx-auto mt-4 max-w-md text-sm leading-relaxed text-[var(--text-secondary)] md:text-base">
              The link may be broken, the page may have moved, or the address may
              have been typed incorrectly. Try one of these instead:
            </p>

            <div className="mt-8 flex flex-wrap items-center justify-center gap-2.5">
              {SUGGESTIONS.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="inline-flex min-h-[44px] items-center rounded-full border border-[var(--border-default)] bg-[var(--surface-raised)] px-4 py-2 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:border-[var(--primary)] hover:text-[var(--primary)]"
                >
                  {item.label}
                </Link>
              ))}
            </div>

            <div className="mt-8 flex items-center justify-center gap-3">
              <Link
                href="/"
                className="inline-flex min-h-[44px] items-center rounded-full bg-[var(--primary)] px-6 py-2.5 text-sm font-semibold text-[var(--text-inverse)] transition-colors hover:bg-[var(--primary-hover)]"
              >
                Back to home
              </Link>
              <GoBackButton>Go back</GoBackButton>
            </div>
          </div>
        </div>
      </section>
    </PublicShell>
  );
}
