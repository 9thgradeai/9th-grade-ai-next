import { prisma } from "~backend/db";
import PublicShell from "@/components/public/PublicShell";
import HeroSection from "@/components/landing/HeroSection";
import LazySection from "@/components/landing/LazySection";

export const revalidate = 3600;

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: "9Th-Grade AI",
  applicationCategory: "EducationalApplication",
  operatingSystem: "Web",
  description:
    "Free AI-powered exam preparation for Bangladeshi government job aspirants — BCS, Bank, and Teacher recruitment. Full-length mock tests, spaced-repetition flashcards, study planner, and a bilingual AI tutor.",
  url: process.env.NEXT_PUBLIC_SITE_URL ?? "https://9thgrade.ai",
  offers: { "@type": "Offer", price: "0", priceCurrency: "BDT" },
};

export default async function Home() {
  // Degrade gracefully when the DB is unreachable (offline dev, cold Neon
  // branch): the landing page must never hard-crash on a single count query.
  let subjectCount = 0;
  try {
    subjectCount = await prisma.subject.count();
  } catch (error) {
    console.error("[home] subject.count failed, rendering with fallback 0:", error);
  }
  return (
    <PublicShell>
      <script
        id="jsonld-home"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <HeroSection subjectCount={subjectCount} />
      <LazySection name="TrustStripSection" />
      <LazySection name="ProblemSection" />
      <LazySection name="IntelligenceSection" />
      <LazySection name="SignalSection" />
      <LazySection name="AdaptivePracticeSection" />
      <LazySection name="TutorSection" />
      <LazySection name="ExamEngineSection" />
      <LazySection name="SubjectUniverseSection" />
      <LazySection name="AnalyticsSection" />
      <LazySection name="PlannerSection" />
      <LazySection name="PhilosophySection" />
      <LazySection name="FinalCtaSection" />
    </PublicShell>
  );
}
