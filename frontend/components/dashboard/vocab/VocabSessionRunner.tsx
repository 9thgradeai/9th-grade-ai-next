"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { api } from "@/lib/services/api";
import { blankWordInSentence } from "@/lib/vocab-exercise";
import type { Server } from "@/lib/types";

type Mode = "recall" | "production" | "listening" | "context";

const MODES: Mode[] = ["recall", "production", "listening", "context"];

const MODE_LABEL: Record<Mode, string> = {
  recall: "Recall",
  production: "Production",
  listening: "Listening",
  context: "Context",
};

export default function VocabSessionRunner({
  onExit,
  words: providedWords,
  onReviewed,
}: {
  onExit: () => void;
  /** When supplied by the parent, the session works on the same queue as the
   *  flashcard view instead of an unrelated top-frequency list. */
  words?: Server.VocabWordDTO[];
  /** Lets the parent keep its session counters in sync with this runner. */
  onReviewed?: (wordId: number, correct: boolean) => void;
}) {
  const [ownWords, setOwnWords] = useState<Server.VocabWordDTO[]>([]);
  const [loading, setLoading] = useState(!providedWords);
  const [idx, setIdx] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [typed, setTyped] = useState("");
  const [result, setResult] = useState<"correct" | "wrong" | null>(null);
  const [stats, setStats] = useState({ reviewed: 0, correct: 0 });
  const [done, setDone] = useState(false);
  const countedRef = useRef<Set<number>>(new Set());

  const words = providedWords ?? ownWords;

  useEffect(() => {
    if (providedWords) return;
    let cancelled = false;
    (async () => {
      try {
        const ws = await api.vocabWords({ limit: 10, kind: "words" });
        if (!cancelled) setOwnWords(ws);
      } catch {
        /* keep the empty state */
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [providedWords]);

  const current = words[idx];
  // Rotate modes deterministically: every word gets a different modality and
  // no mode repeats until the full cycle is exhausted.
  const mode = MODES[idx % MODES.length];
  const canSpeak = typeof window !== "undefined" && typeof window.speechSynthesis !== "undefined";

  const speak = useCallback((w: string) => {
    if (!canSpeak) return;
    const u = new SpeechSynthesisUtterance(w);
    u.lang = "en-US";
    u.rate = 0.85;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  }, [canSpeak]);

  useEffect(() => {
    if (mode === "listening" && current) speak(current.word);
  }, [mode, current?.id, speak]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Grade the current word exactly once, persist to SRS, and notify parent. */
  const grade = useCallback((correct: boolean) => {
    if (!current || result !== null || countedRef.current.has(current.id)) return;
    countedRef.current.add(current.id);
    setResult(correct ? "correct" : "wrong");
    setStats((s) => ({ reviewed: s.reviewed + 1, correct: s.correct + (correct ? 1 : 0) }));
    void api.reviewVocab(current.id, correct ? 3 : 1).catch(() => {});
    onReviewed?.(current.id, correct);
    if (!correct) setRevealed(true); // show the answer on a miss
  }, [current, result, onReviewed]);

  const check = useCallback(() => {
    if (!current || !typed.trim()) return;
    grade(typed.trim().toLowerCase() === current.word.trim().toLowerCase());
  }, [current, typed, grade]);

  const next = useCallback(() => {
    setRevealed(false);
    setTyped("");
    setResult(null);
    if (idx + 1 >= words.length) setDone(true);
    else setIdx((i) => i + 1);
  }, [idx, words.length]);

  if (loading) {
    return <div className="p-6 text-center font-mono text-sm text-[var(--dashboard-text-muted)]">Loading session…</div>;
  }
  if (words.length === 0) {
    return <div className="p-6 text-center font-mono text-sm text-[var(--dashboard-text-muted)]">No words available.</div>;
  }

  if (done) {
    const acc = stats.reviewed > 0 ? Math.round((stats.correct / stats.reviewed) * 100) : 0;
    return (
      <div className="rounded-2xl border border-terminal-border bg-[var(--surface-raised)] p-6 text-center space-y-3">
        <h3 className="text-lg font-bold">Session complete</h3>
        <p className="font-mono text-sm">{stats.correct}/{stats.reviewed} correct · {acc}%</p>
        <button onClick={onExit} className="px-4 py-2 rounded-xl bg-[var(--accent)] text-[var(--dashboard-text-inverse)] font-mono text-sm">Done</button>
      </div>
    );
  }

  const cloze = mode === "context" ? blankWordInSentence(current.exampleSentence ?? "", current.word) : null;
  const graded = result !== null;

  return (
    <div className="rounded-2xl border border-terminal-border bg-[var(--surface-raised)] p-5 space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-xs font-mono text-[var(--dashboard-text-muted)]">{idx + 1}/{words.length} · {MODE_LABEL[mode]}</span>
        <button onClick={onExit} className="text-xs font-mono text-[var(--dashboard-text-muted)] hover:text-[var(--accent)]">Exit</button>
      </div>

      {mode === "recall" && (
        <div className="space-y-3">
          <h3 className="text-2xl font-bold">{current.word}</h3>
          {!revealed ? (
            <button onClick={() => setRevealed(true)} className="px-4 py-2 rounded-xl bg-[var(--accent)] text-[var(--dashboard-text-inverse)] font-mono text-sm">Reveal</button>
          ) : (
            <>
              <p className="text-sm">{current.bengaliMeaning}</p>
              {!graded ? (
                <div className="flex gap-2">
                  <button onClick={() => { grade(false); next(); }} className="px-3 py-1.5 rounded-lg border border-[var(--danger)]/30 text-[var(--danger)] font-mono text-xs">Again</button>
                  <button onClick={() => { grade(true); next(); }} className="px-3 py-1.5 rounded-lg border border-emerald-500/30 text-emerald-600 font-mono text-xs">Good</button>
                </div>
              ) : (
                <button onClick={next} className="px-3 py-1.5 rounded-lg bg-[var(--accent)] text-[var(--dashboard-text-inverse)] font-mono text-xs">Next word</button>
              )}
            </>
          )}
        </div>
      )}

      {mode !== "recall" && (
        <div className="space-y-3">
          {mode === "production" && (
            <p className="text-sm text-[var(--dashboard-text-secondary)]">{current.bengaliMeaning}</p>
          )}
          {mode === "listening" && (
            <div className="space-y-2">
              <button onClick={() => speak(current.word)} className="px-4 py-2 rounded-xl bg-[var(--accent)] text-[var(--dashboard-text-inverse)] font-mono text-sm">🔊 Play</button>
              {!canSpeak && <p className="text-xs text-[var(--dashboard-text-muted)]">Audio unavailable in this browser — use the hint below.</p>}
            </div>
          )}
          {mode === "context" && (
            <p className="text-sm leading-relaxed text-[var(--dashboard-text-secondary)]">
              {cloze ?? <span className="italic">No example sentence for this word — recall its meaning instead: {current.bengaliMeaning}</span>}
            </p>
          )}

          {!graded ? (
            <>
              <input
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && check()}
                placeholder={mode === "listening" ? "What did you hear?" : mode === "context" ? "Fill the blank…" : "Type the word…"}
                className="w-full min-h-11 px-3 rounded-xl bg-[var(--surface)] border border-terminal-border font-mono text-sm"
              />
              <div className="flex items-center gap-2">
                <button onClick={check} className="px-4 py-1.5 rounded-lg bg-[var(--accent)] text-[var(--dashboard-text-inverse)] font-mono text-xs">Check</button>
                {mode === "listening" && !typed && (
                  <button onClick={() => setRevealed(true)} className="text-xs font-mono text-[var(--dashboard-text-muted)] underline">Show answer</button>
                )}
              </div>
            </>
          ) : (
            <div className="space-y-2">
              <p className={`text-sm font-mono ${result === "correct" ? "text-emerald-600" : "text-[var(--danger)]"}`}>
                {result === "correct" ? "✓ Correct" : `✗ Answer: ${current.word}`}
              </p>
              <button onClick={next} className="px-4 py-1.5 rounded-lg bg-[var(--accent)] text-[var(--dashboard-text-inverse)] font-mono text-xs">Next word</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
