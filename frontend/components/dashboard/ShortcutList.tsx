"use client";

import { useLanguage, t } from "@/lib/lang-ctx";

/**
 * Phase 5 unified shortcut map — the ONLY global keys in the dashboard.
 * Single-letter hijacks (P/M/W/A/F/Q/L/R/K) were removed: HomeTab and
 * QuickActions both bound them, so one press fired two handlers, stole
 * keystrokes from search inputs, and was undiscoverable. Rendered by both
 * the layout ShortcutsSheet and the HomeTab cheat-sheet portal.
 */
export default function ShortcutList() {
  const { lang } = useLanguage();
  const rows: [string, string][] = [
    ["⌘K", t(lang, "কমান্ড প্যালেট", "Command palette")],
    ["1 – 0", t(lang, "প্রথম ১০ ট্যাবে যান", "Jump to first 10 tabs")],
    ["?", t(lang, "এই তালিকা", "This list")],
    ["Esc", t(lang, "বন্ধ করুন", "Close dialogs")],
  ];
  return (
    <ul className="space-y-1.5 text-xs" style={{ color: "var(--dashboard-text-secondary)" }}>
      {rows.map(([key, label]) => (
        <li key={key} className="flex items-center justify-between gap-3">
          <span>{label}</span>
          <kbd
            className="rounded-md border px-2 py-0.5 font-mono font-bold"
            style={{
              borderColor: "var(--dashboard-border-muted)",
              background: "var(--dashboard-surface-muted)",
              color: "var(--dashboard-text-primary)",
            }}
          >
            {key}
          </kbd>
        </li>
      ))}
    </ul>
  );
}
