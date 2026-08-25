import SectionHeading from "@/components/ui/SectionHeading";
import AnalyticsVisualization from "@/components/landing/AnalyticsVisualization";

export default function AnalyticsSection() {
  return (
    <section id="progress" className="relative scroll-mt-16 px-4 py-24 sm:px-6 md:py-32" aria-labelledby="analytics-heading">
      <div className="mx-auto max-w-7xl">
        <div className="relative">
          <span className="absolute -top-3 right-0 hidden font-mono text-[0.65rem] uppercase tracking-[0.18em] text-zinc-600 sm:inline-block">
            sample preview
          </span>
          <SectionHeading
            eyebrow="SIGNAL, NOT NOISE"
            title="Your preparation,"
            highlight="measured precisely"
            description="Five numbers that actually matter, computed from your own attempts — never vanity metrics."
          />
        </div>
        <AnalyticsVisualization />
      </div>
    </section>
  );
}
