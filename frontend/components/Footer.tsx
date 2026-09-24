"use client";
import Link from "next/link";
import BrandMark from "@/components/ui/BrandMark";
import { useT } from "@/lib/i18n";

const linkCls =
  "inline-flex items-center min-h-[44px] px-2 -mx-2 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] hover:text-white transition-colors";

export default function Footer() {
  const t = useT();
  return (
    <footer className="border-t border-white/10 bg-[var(--background)]" role="contentinfo">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-2.5 font-display text-base font-semibold text-white">
            <BrandMark className="h-7 w-7 rounded-lg" />
            9Th-Grade AI
          </Link>
          <p className="text-sm text-zinc-400 text-center max-w-md text-balance">
            {t("footer.tagline")}
          </p>
          <nav aria-label="Footer" className="flex items-center gap-2 text-xs font-mono text-zinc-400">
            <Link href="/privacy" className={linkCls}>{t("footer.privacy")}</Link>
            <Link href="/terms" className={linkCls}>{t("footer.terms")}</Link>
            <a href="https://github.com/9thgradeai/9th-grade-ai-next" target="_blank" rel="noopener noreferrer" className={linkCls}>{t("footer.github")}</a>
          </nav>
        </div>
        <div className="mt-6 pt-6 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-zinc-500 font-mono">
          <span>{t("footer.copyright")}</span>
          <span>{t("footer.builtFor")}</span>
        </div>
      </div>
    </footer>
  );
}
