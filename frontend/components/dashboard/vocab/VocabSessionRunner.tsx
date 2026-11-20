"use client";

import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/services/api";
import type { Server } from "@/lib/types";
import { t, useLanguage } from "@/lib/lang-ctx";

type Mode = "recall" | "production" | "listening" | "context";

export default function VocabSessionRunner({ onExit }: { onExit: () => void }) {
  const { lang } = useLanguage();
  const [words, setWords] = useState<Server.VocabWordDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [idx, setIdx] = useState(0);
  const [mode, setMode] = useState<Mode>("recall");
  const [revealed, setRevealed] = useState(false);
  const [typed, setTyped] = useState("");
  const [result, setResult] = useState<"correct" | "wrong" | null>(null);
  const [stats, setStats] = useState({ reviewed: 0, correct: 0 });
  const [done, setDone] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const ws = await api.vocabWords({ limit: 10, kind: "words" });
        setWords(ws);
      } catch {
        /* ignore */
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const current = words[idx];

  const speak = (w: string) => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    const u = new SpeechSynthesisUtterance(w);
    u.lang = "en-US";
    u.rate = 0.85;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  };

  const advance = useCallback((correct: boolean) => {
    setStats((s) => ({ reviewed: s.reviewed + 1, correct: s.correct + (correct ? 1 : 0) }));
    setRevealed(false);
    setTyped("");
    setResult(null);
    const modes: Mode[] = ["recall", "production", "listening", "context"];
    setMode(modes[Math.floor(Math.random() * modes.length)]);
    if (idx + 1 >= words.length) setDone(true);
    else setIdx((i) => i + 1);
  }, [idx, words.length]);

  const check = () => {
    if (!current) return;
    const ok = typed.trim().toLowerCase() === current.word.trim().toLowerCase();
    setResult(ok ? "correct" : "wrong");
    if (ok) {
      void api.reviewVocab(current.id, 3).catch(() => {});
      advance(true);
    }
  };

  if (loading) return <div className="p-6 text-center font-mono text-sm text-[var(--dashboard-text-muted)]">Loading session…</div>;
  if (words.length === 0) return <div className="p-6 text-center font-mono text-sm text-[var(--dashboard-text-muted)]">No words available.</div>;

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

  return (
    <div className="rounded-2xl border border-terminal-border bg-[var(--surface-raised)] p-5 space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-xs font-mono text-[var(--dashboard-text-muted)]">{idx + 1}/{words.length} · {mode}</span>
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
              <div className="flex gap-2">
                <button onClick={() => { void api.reviewVocab(current.id, 1).catch(()=>{}); advance(false); }} className="px-3 py-1.5 rounded-lg border border-[var(--danger)]/30 text-[var(--danger)] font-mono text-xs">Again</button>
                <button onClick={() => { void api.reviewVocab(current.id, 3).catch(()=>{}); advance(true); }} className="px-3 py-1.5 rounded-lg border border-emerald-500/30 text-emerald-600 font-mono text-xs">Good</button>
              </div>
            </>
          )}
        </div>
      )}

      {mode === "production" && (
        <div className="space-y-3">
          <p className="text-sm text-[var(--dashboard-text-secondary)]">{current.bengaliMeaning}</p>
          <input value={typed} onChange={(e) => setTyped(e.target.value)} onKeyDown={(e) => e.key === "Enter" && check()} placeholder="Type the word…" className="w-full min-h-11 px-3 rounded-xl bg-[var(--surface)] border border-terminal-border font-mono text-sm" />
          {result && <span className={result === "correct" ? "text-emerald-600" : "text-[var(--danger)]"}>{result}</span>}
        </div>
      )}

      {mode === "listening" && (
        <div className="space-y-3">
          <button onClick={() => speak(current.word)} className="px-4 py-2 rounded-xl bg-[var(--accent)] text-[var(--dashboard-text-inverse)] font-mono text-sm">🔊 Play</button>
          <input value={typed} onChange={(e) => setTyped(e.target.value)} onKeyDown={(e) => e.key === "Enter" && check()} placeholder="What did you hear?" className="w-full min-h-11 px-3 rounded-xl bg-[var(--surface)] border border-terminal-border font-mono text-sm" />
          {result && <span className={result === "correct" ? "text-emerald-600" : "text-[var(--danger)]"}>{result}</span>}
        </div>
      )}

      {mode === "context" && (
        <div className="space-y-3">
          <p className="text-sm text-[var(--dashboard-text-secondary)]">
            {(current.exampleSentence || "").replace(new RegExp(current.word.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&"), "i"), "______")}
          </p>
          <input value={typed} onChange={(e) => setTyped(e.target.value)} onKeyDown={(e) => e.key === "Enter" && check()} placeholder="Fill the blank…" className="w-full min-h-11 px-3 rounded-xl bg-[var(--surface)] border border-terminal-border font-mono text-sm" />
          {result && <span className={result === "correct" ? "text-emerald-600" : "text-[var(--danger)]"}>{result}</span>}
        </div>
      )}
    </div>
  );
}
