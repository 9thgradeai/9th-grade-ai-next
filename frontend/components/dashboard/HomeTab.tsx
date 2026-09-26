"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import dynamic from "next/dynamic";
import { motion, useReducedMotion } from "framer-motion";
import { Clock, ArrowRight, Flame, Trophy, CaretRight, ArrowCounterClockwise } from "@phosphor-icons/react";
import { useAuth } from "@/lib/auth-ctx";
import { useDashboardStore } from "@/lib/store-ctx/dashboard";
import { useMotionCapabilities } from "@/lib/motion/device";
import { useLanguage, t } from "@/lib/lang-ctx";
import { useToastSafe } from "@/lib/toast-ctx";
import { api, invalidateCache } from "@/lib/services/api";
import { useDialogA11y } from "@/lib/use-dialog-a11y";
import { homePerf } from "@/lib/perf";
import { EMPTY_INTELLIGENCE, mergeIntelligence } from "@/lib/intelligence";
import type { Server, PrepIntelligenceRecommendation } from "@/lib/types";
import StreakHeatmap from "./StreakHeatmap";
import HomeCoach from "./ai/HomeCoach";
import { useExamDaysLeft } from "./HomeTabHelpers";
import TodayMission from "./command-center/TodayMission";
import PreparationPulse from "./command-center/PreparationPulse";
import ContinueLearning from "./command-center/ContinueLearning";
import RecommendedActions from "./command-center/RecommendedActions";
import type { PerfRange } from "./command-center/PerformanceCard";
import TodayPlanCard from "./command-center/TodayPlanCard";
import { launchAI } from "@/lib/ai-launcher";
import type { HomeHeroSignals } from "./ai/HomeHero";

// PerformanceCard carries the SVG chart chunk — split it off the initial
// Home bundle; the skeleton covers the load gap.
const PerformanceCard = dynamic(() => import("./command-center/PerformanceCard"), {
  ssr: false,
  loading: () => (
    <div role="status" aria-label="Loading performance" className="rounded-2xl border p-5 animate-pulse" style={{ background: "var(--dashboard-surface)", borderColor: "var(--dashboard-border-muted)" }}>
      <div className="h-3 w-1/3 rounded" style={{ background: "var(--dashboard-surface-muted)" }} />
      <div className="mt-3 h-24 rounded-xl" style={{ background: "var(--dashboard-surface-muted)" }} />
    </div>
  ),
});

// AI Hero loads on demand (agent SSE client excluded from the initial
// bundle) and renders nothing server-side (greeting + streaming are live).
const HomeHero = dynamic(() => import("./ai/HomeHero"), {
  ssr: false,
  loading: () => (
    <div role="status" aria-label="Loading AI command" className="rounded-2xl border p-5 animate-pulse" style={{ background: "var(--dashboard-surface)", borderColor: "var(--dashboard-border-muted)" }}>
      <div className="h-10 rounded-xl" style={{ background: "var(--dashboard-surface-muted)" }} />
    </div>
  ),
});

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const WEEKDAY_SHORT_BN = ["শনি", "রবি", "সোম", "মঙ্গল", "বুধ", "বৃহ", "শুক্র"];

function lastSevenDayLabels(): string[] {
  const today = new Date().getDay();
  const out: string[] = [];
  for (let i = 6; i >= 0; i--) out.push(WEEKDAY_SHORT_BN[(today - i + 7) % 7]);
  return out;
}
const WEEKDAY_LABELS_7 = lastSevenDayLabels();

const STAGGER = { hidden: {}, show: { transition: { staggerChildren: 0.03, delayChildren: 0.01 } } };
const STAGGER_ITEM = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: { type: "spring" as const, stiffness: 320, damping: 30 } },
};

