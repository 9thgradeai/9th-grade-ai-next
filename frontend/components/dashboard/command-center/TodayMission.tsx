"use client";

import { useMemo } from "react";
import { Crosshair, Target, ArrowRight, Clock, ShieldCheck } from "@phosphor-icons/react";
import { useLanguage, t, type Language } from "@/lib/lang-ctx";
import type { PreparationIntelligenceDTO, PrepIntelligenceRecommendation } from "@/lib/types";

const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

type TodayMissionProps = {
  intelligence: PreparationIntelligenceDTO | null;
  onStartPractice: (subject?: string) => void;
  onStartMistakes: () => void;
  onReviewFlashcards: () => void;
  onStartDailyQuiz: () => void;
};

export type MissionDescriptor = {
  id: string;
  title: string;
  sub: string | null;
  detail: string | null;
  estimateMin: number | null;
  cta: string;
  action: "practice" | "mistakes" | "flashcards" | "quiz";
  subject?: string;
  priority: "high" | "medium" | "low";
};

/**
 * Picks the single highest-value mission for "what should I do now?" from REAL
 * server-side analytics. Deterministic — never invented. Falls back to an
 * honest onboarding mission when the candidate has no data yet.
 */
export function selectMission(
  intel: PreparationIntelligenceDTO | null,
  lang: Language = "bn",
): MissionDescriptor | null {
  if (!intel) return null;
  const recs = intel.recommendations;
  return recs.length > 0 ? missionFromRecommendation(recs[0], lang) : null;
}

