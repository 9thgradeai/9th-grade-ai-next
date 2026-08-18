import TerminalHeader from "@/components/TerminalHeader";
import TerminalHero from "@/components/TerminalHero";
import FeaturesGrid from "@/components/FeaturesGrid";
import SyllabusExplorer from "@/components/SyllabusExplorer";
import Footer from "@/components/Footer";

export default function Home() {
  return (
    <div className="flex flex-col min-h-screen bg-zinc-950">
      <TerminalHeader />
      <main className="flex-1 pt-16">
        <TerminalHero />
        <FeaturesGrid />
        <SyllabusExplorer />
      </main>
      <Footer />
    </div>
  );
}