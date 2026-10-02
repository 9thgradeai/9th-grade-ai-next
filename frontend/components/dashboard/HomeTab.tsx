"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import dynamic from "next/dynamic";
import { motion, useReducedMotion } from "framer-motion";
import { Clock, ArrowRight, Flame, Trophy, CaretRight, ArrowCounterClockwise, Stack } from "@phosphor-icons/react";
import { useAuth } from "@/lib/auth-ctx";
import { useDashboardStore } from "@/lib/store-ctx/dashboard";
import { useMotionCapabilities } from "@/lib/motion/device";
import { useMotionTier } from "@/lib/motion/use-motion-tier";
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
import ShortcutList from "./ShortcutList";
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

function RevealSection({ children, className, id }: { children: React.ReactNode; className?: string; id?: string }) {
  const { fullMotion } = useMotionTier();
  if (!fullMotion) {
    return (
      <div className={className} id={id}>
        {children}
      </div>
    );
  }
  return (
    <motion.div
      className={className}
      id={id}
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

  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const closeShortcuts = useCallback(() => setShortcutsOpen(false), []);
  const shortcutsRef = useDialogA11y<HTMLDivElement>(shortcutsOpen, closeShortcuts);

  // Phase 5: `?` opens the cheat-sheet only. Single-letter tab hijacks
  // (P/M/W/A/F/Q/L/R) are removed — QuickActions bound the same letters, so
  // one press fired two handlers and stole keystrokes from search fields.
  // Global navigation lives in the layout (⌘K, 1–0, ?, Esc).
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        (e.target instanceof HTMLElement && e.target.isContentEditable)
      ) {
        return;
      }
      // Never hijack keys while a dialog (command palette, sheets) is open.
      if (e.target instanceof HTMLElement && e.target.closest('[role="dialog"]')) return;
      if (e.key === "?") {
        e.preventDefault();
        setShortcutsOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

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

  return (
    <div className="study-home space-y-5 pb-24 sm:pb-6">
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
            <button
              type="button"
              onClick={() => setShortcutsOpen(true)}
              aria-label={t(lang, "কিবোর্ড শর্টকাট", "Keyboard shortcuts")}
              title="?"
              className="inline-flex items-center justify-center w-11 h-11 min-w-[44px] min-h-[44px] rounded-lg border font-mono text-xs font-bold transition-colors hover:border-[var(--dashboard-primary)]"
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
              <span className="inline-flex ml-1">
                <StreakHeatmap activeDays={activityDays} labels={WEEKDAY_LABELS_7} />
              </span>
            </span>
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

      {/* ── 1 · Hero Mission — the single primary CTA ── */}
      <RevealSection className="min-w-0">
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
          />
        )}
      </RevealSection>

      {/* ── 1b · Revision due strip — SRS cards needing review today ── */}
      {analyticsReady && (intelligence?.flashcardsDue ?? 0) > 0 && (
        <RevealSection className="min-w-0">
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

      {/* ── 2 · AI Hero: ask-first command bar ── */}
      <RevealSection className="min-w-0">
        <HomeHero signals={heroSignals} />
      </RevealSection>

      {/* ── 3 · Performance + today's plan (2-col) ── */}
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

      {/* ── 4 · Recommended actions (full width) ── */}
      <RevealSection className="min-w-0">
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
      </RevealSection>

      {/* ── 5 · Continue learning ── */}
      <RevealSection>
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

      {/* ── 6 · Secondary pulse — compact, muted, deferred ── */}
      <RevealSection>
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

      {/* ── 7 · Recent mocks — collapsed by default (history, not action) ── */}
      {results.length > 0 && (
        <RevealSection className="scroll-mt-6">
          <details className="group command-card">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-5">
              <span className="command-eyebrow">{t(lang, "সাম্প্রতিক মক টেস্ট", "Recent mock tests")}</span>
              <span className="flex shrink-0 items-center gap-2">
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    setActiveTab("progress");
                  }}
                  className="inline-flex items-center gap-1 text-xs font-bold"
                  style={{ color: "var(--dashboard-primary)" }}
                >
                  {t(lang, "পুরো টাইমলাইন", "Full timeline")} <ArrowRight className="w-3.5 h-3.5" />
                </button>
                <span
                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg border"
                  style={{ borderColor: "var(--dashboard-border-muted)", color: "var(--dashboard-text-secondary)", background: "var(--dashboard-surface-muted)" }}
                  aria-hidden="true"
                >
                  <CaretRight className="h-3.5 w-3.5 rotate-90 transition-transform group-open:rotate-[270deg]" />
                </span>
              </span>
            </summary>
            <div className="space-y-2 px-5 pb-5">
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
                  <span className="text-xs font-mono font-extrabold flex items-center gap-1 tabular-nums" style={{ color: "var(--dashboard-text-primary)" }}>
                    {r.score}% <CaretRight className="w-3.5 h-3.5 opacity-50" />
                  </span>
                </button>
              ))}
            </div>
          </details>
        </RevealSection>
      )}

      {/* ── 8 · AI Study Coach — collapsed by default, icon-only chevron ── */}
      <RevealSection id="dashboard-ai-coach" className="scroll-mt-6">
        <details className="group command-card">
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
            <span className="flex shrink-0 items-center gap-2">
              <span className="text-xs font-bold" style={{ color: "var(--dashboard-text-secondary)" }}>{t(lang, "খুলুন", "Open")}</span>
              <span
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border transition-transform group-open:rotate-180"
                style={{ borderColor: "var(--dashboard-border-muted)", color: "var(--dashboard-text-secondary)", background: "var(--dashboard-surface-muted)" }}
                aria-hidden="true"
              >
                <CaretRight className="h-3.5 w-3.5 rotate-90" />
              </span>
            </span>
          </summary>
          <div className="px-5 pb-5 pt-1 border-t" style={{ borderColor: "var(--dashboard-border-muted)" }}>
            <HomeCoach />
          </div>
        </details>
      </RevealSection>
      {/* ── Keyboard shortcut cheat-sheet (Phase 4 a11y, portaled: the
          motion ancestor's transform would break position:fixed) ── */}
      {shortcutsOpen &&
        createPortal(
          <div
            className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center p-4"
            style={{ background: "color-mix(in srgb, black 55%, transparent)" }}
            onClick={closeShortcuts}
          >
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
                className="inline-flex items-center justify-center w-11 h-11 min-w-[44px] min-h-[44px] rounded-lg border text-xs"
                style={{ borderColor: "var(--dashboard-border-muted)", color: "var(--dashboard-text-secondary)" }}
              >
                ✕
              </button>
            </div>
            <div className="mt-3">
              <ShortcutList />
            </div>
          </div>
          </div>,
          document.body,
        )}
    </div>
  );
}