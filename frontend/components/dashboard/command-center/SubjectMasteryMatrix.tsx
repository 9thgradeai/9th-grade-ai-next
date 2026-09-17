"use client";

import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { BarChart3, ChevronDown, Play } from "lucide-react";
import { useLanguage, t, type Language } from "@/lib/lang-ctx";
import type { PreparationIntelligenceDTO, PrepIntelligenceSubjectPerformance } from "@/lib/types";

type SubjectMasteryMatrixProps = {
  intelligence: PreparationIntelligenceDTO | null;
  /** Trigger a topic-level practice session. */
  onDrill: (subject: string, topic: string) => void;
};

function accuracyTone(accuracy: number): string {
  if (accuracy >= 80) return "var(--dashboard-success)";
  if (accuracy >= 60) return "var(--dashboard-warning)";
  return "var(--dashboard-danger)";
}

function SubjectRow({
  subject,
  lang,
  onDrill,
}: {
  subject: PrepIntelligenceSubjectPerformance;
  lang: Language;
  onDrill: (subject: string, topic: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const tone = accuracyTone(subject.accuracy);
  const hasTopics = subject.topics.length > 0;

  return (
    <div
      className="rounded-2xl border overflow-hidden"
      style={{ background: "var(--dashboard-surface)", borderColor: "var(--dashboard-border-muted)" }}
    >
      <button
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        disabled={!hasTopics}
        className="w-full flex items-center justify-between gap-3 p-4 text-left transition-colors hover:bg-[var(--dashboard-surface-muted)] disabled:cursor-default"
      >
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <span
            className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: "var(--dashboard-primary-subtle)", border: "1px solid color-mix(in srgb, var(--dashboard-primary) 20%, transparent)", color: "var(--dashboard-primary)" }}
          >
            <BarChart3 className="w-5 h-5" aria-hidden="true" />
          </span>
          <div className="flex-1 min-w-0">
            <h4 className="text-sm font-medium truncate" style={{ color: "var(--dashboard-text-primary)" }}>{subject.subject}</h4>
            <p className="text-[11px] font-mono mt-0.5" style={{ color: "var(--dashboard-text-muted)" }}>
              {subject.attempted} {t(lang, "প্রশ্ন", "questions")} · {subject.correct} {t(lang, "সঠিক", "correct")}
              {hasTopics ? ` · ${subject.topics.length} ${t(lang, "টপিক", "topics")}` : ""}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <div className="text-right">
            <div className="font-bold font-mono" style={{ color: tone }}>{subject.accuracy}%</div>
            <div className="mt-1.5 w-24 h-1.5 rounded-full overflow-hidden" style={{ background: "var(--dashboard-surface-muted)" }}>
              <div className="h-full rounded-full" style={{ width: `${subject.accuracy}%`, background: tone }} />
            </div>
          </div>
          {hasTopics && (
            <motion.span animate={{ rotate: expanded ? 180 : 0 }} className="text-[var(--dashboard-primary)]">
              <ChevronDown className="w-4 h-4" aria-hidden="true" />
            </motion.span>
          )}
        </div>
      </button>

      <AnimatePresence>
        {expanded && hasTopics && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden border-t"
            style={{ borderColor: "color-mix(in srgb, var(--dashboard-primary) 10%, transparent)" }}
          >
            <div className="p-3 space-y-1.5">
              {subject.topics.map((topic) => {
                const tt = accuracyTone(topic.accuracy);
                return (
                  <div
                    key={`${topic.subject}-${topic.topic}`}
                    className="flex items-center justify-between gap-3 rounded-xl border px-3 py-2"
                    style={{ background: "var(--dashboard-surface-muted)", borderColor: "var(--dashboard-border-muted)" }}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold truncate" style={{ color: "var(--dashboard-text-primary)" }}>{topic.topic}</p>
                      <p className="text-[11px] font-mono mt-0.5" style={{ color: "var(--dashboard-text-muted)" }}>
                        {topic.attempted} · {topic.correct} ✓
                      </p>
                    </div>
                    <span className="text-xs font-mono font-extrabold shrink-0" style={{ color: tt }}>{topic.accuracy}%</span>
                    <button
                      onClick={() => onDrill(topic.subject, topic.topic)}
                      className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold transition-colors"
                      style={{ background: "var(--dashboard-primary-subtle)", color: "var(--dashboard-primary)", border: "1px solid color-mix(in srgb, var(--dashboard-primary) 24%, transparent)" }}
                    >
                      <Play className="w-3 h-3" aria-hidden="true" />
                      {t(lang, "অভ্যাস", "Practice")}
                    </button>
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function SubjectMasteryMatrix({ intelligence, onDrill }: SubjectMasteryMatrixProps) {
  const { lang } = useLanguage();
  const subjects = useMemo(
    () => (intelligence?.subjectPerformance ?? []).filter((s) => s.attempted > 0),
    [intelligence],
  );

  if (subjects.length === 0) {
    return (
      <div
        className="rounded-2xl border text-center py-10"
        style={{ background: "var(--dashboard-surface)", borderColor: "var(--dashboard-border-muted)" }}
      >
        <p className="text-3xl mb-3">📚</p>
        <p className="text-sm" style={{ color: "var(--dashboard-text-secondary)" }}>
          {t(lang, "এখনো কোনো বিষয়ে প্রশ্ন সমাধান করা হয়নি।", "No subject attempts yet — start practicing to unlock subject analytics.")}
        </p>
      </div>
    );
  }

  return (
    <section className="space-y-3" aria-label={t(lang, "বিষয়ভিত্তিক নিপুণতা", "Subject mastery")}>
      {subjects.map((s, i) => (
        <motion.div
          key={s.subject}
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 * i }}
        >
          <SubjectRow subject={s} lang={lang} onDrill={onDrill} />
        </motion.div>
      ))}
    </section>
  );
}