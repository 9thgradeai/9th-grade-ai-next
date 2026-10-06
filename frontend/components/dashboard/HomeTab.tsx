"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { motion, useReducedMotion } from "framer-motion";
import { Clock, ArrowRight, Trophy, CaretRight, ArrowCounterClockwise, Stack } from "@phosphor-icons/react";
import { useAuth } from "@/lib/auth-ctx";
import { useDashboardStore } from "@/lib/store-ctx/dashboard";
import { useMotionCapabilities } from "@/lib/motion/device";
import { useMotionTier } from "@/lib/motion/use-motion-tier";
import { useLanguage, t } from "@/lib/lang-ctx";
import { useToastSafe } from "@/lib/toast-ctx";
import { api, invalidateCache } from "@/lib/services/api";
import { rankAmbientCards } from "@/lib/gamification";
import StreakEngine from "./command-center/StreakEngine";
import { homePerf } from "@/lib/perf";
import { EMPTY_INTELLIGENCE, mergeIntelligence } from "@/lib/intelligence";
import type { Server, PrepIntelligenceRecommendation } from "@/lib/types";
import HomeCoach from "./ai/HomeCoach";
import HomeWelcome from "./HomeWelcome";
import { useExamDaysLeft } from "./HomeTabHelpers";
import TodayMission from "./command-center/TodayMission";
import PreparationPulse from "./command-center/PreparationPulse";
import ContinueLearning from "./command-center/ContinueLearning";
import SpotlightQuiz from "./SpotlightQuiz";
import RecommendedActions from "./command-center/RecommendedActions";
import type { PerfRange } from "./command-center/PerformanceCard";
import TodayPlanCard from "./command-center/TodayPlanCard";
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
// Index-aligned with Date.getDay() (0 = Sunday = রবি).
const WEEKDAY_SHORT_BN = ["রবি", "সোম", "মঙ্গল", "বুধ", "বৃহ", "শুক্র", "শনি"];

function lastSevenDayLabels(): string[] {
  const today = new Date().getDay();
  const out: string[] = [];
  for (let i = 6; i >= 0; i--) out.push(WEEKDAY_SHORT_BN[(today - i + 7) % 7]);
  return out;
}
const WEEKDAY_LABELS_7 = lastSevenDayLabels();

/**
 * Phase 3 calm entrance — a single fade-up (16px / 220ms easeOut) per Home
 * section, fired once on scroll into view. No spring, no scale, no stagger.
 * Opacity/transform only; low-tier and reduced-motion render instantly.
 */
const SECTION_FADE = {
  hidden: { opacity: 0, y: 16 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.22, ease: "easeOut" as const },
  },
};

function RevealSection({ children, className, id, style }: { children: React.ReactNode; className?: string; id?: string; style?: React.CSSProperties }) {
  const { fullMotion } = useMotionTier();
  if (!fullMotion) {
    return (
      <div className={className} id={id} style={style}>
        {children}
      </div>
    );
  }
  return (
    <motion.div
      className={className}
      id={id}
      style={style}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: "-40px" }}
      variants={SECTION_FADE}
    >
      {children}
    </motion.div>
  );
}

/**
 * Unified section placeholder (Phase 3) — one shimmer style for every
 * not-yet-loaded Home section. Uses the shared `skeleton-shimmer` sweep,
 * never a bare `animate-pulse` block.
 */
function ScopeSkeleton({ label }: { label: string }) {
  return (
    <div
      role="status"
      aria-label={label}
      className="command-card p-5"
    >
      <div className="skeleton-shimmer h-3 w-1/3 rounded" />
      <div className="skeleton-shimmer mt-3 h-8 rounded-xl" />
      <div className="skeleton-shimmer mt-2 h-8 rounded-xl" />
    </div>
  );
}

/**
 * Unified inline retry (Phase 3) — one error style per failed scope; the
 * rest of Home keeps working. Retry uses the shared secondary button.
 */
function ScopeError({ message, retryLabel, onRetry }: { message: string; retryLabel: string; onRetry: () => void }) {
  return (
    <div
      role="alert"
      className="command-card p-5 text-center"
    >
      <p className="text-xs font-bold" style={{ color: "var(--dashboard-text-secondary)" }}>{message}</p>
      <button onClick={onRetry} className="command-secondary-btn mt-3 !py-2 text-xs">
        <ArrowCounterClockwise className="w-3.5 h-3.5" /> {retryLabel}
      </button>
    </div>
  );
}

