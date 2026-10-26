"use client";

import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Sparkle,
  CaretDown,
  CaretUp,
  CheckCircle,
  XCircle,
  BookOpen,
  Lightbulb,
  ShieldCheck,
  Warning,
} from "@phosphor-icons/react";
import { getExplanation, type ExplainOptions } from "@/lib/services/ai/explain";
import {
  getVerifiedExplanation,
  isVerifiedExplanationUnavailable,
} from "@/lib/services/ai/explain-v2";
import { AIError } from "@/lib/services/ai/client";
import type { AIExplanationDto } from "@/lib/types";
import type { VerifiedExplanationDto } from "@/lib/types/verified-explanation";
import AISourceFooter from "./ai/AISourceFooter";
import RichText from "@/components/ui/RichText";
import VerifiedExplanation from "./ai/VerifiedExplanation";

type AIExplanationButtonProps = ExplainOptions & {
  /** Every selected option (multi-answer). Preferred over the serialised string. */
  selectedAnswers?: string[];
};

const OPTION_LABELS = ["A", "B", "C", "D", "E", "F"];

type Mode = "verified" | "legacy";

export default function AIExplanationButton(props: AIExplanationButtonProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [verified, setVerified] = useState<VerifiedExplanationDto | null>(null);
  const [legacy, setLegacy] = useState<AIExplanationDto | null>(null);
  const [mode, setMode] = useState<Mode | null>(null);
  const [fallbackReason, setFallbackReason] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  const handleExplain = useCallback(() => {
    if (mode) {
      setExpanded((e) => !e);
      return;
    }

    setLoading(true);
    setError(null);

    const loadLegacy = async (reason: string | null) => {
      const data = await getExplanation(props);
      setLegacy(data);
      setMode("legacy");
      setFallbackReason(reason);
      setExpanded(true);
    };

    void (async () => {
      let reason: string | null = null;

      if (props.questionId) {
        try {
          const { data } = await getVerifiedExplanation({
            questionId: props.questionId,
            selectedAnswers: props.selectedAnswers,
            selectedAnswer:
              props.selectedAnswers && props.selectedAnswers.length > 0
                ? undefined
                : props.userAnswer,
            displayOptions: props.options,
            enableSearch: true,
          });
          setVerified(data);
          setMode("verified");
          setExpanded(true);
          return;
        } catch (err) {
          if (!isVerifiedExplanationUnavailable(err)) throw err;
          reason =
            err instanceof AIError
              ? `${err.code} (${err.status})`
              : "verification service unavailable";
        }
      } else {
        reason = "no-question-id";
      }

      await loadLegacy(reason);
    })()
      .catch((err) => {
        setError(err instanceof Error ? err.message : "AI ব্যাখ্যা লোড করা যায়নি।");
      })
      .finally(() => {
        setLoading(false);
      });
  }, [mode, props]);

  const isVerified = mode === "verified" && verified !== null;
  const hasResult = isVerified || (mode === "legacy" && legacy !== null);

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={handleExplain}
        disabled={loading}
        aria-expanded={expanded && hasResult}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-mono rounded-lg border transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        style={{
          background: isVerified
            ? "var(--dashboard-success-subtle, var(--dashboard-primary-subtle))"
            : "var(--dashboard-primary-subtle)",
          borderColor: isVerified ? "var(--dashboard-success)" : "var(--primary)",
          color: isVerified ? "var(--dashboard-success)" : "var(--dashboard-primary)",
        }}
        title={
          isVerified
            ? "Independent, evidence-audited explanation"
            : "Standard AI explanation (not independently verified)"
        }
      >
        {loading ? (
          <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
        ) : isVerified ? (
          <ShieldCheck className="w-3 h-3" weight="bold" />
        ) : (
          <Sparkle className="w-3 h-3" />
        )}
        {loading
          ? "যাচাই করা হচ্ছে..."
          : hasResult
            ? expanded
              ? "বন্ধ করুন"
              : isVerified
                ? "যাচাইসহ ব্যাখ্যা দেখুন"
                : "ব্যাখ্যা দেখুন"
            : "AI ব্যাখ্যা"}
        {hasResult && !loading && (expanded ? <CaretUp className="w-3 h-3" /> : <CaretDown className="w-3 h-3" />)}
      </button>

      {error && <p className="text-[11px] text-[var(--dashboard-danger)] mt-1 font-mono">{error}</p>}

      <AnimatePresence>
        {expanded && hasResult && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            {isVerified && verified ? (
              <VerifiedExplanation result={verified} displayOptions={props.options} />
            ) : legacy ? (
              <div
                className="mt-3 space-y-3 rounded-xl border p-4"
                style={{
                  background: "var(--dashboard-surface-raised)",
                  borderColor: "var(--dashboard-primary)",
                  borderStyle: "dashed",
                }}
              >
                <div
                  className="flex items-start gap-2 rounded-lg border p-2.5"
                  style={{
                    borderColor: "var(--dashboard-warning)",
                    background: "var(--dashboard-warning-subtle, var(--dashboard-surface))",
                  }}
                >
                  <Warning className="w-4 h-4 flex-shrink-0 mt-0.5 text-[var(--dashboard-warning)]" />
                  <div>
                    <p className="text-[11px] font-mono font-bold uppercase tracking-wider text-[var(--dashboard-warning)]">
                      যাচাইকৃত নয় · unverified
                    </p>
                    <p className="text-[11px] text-[var(--dashboard-text-secondary)]">
                      এটি প্রচলিত AI ব্যাখ্যা — স্বাধীন বিশ্লেষণ বা উৎস-যাচাই ছাড়া। সংরক্ষিত Answer Key
                      অডিট করা হয়নি।
                      {fallbackReason ? ` (${fallbackReason})` : ""}
                    </p>
                  </div>
                </div>

                <div>
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <CheckCircle className="w-3.5 h-3.5 text-[var(--dashboard-success)]" />
                    <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-[var(--dashboard-success)]">
                      সঠিক উত্তর কেন
                    </span>
                  </div>
                  <p className="text-xs leading-relaxed" style={{ color: "var(--dashboard-text-primary)" }}>
                    <RichText text={legacy.correctAnswerExplanation} />
                  </p>
                </div>

                {legacy.whyOthersWrong.length > 0 && (
                  <div>
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <XCircle className="w-3.5 h-3.5 text-[var(--dashboard-danger)]" />
                      <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-[var(--dashboard-danger)]">
                        অন্য অপশন কেন ভুল
                      </span>
                    </div>
                    <div className="space-y-2">
                      {legacy.whyOthersWrong.map((item, i) => (
                        <div key={i} className="flex gap-2 text-xs">
                          <span className="font-mono font-bold text-[var(--dashboard-text-muted)] flex-shrink-0">
                            {OPTION_LABELS[props.options.indexOf(item.option)] ?? "?"}.
                          </span>
                          <div>
                            <span className="font-medium" style={{ color: "var(--dashboard-text-primary)" }}>
                              <RichText text={`${item.option}: `} />
                            </span>
                            <span style={{ color: "var(--dashboard-text-secondary)" }}>
                              <RichText text={item.reason} />
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {legacy.keyDefinitions && legacy.keyDefinitions.length > 0 && (
                  <div>
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <BookOpen className="w-3.5 h-3.5 text-[var(--dashboard-primary)]" />
                      <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-[var(--dashboard-primary)]">
                        মূল সংজ্ঞা
                      </span>
                    </div>
                    <ul
                      className="list-disc list-inside text-xs space-y-0.5"
                      style={{ color: "var(--dashboard-text-secondary)" }}
                    >
                      {legacy.keyDefinitions.map((def, i) => (
                        <li key={i}>
                          <RichText text={def} />
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {legacy.relatedConcepts && (
                  <div>
                    <div className="flex items-center gap-1.5 mb-1">
                      <BookOpen className="w-3.5 h-3.5 text-[var(--dashboard-teal)]" />
                      <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-[var(--dashboard-teal)]">
                        সম্পর্কিত বিষয়
                      </span>
                    </div>
                    <p className="text-xs" style={{ color: "var(--dashboard-text-secondary)" }}>
                      <RichText text={legacy.relatedConcepts} />
                    </p>
                  </div>
                )}

                {legacy.examTip && (
                  <div className="rounded-lg p-2.5" style={{ background: "var(--dashboard-warning-subtle)" }}>
                    <div className="flex items-center gap-1.5 mb-1">
                      <Lightbulb className="w-3.5 h-3.5 text-[var(--dashboard-warning)]" />
                      <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-[var(--dashboard-warning)]">
                        পরীক্ষার টিপ
                      </span>
                    </div>
                    <p className="text-xs" style={{ color: "var(--dashboard-text-secondary)" }}>
                      <RichText text={legacy.examTip} />
                    </p>
                  </div>
                )}

                <AISourceFooter provider={legacy.source} model={legacy.model} />
              </div>
            ) : null}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
