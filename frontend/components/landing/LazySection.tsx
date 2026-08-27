"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";

/**
 * Below-the-fold landing sections are heavy (Framer Motion visualizations,
 * WebGL-adjacent canvases, large SVGs). To keep the mobile Lighthouse
 * performance score high we defer loading their JavaScript until the section
 * is near the viewport. The design is unchanged: each section still renders
 * exactly as before once mounted, and a reserved min-height avoids layout
 * shift for content that lives outside the initial viewport.
 *
 * Sections are registered here with `ssr: false` so their code (and the
 * Framer Motion runtime they pull in) is split into on-demand chunks that
 * never block first paint or inflate the initial bundle.
 */

const REGISTRY = {
  TrustStripSection: dynamic(() => import("@/components/landing/TrustStripSection"), { ssr: false }),
  ProblemSection: dynamic(() => import("@/components/landing/ProblemSection"), { ssr: false }),
  IntelligenceSection: dynamic(() => import("@/components/landing/IntelligenceSection"), { ssr: false }),
  SignalSection: dynamic(() => import("@/components/landing/SignalSection"), { ssr: false }),
  AdaptivePracticeSection: dynamic(() => import("@/components/landing/AdaptivePracticeSection"), { ssr: false }),
  TutorSection: dynamic(() => import("@/components/landing/TutorSection"), { ssr: false }),
  ExamEngineSection: dynamic(() => import("@/components/landing/ExamEngineSection"), { ssr: false }),
  SubjectUniverseSection: dynamic(() => import("@/components/landing/SubjectUniverseSection"), { ssr: false }),
  AnalyticsSection: dynamic(() => import("@/components/landing/AnalyticsSection"), { ssr: false }),
  PlannerSection: dynamic(() => import("@/components/landing/PlannerSection"), { ssr: false }),
  PhilosophySection: dynamic(() => import("@/components/landing/PhilosophySection"), { ssr: false }),
  FinalCtaSection: dynamic(() => import("@/components/landing/FinalCtaSection"), { ssr: false }),
} as const;

export type LazySectionName = keyof typeof REGISTRY;

export default function LazySection({
  name,
  minHeight = 520,
}: {
  name: LazySectionName;
  minHeight?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [show, setShow] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Mount well before the section scrolls into view so its entrance
    // animation can play naturally as it appears.
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setShow(true);
          io.disconnect();
        }
      },
      { rootMargin: "600px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const Comp = REGISTRY[name];
  return (
    <div ref={ref} style={{ minHeight: show ? undefined : minHeight }}>
      {show ? <Comp /> : null}
    </div>
  );
}
