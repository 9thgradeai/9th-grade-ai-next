"use client";

import { TABS, type TabId } from "@/lib/data";
import { TAB_ICONS } from "@/lib/exam-ui";
import { useAuth } from "@/lib/auth-ctx";
import BrandMark from "@/components/ui/BrandMark";
import LogoutButton from "./LogoutButton";

const NAV_GROUPS: { label: string; labelBn: string; ids: TabId[] }[] = [
  { label: "Primary", labelBn: "প্রধান", ids: ["home", "study-planner", "practice", "ai-mock-test"] },
  { label: "Study", labelBn: "পড়াশোনা", ids: ["question-bank", "flashcards", "ai-solver", "ai-evaluate", "ai-voice"] },
  { label: "Review & Insights", labelBn: "পর্যালোচনা", ids: ["progress", "mistakes", "wrong-answers"] },
  { label: "Career", labelBn: "ক্যারিয়ার", ids: ["ai-advisor"] },
  { label: "Account", labelBn: "অ্যাকাউন্ট", ids: ["ai-model", "settings"] },
];

function GroupLabel({ label }: { label: string }) {
  return (
    <p className="px-3 pt-5 pb-1.5 text-[10px] font-bold tracking-[0.14em] uppercase" style={{ color: "var(--dashboard-text-secondary)", opacity: 0.82 }}>
      {label}
    </p>
  );
}

interface SideNavProps {
  activeTab: TabId;
  onChange: (tab: TabId) => void;
}

export default function SideNav({ activeTab, onChange }: SideNavProps) {
  const { user } = useAuth();
  const displayName = user?.name ?? "Guest";
  const displayInitial = user?.name?.charAt(0) ?? "G";

  return (
    <nav
      className="hidden lg:flex flex-col w-[272px] h-full shrink-0 border-r z-30 shadow-[1px_0_0_var(--dashboard-sidebar-border)]"
      style={{ background: "var(--dashboard-sidebar-bg)", borderColor: "var(--dashboard-sidebar-border)" }}
      aria-label="Desktop navigation"
    >
      {/* Brand — premium tile + soft border, works on white & dark */}
      <div className="px-5 py-[18px] border-b flex items-center gap-3.5" style={{ borderColor: "var(--dashboard-sidebar-border)", background: "linear-gradient(180deg, var(--dashboard-sidebar-bg) 0%, color-mix(in srgb, var(--dashboard-sidebar-bg) 92%, var(--dashboard-primary) 8%) 100%)" }}>
        <BrandMark className="h-10 w-10 rounded-xl shadow-[0_2px_10px_rgba(79,70,229,0.28),0_1px_2px_rgba(15,23,42,0.08)] ring-1 ring-black/5" />
        <div className="min-w-0">
          <p className="font-display font-bold tracking-tight leading-none text-[15.5px]" style={{ color: "var(--dashboard-text-primary)" }}>
            9th-grade-ai
          </p>
          <p className="text-[11px] font-semibold tracking-wide mt-1" style={{ color: "var(--dashboard-text-muted)" }}>
            বিসিএস • ব্যাংক • চাকরি
          </p>
        </div>
      </div>

      {/* Grouped navigation */}
      <div className="flex-1 min-h-0 overflow-y-auto px-3 py-3">
        {NAV_GROUPS.map((group) => {
          const tabs = group.ids.map((id) => TABS.find((t) => t.id === id)!).filter(Boolean);
          if (tabs.length === 0) return null;
          return (
            <div key={group.label} className="mb-1">
              <GroupLabel label={group.label} />
              <div className="space-y-0.5">
                {tabs.map((tab) => {
                  const Icon = TAB_ICONS[tab.id];
                  const isActive = activeTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => onChange(tab.id)}
                      aria-current={isActive ? "page" : undefined}
                      className="relative w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--dashboard-focus-ring)] hover:translate-x-[1px]"
                      style={
                        isActive
                          ? { background: "var(--dashboard-primary-subtle)", color: "var(--dashboard-primary)", border: "1px solid color-mix(in srgb, var(--dashboard-primary) 16%, transparent)", boxShadow: "0 1px 2px rgb(23 32 51 / 0.04)" }
                          : { color: "var(--dashboard-text-primary)", background: "transparent", border: "1px solid transparent" }
                      }
                    >
                      {isActive && (
                        <span
                          className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-6 rounded-r-full"
                          style={{ background: "var(--dashboard-primary)" }}
                          aria-hidden="true"
                        />
                      )}
                      <Icon className="w-[18px] h-[18px] shrink-0" strokeWidth={isActive ? 2.2 : 1.9} style={{ color: isActive ? "var(--dashboard-primary)" : "var(--dashboard-text-secondary)" }} />
                      <span className="flex flex-col min-w-0">
                        <span className="text-[13px] font-semibold leading-none truncate" style={{ color: isActive ? "var(--dashboard-primary)" : "var(--dashboard-text-primary)" }}>{tab.label}</span>
                        <span className="text-[11px] leading-none mt-1 truncate font-medium" style={{ color: isActive ? "var(--dashboard-primary)" : "var(--dashboard-text-secondary)", opacity: isActive ? 0.82 : 0.88 }}>
                          {tab.bengali}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* User + logout separated */}
      <div className="border-t px-3 py-4 space-y-3" style={{ borderColor: "var(--dashboard-sidebar-border)" }}>
        <div className="flex items-center gap-3 px-2">
          <div className="relative shrink-0">
            <div
              className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold border"
              style={{ background: "var(--dashboard-primary-subtle)", color: "var(--dashboard-primary)", borderColor: "var(--dashboard-border-muted)" }}
            >
              {displayInitial}
            </div>
            <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 bg-emerald-500" style={{ borderColor: "var(--dashboard-sidebar-bg)" }} aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <p className="text-[13px] font-medium truncate" style={{ color: "var(--dashboard-text-primary)" }}>{displayName}</p>
            <p className="text-[11px] truncate" style={{ color: "var(--dashboard-text-muted)" }}>@{user?.handle ?? "student"}</p>
          </div>
        </div>
        <div className="pt-2 border-t" style={{ borderColor: "var(--dashboard-border-muted)" }}>
          <LogoutButton aria-label="Log out of your account" />
        </div>
      </div>
    </nav>
  );
}
