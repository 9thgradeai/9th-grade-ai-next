"use client";

import { useEffect, useRef, useState } from "react";
import { CaretDown, Check, GraduationCap } from "@phosphor-icons/react";
import { api } from "@/lib/services/api";
import { useDashboardStore } from "@/lib/store-ctx/dashboard";
import { useAuth } from "@/lib/auth-ctx";
import { useToastSafe } from "@/lib/toast-ctx";
import type { Server } from "@/lib/types";

type ExamOption = { slug: string | null; nameBn: string; nameEn: string; icon: string };

const FALLBACK_ALL: ExamOption = {
  slug: null,
  nameBn: "সব পরীক্ষা",
  nameEn: "All exams",
  icon: "🎯",
};

function toOptions(categories: Server.ExamCategoryDTO[]): ExamOption[] {
  return categories.map((c) => ({
    slug: c.slug,
    nameBn: c.nameBn,
    nameEn: c.nameEn,
    icon: c.icon || "📘",
  }));
}

interface ExamSwitcherProps {
  /** Rail mode: icon-only button with tooltip. */
  compact?: boolean;
  id?: string;
}

/**
 * Exam-ecosystem switcher (BCS / Bank / NTRCA / …).
 *
 * Client-side preparation context stored in the dashboard store: switching
 * clears cross-tab intents so stale subjects never leak across ecosystems.
 * Options come from the real exam library (`/api/question-bank/exams`); when
 * the backend has no categories yet it degrades to the user's saved target.
 */
export default function ExamSwitcher({ compact = false, id }: ExamSwitcherProps) {
  const { user } = useAuth();
  const examContext = useDashboardStore((s) => s.examContext);
  const setExamContext = useDashboardStore((s) => s.setExamContext);
  const toast = useToastSafe();
  const [options, setOptions] = useState<ExamOption[]>([FALLBACK_ALL]);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .examLibrary()
      .then((cats) => {
        if (cancelled) return;
        const opts = toOptions(cats);
        setOptions(opts.length > 0 ? [{ ...FALLBACK_ALL }, ...opts] : [FALLBACK_ALL]);
      })
      .catch(() => {
        if (cancelled) return;
        // Offline / backend unavailable: offer the user's saved target only.
        const target = user?.examTarget?.trim();
        setOptions(
          target
            ? [{ ...FALLBACK_ALL }, { slug: target, nameBn: target, nameEn: target, icon: "📘" }]
            : [FALLBACK_ALL],
        );
      });
    return () => {
      cancelled = true;
    };
  }, [user?.examTarget]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open ]);

  const current = options.find((o) => o.slug === examContext) ?? FALLBACK_ALL;

  const select = (opt: ExamOption) => {
    setExamContext(opt.slug);
    setOpen(false);
    if (opt.slug) {
      toast.success(`প্রস্তুতি প্রসঙ্গ: ${opt.nameBn}`);
    }
  };

  if (compact) {
    return (
      <div ref={rootRef} className="relative flex justify-center">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-haspopup="listbox"
          aria-label={`পরীক্ষা প্রসঙ্গ: ${current.nameBn}. পরিবর্তন করতে চাপুন`}
          title={current.nameBn}
          className="flex h-11 w-11 items-center justify-center rounded-xl border text-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--dashboard-focus-ring)]"
          style={{
            borderColor: "var(--dashboard-border-muted)",
            background: "var(--dashboard-surface-muted)",
          }}
        >
          <span aria-hidden="true">{current.icon}</span>
        </button>
        {open && (
          <div
            className="absolute left-12 top-0 z-50 w-56 overflow-hidden rounded-xl border shadow-xl"
            style={{
              background: "var(--dashboard-surface-solid)",
              borderColor: "var(--dashboard-border-muted)",
            }}
            role="listbox"
            aria-label="পরীক্ষা নির্বাচন"
          >
            {options.map((opt) => (
              <ExamOptionRow
                key={opt.slug ?? "__all"}
                opt={opt}
                selected={opt.slug === examContext}
                onSelect={() => select(opt)}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div ref={rootRef} className="relative" id={id}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={`পরীক্ষা প্রসঙ্গ: ${current.nameBn}`}
        className="flex w-full items-center gap-2.5 rounded-xl border px-3 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--dashboard-focus-ring)]"
        style={{
          borderColor: "var(--dashboard-border-muted)",
          background: "var(--dashboard-surface-muted)",
        }}
      >
        <span
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border text-base"
          style={{
            background: "var(--dashboard-primary-subtle)",
            borderColor: "var(--dashboard-border-muted)",
          }}
          aria-hidden="true"
        >
          {current.icon || <GraduationCap className="h-4 w-4" />}
        </span>
        <span className="min-w-0 flex-1">
          <span
            className="block text-[10px] font-bold uppercase tracking-[0.12em]"
            style={{ color: "var(--dashboard-text-muted)" }}
          >
            Current preparation
          </span>
          <span
            className="block truncate text-[13px] font-bold"
            style={{ color: "var(--dashboard-text-primary)" }}
          >
            {current.nameBn}
          </span>
        </span>
        <CaretDown
          className="h-4 w-4 shrink-0 transition-transform"
          style={{
            color: "var(--dashboard-text-muted)",
            transform: open ? "rotate(180deg)" : undefined,
          }}
        />
      </button>
      {open && (
        <div
          className="absolute left-0 right-0 top-full z-50 mt-1.5 overflow-hidden rounded-xl border shadow-xl"
          style={{
            background: "var(--dashboard-surface-solid)",
            borderColor: "var(--dashboard-border-muted)",
          }}
          role="listbox"
          aria-label="পরীক্ষা নির্বাচন"
        >
          {options.map((opt) => (
            <ExamOptionRow
              key={opt.slug ?? "__all"}
              opt={opt}
              selected={opt.slug === examContext}
              onSelect={() => select(opt)}
            />
          ))}
          <p
            className="border-t px-3 py-2 text-[11px]"
            style={{
              borderColor: "var(--dashboard-border-muted)",
              color: "var(--dashboard-text-muted)",
            }}
          >
            নতুন পরীক্ষা ইকোসিস্টেম শীঘ্রই আসছে
          </p>
        </div>
      )}
    </div>
  );
}

function ExamOptionRow({
  opt,
  selected,
  onSelect,
}: {
  opt: ExamOption;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      onClick={onSelect}
      className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left transition-colors focus-visible:outline-none"
      style={selected ? { background: "var(--dashboard-primary-subtle)" } : undefined}
      onMouseEnter={(e) => {
        if (!selected) e.currentTarget.style.background = "var(--dashboard-surface-muted)";
      }}
      onMouseLeave={(e) => {
        if (!selected) e.currentTarget.style.background = "";
      }}
    >
      <span className="text-base" aria-hidden="true">
        {opt.icon}
      </span>
      <span className="min-w-0 flex-1">
        <span
          className="block truncate text-[13px] font-semibold"
          style={{ color: selected ? "var(--dashboard-primary)" : "var(--dashboard-text-primary)" }}
        >
          {opt.nameBn}
        </span>
        {opt.nameEn && opt.nameEn !== opt.nameBn && (
          <span
            className="block truncate text-[11px]"
            style={{ color: "var(--dashboard-text-muted)" }}
          >
            {opt.nameEn}
          </span>
        )}
      </span>
      {selected && (
        <Check className="h-4 w-4 shrink-0" style={{ color: "var(--dashboard-primary)" }} />
      )}
    </button>
  );
}
