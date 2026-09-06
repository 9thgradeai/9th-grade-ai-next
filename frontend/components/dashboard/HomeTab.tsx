"use client";

import { useEffect, useMemo, useState, useRef, useCallback } from "react";
import { motion } from "framer-motion";
import { Clock, ArrowRight, Trophy, BookX, Brain, Flame, Target, ClipboardCheck, Sparkles, ChevronRight, Activity, Command, RefreshCw } from "lucide-react";
import { useAuth } from "@/lib/auth-ctx";
import { useDashboardStore } from "@/lib/store-ctx/dashboard";
import { useLanguage, t } from "@/lib/lang-ctx";
import { useToastSafe } from "@/lib/toast-ctx";
import { api } from "@/lib/services/api";
import type { Server } from "@/lib/types";
import StreakHeatmap from "./StreakHeatmap";
import HomeCoach from "./ai/HomeCoach";
import { deriveNextAction } from "@/lib/dashboard/recommend";
import { useExamDaysLeft } from "./HomeTabHelpers";
import PreparationScoreCard from "./command-center/PreparationScoreCard";
import AIRecommendationCard from "./command-center/AIRecommendationCard";
import PerformanceCard from "./command-center/PerformanceCard";
import SubjectMastery from "./command-center/SubjectMastery";
import FocusAreasCard from "./command-center/FocusAreasCard";
import AITutorCard from "./command-center/AITutorCard";
import TodayPlanCard from "./command-center/TodayPlanCard";
import QuickActions from "./command-center/QuickActions";
import ExamCountdownCard from "./command-center/ExamCountdownCard";
import { launchAI } from "@/lib/ai-launcher";

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const WEEKDAY_SHORT_BN = ["শনি", "রবি", "সোম", "মঙ্গল", "বুধ", "বৃহ", "শুক্র"];

function lastSevenDayLabels(): string[] {
  const today = new Date().getDay();
  const out: string[] = [];
  for (let i = 6; i >= 0; i--) out.push(WEEKDAY_SHORT_BN[(today - i + 7) % 7]);
  return out;
}
const WEEKDAY_LABELS_7 = lastSevenDayLabels();

const STAGGER = { hidden: {}, show: { transition: { staggerChildren: 0.05, delayChildren: 0.03 } } };
const STAGGER_ITEM = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { type: "spring" as const, stiffness: 280, damping: 28 } },
};

function timeGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

