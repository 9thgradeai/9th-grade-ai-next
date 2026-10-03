"use client";

import { Question } from "@phosphor-icons/react";
import { useEcosystem } from "@/lib/ecosystem-ctx";
import { useLanguage, t as pickLang } from "@/lib/lang-ctx";
import NotificationCenter from "@/components/dashboard/NotificationCenter";
import { ThemeToggle } from "@/lib/dashboard-theme-ctx";
import LanguageToggle from "@/components/ui/LanguageToggle";

/** BCS / Bangladesh Bank quick switch. Lives in the dashboard
 *  header on ≥sm and in the mobile nav drawer below that — never
 *  both, so the header row cannot overflow phone widths. */
export function GlobalEcosystemToggle() {
  const { ecosystem, setEcosystem } = useEcosystem();
  const { lang } = useLanguage();
  return (
    <div
      className="flex items-center gap-1 bg-[var(--dashboard-surface-muted)] border border-[var(--dashboard-border-muted)] rounded-xl p-1 shrink-0"
      role="group"
      aria-label={pickLang(lang, "পরীক্ষা ইকোসিস্টেম", "Exam ecosystem")}
    >
      {(["BCS", "BANGLADESH_BANK"] as const).map((code) => (
        <button
          key={code}
          onClick={() => setEcosystem(code)}
          aria-pressed={ecosystem === code}
          aria-label={code === "BCS" ? "BCS" : pickLang(lang, "বাংলাদেশ ব্যাংক", "Bangladesh Bank")}
          className={`min-h-[40px] min-w-[52px] px-3 py-1 text-xs font-bold rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--dashboard-focus-ring)] ${ecosystem === code ? "bg-[var(--dashboard-primary)] text-white shadow-sm" : "text-[var(--dashboard-text-secondary)] hover:text-[var(--dashboard-text-primary)]"}`}
        >
          {code === "BCS" ? "BCS" : pickLang(lang, "ব্যাংক", "Bank")}
        </button>
      ))}
    </div>
  );
}

interface HeaderActionsProps {
  onOpenShortcuts: () => void;
}

/** Right-side action cluster of the dashboard top header. The
 *  ecosystem toggle (~116px) drops below `sm` — on 320–375px
 *  phones the row only has room for hamburger, logo, search,
 *  notifications, theme and language; without this the language
 *  button was pushed off the right edge. */
export default function HeaderActions({ onOpenShortcuts }: HeaderActionsProps) {
  const { lang } = useLanguage();
  return (
    <div className="ml-auto flex items-center gap-1.5 min-w-0 shrink-0">
      <span className="hidden sm:inline-flex shrink-0">
        <GlobalEcosystemToggle />
      </span>
      <button
        type="button"
        onClick={onOpenShortcuts}
        aria-label={pickLang(lang, "কীবোর্ড শর্টকাট", "Keyboard shortcuts")}
        className="hidden md:inline-flex items-center justify-center w-10 h-10 rounded-xl border"
        style={{ borderColor: "var(--dashboard-border-muted)", color: "var(--dashboard-text-muted)", background: "var(--dashboard-surface-muted)" }}
      >
        <Question className="w-4 h-4" />
      </button>
      <NotificationCenter />
      <ThemeToggle />
      <LanguageToggle />
    </div>
  );
}
