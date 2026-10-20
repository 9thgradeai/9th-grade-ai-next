"use client";
import Link from "next/link";
import BrandMark from "@/components/ui/BrandMark";
import LanguageToggle from "@/components/ui/LanguageToggle";
import { useT } from "@/lib/i18n";

const linkCls =
  "inline-flex items-center min-h-[44px] px-2 -mx-2 rounded-md text-sm text-zinc-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] hover:text-white hover:translate-x-0.5 transition-all";

const columns: Array<{
  titleKey: string;
  links: Array<{ href: string; labelKey: string; external?: boolean }>;
}> = [
  {
    titleKey: "footer.column.platform",
    links: [
      { href: "/tracks", labelKey: "footer.link.tracks" },
      { href: "/current-affairs", labelKey: "footer.link.currentAffairs" },
      { href: "/guides", labelKey: "footer.link.guides" },
      { href: "/vocab", labelKey: "footer.link.vocab" },
      { href: "/blog", labelKey: "footer.link.blog" },
      { href: "/docs", labelKey: "footer.link.docs" },
    ],
  },
  {
    titleKey: "footer.column.organization",
    links: [
      { href: "/about", labelKey: "footer.link.about" },
      { href: "/careers", labelKey: "footer.link.careers" },
      { href: "/press", labelKey: "footer.link.press" },
      { href: "/partners", labelKey: "footer.link.partners" },
    ],
  },
  {
    titleKey: "footer.column.legal",
    links: [
      { href: "/privacy", labelKey: "footer.privacy" },
      { href: "/terms", labelKey: "footer.terms" },
      { href: "https://github.com/9thgradeai/9th-grade-ai-next", labelKey: "footer.github", external: true },
    ],
  },
];

/**
 * Premium footer. Structure: brand block + conversion pill, curated link
 * columns (a deliberate subset — deep navigation stays in the AppNavbar
 * mega menus), a giant outline wordmark that fills with the brand gradient
 * on hover, and a mono utility bar with the language toggle.
 * Everything is CSS — no client behavior beyond the shared hooks.
 */
export default function Footer() {
  const t = useT();
  return (
    <footer className="relative overflow-hidden border-t border-white/10 bg-[var(--background)]" role="contentinfo">
      {/* hairline brand glow along the top edge */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[var(--primary)]/60 to-transparent"
      />
      {/* faint wash so the wordmark sits in light, not void */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 h-64 bg-[radial-gradient(ellipse_60%_100%_at_50%_100%,rgba(139,156,255,0.08),transparent_70%)]"
      />

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pb-8 pt-14">
        <div className="flex flex-col gap-10 md:flex-row md:items-start md:justify-between">
          <div className="max-w-sm">
            <Link
              href="/"
              className="inline-flex items-center gap-2.5 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
            >
              <BrandMark className="h-8 w-8 rounded-lg shadow-glow-sm" />
              <span className="font-display text-base font-semibold text-white">9Th-Grade AI</span>
            </Link>
            <p className="mt-4 text-sm leading-relaxed text-zinc-400 text-balance">{t("footer.tagline")}</p>
            <p className="mt-5 inline-flex items-center gap-2 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-3 py-1.5 font-mono text-xs text-emerald-300">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" aria-hidden="true" />
              {t("footer.pill")}
            </p>
          </div>

          <div className="flex flex-col items-start gap-4 md:items-end">
            <Link
              href="/register"
              className="cta-shine inline-flex min-h-[44px] items-center rounded-full bg-gradient-to-br from-emerald-400 via-cyan-400 to-sky-500 px-6 text-sm font-semibold text-black shadow-glow-sm transition hover:brightness-110 active:translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
            >
              {t("footer.start")}
            </Link>
            <button
              type="button"
              onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
              className="font-mono text-xs uppercase tracking-[0.18em] text-zinc-500 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] rounded-md px-1"
            >
              ↑ {t("footer.backToTop")}
            </button>
          </div>
        </div>

        <nav aria-label={t("footer.columnsLabel")} className="mt-12 grid grid-cols-2 gap-8 sm:grid-cols-3 lg:justify-items-end lg:gap-16">
          {columns.map((col) => (
            <div key={col.titleKey}>
              <p className="mb-2 font-mono text-xs uppercase tracking-[0.16em] text-zinc-500">{t(col.titleKey)}</p>
              <ul>
                {col.links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      target={link.external ? "_blank" : undefined}
                      rel={link.external ? "noopener noreferrer" : undefined}
                      className={linkCls}
                    >
                      {t(link.labelKey)}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        {/* Giant outline wordmark: fills with the brand gradient on hover */}
        <div className="mt-14 border-t border-white/5 pt-10" aria-hidden="true">
          <p className="footer-wordmark select-none text-center font-hero text-[clamp(2.6rem,11vw,8rem)] font-extrabold uppercase leading-none tracking-[-0.04em]">
            9Th-Grade AI
          </p>
        </div>

        <div className="mt-10 flex flex-col-reverse items-center justify-between gap-4 border-t border-white/10 pt-6 font-mono text-xs text-zinc-500 sm:flex-row">
          <span>{t("footer.copyright")}</span>
          <span>{t("footer.builtFor")}</span>
          <LanguageToggle className="rounded-full border border-white/10 px-3 py-2 text-zinc-300 hover:border-white/20 hover:text-white" />
        </div>
      </div>
    </footer>
  );
}
