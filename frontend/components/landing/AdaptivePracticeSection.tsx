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
          eyebrow="PRACTICE LOOP"
          title="A loop that builds"
          highlight="session by session"
          description="Answer questions, see where your accuracy is weak, review with spaced-repetition flashcards, then focus your next session on the topics that need it most."
        />
        <AdaptiveLoop />
      </div>
    </section>
  );
}