function missionFromRecommendation(
  rec: PrepIntelligenceRecommendation,
  lang: Language,
): MissionDescriptor {
  const bn = (b: string, e: string) => t(lang, b, e);
  const estimateMin = rec.count ? Math.max(8, Math.round(rec.count * 0.75)) : 12;

  switch (rec.id) {
    case "resume-exam":
      return {
        id: rec.id,
        title: bn("অসমাপ্ত মক টেস্ট শেষ করুন", "Finish your mock test"),
        sub: null,
        detail: bn("একটি মক টেস্ট চলছে — শেষ করলে আপনার প্রস্তুতি হিসাব হালনাগাদ হবে।", "An in-progress mock test — finishing it refreshes your preparation snapshot."),
        estimateMin: null,
        cta: bn("পরীক্ষা আবার শুরু করুন", "Resume test"),
        action: "quiz",
        priority: "high",
      };
    case "practice-weak-topic":
      return {
        id: rec.id,
        title: bn(`${rec.topic ?? ""} শক্তিশালী করুন`, `Strengthen ${rec.topic ?? ""}`),
        sub: rec.subject ? `${rec.subject} → ${rec.topic ?? ""}` : null,
        detail: rec.accuracy != null
          ? bn(`${rec.count}টি প্রশ্ন · বর্তমান নির্ভুলতা ${rec.accuracy}%`, `${rec.count} questions · current accuracy ${rec.accuracy}%`)
          : null,
        estimateMin,
        cta: bn("মিশন শুরু করুন", "Start mission"),
        action: "practice",
        subject: rec.subject,
        priority: rec.priority,
      };
    case "practice-weak-subject":
      return {
        id: rec.id,
        title: rec.subject ? bn(`${rec.subject} অভ্যাস করুন`, `Practice ${rec.subject}`) : bn("দুর্বল বিষয়ে অভ্যাস করুন", "Practice your weak subject"),
        sub: rec.accuracy != null ? bn(`নির্ভুলতা ${rec.accuracy}%`, `Accuracy ${rec.accuracy}%`) : null,
        detail: rec.count ? bn(`${rec.count} টি প্রশ্ন সমাধান করেছেন`, `${rec.count} questions solved`) : null,
        estimateMin,
        cta: bn("অভ্যাস শুরু করুন", "Start practice"),
        action: "practice",
        subject: rec.subject,
        priority: rec.priority,
      };
    case "review-mistakes":
      return {
        id: rec.id,
        title: bn(`${rec.count ?? 0}টি ভুল পুনরুদ্ধার করুন`, `Recover ${rec.count ?? 0} mistakes`),
        sub: bn("ভুলের নোট", "Mistake notebook"),
        detail: bn("ভুল করা প্রশ্ন পুনরায় সমাধান করলে একই ভুল আর হবে না।", "Re-solving missed questions locks in the correct approach."),
        estimateMin,
        cta: bn("ভুল পর্যালোচনা করুন", "Review mistakes"),
        action: "mistakes",
        priority: rec.priority,
      };
    case "review-flashcards":
      return {
        id: rec.id,
        title: bn(`${rec.count ?? 0}টি ফ্ল্যাশকার্ড পর্যালোচনা করুন`, `Review ${rec.count ?? 0} flashcards`),
        sub: bn("স্পেসড রিপিটিশন", "Spaced repetition"),
        detail: bn("নির্ধারিত পুনরাবৃত্তি মুখস্থকে দীর্ঘমেয়াদী স্মৃতিতে নিয়ে যায়।", "Scheduled review moves facts into long-term recall."),
        estimateMin,
        cta: bn("ফ্ল্যাশকার্ড দেখুন", "Review flashcards"),
        action: "flashcards",
        priority: rec.priority,
      };
    case "daily-quiz":
      return {
        id: rec.id,
        title: bn("আজকের চ্যালেঞ্জটি সম্পন্ন করুন", "Take today's challenge"),
        sub: bn("দৈনিক কুইজ", "Daily quiz"),
        detail: bn("ছোট, দ্রুত ওয়ার্ম-আপ — স্ট্রিক সুরক্ষিত করুন।", "Short high-value warm-up that protects your streak."),
        estimateMin: 5,
        cta: bn("কুইজ শুরু করুন", "Start quiz"),
        action: "quiz",
        priority: rec.priority,
      };
    case "exam-near":
      return {
        id: rec.id,
        title: bn(`পরীক্ষার ${rec.count ?? 0} দিন বাকি`, `${rec.count ?? 0} days to the exam`),
        sub: bn("মক টেস্ট কৌশল", "Mock-test strategy"),
        detail: bn("দুর্বল এলাকা চিহ্নিত করতে এখন নিয়মিত মক টেস্ট দিন।", "Practice full mock tests now to find your bottlenecks."),
        estimateMin,
        cta: bn("মক টেস্ট দিন", "Take a mock test"),
        action: "quiz",
        priority: rec.priority,
      };
    case "daily-warmup":
      return {
        id: rec.id,
        title: bn("আজকের ওয়ার্ম-আপ সম্পন্ন করুন", "Complete today's warm-up"),
        sub: null,
        detail: bn("আজ এখনো কোনো প্রশ্ন সমাধান হয়নি — ১০টি প্রশ্ন দিয়ে শুরু করুন।", "Nothing solved today — a quick set keeps your momentum."),
        estimateMin: 10,
        cta: bn("ওয়ার্ম-আপ শুরু করুন", "Start warm-up"),
        action: "practice",
        priority: rec.priority,
      };
    case "keep-going":
      return {
        id: rec.id,
        title: bn("অভ্যাস চালিয়ে যান", "Keep your momentum"),
        sub: null,
        detail: bn("নিয়মিত অভ্যাসই পরীক্ষায় ভালো করার চাবিকাঠি।", "Consistency is the key to exam success."),
        estimateMin: 10,
        cta: bn("প্র্যাকটিস চালিয়ে যান", "Keep practicing"),
        action: "practice",
        priority: "low",
      };
    default:
      return {
        id: rec.id,
        title: bn("আজকের মিশন", "Today's mission"),
        sub: null,
        detail: null,
        estimateMin: null,
        cta: bn("শুরু করুন", "Start"),
        action: "practice",
        priority: "medium",
      };
  }
}