export default function HomeTab() {
  const { user } = useAuth();
  const { setActiveTab, setPracticeIntent, setMistakeIntent, setQuestionBankFilters } = useDashboardStore();
  const { lang } = useLanguage();
  const toast = useToastSafe();
  const coachRef = useRef<HTMLDivElement>(null);

  const [stats, setStats] = useState<Server.DashboardStatsDTO | null>(null);
  const [reports, setReports] = useState<Array<{ name: string; score: number; attempted: number; correct: number }>>([]);
  const [nextExam, setNextExam] = useState<Server.ExamScheduleDTO | null>(null);
  const [tasks, setTasks] = useState<Server.StudyTaskDTO[]>([]);
  const [results, setResults] = useState<Server.MockTestResultDTO[]>([]);
  const [pendingMistakes, setPendingMistakes] = useState(0);
  const [mistakeStatsData, setMistakeStatsData] = useState(0);
  const [mistakeSubjectsData, setMistakeSubjectsData] = useState<Server.SubjectMistakeCountDTO[]>([]);
  const [weakTopics, setWeakTopics] = useState<Server.WeakTopicDTO[]>([]);
  const [dailyQuiz, setDailyQuiz] = useState<Server.DailyQuizDTO | null>(null);
  const [flashcardsDue, setFlashcardsDue] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [perfRange, setPerfRange] = useState<"7D" | "30D" | "ALL">("7D");
  const [perfStats, setPerfStats] = useState<Server.DashboardStatsDTO | null>(null);
  const [perfLoading, setPerfLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [s, r, e, t, m, w, ms, msub, wt, dq, fc] = await Promise.allSettled([
          api.dashboardStats(),
          api.subjectReports(),
          api.examSchedule(),
          api.studyPlan(),
          api.mockTestResults(),
          api.wrongAnswers({ limit: 1 }),
          api.mistakeStats(),
          api.mistakeSubjects(),
          api.weakTopics(),
          api.dailyQuiz(),
          api.flashcards().then((list) => list.length).catch(() => 0),
        ]);
        if (cancelled) return;
        if (s.status === "fulfilled") {
          setStats(s.value);
          setPerfStats(s.value);
        }
        if (r.status === "fulfilled") setReports(r.value);
        if (e.status === "fulfilled") {
          const upcoming =
            e.value
              .filter((ex) => new Date(ex.date).getTime() > Date.now())
              .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())[0] ?? null;
          setNextExam(upcoming);
        }
        if (t.status === "fulfilled") setTasks(t.value);
        if (m.status === "fulfilled") setResults(m.value);
        if (w.status === "fulfilled") setPendingMistakes(w.value.total);
        if (ms.status === "fulfilled") setMistakeStatsData(ms.value.totalMistakes);
        if (msub.status === "fulfilled") setMistakeSubjectsData(msub.value);
        if (wt.status === "fulfilled") setWeakTopics(wt.value.slice(0, 4));
        if (dq.status === "fulfilled") setDailyQuiz(dq.value);
        if (fc.status === "fulfilled") setFlashcardsDue(fc.value as number);
        if ([s, r, e, t, m, w].every((p) => p.status === "rejected")) setLoadFailed(true);
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

  // Performance range API fetch
  useEffect(() => {
    if (perfRange === "7D") {
      queueMicrotask(() => setPerfStats(stats));
      return;
    }
    let cancelled = false;
    const days = perfRange === "30D" ? 30 : 365;
    queueMicrotask(() => setPerfLoading(true));
    void api
      .dashboardStats(days)
      .then((v) => {
        if (!cancelled) setPerfStats(v);
      })
      .catch(() => {
        /* keep previous */
      })
      .finally(() => {
        if (!cancelled) setPerfLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [perfRange, stats]);

  // Streak celebration trigger
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

  useEffect(() => {
    const onRefresh = () => {
      setLoading(true);
      setLoadFailed(false);
      setReloadKey((k) => k + 1);
    };
    window.addEventListener("ai:refresh-home", onRefresh);
    return () => window.removeEventListener("ai:refresh-home", onRefresh);
  }, []);

  const weakest = useMemo(
    () => [...reports].filter((r) => r.attempted > 0).sort((a, b) => a.score - b.score).slice(0, 5),
    [reports]
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
    [weakest, nextExam, examDaysLeft, stats?.streak, studiedToday, pendingMistakes, lang]
  );
  const activityDays = useMemo(
    () => (stats?.activity ?? Array.from({ length: 7 }, () => ({ answered: 0 }))).map((a) => (a?.answered ?? 0) > 0),
    [stats]
  );

  const toggleTask = async (taskId: number) => {
    setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, completed: !t.completed } : t)));
    try {
      await api.toggleStudyTask(taskId);
    } catch {
      setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, completed: !t.completed } : t)));
      toast.error("কাজ আপডেট করা যায়নি — আবার চেষ্টা করুন");
    }
  };

  const practiceSubject = (subject: string) => {
    setPracticeIntent({ subject, mode: "quick" });
    setQuestionBankFilters({ category: subject });
    setActiveTab("practice");
  };

  const mistakeSubject = (subject?: string) => {
    if (subject) setMistakeIntent({ subject });
    else setMistakeIntent(null);
    setActiveTab("mistakes");
  };

  const focusIntent = weakest[0]?.name ?? null;

  const handleAIRecommendationFocus = () => {
    if (focusIntent && weakest[0] && weakest[0].score < 75) {
      practiceSubject(focusIntent);
    } else if (pendingMistakes > 0) {
      mistakeSubject(focusIntent ?? undefined);
    } else {
      setActiveTab("practice");
    }
  };

  const handleAskTutor = useCallback(() => {
    // Open the floating AI Workspace tutor modal from anywhere in the dashboard.
    launchAI({ mode: "tutor" });
  }, []);

  const handleGuidedSession = () => {
    if (focusIntent) practiceSubject(focusIntent);
    else setActiveTab("practice");
  };

  // Keyboard Shortcuts Listener [P, M, W, A, F, Q, L, R]
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        (e.target instanceof HTMLElement && e.target.isContentEditable)
      ) {
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      const key = e.key.toUpperCase();
      if (key === "P") {
        setPracticeIntent({ mode: "quick" });
        setActiveTab("practice");
      } else if (key === "M") {
        setPracticeIntent({ mode: "mock" });
        setActiveTab("practice");
      } else if (key === "W") {
        setActiveTab("mistakes");
      } else if (key === "A") {
        handleAskTutor();
      } else if (key === "F") {
        setActiveTab("flashcards");
      } else if (key === "Q") {
        setActiveTab("question-bank");
      } else if (key === "L") {
        setActiveTab("study-planner");
      } else if (key === "R") {
        setReloadKey((k) => k + 1);
        toast.success("Home tab data refreshed");
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [setActiveTab, setPracticeIntent, toast, handleAskTutor]);

  const skeleton = loading && !stats;
  const prepScore = useMemo(() => {
    if (!stats) return 0;
    const acc = stats.accuracy ?? 0;
    const comp = stats.completion ?? 0;
    const streakBonus = Math.min(12, (stats.streak ?? 0) * 1.5);
    return Math.max(0, Math.min(100, Math.round(acc * 0.55 + comp * 0.35 + streakBonus)));
  }, [stats]);

  if (loadFailed && !skeleton) {
    return (
      <div
        role="alert"
        className="rounded-2xl border p-8 text-center command-card"
        style={{ borderColor: "var(--dashboard-danger)" }}
      >
        <p className="text-sm font-bold" style={{ color: "var(--dashboard-text-primary)" }}>
          ড্যাশবোর্ড ডেটা লোড করা যায়নি
        </p>
        <p className="mt-1 text-xs" style={{ color: "var(--dashboard-text-muted)" }}>
          ইন্টারনেট সংযোগ পরীক্ষা করে আবার চেষ্টা করুন।
        </p>
        <button
          onClick={() => {
            setLoading(true);
            setLoadFailed(false);
            setReloadKey((k) => k + 1);
          }}
          className="command-primary-btn mt-4"
        >
          <RefreshCw className="w-4 h-4" /> আবার চেষ্টা করুন
        </button>
      </div>
    );
  }

  return (
    <motion.div variants={STAGGER} initial="hidden" animate="show" className="space-y-5 pb-24 sm:pb-6">
      {/* ── Futuristic AI Command Header Bar ── */}
      <motion.div variants={STAGGER_ITEM} className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span
              className="text-[10px] font-mono font-bold tracking-widest uppercase px-2.5 py-0.5 rounded-full border flex items-center gap-1.5"
              style={{ background: "var(--dashboard-primary-subtle)", borderColor: "color-mix(in srgb, var(--dashboard-primary) 24%, transparent)", color: "var(--dashboard-primary)" }}
            >
              <span className="w-1.5 h-1.5 rounded-full status-dot-pulse" style={{ background: "var(--dashboard-success)" }} />
              AI Neural Engine Active
            </span>
            <span className="text-[10px] font-mono text-[var(--dashboard-text-muted)] hidden sm:inline">
              v0.4.0 • Real-time Sync
            </span>
          </div>

          <h1 className="font-display font-black text-[26px] sm:text-[32px] leading-none tracking-tight mt-2" style={{ color: "var(--dashboard-text-primary)" }}>
            {timeGreeting()}, <span style={{ color: "var(--dashboard-primary)" }}>{user?.name ?? "Scholar"}</span> —
          </h1>

          <p className="text-sm mt-2 flex flex-wrap items-center gap-2" style={{ color: "var(--dashboard-text-secondary)" }}>
            <span className="inline-flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-[var(--dashboard-primary)]" /> {user?.examTarget ?? "Target not set"}{" "}
              {nextExam ? `· ${t(lang, nextExam.titleBn, nextExam.titleEn)}` : ""}
            </span>
            <span
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-bold"
              style={{
                background: "var(--dashboard-warning-subtle)",
                borderColor: "color-mix(in srgb, var(--dashboard-warning) 20%, transparent)",
                color: "var(--dashboard-warning)",
              }}
            >
              <Flame className="w-3.5 h-3.5 fill-current" />
              {stats?.streak ?? 0} Day Streak
              <span className="hidden sm:inline-flex ml-1">
                <StreakHeatmap activeDays={activityDays} labels={WEEKDAY_LABELS_7} />
              </span>
            </span>
          </p>
        </div>

        {/* Header Right: Target Countdown Pill */}
        {nextExam && examDaysLeft != null && (
          <div
            className="shrink-0 rounded-2xl border px-4 py-3 flex items-center gap-4 shadow-sm"
            style={{ background: "var(--dashboard-surface)", borderColor: "var(--dashboard-border-muted)" }}
          >
            <div className="text-center">
              <p className="font-display font-black text-2xl leading-none text-[var(--dashboard-primary)]">{examDaysLeft}</p>
              <p className="text-[10px] font-bold uppercase tracking-widest mt-0.5 text-[var(--dashboard-text-muted)]">Days left</p>
            </div>
            <div className="w-px h-10 bg-[var(--dashboard-border-muted)]" />
            <div>
              <p className="text-xs font-extrabold leading-tight text-[var(--dashboard-text-primary)]">
                {t(lang, nextExam.titleBn, nextExam.titleEn)}
              </p>
              <p className="text-[11px] text-[var(--dashboard-text-muted)] mt-0.5">
                {examDaysLeft <= 7 ? "⚡ Final Sprint Phase" : examDaysLeft <= 30 ? "🎯 Focused Revision Window" : "📚 Steady Preparation Window"}
              </p>
            </div>
          </div>
        )}
      </motion.div>

      {/* ── Primary AI Command Grid ── */}
      <div className="grid lg:grid-cols-[1.15fr_0.85fr] gap-5">
        <motion.div variants={STAGGER_ITEM}>
          <PreparationScoreCard
            score={skeleton ? 0 : prepScore}
            accuracy={stats?.accuracy ?? 0}
            streak={stats?.streak ?? 0}
            solved={stats?.questionsAnswered ?? 0}
            rank={stats?.rank ?? null}
          />
        </motion.div>
        <motion.div variants={STAGGER_ITEM}>
          <AIRecommendationCard
            weakestName={weakest[0]?.name ?? null}
            weakestScore={weakest[0]?.score ?? null}
            weakestAttempts={weakest[0]?.attempted ?? null}
            pendingMistakes={pendingMistakes}
            onStartFocus={handleAIRecommendationFocus}
            onBrowse={() => setActiveTab("practice")}
            onAskCoach={handleAskTutor}
          />
        </motion.div>
      </div>

      {/* ── HUD Quick Actions Dock ── */}
      <motion.div variants={STAGGER_ITEM}>
        <QuickActions pendingMistakes={pendingMistakes} flashcardsDue={flashcardsDue} />
      </motion.div>

      {/* ── Next Best Action Banner ── */}
      <motion.div
        variants={STAGGER_ITEM}
        className="rounded-2xl border p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm"
        style={{
          background: nextAction.intensity === "high" ? "var(--dashboard-primary)" : "var(--dashboard-surface)",
          borderColor: nextAction.intensity === "high" ? "var(--dashboard-primary)" : "var(--dashboard-border-muted)",
          color: nextAction.intensity === "high" ? "var(--dashboard-text-inverse)" : "var(--dashboard-text-primary)",
        }}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
            style={{
              background: nextAction.intensity === "high" ? "var(--dashboard-text-inverse)" : "var(--dashboard-primary-subtle)",
              color: nextAction.intensity === "high" ? "var(--dashboard-primary)" : "var(--dashboard-primary)",
            }}
          >
            <Activity className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-widest opacity-80">Next Best Action</p>
            <p className="font-bold text-[14px] mt-0.5">
              {nextAction.title} — <span className="font-normal opacity-85">{nextAction.description}</span>
            </p>
          </div>
        </div>

        <button
          onClick={() => setActiveTab(nextAction.tab)}
          className="shrink-0 inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-extrabold shadow-sm transition-transform active:scale-95"
          style={
            nextAction.intensity === "high"
              ? { background: "var(--dashboard-text-inverse)", color: "var(--dashboard-primary)" }
              : { background: "var(--dashboard-primary)", color: "var(--dashboard-text-inverse)" }
          }
        >
          {nextAction.cta} <ArrowRight className="w-4 h-4" />
        </button>
      </motion.div>

      {/* ── Interactive AI Study Coach ── */}
      <motion.div ref={coachRef as unknown as React.RefObject<HTMLDivElement>} variants={STAGGER_ITEM} id="dashboard-ai-coach">
        <HomeCoach />
      </motion.div>

      {/* ── Performance Velocity Chart + Today's Plan ── */}
      <div className="grid lg:grid-cols-[1.4fr_0.85fr] gap-5">
        <motion.div variants={STAGGER_ITEM}>
          <PerformanceCard
            activity={perfStats?.activity ?? stats?.activity ?? []}
            results={results}
            range={perfRange}
            onRangeChange={setPerfRange}
            loading={perfLoading}
          />
        </motion.div>
        <motion.div variants={STAGGER_ITEM}>
          <TodayPlanCard tasks={todaysTasks} onToggle={toggleTask} onTaskAdded={() => setReloadKey((k) => k + 1)} />
        </motion.div>
      </div>

      {/* ── Subject Mastery Grid ── */}
      <motion.div variants={STAGGER_ITEM}>
        <SubjectMastery reports={reports} onPractice={practiceSubject} />
      </motion.div>

      {/* ── Focus Areas + AI Tutor Cards ── */}
      <div className="grid lg:grid-cols-2 gap-5">
        <motion.div variants={STAGGER_ITEM}>
          <FocusAreasCard reports={reports} onPractice={practiceSubject} onOpenMistakes={mistakeSubject} />
        </motion.div>
        <motion.div variants={STAGGER_ITEM}>
          <AITutorCard weakestName={weakest[0]?.name ?? null} onAsk={handleAskTutor} onGuided={handleGuidedSession} />
        </motion.div>
      </div>

      {/* ── Action Hub Row: Daily Quiz / Weak Topics / Flashcards ── */}
      <div className="grid lg:grid-cols-3 gap-5">
        {/* Daily Quiz Widget */}
        <motion.div variants={STAGGER_ITEM} className="command-card p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span
                className="w-7 h-7 rounded-lg flex items-center justify-center border shadow-sm"
                style={{ background: "var(--dashboard-info-subtle)", color: "var(--dashboard-info)", borderColor: "color-mix(in srgb, var(--dashboard-info) 20%, transparent)" }}
              >
                <Target className="w-4 h-4" />
              </span>
              <p className="command-eyebrow !text-[10px]">Daily AI Challenge</p>
              {dailyQuiz && (
                <span
                  className="ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full"
                  style={{
                    background: dailyQuiz.completed ? "var(--dashboard-success-subtle)" : "var(--dashboard-warning-subtle)",
                    color: dailyQuiz.completed ? "var(--dashboard-success)" : "var(--dashboard-warning)",
                  }}
                >
                  {dailyQuiz.completed ? "Completed" : "Ready"}
                </span>
              )}
            </div>

            {!dailyQuiz ? (
              <p className="mt-4 text-sm" style={{ color: "var(--dashboard-text-muted)" }}>
                Daily quiz is being generated — check back shortly.
              </p>
            ) : dailyQuiz.completed ? (
              <>
                <p className="mt-3 text-sm font-bold" style={{ color: "var(--dashboard-text-primary)" }}>
                  You scored {dailyQuiz.score}% today
                </p>
                <p className="text-xs mt-1" style={{ color: "var(--dashboard-text-muted)" }}>
                  {dailyQuiz.questions?.length ?? 0} questions completed · Earned +25 streak XP.
                </p>
              </>
            ) : (
              <>
                <p className="mt-3 text-sm font-bold" style={{ color: "var(--dashboard-text-primary)" }}>
                  {dailyQuiz.title ?? "Today's Challenge"}
                </p>
                <p className="text-xs mt-1" style={{ color: "var(--dashboard-text-muted)" }}>
                  {dailyQuiz.questions?.length ?? 5} questions · 5 min limit · Earn bonus XP.
                </p>
              </>
            )}
          </div>

          <button
            onClick={() => setActiveTab("practice")}
            className={dailyQuiz?.completed ? "command-secondary-btn mt-4 w-full" : "command-primary-btn mt-4 w-full"}
          >
            {dailyQuiz?.completed ? "Practice Extra Questions" : "Start Daily Quiz Now"} <ChevronRight className="w-4 h-4" />
          </button>
        </motion.div>

        {/* Weak Topics Radar */}
        <motion.div variants={STAGGER_ITEM} className="command-card p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span
                className="w-7 h-7 rounded-lg flex items-center justify-center border shadow-sm"
                style={{ background: "var(--dashboard-danger-subtle)", color: "var(--dashboard-danger)", borderColor: "color-mix(in srgb, var(--dashboard-danger) 20%, transparent)" }}
              >
                <Flame className="w-4 h-4" />
              </span>
              <p className="command-eyebrow !text-[10px]">Weak Topics Radar</p>
              <span className="ml-auto text-[10px] font-bold font-mono px-2 py-0.5 rounded-full border" style={{ background: "var(--dashboard-surface-muted)", color: "var(--dashboard-text-muted)", borderColor: "var(--dashboard-border-muted)" }}>
                {weakTopics.length} detected
              </span>
            </div>

            {weakTopics.length === 0 ? (
              <p className="mt-4 text-sm" style={{ color: "var(--dashboard-text-muted)" }}>
                Solve more practice sets to surface topic-level accuracy bottlenecks.
              </p>
            ) : (
              <div className="mt-3 space-y-2">
                {weakTopics.map((wt) => (
                  <button
                    key={`${wt.subject}-${wt.topic}`}
                    onClick={() => practiceSubject(wt.subject)}
                    className="w-full text-left rounded-xl border p-2.5 flex items-center justify-between gap-2 hover:border-[var(--dashboard-primary)]/40 transition-colors"
                    style={{ background: "var(--dashboard-surface-muted)", borderColor: "var(--dashboard-border-muted)" }}
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-bold truncate" style={{ color: "var(--dashboard-text-primary)" }}>
                        {wt.topic}
                      </p>
                      <p className="text-[11px] truncate" style={{ color: "var(--dashboard-text-muted)" }}>
                        {wt.subject} · {wt.attempted} tried
                      </p>
                    </div>
                    <span className="text-xs font-mono font-extrabold shrink-0" style={{ color: "var(--dashboard-danger)" }}>
                      {wt.score}%
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <button onClick={() => setActiveTab("progress")} className="text-xs font-bold inline-flex items-center gap-1 mt-3" style={{ color: "var(--dashboard-primary)" }}>
            Full Topic Weakness Breakdown <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </motion.div>

        {/* Flashcards Deck */}
        <motion.div variants={STAGGER_ITEM} className="command-card p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span
                className="w-7 h-7 rounded-lg flex items-center justify-center border shadow-sm"
                style={{ background: "var(--dashboard-success-subtle)", color: "var(--dashboard-success)", borderColor: "color-mix(in srgb, var(--dashboard-success) 20%, transparent)" }}
              >
                <Brain className="w-4 h-4" />
              </span>
              <p className="command-eyebrow !text-[10px]">Spaced Repetition Deck</p>
              <span className="ml-auto text-[10px] font-bold font-mono px-2 py-0.5 rounded-full border" style={{ background: "var(--dashboard-surface-muted)", color: "var(--dashboard-text-muted)", borderColor: "var(--dashboard-border-muted)" }}>
                {flashcardsDue ?? "—"} Due
              </span>
            </div>

            <p className="mt-3 text-sm font-bold" style={{ color: "var(--dashboard-text-primary)" }}>
              {flashcardsDue && flashcardsDue > 0 ? `${flashcardsDue} flashcards ready for review` : "Spaced Repetition Engine"}
            </p>
            <p className="text-xs mt-1" style={{ color: "var(--dashboard-text-muted)" }}>
              Reviewing daily moves facts from short-term memory to long-term BCS recall.
            </p>
          </div>

          <div className="mt-4 flex gap-2">
            <button onClick={() => setActiveTab("flashcards")} className="command-primary-btn flex-1">
              <Sparkles className="w-4 h-4" /> Review Now
            </button>
            <button onClick={() => setActiveTab("flashcards")} className="command-secondary-btn">
              Deck
            </button>
          </div>
        </motion.div>
      </div>

      {/* ── Upcoming Exam Countdown (if active) ── */}
      {nextExam && (
        <motion.div variants={STAGGER_ITEM}>
          <ExamCountdownCard exam={nextExam} />
        </motion.div>
      )}

      {/* ── Mistakes Notebook & Recent Activity Grid ── */}
      <div className="grid lg:grid-cols-2 gap-5">
        {/* Mistakes Card */}
        <motion.div variants={STAGGER_ITEM} className="command-card p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span
                className="w-7 h-7 rounded-lg flex items-center justify-center border shadow-sm"
                style={{ background: "var(--dashboard-danger-subtle)", color: "var(--dashboard-danger)", borderColor: "color-mix(in srgb, var(--dashboard-danger) 20%, transparent)" }}
              >
                <BookX className="w-4 h-4" />
              </span>
              <p className="command-eyebrow !text-[10px]">Wrong Answers Notebook</p>
            </div>
            <button onClick={() => mistakeSubject()} className="text-xs font-bold inline-flex items-center gap-1" style={{ color: "var(--dashboard-primary)" }}>
              Open Notebook <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {mistakeStatsData === 0 ? (
            <div className="mt-4 rounded-xl border border-dashed p-6 text-center" style={{ borderColor: "var(--dashboard-border-muted)", background: "var(--dashboard-surface-muted)" }}>
              <p className="text-sm font-bold" style={{ color: "var(--dashboard-text-primary)" }}>
                No unresolved mistakes yet
              </p>
              <p className="text-xs mt-1" style={{ color: "var(--dashboard-text-muted)" }}>
                Wrong answers automatically collect here for spaced repetition.
              </p>
            </div>
          ) : (
            <div className="mt-4 space-y-2">
              <p className="text-sm font-bold" style={{ color: "var(--dashboard-text-primary)" }}>
                {mistakeStatsData} questions require correction
              </p>
              {mistakeSubjectsData.slice(0, 3).map((s) => (
                <button
                  key={s.subject}
                  onClick={() => mistakeSubject(s.subject)}
                  className="w-full flex items-center justify-between rounded-xl border px-3 py-2.5 text-left hover:border-[var(--dashboard-primary)]/40 transition-colors"
                  style={{ background: "var(--dashboard-surface-muted)", borderColor: "var(--dashboard-border-muted)" }}
                >
                  <span className="text-xs font-bold truncate" style={{ color: "var(--dashboard-text-primary)" }}>
                    {s.subject}
                  </span>
                  <span className="text-xs font-mono font-bold shrink-0 text-[var(--dashboard-danger)]">
                    {s.unmastered} unresolved
                  </span>
                </button>
              ))}
            </div>
          )}
        </motion.div>

        {/* Recent Activity Card */}
        <motion.div variants={STAGGER_ITEM} className="command-card p-5">
          <div className="flex items-center justify-between">
            <p className="command-eyebrow !text-[10px]">Recent Activity Timeline</p>
            <button onClick={() => setActiveTab("progress")} className="text-xs font-bold inline-flex items-center gap-1" style={{ color: "var(--dashboard-primary)" }}>
              View All Timeline <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {results.length === 0 ? (
            <p className="mt-4 text-sm" style={{ color: "var(--dashboard-text-muted)" }}>
              No mock exams completed yet. Your attempt timeline will build here.
            </p>
          ) : (
            <div className="mt-4 space-y-2">
              {results.slice(0, 4).map((r) => (
                <button
                  key={r.id}
                  onClick={() => setActiveTab("progress")}
                  className="w-full flex items-center gap-3 rounded-xl border px-3 py-2.5 text-left hover:border-[var(--dashboard-primary)]/40 transition-colors"
                  style={{ background: "var(--dashboard-surface-muted)", borderColor: "var(--dashboard-border-muted)" }}
                >
                  <span
                    className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 border"
                    style={{
                      background:
                        r.score >= 80 ? "var(--dashboard-success-subtle)" : r.score >= 50 ? "var(--dashboard-warning-subtle)" : "var(--dashboard-danger-subtle)",
                      color: r.score >= 80 ? "var(--dashboard-success)" : r.score >= 50 ? "var(--dashboard-warning)" : "var(--dashboard-danger)",
                      borderColor: "color-mix(in srgb, currentColor 20%, transparent)",
                    }}
                  >
                    <Trophy className="w-4 h-4" />
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold truncate" style={{ color: "var(--dashboard-text-primary)" }}>
                      {r.title}
                    </p>
                    <p className="text-[11px]" style={{ color: "var(--dashboard-text-muted)" }}>
                      {r.correct}/{r.total} correct · {new Date(r.createdAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}
                    </p>
                  </div>
                  <span className="text-xs font-mono font-extrabold flex items-center gap-1" style={{ color: "var(--dashboard-text-primary)" }}>
                    {r.score}% <ChevronRight className="w-3.5 h-3.5 opacity-50" />
                  </span>
                </button>
              ))}
            </div>
          )}
        </motion.div>
      </div>
    </motion.div>
  );
}
