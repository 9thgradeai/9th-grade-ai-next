"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { motion } from "framer-motion";
import { BookOpen, Play, Pause, SkipForward, CaretLeft, CaretRight } from "@phosphor-icons/react";
import { api } from "@/lib/services/api";
import { useToastSafe } from "@/lib/toast-ctx";
import { useLanguage, t } from "@/lib/lang-ctx";
import VocabEnrichment from "./VocabEnrichment";
import { formatRotationCountdown, WORD_ROTATE_MS } from "@/components/dashboard/VocabTab";
import type { Server } from "@/lib/types";

const DIFFICULTY_BADGE: Record<string, string> = {
  easy: "text-emerald-600 bg-emerald-500/10 border-emerald-500/20",
  medium: "text-amber-600 bg-amber-500/10 border-amber-500/20",
  hard: "text-red-600 bg-red-500/10 border-red-500/20",
};

/**
 * VocabStreamView — Phase 1 of the Vocabulary Enhancement Program.
 *
 * Consumes the unified `/api/vocab/stream` endpoint (server-driven
 * circulation) and renders the current word from the merged stream:
 * SRS-due words first, then the daily word, then fresh words.
 *
 * Rotation is server-slot-aligned and hand-rolled here with a 10-minute
 * clock so the learner never has to rotate by hand.
 */
