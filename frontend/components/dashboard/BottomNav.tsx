"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useState, useCallback } from "react";
import type { ComponentType } from "react";
import { TABS, type TabId } from "@/lib/data";
import { TAB_ICONS, type IconProps } from "@/lib/exam-ui";
import { useDialogA11y } from "@/lib/use-dialog-a11y";
import { MoreHorizontal, X } from "lucide-react";
import LogoutButton from "./LogoutButton";

// Primary 5 — Home, Practice, Question Bank, Mistakes, Progress per new IA
const BOTTOM_TABS: { id: TabId; icon: ComponentType<IconProps>; label: string; short: string }[] = [
  { id: "home", icon: TAB_ICONS.home, label: "হোম", short: "হোম" },
  { id: "practice", icon: TAB_ICONS.practice, label: "প্র্যাকটিস", short: "প্র্যাকটিস" },
  { id: "question-bank", icon: TAB_ICONS["question-bank"], label: "প্রশ্নব্যাংক", short: "ব্যাংক" },
  { id: "mistakes", icon: TAB_ICONS.mistakes, label: "ভুল বিশ্লেষণ", short: "ভুল" },
  { id: "progress", icon: TAB_ICONS.progress, label: "প্রোগ্রেস", short: "প্রোগ্রেস" },
];

interface BottomNavProps {
  activeTab: TabId;
  onChange: (tab: TabId) => void;
}

export default function BottomNav({ activeTab, onChange }: BottomNavProps) {
  const [moreOpen, setMoreOpen] = useState(false);
  const closeMore = useCallback(() => setMoreOpen(false), []);
  const sheetRef = useDialogA11y<HTMLDivElement>(moreOpen, closeMore);
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
        className="fixed bottom-0 left-0 right-0 z-40 border-t lg:hidden pb-safe backdrop-blur-md"
        style={{ background: "var(--dashboard-surface)", borderColor: "var(--dashboard-border-muted)" }}
        aria-label="Mobile navigation"
      >
        <div className="flex items-stretch">
          {BOTTOM_TABS.map((tab) => {
            const Icon = tab.icon;
            const active = isActive(tab.id);
            return (
              <button
                key={tab.id}
                onClick={() => selectTab(tab.id)}
                className="relative flex flex-col items-center justify-center gap-1 flex-1 min-h-[64px] py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--dashboard-focus-ring)]"
                aria-label={tab.label}
                aria-current={active ? "page" : undefined}
              >
                {active && (
                  <span className="absolute top-0 w-8 h-0.5 rounded-full" style={{ background: "var(--dashboard-primary)" }} aria-hidden="true" />
                )}
                <Icon className="w-5 h-5" strokeWidth={active ? 2.3 : 1.9} style={{ color: active ? "var(--dashboard-primary)" : "var(--dashboard-text-secondary)" }} />
                <span className="text-[10px] font-semibold leading-none" style={{ color: active ? "var(--dashboard-primary)" : "var(--dashboard-text-secondary)" }}>
                  {tab.short}
                </span>
              </button>
            );
          })}
          <button
            onClick={() => setMoreOpen(true)}
            className="relative flex flex-col items-center justify-center gap-1 flex-1 min-h-[64px] py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--dashboard-focus-ring)]"
            aria-label="More options"
            aria-haspopup="dialog"
            aria-expanded={moreOpen}
            style={{ color: isMoreActive ? "var(--dashboard-primary)" : "var(--dashboard-text-secondary)" }}
          >
            {isMoreActive && <span className="absolute top-0 w-8 h-0.5 rounded-full" style={{ background: "var(--dashboard-primary)" }} aria-hidden="true" />}
            <MoreHorizontal className="w-5 h-5" strokeWidth={isMoreActive ? 2.2 : 1.9} />
            <span className="text-[10px] font-semibold leading-none">আরও</span>
          </button>
        </div>
      </nav>

      <AnimatePresence>
        {moreOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 lg:hidden"
            role="dialog"
            aria-modal="true"
            aria-label="More navigation"
          >
            <div className="absolute inset-0 backdrop-blur-sm" style={{ background: "var(--dashboard-overlay)" }} onClick={closeMore} />
            <motion.div
              ref={sheetRef}
              role="document"
              tabIndex={-1}
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", stiffness: 340, damping: 32 }}
              className="absolute bottom-0 left-0 right-0 rounded-t-[20px] border-t shadow-2xl pb-safe max-h-[72vh] overflow-y-auto"
              style={{ background: "var(--dashboard-surface-solid)", borderColor: "var(--dashboard-border-muted)" }}
            >
              <div className="flex items-center justify-center pt-3 pb-2">
                <span className="w-9 h-1 rounded-full" style={{ background: "var(--dashboard-border-muted)" }} aria-hidden="true" />
              </div>
              <div className="flex items-center justify-between px-5 pb-3">
                <h2 className="text-sm font-semibold" style={{ color: "var(--dashboard-text-primary)" }}>সকল সুবিধা</h2>
                <button onClick={closeMore} className="p-2 rounded-lg" style={{ color: "var(--dashboard-text-muted)" }} aria-label="বন্ধ করুন">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="grid grid-cols-3 gap-2 p-4 pt-0">
                {extraTabs.map((tab) => {
                  const Icon = TAB_ICONS[tab.id];
                  const active = isActive(tab.id);
                  return (
                    <button
                      key={tab.id}
                      onClick={() => selectTab(tab.id)}
                      className="flex flex-col items-center justify-center gap-2 rounded-2xl border p-4 min-h-[88px] transition-colors text-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--dashboard-focus-ring)]"
                      style={
                        active
                          ? { background: "var(--dashboard-primary-subtle)", borderColor: "var(--dashboard-primary)", color: "var(--dashboard-primary)" }
                          : { background: "var(--dashboard-surface-muted)", borderColor: "var(--dashboard-border-muted)", color: "var(--dashboard-text-secondary)" }
                      }
                      aria-current={active ? "page" : undefined}
                    >
                      <Icon className="w-5 h-5" />
                      <span className="text-[11px] font-medium leading-tight">{tab.bengali}</span>
                    </button>
                  );
                })}
              </div>
              <div className="border-t mt-2 pt-3 px-4 pb-4" style={{ borderColor: "var(--dashboard-border-muted)" }}>
                <div onClick={closeMore}>
                  <LogoutButton aria-label="Log out" />
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
