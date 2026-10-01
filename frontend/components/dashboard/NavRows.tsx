"use client";

import { NAV_GROUPS, TABS, type TabId } from "@/lib/data";
import { TAB_ICONS } from "@/lib/exam-ui";

export type NavRowsVariant = "full" | "collapsed" | "drawer";

interface NavRowsProps {
  activeTab: TabId;
  onChange: (tab: TabId) => void;
  variant?: NavRowsVariant;
}

/**
 * Phase 2 shared navigation rows — single source for SideNav (desktop),
 * collapsed rail, and the mobile drawer. Single-line rows: Bengali primary
 * + English secondary trailing (halves row height vs stacked dual-line).
 * 48px minimum touch target; active = filled primary-soft + 3px rail.
 */
export default function NavRows({ activeTab, onChange, variant = "full" }: NavRowsProps) {
  const collapsed = variant === "collapsed";

  return (
    <>
      {NAV_GROUPS.map((group) => {
        const tabs = group.ids
          .map((id) => TABS.find((t) => t.id === id))
          .filter((t): t is (typeof TABS)[number] => Boolean(t));
        if (tabs.length === 0) return null;
        return (
          <div key={group.label} className="mb-1">
            {collapsed ? (
              <div className="flex justify-center px-0 pb-1.5 pt-5" aria-hidden="true">
                <span className="h-px w-8" style={{ background: "var(--dashboard-border-muted)" }} />
              </div>
            ) : (
              <>
                <p
                  className="px-3 pb-1.5 pt-5 text-[10px] font-bold uppercase tracking-[0.18em]"
                  style={{ color: "var(--dashboard-text-secondary)", opacity: 0.82 }}
                >
                  {group.label}
                </p>
                <span className="sr-only">{group.labelBn}</span>
              </>
            )}
            <div className="space-y-0.5">
              {tabs.map((tab) => {
                const Icon = TAB_ICONS[tab.id];
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => onChange(tab.id)}
                    aria-current={isActive ? "page" : undefined}
                    aria-label={`${tab.label} — ${tab.bengali}`}
                    title={collapsed ? `${tab.label} · ${tab.bengali}` : undefined}
                    className={
                      collapsed
                        ? "relative mx-auto flex h-12 w-12 items-center justify-center rounded-2xl transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--dashboard-focus-ring)]"
                        : "relative flex min-h-[48px] w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--dashboard-focus-ring)]"
                    }
                    style={
                      isActive
                        ? {
                            color: "var(--sidebar-text-active, var(--dashboard-primary))",
                            background: "var(--sidebar-bg-active, var(--dashboard-primary-subtle))",
                            border: "1px solid transparent",
                          }
                        : {
                            color: "var(--sidebar-text, var(--dashboard-text-primary))",
                            border: "1px solid transparent",
                          }
                    }
                  >
                    {isActive && (
                      <span
                        className={
                          collapsed
                            ? "absolute -left-2 top-1/2 h-6 w-[3px] -translate-y-1/2 rounded-r-full"
                            : "absolute left-0 top-1/2 h-6 w-[3px] -translate-y-1/2 rounded-r-full"
                        }
                        style={{ background: "var(--dashboard-primary)" }}
                        aria-hidden="true"
                      />
                    )}
                    <Icon
                      className="h-[20px] w-[20px] shrink-0"
                      strokeWidth={isActive ? 2.2 : 1.9}
                      style={{
                        color: isActive
                          ? "var(--sidebar-text-active, var(--dashboard-primary))"
                          : "var(--dashboard-text-secondary)",
                      }}
                    />
                    {!collapsed && (
                      <span className="flex min-w-0 flex-1 items-baseline justify-between gap-2">
                        <span
                          className="truncate text-[14px] font-semibold leading-none"
                          style={{
                            color: isActive
                              ? "var(--sidebar-text-active, var(--dashboard-primary))"
                              : "var(--sidebar-text, var(--dashboard-text-primary))",
                          }}
                        >
                          {tab.bengali}
                        </span>
                        <span
                          className="shrink-0 truncate text-[11px] font-medium uppercase leading-none tracking-wide"
                          style={{
                            color: isActive ? "var(--dashboard-primary)" : "var(--dashboard-text-secondary)",
                            opacity: isActive ? 0.9 : 0.75,
                          }}
                        >
                          {tab.label}
                        </span>
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </>
  );
}