export default function VocabStreamView() {
  const { lang } = useLanguage();
  const toast = useToastSafe();
  const [stream, setStream] = useState<Server.VocabStreamResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [idx, setIdx] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [autoRotate, setAutoRotate] = useState(true);
  const [remainingMs, setRemainingMs] = useState(WORD_ROTATE_MS);
  const [autoAnnounce, setAutoAnnounce] = useState("");
  const rotationStartRef = useRef<number>(0);
  const revealedRef = useRef(revealed);
  const idxRef = useRef(idx);
  const streamRef = useRef(stream);
  useEffect(() => { revealedRef.current = revealed; }, [revealed]);
  useEffect(() => { idxRef.current = idx; }, [idx]);
  useEffect(() => { streamRef.current = stream; }, [stream]);
  const pokeRotationClock = useCallback(() => {
    rotationStartRef.current = Date.now();
    setRemainingMs(WORD_ROTATE_MS);
  }, []);

  const loadStream = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const s = await api.vocabStream({ mode: "mixed" });
      setStream(s);
      setIdx(0);
      setRevealed(false);
    } catch (err) {
      console.error("VocabStreamView load error:", err);
      setError(t(lang, "শব্দ লোড করা যায়নি", "Failed to load vocabulary"));
      toast.error(t(lang, "ভোকাব লোড করা যায়নি", "Failed to load vocabulary"));
    } finally {
      setLoading(false);
    }
  }, [lang, toast]);

  useEffect(() => {
    loadStream(); // eslint-disable-line @typescript-eslint/no-floating-promises
  }, [loadStream]);

  const currentWord = stream?.words[idx] ?? null;
  const current = currentWord
    ? {
        id: currentWord.id,
        word: currentWord.word,
        bengaliMeaning: currentWord.bengaliMeaning,
        partOfSpeech: currentWord.partOfSpeech,
        verbForms: currentWord.verbForms,
        synonyms: currentWord.synonyms,
        antonyms: currentWord.antonyms,
        exampleSentence: currentWord.exampleSentence,
        exampleSentenceBn: currentWord.exampleSentenceBn,
        context: currentWord.context,
        mnemonic: currentWord.mnemonic,
        examRelevance: currentWord.examRelevance,
        frequency: currentWord.frequency,
        difficulty: currentWord.difficulty,
        ipa: currentWord.ipa,
        audioUrl: currentWord.audioUrl,
        register: currentWord.register,
        collocations: currentWord.collocations,
        wordFamily: currentWord.wordFamily,
        confusables: currentWord.confusables,
        status: currentWord.status,
        source: currentWord.source,
        progress: null,
      }
    : null;

  const isWordOfDay = stream?.wordOfDay && current ? current.word === stream.wordOfDay.word : false;

  const nextWord = useCallback(() => {
    if (!stream || stream.words.length === 0) return;
    setIdx((prev) => (prev + 1) % stream.words.length);
    setRevealed(false);
    pokeRotationClock();
  }, [stream, pokeRotationClock]);

  const prevWord = useCallback(() => {
    if (!stream || stream.words.length === 0) return;
    setIdx((prev) => (prev - 1 + stream.words.length) % stream.words.length);
    setRevealed(false);
    pokeRotationClock();
  }, [stream, pokeRotationClock]);

  // A single 1s ticker owns both the countdown and the auto-advance. The old
  // second setTimeout raced it and advanced twice per period.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onVisible = () => {
      if (document.visibilityState === "visible") pokeRotationClock();
    };
    document.addEventListener("visibilitychange", onVisible);
    const id = window.setInterval(() => {
      const remaining = Math.max(0, WORD_ROTATE_MS - (Date.now() - rotationStartRef.current));
      setRemainingMs(remaining);
      // Pause while the learner is actively recalling a revealed answer, when
      // paused explicitly, or while the tab is hidden (no idle catch-up).
      if (!autoRotate || revealedRef.current) return;
      if (document.visibilityState === "hidden") return;
      const s = streamRef.current;
      if (!s || s.words.length <= 1 || remaining > 0) return;
      const nextIdx = (idxRef.current + 1) % s.words.length;
      const next = s.words[nextIdx];
      if (!next) return;
      setAutoAnnounce(`পরের শব্দ: ${next.word}, ${next.bengaliMeaning}`);
      setIdx(nextIdx);
      rotationStartRef.current = Date.now();
      setRemainingMs(WORD_ROTATE_MS);
    }, 1000);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [autoRotate, pokeRotationClock]);

  useEffect(() => {
    pokeRotationClock();
  }, [current?.word, autoRotate, pokeRotationClock]);

  // Closing a revealed answer gives the learner a full fresh period again.
  useEffect(() => {
    if (!revealed) pokeRotationClock();
  }, [revealed, pokeRotationClock]);

  if (loading) {
    return (
      <div className="glass-card rounded-2xl border border-terminal-border p-6">
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--accent)]" />
          <span className="ml-3 text-[var(--dashboard-text-muted)] font-mono">
            {t(lang, "শব্দ লোড হচ্ছে...", "Loading vocabulary...")}
          </span>
        </div>
      </div>
    );
  }

  if (error || !current) {
    return (
      <div className="glass-card rounded-2xl border border-terminal-border p-6">
        <div className="flex flex-col items-center justify-center py-8 gap-4">
          <div className="text-[var(--dashboard-danger)] text-4xl">⚠️</div>
          <p className="text-[var(--dashboard-text)] font-mono text-sm text-center">{error}</p>
          <button
            onClick={() => void loadStream()}
            className="px-4 py-2 rounded-lg bg-[var(--surface-raised)] border border-terminal-border text-[var(--dashboard-text)] hover:bg-[var(--surface-muted)] transition-colors font-mono text-xs"
          >
            {t(lang, "পুনঃ চেষ্টা করুন", "Retry")}
          </button>
        </div>
      </div>
    );
  }

  const renderWordContent = () => {
    if (isWordOfDay && stream?.wordOfDay) {
      const wod = stream.wordOfDay;
      return (
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-[11px] font-mono text-[var(--dashboard-text-muted)] uppercase tracking-wider">
            <div className="w-3 h-3 rounded-full bg-[var(--accent)]" />
            {t(lang, "দিনের শব্দ", "Word of Day")}
          </div>
          <div className="flex items-center gap-3 mb-1">
            <h3 className="text-2xl font-bold text-[var(--dashboard-text)]">{wod.word}</h3>
            <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-[var(--surface-raised)] border border-terminal-border text-[var(--dashboard-text-muted)] uppercase tracking-wider">
              {wod.partOfSpeech}
            </span>
          </div>
          <p className="text-sm text-[var(--dashboard-text-secondary)] mb-3">{wod.bengaliMeaning}</p>
          <div className="rounded-xl bg-[var(--surface-raised)] border border-terminal-border p-3.5">
            <p className="text-xs italic text-[var(--dashboard-text-primary)] leading-relaxed">
              &ldquo;{wod.exampleSentence}&rdquo;
            </p>
            {wod.exampleSentenceBn && (
              <p className="text-xs italic text-[var(--dashboard-text-muted)] mt-1">
                &ldquo;{wod.exampleSentenceBn}&rdquo;
              </p>
            )}
          </div>
          <VocabEnrichment
            word={wod.word}
            ipa={wod.ipa}
            audioUrl={wod.audioUrl}
            register={wod.register}
            collocations={wod.collocations}
            wordFamily={wod.wordFamily}
            confusables={wod.confusables}
          />
          <div className="flex gap-3 pt-2">
            <button
              onClick={() => setRevealed((r) => !r)}
              className="flex-1 py-3 rounded-xl bg-[var(--accent)] text-[var(--dashboard-text-inverse)] font-mono text-sm flex items-center justify-center gap-2 active:opacity-90"
            >
              {t(lang, "মনে রাখুন", "Memorize")}
            </button>
            <button
              onClick={() => nextWord()}
              className="px-4 py-3 rounded-xl bg-[var(--surface-raised)] border border-terminal-border text-[var(--dashboard-text)] font-mono text-sm hover:bg-[var(--surface-muted)] transition-colors flex items-center gap-2"
            >
              <SkipForward size={16} />
              {t(lang, "পরবর্তী শব্দ", "Next")}
            </button>
          </div>
        </div>
      );
    }

    return (
      <div className="glass-card rounded-2xl border border-terminal-border p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-[var(--accent)]/15 flex items-center justify-center">
            <BookOpen className="w-5 h-5 text-[var(--accent)]" />
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-bold text-[var(--dashboard-text-primary)]">{current.word}</h3>
            <p className="text-xs text-[var(--dashboard-text-muted)] font-mono">
              {current.partOfSpeech} • {current.source === "DUE" ? t(lang, "সঠিকভাবে রিভিউধারণে", "Due Review") : t(lang, "সাধারণ শব্দ", "Vocab")}
            </p>
          </div>
          <span className={`text-[11px] font-mono px-2 py-0.5 rounded-full border ${DIFFICULTY_BADGE[(current.difficulty ?? "").toLowerCase()] ?? DIFFICULTY_BADGE.medium}`}>
            {(current.difficulty ?? "MEDIUM").toUpperCase()}
          </span>
        </div>

        <div className="space-y-4">
          <div>
            <p className="text-sm text-[var(--dashboard-text-secondary)] mb-2">{current.bengaliMeaning}</p>
            {current.examRelevance && current.examRelevance.length > 0 && (
              <div className="flex items-center gap-2 flex-wrap">
                {current.examRelevance.slice(0, 3).map((tag) => (
                  <span key={tag} className="text-[11px] font-mono px-2 py-1 rounded-full bg-[var(--accent)]/10 border border-[var(--accent)]/20 text-[var(--accent)]">
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-xl bg-[var(--surface-raised)] border border-terminal-border p-3.5">
            <p className="text-xs italic text-[var(--dashboard-text-primary)] leading-relaxed">
              &ldquo;{current.exampleSentence}&rdquo;
            </p>
            {current.exampleSentenceBn && (
              <p className="text-xs italic text-[var(--dashboard-text-muted)] mt-1">
                &ldquo;{current.exampleSentenceBn}&rdquo;
              </p>
            )}
          </div>

          <div className="pt-3 border-t border-terminal-border space-y-3">
            {current.synonyms && current.synonyms.length > 0 && (
              <div>
                <span className="text-[11px] font-mono text-[var(--dashboard-text-muted)] uppercase tracking-wider">
                  {t(lang, "সমার্থক", "Synonyms")}
                </span>
                <div className="flex flex-wrap gap-1 mt-1">
                  {current.synonyms.slice(0, 4).map((s) => (
                    <span key={s} className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-600">
                      {s}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {current.antonyms && current.antonyms.length > 0 && (
              <div>
                <span className="text-[11px] font-mono text-[var(--dashboard-text-muted)] uppercase tracking-wider">
                  {t(lang, "বিপরীতার্থক", "Antonyms")}
                </span>
                <div className="flex flex-wrap gap-1 mt-1">
                  {current.antonyms.slice(0, 4).map((a) => (
                    <span key={a} className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-red-500/10 border border-red-500/20 text-red-600">
                      {a}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          <VocabEnrichment
            word={current.word}
            ipa={current.ipa}
            audioUrl={current.audioUrl}
            register={current.register}
            collocations={current.collocations}
            wordFamily={current.wordFamily}
            confusables={current.confusables}
          />

          <div className="flex gap-3 pt-2">
            <button
              onClick={() => setRevealed((r) => !r)}
              className="flex-1 py-3 rounded-xl bg-[var(--accent)] text-[var(--dashboard-text-inverse)] font-mono text-sm flex items-center justify-center gap-2 active:opacity-90"
            >
              {t(lang, "রিভিল ও মনে করুন", "Reveal & Memorize")}
            </button>
            <button
              onClick={() => nextWord()}
              className="px-4 py-3 rounded-xl bg-[var(--surface-raised)] border border-terminal-border text-[var(--dashboard-text)] font-mono text-sm hover:bg-[var(--surface-muted)] transition-colors flex items-center gap-2"
            >
              <SkipForward size={16} />
              {t(lang, "পরবর্তী শব্দ", "Next")}
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div className="glass-card rounded-2xl border border-terminal-border p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-[var(--accent)]" />
            <span className="text-xs font-mono text-[var(--dashboard-text-muted)] uppercase tracking-wider">
              {t(lang, "সার্ভ-ড্রাইভেন বাক্য", "Server-Driven Stream")}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-mono text-[var(--dashboard-text-muted)]">
              {stream ? `${stream.mode} • slot ${stream.slotIndex}` : ""}
            </span>
            {/* WCAG 2.2.2: hands-free rotation can always be paused. */}
            <div className="flex items-center gap-1.5 rounded-full border border-terminal-border bg-[var(--surface-raised)] pl-1 pr-2 py-1" role="group" aria-label={t(lang, "স্বয়ংক্রিয় ঘূর্ণন", "Auto-rotation")}>
              <button
                type="button"
                onClick={() => setAutoRotate((v) => !v)}
                aria-pressed={autoRotate}
                aria-label={autoRotate ? t(lang, "স্বয়ংক্রিয় ঘূর্ণন বিরতি দিন", "Pause auto-rotation") : t(lang, "স্বয়ংক্রিয় ঘূর্ণন চালু করুন", "Resume auto-rotation")}
                className="w-11 h-11 min-w-11 rounded-full flex items-center justify-center text-[var(--dashboard-text-secondary)] hover:text-[var(--accent)] hover:bg-[var(--surface-muted)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--dashboard-focus-ring)]"
              >
                {autoRotate ? <Pause className="w-4 h-4" weight="fill" /> : <Play className="w-4 h-4" weight="fill" />}
              </button>
              <span className="text-[11px] font-mono tabular-nums text-[var(--dashboard-text-secondary)]" role="timer" aria-label={t(lang, "পরের শব্দ আসতে বাকি", "Next word in")}>
                {autoRotate ? formatRotationCountdown(remainingMs) : t(lang, "বিরতি", "Paused")}
              </span>
            </div>
          </div>
        </div>

        {renderWordContent()}

        <span className="sr-only" role="status" aria-live="polite">{autoAnnounce}</span>
      </div>
    </div>
  );
}
