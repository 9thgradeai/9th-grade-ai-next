"use client";

import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Check, Clock, Target, Calendar, ChevronRight, Sparkles, Trophy } from "lucide-react";
import { STUDY_PLAN } from "@/lib/data/study";
import { api } from "@/lib/services/api";

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

// Build a fallback plan from the static data (used if the DB is unavailable).
function staticPlan(): TaskDTO[] {
  return STUDY_PLAN.flatMap((day, di) =>
    day.tasks.map((t, ti) => ({
      id: di * 100 + ti,
      day: day.day,
      date: day.date,
      title: t.title,
      subject: t.subject,
      duration: t.duration,
      priority: t.priority,
      description: t.description,
      completed: t.completed,
    })),
  );
}

export default function StudyPlannerTab() {
  const [selectedDay, setSelectedDay] = useState(0);
  const [tasks, setTasks] = useState<TaskDTO[]>(staticPlan());
  const [loading, setLoading] = useState(true);

  // Load the study plan from the database (fallback to static data).
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const list = await api.studyPlan();
        if (!cancelled && list.length) setTasks(list);
      } catch {
        /* keep static fallback */
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const days = useMemo(() => Array.from(new Set(tasks.map((t) => t.day))), [tasks]);
  const selectedDayName = days[selectedDay] ?? days[0];
  const dayPlan = {
    day: selectedDayName ?? "",
    tasks: tasks.filter((t) => t.day === selectedDayName),
  };

  const toggleTask = async (taskId: number) => {
    setTasks((prev) =>
      prev.map((t) => (t.id === taskId ? { ...t, completed: !t.completed } : t)),
    );
    try {
      await api.toggleStudyTask(taskId);
    } catch {
      /* ignore — local state already updated */
    }
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
      case "high": return "text-red-400 bg-red-500/10 border-red-500/20";
      case "medium": return "text-amber-400 bg-amber-500/10 border-amber-500/20";
      case "low": return "text-emerald-400 bg-emerald-500/10 border-emerald-500/20";
      default: return "text-zinc-400 bg-zinc-500/10 border-zinc-500/20";
    }
  };

  return (
    <div className="space-y-6">
      {/* AI Study Plan Header */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass-card rounded-terminal-rounded border border-terminal-border p-5 md:p-6"
      >
        <div className="terminal-window-bar mb-4 border-b border-terminal-border">
          <div className="dot close" /><div className="dot minimize" /><div className="dot maximize" />
          <div className="flex-1 text-center text-xs text-zinc-400 font-mono">{"// AI_STUDY_PLANNER"}</div>
        </div>

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="w-5 h-5 text-emerald-400" />
              <h2 className="text-xl font-bold text-white">AI Study Planner</h2>
            </div>
            <p className="text-sm text-zinc-400 font-mono">
              Personalized schedule generated based on your weak areas and exam timeline.
            </p>
          </div>

          <div className="flex items-center gap-4">
            <div className="text-center px-4 py-2 bg-subtle border border-emerald-500/20 rounded-terminal-rounded">
              <div className="text-2xl font-bold text-emerald-400 font-mono">{progress}%</div>
              <div className="text-[10px] text-zinc-500 font-mono uppercase">Progress</div>
            </div>
            <div className="text-center px-4 py-2 bg-subtle border border-emerald-500/20 rounded-terminal-rounded">
              <div className="text-2xl font-bold text-emerald-400 font-mono">{completedMinutes}m</div>
              <div className="text-[10px] text-zinc-500 font-mono uppercase">Studied</div>
            </div>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="mt-4 h-2 bg-zinc-800 rounded-full overflow-hidden">
          <motion.div
            initial={false}
            animate={{ scaleX: progress / 100 }}
            transition={{ duration: 0.5 }}
            style={{ transformOrigin: "left" }}
            className="h-full w-full bg-gradient-to-r from-emerald-500 to-emerald-400 rounded-full"
          />
        </div>
      </motion.div>

      {/* Day Selector */}
      <div className="flex gap-2 overflow-x-auto pb-2">
        {days.map((dayName, i) => {
          const dayTasks = tasks.filter((t) => t.day === dayName);
          const done = dayTasks.filter((t) => t.completed).length;
          const date = dayTasks[0]?.date ?? "";
          return (
            <button
              key={dayName}
              onClick={() => setSelectedDay(i)}
              className={`flex-shrink-0 px-4 py-3 rounded-terminal-rounded border transition-all ${
                selectedDay === i
                  ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                  : "bg-subtle border-zinc-800 text-zinc-400 hover:border-emerald-500/20"
              }`}
            >
              <div className="text-sm font-mono font-medium">{dayName}</div>
              <div className="text-[10px] text-zinc-500 font-mono">{date}</div>
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
            className="px-3 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded-full text-xs font-mono text-emerald-400"
          >
            {area}
          </span>
        ))}
        <span className="px-3 py-1 bg-subtle border border-zinc-800 rounded-full text-xs font-mono text-zinc-400">
          {dayPlan.tasks.reduce((sum, t) => sum + t.duration, 0)} min total
        </span>
      </motion.div>

      {/* Tasks */}
      <div className="space-y-3">
        <AnimatePresence mode="popLayout">
          {dayPlan.tasks.map((task, i) => {
            const isCompleted = completedSet.has(String(task.id));
            return (
              <motion.div
                key={task.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                transition={{ delay: i * 0.05 }}
                className={`glass-card rounded-terminal-rounded border p-4 transition-all ${
                  isCompleted ? "border-emerald-500/30 bg-emerald-500/5" : "border-terminal-border"
                }`}
              >
                <div className="flex items-start gap-4">
                  <button
                    onClick={() => {
                      void toggleTask(task.id);
                    }}
                    className={`mt-0.5 w-5 h-5 rounded border-2 flex items-center justify-center transition-all flex-shrink-0 ${
                      isCompleted
                        ? "bg-emerald-500 border-emerald-500 text-zinc-950"
                        : "border-emerald-500/30 hover:border-emerald-500/50"
                    }`}
                  >
                    {isCompleted && <Check className="w-3 h-3" />}
                  </button>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h4 className={`text-sm font-medium ${isCompleted ? "text-zinc-500 line-through" : "text-white"}`}>
                          {task.title}
                        </h4>
                        <p className="text-xs text-zinc-500 font-mono mt-0.5">{task.description}</p>
                      </div>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-mono border ${priorityColor(task.priority)}`}>
                        {task.priority.toUpperCase()}
                      </span>
                    </div>

                    <div className="flex items-center gap-4 mt-3">
                      <span className="flex items-center gap-1 text-xs text-zinc-500 font-mono">
                        <Clock className="w-3 h-3" />
                        {task.duration} min
                      </span>
                      <span className="flex items-center gap-1 text-xs text-zinc-500 font-mono">
                        <Target className="w-3 h-3" />
                        {task.subject}
                      </span>
                      <span className="flex items-center gap-1 text-xs text-zinc-500 font-mono">
                        <Calendar className="w-3 h-3" />
                        {dayPlan.day}
                      </span>
                    </div>
                  </div>

                  {!isCompleted && (
                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => {
                        void toggleTask(task.id);
                      }}
                      className="px-3 py-1.5 bg-emerald-500 text-zinc-950 font-mono text-xs rounded hover:bg-emerald-400 transition-colors flex items-center gap-1 shadow-neon-glow"
                    >
                      Start <ChevronRight className="w-3 h-3" />
                    </motion.button>
                  )}
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      {/* AI Suggestion */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="p-4 bg-emerald-500/5 border border-emerald-500/20 rounded-terminal-rounded flex items-start gap-3"
      >
        <Sparkles className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-sm text-zinc-300">
            <span className="text-emerald-400 font-mono">AI Tip:</span> Based on your recent performance, I recommend spending extra 15 minutes on{" "}
            <span className="text-white font-mono">গাণিতিক যুক্তি</span> today. Your accuracy is improving but needs more practice.
          </p>
        </div>
      </motion.div>

      {/* Achievement Preview */}
      {progress === 100 && (
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="p-6 bg-amber-500/10 border border-amber-500/30 rounded-terminal-rounded text-center"
        >
          <Trophy className="w-12 h-12 text-amber-400 mx-auto mb-2" />
          <h3 className="text-lg font-bold text-amber-400 font-mono">DAY COMPLETE!</h3>
          <p className="text-sm text-zinc-400 mt-1">You&apos;ve completed all tasks for today. Keep it up!</p>
        </motion.div>
      )}
    </div>
  );
}
