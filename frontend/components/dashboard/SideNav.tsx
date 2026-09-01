/* src/components/dashboard/SideNav.tsx */
"use client";

import { TABS, type TabId } from "@/lib/data";
import { TAB_ICONS } from "@/lib/exam-ui";
import type { ComponentType } from "react";
import { useAuth } from "@/lib/auth-ctx";
import BrandMark from "@/components/ui/BrandMark";
import LogoutButton from "./LogoutButton";
import { useDashboardTheme } from "@/lib/dashboard-theme-ctx";

type IconProps = { className?: string; strokeWidth?: number };

interface SideNavProps {
  activeTab: TabId;
  onChange: (tab: TabId) => void;
}

export default function SideNav({ activeTab, onChange }: SideNavProps) {
  const { user } = useAuth();
  const { theme } = useDashboardTheme();
  const displayName = user?.name ?? "Guest";
  const displayInitial = user?.name?.charAt(0) ?? "G";

  const bgClass = theme === "dark" ? "bg-dashboard-surface" : "bg-dashboard-background";
  const borderClass = "border-dashboard-border-muted";
  const textActiveClass = theme === "dark" ? "text-dashboard-text-primary" : "text-dashboard-text-primary";
  const textInactiveClass = theme === "dark" ? "text-dashboard-text-secondary" : "text-dashboard-text-secondary";
  const hoverBgClass = theme === "dark" ? "hover:bg-dashboard-surface-muted" : "hover:bg-dashboard-surface";
  const borderColorActive = theme === "dark" ? "border-dashboard-border-strong" : "border-dashboard-border-strong";

  return (
    <nav
      className={`hidden lg:flex flex-col w-64 h-full shrink-0 ${borderClass} z-30`}
      aria-label="Desktop navigation"
    >
      {/* Logo / Brand */}
      <div className="p-6 border-b ${borderClass}">
        <div className="flex items-center gap-2.5">
          <BrandMark className="h-8 w-8 rounded-lg shadow-[0_0_20px_rgba(16,185,129,0.35)]" />
          <div>
            <p className="font-display text-dashboard-text-primary font-semibold tracking-tight leading-tight">9th-grade-ai</p>
            <p className="text-[11px] text-dashboard-text-muted font-mono">বিসিএস • ব্যাংক • চাকরি</p>
          </div>
        </div>
      </div>

      {/* Tab links — scroll internally if the list outgrows the shell */}
      <div className="flex-1 min-h-0 overflow-y-auto py-6 px-3 space-y-1">
        {TABS.map((tab) => {
          const Icon = TAB_ICONS[tab.id];
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => onChange(tab.id)}
              className={`relative w-full flex items-center gap-3 px-3 py-2.5 min-h-[44px] rounded-xl text-left transition-colors ${
                isActive
                  ? "text-dashboard-primary"
                  : textInactiveClass
                }`}
              aria-current={isActive ? "page" : undefined}
            >
              {isActive && (
                <span
                  className="absolute inset-0 rounded-xl ${borderColorActive} bg-gradient-to-r from-emerald-500/15 to-cyan-500/10 border border-emerald-500/25"
                  aria-hidden="true"
                />
              )}
              {isActive && (
                <span
                  className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-6 bg-emerald-400 rounded-r-full shadow-[0_0_12px_rgba(16,185,129,0.9)]"
                  aria-hidden="true"
                />
              )}
              <Icon className="relative z-10 w-5 h-5" strokeWidth={isActive ? 2.2 : 1.8} />
              <div className="relative z-10 flex flex-col">
                <span className="text-sm font-medium">{tab.label}</span>
                <span className="text-[10px] font-mono text-dashboard-text-muted">{tab.bengali}</span>
              </div>
            </button>
          );
        })}
      </div>

      {/* User mini-profile */}
      <div className="p-4 border-t ${borderClass} space-y-2">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-500/25 to-cyan-500/10 border border-emerald-500/30 flex items-center justify-center text-sm font-bold text-emerald-400">
              {displayInitial}
            </div>
            <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-[var(--surface-solid)] shadow-[0_0_8px_rgba(16,185,129,0.9)]" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <p className="text-sm text-dashboard-text-primary font-medium truncate">{displayName}</p>
            <p className="text-[10px] text-dashboard-text-muted font-mono truncate">@{user?.handle ?? "student"}</p>
          </div>
        </div>
        <LogoutButton aria-label="Log out of your account" />
      </div>
    </nav>
  );
}