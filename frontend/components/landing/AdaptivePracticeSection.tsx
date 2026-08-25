import SectionHeading from "@/components/ui/SectionHeading";
import AdaptiveLoop from "@/components/landing/AdaptiveLoop";

export default function AdaptivePracticeSection() {
  return (
    <section id="features" className="relative scroll-mt-16 px-4 py-24 sm:px-6 md:py-32" aria-labelledby="adaptive-heading">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 46% 36% at 50% 55%, rgba(167,139,250,0.07), transparent 62%)",
        }}
      />
      <div className="relative mx-auto max-w-7xl">
        <SectionHeading
          eyebrow="ADAPTIVE ENGINE"
          title="A loop that tightens"
          highlight="with every question"
          description="Performance feeds pattern detection, pattern detection tunes difficulty, difficulty shapes topic selection — and the next question is chosen to move you, not to fill time."
        />
        <AdaptiveLoop />
      </div>
    </section>
  );
}
