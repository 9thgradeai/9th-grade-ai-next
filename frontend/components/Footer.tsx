"use client";
import Link from "next/link";
import BrandMark from "@/components/ui/BrandMark";
import { useT } from "@/lib/i18n";

export default function Footer() {
  const t = useT();
  return (
    <footer className="border-t border-white/10 bg-[#050507]" role="contentinfo">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-2.5 font-display text-base font-semibold text-white">
            <BrandMark className="h-7 w-7 rounded-lg" />
            9Th-Grade AI
          </Link>
          <p className="text-sm text-zinc-500 text-center max-w-md">
            {t("footer.tagline")}
          </p>
          <div className="flex items-center gap-4 text-xs font-mono text-zinc-500">
            <Link href="/privacy" className="hover:text-white transition-colors">{t("footer.privacy")}</Link>
            <Link href="/terms" className="hover:text-white transition-colors">{t("footer.terms")}</Link>
            <a href="https://github.com/9thgradeai/9th-grade-ai-next" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">{t("footer.github")}</a>
          </div>
        </div>
        <div className="mt-6 pt-6 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-zinc-600 font-mono">
          <span>{t("footer.copyright")}</span>
          <span>{t("footer.builtFor")}</span>
        </div>
      </div>
    </footer>
  );
}
