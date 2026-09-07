"use client";
import SectionHeading from "@/components/ui/SectionHeading";
import { useT } from "@/lib/i18n";
import SubjectConstellation from "@/components/landing/SubjectConstellation";

export default function SubjectUniverseSection() {
  const t = useT();
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
          eyebrow={t("landing.subjects.eyebrow")}
          title={t("landing.subjects.title")}
          highlight={t("landing.subjects.highlight")}
          description={t("landing.subjects.description")}
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
