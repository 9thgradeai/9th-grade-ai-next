"use client";

import HeroBackground from "@/components/landing/hero/HeroBackground";
import HeroContent from "@/components/landing/hero/HeroContent";
import { CaretDown } from "@phosphor-icons/react";
import { useT } from "@/lib/i18n";

/**
 * Static hero shell — deliberately no framer-motion here. The scroll-linked
 * parallax previously pulled the motion runtime into the landing's initial
 * JS bundle and delayed mobile LCP under CPU throttling; the entrance
 * choreography is pure CSS (word-rise / heroRise in globals.css) and paints
 * at first paint without hydration.
 */
export default function HeroSection({ questionCount }: { questionCount: number }) {
  const t = useT();

  return (
    <section
      className="hero-section-ref relative flex min-h-[92dvh] items-center overflow-hidden px-4 pb-14 pt-24 sm:px-6"
      aria-labelledby="hero-heading"
    >
      <div className="absolute inset-0 z-0">
        <HeroBackground />
      </div>

      <div className="relative z-10 mx-auto w-full max-w-[1440px]">
        <HeroContent questionCount={questionCount} />
      </div>

      <div
        aria-hidden="true"
        className="hero-scroll absolute bottom-7 left-1/2 z-10 hidden -translate-x-1/2 flex-col items-center gap-1.5 text-white/70 sm:flex"
      >
        <span className="font-mono text-[0.65rem] uppercase tracking-[0.22em]">{t("common.scroll")}</span>
        <CaretDown className="h-4 w-4" />
      </div>
    </section>
  );
}
