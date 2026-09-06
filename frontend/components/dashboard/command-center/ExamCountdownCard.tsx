"use client";

import { Clock, CalendarClock, ShieldAlert, Sparkles } from "lucide-react";
import { useCountdown, formatDate } from "../HomeTabHelpers";
import { useLanguage, t } from "@/lib/lang-ctx";
import type { Server } from "@/lib/types";

export default function ExamCountdownCard({ exam }: { exam: Server.ExamScheduleDTO }) {
  const { lang } = useLanguage();
  const r = useCountdown(exam.date);
  const daysNum = Number(r.d) || 0;

  const sprintPhase =
    daysNum <= 7 ? "Final Sprint Phase" : daysNum <= 30 ? "Focused Revision Window" : "Systematic Syllabus Coverage";

  return (
    <div className="command-card command-card--glow p-5 sm:p-6 overflow-hidden relative">
      <div
        className="absolute inset-0 opacity-[0.05] pointer-events-none"
        style={{ background: "radial-gradient(ellipse 500px 220px at 90% 0%, var(--dashboard-primary) 0%, transparent 70%)" }}
        aria-hidden="true"
      />

      <div className="relative flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <p className="command-eyebrow flex items-center gap-1.5">
              <CalendarClock className="w-3.5 h-3.5" /> Target Exam Countdown
            </p>
            <span
              className="text-[10px] font-extrabold uppercase px-2.5 py-0.5 rounded-full border flex items-center gap-1"
              style={{
                background: daysNum <= 7 ? "var(--dashboard-danger-subtle)" : "var(--dashboard-warning-subtle)",
                color: daysNum <= 7 ? "var(--dashboard-danger)" : "var(--dashboard-warning)",
                borderColor: "color-mix(in srgb, var(--dashboard-warning) 20%, transparent)",
              }}
            >
              <Sparkles className="w-3 h-3" />
              {sprintPhase}
            </span>
          </div>
          <h3 className="font-display font-extrabold text-xl mt-1.5" style={{ color: "var(--dashboard-text-primary)" }}>
            {t(lang, exam.titleBn, exam.titleEn)}
          </h3>
          <p className="text-xs mt-1" style={{ color: "var(--dashboard-text-muted)" }}>
            Official Date: <span className="font-bold font-mono" style={{ color: "var(--dashboard-text-primary)" }}>{formatDate(exam.date)}</span> {exam.note ? `· ${exam.note}` : ""}
          </p>
        </div>

        <span
          className="hidden sm:inline-flex items-center gap-1.5 text-[11px] font-bold px-3 py-1 rounded-full border shadow-sm"
          style={{ background: "var(--dashboard-surface-muted)", color: "var(--dashboard-primary)", borderColor: "var(--dashboard-border-muted)" }}
        >
          <Clock className="w-3.5 h-3.5 animate-pulse text-[var(--dashboard-primary)]" /> Live Digital Clock
        </span>
      </div>

      {/* Futuristic Digital Timer Boxes */}
      <div className="relative mt-5 grid grid-cols-4 gap-2 sm:gap-3">
        {[
          { label: "Days", value: r.d },
          { label: "Hours", value: r.h },
          { label: "Minutes", value: r.m },
          { label: "Seconds", value: r.s },
        ].map((u) => (
          <div
            key={u.label}
            className="rounded-2xl border text-center py-3 sm:py-4 transition-transform hover:-translate-y-0.5"
            style={{ background: "var(--dashboard-surface-muted)", borderColor: "var(--dashboard-border-muted)" }}
          >
            <p className="font-display font-black text-2xl sm:text-3xl tabular-nums tracking-tight" style={{ color: "var(--dashboard-text-primary)" }}>
              {u.value}
            </p>
            <p className="text-[10px] font-extrabold uppercase tracking-widest mt-1" style={{ color: "var(--dashboard-text-muted)" }}>
              {u.label}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
