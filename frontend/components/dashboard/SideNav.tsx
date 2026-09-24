"use client";

import { useState } from "react";
import { CaretDoubleLeft, CaretDoubleRight } from "@phosphor-icons/react";
import { TABS, NAV_GROUPS, type TabId } from "@/lib/data";
import { TAB_ICONS } from "@/lib/exam-ui";
import { useAuth } from "@/lib/auth-ctx";
import BrandMark from "@/components/ui/BrandMark";
import LogoutButton from "./LogoutButton";
import ExamSwitcher from "./ExamSwitcher";

// Grouping lives in @/lib/data NAV_GROUPS — do not redeclare here.

const COLLAPSE_KEY = "9th_grade_ai_sidenav_collapsed";

function GroupLabel({ label, collapsed }: { label: string; collapsed: boolean }) {
  if (collapsed) {
    return (
      <div className="flex justify-center px-0 pb-1.5 pt-5" aria-hidden="true">
        <span
          className="h-px w-8"
          style={{ background: "var(--dashboard-border-muted)" }}
        />
      </div>
    );
  }
  return (
    <p className="px-3 pb-1.5 pt-5 text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: "var(--dashboard-text-secondary)", opacity: 0.82 }}>
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
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      return localStorage.getItem(COLLAPSE_KEY) === "1";
    } catch {
      return false;
    }
  });

  const toggle = () => {
    setCollapsed((c) => {
      try {
        localStorage.setItem(COLLAPSE_KEY, c ? "0" : "1");
      } catch {
        // ignore
      }
      return !c;
    });
  };

  return (
    <nav
      className="hidden h-full shrink-0 flex-col border-r transition-[width] duration-200 ease-out lg:flex"
      style={{
        width: collapsed ? 76 : 272,
        background: "var(--dashboard-sidebar-bg)",
        borderColor: "var(--dashboard-sidebar-border)",
        boxShadow: "1px 0 0 var(--dashboard-sidebar-border)",
        zIndex: 30,
      }}
      aria-label="Desktop navigation"
    >
      {/* Brand — clean white with subtle border, premium minimal */}
      <div
        className={`flex items-center border-b ${collapsed ? "justify-center px-2 py-[18px]" : "gap-3.5 px-5 py-[18px]"}`}
        style={{ borderColor: "var(--sidebar-border, var(--dashboard-sidebar-border))", background: "var(--sidebar-bg, var(--dashboard-sidebar-bg))" }}
      >
        <BrandMark className="h-10 w-10 shrink-0 rounded-xl ring-1 ring-black/5" />
        {!collapsed && (
          <div className="min-w-0">
            <p className="font-display text-[15.5px] font-bold leading-none tracking-tight" style={{ color: "var(--dashboard-text-primary)" }}>
              9Th-Grade AI
            </p>
            <p className="mt-1 text-[11px] font-semibold tracking-wide" style={{ color: "var(--dashboard-text-muted)" }}>
              বিসিএস • ব্যাংক • চাকরি
            </p>
          </div>
        )}
      </div>

      {/* Exam context */}
      <div className={collapsed ? "px-2 pt-3" : "px-3 pt-3"}>
        <ExamSwitcher compact={collapsed} />
      </div>

      {/* Grouped navigation */}
      <div className={`min-h-0 flex-1 overflow-y-auto py-3 ${collapsed ? "px-2" : "px-3"}`}>
        {NAV_GROUPS.map((group) => {
          const tabs = group.ids.map((id) => TABS.find((t) => t.id === id)).filter((t): t is (typeof TABS)[number] => Boolean(t));
          if (tabs.length === 0) return null;
          return (
            <div key={group.label} className="mb-1">
              <GroupLabel label={group.label} collapsed={collapsed} />
              <span className="sr-only">{group.labelBn}</span>
              <div className="space-y-0.5">
                {tabs.map((tab) => {
                  const Icon = TAB_ICONS[tab.id];
                  const isActive = activeTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => onChange(tab.id)}
                      aria-current={isActive ? "page" : undefined}
                      title={collapsed ? `${tab.label} · ${tab.bengali}` : undefined}
                      className={
                        collapsed
                          ? "relative mx-auto flex h-11 w-11 items-center justify-center rounded-xl transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--dashboard-focus-ring)]"
                          : isActive
                            ? "relative flex min-h-[44px] w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--dashboard-focus-ring)] bg-[var(--sidebar-bg-active,var(--dashboard-primary-subtle))]"
                            : "relative flex min-h-[44px] w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--dashboard-focus-ring)] hover:translate-x-[1px] hover:bg-[var(--sidebar-bg-active,var(--dashboard-primary-subtle))]/60"
                      }
                      style={
                        isActive
                          ? { color: "var(--sidebar-text-active, var(--dashboard-primary))", border: "1px solid transparent", background: collapsed ? "var(--sidebar-bg-active, var(--dashboard-primary-subtle))" : undefined }
                          : { color: "var(--sidebar-text, var(--dashboard-text-primary))", border: "1px solid transparent" }
                      }
                    >
                      {isActive && !collapsed && (
                        <span
                          className="absolute left-0 top-1/2 h-6 w-[3px] -translate-y-1/2 rounded-r-full"
                          style={{ background: "var(--dashboard-primary)" }}
                          aria-hidden="true"
                        />
                      )}
                      {isActive && collapsed && (
                        <span
                          className="absolute -left-2 top-1/2 h-6 w-[3px] -translate-y-1/2 rounded-r-full"
                          style={{ background: "var(--dashboard-primary)" }}
                          aria-hidden="true"
                        />
                      )}
                      <Icon className="h-[18px] w-[18px] shrink-0" strokeWidth={isActive ? 2.2 : 1.9} style={{ color: isActive ? "var(--sidebar-text-active, var(--dashboard-primary))" : "var(--dashboard-text-secondary)" }} />
                      {!collapsed && (
                        <span className="flex min-w-0 flex-col">
                          <span className="truncate text-[13px] font-semibold leading-none" style={{ color: isActive ? "var(--sidebar-text-active, var(--dashboard-primary))" : "var(--sidebar-text, var(--dashboard-text-primary))" }}>{tab.label}</span>
                          <span className="mt-1 truncate text-[11px] font-medium leading-none" style={{ color: isActive ? "var(--dashboard-primary)" : "var(--dashboard-text-secondary)", opacity: isActive ? 0.82 : 0.88 }}>
                            {tab.bengali}
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
      </div>

      {/* Collapse toggle */}
      <div className={`border-t px-3 py-2 ${collapsed ? "flex justify-center" : ""}`} style={{ borderColor: "var(--dashboard-sidebar-border)" }}>
        <button
          type="button"
          onClick={toggle}
          aria-expanded={!collapsed}
          aria-label={collapsed ? "পার্শ্ব মেনু প্রসারিত করুন" : "পার্শ্ব মেনু সংকুচিত করুন"}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--dashboard-focus-ring)]"
          style={{ borderColor: "var(--dashboard-border-muted)", color: "var(--dashboard-text-secondary)", background: "var(--dashboard-surface-muted)" }}
        >
          {collapsed ? <CaretDoubleRight className="h-4 w-4" /> : <CaretDoubleLeft className="h-4 w-4" />}
        </button>
      </div>

      {/* User + logout separated */}
      <div className="space-y-3 border-t px-3 py-4" style={{ borderColor: "var(--dashboard-sidebar-border)" }}>
        <div className={`flex items-center gap-3 ${collapsed ? "justify-center px-0" : "px-2"}`}>
          <div className="relative shrink-0">
            <div
              className="flex h-9 w-9 items-center justify-center rounded-full border text-sm font-semibold"
              style={{ background: "var(--dashboard-primary-subtle)", color: "var(--dashboard-primary)", borderColor: "var(--dashboard-border-muted)" }}
            >
              {displayInitial}
            </div>
            <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2" style={{ background: "var(--dashboard-success)", borderColor: "var(--dashboard-sidebar-bg)" }} aria-hidden="true" />
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <p className="truncate text-[13px] font-medium" style={{ color: "var(--dashboard-text-primary)" }}>{displayName}</p>
              <p className="truncate text-[11px]" style={{ color: "var(--dashboard-text-muted)" }}>@{user?.handle ?? "student"}</p>
            </div>
          )}
        </div>
        {collapsed ? (
          <div className="border-t pt-2 flex justify-center" style={{ borderColor: "var(--dashboard-border-muted)" }}>
            <LogoutButton aria-label="Log out of your account" />
          </div>
        ) : (
          <div className="border-t pt-2" style={{ borderColor: "var(--dashboard-border-muted)" }}>
            <LogoutButton aria-label="Log out of your account" />
          </div>
        )}
      </div>
    </nav>
  );
}
