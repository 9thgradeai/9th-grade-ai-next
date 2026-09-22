"use client";

import { useEffect, useMemo, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Clock, ArrowRight, Flame, Trophy, CaretRight, ArrowCounterClockwise } from "@phosphor-icons/react";
import { useAuth } from "@/lib/auth-ctx";
import { useDashboardStore } from "@/lib/store-ctx/dashboard";
import { useLanguage, t } from "@/lib/lang-ctx";
import { useToastSafe } from "@/lib/toast-ctx";
import { api } from "@/lib/services/api";
import type { Server, PrepIntelligenceRecommendation } from "@/lib/types";
import StreakHeatmap from "./StreakHeatmap";
import HomeCoach from "./ai/HomeCoach";
import { useExamDaysLeft } from "./HomeTabHelpers";
import TodayMission from "./command-center/TodayMission";
import PreparationPulse from "./command-center/PreparationPulse";
import ContinueLearning from "./command-center/ContinueLearning";
import RecommendedActions from "./command-center/RecommendedActions";
import PerformanceCard from "./command-center/PerformanceCard";
import type { PerfRange } from "./command-center/PerformanceCard";
import TodayPlanCard from "./command-center/TodayPlanCard";
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

const STAGGER = { hidden: {}, show: { transition: { staggerChildren: 0.03, delayChildren: 0.01 } } };
const STAGGER_ITEM = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: { type: "spring" as const, stiffness: 320, damping: 30 } },
};

export default function HomeTab() {
  const { user } = useAuth();
  const { setActiveTab, setPracticeIntent, setMistakeIntent, setQuestionBankFilters } = useDashboardStore();
  const { lang } = useLanguage();
  const toast = useToastSafe();
  const reduceMotion = useReducedMotion();

  const [intelligence, setIntelligence] = useState<Server.PreparationIntelligenceDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [perfRange, setPerfRange] = useState<PerfRange>("30D");

  useEffect(() => {
    let cancelled = false;
    void api
      .preparationIntelligence()
      .then((v) => {
        if (!cancelled) setIntelligence(v);
      })
      .catch(() => {
        if (!cancelled) setLoadFailed(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

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
      setLoading(true);
      setLoadFailed(false);
      setReloadKey((k) => k + 1);
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
  }, [setActiveTab, setPracticeIntent]);

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
        launchAI({ mode: "tutor" });
      } else if (key === "F") {
        setActiveTab("flashcards");
      } else if (key === "Q") {
        setActiveTab("question-bank");
      } else if (key === "L") {
        setActiveTab("study-planner");
      } else if (key === "R") {
        setLoading(true);
        setLoadFailed(false);
        setReloadKey((k) => k + 1);
        toast.success(t(lang, "হোম ডেটা রিফ্রেশ হয়েছে", "Home data refreshed"));
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [setActiveTab, setPracticeIntent, toast, lang]);

  const skeleton = loading && !intelligence;

  if (loadFailed && !skeleton) {
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
            setLoading(true);
            setLoadFailed(false);
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
    <motion.div variants={STAGGER} initial={reduceMotion ? false : "hidden"} animate="show" className="study-home space-y-5 pb-24 sm:pb-6">
      <motion.header variants={STAGGER_ITEM} className="study-home-header flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-display text-xl font-semibold tracking-tight text-[var(--dashboard-text-primary)]">
            {t(lang, "প্রস্তুতির সারাংশ", "Preparation overview")}
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-[var(--dashboard-text-secondary)]">
            <span className="inline-flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-[var(--dashboard-primary)]" aria-hidden="true" /> {user?.examTarget ?? t(lang, "লক্ষ্য নির্ধারিত হয়নি", "Target not set")}
              {nextExam ? ` · ${t(lang, nextExam.titleBn, nextExam.titleEn)}` : ""}
            </span>
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
        </div>

        {nextExam && examDaysLeft != null && (
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

      {/* ── Secondary: Pulse — compact, muted ── */}
      <motion.div variants={STAGGER_ITEM} className={skeleton ? "opacity-60 pointer-events-none" : ""}>
        <PreparationPulse intelligence={intelligence} />
      </motion.div>

      <div className="study-home-analytics grid gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <motion.div variants={STAGGER_ITEM} className="min-w-0 opacity-[0.98]">
          <PerformanceCard
            activity={intelligence?.activity ?? []}
            results={results}
            range={perfRange}
            onRangeChange={setPerfRange}
            loading={loading}
          />
        </motion.div>
        <motion.div variants={STAGGER_ITEM} className="min-w-0">
          <TodayPlanCard
            tasks={todaysTasks}
            onToggle={toggleTask}
            onTaskAdded={() => setReloadKey((k) => k + 1)}
          />
        </motion.div>
      </div>

      {/* ── Hero Mission — primary CTA with command-card--hero treatment ── */}
      <div className="grid gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <motion.div variants={STAGGER_ITEM} className="min-w-0">
          <TodayMission
            intelligence={intelligence}
            onStartPractice={practiceSubject}
            onStartMistakes={() => mistakeSubject()}
            onReviewFlashcards={() => setActiveTab("flashcards")}
            onStartDailyQuiz={() => setActiveTab("practice")}
          />
        </motion.div>
        <motion.div variants={STAGGER_ITEM} className="min-w-0">
          <RecommendedActions intelligence={intelligence} onAction={handleRecommendation} />
        </motion.div>
      </div>

      <motion.div variants={STAGGER_ITEM}>
        <ContinueLearning
          intelligence={intelligence}
          onResumeExam={() => setActiveTab("practice")}
          onStartDailyQuiz={() => setActiveTab("practice")}
        />
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
    </motion.div>
  );
}