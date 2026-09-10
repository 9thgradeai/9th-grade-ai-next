"use client";

import { useLanguage, t, type Language } from "@/lib/lang-ctx";
import { ChevronRight, Zap, BookOpen, AlertCircle, Layers, CalendarCheck2, Target } from "lucide-react";
import type { PreparationIntelligenceDTO, PrepIntelligenceRecommendation } from "@/lib/types";

type RecommendedActionsProps = {
  intelligence: PreparationIntelligenceDTO | null;
  onAction: (rec: PrepIntelligenceRecommendation) => void;
};

const REC_ICON: Record<string, typeof Zap> = {
  "resume-exam": CalendarCheck2,
  "practice-weak-topic": Target,
  "practice-weak-subject": Target,
  "review-mistakes": AlertCircle,
  "review-flashcards": Layers,
  "daily-quiz": BookOpen,
  "daily-warmup": Zap,
  "exam-near": CalendarCheck2,
  "keep-going": Zap,
};

function recTitle(rec: PrepIntelligenceRecommendation, lang: Language): string {
  const bn = (b: string, e: string) => t(lang, b, e);
  switch (rec.id) {
    case "resume-exam":
      return bn("অসমাপ্ত মক টেস্ট শেষ করুন", "Finish your in-progress mock test");
    case "practice-weak-topic":
      return rec.topic
        ? bn(`${rec.subject} → ${rec.topic}`, `${rec.subject} → ${rec.topic}`)
        : bn("দুর্বল টপিকে অভ্যাস করুন", "Practice your weakest topic");
    case "practice-weak-subject":
      return rec.subject
        ? bn(`${rec.subject} অভ্যাস করুন`, `Practice ${rec.subject}`)
        : bn("দুর্বল বিষয় অভ্যাস করুন", "Practice your weak subject");
    case "review-mistakes":
      return bn(`${rec.count ?? 0}টি ভুল পর্যালোচনা করুন`, `Review ${rec.count ?? 0} mistakes`);
    case "review-flashcards":
      return bn(`${rec.count ?? 0}টি ফ্ল্যাশকার্ড বাকি`, `${rec.count ?? 0} flashcards due`);
    case "daily-quiz":
      return bn("আজকের দৈনিক কুইজ দিন", "Take today's daily quiz");
    case "exam-near":
      return bn(`পরীক্ষার ${rec.count ?? 0} দিন বাকি`, `${rec.count ?? 0} days to the exam`);
    case "daily-warmup":
      return bn("আজকের ওয়ার্ম-আপ সম্পন্ন করুন", "Complete today's warm-up");
    default:
      return bn("প্র্যাকটিস চালিয়ে যান", "Keep practicing");
  }
}

function recDescription(rec: PrepIntelligenceRecommendation, lang: Language): string {
  const bn = (b: string, e: string) => t(lang, b, e);
  switch (rec.id) {
    case "resume-exam":
      return bn("শুরু করা পরীক্ষা শেষ করলে প্রস্তুতির হিসাব হালনাগাদ হয়।", "Finishing it keeps your performance snapshot accurate.");
    case "practice-weak-topic":
      return rec.accuracy != null
        ? bn(`নির্ভুলতা ${rec.accuracy}% · ${rec.count ?? 0}টি প্রচেষ্টা`, `Accuracy ${rec.accuracy}% · ${rec.count ?? 0} attempts`)
        : bn("ভিত্তি শক্ত করতে টার্গেটেড প্র্যাকটিস করুন।", "Targeted practice to build a stronger foundation.");
    case "practice-weak-subject":
      return rec.accuracy != null
        ? bn(`নির্ভুলতা ${rec.accuracy}% — ধীরে ধীরে বাড়ান।`, `Accuracy ${rec.accuracy}% — improve it gradually.`)
        : bn("সবচেয়ে দুর্বল বিষয়ে ফোকাস করুন।", "Focus on your weakest subject.");
    case "review-mistakes":
      return bn("ভুল প্রশ্ন পুনরায় সমাধান করলে সবচেয়ে দ্রুত উন্নতি হয়।", "Re-solving missed questions is the fastest improvement lever.");
    case "review-flashcards":
      return bn("স্পেসড রিপিটিশন শিডিউল অনুযায়ী পর্যালোচনা করুন।", "Keep pace with your spaced-repetition schedule.");
    case "daily-quiz":
      return bn("ছোট ওয়ার্ম-আপ — স্ট্রিক সুরক্ষায় দারুণ।", "A short warm-up that keeps your streak alive.");
    case "exam-near":
      return bn("মক টেস্ট দিয়ে দুর্বল এলাকা চিহ্নিত করুন।", "Use full mock tests to find remaining bottlenecks.");
    case "daily-warmup":
      return bn("আজ এখনো কোনো প্রশ্ন নেই — ১০টি দিয়ে শুরু করুন।", "Nothing solved today — start with a quick set.");
    default:
      return bn("নিয়মিত অভ্যাসই চাবিকাঠি।", "Consistency is the key.");
  }
}

export default function RecommendedActions({ intelligence, onAction }: RecommendedActionsProps) {
  const { lang } = useLanguage();
  const recs = (intelligence?.recommendations ?? []).slice(0, 3);

  if (recs.length === 0) return null;

  return (
    <section
      className="rounded-2xl border p-5"
      style={{ background: "var(--dashboard-surface)", borderColor: "var(--dashboard-border-muted)" }}
      aria-labelledby="recommended-actions-title"
    >
      <h3 id="recommended-actions-title" className="command-eyebrow flex items-center gap-1.5">
        <Zap className="w-3.5 h-3.5" />
        {t(lang, "আপনার জন্য প্রস্তাবিত", "Recommended for you")}
      </h3>

      <ol className="mt-3 space-y-2">
        {recs.map((rec, i) => {
          const Icon = REC_ICON[rec.id] ?? Zap;
          const tone =
            rec.priority === "high"
              ? "var(--dashboard-primary)"
              : "var(--dashboard-text-secondary)";
          return (
            <li key={`${rec.id}-${i}`}>
              <button
                onClick={() => onAction(rec)}
                className="w-full flex items-center gap-3 rounded-xl border p-3 text-left transition-colors hover:border-[var(--dashboard-primary)]/40"
                style={{ background: "var(--dashboard-surface-muted)", borderColor: "var(--dashboard-border-muted)" }}
              >
                <span
                  className="flex items-center justify-center w-9 h-9 rounded-lg shrink-0 border"
                  style={{ background: "var(--dashboard-surface)", color: tone, borderColor: "var(--dashboard-border-muted)" }}
                  aria-hidden="true"
                >
                  <Icon className="w-4 h-4" />
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-bold truncate" style={{ color: "var(--dashboard-text-primary)" }}>
                    {i + 1}. {recTitle(rec, lang)}
                  </span>
                  <span className="block text-[11px] mt-0.5 line-clamp-2" style={{ color: "var(--dashboard-text-muted)" }}>
                    {recDescription(rec, lang)}
                  </span>
                </span>
                <ChevronRight className="w-4 h-4 shrink-0" style={{ color: "var(--dashboard-text-muted)" }} aria-hidden="true" />
              </button>
            </li>
          );
        })}
      </ol>
    </section>
  );
}