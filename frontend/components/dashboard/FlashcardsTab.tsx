"use client";

import { useState, useSyncExternalStore, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, ChevronRight, RotateCcw, Lightbulb, BarChart3 } from "lucide-react";
import { FLASHCARD_DECKS } from "@/lib/data/study";
import { useToastSafe } from "@/lib/toast-ctx";
import { api } from "@/lib/services/api";
import type { Flashcard } from "@/lib/types";

/* --------------------------------------------------------------------------
   A shared "current time" clock backed by useSyncExternalStore. Reading the
   time through this hook means we never call Date.now() during render, never
   access a ref during render, and never call setState inside an effect — all
   of which the React Compiler lint rules forbid.
   -------------------------------------------------------------------------- */
let nowValue = typeof window === "undefined" ? 0 : Date.now();
const nowListeners = new Set<() => void>();
if (typeof window !== "undefined") {
  setInterval(() => {
    nowValue = Date.now();
    nowListeners.forEach((l) => l());
  }, 60_000);
}
function subscribeNow(cb: () => void) {
  nowListeners.add(cb);
  return () => {
    nowListeners.delete(cb);
  };
}
function getNowSnapshot() {
  return nowValue;
}
function getNowServerSnapshot() {
  return 0;
}
function useNow(): number {
  return useSyncExternalStore(subscribeNow, getNowSnapshot, getNowServerSnapshot);
}

type ReviewRating = "again" | "hard" | "good" | "easy";

const RATING_VALUE: Record<ReviewRating, 0 | 1 | 2 | 3> = {
  again: 0,
  hard: 1,
  good: 2,
  easy: 3,
};

