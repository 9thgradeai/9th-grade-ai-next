"use client";

// PracticeDrillOverlay — a global, event-driven modal that starts a practice
// session from the AI study coach's action chips. The agent never picks
// question ids itself: `create_practice_session` / `create_mock_exam` mint a
// question set server-side, the loop injects it into the `practice` /
// `mock_exam` actions, and AgentBlocks dispatches `ai:start-practice`. This
// overlay loads those questions by id and mounts <QuestionDrill> so the same
// per-answer submission path (and errorType capture) is reused.

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Loader2 } from "lucide-react";
import { api } from "@/lib/services/api";
import type { QuestionDTO } from "@/lib/types";
import QuestionDrill from "../QuestionDrill";
import { useDialogA11y } from "@/lib/use-dialog-a11y";

type StartPracticeDetail = {
  questionIds: number[];
  title?: string;
};

export default function PracticeDrillOverlay() {
  const [detail, setDetail] = useState<StartPracticeDetail | null>(null);
  const [questions, setQuestions] = useState<QuestionDTO[] | null>(null);
  const [loadingText, setLoadingText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const requestRef = useRef(0);

  const close = () => {
    setDetail(null);
    setQuestions(null);
    setError(null);
  };

  const panelRef = useDialogA11y<HTMLDivElement>(detail !== null, close);

  useEffect(() => {
    const onStart = (event: Event) => {
      const payload = (event as CustomEvent).detail as StartPracticeDetail | undefined;
      if (!payload || !Array.isArray(payload.questionIds) || payload.questionIds.length === 0) {
        return;
      }
      const req = ++requestRef.current;
      setDetail(payload);
      setQuestions(null);
      setError(null);
      setLoadingText("প্রশ্ন লোড হচ্ছে…");
      void (async () => {
        try {
          const qs = await api.questions({ ids: payload.questionIds });
          if (req !== requestRef.current) return;
          if (qs.length === 0) {
            setError("খুঁজে পাওয়া প্রশ্ন পাওয়া যায়নি — আবার চেষ্টা করুন।");
            return;
          }
          setQuestions(qs);
        } catch {
          if (req !== requestRef.current) return;
          setError("প্রশ্ন লোড করা যায়নি — আবার চেষ্টা করুন।");
        } finally {
          if (req === requestRef.current) setLoadingText("");
        }
      })();
    };
    window.addEventListener("ai:start-practice", onStart);
    return () => window.removeEventListener("ai:start-practice", onStart);
  }, []);

  return (
    <AnimatePresence>
      {detail && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[80] flex items-center justify-center p-4 sm:p-6"
          role="dialog"
          aria-modal="true"
          aria-label="AI প্র্যাকটিস সেশন"
        >
          <div
            className="absolute inset-0 backdrop-blur-sm"
            style={{ background: "var(--dashboard-overlay)" }}
            onClick={close}
          />
          <motion.div
            ref={panelRef}
            initial={{ opacity: 0, y: 14, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.99 }}
            transition={{ type: "spring" as const, stiffness: 300, damping: 28 }}
            tabIndex={-1}
            className="relative w-full max-w-2xl rounded-2xl border max-h-[86vh] overflow-y-auto p-5"
            style={{ background: "var(--dashboard-surface)", borderColor: "var(--dashboard-border-muted)", boxShadow: "var(--dashboard-shadow-lg, 0 24px 64px rgba(0,0,0,0.28))" }}
          >
            <button
              onClick={close}
              className="absolute right-4 top-4 z-10 p-2 rounded-lg border transition-colors"
              style={{ borderColor: "var(--dashboard-border-muted)", color: "var(--dashboard-text-secondary)", background: "var(--dashboard-surface-muted)" }}
              aria-label="Close practice"
            >
              <X className="w-4 h-4" />
            </button>

            {error ? (
              <div className="py-10 text-center space-y-3">
                <p className="text-sm font-mono text-[var(--dashboard-danger)]">{error}</p>
                <button
                  onClick={close}
                  className="px-4 py-2 rounded-lg border text-xs font-mono"
                  style={{ borderColor: "var(--dashboard-border-muted)", color: "var(--dashboard-text-secondary)" }}
                >
                  বন্ধ করুন
                </button>
              </div>
            ) : questions ? (
              <QuestionDrill questions={questions} title={detail.title} onExit={close} />
            ) : (
              <div className="py-14 flex flex-col items-center justify-center gap-3">
                <Loader2 className="w-5 h-5 animate-spin text-[var(--dashboard-primary)]" />
                <p className="text-xs font-mono text-[var(--dashboard-text-muted)]">
                  {loadingText || "প্রশ্ন লোড হচ্ছে…"}
                </p>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}