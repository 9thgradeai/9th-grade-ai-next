"use client";
import { Calendar, ArrowRight, Check } from "lucide-react";
import type { Server } from "@/lib/types";
import { useDashboardStore } from "@/lib/store-ctx/dashboard";

export default function TodayPlanCard({ tasks, onToggle }: { tasks: Server.StudyTaskDTO[]; onToggle: (id: number) => void | Promise<void> }) {
  const { setActiveTab } = useDashboardStore();
  const completed = tasks.filter((t) => t.completed).length;
  return (
    <div className="command-card p-5 sm:p-6 flex flex-col">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="w-7 h-7 rounded-lg flex items-center justify-center border" style={{ background: "var(--dashboard-surface-muted)", borderColor: "var(--dashboard-border-muted)", color: "var(--dashboard-primary)" }}><Calendar className="w-4 h-4" /></span>
          <p className="command-eyebrow !text-[10px]">Today&apos;s Plan</p>
        </div>
        {tasks.length > 0 && <span className="text-xs font-mono font-bold" style={{ color: "var(--dashboard-text-muted)" }}>{completed}/{tasks.length}</span>}
      </div>

      {tasks.length === 0 ? (
        <div className="mt-6 flex-1 flex flex-col items-center justify-center text-center py-6">
          <p className="text-sm font-medium" style={{ color: "var(--dashboard-text-primary)" }}>No tasks for today</p>
          <p className="text-xs mt-1" style={{ color: "var(--dashboard-text-muted)" }}>Create your study plan to stay on track.</p>
          <button onClick={() => setActiveTab("study-planner")} className="command-primary-btn mt-4">Open Planner <ArrowRight className="w-4 h-4" /></button>
        </div>
      ) : (
        <>
          <div className="mt-4 space-y-2">
            {tasks.slice(0, 5).map((t) => (
              <div key={t.id} className="flex items-center gap-3 rounded-xl border px-3 py-2.5" style={{ background: t.completed ? "var(--dashboard-success-subtle)" : "var(--dashboard-surface-muted)", borderColor: t.completed ? "color-mix(in srgb, var(--dashboard-success) 18%, transparent)" : "var(--dashboard-border-muted)" }}>
                <button onClick={() => void onToggle(t.id)} aria-pressed={t.completed} aria-label={t.completed ? "Mark incomplete" : "Mark complete"} className="w-5 h-5 rounded-md border flex items-center justify-center shrink-0" style={{ background: t.completed ? "var(--dashboard-success)" : "transparent", borderColor: t.completed ? "var(--dashboard-success)" : "var(--dashboard-border-strong)", color: "var(--dashboard-text-inverse)" }}>
                  {t.completed ? <Check className="w-3 h-3" /> : null}
                </button>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-medium truncate" style={{ color: t.completed ? "var(--dashboard-text-muted)" : "var(--dashboard-text-primary)", textDecoration: t.completed ? "line-through" : "none" }}>{t.title}</p>
                  <p className="text-[11px]" style={{ color: "var(--dashboard-text-muted)" }}>{t.subject} · {t.duration}m</p>
                </div>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0" style={{ background: t.priority === "high" ? "var(--dashboard-danger-subtle)" : t.priority === "medium" ? "var(--dashboard-warning-subtle)" : "var(--dashboard-surface)", color: t.priority === "high" ? "var(--dashboard-danger)" : t.priority === "medium" ? "var(--dashboard-warning)" : "var(--dashboard-text-muted)" }}>{t.priority}</span>
              </div>
            ))}
          </div>
          <button onClick={() => setActiveTab("study-planner")} className="mt-4 text-xs font-semibold inline-flex items-center gap-1" style={{ color: "var(--dashboard-primary)" }}>View full planner <ArrowRight className="w-3.5 h-3.5" /></button>
        </>
      )}
    </div>
  );
}
