import SectionHeading from "@/components/ui/SectionHeading";
import SubjectConstellation from "@/components/landing/SubjectConstellation";

export default function SubjectUniverseSection() {
  return (
    <section id="syllabus" className="relative scroll-mt-16 px-4 py-24 sm:px-6 md:py-32" aria-labelledby="subjects-heading">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 48% 40% at 50% 46%, rgba(129,140,248,0.07), transparent 60%)",
        }}
      />
      <div className="relative mx-auto max-w-7xl">
        <SectionHeading
          eyebrow="SUBJECT UNIVERSE"
          title="Nine subjects orbiting"
          highlight="one knowledge core"
          description="Every subject in the preliminary syllabus, wired into the same intelligence system — question coverage and guided study time computed from the live question bank."
        />
        <SubjectConstellation />

        {/* Screen-reader summary of the constellation (desktop visual is decorative) */}
        <p className="sr-only">
          Subjects covered: Bangla, English, Mathematics, Bangladesh Affairs,
          International Affairs, General Science, ICT, Mental Ability, and Current
          Affairs — all connected to a shared performance model.
        </p>
      </div>
    </section>
  );
}
