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
import { useLanguage, t } from "@/lib/lang-ctx";
import { useToastSafe } from "@/lib/toast-ctx";
import { api } from "@/lib/services/api";
import type {
  Server,
} from "@/lib/types";
import DailyQuizWidget from "./DailyQuizWidget";
import KpiTile, { type KpiAccent } from "@/components/ui/KpiTile";
import EmptyState from "@/components/ui/EmptyState";
import Sparkline from "@/components/ui/Sparkline";
import StreakHeatmap from "./StreakHeatmap";

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const WEEKDAY_SHORT_BN = ["শনি", "রবি", "সোম", "মঙ্গল", "বুধ", "বৃহ", "শুক্র"];

const PREP_LABEL: Record<string, string> = {
  BEGINNER: "নবীন",
  INTERMEDIATE: "মধ্যম",
  ADVANCED: "উন্নত",
};

const STAGGER = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06, delayChildren: 0.04 } },
};
const STAGGER_ITEM = {
  hidden: { opacity: 0, y: 10 },
  show: {
    opacity: 1,
    y: 0,
    transition: { type: "spring" as const, stiffness: 260, damping: 26 },
  },
};

function lastSevenDayLabels(): string[] {
  const today = new Date().getDay();
  const out: string[] = [];
  for (let i = 6; i >= 0; i--) {
    out.push(WEEKDAY_SHORT_BN[(today - i + 7) % 7]);
  }
  return out;
}

const WEEKDAY_LABELS_7 = lastSevenDayLabels();

function CountdownRing({ daysLeft }: { daysLeft: number }) {
  const fraction = Math.max(0, Math.min(1, daysLeft / 90));
  const r = 26;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - fraction);
  return (
    <svg viewBox="0 0 64 64" className="w-16 h-16 -rotate-90" aria-hidden="true">
      <circle cx="32" cy="32" r={r} fill="none" stroke="rgb(148 155 195 / 0.18)" strokeWidth="5" />
      <circle
        cx="32"
        cy="32"
        r={r}
        fill="none"
        stroke="#2dd4bf"
        strokeWidth="5"
        strokeLinecap="round"
        strokeDasharray={circ}
        strokeDashoffset={offset}
      />
    </svg>
  );
}

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

const KPI_KEYS: {
  key: keyof Server.DashboardStatsDTO;
  label: string;
  labelEn: string;
  suffix?: string;
  accent?: KpiAccent;
}[] = [
  { key: "points", label: "পয়েন্ট", labelEn: "Points", accent: "emerald" },
  { key: "accuracy", label: "সঠিকতার হার", labelEn: "Accuracy", suffix: "%", accent: "cyan" },
  { key: "questionsAnswered", label: "প্রশ্ন সমাধান", labelEn: "Solved", accent: "indigo" },
  { key: "streak", label: "স্ট্রিক", labelEn: "Streak", suffix: " দিন", accent: "amber" },
  { key: "rank", label: "র‍্যাংক", labelEn: "Rank", accent: "zinc" },
  { key: "exams", label: "মক পরীক্ষা", labelEn: "Mock exams", accent: "zinc" },
];

