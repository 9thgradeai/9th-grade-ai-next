"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Check, Clock, Target, Calendar, CaretRight, Lightbulb, Trophy, ArrowCounterClockwise } from "@phosphor-icons/react";
import AiLogo from "@/components/ui/AiLogo";
import EmptyState from "./command-center/EmptyState";
import { api } from "@/lib/services/api";
import { useToastSafe } from "@/lib/toast-ctx";
import { useDashboardStore } from "@/lib/store-ctx/dashboard";

type TaskDTO = {
  id: number;
  day: string;
  date: string;
  title: string;
  subject: string;
  duration: number;
  priority: "high" | "medium" | "low";
  description: string;
  completed: boolean;
};

// Server is the single source of truth — no static mock paint. `tasks`
// starts null (loading), then holds the real plan (possibly empty) or an
// error. Fake ids are never sent to the API.
export default function StudyPlannerTab() {
  const router = useRouter();
  const toast = useToastSafe();
  const { setPracticeIntent } = useDashboardStore();
  const [selectedDay, setSelectedDay] = useState(0);
  const [tasks, setTasks] = useState<TaskDTO[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<number | null>(null);

  // Load the study plan from the database.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const list = await api.studyPlan();
        if (!cancelled) setTasks(list);
      } catch {
        if (!cancelled) {
          setTasks([]);
          setLoadError("স্টাডি প্ল্যান লোড করা যায়নি। আবার চেষ্টা করুন।");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const retry = () => {
    setLoading(true);
    setLoadError(null);
    void (async () => {
      try {
        setTasks(await api.studyPlan());
      } catch {
        setTasks([]);
        setLoadError("স্টাডি প্ল্যান লোড করা যায়নি। আবার চেষ্টা করুন।");
      } finally {
        setLoading(false);
      }
    })();
  };

  const list = tasks ?? [];
  const days = useMemo(() => Array.from(new Set(list.map((t) => t.day))), [list]);
  const selectedDayName = days[Math.min(selectedDay, Math.max(days.length - 1, 0))] ?? days[0];
  const dayPlan = {
    day: selectedDayName ?? "",
    tasks: list.filter((t) => t.day === selectedDayName),
  };

  // Optimistic toggle with rollback: revert + toast when the server rejects.
  const toggleTask = async (taskId: number) => {
    const prev = tasks ?? [];
    const target = prev.find((t) => t.id === taskId);
    if (!target) return;
    const next = !target.completed;
    setTogglingId(taskId);
    setTasks(prev.map((t) => (t.id === taskId ? { ...t, completed: next } : t)));
    try {
      await api.toggleStudyTask(taskId);
    } catch {
      setTasks(prev);
      toast.error("কাজ আপডেট করা যায়নি — আবার চেষ্টা করুন");
    } finally {
      setTogglingId(null);
    }
  };

  // "Start" navigates into practice — it never marks the task complete.
  const startTask = (task: TaskDTO) => {
    setPracticeIntent({ subject: task.subject, mode: "quick" });
    router.push("/dashboard?tab=practice&mode=quick");
  };

  const completedSet = new Set(
    dayPlan.tasks.filter((t) => t.completed).map((t) => String(t.id)),
  );

  const progress = dayPlan.tasks.length > 0
    ? Math.round((completedSet.size / dayPlan.tasks.length) * 100)
    : 0;

  const completedMinutes = dayPlan.tasks
    .filter((t) => completedSet.has(String(t.id)))
    .reduce((sum, t) => sum + t.duration, 0);

  const priorityColor = (p: string) => {
    switch (p) {
      case "high": return "text-[var(--dashboard-danger)] bg-[var(--dashboard-danger-subtle)] border-[var(--danger)]/20";
      case "medium": return "text-[var(--dashboard-warning)] bg-[var(--dashboard-warning-subtle)] border-[var(--warning)]/20";
      case "low": return "text-[var(--dashboard-primary)] bg-[var(--dashboard-primary-subtle)] border-[var(--accent)]/20";
      default: return "text-[var(--dashboard-text-muted)] bg-[var(--surface-muted)] border-[var(--dashboard-border-muted)]";
    }
  };

  return (
    <div className="space-y-6">
      {/* Sprint 7: display-voice page header — matches Home. */}
      <div>
        <p className="command-eyebrow">Planner</p>
        <h1 className="font-display text-xl font-semibold tracking-tight mt-1" style={{ color: "var(--dashboard-text-primary)" }}>
          প্ল্যানার
        </h1>
      </div>
      {/* AI Study Plan Header */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="command-card command-card--hero overflow-hidden"
      >
        <div className="border-b border-[var(--border-subtle)] pb-3 mb-5 flex items-center justify-between gap-2">
          <span className="command-eyebrow">{"// AI_STUDY_PLANNER"}</span>
        </div>

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <AiLogo solid={false} className="w-5 h-5 text-[var(--dashboard-primary)]" />
              <h2 className="font-display text-xl font-bold text-[var(--text-primary)]">AI Study Planner</h2>
            </div>
            <p className="text-sm text-[var(--dashboard-text-muted)] font-mono">
              A structured study schedule — mark tasks complete as you progress.
            </p>
          </div>

          <div className="flex items-center gap-4">
            <div className="text-center px-4 py-2 bg-subtle border border-[var(--accent)]/20 rounded-2xl">
              <div className="text-2xl font-bold text-[var(--dashboard-primary)] font-mono">{progress}%</div>
              <div className="text-[10px] text-[var(--dashboard-text-muted)] font-mono uppercase">Progress</div>
            </div>
            <div className="text-center px-4 py-2 bg-subtle border border-[var(--accent)]/20 rounded-2xl">
              <div className="text-2xl font-bold text-[var(--dashboard-primary)] font-mono">{completedMinutes}m</div>
              <div className="text-[10px] text-[var(--dashboard-text-muted)] font-mono uppercase">Studied</div>
            </div>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="mt-4 h-2 bg-[var(--surface-overlay)] rounded-full overflow-hidden">
          <motion.div
            initial={false}
            animate={{ scaleX: progress / 100 }}
            transition={{ duration: 0.5 }}
            style={{ transformOrigin: "left" }}
            className="h-full w-full bg-[var(--success)] rounded-full"
          />
        </div>
      </motion.div>

      {/* Day Selector */}
      {loading && (
        <div className="command-card p-6" role="status" aria-label="প্ল্যান লোড হচ্ছে">
          <p className="font-mono text-sm text-[var(--dashboard-text-muted)]">প্ল্যান লোড হচ্ছে…</p>
        </div>
      )}
      {loadError && !loading && (
        <div className="command-card p-6" role="alert">
          <p className="font-mono text-sm text-[var(--dashboard-danger)]">{loadError}</p>
          <button
            onClick={retry}
            className="mt-3 px-4 py-2 min-h-[44px] rounded-lg border border-[var(--dashboard-border-muted)] font-mono text-sm"
          >
            আবার চেষ্টা করুন <ArrowCounterClockwise className="inline w-3 h-3" />
          </button>
        </div>
      )}
      {!loading && !loadError && list.length === 0 && (
        <div className="command-card p-6">
          <EmptyState
            eyebrow="Planner"
            title="কোনো স্টাডি প্ল্যান নেই"
            body="এখনো কোনো পরিকল্পনা তৈরি হয়নি — প্র্যাকটিস ট্যাব থেকে পড়া শুরু করুন।"
          />
        </div>
      )}
      <div className="flex gap-2 overflow-x-auto pb-2">
        {days.map((dayName, i) => {
          const dayTasks = list.filter((t) => t.day === dayName);
          const done = dayTasks.filter((t) => t.completed).length;
          const date = dayTasks[0]?.date ?? "";
          return (
            <button
              key={dayName}
              onClick={() => setSelectedDay(i)}
              className={`flex-shrink-0 px-4 py-3 rounded-2xl border transition-all ${
                selectedDay === i
                  ? "bg-[var(--dashboard-primary-subtle)] border-[var(--accent)]/30 text-[var(--dashboard-primary)]"
                  : "bg-subtle border-[var(--dashboard-border-muted)] text-[var(--dashboard-text-muted)] hover:border-[var(--accent)]/20"
              }`}
            >
              <div className="text-sm font-mono font-medium">{dayName}</div>
              <div className="text-[10px] text-[var(--dashboard-text-muted)] font-mono">{date}</div>
              <div className="text-[10px] font-mono mt-1">
                {done}/{dayTasks.length}
              </div>
            </button>
          );
        })}
      </div>

      {/* Focus Areas */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="flex flex-wrap gap-2"
      >
        {Array.from(new Set(dayPlan.tasks.map((t) => t.subject))).map((area) => (
          <span
            key={area}
            className="px-3 py-1 bg-[var(--dashboard-primary-subtle)] border border-[var(--accent)]/20 rounded-full text-xs font-mono text-[var(--dashboard-primary)]"
          >
            {area}
          </span>
        ))}
        <span className="px-3 py-1 bg-subtle border border-[var(--dashboard-border-muted)] rounded-full text-xs font-mono text-[var(--dashboard-text-muted)]">
          {dayPlan.tasks.reduce((sum, t) => sum + t.duration, 0)} min total
        </span>
      </motion.div>

      {/* Tasks — shared EmptyState when the day has no plan (was silent blank). */}
      <div className="space-y-3">
        <AnimatePresence mode="popLayout">
          {dayPlan.tasks.length === 0 && (
            <motion.div
              key="empty-day"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="command-card p-6"
            >
              <EmptyState
                eyebrow="Planner"
                title="আজকের কোনো কাজ নেই"
                body="এই দিনের জন্য কোনো স্টাডি প্ল্যান নেই — বিশ্রাম নিন অথবা প্র্যাকটিস ট্যাব থেকে নিজে শুরু করুন।"
              />
            </motion.div>
          )}
          {dayPlan.tasks.map((task, i) => {
            const isCompleted = completedSet.has(String(task.id));
            return (
              <motion.div
                key={task.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                transition={{ delay: i * 0.05 }}
                className={`command-card p-4 transition-all ${
                  isCompleted ? "border-[var(--accent)]/30 bg-[var(--dashboard-primary-subtle)]" : ""
                }`}
              >
                <div className="flex items-start gap-4">
                  <button
                    onClick={() => {
                      void toggleTask(task.id);
                    }}
                    disabled={togglingId === task.id}
                    aria-label={`${task.title} — সম্পন্ন হিসেবে চিহ্নিত করুন`}
                    aria-pressed={isCompleted}
                    className={`mt-0.5 w-5 h-5 rounded border-2 flex items-center justify-center transition-all flex-shrink-0 ${
                      isCompleted
                        ? "bg-[var(--accent)] border-[var(--accent)] text-[var(--dashboard-text-inverse)]"
                        : "border-[var(--accent)]/30 hover:border-[var(--accent)]/50"
                    }`}
                  >
                    {isCompleted && <Check className="w-3 h-3" />}
                  </button>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h4 className={`text-sm font-medium ${isCompleted ? "text-[var(--dashboard-text-muted)] line-through" : "text-[var(--text-primary)]"}`}>
                          {task.title}
                        </h4>
                        <p className="text-xs text-[var(--dashboard-text-muted)] font-mono mt-0.5">{task.description}</p>
                      </div>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-mono border ${priorityColor(task.priority)}`}>
                        {task.priority.toUpperCase()}
                      </span>
                    </div>

                    <div className="flex items-center gap-4 mt-3">
                      <span className="flex items-center gap-1 text-xs text-[var(--dashboard-text-muted)] font-mono">
                        <Clock className="w-3 h-3" />
                        {task.duration} min
                      </span>
                      <span className="flex items-center gap-1 text-xs text-[var(--dashboard-text-muted)] font-mono">
                        <Target className="w-3 h-3" />
                        {task.subject}
                      </span>
                      <span className="flex items-center gap-1 text-xs text-[var(--dashboard-text-muted)] font-mono">
                        <Calendar className="w-3 h-3" />
                        {dayPlan.day}
                      </span>
                    </div>
                  </div>

                  {!isCompleted && (
                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => startTask(task)}
                      aria-label={`${task.title} — প্র্যাকটিস শুরু করুন`}
                      className="px-3 py-1.5 bg-[var(--accent)] text-[var(--dashboard-text-inverse)] font-mono text-xs rounded hover:bg-[var(--accent-hover)] transition-colors flex items-center gap-1"
                    >
                      Start <CaretRight className="w-3 h-3" />
                    </motion.button>
                  )}
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      {/* Study tip — static guidance, honestly labelled (not AI-generated) */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="p-4 bg-[var(--dashboard-primary-subtle)] border border-[var(--accent)]/20 rounded-2xl flex items-start gap-3"
      >
        <Lightbulb className="w-5 h-5 text-[var(--dashboard-primary)] flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-sm text-[var(--dashboard-text-secondary)]">
            <span className="text-[var(--dashboard-primary)] font-mono">স্টাডি টিপ:</span> প্রতিদিন অন্তত একটি দুর্বল টপিকে ১৫ মিনিট
            অতিরিক্ত সময় দিন। ছোট ছোট নিয়মিত প্র্যাকটিস সেশন ধারাবাহিকতা তৈরি করে — পরীক্ষার আগের রাতের ভরোসা।
          </p>
        </div>
      </motion.div>

      {/* Achievement Preview */}
      {progress === 100 && (
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="p-6 bg-[var(--dashboard-warning-subtle)] border border-[var(--warning)]/30 rounded-2xl text-center"
        >
          <Trophy className="w-12 h-12 text-[var(--dashboard-warning)] mx-auto mb-2" />
          <h3 className="text-lg font-bold text-[var(--dashboard-warning)] font-mono">DAY COMPLETE!</h3>
          <p className="text-sm text-[var(--dashboard-text-muted)] mt-1">You&apos;ve completed all tasks for today. Keep it up!</p>
        </motion.div>
      )}
    </div>
  );
}
