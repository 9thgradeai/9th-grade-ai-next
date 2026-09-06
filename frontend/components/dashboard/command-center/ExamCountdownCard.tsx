"use client";
import { Clock, CalendarClock } from "lucide-react";
import { useCountdown, formatDate } from "../HomeTabHelpers";
import { useLanguage, t } from "@/lib/lang-ctx";
import type { Server } from "@/lib/types";

export default function ExamCountdownCard({ exam }: { exam: Server.ExamScheduleDTO }) {
  const { lang } = useLanguage();
  const r = useCountdown(exam.date);
  return (
    <div className="command-card p-5 sm:p-6 overflow-hidden relative">
      <div className="absolute inset-0 opacity-[0.04]" style={{ background: "radial-gradient(ellipse 420px 200px at 90% 0%, var(--dashboard-primary) 0%, transparent 60%)" }} aria-hidden="true" />
      <div className="relative flex items-start justify-between gap-4">
        <div>
          <p className="command-eyebrow flex items-center gap-1.5"><CalendarClock className="w-3.5 h-3.5" /> Upcoming Exam</p>
          <h3 className="font-display font-bold text-lg mt-1" style={{ color: "var(--dashboard-text-primary)" }}>{t(lang, exam.titleBn, exam.titleEn)}</h3>
          <p className="text-xs mt-1" style={{ color: "var(--dashboard-text-muted)" }}>{formatDate(exam.date)} {exam.note ? `· ${exam.note}` : ""}</p>
        </div>
        <span className="hidden sm:inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-full border" style={{ background: "var(--dashboard-warning-subtle)", color: "var(--dashboard-warning)", borderColor: "color-mix(in srgb, var(--dashboard-warning) 18%, transparent)" }}><Clock className="w-3 h-3" /> Countdown</span>
      </div>
      <div className="relative mt-5 grid grid-cols-4 gap-2">
        {[{ label: "Days", value: r.d }, { label: "Hours", value: r.h }, { label: "Minutes", value: r.m }, { label: "Seconds", value: r.s }].map((u) => (
          <div key={u.label} className="rounded-2xl border text-center py-3" style={{ background: "var(--dashboard-surface-muted)", borderColor: "var(--dashboard-border-muted)" }}>
            <p className="font-display font-extrabold text-2xl tabular-nums" style={{ color: "var(--dashboard-text-primary)" }}>{u.value}</p>
            <p className="text-[10px] font-bold uppercase tracking-widest mt-1" style={{ color: "var(--dashboard-text-muted)" }}>{u.label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
