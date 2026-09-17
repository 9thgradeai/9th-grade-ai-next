"use client";
import SectionHeading from "@/components/ui/SectionHeading";
import { useT } from "@/lib/i18n";
import SignalFlow from "@/components/landing/SignalFlow";
import { useRef } from "react";
import { motion, useScroll, useTransform } from "framer-motion";

export default function SignalSection() {
  const t = useT();
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });
  const flowOpacity = useTransform(scrollYProgress, [0, 0.15, 0.85, 1], [0.25, 1, 1, 0.25]);
  const flowScale = useTransform(scrollYProgress, [0, 0.2, 0.8, 1], [0.96, 1, 1, 0.96]);
  return (
    <section id="signal" ref={ref} className="relative scroll-mt-16 px-4 py-24 sm:px-6 md:py-32" aria-labelledby="signal-heading">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 50% 38% at 22% 40%, rgba(45,212,191,0.07), transparent 60%)",
        }}
      />
      <div className="relative mx-auto max-w-7xl">
        <SectionHeading
          eyebrow={t("landing.signal.eyebrow")}
          title={t("landing.signal.title")}
          highlight={t("landing.signal.highlight")}
          description={t("landing.signal.description")}
        />
        <motion.div style={{ opacity: flowOpacity, scale: flowScale }} className="will-change-transform">
          <SignalFlow />
        </motion.div>
      </div>
    </section>
  );
}
