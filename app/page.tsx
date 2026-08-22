import TerminalHeader from "@/components/TerminalHeader";
import TerminalHero from "@/components/TerminalHero";
import TrustStrip from "@/components/TrustStrip";
import FeaturesGrid from "@/components/FeaturesGrid";
import SyllabusExplorer from "@/components/SyllabusExplorer";
import FinalCTA from "@/components/FinalCTA";
import Footer from "@/components/Footer";

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
    <div className="flex flex-col min-h-screen">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <TerminalHeader />
      <main className="flex-1 pt-16">
        <TerminalHero />
        <TrustStrip />
        <FeaturesGrid />
        <SyllabusExplorer />
        <FinalCTA />
      </main>
      <Footer />
    </div>
  );
}