"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  CalendarClock,
  Flame,
  Target,
  ArrowRight,
  Sparkles,
  Trophy,
  ClipboardList,
  Flag,
  BookX,
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
import NextBestAction from "./NextBestAction";
import { deriveNextAction } from "@/lib/dashboard/recommend";
import {
  CountdownClock,
  CountdownRingLive,
  useExamDaysLeft,
  formatDate,
} from "./HomeTabHelpers";

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
  const [pendingMistakes, setPendingMistakes] = useState(0);
  const [mistakeStatsData, setMistakeStatsData] = useState(0);
  const [mistakeSubjectsData, setMistakeSubjectsData] = useState<Server.SubjectMistakeCountDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [s, r, e, t, m, n, w, ms, msub] = await Promise.allSettled([
          api.dashboardStats(),
          api.subjectReports(),
          api.examSchedule(),
          api.studyPlan(),
          api.mockTestResults(),
          api.news(),
          api.wrongAnswers({ limit: 1 }),
          api.mistakeStats(),
          api.mistakeSubjects(),
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
        if (w.status === "fulfilled") setPendingMistakes(w.value.total);
        if (ms.status === "fulfilled") setMistakeStatsData(ms.value.totalMistakes);
        if (msub.status === "fulfilled") setMistakeSubjectsData(msub.value);
        // Surface a total outage instead of silently rendering zeros.
        if ([s, r, e, t, m, n, w].every((p) => p.status === "rejected")) {
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

  const studiedToday = (stats?.activity?.[stats.activity.length - 1]?.answered ?? 0) > 0;
  const examDaysLeft = useExamDaysLeft(nextExam?.date ?? null);

  const nextAction = useMemo(
    () =>
      deriveNextAction({
        weakest: weakest[0] ?? null,
        examTitle: nextExam ? t(lang, nextExam.titleBn, nextExam.titleEn) : null,
        examDaysLeft,
        streak: stats?.streak ?? 0,
        studiedToday,
        pendingMistakes,
      }),
    [weakest, nextExam, examDaysLeft, stats?.streak, studiedToday, pendingMistakes, lang],
  );

  // 7-day activity reflects ALL attempts (matches the server-authoritative
  // streak), not just mock tests — so the heatmap and streak number agree.
  const activityDays = useMemo(
    () =>
      (stats?.activity ?? Array.from({ length: 7 }, () => ({ answered: 0 }))).map(
        (a) => (a?.answered ?? 0) > 0,
      ),
    [stats],
  );

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
      className="space-y-6 pb-24 sm:pb-6"
    >
      {/* Welcome — premium header with subtle top accent */}
      <motion.div variants={STAGGER_ITEM} className="rounded-2xl border p-5 sm:p-6 overflow-hidden relative" style={{ background: "var(--dashboard-surface)", borderColor: "var(--dashboard-border-muted)", boxShadow: "var(--dashboard-shadow-sm)" }}>
        <div className="absolute inset-x-0 top-0 h-[3px]" style={{ background: "linear-gradient(90deg, var(--dashboard-primary), var(--dashboard-info), var(--dashboard-primary))" }} aria-hidden="true" />
        <div className="absolute -top-24 -right-24 w-72 h-72 rounded-full blur-3xl opacity-[0.06]" style={{ background: "radial-gradient(circle, var(--dashboard-primary) 0%, transparent 70%)" }} aria-hidden="true" />
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.14em]" style={{ color: "var(--dashboard-primary)" }}>
              স্বাগতম
            </p>
            <h1 className="font-display text-[22px] sm:text-[26px] font-bold leading-tight mt-1.5 text-balance" style={{ color: "var(--dashboard-text-primary)" }}>
              {user?.name ? `হ্যালো, ${user.name}` : "হ্যালো, শিক্ষার্থী"}
            </h1>
            <p className="text-sm mt-1.5" style={{ color: "var(--dashboard-text-secondary)" }}>
              {user?.examTarget ? `${user.examTarget} প্রস্তুতি` : "আপনার লক্ষ্য নির্ধারণ করুন"} {nextExam ? `• ${t(lang, nextExam.titleBn, nextExam.titleEn)}` : ""}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-semibold shadow-sm" style={{ background: "var(--dashboard-primary-subtle)", borderColor: "color-mix(in srgb, var(--dashboard-primary) 18%, var(--dashboard-border-muted))", color: "var(--dashboard-primary)" }}>
              <Target className="w-3.5 h-3.5" />
              {nextExam ? t(lang, nextExam.titleBn, nextExam.titleEn) : "কোনো আসন্ন পরীক্ষা নেই"}
            </span>
            <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-semibold shadow-sm" style={{ background: "var(--dashboard-warning-subtle)", borderColor: "color-mix(in srgb, var(--dashboard-warning) 18%, var(--dashboard-border-muted))", color: "var(--dashboard-warning)" }}>
              <Flame className="w-3.5 h-3.5" />
              <span>{stats?.streak ?? 0} দিন স্ট্রিক</span>
              <StreakHeatmap activeDays={activityDays} labels={WEEKDAY_LABELS_7} />
            </span>
          </div>
        </div>
      </motion.div>

      {/* Next best action — the single most useful thing to do right now */}
      <NextBestAction action={nextAction} />

      {/* Countdown hero — premium with indigo wash */}
      <motion.div
        variants={STAGGER_ITEM}
        className="rounded-2xl border p-6 md:p-7 relative overflow-hidden"
        style={{ background: "var(--dashboard-surface)", borderColor: "var(--dashboard-border-muted)", boxShadow: "var(--dashboard-shadow-sm)" }}
      >
        <div className="absolute inset-0 opacity-[0.035]" style={{ background: "radial-gradient(ellipse 600px 300px at 85% -10%, var(--dashboard-primary) 0%, transparent 60%), radial-gradient(ellipse 500px 280px at -10% 100%, var(--dashboard-info) 0%, transparent 62%)" }} aria-hidden="true" />
        <div className="absolute inset-x-0 top-0 h-px" style={{ background: "linear-gradient(90deg, transparent, var(--dashboard-border-muted), transparent)" }} aria-hidden="true" />
        {nextExam ? (
          <div className="relative flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl flex items-center justify-center border" style={{ background: "var(--dashboard-primary-subtle)", borderColor: "color-mix(in srgb, var(--dashboard-primary) 18%, transparent)", color: "var(--dashboard-primary)" }}>
                <CalendarClock className="w-6 h-6" />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: "var(--dashboard-text-muted)" }}>পরবর্তী পরীক্ষা</p>
                <h3 className="text-xl md:text-2xl font-bold" style={{ color: "var(--dashboard-text-primary)" }}>{t(lang, nextExam.titleBn, nextExam.titleEn)}</h3>
                <p className="text-sm mt-1" style={{ color: "var(--dashboard-text-secondary)" }}>{formatDate(nextExam.date)}</p>
                {nextExam.note ? (
                  <p className="text-xs mt-1 max-w-md" style={{ color: "var(--dashboard-text-muted)" }}>{nextExam.note}</p>
                ) : null}
                {nextExam.sourceUrl ? (
                  <a
                    href={nextExam.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs hover:underline mt-1 inline-flex items-center gap-1 font-medium"
                    style={{ color: "var(--dashboard-primary)" }}
                  >
                    সূত্র ↗
                  </a>
                ) : null}
              </div>
            </div>
            <div className="flex items-center gap-4">
              <CountdownRingLive target={nextExam.date} />
              <div className="flex flex-col">
                <span className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: "var(--dashboard-text-muted)" }}>Countdown</span>
                <span style={{ color: "var(--dashboard-primary)" }}><CountdownClock target={nextExam.date} /></span>
              </div>
            </div>
          </div>
        ) : (
          <div className="relative flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div>
              <p className="text-sm" style={{ color: "var(--dashboard-text-secondary)" }}>কোনো আসন্ন পরীক্ষার সময়সূচি নেই</p>
              <h3 className="text-lg font-semibold mt-1" style={{ color: "var(--dashboard-text-primary)" }}>সিলেবাস থেকে প্রস্তুতি শুরু করুন</h3>
            </div>
            <button
              onClick={() => setActiveTab("question-bank")}
              className="px-4 py-2.5 text-sm rounded-xl font-semibold transition-colors flex items-center gap-2 shadow-sm"
              style={{ background: "var(--dashboard-primary)", color: "var(--dashboard-text-inverse)" }}
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
          className="rounded-2xl border p-8 text-center" style={{ background: "var(--dashboard-surface)", borderColor: "var(--dashboard-danger)" }}
        >
          <p className="text-sm font-medium" style={{ color: "var(--dashboard-text-primary)" }}>ড্যাশবোর্ড ডেটা লোড করা যায়নি</p>
          <p className="mt-1 text-xs" style={{ color: "var(--dashboard-text-muted)" }}>
            ইন্টারনেট সংযোগ পরীক্ষা করে আবার চেষ্টা করুন।
          </p>
          <button
            onClick={retryLoad}
            className="mt-4 px-4 py-2 font-semibold text-sm rounded-lg transition-colors"
            style={{ background: "var(--dashboard-primary)", color: "var(--dashboard-text-inverse)" }}
          >
            আবার চেষ্টা করুন
          </button>
        </div>
      )}

      {/* Weak areas — real subject reports */}
      <motion.div
        variants={STAGGER_ITEM}
        className="rounded-2xl border p-5" style={{ background: "var(--dashboard-surface)", borderColor: "var(--dashboard-border-muted)", boxShadow: "var(--dashboard-shadow-sm)" }}
      >
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wider" style={{ color: "var(--dashboard-text-primary)" }}>
              দুর্বল বিষয়সমূহ
            </h3>
            <p className="text-xs mt-0.5" style={{ color: "var(--dashboard-text-muted)" }}>বাস্তব পারফরম্যান্স অনুযায়ী — দুর্বল থেকে শক্তিশালী</p>
          </div>
          <button
            onClick={() => setActiveTab("practice")}
            className="text-xs font-semibold transition-colors flex items-center gap-1"
            style={{ color: "var(--dashboard-primary)" }}
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
                  className="px-4 py-2 font-semibold text-sm rounded-lg transition-colors"
                  style={{ background: "var(--dashboard-primary)", color: "var(--dashboard-text-inverse)" }}
                >
                  প্র্যাকটিস শুরু করুন
              </button>
            }
          />
        ) : (
          <div className="space-y-3">
            {weakest.map((r) => (
              <div key={r.name} className="flex items-center gap-4">
                <div className="w-32 flex-shrink-0 sm:w-44">
                  <p className="text-sm truncate" style={{ color: "var(--dashboard-text-primary)" }}>{r.name}</p>
                  <p className="text-[10px]" style={{ color: "var(--dashboard-text-muted)" }}>{r.attempted}টি সমাধান</p>
                </div>
                <div className="flex-1 h-2 rounded-full overflow-hidden flex" style={{ background: "var(--dashboard-surface-muted)" }}>
                  <div
                    className="h-full transition-[width] duration-700"
                    style={{ width: `${(r.correct / r.attempted) * 100}%`, background: "var(--dashboard-success)" }}
                  />
                  <div
                    className="h-full transition-[width] duration-700"
                    style={{ width: `${((r.attempted - r.correct) / r.attempted) * 100}%`, background: "var(--dashboard-danger)" }}
                  />
                </div>
                <span className="w-12 text-right text-sm font-mono" style={{ color: "var(--dashboard-success)" }}>
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
        className="rounded-2xl border p-5" style={{ background: "var(--dashboard-surface)", borderColor: "var(--dashboard-border-muted)", boxShadow: "var(--dashboard-shadow-sm)" }}
        >
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold uppercase tracking-wider" style={{ color: "var(--dashboard-text-primary)" }}>
              আজকের রুটিন
              {user?.prepLevel && (
                <span className="ml-2 align-middle text-[10px] normal-case font-mono text-[var(--dashboard-text-muted)] border border-[var(--border-strong)] rounded px-1.5 py-0.5">
                  {PREP_LABEL[user.prepLevel]}
                </span>
              )}
            </h3>
            <button
              onClick={() => setActiveTab("study-planner")}
              className="text-xs font-semibold transition-colors flex items-center gap-1"
              style={{ color: "var(--dashboard-primary)" }}
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
                  className="px-4 py-2 font-semibold text-sm rounded-lg transition-colors"
                  style={{ background: "var(--dashboard-primary)", color: "var(--dashboard-text-inverse)" }}
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
                      ? "border-[color-mix(in_srgb,var(--dashboard-success)_20%,transparent)]"
                      : ""
                  }`}
                  style={{ background: t.completed ? "var(--dashboard-success-subtle)" : "var(--dashboard-surface-muted)", borderColor: t.completed ? undefined : "var(--dashboard-border-muted)" }}
                  >
                  <button
                    onClick={() => void toggleTask(t.id)}
                    aria-pressed={t.completed}
                    aria-label={t.completed ? "চিহ্নিত করা হয়েছে" : "সম্পন্ন হিসেবে চিহ্নিত করুন"}
                    className="w-5 h-5 rounded-md border flex items-center justify-center flex-shrink-0 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2"
                    style={{
                      background: t.completed ? "var(--dashboard-success)" : "transparent",
                      borderColor: t.completed ? "var(--dashboard-success)" : "var(--dashboard-border-strong)",
                      color: t.completed ? "var(--dashboard-text-inverse)" : "transparent",
                    }}
                  >
                    {t.completed ? <span aria-hidden="true">✓</span> : ""}
                  </button>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm" style={{ color: t.completed ? "var(--dashboard-text-muted)" : "var(--dashboard-text-primary)", textDecoration: t.completed ? "line-through" : "none" }}>
                      {t.title}
                    </p>
                    <p className="text-[10px] font-mono mt-0.5" style={{ color: "var(--dashboard-text-muted)" }}>
                      {t.subject} • {t.duration} মিনিট
                    </p>
                  </div>
                  <span
                    className="text-[10px] font-mono px-2 py-0.5 rounded"
                    style={{
                      background: t.priority === "high" ? "var(--dashboard-danger-subtle)" : t.priority === "medium" ? "var(--dashboard-warning-subtle)" : "var(--dashboard-surface-muted)",
                      color: t.priority === "high" ? "var(--dashboard-danger)" : t.priority === "medium" ? "var(--dashboard-warning)" : "var(--dashboard-text-muted)",
                    }}
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
        className="rounded-2xl border p-5" style={{ background: "var(--dashboard-surface)", borderColor: "var(--dashboard-border-muted)", boxShadow: "var(--dashboard-shadow-sm)" }}
        >
            <div className="flex items-center justify-between mb-4 gap-3">
              <div>
                <h3 className="text-sm font-semibold uppercase tracking-wider" style={{ color: "var(--dashboard-text-primary)" }}>
                  সাম্প্রতিক মক পরীক্ষা
                </h3>
                {mockTrend.length > 1 && (
                  <div className="mt-1 w-28" style={{ color: "var(--dashboard-primary)" }}>
                    <Sparkline
                      values={mockTrend}
                      fillId="mock-trend"
                      ariaLabel="সাম্প্রতিক মক পরীক্ষার স্কোর ট্রেন্ড"
                    />
                  </div>
                )}
              </div>
              <button
              onClick={() => setActiveTab("practice")}
              className="text-xs font-semibold transition-colors flex items-center gap-1"
              style={{ color: "var(--dashboard-primary)" }}
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
                  className="px-4 py-2 font-semibold text-sm rounded-lg transition-colors"
                  style={{ background: "var(--dashboard-primary)", color: "var(--dashboard-text-inverse)" }}
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
                    className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                    style={{
                      background: r.score >= 80 ? "var(--dashboard-success-subtle)" : r.score >= 50 ? "var(--dashboard-warning-subtle)" : "var(--dashboard-danger-subtle)",
                      color: r.score >= 80 ? "var(--dashboard-success)" : r.score >= 50 ? "var(--dashboard-warning)" : "var(--dashboard-danger)",
                    }}
                  >
                    <Trophy className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm truncate" style={{ color: "var(--dashboard-text-primary)" }}>{r.title}</p>
                    <p className="text-[10px] font-mono mt-0.5" style={{ color: "var(--dashboard-text-muted)" }}>
                      {r.correct}/{r.total} সঠিক •{" "}
                      {new Date(r.createdAt).toLocaleDateString("bn-BD", {
                        day: "numeric",
                        month: "short",
                      })}
                    </p>
                  </div>
                  <span className="text-sm font-mono" style={{ color: "var(--dashboard-success)" }}>{r.score}%</span>
                </div>
              ))}
            </div>
          )}
        </motion.div>
      </div>

      {/* Weak spots / mistakes */}
      {mistakeStatsData > 0 && (
        <div className="[content-visibility:auto] [contain-intrinsic-size:auto_260px]">
          <motion.div
            variants={STAGGER_ITEM}
            className="rounded-2xl border overflow-hidden" style={{ background: "var(--dashboard-surface)", borderColor: "var(--dashboard-border-muted)", boxShadow: "var(--dashboard-shadow-sm)" }}
          >
            <div className="px-5 py-4 border-b flex items-center justify-between" style={{ borderColor: "var(--dashboard-border-muted)" }}>
              <div className="flex items-center gap-2">
                <BookX className="w-4 h-4" style={{ color: "var(--dashboard-danger)" }} />
                <h3 className="text-sm font-semibold uppercase tracking-wider" style={{ color: "var(--dashboard-text-primary)" }}>
                  Your Weak Spots
                </h3>
              </div>
              <button
                onClick={() => setActiveTab("mistakes")}
                className="text-xs font-semibold transition-colors flex items-center gap-1"
                style={{ color: "var(--dashboard-primary)" }}
              >
                Practice Mistakes <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="p-4">
              <p className="text-sm font-mono mb-3" style={{ color: "var(--dashboard-text-primary)" }}>
                {mistakeStatsData} question{mistakeStatsData !== 1 ? "s" : ""} need attention
              </p>
              <div className="space-y-2">
                {mistakeSubjectsData.slice(0, 3).map((s) => (
                  <button
                    key={s.subject}
                    onClick={() => setActiveTab("mistakes")}
                    className="w-full flex items-center justify-between p-2.5 rounded-lg border transition-colors text-left"
                    style={{ borderColor: "var(--dashboard-border-muted)" }}
                  >
                    <span className="text-sm font-mono truncate" style={{ color: "var(--dashboard-text-primary)" }}>{s.subject}</span>
                    <span className="text-xs font-mono shrink-0 ml-2" style={{ color: "var(--dashboard-danger)" }}>
                      {s.unmastered} unresolved
                    </span>
                  </button>
                ))}
              </div>
              <p className="text-[11px] font-mono mt-3" style={{ color: "var(--dashboard-text-muted)" }}>
                You&apos;re improving — every practice brings you closer to mastery.
              </p>
            </div>
          </motion.div>
        </div>
      )}

      {/* Daily quiz */}
      <div className="[content-visibility:auto] [contain-intrinsic-size:auto_360px]">
        <DailyQuizWidget />
      </div>

      {/* Flash news */}
      {news.length > 0 && (
        <div className="[content-visibility:auto] [contain-intrinsic-size:auto_300px]">
      <motion.div
        variants={STAGGER_ITEM}
        className="rounded-2xl border overflow-hidden" style={{ background: "var(--dashboard-surface)", borderColor: "var(--dashboard-border-muted)", boxShadow: "var(--dashboard-shadow-sm)" }}
        >
          <div className="px-5 py-4 border-b flex items-center gap-2" style={{ borderColor: "var(--dashboard-border-muted)" }}>
            <Sparkles className="w-4 h-4" style={{ color: "var(--dashboard-primary)" }} />
            <h3 className="text-sm font-semibold uppercase tracking-wider" style={{ color: "var(--dashboard-text-primary)" }}>
              ফ্ল্যাশ নিউজ
            </h3>
          </div>
          <div className="divide-y" style={{ borderColor: "var(--dashboard-border-muted)" }}>
            {news.slice(0, 5).map((item) => (
              <div key={item.id} className="flex items-start gap-3 p-4 transition-colors">
                <span className="px-1.5 py-0.5 rounded text-[10px] font-mono flex-shrink-0 mt-0.5" style={{ background: "var(--dashboard-primary-subtle)", border: "1px solid color-mix(in srgb, var(--dashboard-primary) 20%, transparent)", color: "var(--dashboard-primary)" }}>
                  {item.tag}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm" style={{ color: "var(--dashboard-text-secondary)" }}>{item.text}</p>
                  {item.sourceUrl ? (
                    <a
                      href={item.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[11px] hover:underline mt-0.5 inline-flex items-center gap-1"
                      style={{ color: "var(--dashboard-primary)" }}
                    >
                      সূত্র ↗
                    </a>
                  ) : null}
                </div>
                <span className="text-xs font-mono flex-shrink-0" style={{ color: "var(--dashboard-text-muted)" }}>
                  {item.date}
                </span>
              </div>
            ))}
          </div>
        </motion.div>
        </div>
      )}

      {/* AI suggestion strip removed — superseded by the NextBestAction hero,
          which is also driven by the real weakest subject but is actionable. */}
    </motion.div>
  );
}