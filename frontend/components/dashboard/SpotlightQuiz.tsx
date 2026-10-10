"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, Check, Shuffle, Spinner, Sparkle, Target, Warning } from "@phosphor-icons/react";
import { api } from "@/lib/services/api";
import { useEcosystem } from "@/lib/ecosystem-ctx";
import type { Server } from "@/lib/types";
import { getCorrectSet, isAnswerCorrect } from "@/lib/question-type";
import QuestionRenderer from "./practice/QuestionRenderer";

/**
 * SpotlightQuiz — Home-tab rotating MCQ.
 *
 * Shows ONE random question at a time drawn strictly from the stored
 * question bank (`GET /api/spotlight` — database reads only, never
 * generated). The batch arrives round-robin across subjects, and this
 * component walks it in order so the cycle covers ALL subjects:
 *   • auto-rotates to the next question every 3.5 minutes,
 *   • answering locks the question and immediately moves to another one,
 *   • exhausted batches refetch excluding already-shown ids (no repeats).
 */
const ROTATE_MS = 210_000; // 3.5 min — inside the "every 3–4 minutes" window
const REVEAL_MS = 2_500; // feedback pause after answering before advancing
const BATCH_SIZE = 12;
const MAX_SEEN_IDS = 500;

type Stats = { answered: number; correct: number };

