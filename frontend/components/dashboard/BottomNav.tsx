"use client";

import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { useState, useCallback } from "react";
import type { ComponentType } from "react";
import { TABS, BOTTOM_TAB_IDS, type TabId } from "@/lib/data";
import { TAB_ICONS, type IconProps } from "@/lib/exam-ui";
import { useDialogA11y } from "@/lib/use-dialog-a11y";
import { useScrollLock } from "@/lib/use-scroll-lock";
import { useLanguage, t } from "@/lib/lang-ctx";
import { DotsThreeVertical, X } from "@phosphor-icons/react";
import LogoutButton from "./LogoutButton";

// Primary tabs come from @/lib/data BOTTOM_TAB_IDS — do not hardcode a separate list.
const SHORT_EN: Partial<Record<TabId, string>> = {
  home: "Home",
  practice: "Practice",
  "question-bank": "Bank",
  mistakes: "Mistakes",
  progress: "Progress",
  "ai-solver": "Solver",
  "ai-mock": "AI Mock",
  advisor: "Advisor",
  evaluator: "Eval",
  "voice-interview": "Voice",
  "student-model": "Model",
  usage: "Usage",
};

const BOTTOM_TABS: { id: TabId; icon: ComponentType<IconProps>; label: string; labelEn: string; short: string; shortEn: string }[] = BOTTOM_TAB_IDS.map((id) => {
  const meta = TABS.find((t) => t.id === id) ?? TABS[0];
  return {
    id,
    icon: TAB_ICONS[id],
    label: meta.bengali,
    labelEn: meta.label,
    short: meta.bengali === "প্রশ্নব্যাংক" ? "ব্যাংক" : meta.bengali === "ভুল বিশ্লেষণ" ? "ভুল" : meta.bengali,
    shortEn: SHORT_EN[id] ?? meta.label,
  };
});

interface BottomNavProps {
  activeTab: TabId;
  onChange: (tab: TabId) => void;
}

