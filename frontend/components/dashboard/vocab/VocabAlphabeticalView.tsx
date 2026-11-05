"use client";

import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { BookOpen, SkipForward, CaretLeft, CaretRight } from "@phosphor-icons/react";
import { api } from "@/lib/services/api";
import { useToastSafe } from "@/lib/toast-ctx";
import { useLanguage, t } from "@/lib/lang-ctx";
import type { Server } from "@/lib/types";

const ALPHABET = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "O", "P", "Q", "R", "S", "T", "U", "V", "W", "X", "Y", "Z"];

const DIFFICULTY_BADGE: Record<string, string> = {
  easy: "text-emerald-600 bg-emerald-500/10 border-emerald-500/20",
  medium: "text-amber-600 bg-amber-500/10 border-amber-500/20",
  hard: "text-red-600 bg-red-500/10 border-red-500/20",
};

export default function VocabAlphabeticalView() {
  const { lang } = useLanguage();
  const toast = useToastSafe();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentLetterIndex, setCurrentLetterIndex] = useState(0);
  const [currentIndex, setCurrentIndexState] = useState(0);
  const [words, setWords] = useState<Server.VocabWordDTO[]>([]);
  const [showWord, setShowWord] = useState(false);
  const [completedCount, setCompletedCount] = useState(0);
  const [totalWords, setTotalWords] = useState(0);

  // Load words for the current letter
  const loadLetterWords = useCallback(async (letter: string) => {
    try {
      setLoading(true);
      setError(null);
      const s = await api.vocabStream({ mode: "all" });
      // Filter words by starting letter
      const letterWords = s.words.filter((w: Server.VocabWordDTO) => w.word.charAt(0).toUpperCase() === letter.toUpperCase());
      setWords(letterWords);
      setTotalWords(letterWords.length);
      setCurrentIndexState(0);
      setShowWord(true);
      setCompletedCount(0);
    } catch (err) {
      console.error("VocabAlphabeticalView load error:", err);
      setError(t(lang, "শব্দ লোড করা যায়নি", "Failed to load vocabulary"));
      toast.error(t(lang, "ভোকাব লোড করা যায়নি", "Failed to load vocabulary"));
    } finally {
      setLoading(false);
    }
  }, []);

  // Load all alphabet letters initially
  useEffect(() => {
    // Start with letter A
    loadLetterWords("A");
  }, [loadLetterWords]);

  // Calculate progress
  const progress = totalWords > 0 ? Math.round((currentIndex / totalWords) * 100) : 0;

  const nextWord = useCallback(() => {
    if (words.length === 0) return;
    setCurrentIndexState((prev) => {
      const next = prev + 1;
      if (next >= words.length) {
        // Move to next letter, or wrap to A if at end
        const nextLetterIndex = (currentLetterIndex + 1) % ALPHABET.length;
        setCurrentLetterIndex(nextLetterIndex);
        setCurrentIndexState(0);
        // Reload words for the new letter
        loadLetterWords(ALPHABET[nextLetterIndex]);
        return 0;
      }
      return next;
    });
  }, [words, currentLetterIndex, loadLetterWords]);

  const prevWord = useCallback(() => {
    if (words.length === 0) return;
    setCurrentIndexState((prev) => {
      const prevIdx = prev - 1;
      if (prevIdx < 0) {
        // Move to previous letter
        const prevLetterIndex = currentLetterIndex - 1;
        if (prevLetterIndex < 0) {
          setCurrentLetterIndex(ALPHABET.length - 1);
        } else {
          setCurrentLetterIndex(prevLetterIndex);
        }
        // Reload words for the new letter
        loadLetterWords(ALPHABET[currentLetterIndex]);
        return words.length - 1;
      }
      return prevIdx;
    });
  }, [words, currentLetterIndex, loadLetterWords]);

  const toggleReveal = useCallback(() => {
    setShowWord((r) => !r);
  }, []);

  const markAsViewed = useCallback(() => {
    // In a full implementation, this would update user progress
    setCompletedCount((c) => c + 1);
  }, []);

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

  if (error || words.length === 0) {
    return (
      <div className="glass-card rounded-2xl border border-terminal-border p-6">
        <div className="flex flex-col items-center justify-center py-8 gap-4">
          <div className="text-[var(--dashboard-danger)] text-4xl">⚠️</div>
          <p className="text-[var(--dashboard-text)] font-mono text-sm text-center">{error}</p>
          <button
            onClick={() => void loadLetterWords(ALPHABET[currentLetterIndex])}
            className="px-4 py-2 rounded-lg bg-[var(--surface-raised)] border border-terminal-border text-[var(--dashboard-text)] hover:bg-[var(--surface-muted)] transition-colors font-mono text-xs"
          >
            {t(lang, "পুনঃ চেষ্টা করুন", "Retry")}
          </button>
        </div>
      </div>
    );
  }

  const currentWord = words[currentIndex];

  // Word-of-day card style presentation
  const renderWordCard = () => {
    if (!currentWord) return null;

    const isWordOfDay = currentWord.partOfSpeech && currentIndex === 0;
    const difficultyClass = DIFFICULTY_BADGE[currentWord.difficulty] ?? DIFFICULTY_BADGE.medium;

    return (
      <motion.div
        key={currentWord.id}
        className={`glass-card rounded-2xl border border-terminal-border p-5 ${
          showWord ? "opacity-100" : "opacity-0"
        } transition-opacity`}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-[var(--accent)]" />
            <span className="text-xs font-mono text-[var(--dashboard-text-muted)] uppercase tracking-wider">
              {t(lang, "অদ্ভুত শব্দ", "Vocabulary")}
            </span>
          </div>
          <span className="text-[11px] font-mono">
            {`${currentLetterIndex + 1}/${ALPHABET.length} ${t(lang, "অক্ষর", "Letter")} ${ALPHABET[currentLetterIndex]}`}
          </span>
        </div>

        <div className="space-y-4">
          {/* Word display */}
          <div className="text-center mb-6">
            <h3 className="text-3xl font-bold text-[var(--dashboard-text-primary)] mb-2">
              {currentWord.word}
            </h3>
            <p className="text-sm text-[var(--dashboard-text-muted)]">
              {t(lang, "শुरু মূলে", "Starts with")} {currentWord.word.charAt(0).toUpperCase()}
            </p>
          </div>

          {/* Bengali Meaning */}
          <div>
            <p className="text-sm text-[var(--dashboard-text-secondary)] mb-2">
              {currentWord.bengaliMeaning}
            </p>
          </div>

          {/* Part of Speech */}
          <div className="flex items-center gap-3 text-xs text-[var(--dashboard-text-muted)]">
            <span className={difficultyClass}>
              {currentWord.difficulty}
            </span>
            <span>{currentWord.partOfSpeech}</span>
          </div>

          {/* Example Sentence */}
          <div className="rounded-xl bg-[var(--surface-raised)] border border-terminal-border p-3.5">
            <p className="text-xs italic text-[var(--dashboard-text-primary)] leading-relaxed">
              &ldquo;{currentWord.exampleSentence}&rdquo;
            </p>
            {currentWord.exampleSentenceBn && (
              <p className="text-xs italic text-[var(--dashboard-text-muted)] mt-1">
                &ldquo;{currentWord.exampleSentenceBn}&rdquo;
              </p>
            )}
          </div>

          {/* Mnemonic */}
          <div className="pt-3 border-t border-terminal-border">
            <p className="text-[11px] font-mono text-[var(--dashboard-text-muted)] uppercase tracking-wider">
              {t(lang, "মnemonic", "Mnemonic")}
            </p>
            <p className="font-mono text-[12px] text-[var(--dashboard-text)]">{currentWord.mnemonic}</p>
          </div>

          {/* Navigation controls */}
          <div className="pt-3 border-t border-terminal-border">
            <div className="flex gap-3">
              <button
                onClick={() => prevWord()}
                className="flex-1 py-2 rounded-xl bg-[var(--surface-raised)] border border-terminal-border text-[var(--dashboard-text)] font-mono text-sm hover:bg-[var(--surface-muted)] transition-colors"
                disabled={currentIndex <= 0}
                aria-label="পূর্ববর্তী শব্দ"
              >
                <CaretLeft size={16} /> {t(lang, "পূর্ববর্তী", "Previous")}
              </button>
              <button
                onClick={() => nextWord()}
                className="flex-1 py-2 rounded-xl bg-[var(--surface-raised)] border border-terminal-border text-[var(--dashboard-text)] font-mono text-sm hover:bg-[var(--surface-muted)] transition-colors"
                disabled={currentIndex >= words.length - 1}
                aria-label="পরবর্তী শব্দ"
              >
                {t(lang, "পরবর্তী", "Next")}
                <SkipForward size={16} />
              </button>
            </div>

            {/* Reveal button */}
            {showWord ? (
              <button
                onClick={() => toggleReveal()}
                className="w-full py-3 rounded-xl bg-[var(--accent)] text-[var(--dashboard-text-inverse)] font-mono text-sm flex items-center justify-center gap-2 active:opacity-90"
              >
                {showWord ? t(lang, "বুকে দেখুন", "Hide") : t(lang, "রিভিল ও মনে করুন", "Reveal & Memorize")}
              </button>
            ) : (
              <button
                onClick={() => toggleReveal()}
                className="w-full py-3 rounded-xl bg-[var(--accent)] text-[var(--dashboard-text-inverse)] font-mono text-sm flex items-center justify-center gap-2 active:opacity-90"
              >
                {t(lang, "রিভিল ও মনে করুন", "Reveal & Memorize")}
              </button>
            )}
          </div>

          {/* Progress info */}
          {currentWord && (
            <div className="mt-4 text-xs text-[var(--dashboard-text-muted)]">
              {t(lang, "শুভклিষ্ট", "Progress")}
              : {currentIndex + 1} {t(lang, "এর মধ্যে", "of")}
              {totalWords} {t(lang, "শব্দ", "words")}
              {currentLetterIndex === 0 ? ` (${t(lang, "আমেগুলো", "All")})` : ` (${t(lang, "অক্ষর", "Letter")} ${ALPHABET[currentLetterIndex]})`}
            </div>
          )}
        </div>
      </motion.div>
    );
  };

  // Alphabet navigation header
  const alphabetNav = (
    <div className="flex gap-1 mb-6 pt-4 border-b border-terminal-border">
      {ALPHABET.map((letter, i) => (
        <button
          key={letter}
          onClick={() => setCurrentLetterIndex(i)}
          className={`px-3 py-1.5 rounded-full min-h-11 min-w-11 text-xs font-mono border transition-all ${
            currentLetterIndex === i
              ? "bg-[var(--accent)] text-[var(--dashboard-text-inverse)] border-[var(--accent)]"
              : "bg-subtle border-[var(--accent)]/20 text-[var(--dashboard-text-muted)] hover:border-[var(--accent)]/40 hover:text-[var(--text-primary)]"
          }`}
        >
          {letter}
        </button>
      ))}
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="glass-card rounded-2xl border border-terminal-border p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-[var(--accent)]" />
            <span className="text-xs font-mono text-[var(--dashboard-text-muted)] uppercase tracking-wider">
              {t(lang, "আক্টনীয় শব্দ browse", "Alphabetical Vocabulary")}
            </span>
          </div>
          <span className="text-[11px] font-mono text-[var(--dashboard-text-muted)]">
            {t(lang, "全顺序", "Alphabetical Order")}
          </span>
        </div>

        {alphabetNav}

        {renderWordCard()}

        <span className="sr-only" role="status" aria-live="polite">
          {t(lang, "শব্দ নম্বর", "Word number")}
        </span>
      </div>
    </div>
  );
}