const RATING_CONFIG: Record<ReviewRating, { label: string; color: string; nextInterval: number }> = {
  again: { label: "Again", color: "text-red-400 bg-red-500/10 border-red-500/30", nextInterval: 1 },
  hard: { label: "Hard", color: "text-amber-400 bg-amber-500/10 border-amber-500/30", nextInterval: 6 },
  good: { label: "Good", color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30", nextInterval: 10 },
  easy: { label: "Easy", color: "text-sky-400 bg-sky-500/10 border-sky-500/30", nextInterval: 15 },
};

export default function FlashcardsTab() {
  const toast = useToastSafe();
  const syncFailureNotified = useRef(false);
  const [selectedDeck, setSelectedDeck] = useState<string | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const [sessionStats, setSessionStats] = useState({ reviewed: 0, correct: 0 });
  const [reviewQueue, setReviewQueue] = useState<Flashcard[]>([]);
  const [decks, setDecks] = useState<Record<string, Flashcard[]>>(FLASHCARD_DECKS);
  const now = useNow();

  // Load flashcard decks from the database (fallback to static data).
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const flashcards = await api.flashcards();
        if (!cancelled && flashcards.length) {
          const grouped: Record<string, Flashcard[]> = {};
          for (const f of flashcards) {
            const deck = f.subjectName || "General";
            grouped[deck] = grouped[deck] ?? [];
            // Honor the server-authoritative SRS schedule when the user has a
            // prior review history; only brand-new cards (no srs) default to
            // "due now" so they enter the review queue.
            const nextReview = f.srs ? new Date(f.srs.nextReview).getTime() : now;
            grouped[deck].push({
              id: String(f.id),
              subject: deck,
              question: f.question,
              answer: f.answer,
              hint: f.hint,
              difficulty: f.difficulty,
              nextReview,
              interval: f.srs?.intervalDays ?? 1,
              repetitions: f.srs?.repetitions ?? 0,
              easeFactor: f.srs?.easeFactor ?? 2.5,
            });
          }
          setDecks(grouped);
        }
      } catch {
        /* keep static fallback */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const currentCard = reviewQueue[currentIndex];

  const startSession = (deckName: string) => {
    const cards = decks[deckName] || [];
    const due = cards.filter((c) => c.nextReview <= now);
    setReviewQueue(due.length > 0 ? due : cards);
    setSelectedDeck(deckName);
    setCurrentIndex(0);
    setIsFlipped(false);
    setShowHint(false);
    setSessionStats({ reviewed: 0, correct: 0 });
  };

  // Mixed-deck review: pull every due card across all decks into one queue so
  // users aren't forced to sit through a single subject's backlog.
  const startMixedSession = () => {
    const all = Object.values(decks).flat();
    const due = all.filter((c) => c.nextReview <= now);
    setReviewQueue(due.length > 0 ? due : all);
    setSelectedDeck("সব ডিউ কার্ড");
    setCurrentIndex(0);
    setIsFlipped(false);
    setShowHint(false);
    setSessionStats({ reviewed: 0, correct: 0 });
  };

  const handleFlip = () => {
    if (!isFlipped) {
      setIsFlipped(true);
      setShowHint(false);
    }
  };

  const handleRating = (rating: ReviewRating) => {
    if (!currentCard) return;

    const newQueue = reviewQueue.map((card, i) => {
      if (i !== currentIndex) return card;
      const nextInterval = RATING_CONFIG[rating].nextInterval;
      return {
        ...card,
        repetitions: card.repetitions + 1,
        interval: nextInterval,
        nextReview: now + nextInterval * 86400000,
        easeFactor: Math.max(
          1.3,
          card.easeFactor - (rating === "again" ? 0.3 : rating === "hard" ? 0.15 : 0),
        ),
      };
    });

    setSessionStats((prev) => ({
      reviewed: prev.reviewed + 1,
      correct: prev.correct + (rating !== "again" ? 1 : 0),
    }));

    setReviewQueue(newQueue);

    // Persist the review server-side (SM-2 is authoritative there). The UI
    // schedule above is optimistic; reconcile on success, notify once on
    // failure so progress loss isn't silent.
    const flashcardId = Number(currentCard.id);
    if (Number.isInteger(flashcardId) && flashcardId > 0) {
      void api
        .reviewFlashcard(flashcardId, RATING_VALUE[rating])
        .then((state) => {
          const s = state as
            | { nextReview?: string; interval?: number; easeFactor?: number; repetitions?: number }
            | undefined;
          if (!s || typeof s.interval !== "number") return;
          setReviewQueue((prev) =>
            prev.map((card) =>
              card.id === currentCard.id
                ? {
                    ...card,
                    interval: s.interval ?? card.interval,
                    easeFactor: typeof s.easeFactor === "number" ? s.easeFactor : card.easeFactor,
                    repetitions: typeof s.repetitions === "number" ? s.repetitions : card.repetitions,
                    nextReview:
                      typeof s.nextReview === "string"
                        ? new Date(s.nextReview).getTime()
                        : card.nextReview,
                  }
                : card,
            ),
          );
        })
        .catch(() => {
          if (!syncFailureNotified.current) {
            syncFailureNotified.current = true;
            toast.error("রিভিউ সংরক্ষণ করা যায়নি — অগ্রগতি সীমিত হতে পারে");
          }
        });
    }

    if (currentIndex < newQueue.length - 1) {
      setCurrentIndex((i) => i + 1);
      setIsFlipped(false);
      setShowHint(false);
    } else {
      setCurrentIndex(0);
      setIsFlipped(false);
      setShowHint(false);
    }
  };

  const resetSession = () => {
    if (selectedDeck) {
      startSession(selectedDeck);
    }
  };

  const exitDeck = () => {
    setSelectedDeck(null);
    setCurrentIndex(0);
    setIsFlipped(false);
    setShowHint(false);
    setReviewQueue([]);
  };

  return (
    <div className="space-y-6">
      {!selectedDeck ? (
        <>
          {/* Deck Selection */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass-card rounded-terminal-rounded border border-terminal-border p-5"
          >
            <div className="terminal-window-bar mb-4 border-b border-terminal-border">
              <div className="dot close" /><div className="dot minimize" /><div className="dot maximize" />
              <div className="flex-1 text-center text-xs text-zinc-400 font-mono">{"// FLASHCARD_DECKS"}</div>
            </div>

            <div className="flex items-center gap-2 mb-4">
              <BarChart3 className="w-5 h-5 text-emerald-400" />
              <h2 className="text-lg font-bold text-white">Flashcards</h2>
              <span className="text-xs text-zinc-500 font-mono">Spaced Repetition System</span>
            </div>

            <p className="text-sm text-zinc-400 font-mono mb-4">
              Select a deck to start your spaced repetition session. Cards you find hard will appear more frequently.
            </p>

            <button
              onClick={startMixedSession}
              className="w-full mb-4 px-4 py-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-emerald-300 font-mono text-sm hover:bg-emerald-500/20 transition-colors flex items-center justify-center gap-2"
            >
              <BarChart3 className="w-4 h-4" />
              সব ডিউ কার্ড একসাথে রিভিউ করুন
            </button>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {Object.keys(decks).map((deckName, i) => {
                const deck = decks[deckName];
                const dueCount = deck.filter((c) => c.nextReview <= Date.now()).length;
                return (
                  <motion.button
                    key={deckName}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05 }}
                    whileHover={{ y: -2 }}
                    onClick={() => startSession(deckName)}
                    className="glass-card rounded-terminal-rounded border border-terminal-border p-4 text-left hover:border-emerald-500/40 transition-all"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-sm font-medium text-white">{deckName}</h3>
                      <span className="px-2 py-0.5 bg-emerald-500/10 border border-emerald-500/20 rounded text-[10px] font-mono text-emerald-400">
                        {dueCount} due
                      </span>
                    </div>
                    <p className="text-xs text-zinc-500 font-mono">{deck.length} cards total</p>
                  </motion.button>
                );
              })}
            </div>
          </motion.div>

          {/* Stats Overview */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="grid grid-cols-3 gap-3"
          >
            {[
              { label: "Total Cards", value: Object.values(decks).flat().length, color: "text-emerald-400" },
              { label: "Due Today", value: Object.values(decks).flat().filter((c) => c.nextReview <= now).length, color: "text-amber-400" },
              { label: "Decks", value: Object.keys(decks).length, color: "text-sky-400" },
            ].map((stat) => (
              <div key={stat.label} className="glass-card rounded-terminal-rounded border border-terminal-border p-4 text-center">
                <div className={`text-2xl font-bold font-mono ${stat.color}`}>{stat.value}</div>
                <div className="text-[10px] text-zinc-500 font-mono uppercase tracking-wider">{stat.label}</div>
              </div>
            ))}
          </motion.div>
        </>
      ) : (
        <>
          {/* Flashcard Session */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h3 className="text-sm font-medium text-white">{selectedDeck}</h3>
              <span className="text-xs text-zinc-500 font-mono">
                {currentIndex + 1} / {reviewQueue.length}
              </span>
            </div>
            <button
              onClick={exitDeck}
              className="px-3 py-1.5 bg-zinc-900 border border-zinc-800 text-zinc-400 font-mono text-xs rounded hover:bg-zinc-800 transition-colors"
            >
              Exit Deck
            </button>
          </div>

          {/* Progress */}
          <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
            <motion.div
              initial={false}
              animate={{ scaleX: reviewQueue.length > 0 ? currentIndex / reviewQueue.length : 0 }}
              style={{ transformOrigin: "left" }}
              className="h-full w-full bg-gradient-to-r from-emerald-500 to-emerald-400 rounded-full"
            />
          </div>

          {/* Stats Bar */}
          <div className="flex items-center justify-between text-xs font-mono text-zinc-500">
            <span>Reviewed: {sessionStats.reviewed}</span>
            <span>Correct: {sessionStats.correct}</span>
            <span>Accuracy: {sessionStats.reviewed > 0 ? Math.round((sessionStats.correct / sessionStats.reviewed) * 100) : 0}%</span>
          </div>

          {/* Flashcard */}
          <AnimatePresence mode="wait">
            {currentCard && reviewQueue.length > 0 && (
              <motion.div
                key={currentCard.id}
                initial={{ opacity: 0, rotateY: 0 }}
                animate={{ opacity: 1, rotateY: isFlipped ? 180 : 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.4 }}
                className="relative h-80 perspective-1000"
              >
                <div
                  role="button"
                  tabIndex={0}
                  aria-label={isFlipped ? "উত্তর দেখানো হচ্ছে — প্রশ্নে ফিরে যেতে ক্লিক করুন" : "প্রশ্ন — উত্তর দেখতে ক্লিক বা Enter চাপুন"}
                  aria-pressed={isFlipped}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      handleFlip();
                    }
                  }}
                  onClick={handleFlip}
                  className={`w-full h-full rounded-terminal-rounded border-2 cursor-pointer transition-all flex items-center justify-center p-6 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400 ${
                    isFlipped
                      ? "bg-emerald-500/10 border-emerald-500/30"
                      : "bg-subtle border-zinc-800 hover:border-emerald-500/20"
                  }`}
                >
                  <div className="text-center max-w-lg">
                     <div className="text-[10px] text-zinc-500 font-mono uppercase tracking-wider mb-3">
                        {currentCard.subject} • {currentCard.difficulty}
                     </div>
                    <h4 className={`text-xl font-medium mb-4 ${isFlipped ? "text-emerald-300" : "text-white"}`}>
                      {isFlipped ? "Answer" : "Question"}
                    </h4>
                    <p className={`text-lg leading-relaxed ${isFlipped ? "text-emerald-200 font-mono" : "text-zinc-200"}`}>
                      {isFlipped ? currentCard.answer : currentCard.question}
                    </p>

                    {!isFlipped && currentCard.hint && (
                      <AnimatePresence>
                        {showHint && (
                          <motion.p
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="mt-4 text-sm text-amber-400 font-mono"
                          >
                            💡 {currentCard.hint}
                          </motion.p>
                        )}
                      </AnimatePresence>
                    )}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Empty queue state */}
          {!currentCard && (
            <div className="glass-card rounded-terminal-rounded border border-terminal-border p-10 text-center">
              <p className="text-sm text-zinc-400 font-mono mb-1">$ deck empty</p>
              <p className="text-xs text-zinc-500 font-mono">
                No cards due in this deck right now — come back later or reset the session.
              </p>
            </div>
          )}

          {/* Controls */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {!isFlipped && currentCard?.hint && (
                <button
                  onClick={() => setShowHint(!showHint)}
                  aria-label={showHint ? "Hide hint" : "Show hint"}
                  className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center bg-zinc-900 border border-zinc-800 rounded-lg text-amber-400 hover:border-amber-500/30 transition-colors"
                >
                  <Lightbulb className="w-5 h-5" />
                </button>
              )}
              <button
                onClick={resetSession}
                aria-label="Reset session"
                className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center bg-zinc-900 border border-zinc-800 rounded-lg text-zinc-400 hover:text-white transition-colors"
              >
                <RotateCcw className="w-5 h-5" />
              </button>
            </div>

            <div className="flex items-center gap-2">
              {currentIndex > 0 && (
                <button
                  onClick={() => { setCurrentIndex((i) => i - 1); setIsFlipped(false); setShowHint(false); }}
                  aria-label="Previous card"
                  className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center bg-zinc-900 border border-zinc-800 rounded-lg text-zinc-400 hover:text-white transition-colors"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
              )}
              {isFlipped ? (
                <div className="flex gap-2" role="group" aria-label="Rate your recall">
                  {Object.entries(RATING_CONFIG).map(([key, config]) => (
                    <button
                      key={key}
                      onClick={() => handleRating(key as ReviewRating)}
                      className={`px-3 py-2 min-h-[44px] rounded-lg border font-mono text-xs transition-all hover:scale-105 ${config.color}`}
                    >
                      {config.label}
                    </button>
                  ))}
                </div>
              ) : (
                <button
                  onClick={handleFlip}
                  className="px-4 py-2 bg-emerald-500 text-zinc-950 font-mono text-sm rounded-lg hover:bg-emerald-400 transition-colors flex items-center gap-1"
                >
                  Show Answer <ChevronRight className="w-4 h-4" />
                </button>
              )}
              {currentIndex < reviewQueue.length - 1 && !isFlipped && (
                <button
                  onClick={() => { setCurrentIndex((i) => i + 1); setIsFlipped(false); setShowHint(false); }}
                  aria-label="Next card"
                  className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center bg-zinc-900 border border-zinc-800 rounded-lg text-zinc-400 hover:text-white transition-colors"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
