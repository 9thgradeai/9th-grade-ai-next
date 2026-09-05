"use client";

import { MODES } from "./modes";
import type { Mode } from "./modes";

type ModeSwitcherProps = {
  mode: Mode;
  onChange: (mode: Mode) => void;
};

export default function ModeSwitcher({ mode, onChange }: ModeSwitcherProps) {
  return (
    <div
      role="group"
      aria-label="Assistant mode"
      className="flex items-center gap-0.5 rounded-lg border border-[var(--dashboard-border-muted)] bg-[var(--dashboard-surface-muted)] p-0.5"
    >
      {MODES.map((m) => {
        const active = m.id === mode;
        return (
          <button
            key={m.id}
            type="button"
            onClick={() => onChange(m.id)}
            aria-pressed={active}
            title={`${m.labelEn} — ${m.descBn}`}
            className={`flex h-8 items-center gap-1.5 rounded-md px-2.5 font-mono text-xs font-semibold transition-colors ${
              active
                ? "bg-[var(--dashboard-primary)] text-[var(--dashboard-text-inverse)]"
                : "text-[var(--dashboard-text-muted)] hover:text-[var(--dashboard-text-primary)]"
            }`}
          >
            <m.icon className="h-3.5 w-3.5" aria-hidden="true" />
            {m.labelBn}
          </button>
        );
      })}
    </div>
  );
}