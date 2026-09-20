"use client";

import HeroBackground from "@/components/landing/hero/HeroBackground";
import HeroContent from "@/components/landing/hero/HeroContent";
import { CaretDown } from "@phosphor-icons/react";
import { useT } from "@/lib/i18n";
import { useRef } from "react";
import { motion, useScroll, useTransform } from "framer-motion";

export default function HeroSection({ subjectCount }: { subjectCount: number }) {
  const t = useT();
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start start", "end start"],
  });
  const bgOpacity = useTransform(scrollYProgress, [0, 1], [1, 0.2]);
  const bgScale = useTransform(scrollYProgress, [0, 1], [1, 1.08]);
  const contentOpacity = useTransform(scrollYProgress, [0, 0.6], [1, 0]);
  const contentY = useTransform(scrollYProgress, [0, 1], [0, -60]);

  return (
    <section
      ref={ref}
      className="hero-section-ref relative flex min-h-[92dvh] items-center overflow-hidden px-4 pb-24 pt-28 sm:px-6"
      aria-label="Introduction"
    >
      <motion.div className="absolute inset-0 z-0" style={{ opacity: bgOpacity, scale: bgScale }}>
        <HeroBackground />
      </motion.div>

      <motion.div
        className="relative z-10 mx-auto w-full max-w-[1440px]"
        style={{ opacity: contentOpacity, y: contentY }}
      >
        <HeroContent subjectCount={subjectCount} />
      </motion.div>

      <motion.div
        className="hero-scroll absolute bottom-7 left-1/2 z-10 hidden -translate-x-1/2 flex-col items-center gap-1.5 text-white/45 sm:flex"
        style={{ opacity: contentOpacity }}
      >
        <span className="font-mono text-[0.65rem] uppercase tracking-[0.22em]">{t("common.scroll")}</span>
        <CaretDown className="h-4 w-4" />
      </motion.div>
    </section>
  );
}
