"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  CalendarClock,
  Flame,
  Target,
  ArrowRight,
  Sparkles,
  Zap,
  Trophy,
  ClipboardList,
  Flag,
} from "lucide-react";
import { useAuth } from "@/lib/auth-ctx";
import { useDashboardStore } from "@/lib/store-ctx/dashboard";
import { api } from "@/lib/services/api";
import type {
  Server,
} from "@/lib/types";
import DailyQuizWidget from "./DailyQuizWidget";

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("bn-BD", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function useCountdown(target: string) {
  const [remaining, setRemaining] = useState({ d: "00", h: "00", m: "00", s: "00" });
  useEffect(() => {
    const tick = () => {
      const diff = new Date(target).getTime() - Date.now();
      if (diff <= 0) {
        setRemaining({ d: "00", h: "00", m: "00", s: "00" });
        return;
      }
      const pad = (n: number) => String(n).padStart(2, "0");
      setRemaining({
        d: pad(Math.floor(diff / 86400000)),
        h: pad(Math.floor((diff % 86400000) / 3600000)),
        m: pad(Math.floor((diff % 3600000) / 60000)),
        s: pad(Math.floor((diff % 60000) / 1000)),
      });
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [target]);
  return remaining;
}

const KPI_KEYS: { key: keyof Server.DashboardStatsDTO; label: string; suffix?: string }[] = [
  { key: "points", label: "পয়েন্ট" },
  { key: "accuracy", label: "সঠিকতার হার", suffix: "%" },
  { key: "questionsAnswered", label: "প্রশ্ন সমাধান" },
  { key: "streak", label: "স্ট্রিক", suffix: " দিন" },
  { key: "rank", label: "র‍্যাংক" },
  { key: "exams", label: "মক পরীক্ষা" },
];

function MetricTile({
  value,
  label,
  suffix,
}: {
  value: number;
  label: string;
  suffix?: string;
}) {
  return (
    <motion.div
      whileHover={{ y: -3 }}
      className="glass-card rounded-2xl border border-terminal-border p-4 transition-[border-color,box-shadow] duration-300 hover:border-emerald-500/30 hover:shadow-neon-glow"
    >
      <p className="text-2xl font-bold font-mono text-gradient">
        {value.toLocaleString("bn-BD")}
        {suffix ? <span className="text-sm text-zinc-400">{suffix}</span> : null}
      </p>
      <p className="text-xs text-zinc-400 mt-1">{label}</p>
    </motion.div>
  );
}

export default function HomeTab() {
  const { user } = useAuth();
  const { setActiveTab } = useDashboardStore();

  const [stats, setStats] = useState<Server.DashboardStatsDTO | null>(null);
  const [reports, setReports] = useState<Array<{ name: string; score: number; attempted: number; correct: number }>>([]);
  const [nextExam, setNextExam] = useState<Server.ExamScheduleDTO | null>(null);
  const [tasks, setTasks] = useState<Server.StudyTaskDTO[]>([]);
  const [results, setResults] = useState<Server.MockTestResultDTO[]>([]);
  const [news, setNews] = useState<Server.FlashNewsDTO[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [s, r, e, t, m, n] = await Promise.allSettled([
          api.dashboardStats(),
          api.subjectReports(),
          api.examSchedule(),
          api.studyPlan(),
          api.mockTestResults(),
          api.news(),
        ]);
        if (cancelled) return;
        if (s.status === "fulfilled") setStats(s.value);
        if (r.status === "fulfilled") setReports(r.value);
        if (e.status === "fulfilled") {
          const upcoming = e.value
            .filter((ex) => new Date(ex.date).getTime() > Date.now())
            .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())[0] ?? null;
          setNextExam(upcoming);
        }
        if (t.status === "fulfilled") setTasks(t.value);
        if (m.status === "fulfilled") setResults(m.value);
        if (n.status === "fulfilled") setNews(n.value);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const countdown = useCountdown(nextExam?.date ?? "");

  const weakest = useMemo(
    () =>
      [...reports]
        .filter((r) => r.attempted > 0)
        .sort((a, b) => a.score - b.score)
        .slice(0, 5),
    [reports],
  );

  const todaysTasks = useMemo(() => {
    const today = WEEKDAYS[new Date().getDay()];
    return tasks.filter((t) => t.day === today);
  }, [tasks]);

  const toggleTask = async (taskId: number) => {
    try {
      await api.toggleStudyTask(taskId);
      setTasks((prev) =>
        prev.map((t) => (t.id === taskId ? { ...t, completed: !t.completed } : t)),
      );
    } catch {
      // keep local state unchanged on failure
    }
  };

  const skeleton = loading && !stats;

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass-card rounded-2xl border border-terminal-border p-5 relative overflow-hidden"
      >
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(16,185,129,0.08),transparent_60%)] pointer-events-none" aria-hidden="true" />
        <div className="relative flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs text-zinc-500 font-mono uppercase tracking-widest">
              Mission Control
            </p>
            <h1 className="text-xl font-bold text-white mt-1">
              {user?.name ?? "Student"}
              <span className="text-emerald-400"> — চাকরির প্রস্তুতি</span>
            </h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="px-3 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-xs font-mono text-emerald-400 flex items-center gap-1">
              <Target className="w-3.5 h-3.5" />
              {nextExam ? nextExam.titleBn : "কোনো আসন্ন পরীক্ষা নেই"}
            </span>
            <span className="px-3 py-1 bg-orange-500/10 border border-orange-500/20 rounded-lg text-xs font-mono text-orange-400 flex items-center gap-1">
              <Flame className="w-3.5 h-3.5" />
              {stats?.streak ?? 0} দিন স্ট্রিক
            </span>
          </div>
        </div>
      </motion.div>

      {/* Countdown hero — real exam */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.08 }}
        className="glass-card rounded-2xl border border-emerald-500/30 p-6 md:p-8 relative overflow-hidden"
      >
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(16,185,129,0.1),transparent_60%)] pointer-events-none" aria-hidden="true" />
        <motion.div
          className="absolute -top-16 -right-16 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl"
          aria-hidden="true"
          animate={{ opacity: [0.4, 0.8, 0.4], scale: [1, 1.1, 1] }}
          transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
        />
        {nextExam ? (
          <div className="relative flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                <CalendarClock className="w-6 h-6 text-emerald-400" />
              </div>
              <div>
                <p className="text-sm text-zinc-400 font-mono mb-1">পরবর্তী পরীক্ষা</p>
                <h3 className="text-xl md:text-2xl font-bold text-white">{nextExam.titleBn}</h3>
                <p className="text-sm text-zinc-400 mt-1">{formatDate(nextExam.date)}</p>
                {nextExam.note ? (
                  <p className="text-xs text-zinc-500 mt-1 max-w-md">{nextExam.note}</p>
                ) : null}
              </div>
            </div>
            <div className="flex items-center gap-3 font-mono">
              <span className="text-xs text-zinc-400 uppercase tracking-wider">Countdown</span>
              <span className="px-4 py-2 bg-zinc-900 border border-emerald-500/20 rounded-xl text-emerald-400 font-bold text-lg tracking-widest">
                {countdown.d}:{countdown.h}:{countdown.m}:{countdown.s}
              </span>
            </div>
          </div>
        ) : (
          <div className="relative flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div>
              <p className="text-sm text-zinc-400">কোনো আসন্ন পরীক্ষার সময়সূচি নেই</p>
              <h3 className="text-lg font-semibold text-white mt-1">সিলেবাস থেকে প্রস্তুতি শুরু করুন</h3>
            </div>
            <button
              onClick={() => setActiveTab("question-bank")}
              className="px-4 py-2 bg-emerald-500 text-zinc-950 font-mono text-sm rounded-lg hover:bg-emerald-400 transition-colors flex items-center gap-2"
            >
              প্রশ্নব্যাংক দেখুন <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </motion.div>

      {/* KPI strip — real stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {skeleton
          ? Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="glass-card rounded-2xl border border-terminal-border p-4 animate-pulse">
                <div className="h-7 w-16 bg-zinc-800 rounded" />
                <div className="h-3 w-20 bg-zinc-800 rounded mt-3" />
              </div>
            ))
          : KPI_KEYS.map((k) => (
              <MetricTile
                key={k.key}
                value={(stats?.[k.key] as number) ?? 0}
                label={k.label}
                suffix={k.suffix}
              />
            ))}
      </div>

      {/* Weak areas — real subject reports */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="glass-card rounded-2xl border border-terminal-border p-5"
      >
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-semibold text-white uppercase tracking-wider">
              দুর্বল বিষয়সমূহ
            </h3>
            <p className="text-xs text-zinc-500 mt-0.5">বাস্তব পারফরম্যান্স অনুযায়ী — দুর্বল থেকে শক্তিশালী</p>
          </div>
          <button
            onClick={() => setActiveTab("practice")}
            className="text-xs text-emerald-400 font-mono hover:text-emerald-300 transition-colors flex items-center gap-1"
          >
            প্র্যাকটিস <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {weakest.length === 0 ? (
          <div className="text-center py-8">
            <Target className="w-10 h-10 mx-auto mb-3 text-emerald-500/60" aria-hidden="true" />
            <p className="text-sm text-zinc-400">এখনো কোনো প্রশ্ন সমাধান করেননি।</p>
            <button
              onClick={() => setActiveTab("practice")}
              className="mt-4 px-4 py-2 bg-emerald-500 text-zinc-950 font-mono text-sm rounded-lg hover:bg-emerald-400 transition-colors"
            >
              প্র্যাকটিস শুরু করুন
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {weakest.map((r) => (
              <div key={r.name} className="flex items-center gap-4">
                <div className="w-44 flex-shrink-0">
                  <p className="text-sm text-zinc-300 truncate">{r.name}</p>
                  <p className="text-[10px] text-zinc-500 font-mono">{r.attempted}টি সমাধান</p>
                </div>
                <div className="flex-1 h-2 bg-zinc-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-700 ${
                      r.score < 50
                        ? "bg-red-500"
                        : r.score < 75
                          ? "bg-amber-500"
                          : "bg-emerald-500"
                    }`}
                    style={{ width: `${Math.max(2, r.score)}%` }}
                  />
                </div>
                <span className="w-12 text-right text-sm font-mono text-emerald-400">
                  {r.score}%
                </span>
              </div>
            ))}
          </div>
        )}
      </motion.div>

      {/* Today's plan + recent mock results */}
      <div className="grid md:grid-cols-2 gap-6">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="glass-card rounded-2xl border border-terminal-border p-5"
        >
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-white uppercase tracking-wider">
              আজকের রুটিন
            </h3>
            <button
              onClick={() => setActiveTab("study-planner")}
              className="text-xs text-emerald-400 font-mono hover:text-emerald-300 transition-colors flex items-center gap-1"
            >
              প্ল্যানার <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {todaysTasks.length === 0 ? (
            <div className="text-center py-8">
              <ClipboardList className="w-10 h-10 mx-auto mb-3 text-emerald-500/60" aria-hidden="true" />
              <p className="text-sm text-zinc-400">আজকের জন্য কোনো টাস্ক নেই।</p>
              <button
                onClick={() => setActiveTab("study-planner")}
                className="mt-4 px-4 py-2 bg-emerald-500 text-zinc-950 font-mono text-sm rounded-lg hover:bg-emerald-400 transition-colors"
              >
                রুটিন দেখুন
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {todaysTasks.map((t) => (
                <div
                  key={t.id}
                  className={`flex items-center gap-3 p-3 rounded-xl border transition-colors ${
                    t.completed
                      ? "border-emerald-500/20 bg-emerald-500/5"
                      : "border-zinc-800 bg-zinc-900/40"
                  }`}
                >
                  <button
                    onClick={() => void toggleTask(t.id)}
                    aria-label={t.completed ? "চিহ্নিত করা হয়েছে" : "সম্পন্ন হিসেবে চিহ্নিত করুন"}
                    className={`w-5 h-5 rounded-md border flex items-center justify-center flex-shrink-0 transition-colors ${
                      t.completed
                        ? "bg-emerald-500 border-emerald-500 text-zinc-950"
                        : "border-zinc-600 hover:border-emerald-500"
                    }`}
                  >
                    {t.completed ? "✓" : ""}
                  </button>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm ${t.completed ? "text-zinc-500 line-through" : "text-zinc-200"}`}>
                      {t.title}
                    </p>
                    <p className="text-[10px] text-zinc-500 font-mono mt-0.5">
                      {t.subject} • {t.duration} মিনিট
                    </p>
                  </div>
                  <span
                    className={`text-[10px] font-mono px-2 py-0.5 rounded ${
                      t.priority === "high"
                        ? "bg-red-500/10 text-red-400"
                        : t.priority === "medium"
                          ? "bg-amber-500/10 text-amber-400"
                          : "bg-zinc-700/40 text-zinc-400"
                    }`}
                  >
                    {t.priority === "high" ? "উচ্চ" : t.priority === "medium" ? "মাঝারি" : "কম"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="glass-card rounded-2xl border border-terminal-border p-5"
        >
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-white uppercase tracking-wider">
              সাম্প্রতিক মক পরীক্ষা
            </h3>
            <button
              onClick={() => setActiveTab("practice")}
              className="text-xs text-emerald-400 font-mono hover:text-emerald-300 transition-colors flex items-center gap-1"
            >
              মক টেস্ট <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {results.length === 0 ? (
            <div className="text-center py-8">
              <Flag className="w-10 h-10 mx-auto mb-3 text-emerald-500/60" aria-hidden="true" />
              <p className="text-sm text-zinc-400">এখনো কোনো মক পরীক্ষা দেওয়া হয়নি।</p>
              <button
                onClick={() => setActiveTab("practice")}
                className="mt-4 px-4 py-2 bg-emerald-500 text-zinc-950 font-mono text-sm rounded-lg hover:bg-emerald-400 transition-colors"
              >
                মক টেস্ট শুরু করুন
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {results.slice(0, 4).map((r) => (
                <div
                  key={r.id}
                  className="flex items-center gap-3 p-3 rounded-xl border border-zinc-800 bg-zinc-900/40"
                >
                  <div
                    className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
                      r.score >= 80
                        ? "bg-emerald-500/10 text-emerald-400"
                        : r.score >= 50
                          ? "bg-amber-500/10 text-amber-400"
                          : "bg-red-500/10 text-red-400"
                    }`}
                  >
                    <Trophy className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-zinc-200 truncate">{r.title}</p>
                    <p className="text-[10px] text-zinc-500 font-mono mt-0.5">
                      {r.correct}/{r.total} সঠিক •{" "}
                      {new Date(r.createdAt).toLocaleDateString("bn-BD", {
                        day: "numeric",
                        month: "short",
                      })}
                    </p>
                  </div>
                  <span className="text-sm font-mono text-emerald-400">{r.score}%</span>
                </div>
              ))}
            </div>
          )}
        </motion.div>
      </div>

      {/* Daily quiz */}
      <DailyQuizWidget />

      {/* Flash news */}
      {news.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="glass-card rounded-2xl border border-terminal-border overflow-hidden"
        >
          <div className="px-5 py-4 border-b border-terminal-border flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-emerald-400" />
            <h3 className="text-sm font-semibold text-white uppercase tracking-wider">
              ফ্ল্যাশ নিউজ
            </h3>
          </div>
          <div className="divide-y divide-terminal-border">
            {news.slice(0, 5).map((item) => (
              <div key={item.id} className="flex items-start gap-3 p-4 hover:bg-emerald-500/5 transition-colors">
                <span className="px-1.5 py-0.5 bg-emerald-500/10 border border-emerald-500/20 rounded text-[10px] font-mono text-emerald-400 flex-shrink-0 mt-0.5">
                  {item.tag}
                </span>
                <p className="text-sm text-zinc-300 flex-1">{item.text}</p>
                <span className="text-xs text-zinc-500 font-mono flex-shrink-0">
                  {item.date}
                </span>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {/* AI suggestion strip — real weakest subject */}
      {weakest.length > 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
          className="flex items-center gap-3 p-4 bg-emerald-500/5 border border-emerald-500/20 rounded-2xl"
        >
          <Zap className="w-5 h-5 text-emerald-400 flex-shrink-0" />
          <p className="text-sm text-zinc-300">
            <span className="text-emerald-400 font-mono">চর্চা AI:</span> সবচেয়ে দুর্বল বিষয়{" "}
            <span className="text-white font-mono">{weakest[0].name}</span> — এখানে{" "}
            <span className="text-white font-mono">{weakest[0].attempted}টি</span> প্রশ্নের
            সঠিকতা {weakest[0].score}%।
          </p>
        </motion.div>
      )}
    </div>
  );
}