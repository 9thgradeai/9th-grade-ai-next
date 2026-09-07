"use client";
import SectionHeading from "@/components/ui/SectionHeading";
import { useT } from "@/lib/i18n";
import SignalFlow from "@/components/landing/SignalFlow";

export default function SignalSection() {
  const t = useT();
  return (
    <section id="signal" className="relative scroll-mt-16 px-4 py-24 sm:px-6 md:py-32" aria-labelledby="signal-heading">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 50% 38% at 22% 40%, rgba(45,212,191,0.07), transparent 60%)",
        }}
      />
      <div className="relative mx-auto max-w-7xl">
        <SectionHeading
          eyebrow={t("landing.signal.eyebrow")}
          title={t("landing.signal.title")}
          highlight={t("landing.signal.highlight")}
          description={t("landing.signal.description")}
        />
        <SignalFlow />
      </div>
    </section>
  );
}
