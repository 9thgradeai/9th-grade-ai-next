"use client";

import HeroBackground from "@/components/landing/hero/HeroBackground";
import HeroContent from "@/components/landing/hero/HeroContent";
import { ChevronDown } from "lucide-react";
import { useT } from "@/lib/i18n";

export default function HeroSection({ subjectCount }: { subjectCount: number }) {
  const t = useT();

  return (
    <section
      className="hero-section-ref relative flex min-h-[92dvh] items-center overflow-hidden px-4 pb-24 pt-28 sm:px-6"
      aria-label="Introduction"
    >
      {/* Luminous gravitational field — DOM/CSS/Motion backdrop, content stays dominant */}
      <HeroBackground />

      <HeroContent subjectCount={subjectCount} />

      <div className="hero-scroll absolute bottom-7 left-1/2 z-10 hidden -translate-x-1/2 flex-col items-center gap-1.5 text-white/45 sm:flex">
        <span className="font-mono text-[0.65rem] uppercase tracking-[0.22em]">{t("common.scroll")}</span>
        <ChevronDown className="h-4 w-4" />
      </div>
    </section>
  );
}
