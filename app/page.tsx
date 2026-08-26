import { prisma } from "~backend/db";
import PublicShell from "@/components/public/PublicShell";
import HeroSection from "@/components/landing/HeroSection";
import TrustStripSection from "@/components/landing/TrustStripSection";
import ProblemSection from "@/components/landing/ProblemSection";
import IntelligenceSection from "@/components/landing/IntelligenceSection";
import SignalSection from "@/components/landing/SignalSection";
import AdaptivePracticeSection from "@/components/landing/AdaptivePracticeSection";
import TutorSection from "@/components/landing/TutorSection";
import ExamEngineSection from "@/components/landing/ExamEngineSection";
import SubjectUniverseSection from "@/components/landing/SubjectUniverseSection";
import AnalyticsSection from "@/components/landing/AnalyticsSection";
import PlannerSection from "@/components/landing/PlannerSection";
import PhilosophySection from "@/components/landing/PhilosophySection";
import FinalCtaSection from "@/components/landing/FinalCtaSection";

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
      <TrustStripSection />
      <ProblemSection />
      <IntelligenceSection />
      <SignalSection />
      <AdaptivePracticeSection />
      <TutorSection />
      <ExamEngineSection />
      <SubjectUniverseSection />
      <AnalyticsSection />
      <PlannerSection />
      <PhilosophySection />
      <FinalCtaSection />
    </PublicShell>
  );
}