/**
 * Sprint 3 — weekly coach disclosure. Inline (expanded) on first view each
 * ISO week so fresh strategy is seen; collapsed after, toggleable anytime.
 * State-driven button disclosure, never details/summary.
 */
function weekKey(d = new Date()): string {
  const jan4 = new Date(d.getFullYear(), 0, 4);
  const week = Math.ceil(((d.getTime() - jan4.getTime()) / 86400000 + jan4.getDay() + 1) / 7);
  return `${d.getFullYear()}-W${week}`;
}

function CoachDisclosure() {
  const { lang } = useLanguage();
  const [open, setOpen] = useState<boolean>(() => {
    try {
      return localStorage.getItem("home-coach-week") !== weekKey();
    } catch {
      return false;
    }
  });
  const toggle = () => {
    setOpen((v) => {
      const next = !v;
      try {
        if (next) localStorage.setItem("home-coach-week", weekKey());
      } catch {
        /* storage unavailable — ignore */
      }
      return next;
    });
  };
  return (
    <div className="command-card">
      <div className="flex items-center justify-between gap-3 px-5 py-4">
        <div className="flex items-center gap-3 min-w-0">
          <span className="w-9 h-9 rounded-xl flex items-center justify-center border shrink-0" style={{ background: "var(--dashboard-primary-subtle)", borderColor: "color-mix(in srgb, var(--dashboard-primary) 18%, transparent)", color: "var(--dashboard-primary)" }}>
            <span className="text-sm" aria-hidden="true">✦</span>
          </span>
          <div className="min-w-0">
            <p className="text-sm font-bold" style={{ color: "var(--dashboard-text-primary)" }}>{t(lang, "AI স্টাডি কোচ", "AI Study Coach")}</p>
            <p className="text-xs truncate" style={{ color: "var(--dashboard-text-muted)" }}>{t(lang, "প্রয়োজনে খুলে দ্রুত কৌশল নিন", "Open when you need a quick strategy")}</p>
          </div>
        </div>
        <button
          onClick={toggle}
          aria-expanded={open}
          aria-controls="home-coach-body"
          className="inline-flex shrink-0 items-center gap-2 min-h-[44px] text-xs font-bold"
          style={{ color: "var(--dashboard-text-secondary)" }}
        >
          {open ? t(lang, "লুকান", "Hide") : t(lang, "খুলুন", "Open")}
          <span
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border"
            style={{ borderColor: "var(--dashboard-border-muted)", color: "var(--dashboard-text-secondary)", background: "var(--dashboard-surface-muted)" }}
            aria-hidden="true"
          >
            <CaretRight className={`h-3.5 w-3.5 rotate-90 transition-transform ${open ? "rotate-[270deg]" : ""}`} />
          </span>
        </button>
      </div>
      {open && (
        <div id="home-coach-body" className="px-5 pb-5 pt-1 border-t" style={{ borderColor: "var(--dashboard-border-muted)" }}>
          <HomeCoach />
        </div>
      )}
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
  const [mocksOpen, setMocksOpen] = useState(false);
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
    // Long-open tabs go stale (no polling by design) — refresh on return.
    const onVisible = () => {
      if (document.visibilityState === "visible") revalidateAll();
    };
    window.addEventListener("ai:refresh-home", onRefresh);
    window.addEventListener("dashboard:start-practice", onStartPractice);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("ai:refresh-home", onRefresh);
      window.removeEventListener("dashboard:start-practice", onStartPractice);
      document.removeEventListener("visibilitychange", onVisible);
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

  const practiceSubject = (subject?: string, recId?: string) => {
    setPracticeIntent({ subject, mode: "quick", recId });
    if (subject) setQuestionBankFilters({ category: subject });
    setActiveTab("practice");
  };

  const mistakeSubject = (subject?: string) => {
    if (subject) setMistakeIntent({ subject });
    else setMistakeIntent(null);
    setActiveTab("mistakes");
  };

  const startDailyWarmup = () => {
    setPracticeIntent({ mode: "quick" });
    setActiveTab("practice");
  };

  const handleRecommendation = (rec: PrepIntelligenceRecommendation) => {
    // Funnel: acceptance feeds the Phase-2 re-ranker (fire-and-forget).
    api.recordRecAccepted({ recId: rec.id, target: rec.target, subject: rec.subject, topic: rec.topic });
    switch (rec.id) {
      case "diagnostic":
        practiceSubject(undefined, rec.id);
        break;
      case "resume-exam": /* unfinished mock resumes in mock mode */
      case "exam-near":
        setPracticeIntent({ mode: "mock", recId: rec.id });
        setActiveTab("practice");
        break;
      case "daily-quiz":
      case "daily-warmup":
      case "keep-going":
        practiceSubject(undefined, rec.id);
        break;
      case "practice-weak-topic":
      case "practice-weak-subject":
        practiceSubject(rec.subject, rec.id);
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

  // Global navigation lives in the layout (⌘K, 1–0, ?, Esc) — HomeTab owns
  // no key handlers; the layout ShortcutsSheet is the single cheat-sheet.
  const skeleton = !pulseReady && !pulseFailed;

  const retryScope = (scope: "pulse" | "tasks" | "analytics") => {
    setScopeFailed(scope, false);
    setScopeReady(scope, false);
    void runScope(scope, true);
  };

  const retryAll = () => {
    resetStages();
    setReloadKey((k) => k + 1);
  };

  // Sprint 1 ambient ranking — highest-need region first. Performance +
  // today's plan stay pinned directly under the welcome card (explicit
  // product order); actions/pulse reorder by live signals; everything else
  // holds a fixed slot. Applied via CSS `order` (gap-based stack, so
  // reordering never disturbs spacing).
  const regionOrder = useMemo(() => {
    const planDone = todaysTasks.filter((task) => task.completed).length;
    const ranked = rankAmbientCards({
      unmasteredMistakes: intelligence?.mistakes.unmastered,
      flashcardsDue: intelligence?.flashcardsDue,
      weakAccuracy: heroSignals.weakAccuracy,
      streak: intelligence?.streak,
      planCompletionPct: todaysTasks.length > 0 ? (planDone / todaysTasks.length) * 100 : 100,
    });
    const order: Record<string, number> = {};
    let slot = 2;
    for (const id of ranked) {
      if (id === "performance" || id === "plan" || id === "mission" || id === "coach") continue;
      if (!(id in order)) order[id] = slot++;
    }
    return {
      actions: order.actions ?? 2,
      pulse: order.pulse ?? 3,
    };
  }, [intelligence?.mistakes.unmastered, intelligence?.flashcardsDue, intelligence?.streak, heroSignals.weakAccuracy, todaysTasks]);

  return (
    <div className="study-home flex flex-col gap-5 pb-24 sm:pb-6">
      {/* ── 0 · Welcome + literary quote (Bangla & English writers) ── */}
      <RevealSection className="min-w-0" style={{ order: -1 }}>
        <HomeWelcome onStartPractice={startDailyWarmup} />
      </RevealSection>

      {/* ── 1 · Performance Velocity + today's plan — pinned directly under
             the welcome card (explicit product order, never ambient-ranked). ── */}
      <div className="study-home-analytics grid gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <RevealSection className="min-w-0">
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
        </RevealSection>
        <RevealSection className="min-w-0">
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
        </RevealSection>
      </div>

      <motion.header
        initial={lowMotion ? false : "hidden"}
        whileInView={lowMotion ? undefined : "show"}
        viewport={{ once: true, margin: "-40px" }}
        variants={lowMotion ? undefined : SECTION_FADE}
        className="study-home-header flex flex-wrap items-center justify-between gap-3"
      >
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
            <StreakEngine
              streak={intelligence?.streak ?? 0}
              activeDays={activityDays}
              labels={WEEKDAY_LABELS_7}
              solved={intelligence?.overall?.questionsAttempted ?? 0}
              accuracy={intelligence?.overall?.accuracy ?? 0}
            />
          </div>
          )}
        </div>

        {pulseReady && nextExam && examDaysLeft != null && (
          <div
            className="command-card command-card--compact flex w-fit max-w-full items-center gap-4 px-5"
            aria-label={t(lang, `পরীক্ষার বাকি ${examDaysLeft} দিন`, `${examDaysLeft} days left`)}
          >
            <div className="text-center">
              <p className="font-display text-2xl font-extrabold tabular-nums leading-none text-[var(--dashboard-primary)]">{examDaysLeft}</p>
              <p className="text-[10px] font-bold uppercase tracking-widest mt-1 text-[var(--dashboard-text-muted)]">{t(lang, "দিন বাকি", "Days left")}</p>
            </div>
            <div className="w-px h-10 bg-[var(--dashboard-border-muted)]" aria-hidden="true" />
            <div>
              <p className="text-[13px] font-bold leading-snug text-[var(--dashboard-text-primary)]">
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

      {/* ── Non-blocking pulse notice — header always paints; sections show
           their own skeletons/retries below (Phase 3: no full-page block). ── */}
      {pulseFailed && !intelligence && (
        <div
          role="alert"
          className="command-card flex flex-wrap items-center justify-between gap-3 p-4"
          style={{ borderColor: "var(--dashboard-danger)" }}
        >
          <p className="text-xs font-bold" style={{ color: "var(--dashboard-text-primary)" }}>
            {t(lang, "ড্যাশবোর্ড ডেটা লোড করা যায়নি — সংযোগ পরীক্ষা করে আবার চেষ্টা করুন।", "Dashboard data could not be loaded — check your connection and try again.")}
          </p>
          <button onClick={retryAll} className="command-primary-btn !py-2 text-xs">
            <ArrowCounterClockwise className="w-4 h-4" /> {t(lang, "আবার চেষ্টা করুন", "Try again")}
          </button>
        </div>
      )}

      {/* ── 1 · One mission voice: the AI brief narrates, the mission acts.
             HomeHero renders bare (no second hero card) as TodayMission's
             narrative header. Auto-drafts once per signals snapshot. ── */}
      <RevealSection className="min-w-0" style={{ order: 0 }}>
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
            onStartDailyQuiz={startDailyWarmup}
            brief={<HomeHero signals={heroSignals} autoBrief={analyticsReady} bare />}
          />
        )}
      </RevealSection>

      {/* ── 1b · Revision due strip — SRS cards needing review today ── */}
      {analyticsReady && (intelligence?.flashcardsDue ?? 0) > 0 && (
        <RevealSection className="min-w-0" style={{ order: 1 }}>
          <button
            type="button"
            onClick={() => setActiveTab("flashcards")}
            className="w-full flex items-center gap-3 rounded-2xl border border-[var(--dashboard-primary)]/25 bg-[var(--dashboard-primary-subtle)] px-4 py-3 text-left transition-all hover:border-[var(--dashboard-primary)]/50 active:scale-[0.99] min-h-[56px]"
          >
            <span className="w-9 h-9 rounded-xl bg-[var(--dashboard-primary)]/15 flex items-center justify-center flex-shrink-0">
              <Stack className="w-5 h-5 text-[var(--dashboard-primary)]" aria-hidden="true" />
            </span>
            <span className="flex-1 min-w-0">
              <span className="block text-sm font-semibold text-[var(--dashboard-text-primary)]">
                {t(lang, `আজ ${intelligence!.flashcardsDue}টি কার্ড রিভিশন বাকি`, `${intelligence!.flashcardsDue} cards due for revision today`)}
              </span>
              <span className="block text-[11px] font-mono text-[var(--dashboard-text-muted)]">
                {t(lang, "স্পেসড রিপিটিশন — ~৫ মিনিট", "Spaced repetition — ~5 min")}
              </span>
            </span>
            <span className="flex items-center gap-1 text-xs font-mono font-bold text-[var(--dashboard-primary)] flex-shrink-0">
              {t(lang, "রিভিশন", "Revise")} <CaretRight className="w-4 h-4" aria-hidden="true" />
            </span>
          </button>
        </RevealSection>
      )}

      {/* ── 4 · Recommended actions (ambient-ranked region) ── */}
      <RevealSection className="min-w-0 min-h-[220px]" style={{ order: regionOrder.actions }}>
        {analyticsFailed && !analyticsReady ? (
          <ScopeError
            message={t(lang, "প্রস্তাবনা লোড করা যায়নি", "Could not load recommendations")}
            retryLabel={t(lang, "আবার চেষ্টা করুন", "Try again")}
            onRetry={() => retryScope("analytics")}
          />
        ) : !analyticsReady ? (
          <ScopeSkeleton label={t(lang, "প্রস্তাবনা লোড হচ্ছে", "Loading recommendations")} />
        ) : (
          <RecommendedActions
            intelligence={intelligence}
            onAction={handleRecommendation}
            onOpenPlanner={() => setActiveTab("study-planner")}
          />
        )}
      </RevealSection>

      {/* ── 5 · Continue learning (fixed slot) ── */}
      <RevealSection className="min-h-[120px]" style={{ order: 5 }}>
        {!tasksReady && !tasksFailed ? (
          <ScopeSkeleton label={t(lang, "চলমান শেখা লোড হচ্ছে", "Loading continue learning")} />
        ) : (
          <ContinueLearning
            intelligence={intelligence}
            onResumeExam={() => {
              setPracticeIntent({ mode: "mock" });
              setActiveTab("practice");
            }}
            onStartDailyQuiz={startDailyWarmup}
          />
        )}
      </RevealSection>

      {/* ── 5b · Spotlight MCQ — random database question, rotates across
              all subjects every ~3 minutes. Independent of the intelligence
              scopes so it never blocks on (or blocks) the staged load. ── */}
      <RevealSection className="min-w-0" style={{ order: 6 }}>
        <SpotlightQuiz onPracticeSubject={(subject) => practiceSubject(subject)} />
      </RevealSection>

      {/* ── 6 · Secondary pulse (ambient-ranked region) ── */}
      <RevealSection style={{ order: regionOrder.pulse }}>
        {!pulseReady ? (
          pulseFailed ? (
            <ScopeError
              message={t(lang, "প্রস্তুতির পালস লোড করা যায়নি", "Could not load preparation pulse")}
              retryLabel={t(lang, "আবার চেষ্টা করুন", "Try again")}
              onRetry={() => retryScope("pulse")}
            />
          ) : (
            <ScopeSkeleton label={t(lang, "প্রস্তুতির পালস লোড হচ্ছে", "Loading preparation pulse")} />
          )
        ) : (
          <PreparationPulse intelligence={intelligence} />
        )}
      </RevealSection>

      {/* ── 7 · Recent mocks — real accordion button (details/summary with a
             nested button is keyboard/hostile); collapsed by default. ── */}
      {results.length > 0 && (
        <RevealSection className="scroll-mt-6" style={{ order: 7 }}>
          <div className="command-card">
            <div className="flex items-center justify-between gap-3 p-5">
              <span className="command-eyebrow">{t(lang, "সাম্প্রতিক মক টেস্ট", "Recent mock tests")}</span>
              <span className="flex shrink-0 items-center gap-2">
                <button
                  onClick={() => setActiveTab("progress")}
                  className="inline-flex items-center gap-1 text-xs font-bold min-h-[44px]"
                  style={{ color: "var(--dashboard-primary)" }}
                >
                  {t(lang, "পুরো টাইমলাইন", "Full timeline")} <ArrowRight className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setMocksOpen((v) => !v)}
                  aria-expanded={mocksOpen}
                  aria-controls="home-recent-mocks"
                  aria-label={mocksOpen
                    ? t(lang, "সাম্প্রতিক মক টেস্ট লুকান", "Hide recent mock tests")
                    : t(lang, "সাম্প্রতিক মক টেস্ট দেখান", "Show recent mock tests")}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg border min-h-[44px] min-w-[44px]"
                  style={{ borderColor: "var(--dashboard-border-muted)", color: "var(--dashboard-text-secondary)", background: "var(--dashboard-surface-muted)" }}
                >
                  <CaretRight className={`h-3.5 w-3.5 rotate-90 transition-transform ${mocksOpen ? "rotate-[270deg]" : ""}`} aria-hidden="true" />
                </button>
              </span>
            </div>
            {mocksOpen && (
            <div id="home-recent-mocks" className="space-y-2 px-5 pb-5">
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
                        {r.correct}/{r.total} {t(lang, "সঠিক", "correct")} · {new Date(r.createdAt).toLocaleDateString(lang === "bn" ? "bn-BD" : "en-GB", { day: "2-digit", month: "short" })}
                      </p>
                  </div>
                  <span className="text-xs font-mono font-extrabold flex items-center gap-1 tabular-nums" style={{ color: "var(--dashboard-text-primary)" }}>
                    {r.score}% <CaretRight className="w-3.5 h-3.5 opacity-50" />
                  </span>
                </button>
              ))}
            </div>
            )}
          </div>
        </RevealSection>
      )}

      {/* ── 8 · AI Study Coach — inline once per week when fresh, collapsed
             after (state-driven disclosure, same pattern as recent mocks). ── */}
      <RevealSection id="dashboard-ai-coach" className="scroll-mt-6" style={{ order: 8 }}>
        <CoachDisclosure />
      </RevealSection>
    </div>
  );
}