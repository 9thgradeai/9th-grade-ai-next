import PublicShell from "@/components/public/PublicShell";
import TerminalHero from "@/components/TerminalHero";
import TrustStrip from "@/components/TrustStrip";
import FeaturesGrid from "@/components/FeaturesGrid";
import SyllabusExplorer from "@/components/SyllabusExplorer";
import FinalCTA from "@/components/FinalCTA";

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: "9Th-Grade AI",
  applicationCategory: "EducationalApplication",
  operatingSystem: "Web",
  description:
    "Free AI-powered exam preparation for Bangladeshi government job aspirants — BCS, Bank, and Teacher recruitment. Adaptive mock tests, spaced-repetition flashcards, study planner, and a bilingual AI tutor.",
  url: process.env.NEXT_PUBLIC_SITE_URL ?? "https://9thgrade.ai",
  offers: { "@type": "Offer", price: "0", priceCurrency: "BDT" },
};

export default function Home() {
  return (
    <PublicShell>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <TerminalHero />
      <TrustStrip />
      <FeaturesGrid />
      <SyllabusExplorer />
      <FinalCTA />
    </PublicShell>
  );
}
