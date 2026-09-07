"use client";
import Link from "next/link";
import BrandMark from "@/components/ui/BrandMark";

export default function Footer() {
  return (
    <footer className="border-t border-white/10 bg-[#050507]" role="contentinfo">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-2.5 font-display text-base font-semibold text-white">
            <BrandMark className="h-7 w-7 rounded-lg" />
            9Th-Grade AI
          </Link>
          <p className="text-sm text-zinc-500 text-center max-w-md">
            Free, open-source AI exam prep for BCS, Bank & Teacher recruitment — Bangla + English.
          </p>
          <div className="flex items-center gap-4 text-xs font-mono text-zinc-500">
            <Link href="/privacy" className="hover:text-white transition-colors">Privacy</Link>
            <Link href="/terms" className="hover:text-white transition-colors">Terms</Link>
            <a href="https://github.com/9thgradeai/9th-grade-ai-next" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">GitHub</a>
          </div>
        </div>
        <div className="mt-6 pt-6 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-zinc-600 font-mono">
          <span>© 2026 9Th-Grade AI · Free & open source</span>
          <span>Built for aspirants, with aspirants.</span>
        </div>
      </div>
    </footer>
  );
}
