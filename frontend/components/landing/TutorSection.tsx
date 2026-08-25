import SectionHeading from "@/components/ui/SectionHeading";
import Reveal from "@/components/ui/Reveal";
import TutorTimeline from "@/components/landing/TutorTimeline";

export default function TutorSection() {
  return (
    <section id="tutor" className="relative scroll-mt-16 px-4 py-24 sm:px-6 md:py-32" aria-labelledby="tutor-heading">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 44% 34% at 80% 30%, rgba(34,211,238,0.06), transparent 60%)",
        }}
      />
      <div className="relative mx-auto max-w-7xl">
        <SectionHeading
          eyebrow="REASONING INTERFACE"
          title="Watch understanding"
          highlight="come together"
          description="The bilingual AI tutor doesn't dump answers — it walks the path from question to concepts to explanation to lasting understanding."
        />
        <Reveal>
          <TutorTimeline />
        </Reveal>
        <Reveal delay={0.1}>
          <p className="mt-12 text-center font-mono text-xs uppercase tracking-[0.16em] text-zinc-600">
            Conceptual visualization — question → concepts → explanation → understanding
          </p>
        </Reveal>
      </div>
    </section>
  );
}
