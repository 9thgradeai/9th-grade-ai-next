import { prisma } from "~backend/db";
import PublicShell from "@/components/public/PublicShell";
import HeroSection from "@/components/landing/HeroSection";
import LazySection from "@/components/landing/LazySection";

export const dynamic = "force-dynamic";

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
  const subjectCount = await prisma.subject.count();
  return (
    <PublicShell>
      <script
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