export default function SpotlightQuiz({
  onPracticeSubject,
}: {
  onPracticeSubject?: (subject: string) => void;
}) {
  const { ecosystem } = useEcosystem();
  const [batch, setBatch] = useState<Server.QuestionDTO[]>([]);
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<string[]>([]);
  const [locked, setLocked] = useState(false);
  const [multiLocked, setMultiLocked] = useState(false);
  // Judgement-of-Learning: the learner rates confidence BEFORE seeing the
  // verdict, then gets a calibration note (confident + wrong, unsure + right…)
  // instead of a bare ✓/✗. Optional — grading works without it.
  const [confidence, setConfidence] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<Stats>({ answered: 0, correct: 0 });
  const [timerKey, setTimerKey] = useState(0);

  const seenIds = useRef<number[]>([]);
  const revealTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const batchRef = useRef<Server.QuestionDTO[]>([]);
  const indexRef = useRef(0);
  useEffect(() => { batchRef.current = batch; }, [batch]);
  useEffect(() => { indexRef.current = index; }, [index]);

  const remember = useCallback((ids: number[]) => {
    seenIds.current = [...seenIds.current, ...ids].slice(-MAX_SEEN_IDS);
  }, []);

  const resetQuestionState = useCallback(() => {
    if (revealTimeout.current) {
      clearTimeout(revealTimeout.current);
      revealTimeout.current = null;
    }
    setPicked([]);
    setLocked(false);
    setMultiLocked(false);
    setConfidence(null);
    setTimerKey((k) => k + 1);
  }, []);

  const fetchBatch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = await api.spotlight({
        ecosystem,
        count: BATCH_SIZE,
        excludeIds: seenIds.current.length > 0 ? [...seenIds.current] : undefined,
      });
      if (qs.length === 0) {
        setError("এখনো কোনো প্রশ্ন পাওয়া যায়নি।");
        setBatch([]);
      } else {
        remember(qs.map((q) => q.id));
        setBatch(qs);
        setIndex(0);
      }
      resetQuestionState();
    } catch {
      setError("প্রশ্ন লোড করা যায়নি। আবার চেষ্টা করুন।");
    } finally {
      setLoading(false);
    }
  }, [ecosystem, remember, resetQuestionState]);

  // Fresh cycle per ecosystem — never mix another ecosystem's leftovers in.
  useEffect(() => {
    seenIds.current = [];
    setBatch([]);
    setIndex(0);
    setStats({ answered: 0, correct: 0 });
    void fetchBatch();
  }, [ecosystem, fetchBatch]);

  useEffect(() => {
    return () => {
      if (revealTimeout.current) clearTimeout(revealTimeout.current);
    };
  }, []);

  const advance = useCallback(() => {
    const b = batchRef.current;
    const i = indexRef.current;
    if (i + 1 < b.length) {
      setIndex(i + 1);
      resetQuestionState();
    } else {
      // Batch exhausted — pull a fresh round-robin batch (seen ids excluded).
      void fetchBatch();
    }
  }, [fetchBatch, resetQuestionState]);

  // Rotation clock: next question every 3.5 minutes. Re-armed on every
  // question change so an answered question still flips on schedule.
  useEffect(() => {
    if (batch.length === 0) return;
    const id = setInterval(() => advance(), ROTATE_MS);
    return () => clearInterval(id);
  }, [advance, batch.length, index, timerKey]);

  const question = batch[index];
  const isMulti = question?.questionType === "MULTIPLE_CHOICE";
  const isLocked = locked && (!isMulti || multiLocked);

  const gradeAndMoveOn = useCallback((q: Server.QuestionDTO, selection: string[]) => {
    const ok = selection.length > 0 && isAnswerCorrect(q, selection);
    setStats((s) => ({ answered: s.answered + 1, correct: s.correct + (ok ? 1 : 0) }));
    revealTimeout.current = setTimeout(() => advance(), REVEAL_MS);
  }, [advance]);

  const selectAnswer = useCallback((next: string[]) => {
    if (!question || isLocked || next.length === 0) return;
    setPicked(next);
    // Instant verdict: tapping an option locks + grades at once so the
    // green (right) / red (wrong) signal and the correct answer appear
    // immediately. A pre-rated confidence adds a calibration note.
    if (!isMulti) {
      setLocked(true);
      gradeAndMoveOn(question, next);
    }
  }, [question, isLocked, isMulti, gradeAndMoveOn]);

  const chooseConfidence = useCallback((value: number) => {
    // Pre-answer rating only — it never locks by itself. Tap an option
    // afterwards for the instant verdict + calibration.
    if (!question || isLocked) return;
    setConfidence((prev) => (prev === value ? null : value));
  }, [question, isLocked]);

  const lockMultiAnswer = useCallback(() => {
    if (!question || picked.length === 0 || isLocked) return;
    setMultiLocked(true);
    setLocked(true);
    gradeAndMoveOn(question, picked);
  }, [question, picked, isLocked, gradeAndMoveOn]);

  /** Calibration verdict comparing pre-answer confidence with the outcome. */
  const calibrationNote = (q: Server.QuestionDTO, selection: string[], conf: number | null): string => {
    if (conf === null) return "";
    const ok = isAnswerCorrect(q, selection);
    if (ok && conf >= 75) return " · আত্মবিশ্বাস আর ফল মিলেছে — দারুণ ক্যালিব্রেশন";
    if (ok) return " · কম আত্মবিশ্বাস, তবু সঠিক — এগিয়ে যান";
    if (conf >= 75) return " · অতিরিক্ত আত্মবিশ্বাস ছিল — ধারণাটা ঝালিয়ে নিন";
    return " · ঠিক ধরেছেন, এটা দুর্বল জায়গা — প্র্যাকটিস করুন";
  };

  return (
    <div className="command-card p-5">
      <div className="flex items-center gap-2 mb-1">
        <span className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 border"
          style={{ background: "var(--dashboard-primary-subtle)", borderColor: "color-mix(in srgb, var(--dashboard-primary) 18%, transparent)", color: "var(--dashboard-primary)" }}>
          <Sparkle className="w-5 h-5" aria-hidden="true" />
        </span>
        <div className="flex-1 min-w-0">
          <h2 className="text-sm font-bold" style={{ color: "var(--dashboard-text-primary)" }}>
            স্পটলাইট MCQ
          </h2>
          <p className="text-[11px] font-mono" style={{ color: "var(--dashboard-text-muted)" }}>
            সব বিষয় থেকে ঘুরে ঘুরে · ~৩ মিনিটে বদলায়
          </p>
        </div>
        {stats.answered > 0 && (
          <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded-full border flex-shrink-0"
            style={{ borderColor: "var(--dashboard-border-muted)", color: "var(--dashboard-text-secondary)" }}>
            {stats.correct}/{stats.answered} সঠিক
          </span>
        )}
      </div>

      {loading && (
        <div role="status" aria-label="স্পটলাইট প্রশ্ন লোড হচ্ছে" className="py-6">
          <Spinner className="w-8 h-8 mx-auto mb-2 text-[var(--accent)] animate-spin" aria-hidden="true" />
          <p className="text-xs text-center font-mono" style={{ color: "var(--dashboard-text-muted)" }}>প্রশ্ন আসছে…</p>
        </div>
      )}

      {!loading && error && (
        <div role="alert" className="py-4 text-center">
          <Warning className="w-8 h-8 mx-auto mb-2" style={{ color: "var(--dashboard-warning)" }} aria-hidden="true" />
          <p className="text-xs mb-3" style={{ color: "var(--dashboard-text-muted)" }}>{error}</p>
          <button onClick={() => void fetchBatch()} className="command-secondary-btn !py-2 text-xs">
            আবার চেষ্টা করুন
          </button>
        </div>
      )}

      {!loading && !error && question && (
        <div key={question.id} className="mt-3">
          <div className="flex flex-wrap items-center gap-1.5 mb-3">
            <span className="px-2 py-0.5 rounded text-[10px] font-mono"
              style={{ background: "var(--dashboard-surface-muted)", color: "var(--dashboard-text-secondary)", border: "1px solid var(--dashboard-border-muted)" }}>
              {question.subject}
            </span>
            {question.topic && (
              <span className="px-2 py-0.5 rounded text-[10px] font-mono"
                style={{ background: "var(--dashboard-surface-muted)", color: "var(--dashboard-text-muted)", border: "1px solid var(--dashboard-border-muted)" }}>
                {question.topic}
              </span>
            )}
            <span className="ml-auto text-[10px] font-mono" style={{ color: "var(--dashboard-text-muted)" }}>
              {index + 1}/{batch.length}
            </span>
          </div>

          <QuestionRenderer
            question={question}
            selected={picked}
            locked={isLocked}
            correctSet={isLocked ? getCorrectSet(question) : null}
            onSelect={selectAnswer}
          />

          {isMulti && !isLocked && picked.length > 0 && (
            <button
              onClick={lockMultiAnswer}
              className="w-full mt-3 py-2.5 rounded-xl bg-[var(--accent)] text-[var(--dashboard-text-inverse)] font-mono text-sm flex items-center justify-center gap-2"
            >
              <Check className="w-4 h-4" /> উত্তর লক করুন ({picked.length}টি নির্বাচিত)
            </button>
          )}
          {!isLocked && (
            <div className="mt-3 flex flex-wrap items-center gap-1.5" role="group" aria-label="উত্তরের আগে নিশ্চয়তা">
              <span className="text-[11px] font-mono" style={{ color: "var(--dashboard-text-muted)" }}>
                আগে বলুন — কতটা নিশ্চিত?
              </span>
              {[25, 50, 75, 100].map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => chooseConfidence(v)}
                  aria-pressed={confidence === v}
                  className="px-2.5 py-1 rounded-full border font-mono text-[11px] font-bold transition-colors min-h-[32px]"
                  style={
                    confidence === v
                      ? { background: "var(--dashboard-primary)", color: "var(--dashboard-text-inverse)", borderColor: "transparent" }
                      : { borderColor: "var(--dashboard-border-muted)", color: "var(--dashboard-text-secondary)", background: "transparent" }
                  }
                >
                  {v}%
                </button>
              ))}
            </div>
          )}
          {isLocked && (
            <p role="status" className="text-xs font-mono mt-3" style={{ color: "var(--dashboard-text-muted)" }}>
              {picked.length > 0 && isAnswerCorrect(question, picked) ? "✓ সঠিক!" : picked.length === 0 ? "" : "✗ ভুল — সঠিক উত্তর সবুজে দেখুন"}{calibrationNote(question, picked, confidence)} · পরের প্রশ্ন আসছে…
            </p>
          )}

          <div className="flex items-center gap-2 mt-4">
            <button
              onClick={advance}
              className="flex-1 py-2.5 rounded-xl border font-mono text-xs flex items-center justify-center gap-1.5 transition-colors"
              style={{ background: "var(--dashboard-surface-muted)", borderColor: "var(--dashboard-border-strong)", color: "var(--dashboard-text-secondary)" }}
            >
              <Shuffle className="w-3.5 h-3.5" /> {isLocked ? "পরের প্রশ্ন" : "এড়িয়ে যান"}
            </button>
            {onPracticeSubject && question.subject && (
              <button
                onClick={() => onPracticeSubject(question.subject)}
                className="flex-1 py-2.5 rounded-xl font-mono text-xs flex items-center justify-center gap-1.5 transition-colors"
                style={{ background: "var(--dashboard-primary)", color: "var(--dashboard-text-inverse)" }}
              >
                <Target className="w-3.5 h-3.5" /> এই বিষয়ে প্র্যাকটিস <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
