"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { BookOpen, Check, X, Lightbulb, Target, Clock, TrendUp, Spinner, Brain } from "@phosphor-icons/react";
import { api } from "@/lib/services/api";
import type { Server } from "@/lib/types";

export default function VocabTab() {
  const [words, setWords] = useState<Server.VocabWordDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [idx, setIdx] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [stats, setStats] = useState<{ total: number; mastered: number; learning: number; due: number } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [ws, st] = await Promise.all([api.vocabWords({ limit: 20 }), api.vocabStats().catch(() => null)]);
      setWords(ws);
      if (st) setStats(st as never);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const current = words[idx];
  const review = async (correct: boolean) => {
    if (!current) return;
    try { await api.reviewVocab(current.id, correct); } catch {}
    setRevealed(false);
    setIdx((i) => (i + 1 < words.length ? i + 1 : 0));
    // refresh stats
    try { const s = await api.vocabStats(); setStats(s as never); } catch {}
  };

  if (loading) return <div className="glass-card rounded-2xl border border-terminal-border p-10 text-center"><Spinner className="w-8 h-8 mx-auto animate-spin text-[var(--accent)]" /><p className="text-sm text-[var(--dashboard-text-muted)] mt-2">ভোকাব লোড হচ্ছে...</p></div>;
  if (!current) return <div className="glass-card rounded-2xl border border-terminal-border p-10 text-center"><BookOpen className="w-10 h-10 mx-auto text-[var(--dashboard-text-muted)]" /><p className="text-sm text-[var(--dashboard-text-muted)] mt-2">কোনো শব্দ পাওয়া যায়নি।</p></div>;

  return (
    <div className="space-y-6">
      {/* Header + stats */}
      <div className="glass-card rounded-2xl border border-terminal-border overflow-hidden">
        <div className="terminal-window-bar border-b border-terminal-border"><div className="dot close" /><div className="dot minimize" /><div className="dot maximize" /><div className="flex-1 text-center text-xs text-[var(--dashboard-text-muted)] font-mono">// VOCAB_MASTERY — AI POWERED</div></div>
        <div className="p-5 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3"><div className="w-10 h-10 rounded-xl bg-[var(--accent)]/15 flex items-center justify-center"><BookOpen className="w-5 h-5 text-[var(--accent)]" /></div><div><h2 className="text-lg font-bold text-[var(--text-primary)]">Vocab — AI-Powered Mastery</h2><p className="text-xs text-[var(--dashboard-text-muted)] font-mono">BCS / Bank / 9th Grade — frequency + difficulty + your weaknesses</p></div></div>
          <div className="flex gap-3 text-center">
            <div className="px-3 py-2 rounded-xl bg-[var(--surface-raised)] border border-terminal-border"><p className="text-lg font-bold text-[var(--dashboard-primary)]">{stats?.total ?? words.length}</p><p className="text-[10px] text-[var(--dashboard-text-muted)]">TOTAL</p></div>
            <div className="px-3 py-2 rounded-xl bg-[var(--surface-raised)] border border-terminal-border"><p className="text-lg font-bold text-amber-500">{stats?.learning ?? 0}</p><p className="text-[10px] text-[var(--dashboard-text-muted)]">LEARNING</p></div>
            <div className="px-3 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20"><p className="text-lg font-bold text-emerald-500">{stats?.mastered ?? 0}</p><p className="text-[10px] text-[var(--dashboard-text-muted)]">MASTERED</p></div>
            <div className="px-3 py-2 rounded-xl bg-[var(--dashboard-warning-subtle)] border border-[var(--warning)]/20"><p className="text-lg font-bold text-[var(--dashboard-warning)]">{stats?.due ?? 0}</p><p className="text-[10px] text-[var(--dashboard-text-muted)]">DUE</p></div>
          </div>
        </div>
      </div>

      {/* Word card — unified Comic Sans for visibility */}
      <motion.div key={current.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="glass-card rounded-2xl border border-terminal-border p-6 md:p-8 space-y-5" style={{ fontFamily: '"Comic Sans MS", "Comic Sans", cursive' }}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-3xl font-bold text-[var(--dashboard-primary)] tracking-tight">{current.word}</h3>
            <p className="text-sm text-[var(--dashboard-text-secondary)] mt-1"><span className="px-2 py-0.5 rounded bg-[var(--dashboard-primary-subtle)] text-[var(--dashboard-primary)] text-xs font-mono">{current.partOfSpeech}</span> <span className="ml-2">{current.bengaliMeaning}</span></p>
          </div>
          <div className="flex gap-2">{current.examRelevance?.map((e) => (<span key={e} className="px-2 py-1 rounded-full bg-[var(--accent)]/10 border border-[var(--accent)]/20 text-[10px] font-mono text-[var(--accent)]">{e}</span>))}</div>
        </div>

        {current.verbForms && current.verbForms.length > 0 && (
          <div className="flex flex-wrap gap-2"><span className="text-xs text-[var(--dashboard-text-muted)]">Verb forms:</span>{current.verbForms.map((f) => (<span key={f} className="px-2 py-1 rounded bg-[var(--surface-muted)] border border-terminal-border text-xs">{f}</span>))}</div>
        )}

        <div className="grid md:grid-cols-2 gap-3">
          <div className="rounded-xl bg-emerald-500/5 border border-emerald-500/15 p-3"><p className="text-xs font-bold text-emerald-600 mb-1 flex items-center gap-1"><Target className="w-3 h-3" /> Synonyms</p><p className="text-sm text-[var(--dashboard-text-secondary)]">{current.synonyms?.join(", ") || "—"}</p></div>
          <div className="rounded-xl bg-rose-500/5 border border-rose-500/15 p-3"><p className="text-xs font-bold text-rose-600 mb-1 flex items-center gap-1"><X className="w-3 h-3" /> Antonyms</p><p className="text-sm text-[var(--dashboard-text-secondary)]">{current.antonyms?.join(", ") || "—"}</p></div>
        </div>

        <div className="rounded-xl bg-[var(--surface-raised)] border border-terminal-border p-4">
          <p className="text-xs font-bold text-[var(--dashboard-text-muted)] uppercase tracking-widest mb-2">Example — exam relevant</p>
          <p className="text-sm leading-relaxed text-[var(--dashboard-text-primary)]">“{current.exampleSentence}”</p>
          {current.exampleSentenceBn && <p className="text-xs text-[var(--dashboard-text-muted)] mt-1">{current.exampleSentenceBn}</p>}
        </div>

        <div className="rounded-xl bg-sky-500/5 border border-sky-500/15 p-4">
          <p className="text-xs font-bold text-sky-600 mb-1 flex items-center gap-1"><Clock className="w-3 h-3" /> Context / Use case</p>
          <p className="text-sm text-[var(--dashboard-text-secondary)]">{current.context}</p>
        </div>

        <AnimatePresence>
          {revealed ? (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="rounded-xl bg-amber-500/5 border border-amber-500/15 p-4">
              <p className="text-xs font-bold text-amber-600 mb-1 flex items-center gap-1"><Lightbulb className="w-3 h-3" /> Mnemonic</p>
              <p className="text-sm text-[var(--dashboard-text-secondary)]">{current.mnemonic}</p>
              <div className="flex gap-3 mt-4">
                <button onClick={() => void review(false)} className="flex-1 py-2.5 rounded-xl bg-[var(--dashboard-danger-subtle)] border border-[var(--dashboard-danger)]/30 text-[var(--dashboard-danger)] font-mono text-sm flex items-center justify-center gap-2"><X className="w-4 h-4" /> Don&apos;t know</button>
                <button onClick={() => void review(true)} className="flex-1 py-2.5 rounded-xl bg-emerald-500 text-white font-mono text-sm flex items-center justify-center gap-2"><Check className="w-4 h-4" /> Know</button>
              </div>
            </motion.div>
          ) : (
            <button onClick={() => setRevealed(true)} className="w-full py-3 rounded-xl bg-[var(--accent)] text-[var(--dashboard-text-inverse)] font-mono text-sm flex items-center justify-center gap-2"><Brain className="w-4 h-4" /> Reveal & Memorize</button>
          )}
        </AnimatePresence>

        <div className="flex items-center justify-between text-xs text-[var(--dashboard-text-muted)] font-mono">
          <span>{idx + 1} / {words.length}</span>
          <span className="flex items-center gap-1"><TrendUp className="w-3 h-3" /> Priority: frequency {current.frequency} • {current.difficulty}</span>
        </div>
      </motion.div>

      <div className="flex justify-center gap-3">
        <button onClick={() => { setRevealed(false); setIdx((i) => Math.max(0, i - 1)); }} className="px-4 py-2 rounded-lg border border-terminal-border text-sm text-[var(--dashboard-text-secondary)]">Previous</button>
        <button onClick={() => { setRevealed(false); setIdx((i) => (i + 1) % words.length); }} className="px-4 py-2 rounded-lg bg-[var(--surface-muted)] border border-terminal-border text-sm text-[var(--dashboard-text-secondary)]">Next →</button>
      </div>
    </div>
  );
}
