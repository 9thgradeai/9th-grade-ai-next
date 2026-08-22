import TerminalHeader from "@/components/TerminalHeader";
import Footer from "@/components/Footer";

export default function PublicShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col min-h-screen">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[70] focus:rounded-full focus:bg-emerald-500 focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-zinc-950"
      >
        Skip to content
      </a>
      <TerminalHeader />
      <main id="main-content" className="flex-1 pt-16">
        {children}
      </main>
      <Footer />
    </div>
  );
}
