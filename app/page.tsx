import TerminalHeader from "@/components/TerminalHeader";
import TerminalHero from "@/components/TerminalHero";
import TrustStrip from "@/components/TrustStrip";
import FeaturesGrid from "@/components/FeaturesGrid";
import SyllabusExplorer from "@/components/SyllabusExplorer";
import FinalCTA from "@/components/FinalCTA";
import Footer from "@/components/Footer";

export default function Home() {
  return (
    <div className="flex flex-col min-h-screen">
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