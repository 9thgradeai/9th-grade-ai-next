"use client";

import { useState, useSyncExternalStore, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CaretLeft, CaretRight, ArrowCounterClockwise, Lightbulb, ChartBar } from "@phosphor-icons/react";
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

const RATING_CONFIG: Record<ReviewRating, { label: string; color: string }> = {
  again: { label: "Again", color: "text-[var(--dashboard-danger)] bg-[var(--dashboard-danger-subtle)] border-[var(--danger)]/30" },
  hard: { label: "Hard", color: "text-[var(--dashboard-warning)] bg-[var(--dashboard-warning-subtle)] border-[var(--warning)]/30" },
  good: { label: "Good", color: "text-[var(--dashboard-primary)] bg-[var(--dashboard-primary-subtle)] border-[var(--primary)]/30" },
  easy: { label: "Easy", color: "text-[var(--info)] bg-[var(--info)]/10 border-sky-500/30" },
};

type SessionKind = { kind: "deck"; name: string } | { kind: "mixed" };

const MIXED_LABEL = "সব ডিউ কার্ড";

function sessionTitle(session: SessionKind): string {
  return session.kind === "mixed" ? MIXED_LABEL : session.name;
}

export default function FlashcardsTab() {
  const toast = useToastSafe();
  const syncFailureNotified = useRef(false);
  const retriedAgains = useRef<Set<string>>(new Set());
  const [session, setSession] = useState<SessionKind | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const [sessionStats, setSessionStats] = useState({ reviewed: 0, correct: 0 });
  const [sessionTotal, setSessionTotal] = useState(0);
  const [sessionDone, setSessionDone] = useState(false);
  const [reviewQueue, setReviewQueue] = useState<Flashcard[]>([]);
  // Decks come exclusively from the database — there is no static fallback.
  // Studying unauthenticated placeholder cards used to silently drop every
  // review (their string ids never reach the server), so an empty/error
  // state is shown instead of fake studyable decks.
  const [decks, setDecks] = useState<Record<string, Flashcard[]>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const now = useNow();

  // Load flashcard decks from the database.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const flashcards = await api.flashcards();
        if (cancelled) return;
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
        setIsLoading(false);
      } catch {
        if (cancelled) return;
        setLoadError("ফ্ল্যাশকার্ড লোড করা যায়নি — আবার চেষ্টা করুন");
        setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reloadKey]);

  const currentCard = reviewQueue[currentIndex];

  const buildQueue = (s: SessionKind): Flashcard[] => {
    const cards = s.kind === "mixed" ? Object.values(decks).flat() : decks[s.name] || [];
    const due = cards.filter((c) => c.nextReview <= now);
    return due.length > 0 ? due : cards;
  };

  const beginSession = (s: SessionKind) => {
    const queue = buildQueue(s);
    retriedAgains.current = new Set();
    syncFailureNotified.current = false;
    setSession(s);
    setReviewQueue(queue);
    setSessionTotal(queue.length);
    setSessionDone(false);
    setCurrentIndex(0);
    setIsFlipped(false);
    setShowHint(false);
    setSessionStats({ reviewed: 0, correct: 0 });
  };

  const startSession = (deckName: string) => beginSession({ kind: "deck", name: deckName });

  // Mixed-deck review: pull every due card across all decks into one queue so
  // users aren't forced to sit through a single subject's backlog.
  const startMixedSession = () => beginSession({ kind: "mixed" });

  const handleFlip = () => {
    if (!isFlipped) {
      setIsFlipped(true);
      setShowHint(false);
    }
  };

  const handleRating = (rating: ReviewRating) => {
    if (!currentCard || sessionDone) return;

    setSessionStats((prev) => ({
      reviewed: prev.reviewed + 1,
      correct: prev.correct + (rating !== "again" ? 1 : 0),
    }));

    // "Again" cards come back at the end of the queue once, so a lapse gets
    // re-tested within the same session instead of looping forever.
    const requeueAgain = rating === "again" && !retriedAgains.current.has(currentCard.id);
    if (requeueAgain) {
      retriedAgains.current.add(currentCard.id);
      setSessionTotal((t) => t + 1);
    }
    const ratedId = currentCard.id;
    const next = reviewQueue.filter((card) => card.id !== ratedId);
    if (requeueAgain) next.push(currentCard);
    setReviewQueue(next);
    if (next.length === 0) {
      setSessionDone(true);
    } else if (currentIndex >= next.length) {
      setCurrentIndex(0);
    }
    setIsFlipped(false);
    setShowHint(false);

    // Persist the review server-side (SM-2 is authoritative there). Reconcile
    // both the queue and the deck list so due counts stay correct; notify on
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
          const patch = (card: Flashcard): Flashcard =>
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
              : card;
          setReviewQueue((prev) => prev.map(patch));
          setDecks((prev) => {
            const out: Record<string, Flashcard[]> = {};
            for (const [name, cards] of Object.entries(prev)) out[name] = cards.map(patch);
            return out;
          });
        })
        .catch(() => {
          if (!syncFailureNotified.current) {
            syncFailureNotified.current = true;
            toast.error("রিভিউ সংরক্ষণ করা যায়নি — অগ্রগতি সীমিত হতে পারে");
          }
        });
    } else if (!syncFailureNotified.current) {
      syncFailureNotified.current = true;
      toast.error("রিভিউ সংরক্ষণ করা যায়নি — অগ্রগতি সীমিত হতে পারে");
    }
  };

  const resetSession = () => {
    if (session) {
      beginSession(session);
    }
  };

  const exitDeck = () => {
    setSession(null);
    setCurrentIndex(0);
    setIsFlipped(false);
    setShowHint(false);
    setReviewQueue([]);
    setSessionDone(false);
  };

  const progress = sessionTotal > 0 ? (sessionTotal - reviewQueue.length) / sessionTotal : 0;

  return (
    <div className="space-y-6">
      {!session ? (
        <>
          {/* Deck Selection */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass-card rounded-2xl border border-terminal-border p-5"
          >
            <div className="terminal-window-bar mb-4 border-b border-terminal-border">
              <div className="dot close" /><div className="dot minimize" /><div className="dot maximize" />
              <div className="flex-1 text-center text-xs text-[var(--dashboard-text-muted)] font-mono">{"// FLASHCARD_DECKS"}</div>
            </div>

            <div className="flex items-center gap-2 mb-4">
              <ChartBar className="w-5 h-5 text-[var(--dashboard-primary)]" />
              <h2 className="text-lg font-bold text-[var(--text-primary)]">Flashcards</h2>
              <span className="text-xs text-[var(--dashboard-text-muted)] font-mono">Spaced Repetition System</span>
            </div>

            <p className="text-sm text-[var(--dashboard-text-muted)] font-mono mb-4">
              Select a deck to start your spaced repetition session. Cards you find hard will appear more frequently.
            </p>

            {isLoading ? (
              <p className="text-sm text-[var(--dashboard-text-muted)] font-mono mb-4" aria-live="polite">
                ডেক লোড হচ্ছে…
              </p>
            ) : loadError ? (
              <div className="mb-4 rounded-lg border border-[var(--danger)]/30 bg-[var(--dashboard-danger-subtle)] p-4">
                <p className="text-sm text-[var(--dashboard-danger)] font-mono mb-3">{loadError}</p>
                <button
                  onClick={() => {
                    setIsLoading(true);
                    setLoadError(null);
                    setReloadKey((k) => k + 1);
                  }}
                  className="px-4 py-2 bg-[var(--accent)] text-[var(--dashboard-text-inverse)] font-mono text-sm rounded-lg hover:bg-[var(--accent-hover)] transition-colors"
                >
                  আবার চেষ্টা করুন
                </button>
              </div>
            ) : Object.keys(decks).length === 0 ? (
              <p className="text-sm text-[var(--dashboard-text-muted)] font-mono mb-4">
                No flashcard decks yet — new cards appear here once they are added.
              </p>
            ) : (
              <>
                <button
                  onClick={startMixedSession}
                  className="w-full mb-4 px-4 py-3 bg-[var(--dashboard-primary-subtle)] border border-[var(--primary)]/30 rounded-lg text-[var(--dashboard-primary)] font-mono text-sm hover:bg-[var(--dashboard-primary-subtle)] transition-colors flex items-center justify-center gap-2"
                >
                  <ChartBar className="w-4 h-4" />
                  সব ডিউ কার্ড একসাথে রিভিউ করুন
                </button>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {Object.keys(decks).map((deckName, i) => {
                    const deck = decks[deckName];
                    const dueCount = deck.filter((c) => c.nextReview <= now).length;
                    return (
                      <motion.button
                        key={deckName}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.05 }}
                        whileHover={{ y: -2 }}
                        onClick={() => startSession(deckName)}
                        className="glass-card rounded-2xl border border-terminal-border p-4 text-left hover:border-[var(--accent)]/40 transition-all"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <h3 className="text-sm font-medium text-[var(--text-primary)]">{deckName}</h3>
                          <span className="px-2 py-0.5 bg-[var(--dashboard-primary-subtle)] border border-[var(--accent)]/20 rounded text-[10px] font-mono text-[var(--dashboard-primary)]">
                            {dueCount} due
                          </span>
                        </div>
                        <p className="text-xs text-[var(--dashboard-text-muted)] font-mono">{deck.length} cards total</p>
                      </motion.button>
                    );
                  })}
                </div>
              </>
            )}
          </motion.div>

          {/* Stats Overview */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="grid grid-cols-2 sm:grid-cols-3 gap-3"
          >
            {[
              { label: "Total Cards", value: Object.values(decks).flat().length, color: "text-[var(--dashboard-primary)]" },
              { label: "Due Today", value: Object.values(decks).flat().filter((c) => c.nextReview <= now).length, color: "text-[var(--dashboard-warning)]" },
              { label: "Decks", value: Object.keys(decks).length, color: "text-[var(--info)]" },
            ].map((stat) => (
              <div key={stat.label} className="glass-card rounded-2xl border border-terminal-border p-4 text-center">
                <div className={`text-2xl font-bold font-mono ${stat.color}`}>{stat.value}</div>
                <div className="text-[10px] text-[var(--dashboard-text-muted)] font-mono uppercase tracking-wider">{stat.label}</div>
              </div>
            ))}
          </motion.div>
        </>
      ) : sessionDone ? (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-card rounded-2xl border border-terminal-border p-10 text-center"
        >
          <p className="text-sm text-[var(--dashboard-text-muted)] font-mono mb-1">$ session complete</p>
          <h3 className="text-xl font-bold text-[var(--text-primary)] mb-4">{sessionTitle(session)} — শেষ!</h3>
          <div className="flex items-center justify-center gap-6 text-sm font-mono text-[var(--dashboard-text-muted)] mb-6">
            <span>Reviewed: {sessionStats.reviewed}</span>
            <span>Correct: {sessionStats.correct}</span>
            <span>Accuracy: {sessionStats.reviewed > 0 ? Math.round((sessionStats.correct / sessionStats.reviewed) * 100) : 0}%</span>
          </div>
          <div className="flex items-center justify-center gap-3">
            <button
              onClick={exitDeck}
              className="px-4 py-2 bg-[var(--surface-raised)] border border-[var(--dashboard-border-muted)] text-[var(--dashboard-text-muted)] font-mono text-sm rounded-lg hover:bg-[var(--surface-overlay)] transition-colors"
            >
              Back to decks
            </button>
            <button
              onClick={resetSession}
              className="px-4 py-2 bg-[var(--accent)] text-[var(--dashboard-text-inverse)] font-mono text-sm rounded-lg hover:bg-[var(--accent-hover)] transition-colors"
            >
              Review again
            </button>
          </div>
        </motion.div>
      ) : (
        <>
          {/* Flashcard Session */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h3 className="text-sm font-medium text-[var(--text-primary)]">{sessionTitle(session)}</h3>
              <span className="text-xs text-[var(--dashboard-text-muted)] font-mono">
                {reviewQueue.length === 0 ? 0 : currentIndex + 1} / {sessionTotal}
              </span>
            </div>
            <button
              onClick={exitDeck}
              className="px-3 py-1.5 bg-[var(--surface-raised)] border border-[var(--dashboard-border-muted)] text-[var(--dashboard-text-muted)] font-mono text-xs rounded hover:bg-[var(--surface-overlay)] transition-colors"
            >
              Exit Deck
            </button>
          </div>

          {/* Progress */}
          <div className="h-1.5 bg-[var(--surface-overlay)] rounded-full overflow-hidden">
            <motion.div
              initial={false}
              animate={{ scaleX: progress }}
              style={{ transformOrigin: "left" }}
              className="h-full w-full bg-[var(--success)] rounded-full"
            />
          </div>

          {/* Stats Bar */}
          <div className="flex items-center justify-between text-xs font-mono text-[var(--dashboard-text-muted)]">
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
                  className={`w-full h-full rounded-2xl border-2 cursor-pointer transition-all flex items-center justify-center p-6 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)] ${
                    isFlipped
                      ? "bg-[var(--dashboard-primary-subtle)] border-[var(--primary)]/30"
                      : "bg-subtle border-[var(--dashboard-border-muted)] hover:border-[var(--accent)]/20"
                  }`}
                >
                  <div className="text-center max-w-lg">
                     <div className="text-[10px] text-[var(--dashboard-text-muted)] font-mono uppercase tracking-wider mb-3">
                        {currentCard.subject} • {currentCard.difficulty}
                     </div>
                    <h4 className={`text-xl font-medium mb-4 ${isFlipped ? "text-[var(--dashboard-primary)]" : "text-[var(--text-primary)]"}`}>
                      {isFlipped ? "Answer" : "Question"}
                    </h4>
                    <p className={`text-lg leading-relaxed ${isFlipped ? "text-[var(--success)] font-mono" : "text-[var(--dashboard-text-primary)]"}`}>
                      {isFlipped ? currentCard.answer : currentCard.question}
                    </p>

                    {!isFlipped && currentCard.hint && (
                      <AnimatePresence>
                        {showHint && (
                          <motion.p
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="mt-4 text-sm text-[var(--dashboard-warning)] font-mono"
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
            <div className="glass-card rounded-2xl border border-terminal-border p-10 text-center">
              <p className="text-sm text-[var(--dashboard-text-muted)] font-mono mb-1">$ deck empty</p>
              <p className="text-xs text-[var(--dashboard-text-muted)] font-mono">
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
                  className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center bg-[var(--surface-raised)] border border-[var(--dashboard-border-muted)] rounded-lg text-[var(--dashboard-warning)] hover:border-[var(--warning)]/30 transition-colors"
                >
                  <Lightbulb className="w-5 h-5" />
                </button>
              )}
              <button
                onClick={resetSession}
                aria-label="Reset session"
                className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center bg-[var(--surface-raised)] border border-[var(--dashboard-border-muted)] rounded-lg text-[var(--dashboard-text-muted)] hover:text-[var(--text-primary)] transition-colors"
              >
                <ArrowCounterClockwise className="w-5 h-5" />
              </button>
            </div>

            <div className="flex items-center gap-2">
              {currentIndex > 0 && (
                <button
                  onClick={() => { setCurrentIndex((i) => i - 1); setIsFlipped(false); setShowHint(false); }}
                  aria-label="Previous card"
                  className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center bg-[var(--surface-raised)] border border-[var(--dashboard-border-muted)] rounded-lg text-[var(--dashboard-text-muted)] hover:text-[var(--text-primary)] transition-colors"
                >
                  <CaretLeft className="w-5 h-5" />
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
                  className="px-4 py-2 bg-[var(--accent)] text-[var(--dashboard-text-inverse)] font-mono text-sm rounded-lg hover:bg-[var(--accent-hover)] transition-colors flex items-center gap-1"
                >
                  Show Answer <CaretRight className="w-4 h-4" />
                </button>
              )}
              {currentIndex < reviewQueue.length - 1 && !isFlipped && (
                <button
                  onClick={() => { setCurrentIndex((i) => i + 1); setIsFlipped(false); setShowHint(false); }}
                  aria-label="Next card"
                  className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center bg-[var(--surface-raised)] border border-[var(--dashboard-border-muted)] rounded-lg text-[var(--dashboard-text-muted)] hover:text-[var(--text-primary)] transition-colors"
                >
                  <CaretRight className="w-5 h-5" />
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
