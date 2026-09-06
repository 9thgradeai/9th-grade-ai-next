"use client";

import { useState } from "react";
import { Calendar, ArrowRight, Check, Plus, Loader2, Sparkles } from "lucide-react";
import type { Server } from "@/lib/types";
import { useDashboardStore } from "@/lib/store-ctx/dashboard";
import { api } from "@/lib/services/api";

type Props = {
  tasks: Server.StudyTaskDTO[];
  onToggle: (id: number) => void | Promise<void>;
  onTaskAdded?: () => void;
};

export default function TodayPlanCard({ tasks, onToggle, onTaskAdded }: Props) {
  const { setActiveTab } = useDashboardStore();
  const [showAddForm, setShowAddForm] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newSubject, setNewSubject] = useState("বাংলাদেশ বিষয়াবলি");
  const [adding, setAdding] = useState(false);

  const completed = tasks.filter((t) => t.completed).length;
  const progressPct = tasks.length > 0 ? Math.round((completed / tasks.length) * 100) : 0;

  const handleAddTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || adding) return;
    setAdding(true);
    try {
      await api.createStudyTask({
        title: newTitle.trim(),
        subject: newSubject,
        day: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][new Date().getDay()],
        duration: 20,
        priority: "high",
      });
      setNewTitle("");
      setShowAddForm(false);
      if (onTaskAdded) onTaskAdded();
      else window.dispatchEvent(new CustomEvent("ai:refresh-home"));
    } catch {
      /* ignore error fallback */
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className="command-card p-5 sm:p-6 flex flex-col justify-between h-full">
      {/* Header */}
      <div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span
              className="w-7 h-7 rounded-lg flex items-center justify-center border shadow-sm"
              style={{ background: "var(--dashboard-surface-muted)", borderColor: "var(--dashboard-border-muted)", color: "var(--dashboard-primary)" }}
            >
              <Calendar className="w-4 h-4" />
            </span>
            <p className="command-eyebrow !text-[10px]">Today&apos;s Adaptive Plan</p>
          </div>
          <div className="flex items-center gap-2">
            {tasks.length > 0 && (
              <span className="text-xs font-mono font-bold px-2 py-0.5 rounded-full border" style={{ background: "var(--dashboard-surface-muted)", borderColor: "var(--dashboard-border-muted)", color: "var(--dashboard-text-primary)" }}>
                {completed}/{tasks.length} Done ({progressPct}%)
              </span>
            )}
            <button
              onClick={() => setShowAddForm((p) => !p)}
              className="w-7 h-7 rounded-lg border flex items-center justify-center text-[var(--dashboard-primary)] hover:bg-[var(--dashboard-primary-subtle)] transition-colors"
              style={{ borderColor: "var(--dashboard-border-muted)" }}
              title="Add task to today's plan"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Task Progress Bar */}
        {tasks.length > 0 && (
          <div className="mt-3 h-1.5 rounded-full overflow-hidden flex w-full" style={{ background: "var(--dashboard-surface-muted)" }} aria-hidden="true">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${progressPct}%`, background: progressPct === 100 ? "var(--dashboard-success)" : "var(--dashboard-primary)" }}
            />
          </div>
        )}
      </div>

      {/* Quick Add Form */}
      {showAddForm && (
        <form onSubmit={(e) => { void handleAddTask(e); }} className="mt-3 p-3 rounded-xl border space-y-2 animate-in fade-in" style={{ background: "var(--dashboard-surface-muted)", borderColor: "var(--dashboard-primary)" }}>
          <p className="text-xs font-bold" style={{ color: "var(--dashboard-text-primary)" }}>Add Task to Today&apos;s Target</p>
          <input
            type="text"
            placeholder="e.g. Solve 20 BCS History Questions"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            className="w-full px-3 py-1.5 text-xs rounded-lg border focus:outline-none"
            style={{ background: "var(--dashboard-surface)", borderColor: "var(--dashboard-border-muted)", color: "var(--dashboard-text-primary)" }}
            autoFocus
          />
          <div className="flex items-center justify-between gap-2">
            <select
              value={newSubject}
              onChange={(e) => setNewSubject(e.target.value)}
              className="text-xs px-2 py-1 rounded-lg border"
              style={{ background: "var(--dashboard-surface)", borderColor: "var(--dashboard-border-muted)", color: "var(--dashboard-text-primary)" }}
            >
              <option value="বাংলাদেশ বিষয়াবলি">বাংলাদেশ বিষয়াবলি</option>
              <option value="English Language">English Language</option>
              <option value="গাণিতিক যুক্তি">গাণিতিক যুক্তি</option>
              <option value="সাধারণ বিজ্ঞান">সাধারণ বিজ্ঞান</option>
              <option value="বাংলা সাহিত্য">বাংলা সাহিত্য</option>
            </select>
            <div className="flex gap-1">
              <button
                type="button"
                onClick={() => setShowAddForm(false)}
                className="px-2.5 py-1 text-xs font-semibold rounded-lg text-[var(--dashboard-text-muted)]"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={adding || !newTitle.trim()}
                className="command-primary-btn !px-3 !py-1 !text-xs"
              >
                {adding ? <Loader2 className="w-3 h-3 animate-spin" /> : "Save"}
              </button>
            </div>
          </div>
        </form>
      )}

      {/* Task List */}
      {tasks.length === 0 && !showAddForm ? (
        <div className="mt-6 flex-1 flex flex-col items-center justify-center text-center py-6">
          <p className="text-sm font-semibold" style={{ color: "var(--dashboard-text-primary)" }}>No tasks scheduled for today</p>
          <p className="text-xs mt-1" style={{ color: "var(--dashboard-text-muted)" }}>Generate a study schedule or add your custom task.</p>
          <button onClick={() => setActiveTab("study-planner")} className="command-primary-btn mt-4">
            Open AI Planner <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <div className="mt-4 space-y-2 flex-1">
          {tasks.slice(0, 5).map((t) => (
            <div
              key={t.id}
              className="flex items-center gap-3 rounded-xl border px-3 py-2.5 transition-all hover:border-[var(--dashboard-primary)]/40"
              style={{
                background: t.completed ? "var(--dashboard-success-subtle)" : "var(--dashboard-surface-muted)",
                borderColor: t.completed ? "color-mix(in srgb, var(--dashboard-success) 18%, transparent)" : "var(--dashboard-border-muted)",
              }}
            >
              <button
                onClick={() => void onToggle(t.id)}
                aria-pressed={t.completed}
                aria-label={t.completed ? "Mark incomplete" : "Mark complete"}
                className="w-5 h-5 rounded-md border flex items-center justify-center shrink-0 transition-transform active:scale-90"
                style={{
                  background: t.completed ? "var(--dashboard-success)" : "transparent",
                  borderColor: t.completed ? "var(--dashboard-success)" : "var(--dashboard-border-strong)",
                  color: "var(--dashboard-text-inverse)",
                }}
              >
                {t.completed ? <Check className="w-3 h-3 stroke-[3]" /> : null}
              </button>
              <div className="flex-1 min-w-0">
                <p
                  className="text-[13px] font-semibold truncate"
                  style={{
                    color: t.completed ? "var(--dashboard-text-muted)" : "var(--dashboard-text-primary)",
                    textDecoration: t.completed ? "line-through" : "none",
                  }}
                >
                  {t.title}
                </p>
                <p className="text-[11px]" style={{ color: "var(--dashboard-text-muted)" }}>
                  {t.subject} · {t.duration}m
                </p>
              </div>
              <span
                className="text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0"
                style={{
                  background: t.priority === "high" ? "var(--dashboard-danger-subtle)" : t.priority === "medium" ? "var(--dashboard-warning-subtle)" : "var(--dashboard-surface)",
                  color: t.priority === "high" ? "var(--dashboard-danger)" : t.priority === "medium" ? "var(--dashboard-warning)" : "var(--dashboard-text-muted)",
                }}
              >
                {t.priority}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Footer Link */}
      <div className="mt-4 pt-2 border-t flex items-center justify-between" style={{ borderColor: "var(--dashboard-border-muted)" }}>
        <button onClick={() => setActiveTab("study-planner")} className="text-xs font-semibold inline-flex items-center gap-1" style={{ color: "var(--dashboard-primary)" }}>
          Full AI Planner <ArrowRight className="w-3.5 h-3.5" />
        </button>
        <span className="text-[10px] font-mono text-[var(--dashboard-text-muted)]">Adaptive Queue</span>
      </div>
    </div>
  );
}