export default function BottomNav({ activeTab, onChange }: BottomNavProps) {
  const { lang } = useLanguage();
  const shouldReduceMotion = useReducedMotion();
  const [moreOpen, setMoreOpen] = useState(false);
  const closeMore = useCallback(() => setMoreOpen(false), []);
  const sheetRef = useDialogA11y<HTMLDivElement>(moreOpen, closeMore);
  useScrollLock(moreOpen);
  const isActive = (id: TabId) => activeTab === id;
  const extraTabs = TABS.filter((t) => !BOTTOM_TABS.find((bt) => bt.id === t.id));

  const selectTab = (id: TabId) => {
    onChange(id);
    setMoreOpen(false);
  };

  const isMoreActive = extraTabs.some((t) => t.id === activeTab);

  return (
    <>
      <nav
        className="fixed bottom-0 left-0 right-0 z-[var(--z-sticky)] border-t lg:hidden pb-safe backdrop-blur-md min-h-[var(--bottom-nav-h)]"
        style={{ background: "var(--dashboard-surface)", borderColor: "var(--dashboard-border-muted)" }}
        aria-label="Mobile navigation"
      >
        <div className="flex items-stretch gap-1 px-2 py-1.5">
          {BOTTOM_TABS.map((tab) => {
            const Icon = tab.icon;
            const active = isActive(tab.id);
            return (
              <button
                key={tab.id}
                onClick={() => selectTab(tab.id)}
                className="relative flex flex-col items-center justify-center gap-1 flex-1 min-h-[56px] rounded-2xl py-2 transition-colors opacity-[0.7] hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--dashboard-focus-ring)]"
                style={
                  active
                    ? { background: "var(--dashboard-primary-subtle)", color: "var(--dashboard-primary)" }
                    : { background: "transparent", color: "var(--dashboard-text-secondary)" }
                }
                aria-label={t(lang, tab.label, tab.labelEn)}
                aria-current={active ? "page" : undefined}
              >
                <Icon className="h-[22px] w-[22px]" strokeWidth={active ? 2.3 : 1.9} />
                <span className="text-[10px] font-bold leading-none">
                  {t(lang, tab.short, tab.shortEn)}
                </span>
              </button>
            );
          })}
          <button
            onClick={() => setMoreOpen(true)}
            className="relative flex flex-col items-center justify-center gap-1 flex-1 min-h-[56px] rounded-2xl py-2 transition-colors opacity-[0.7] hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--dashboard-focus-ring)]"
            aria-label={t(lang, "আরও বিকল্প", "More options")}
            aria-haspopup="dialog"
            aria-expanded={moreOpen}
            style={
              isMoreActive
                ? { background: "var(--dashboard-primary-subtle)", color: "var(--dashboard-primary)" }
                : { background: "transparent", color: "var(--dashboard-text-secondary)" }
            }
          >
            <DotsThreeVertical className="h-[22px] w-[22px]" strokeWidth={isMoreActive ? 2.2 : 1.9} />
            <span className="text-[10px] font-bold leading-none">{t(lang, "আরও", "More")}</span>
          </button>
        </div>
      </nav>

      <AnimatePresence>
        {moreOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={shouldReduceMotion ? { duration: 0 } : undefined}
            className="fixed inset-0 z-[var(--z-modal)] lg:hidden"
            role="dialog"
            aria-modal="true"
            aria-label={t(lang, "আরও নেভিগেশন", "More navigation")}
          >
            <div className="absolute inset-0 backdrop-blur-sm" style={{ background: "var(--dashboard-overlay)" }} onClick={closeMore} />
            <motion.div
              ref={sheetRef}
              tabIndex={-1}
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={shouldReduceMotion ? { duration: 0 } : { type: "spring", stiffness: 340, damping: 32 }}
              className="absolute bottom-0 left-0 right-0 rounded-t-[20px] border-t shadow-2xl pb-safe max-h-[72vh] overflow-y-auto overscroll-contain"
              style={{ background: "var(--dashboard-surface-solid)", borderColor: "var(--dashboard-border-muted)" }}
            >
              <div className="flex items-center justify-center pt-3 pb-2">
                <span className="w-9 h-1 rounded-full" style={{ background: "var(--dashboard-border-muted)" }} aria-hidden="true" />
              </div>
              <div className="flex items-center justify-between px-5 pb-3">
                <h2 className="text-sm font-semibold" style={{ color: "var(--dashboard-text-primary)" }}>{t(lang, "সকল সুবিধা", "All features")}</h2>
                <button onClick={closeMore} className="p-2 rounded-lg" style={{ color: "var(--dashboard-text-muted)" }} aria-label={t(lang, "বন্ধ করুন", "Close")}>
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="grid grid-cols-1 gap-2 p-4 pt-0 sm:grid-cols-2 sm:gap-2.5">
                {extraTabs.map((tab) => {
                  const Icon = TAB_ICONS[tab.id];
                  const active = isActive(tab.id);
                  return (
                    <button
                      key={tab.id}
                      onClick={() => selectTab(tab.id)}
                      className="flex min-h-[56px] items-center gap-3 rounded-2xl border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--dashboard-focus-ring)]"
                      style={
                        active
                          ? { background: "var(--dashboard-primary-subtle)", borderColor: "var(--dashboard-primary)", color: "var(--dashboard-primary)" }
                          : { background: "var(--dashboard-surface-muted)", borderColor: "var(--dashboard-border-muted)", color: "var(--dashboard-text-primary)" }
                      }
                      aria-current={active ? "page" : undefined}
                      aria-label={`${tab.label} — ${tab.bengali}`}
                    >
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border" style={{ background: active ? "var(--dashboard-primary-subtle)" : "var(--dashboard-surface)", borderColor: "var(--dashboard-border-muted)" }}>
                        <Icon className="h-5 w-5" />
                      </span>
                      <span className="flex min-w-0 flex-1 items-baseline justify-between gap-2">
                        <span className="truncate text-[14px] font-semibold leading-none">{tab.bengali}</span>
                        <span className="shrink-0 truncate text-[11px] font-medium uppercase leading-none tracking-wide" style={{ color: "var(--dashboard-text-muted)" }}>{tab.label}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
              <div className="border-t mt-2 pt-3 px-4 pb-4" style={{ borderColor: "var(--dashboard-border-muted)" }}>
                {/* No auto-close wrapper: the sheet stays open if logout fails
                    so the user can retry; a successful logout navigates away. */}
                <LogoutButton aria-label="Log out" />
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}