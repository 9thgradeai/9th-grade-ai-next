import TerminalHeader from "@/components/TerminalHeader";
import Footer from "@/components/Footer";

export default function PublicShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col min-h-screen">
      <TerminalHeader />
      <main className="flex-1 pt-16">{children}</main>
      <Footer />
    </div>
  );
}