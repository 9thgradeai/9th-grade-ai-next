import SectionHeading from "@/components/ui/SectionHeading";
import PlannerTimeline from "@/components/landing/PlannerTimeline";

export default function PlannerSection() {
  return (
    <section id="planner" className="relative scroll-mt-16 px-4 py-24 sm:px-6 md:py-32" aria-labelledby="planner-heading">
      <div className="mx-auto max-w-7xl">
        <SectionHeading
          eyebrow="STUDY PLANNER"
          title="From weak topic"
          highlight="to mastery"
          description="One route, re-planned nightly around your exam date, your hours, and what the graph says you actually need."
        />
        <PlannerTimeline />
      </div>
    </section>
  );
}