/** Shimmer placeholder for one not-yet-loaded Home section. */
function ScopeSkeleton({ label }: { label: string }) {
  return (
    <div
      role="status"
      aria-label={label}
      className="rounded-2xl border p-5 animate-pulse"
      style={{ background: "var(--dashboard-surface)", borderColor: "var(--dashboard-border-muted)" }}
    >
      <div className="h-3 w-1/3 rounded" style={{ background: "var(--dashboard-surface-muted)" }} />
      <div className="mt-3 h-8 rounded-xl" style={{ background: "var(--dashboard-surface-muted)" }} />
      <div className="mt-2 h-8 rounded-xl" style={{ background: "var(--dashboard-surface-muted)" }} />
    </div>
  );
}

/** Inline retry for one failed scope — the rest of Home keeps working. */
function ScopeError({ message, retryLabel, onRetry }: { message: string; retryLabel: string; onRetry: () => void }) {
  return (
    <div
      role="alert"
      className="rounded-2xl border p-5 text-center"
      style={{ background: "var(--dashboard-surface)", borderColor: "var(--dashboard-border-muted)" }}
    >
      <p className="text-xs font-bold" style={{ color: "var(--dashboard-text-secondary)" }}>{message}</p>
      <button
        onClick={onRetry}
        className="mt-3 inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg border"
        style={{ borderColor: "var(--dashboard-border-muted)", color: "var(--dashboard-primary)" }}
      >
        <ArrowCounterClockwise className="w-3.5 h-3.5" /> {retryLabel}
      </button>
    </div>
  );
}

