"use client";
import SectionHeading from "@/components/ui/SectionHeading";
import { useT } from "@/lib/i18n";
import AnalyticsVisualization from "@/components/landing/AnalyticsVisualization";

export default function AnalyticsSection() {
  const t = useT();
  return (
    <section id="progress" className="relative scroll-mt-16 px-4 py-24 sm:px-6 md:py-32" aria-labelledby="analytics-heading">
      <div className="mx-auto max-w-7xl">
        <div className="relative">
          <span className="absolute -top-3 right-0 hidden font-mono text-[0.65rem] uppercase tracking-[0.18em] text-zinc-600 sm:inline-block">
            {t("landing.analytics.samplePreview")}
          </span>
          <SectionHeading
            eyebrow={t("landing.analytics.eyebrow")}
            title={t("landing.analytics.title")}
            highlight={t("landing.analytics.highlight")}
            description={t("landing.analytics.description")}
          />
        </div>
        <AnalyticsVisualization />
      </div>
    </section>
  );
}
