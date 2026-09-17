"use client";
import SectionHeading from "@/components/ui/SectionHeading";
import { useT } from "@/lib/i18n";
import PlannerTimeline from "@/components/landing/PlannerTimeline";

export default function PlannerSection() {
  const t = useT();
  return (
    <section id="planner" className="relative scroll-mt-16 px-4 py-24 sm:px-6 md:py-32" aria-labelledby="planner-heading">
      <div className="mx-auto max-w-7xl">
        <SectionHeading
          eyebrow={t("landing.planner.eyebrow")}
          title={t("landing.planner.title")}
          highlight={t("landing.planner.highlight")}
          description={t("landing.planner.description")}
        />
        <PlannerTimeline />
      </div>
    </section>
  );
}