export default function HomeTab() {
  const { user } = useAuth();
  const { setActiveTab, setPracticeIntent, setMistakeIntent, setQuestionBankFilters } = useDashboardStore();
  const { lang } = useLanguage();
  const toast = useToastSafe();
  const reduceMotion = useReducedMotion();
  const caps = useMotionCapabilities();
  // Phase 3: low-tier devices (coarse pointer, low RAM, save-data) skip the
  // stagger/spring choreography entirely — sections paint instantly.
  const lowMotion = reduceMotion || caps.tier === "low";

  const [intelligence, setIntelligence] = useState<Server.PreparationIntelligenceDTO | null>(null);
  // Staged loading (Phase 1): pulse paints the header instantly; tasks and
  // analytics stream in afterwards. Each section owns its skeleton/error so a
  // slow analytics query never blocks the whole page.
  const [pulseReady, setPulseReady] = useState(false);
  const [tasksReady, setTasksReady] = useState(false);
  const [analyticsReady, setAnalyticsReady] = useState(false);
  const [pulseFailed, setPulseFailed] = useState(false);
  const [tasksFailed, setTasksFailed] = useState(false);
  const [analyticsFailed, setAnalyticsFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [perfRange, setPerfRange] = useState<PerfRange>("30D");
  const cancelledRef = useRef(false);

  const resetStages = () => {
    setIntelligence(null);
    setPulseReady(false);
    setTasksReady(false);
    setAnalyticsReady(false);
    setPulseFailed(false);
    setTasksFailed(false);
    setAnalyticsFailed(false);
  };

  const setScopeReady = (scope: "pulse" | "tasks" | "analytics", ready: boolean) => {
    if (scope === "pulse") setPulseReady(ready);
    else if (scope === "tasks") setTasksReady(ready);
    else setAnalyticsReady(ready);
  };

  const setScopeFailed = (scope: "pulse" | "tasks" | "analytics", failed: boolean) => {
    if (scope === "pulse") setPulseFailed(failed);
    else if (scope === "tasks") setTasksFailed(failed);
    else setAnalyticsFailed(failed);
  };

  // One scope fetch + merge. `first` = initial load (failures surface section
  // errors); background revalidations keep existing data on failure.
  // Stable identity: only stable setters + module singletons inside.
  const runScope = useCallback(
    async (scope: "pulse" | "tasks" | "analytics", first: boolean): Promise<boolean> => {
      try {
        const patch = await api.preparationIntelligenceScope(scope);
        setIntelligence((prev) => mergeIntelligence(prev ?? EMPTY_INTELLIGENCE, patch));
        setScopeReady(scope, true);
        setScopeFailed(scope, false);
        homePerf.record(scope);
        return true;
      } catch {
        setScopeFailed(scope, true);
        if (first) setScopeReady(scope, true);
        return false;
      }
    },
    [],
  );

  useEffect(() => {
    cancelledRef.current = false;
    homePerf.start();
    // Stage 1 — pulse: cheap header fields, paints first.
    void (async () => {
      if ((await runScope("pulse", true)) && !cancelledRef.current) {
        // Stage 2 — tasks + analytics in parallel once the header is up.
        void runScope("tasks", true);
        void runScope("analytics", true);
      }
    })();
    return () => {
      cancelledRef.current = true;
    };
  }, [reloadKey, runScope]);

  // Phase 4: background revalidation — refresh-merge without skeleton flash
  // when data is already on screen; full staged load only on first paint.
  const revalidateAll = useCallback(() => {
    invalidateCache("/api/preparation-intelligence");
    if (!intelligence) {
      resetStages();
      setReloadKey((k) => k + 1);
      return;
    }
    void runScope("pulse", false);
    void runScope("tasks", false);
    void runScope("analytics", false);
  }, [intelligence, runScope]);

  // Streak milestone celebration (real streak only).
  useEffect(() => {
    const s = intelligence?.streak ?? 0;
    const isMilestone = s === 7 || s === 30 || s === 100 || (s > 0 && s % 50 === 0);
    if (!isMilestone) return;
    const key = `streak-celebrated-${s}`;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
    } catch {
      return;
    }
    toast.success(t(lang, `অভিনন্দন! আপনি ${s} দিনের স্ট্রিক অর্জন করেছেন।`, `Congratulations! You've hit a ${s}-day streak.`));
  }, [intelligence?.streak, lang, toast]);

  useEffect(() => {
    const onRefresh = () => {
      revalidateAll();
    };
    const onStartPractice = () => {
      setPracticeIntent({ mode: "quick" });
      setActiveTab("practice");
    };
    window.addEventListener("ai:refresh-home", onRefresh);
    window.addEventListener("dashboard:start-practice", onStartPractice);
    return () => {
      window.removeEventListener("ai:refresh-home", onRefresh);
      window.removeEventListener("dashboard:start-practice", onStartPractice);
    };
  }, [setActiveTab, setPracticeIntent, revalidateAll]);

  const nextExam = intelligence?.nextExam ?? null;
  const examDaysLeft = useExamDaysLeft(nextExam?.date ?? null);
  const todaysTasks = useMemo(() => {
    const today = WEEKDAYS[new Date().getDay()];
    return (intelligence?.studyTasks ?? []).filter((task) => task.day === today);
  }, [intelligence]);
  const activityDays = useMemo(
    () => (intelligence?.activity ?? []).slice(-7).map((a) => a.answered > 0),
    [intelligence],
  );
  const results = useMemo(() => intelligence?.recentResults ?? [], [intelligence]);

  // Deterministic hero chips (Phase 2): numbers come from live aggregates —
  // the model only narrates, never invents them.
  const heroSignals = useMemo<HomeHeroSignals>(() => {
    const weakSub = intelligence?.recommendations.find((r) => r.id === "practice-weak-subject");
    const weakTopicRec = intelligence?.recommendations.find((r) => r.id === "practice-weak-topic");
    return {
      weakSubject: weakSub?.subject ?? weakTopicRec?.subject,
      weakTopic: weakTopicRec?.topic,
      weakAccuracy: weakSub?.accuracy ?? weakTopicRec?.accuracy,
      unmasteredMistakes: intelligence?.mistakes.unmastered,
      flashcardsDue: intelligence?.flashcardsDue,
      dailyQuizAvailable: intelligence?.dailyQuizAvailable,
      streak: intelligence?.streak,
    };
  }, [intelligence]);

  const toggleTask = async (taskId: number) => {
    setIntelligence((prev) =>
      prev
        ? {
            ...prev,
            studyTasks: prev.studyTasks.map((task) =>
              task.id === taskId ? { ...task, completed: !task.completed } : task,
            ),
          }
        : prev,
    );
    try {
      await api.toggleStudyTask(taskId);
    } catch {
      setIntelligence((prev) =>
        prev
          ? {
              ...prev,
              studyTasks: prev.studyTasks.map((task) =>
                task.id === taskId ? { ...task, completed: !task.completed } : task,
              ),
            }
          : prev,
      );
      toast.error(t(lang, "কাজ আপডেট করা যায়নি — আবার চেষ্টা করুন", "Could not update task — please try again"));
    }
  };

  const practiceSubject = (subject?: string) => {
    setPracticeIntent(subject ? { subject, mode: "quick" } : { mode: "quick" });
    if (subject) setQuestionBankFilters({ category: subject });
    setActiveTab("practice");
  };

  const mistakeSubject = (subject?: string) => {
    if (subject) setMistakeIntent({ subject });
    else setMistakeIntent(null);
    setActiveTab("mistakes");
  };

  const handleRecommendation = (rec: PrepIntelligenceRecommendation) => {
    switch (rec.id) {
      case "resume-exam": /* practice tab resumes the persisted mock test */
      case "exam-near":
      case "daily-quiz":
      case "daily-warmup":
      case "keep-going":
        setActiveTab("practice");
        break;
      case "practice-weak-topic":
      case "practice-weak-subject":
        practiceSubject(rec.subject);
        break;
      case "review-mistakes":
        mistakeSubject();
        break;
      case "review-flashcards":
        setActiveTab("flashcards");
        break;
      default:
        setActiveTab(rec.target);
    }
  };

  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const closeShortcuts = useCallback(() => setShortcutsOpen(false), []);
  const shortcutsRef = useDialogA11y<HTMLDivElement>(shortcutsOpen, closeShortcuts);

  // Keyboard Shortcuts Listener [P, M, W, A, F, Q, L, R, ?]
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

      if (e.key === "?") {
        setShortcutsOpen((v) => !v);
        return;
      }
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
        launchAI({ mode: "tutor" });
      } else if (key === "F") {
        setActiveTab("flashcards");
      } else if (key === "Q") {
        setActiveTab("question-bank");
      } else if (key === "L") {
        setActiveTab("study-planner");
      } else if (key === "R") {
        revalidateAll();
        toast.success(t(lang, "হোম ডেটা রিফ্রেশ হয়েছে", "Home data refreshed"));
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [setActiveTab, setPracticeIntent, toast, lang, revalidateAll]);

  const skeleton = !pulseReady && !pulseFailed;

  const retryScope = (scope: "tasks" | "analytics") => {
    setScopeFailed(scope, false);
    setScopeReady(scope, false);
    void runScope(scope, true);
  };

  if (pulseFailed && !intelligence) {
    return (
      <div
        role="alert"
        className="rounded-2xl border p-8 text-center command-card"
        style={{ borderColor: "var(--dashboard-danger)" }}
      >
        <p className="text-sm font-bold" style={{ color: "var(--dashboard-text-primary)" }}>
          {t(lang, "ড্যাশবোর্ড ডেটা লোড করা যায়নি", "Dashboard data could not be loaded")}
        </p>
        <p className="mt-1 text-xs" style={{ color: "var(--dashboard-text-muted)" }}>
          {t(lang, "ইন্টারনেট সংযোগ পরীক্ষা করে আবার চেষ্টা করুন।", "Check your connection and try again.")}
        </p>
        <button
          onClick={() => {
            resetStages();
            setReloadKey((k) => k + 1);
          }}
          className="command-primary-btn mt-4"
        >
          <ArrowCounterClockwise className="w-4 h-4" /> {t(lang, "আবার চেষ্টা করুন", "Try again")}
        </button>
      </div>
    );
  }

  return (
    <motion.div variants={lowMotion ? undefined : STAGGER} initial={lowMotion ? false : "hidden"} animate={lowMotion ? undefined : "show"} className="study-home space-y-5 pb-24 sm:pb-6">
      <motion.header variants={STAGGER_ITEM} className="study-home-header flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-display text-xl font-semibold tracking-tight text-[var(--dashboard-text-primary)]">
            {t(lang, "প্রস্তুতির সারাংশ", "Preparation overview")}
          </h1>
          {skeleton ? (
            <div role="status" aria-label={t(lang, "লোড হচ্ছে", "Loading")} className="mt-2 flex items-center gap-2 animate-pulse">
              <div className="h-6 w-40 rounded-full" style={{ background: "var(--dashboard-surface-muted)" }} />
            </div>
          ) : (
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-[var(--dashboard-text-secondary)]">
            <span className="inline-flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-[var(--dashboard-primary)]" aria-hidden="true" /> {user?.examTarget ?? t(lang, "লক্ষ্য নির্ধারিত হয়নি", "Target not set")}
              {nextExam ? ` · ${t(lang, nextExam.titleBn, nextExam.titleEn)}` : ""}
            </span>
            <button
              type="button"
              onClick={() => setShortcutsOpen(true)}
              aria-label={t(lang, "কিবোর্ড শর্টকাট", "Keyboard shortcuts")}
              title="?"
              className="inline-flex items-center justify-center w-7 h-7 min-w-[28px] min-h-[28px] rounded-lg border font-mono text-xs font-bold transition-colors hover:border-[var(--dashboard-primary)]"
              style={{ borderColor: "var(--dashboard-border-muted)", color: "var(--dashboard-text-muted)", background: "var(--dashboard-surface-muted)" }}
            >
              ?
            </button>
            <span
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-bold"
              style={{
                background: "var(--dashboard-warning-subtle)",
                borderColor: "color-mix(in srgb, var(--dashboard-warning) 20%, transparent)",
                color: "var(--dashboard-warning)",
              }}
            >
              <Flame className="w-3.5 h-3.5 fill-current" aria-hidden="true" />
              {intelligence?.streak ?? 0} {t(lang, "দিনের স্ট্রিক", "day streak")}
              <span className="hidden sm:inline-flex ml-1">
                <StreakHeatmap activeDays={activityDays} labels={WEEKDAY_LABELS_7} />
              </span>
            </span>
          </div>
          )}
        </div>

        {pulseReady && nextExam && examDaysLeft != null && (
          <div
            className="w-fit max-w-full border-l-2 border-[var(--dashboard-primary)] py-1 pl-5 flex items-center gap-4"
            style={{ background: "var(--dashboard-surface)", borderLeftColor: "var(--dashboard-primary)" }}
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
                {examDaysLeft <= 7
                  ? t(lang, "⚡ চূড়ান্ত নিবিড় পর্ব", "⚡ Final Sprint Phase")
                  : examDaysLeft <= 30
                    ? t(lang, "🎯 নিবিড় পুনর্বিবেচনা", "🎯 Focused Revision Window")
                    : t(lang, "📚 নিয়মিত প্রস্তুতি", "📚 Steady Preparation Window")}
              </p>
            </div>
          </div>
        )}
      </motion.header>

      {/* ── AI Hero: ask-first command bar (Phase 2) ── */}
      <motion.div variants={STAGGER_ITEM} className="min-w-0">
        <HomeHero signals={heroSignals} />
      </motion.div>

      {/* ── Secondary: Pulse — compact, muted ── */}
      <motion.div variants={STAGGER_ITEM}>
        {!pulseReady ? (
          <ScopeSkeleton label={t(lang, "প্রস্তুতির পালস লোড হচ্ছে", "Loading preparation pulse")} />
        ) : (
          <PreparationPulse intelligence={intelligence} />
        )}
      </motion.div>

      <div className="study-home-analytics grid gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <motion.div variants={STAGGER_ITEM} className="min-w-0 opacity-[0.98]">
          {!pulseReady ? (
            <ScopeSkeleton label={t(lang, "পারফরম্যান্স লোড হচ্ছে", "Loading performance")} />
          ) : (
            <PerformanceCard
              activity={intelligence?.activity ?? []}
              results={results}
              range={perfRange}
              onRangeChange={setPerfRange}
              loading={false}
            />
          )}
        </motion.div>
        <motion.div variants={STAGGER_ITEM} className="min-w-0">
          {tasksFailed && !tasksReady ? (
            <ScopeError
              message={t(lang, "আজকের পরিকল্পনা লোড করা যায়নি", "Could not load today's plan")}
              retryLabel={t(lang, "আবার চেষ্টা করুন", "Try again")}
              onRetry={() => retryScope("tasks")}
            />
          ) : !tasksReady ? (
            <ScopeSkeleton label={t(lang, "আজকের পরিকল্পনা লোড হচ্ছে", "Loading today's plan")} />
          ) : (
            <TodayPlanCard
              tasks={todaysTasks}
              onToggle={toggleTask}
              onTaskAdded={() => setReloadKey((k) => k + 1)}
            />
          )}
        </motion.div>
      </div>

      {/* ── Hero Mission — primary CTA with command-card--hero treatment ── */}
      <div className="grid gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <motion.div variants={STAGGER_ITEM} className="min-w-0">
          {analyticsFailed && !analyticsReady ? (
            <ScopeError
              message={t(lang, "আজকের মিশন লোড করা যায়নি", "Could not load today's mission")}
              retryLabel={t(lang, "আবার চেষ্টা করুন", "Try again")}
              onRetry={() => retryScope("analytics")}
            />
          ) : !analyticsReady ? (
            <ScopeSkeleton label={t(lang, "আজকের মিশন লোড হচ্ছে", "Loading today's mission")} />
          ) : (
            <TodayMission
              intelligence={intelligence}
              onStartPractice={practiceSubject}
              onStartMistakes={() => mistakeSubject()}
              onReviewFlashcards={() => setActiveTab("flashcards")}
              onStartDailyQuiz={() => setActiveTab("practice")}
            />
          )}
        </motion.div>
        <motion.div variants={STAGGER_ITEM} className="min-w-0">
          {analyticsFailed && !analyticsReady ? (
            <ScopeError
              message={t(lang, "প্রস্তাবনা লোড করা যায়নি", "Could not load recommendations")}
              retryLabel={t(lang, "আবার চেষ্টা করুন", "Try again")}
              onRetry={() => retryScope("analytics")}
            />
          ) : !analyticsReady ? (
            <ScopeSkeleton label={t(lang, "প্রস্তাবনা লোড হচ্ছে", "Loading recommendations")} />
          ) : (
            <RecommendedActions intelligence={intelligence} onAction={handleRecommendation} />
          )}
        </motion.div>
      </div>

      <motion.div variants={STAGGER_ITEM}>
        {!tasksReady && !tasksFailed ? (
          <ScopeSkeleton label={t(lang, "চলমান শেখা লোড হচ্ছে", "Loading continue learning")} />
        ) : (
          <ContinueLearning
            intelligence={intelligence}
            onResumeExam={() => setActiveTab("practice")}
            onStartDailyQuiz={() => setActiveTab("practice")}
          />
        )}
      </motion.div>

      {/* ── Deferred: AI Study Coach — collapsed by default to reduce initial cognitive load ── */}
      <motion.div variants={STAGGER_ITEM} id="dashboard-ai-coach" className="scroll-mt-6">
        <details className="group rounded-2xl border" style={{ background: "var(--dashboard-surface)", borderColor: "var(--dashboard-border-muted)" }}>
          <summary className="flex items-center justify-between gap-3 px-5 py-4 cursor-pointer list-none">
            <div className="flex items-center gap-3 min-w-0">
              <span className="w-9 h-9 rounded-xl flex items-center justify-center border shrink-0" style={{ background: "var(--dashboard-primary-subtle)", borderColor: "color-mix(in srgb, var(--dashboard-primary) 18%, transparent)", color: "var(--dashboard-primary)" }}>
                <span className="text-sm">✦</span>
              </span>
              <div className="min-w-0">
                <p className="text-sm font-bold" style={{ color: "var(--dashboard-text-primary)" }}>{t(lang, "AI স্টাডি কোচ", "AI Study Coach")}</p>
                <p className="text-xs truncate" style={{ color: "var(--dashboard-text-muted)" }}>{t(lang, "প্রয়োজনে খুলে দ্রুত কৌশল নিন", "Open when you need a quick strategy")}</p>
              </div>
            </div>
            <span className="shrink-0 inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1.5 rounded-lg border group-open:rotate-180 transition-transform" style={{ borderColor: "var(--dashboard-border-muted)", color: "var(--dashboard-text-secondary)", background: "var(--dashboard-surface-muted)" }}>
              <CaretRight className="w-3.5 h-3.5 rotate-90" /> {t(lang, "খুলুন", "Open")}
            </span>
          </summary>
          <div className="px-5 pb-5 pt-1 border-t" style={{ borderColor: "var(--dashboard-border-muted)" }}>
            <HomeCoach />
          </div>
        </details>
      </motion.div>

      {/* ── Recent Mock Exam Results (real history) ── */}
      {results.length > 0 && (
        <motion.div variants={STAGGER_ITEM} className="command-card p-5">
          <div className="flex items-center justify-between">
            <p className="command-eyebrow !text-[10px]">{t(lang, "সাম্প্রতিক মক টেস্ট", "Recent mock tests")}</p>
            <button onClick={() => setActiveTab("progress")} className="text-xs font-bold inline-flex items-center gap-1" style={{ color: "var(--dashboard-primary)" }}>
              {t(lang, "পুরো টাইমলাইন", "Full timeline")} <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
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
                  {r.score}%                   <CaretRight className="w-3.5 h-3.5 opacity-50" />
                </span>
              </button>
            ))}
          </div>
        </motion.div>
      )}
      {/* ── Keyboard shortcut cheat-sheet (Phase 4 a11y, portaled: the
          motion ancestor's transform would break position:fixed) ── */}
      {shortcutsOpen &&
        createPortal(
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ background: "color-mix(in srgb, black 55%, transparent)" }}
            onClick={closeShortcuts}
          >,
          <div
            ref={shortcutsRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="home-shortcuts-title"
            tabIndex={-1}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-2xl border p-5 outline-none"
            style={{ background: "var(--dashboard-surface)", borderColor: "var(--dashboard-border-muted)" }}
          >
            <div className="flex items-center justify-between">
              <p id="home-shortcuts-title" className="text-sm font-bold" style={{ color: "var(--dashboard-text-primary)" }}>
                {t(lang, "কিবোর্ড শর্টকাট", "Keyboard shortcuts")}
              </p>
              <button
                type="button"
                onClick={closeShortcuts}
                aria-label={t(lang, "বন্ধ করো", "Close")}
                className="inline-flex items-center justify-center w-9 h-9 min-h-[36px] rounded-lg border text-xs"
                style={{ borderColor: "var(--dashboard-border-muted)", color: "var(--dashboard-text-secondary)" }}
              >
                ✕
              </button>
            </div>
            <ul className="mt-3 space-y-1.5 text-xs" style={{ color: "var(--dashboard-text-secondary)" }}>
              {(
                [
                  ["P", t(lang, "দ্রুত অনুশীলন", "Quick practice")],
                  ["M", t(lang, "মক টেস্ট", "Mock test")],
                  ["W", t(lang, "ভুল বিশ্লেষণ", "Mistake review")],
                  ["A", t(lang, "AI টিউটর", "AI tutor")],
                  ["F", t(lang, "ফ্ল্যাশকার্ড", "Flashcards")],
                  ["Q", t(lang, "প্রশ্নব্যাংক", "Question bank")],
                  ["L", t(lang, "স্টাডি প্ল্যানার", "Study planner")],
                  ["R", t(lang, "হোম রিফ্রেশ", "Refresh home")],
                  ["?", t(lang, "এই তালিকা", "This list")],
                ] as [string, string][]
              ).map(([key, label]) => (
                <li key={key} className="flex items-center justify-between gap-3">
                  <span>{label}</span>
                  <kbd
                    className="rounded-md border px-2 py-0.5 font-mono font-bold"
                    style={{ borderColor: "var(--dashboard-border-muted)", background: "var(--dashboard-surface-muted)", color: "var(--dashboard-text-primary)" }}
                  >
                    {key}
                  </kbd>
                </li>
              ))}
            </ul>
          </div>
          </div>,
          document.body,
        )}
    </motion.div>
  );
}