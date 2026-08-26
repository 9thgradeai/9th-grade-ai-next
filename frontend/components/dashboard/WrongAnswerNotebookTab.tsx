"use client";

import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { BookX, Play, RefreshCw } from "lucide-react";
import { api } from "@/lib/services/api";
import type { QuestionDTO } from "@/lib/types";
import QuestionDrill from "./QuestionDrill";
import { useToastSafe } from "@/lib/toast-ctx";

export default function WrongAnswerNotebookTab() {
  const toast = useToastSafe();
  const [questions, setQuestions] = useState<QuestionDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [drilling, setDrilling] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api.wrongAnswers({ limit: 100 });
      setQuestions(res.questions);
    } catch {
      toast.error("ভুলের নোটবুক লোড করা যায়নি");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await api.wrongAnswers({ limit: 100 });
        if (!cancelled) setQuestions(res.questions);
      } catch {
        if (!cancelled) toast.error("ভুলের নোটবুক লোড করা যায়নি");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (drilling) {
    return (
      <QuestionDrill
        questions={questions}
        title="ভুলের নোটবুক"
        onExit={() => {
          setDrilling(false);
          setLoading(true);
          void load();
        }}
      />
    );
  }

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass-card rounded-terminal-rounded border border-terminal-border p-5"
      >
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <BookX className="w-5 h-5 text-rose-400" />
            <h2 className="text-lg font-bold text-white">ভুলের নোটবুক</h2>
          </div>
          <button
            onClick={() => {
              setLoading(true);
              void load();
            }}
            aria-label="রিফ্রেশ"
            className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center bg-zinc-900 border border-zinc-800 rounded-lg text-zinc-400 hover:text-white transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
        <p className="text-sm text-zinc-400 font-mono">
          যে প্রশ্নগুলোতে ভুল করেছেন, সেগুলো এখানে জমা হয়। সঠিক উত্তর দিলে সেটি নোটবুক থেকে বের হয়ে যাবে।
        </p>
      </motion.div>

      {loading ? (
        <div className="glass-card rounded-terminal-rounded border border-terminal-border p-10 text-center">
          <p className="text-sm text-zinc-400 font-mono">লোড হচ্ছে…</p>
        </div>
      ) : questions.length === 0 ? (
        <div className="glass-card rounded-terminal-rounded border border-terminal-border p-10 text-center">
          <p className="text-sm text-emerald-400 font-mono mb-1">দারুণ! কোনো ভুল নেই</p>
          <p className="text-xs text-zinc-500 font-mono">
            আপনার সাম্প্রতিক ভুলের রেকর্ড এখানে দেখা যাবে।
          </p>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between">
            <span className="text-xs text-zinc-500 font-mono">{questions.length} টি প্রশ্ন</span>
            <button
              onClick={() => setDrilling(true)}
              className="px-4 py-2 bg-emerald-500 text-zinc-950 font-mono text-sm rounded-lg hover:bg-emerald-400 transition-colors flex items-center gap-2"
            >
              <Play className="w-4 h-4" /> সবগুলো প্র্যাকটিস
            </button>
          </div>

          <div className="space-y-3">
            {questions.map((q) => (
              <div
                key={q.id}
                className="glass-card rounded-terminal-rounded border border-terminal-border p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[10px] text-zinc-500 font-mono uppercase tracking-wider mb-1">
                      {q.subject} • {q.topic}
                      {q.year ? ` • ${q.year}` : ""}
                      {q.sourceExam ? ` • ${q.sourceExam}` : ""}
                    </div>
                    <p className="text-sm text-zinc-200 leading-relaxed line-clamp-2">{q.question}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