export default function TodayMission({
  intelligence,
  onStartPractice,
  onStartMistakes,
  onReviewFlashcards,
  onStartDailyQuiz,
}: TodayMissionProps) {
  const { lang } = useLanguage();
  const mission = useMemo(() => selectMission(intelligence, lang), [intelligence, lang]);

  const overall = intelligence?.overall;
  const studyTasksToday = useMemo(
    () => (intelligence?.studyTasks ?? []).filter((task) => task.day === WEEKDAY_NAMES[new Date().getDay()]),
    [intelligence?.studyTasks],
  );
  const planTotal = studyTasksToday.length;
  const planDone = studyTasksToday.filter((task) => task.completed).length;
  const planPct = planTotal > 0 ? Math.round((planDone / planTotal) * 100) : 0;
  const accuracy = overall?.accuracy ?? 0;
  const hasPlan = planTotal > 0;
  const hasOverall = (overall?.totalAttempts ?? 0) > 0;
  const orbitPct = hasPlan ? planPct : hasOverall ? Math.round(accuracy) : 0;
  const orbitLabel = hasPlan
    ? t(lang, "আজকের প্ল্যান অগ্রগতি", "Today's plan progress")
    : hasOverall
      ? t(lang, "সার্বিক নির্ভুলতা", "Overall accuracy")
      : t(lang, "প্রস্তুতি শুরু হোক", "Begin preparation");
  const orbitValue = hasPlan ? `${planDone}/${planTotal}` : hasOverall ? `${accuracy}%` : "—";
  const hasData =
    (overall?.totalAttempts ?? 0) > 0 ||
    (intelligence?.recommendations.length ?? 0) > 0;

  const runAction = (m: MissionDescriptor) => {
    switch (m.action) {
      case "practice":
        onStartPractice(m.subject);
        break;
      case "mistakes":
        onStartMistakes();
        break;
      case "flashcards":
        onReviewFlashcards();
        break;
      case "quiz":
        onStartDailyQuiz();
        break;
      default:
        onStartPractice();
    }
  };

  const accentColor =
    mission?.priority === "high"
      ? "var(--dashboard-primary)"
      : mission?.priority === "medium"
        ? "var(--dashboard-info)"
        : "var(--dashboard-text-secondary)";

  const progressSentence = hasPlan
    ? t(lang, `${planDone} / ${planTotal} টি কাজ সম্পন্ন`, `${planDone} of ${planTotal} tasks done`)
    : hasOverall
      ? t(lang, `${accuracy}% নির্ভুলতা — সব সময়ের গড়`, `${accuracy}% accuracy — all-time average`)
      : t(lang, "প্রথম প্রশ্ন সমাধান করলে এখানে অগ্রগতি দেখা যাবে", "Solve your first question and progress appears here");

  const ORBIT_CIRCUMFERENCE = 2 * Math.PI * 44;
  const clampedPct = Math.max(0, Math.min(100, orbitPct));
  const orbitDash = `${(ORBIT_CIRCUMFERENCE * clampedPct) / 100} ${ORBIT_CIRCUMFERENCE}`;
  const hasMission = Boolean(mission) && hasData;

  return (
    <section
      className="command-card command-card--hero study-mission relative overflow-hidden"
      aria-labelledby="today-mission-title"
    >
      <div className="command-aurora opacity-60" aria-hidden="true" />
      <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center">
        <div className="study-orbit relative shrink-0 self-start lg:self-center" aria-hidden="true">
          <svg viewBox="0 0 120 120" className="h-32 w-32 lg:h-40 lg:w-40">
            <circle cx="60" cy="60" r="54" fill="none" stroke="var(--dashboard-border-muted)" strokeWidth="1" />
            <circle cx="60" cy="60" r="35" fill="none" stroke="var(--dashboard-border-muted)" strokeWidth="1" strokeDasharray="2 4" />
            <circle
              cx="60"
              cy="60"
              r="44"
              fill="none"
              stroke={hasPlan || hasOverall ? "var(--dashboard-primary)" : "var(--dashboard-border-strong)"}
              strokeWidth="5"
              strokeLinecap="round"
              strokeDasharray={orbitDash}
              transform="rotate(-90 60 60)"
              className="transition-[stroke-dasharray] duration-700 ease-out"
            />
            {hasPlan || hasOverall ? (
              <circle
                cx={60 + 54 * Math.cos((2 * Math.PI * Math.max(0, Math.min(100, orbitPct))) / 100 - Math.PI / 2)}
                cy={60 + 54 * Math.sin((2 * Math.PI * Math.max(0, Math.min(100, orbitPct))) / 100 - Math.PI / 2)}
                r="4"
                fill="var(--dashboard-primary)"
              />
            ) : null}
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
            <p className="font-mono text-lg font-bold leading-none text-[var(--dashboard-text-primary)]">{orbitValue}</p>
            <p className="mt-1 text-[9px] font-bold uppercase tracking-[0.14em] text-[var(--dashboard-text-muted)]">{orbitLabel}</p>
          </div>
        </div>

        <div className="min-w-0 flex-1">
          <p className="command-eyebrow flex items-center gap-1.5">
            <Crosshair className="w-3.5 h-3.5" style={{ color: "var(--dashboard-primary)" }} />
            {t(lang, "আজকের মিশন", "Today's Mission")}
          </p>

          {!hasMission ? (
            <div className="mt-3">
              <h2
                id="today-mission-title"
                className="font-display font-black text-xl sm:text-2xl tracking-tight"
                style={{ color: "var(--dashboard-text-primary)" }}
              >
                {t(lang, "আপনার প্রস্তুতি যাত্রা শুরু হোক", "Your preparation journey starts here")}
              </h2>
              <p className="text-sm mt-1.5" style={{ color: "var(--dashboard-text-secondary)" }}>
                {t(
                  lang,
                  "কয়েকটি প্রশ্ন সমাধান করলে আমরা আপনার শক্তি-দুর্বলতা চিহ্নিত করে প্রথম মিশন দেব।",
                  "Solve a few questions and we'll build your first mission from real performance data.",
                )}
              </p>
            </div>
          ) : (
            <div className="mt-3">
              <h2
                id="today-mission-title"
                className="font-display font-black text-xl sm:text-2xl tracking-tight"
                style={{ color: "var(--dashboard-text-primary)" }}
              >
                {mission!.title}
              </h2>
              {mission!.sub && (
                <p className="text-xs font-mono font-bold mt-1" style={{ color: accentColor }}>
                  {mission!.sub}
                </p>
              )}
              {mission!.detail && (
                <p className="text-sm mt-1.5" style={{ color: "var(--dashboard-text-secondary)" }}>
                  {mission!.detail}
                </p>
              )}
              {mission!.estimateMin != null && (
                <p
                  className="text-xs mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border"
                  style={{ color: "var(--dashboard-text-muted)", borderColor: "var(--dashboard-border-muted)", background: "var(--dashboard-surface-muted)" }}
                >
                  <Clock className="w-3 h-3" aria-hidden="true" />
                  {t(lang, `আনুমানিক ${mission!.estimateMin} মিনিট`, `Est. ${mission!.estimateMin} minutes`)}
                </p>
              )}
            </div>
          )}

          <p className="mt-4 text-xs" role="status" aria-live="polite" style={{ color: "var(--dashboard-text-muted)" }}>
            {progressSentence}
          </p>
        </div>

        <div className="flex shrink-0 flex-col items-stretch gap-3 lg:items-end">
          <button
            onClick={() => mission && runAction(mission)}
            disabled={!mission}
            className="command-primary-btn inline-flex items-center justify-center gap-2"
          >
            <Target className="w-4 h-4" aria-hidden="true" />
            {mission?.cta ?? t(lang, "শুরু করুন", "Start")}
            <ArrowRight className="w-4 h-4" aria-hidden="true" />
          </button>
          <p className="flex items-center gap-1.5 text-[11px] lg:justify-end" style={{ color: "var(--dashboard-text-muted)" }}>
            <ShieldCheck className="w-3 h-3 shrink-0" aria-hidden="true" />
            {t(
              lang,
              "মিশনটি আপনার সর্বশেষ ডেটা থেকে তৈরি — প্রতিটি সংখ্যা বাস্তব।",
              "This mission is derived from your latest data — every figure is real.",
            )}
          </p>
        </div>
      </div>
    </section>
  );
}