export default function HomeTab() {
  const { user } = useAuth();
  const { setActiveTab } = useDashboardStore();
  const { lang } = useLanguage();
  const toast = useToastSafe();

  const [stats, setStats] = useState<Server.DashboardStatsDTO | null>(null);
  const [reports, setReports] = useState<Array<{ name: string; score: number; attempted: number; correct: number }>>([]);
  const [nextExam, setNextExam] = useState<Server.ExamScheduleDTO | null>(null);
  const [tasks, setTasks] = useState<Server.StudyTaskDTO[]>([]);
  const [results, setResults] = useState<Server.MockTestResultDTO[]>([]);
  const [news, setNews] = useState<Server.FlashNewsDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

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
        // Surface a total outage instead of silently rendering zeros.
        if ([s, r, e, t, m, n].every((p) => p.status === "rejected")) {
          setLoadFailed(true);
        }
        setLoading(false);
      } catch {
        if (!cancelled) {
          setLoadFailed(true);
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  useEffect(() => {
    if (!stats) return;
    const s = stats.streak;
    const isMilestone = s === 7 || s === 30 || s === 100 || (s > 0 && s % 50 === 0);
    if (!isMilestone) return;
    const key = `streak-celebrated-${s}`;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
    } catch {
      return;
    }
    toast.success(`অভিনন্দন! আপনি ${s} দিনের স্ট্রিক অর্জন করেছেন।`);
  }, [stats, toast]);

  const retryLoad = () => {
    setLoading(true);
    setLoadFailed(false);
    setReloadKey((k) => k + 1);
  };

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

  const activityDays = useMemo(() => {
    const done = new Set(results.map((r) => new Date(r.createdAt).toDateString()));
    const out: boolean[] = [];
    const today = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      out.push(done.has(d.toDateString()));
    }
    return out;
  }, [results]);

  const mockTrend = useMemo(
    () =>
      results
        .slice()
        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
        .slice(-8)
        .map((r) => r.score),
    [results],
  );

  const toggleTask = async (taskId: number) => {
    // Optimistic flip with rollback on failure — the toggle is a single
    // checkbox, so local state leads and the server confirms behind it.
    setTasks((prev) =>
      prev.map((t) => (t.id === taskId ? { ...t, completed: !t.completed } : t)),
    );
    try {
      await api.toggleStudyTask(taskId);
    } catch {
      setTasks((prev) =>
        prev.map((t) => (t.id === taskId ? { ...t, completed: !t.completed } : t)),
      );
      toast.error("কাজ আপডেট করা যায়নি — আবার চেষ্টা করুন");
    }
  };

  const skeleton = loading && !stats;

  return (
    <motion.div
      variants={STAGGER}
      initial="hidden"
      animate="show"
      className="space-y-6"
    >
      {/* Header */}
      <motion.div
        variants={STAGGER_ITEM}
        className="glass-card rounded-2xl border border-default p-5 relative overflow-hidden"
      >
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(16,185,129,0.08),transparent_60%)] pointer-events-none" aria-hidden="true" />
        <div className="relative flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs text-zinc-500 font-mono uppercase tracking-widest flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.8)]" aria-hidden="true" />
              Mission Control
            </p>
              <h1 className="font-display text-xl font-semibold text-white mt-1 text-balance">
                {user?.name ?? "Student"}
                <span className="text-emerald-400">
                  {" "}
                  — {user?.examTarget ? user.examTarget : "চাকরির প্রস্তুতি"}
                </span>
              </h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="px-3 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-xs font-mono text-emerald-400 flex items-center gap-1">
              <Target className="w-3.5 h-3.5" />
              {nextExam ? t(lang, nextExam.titleBn, nextExam.titleEn) : "কোনো আসন্ন পরীক্ষা নেই"}
            </span>
            <span className="px-3 py-1.5 bg-orange-500/10 border border-orange-500/20 rounded-lg text-xs font-mono text-orange-400 flex items-center gap-2">
              <Flame className="w-3.5 h-3.5" />
              <span>{stats?.streak ?? 0} দিন স্ট্রিক</span>
              <StreakHeatmap activeDays={activityDays} labels={WEEKDAY_LABELS_7} />
            </span>
            {user?.goal && (
              <span className="px-3 py-1.5 bg-indigo-500/10 border border-indigo-500/20 rounded-lg text-xs font-mono text-indigo-300 flex items-center gap-1 max-w-[14rem]">
                <Target className="w-3.5 h-3.5 flex-shrink-0" />
                <span className="truncate">{user.goal}</span>
              </span>
            )}
          </div>
        </div>
      </motion.div>

      {/* Countdown hero — real exam */}
      <motion.div
        variants={STAGGER_ITEM}
        className="glass-card rounded-2xl border border-emerald-500/30 p-6 md:p-8 relative overflow-hidden"
      >
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(16,185,129,0.1),transparent_60%)] pointer-events-none" aria-hidden="true" />
        <div
          className="absolute -top-16 -right-16 w-64 h-64 bg-emerald-500/10 rounded-full blur-2xl"
          aria-hidden="true"
        />
        {nextExam ? (
          <div className="relative flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                <CalendarClock className="w-6 h-6 text-emerald-400" />
              </div>
              <div>
                <p className="text-sm text-zinc-400 font-mono mb-1">পরবর্তী পরীক্ষা</p>
                <h3 className="text-xl md:text-2xl font-bold text-white">{t(lang, nextExam.titleBn, nextExam.titleEn)}</h3>
                <p className="text-sm text-zinc-400 mt-1">{formatDate(nextExam.date)}</p>
                {nextExam.note ? (
                  <p className="text-xs text-zinc-500 mt-1 max-w-md">{nextExam.note}</p>
                ) : null}
                {nextExam.sourceUrl ? (
                  <a
                    href={nextExam.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-emerald-400 hover:underline mt-1 inline-flex items-center gap-1"
                  >
                    সূত্র ↗
                  </a>
                ) : null}
              </div>
            </div>
            <div className="flex items-center gap-4">
              <CountdownRing daysLeft={Number(countdown.d) || 0} />
              <div className="flex flex-col font-mono">
                <span className="text-xs text-zinc-400 uppercase tracking-wider">Countdown</span>
                <span className="text-emerald-400 font-bold text-lg tracking-widest tabular-nums">
                  {countdown.d}:{countdown.h}:{countdown.m}:{countdown.s}
                </span>
              </div>
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

      {/* KPI strip — real stats (swipeable on mobile, grid on larger screens) */}
      <div className="-mx-4 px-4 pb-1 flex gap-3 overflow-x-auto snap-x snap-mandatory [scrollbar-width:none] sm:mx-0 sm:px-0 sm:grid sm:grid-cols-3 sm:overflow-visible lg:grid-cols-6">
        {KPI_KEYS.map((k) => (
          <div key={k.key} className="snap-start min-w-[44%] sm:min-w-0">
            <KpiTile
              label={lang === "bn" ? k.label : k.labelEn}
              value={`${(stats?.[k.key] as number ?? 0).toLocaleString("bn-BD")}${k.suffix ?? ""}`}
              accent={k.accent}
              loading={skeleton}
            />
          </div>
        ))}
      </div>

      {/* Total load failure — never render a silent zeroed dashboard */}
      {loadFailed && !skeleton && (
        <div
          role="alert"
          className="glass-card rounded-2xl border border-red-500/30 p-8 text-center"
        >
          <p className="text-sm font-medium text-zinc-200">ড্যাশবোর্ড ডেটা লোড করা যায়নি</p>
          <p className="mt-1 text-xs text-zinc-500">
            ইন্টারনেট সংযোগ পরীক্ষা করে আবার চেষ্টা করুন।
          </p>
          <button
            onClick={retryLoad}
            className="mt-4 px-4 py-2 bg-emerald-500 text-zinc-950 font-mono text-sm rounded-lg hover:bg-emerald-400 transition-colors"
          >
            আবার চেষ্টা করুন
          </button>
        </div>
      )}

      {/* Weak areas — real subject reports */}
      <motion.div
        variants={STAGGER_ITEM}
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
          <EmptyState
            icon={Target}
            title="এখনো কোনো প্রশ্ন সমাধান করেননি।"
            hint="প্র্যাকটিস শুরু করলে বিষয়ভিত্তিক দুর্বলতা এখানে দেখা যাবে।"
            action={
              <button
                onClick={() => setActiveTab("practice")}
                className="px-4 py-2 bg-emerald-500 text-zinc-950 font-mono text-sm rounded-lg hover:bg-emerald-400 transition-colors"
              >
                প্র্যাকটিস শুরু করুন
              </button>
            }
          />
        ) : (
          <div className="space-y-3">
            {weakest.map((r) => (
              <div key={r.name} className="flex items-center gap-4">
                <div className="w-44 flex-shrink-0">
                  <p className="text-sm text-zinc-300 truncate">{r.name}</p>
                  <p className="text-[10px] text-zinc-500 font-mono">{r.attempted}টি সমাধান</p>
                </div>
                <div className="flex-1 h-2 bg-zinc-800 rounded-full overflow-hidden flex">
                  <div
                    className="h-full bg-emerald-500 transition-[width] duration-700"
                    style={{ width: `${(r.correct / r.attempted) * 100}%` }}
                  />
                  <div
                    className="h-full bg-red-500/80 transition-[width] duration-700"
                    style={{ width: `${((r.attempted - r.correct) / r.attempted) * 100}%` }}
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
        variants={STAGGER_ITEM}
        className="glass-card rounded-2xl border border-terminal-border p-5"
        >
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-white uppercase tracking-wider">
              আজকের রুটিন
              {user?.prepLevel && (
                <span className="ml-2 align-middle text-[10px] normal-case font-mono text-zinc-400 border border-zinc-700 rounded px-1.5 py-0.5">
                  {PREP_LABEL[user.prepLevel]}
                </span>
              )}
            </h3>
            <button
              onClick={() => setActiveTab("study-planner")}
              className="text-xs text-emerald-400 font-mono hover:text-emerald-300 transition-colors flex items-center gap-1"
            >
              প্ল্যানার <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {todaysTasks.length === 0 ? (
            <EmptyState
              icon={ClipboardList}
              title="আজকের জন্য কোনো টাস্ক নেই।"
              hint="প্ল্যানারে গিয়ে আজকের রুটিন তৈরি করুন।"
              action={
                <button
                  onClick={() => setActiveTab("study-planner")}
                  className="px-4 py-2 bg-emerald-500 text-zinc-950 font-mono text-sm rounded-lg hover:bg-emerald-400 transition-colors"
                >
                  রুটিন দেখুন
                </button>
              }
            />
          ) : (
            <div className="space-y-2">
              {todaysTasks.map((t) => (
                <div
                  key={t.id}
                  className={`flex items-center gap-3 p-3 rounded-xl border transition-colors ${
                    t.completed
                      ? "border-emerald-500/20 bg-emerald-500/5"
                      : "border-default bg-subtle"
                  }`}
                >
                  <button
                    onClick={() => void toggleTask(t.id)}
                    aria-pressed={t.completed}
                    aria-label={t.completed ? "চিহ্নিত করা হয়েছে" : "সম্পন্ন হিসেবে চিহ্নিত করুন"}
                    className={`w-5 h-5 rounded-md border flex items-center justify-center flex-shrink-0 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400 ${
                      t.completed
                        ? "bg-emerald-500 border-emerald-500 text-zinc-950"
                        : "border-zinc-600 hover:border-emerald-500"
                    }`}
                  >
                    {t.completed ? <span aria-hidden="true">✓</span> : ""}
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
        variants={STAGGER_ITEM}
        className="glass-card rounded-2xl border border-terminal-border p-5"
        >
            <div className="flex items-center justify-between mb-4 gap-3">
              <div>
                <h3 className="text-sm font-semibold text-white uppercase tracking-wider">
                  সাম্প্রতিক মক পরীক্ষা
                </h3>
                {mockTrend.length > 1 && (
                  <div className="mt-1 w-28 text-emerald-400">
                    <Sparkline values={mockTrend} fillId="mock-trend" />
                  </div>
                )}
              </div>
              <button
              onClick={() => setActiveTab("practice")}
              className="text-xs text-emerald-400 font-mono hover:text-emerald-300 transition-colors flex items-center gap-1"
            >
              মক টেস্ট <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {results.length === 0 ? (
            <EmptyState
              icon={Flag}
              title="এখনো কোনো মক পরীক্ষা দেওয়া হয়নি।"
              hint="প্রথম মক টেস্ট দিলে ফলাফলের প্রবণতা এখানে জমা হবে।"
              action={
                <button
                  onClick={() => setActiveTab("practice")}
                  className="px-4 py-2 bg-emerald-500 text-zinc-950 font-mono text-sm rounded-lg hover:bg-emerald-400 transition-colors"
                >
                  মক টেস্ট শুরু করুন
                </button>
              }
            />
          ) : (
            <div className="space-y-2">
              {results.slice(0, 4).map((r) => (
                <div
                  key={r.id}
                  className="flex items-center gap-3 p-3 rounded-xl border border-default bg-subtle"
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
      <div className="[content-visibility:auto] [contain-intrinsic-size:auto_360px]">
        <DailyQuizWidget />
      </div>

      {/* Flash news */}
      {news.length > 0 && (
        <div className="[content-visibility:auto] [contain-intrinsic-size:auto_300px]">
      <motion.div
        variants={STAGGER_ITEM}
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
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-zinc-300">{item.text}</p>
                  {item.sourceUrl ? (
                    <a
                      href={item.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[11px] text-emerald-400 hover:underline mt-0.5 inline-flex items-center gap-1"
                    >
                      সূত্র ↗
                    </a>
                  ) : null}
                </div>
                <span className="text-xs text-zinc-500 font-mono flex-shrink-0">
                  {item.date}
                </span>
              </div>
            ))}
          </div>
        </motion.div>
        </div>
      )}

      {/* AI suggestion strip — real weakest subject */}
      {weakest.length > 0 && (
      <motion.div
        variants={STAGGER_ITEM}
        className="relative flex items-start gap-3 p-4 bg-gradient-to-r from-emerald-500/[0.08] to-cyan-500/[0.05] border border-emerald-500/20 rounded-2xl overflow-hidden"
        >
          <div className="absolute inset-y-0 left-0 w-0.5 bg-gradient-to-b from-emerald-400 to-cyan-400" aria-hidden="true" />
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500/20 to-cyan-500/10 border border-emerald-500/25 flex items-center justify-center flex-shrink-0">
            <Zap className="w-4.5 h-4.5 text-emerald-400" aria-hidden="true" />
          </div>
          <p className="text-sm text-zinc-300 leading-relaxed">
            <span className="text-emerald-400 font-semibold font-mono">9th-Grade AI:</span> সবচেয়ে দুর্বল বিষয়{" "}
            <span className="text-white font-mono">{weakest[0].name}</span> — এখানে{" "}
            <span className="text-white font-mono">{weakest[0].attempted}টি</span> প্রশ্নের
            সঠিকতা {weakest[0].score}%।
          </p>
        </motion.div>
      )}
    </motion.div>
  );
}