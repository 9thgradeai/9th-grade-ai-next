"use client";

import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkle, CaretDown, CaretUp, CheckCircle, XCircle, BookOpen, Lightbulb } from "@phosphor-icons/react";
import { getExplanation, type ExplainOptions } from "@/lib/services/ai/explain";
import type { AIExplanationDto } from "@/lib/types";

type AIExplanationButtonProps = ExplainOptions;

const OPTION_LABELS = ["A", "B", "C", "D", "E", "F"];

export default function AIExplanationButton(props: AIExplanationButtonProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AIExplanationDto | null>(null);
  const [expanded, setExpanded] = useState(false);

  const handleExplain = useCallback(async () => {
    if (result) {
      setExpanded((e) => !e);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await getExplanation(props);
      setResult(data);
      setExpanded(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "AI ব্যাখ্যা লোড করা যায়নি।");
    } finally {
      setLoading(false);
    }
  }, [props, result]);

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={handleExplain}
        disabled={loading}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-mono rounded-lg border transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        style={{
          background: "var(--dashboard-primary-subtle)",
          borderColor: "var(--primary)",
          color: "var(--dashboard-primary)",
        }}
      >
        {loading ? (
          <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
        ) : (
          <Sparkle className="w-3 h-3" />
        )}
        {loading ? "ব্যাখ্যা তৈরি হচ্ছে..." : result ? (expanded ? "বন্ধ করুন" : "ব্যাখ্যা দেখুন") : "AI ব্যাখ্যা"}
        {result && !loading && (
          expanded ? <CaretUp className="w-3 h-3" /> : <CaretDown className="w-3 h-3" />
        )}
      </button>

      {error && (
        <p className="text-[10px] text-[var(--dashboard-danger)] mt-1 font-mono">{error}</p>
      )}

      <AnimatePresence>
        {result && expanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="mt-3 rounded-xl border p-4 space-y-3" style={{ background: "var(--dashboard-surface-raised)", borderColor: "var(--primary)", borderStyle: "dashed" }}>
              {/* Correct Answer Explanation */}
              <div>
                <div className="flex items-center gap-1.5 mb-1.5">
                  <CheckCircle className="w-3.5 h-3.5 text-[var(--dashboard-success)]" />
                  <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-[var(--dashboard-success)]">
                    সঠিক উত্তর কেন
                  </span>
                </div>
                <p className="text-xs leading-relaxed" style={{ color: "var(--dashboard-text-primary)" }}>
                  {result.correctAnswerExplanation}
                </p>
              </div>

              {/* Why Others Wrong */}
              {result.whyOthersWrong.length > 0 && (
                <div>
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <XCircle className="w-3.5 h-3.5 text-[var(--dashboard-danger)]" />
                    <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-[var(--dashboard-danger)]">
                      অন্য অপশন কেন ভুল
                    </span>
                  </div>
                  <div className="space-y-2">
                    {result.whyOthersWrong.map((item, i) => (
                      <div key={i} className="flex gap-2 text-xs">
                        <span className="font-mono font-bold text-[var(--dashboard-text-muted)] flex-shrink-0">
                          {OPTION_LABELS[props.options.indexOf(item.option)] ?? "?"}.
                        </span>
                        <div>
                          <span className="font-medium" style={{ color: "var(--dashboard-text-primary)" }}>{item.option}: </span>
                          <span style={{ color: "var(--dashboard-text-secondary)" }}>{item.reason}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Key Definitions */}
              {result.keyDefinitions && result.keyDefinitions.length > 0 && (
                <div>
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <BookOpen className="w-3.5 h-3.5 text-[var(--dashboard-primary)]" />
                    <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-[var(--dashboard-primary)]">
                      মূল সংজ্ঞা
                    </span>
                  </div>
                  <ul className="list-disc list-inside text-xs space-y-0.5" style={{ color: "var(--dashboard-text-secondary)" }}>
                    {result.keyDefinitions.map((def, i) => (
                      <li key={i}>{def}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Related Concepts */}
              {result.relatedConcepts && (
                <div>
                  <div className="flex items-center gap-1.5 mb-1">
                    <BookOpen className="w-3.5 h-3.5 text-[var(--dashboard-teal)]" />
                    <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-[var(--dashboard-teal)]">
                      সম্পর্কিত বিষয়
                    </span>
                  </div>
                  <p className="text-xs" style={{ color: "var(--dashboard-text-secondary)" }}>{result.relatedConcepts}</p>
                </div>
              )}

              {/* Exam Tip */}
              {result.examTip && (
                <div className="rounded-lg p-2.5" style={{ background: "var(--dashboard-warning-subtle)" }}>
                  <div className="flex items-center gap-1.5 mb-1">
                    <Lightbulb className="w-3.5 h-3.5 text-[var(--dashboard-warning)]" />
                    <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-[var(--dashboard-warning)]">
                      পরীক্ষার টিপ
                    </span>
                  </div>
                  <p className="text-xs" style={{ color: "var(--dashboard-text-secondary)" }}>{result.examTip}</p>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
