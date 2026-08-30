"use client";

import { useState, useMemo, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Terminal, Clock, CheckCircle, XCircle, Bookmark, BookmarkCheck, BookMarked, Play } from "lucide-react";
import { QUESTION_BANK_CATEGORIES } from "@/lib/data";
import { useDashboardStore } from "@/lib/store-ctx/dashboard";
import { useToastSafe } from "@/lib/toast-ctx";
import { api } from "@/lib/services/api";
import type { QuestionDTO } from "@/lib/types";
import QuestionDrill from "./QuestionDrill";
import ExamLibraryView from "./ExamLibraryView";

// Static fallback sample questions (used if the DB/API is unavailable).
const SAMPLE_QUESTIONS: Record<string, { q: string; a: string; difficulty: string }[]> = {
  "বাংলা ভাষা ও সাহিত্য": [
    { q: "'রক্তাক্ত প্রান্তর' নাটকের রচয়িতা কে?", a: "মুনীর চৌধুরী", difficulty: "EASY" },
  ],
  "English Language and Literature": [
    { q: "Choose the correct synonym of 'Ephemeral':", a: "Transient", difficulty: "MEDIUM" },
  ],
  "বাংলাদেশ বিষয়াবলি": [
    { q: "১৯৭১ সালে মুক্তিযুদ্ধের সময় স্বাধীনতার সংকেত দেওয়ার তারিখ কত?", a: "২৬ মার্চ ১৯৭১", difficulty: "EASY" },
  ],
  "আন্তর্জাতিক বিষয়াবলী": [
    { q: "ইউরোপীয় ইউনিয়নের সদর দপ্তর কোথায়?", a: "ব্রাসেলস", difficulty: "MEDIUM" },
  ],
  "ভূগোল, পরিবেশ ও দুর্যোগ ব্যবস্থাপনা": [
    { q: "বাংলাদেশের সর্বোচ্চ শিখর কোনটি?", a: "কেকরাডিও", difficulty: "EASY" },
  ],
  "সাধারণ বিজ্ঞান": [
    { q: "DNA-এর পূর্ণরূপ কী?", a: "Deoxyribonucleic Acid", difficulty: "EASY" },
  ],
  "কম্পিউটার ও তথ্য প্রযুক্তি": [
    { q: "CPU-এর পূর্ণরূপ কী?", a: "Central Processing Unit", difficulty: "EASY" },
  ],
  "গাণিতিক যুক্তি": [
    { q: "If x² - 5x + 6 = 0, what is the sum of the roots?", a: "5", difficulty: "MEDIUM" },
  ],
  "মানসিক দক্ষতা": [
    { q: "সিরিজটি সম্পূর্ণ করুন: 2, 6, 12, 20, 30, ?", a: "42", difficulty: "MEDIUM" },
  ],
  "নৈতিকতা, মূল্যবোধ ও সু-শাসন": [
    { q: "সুশাসনের মূল উপাদান কোনটি?", a: "স্বচ্ছতা, জবাবদিহিতা, দায়িত্ব", difficulty: "MEDIUM" },
  ],
};

/** Highlights case-insensitive matches of `query` inside `text`. */
function Highlight({ text, query }: { text: string; query: string }) {
  const trimmed = query.trim();
  if (!trimmed) return <>{text}</>;
  const parts = text.split(new RegExp(`(${trimmed.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "ig"));
  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === trimmed.toLowerCase() ? (
          <mark key={i} className="bg-emerald-500/25 text-emerald-300 rounded-sm px-0.5">
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}

export default function QuestionBankTab() {
  const toast = useToastSafe();
  const questionBankFilters = useDashboardStore((s) => s.questionBankFilters);
  const setQuestionBankFilters = useDashboardStore((s) => s.setQuestionBankFilters);
  const query = questionBankFilters.query;
  const activeCategory = questionBankFilters.category || "বাংলা ভাষা ও সাহিত্য";
  const [categories, setCategories] = useState(QUESTION_BANK_CATEGORIES);
  const [questions, setQuestions] = useState<QuestionDTO[]>([]);
  const [bookmarks, setBookmarks] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"all" | "saved">("all");
  const [year, setYear] = useState<number | null>(null);
  const [sourceExam, setSourceExam] = useState<string | null>(null);
  const [bcsTerm, setBcsTerm] = useState<string | null>(null);
  const [drilling, setDrilling] = useState(false);
  const [savedQuestions, setSavedQuestions] = useState<QuestionDTO[]>([]);
  const [browseMode, setBrowseMode] = useState<"subject" | "exam">("subject");
  // Widened to `string` so comparisons in the toggle survive TS control-flow
  // narrowing after the exam-mode early return above.
  const mode: string = browseMode;

  const setQuery = (q: string) => setQuestionBankFilters({ query: q });
  const setActiveCategory = (c: string) => {
    setQuestionBankFilters({ category: c });
    setYear(null);
    setSourceExam(null);
    setBcsTerm(null);
  };

  // Load categories + bookmarks from the DB (fallback to static data).
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [cats, bk] = await Promise.all([
          api.questionBankCategories().catch(() => categories),
          api.bookmarks().catch(() => []),
        ]);
        if (!cancelled) {
          if (cats && cats.length) setCategories(cats);
          setBookmarks(bk ?? []);
        }
      } catch {
        /* keep static fallback */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Load questions for the active category from the DB (with PYQ filters).
  useEffect(() => {
    if (view === "saved") return;
    let cancelled = false;
    void (async () => {
      await Promise.resolve();
      if (cancelled) return;
      setLoading(true);
      try {
        const qs = await api.questions({
          subject: activeCategory,
          limit: 100,
          year: year ?? undefined,
          sourceExam: sourceExam ?? undefined,
          bcsTerm: bcsTerm ?? undefined,
        });
        if (!cancelled) setQuestions(qs);
      } catch {
        if (!cancelled) {
          setQuestions(
            (SAMPLE_QUESTIONS[activeCategory] ?? []).map((s, i) => ({
              id: -i - 1,
              subjectId: 0,
              subject: activeCategory,
              topic: "",
              subtopic: "",
              question: s.q,
              options: [],
              correctAnswer: s.a,
              explanation: "",
              difficulty: s.difficulty as QuestionDTO["difficulty"],
              year: null,
              sourceExam: "",
              bcsTerm: null,
            })),
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeCategory, year, sourceExam, view]);

  // Load saved (bookmarked) questions when that view is active.
  useEffect(() => {
    if (view !== "saved") return;
    let cancelled = false;
    void (async () => {
      setLoading(true);
      try {
        const qs = bookmarks.length
          ? await api.questions({ ids: bookmarks, limit: 200 })
          : [];
        if (!cancelled) setSavedQuestions(qs);
      } catch {
        if (!cancelled) setSavedQuestions([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [view, bookmarks]);

  const toggleSave = async (id: number) => {
    if (id < 0) return; // static fallback question — not persisted
    const wasSaved = bookmarks.includes(id);
    setBookmarks((prev) =>
      wasSaved ? prev.filter((x) => x !== id) : [...prev, id],
    );
    try {
      const res = await api.toggleBookmark(id);
      setBookmarks((prev) => (res.bookmarked ? [...prev, id] : prev.filter((x) => x !== id)));
    } catch {
      setBookmarks((prev) =>
        wasSaved ? prev.filter((x) => x !== id) : [...prev, id],
      );
      toast.error("বুকমার্ক সংরক্ষণ করা যায়নি");
    }
  };

  const years = useMemo(() => {
    const set = new Set<number>();
    for (const q of questions) if (q.year) set.add(q.year);
    return [...set].sort((a, b) => b - a);
  }, [questions]);

  const sourceExams = useMemo(() => {
    const set = new Set<string>();
    for (const q of questions) if (q.sourceExam) set.add(q.sourceExam);
    return [...set].sort();
  }, [questions]);

  const bcsTerms = useMemo(() => {
    const set = new Set<string>();
    for (const q of questions) if (q.bcsTerm) set.add(q.bcsTerm);
    // Sort by term number descending (50th, 49th, etc.)
    return [...set].sort((a, b) => {
      const numA = parseInt(a.replace("th", ""));
      const numB = parseInt(b.replace("th", ""));
      return numB - numA;
    });
  }, [questions]);

  const baseQuestions = view === "saved" ? savedQuestions : questions;
  const visibleQuestions = useMemo(() => {
    if (!query) return baseQuestions;
    const lower = query.toLowerCase();
    return baseQuestions.filter(
      (item) =>
        item.question.toLowerCase().includes(lower) ||
        item.correctAnswer.toLowerCase().includes(lower),
    );
  }, [baseQuestions, query]);

  if (drilling && savedQuestions.length > 0) {
    return (
      <QuestionDrill
        questions={savedQuestions}
        title="সংরক্ষিত প্রশ্ন"
        onExit={() => setDrilling(false)}
      />
    );
  }

  const isExamBrowse = browseMode === "exam";
  if (isExamBrowse) {
    return <ExamLibraryView />;
  }

  return (    <div className="space-y-6">
      {/* Live query terminal */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass-card rounded-terminal-rounded border border-terminal-border overflow-hidden"
      >
        <div className="terminal-window-bar">
          <div className="dot close" /><div className="dot minimize" /><div className="dot maximize" />
          <div className="flex-1 text-center text-xs text-zinc-400 font-mono">           {"// QUESTION_BANK_SEARCH"}</div>
        </div>
        <div className="p-1 flex items-center gap-2">
          <span className="text-emerald-500 font-mono pl-3">$</span>
          <Terminal className="w-4 h-4 text-zinc-500" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="grep -r 'মুক্তিযুদ্ধ' ./question_bank"
            aria-label="Search question bank"
            className="flex-1 bg-transparent px-2 py-3 font-mono text-sm text-white placeholder-zinc-500 focus:outline-none"
          />
          <span className="pr-3 text-xs text-zinc-500 font-mono">
            {visibleQuestions.length} hits
          </span>
        </div>
      </motion.div>

      {/* Browse mode: subject taxonomy vs exam library */}
      <div className="flex gap-2 flex-wrap">
        <button
          onClick={() => setBrowseMode("subject")}
          className={`px-3 py-1.5 rounded-full text-xs font-mono border transition-all ${
            mode === "subject"
              ? "bg-emerald-500 text-zinc-950 border-emerald-500 shadow-neon-glow"
              : "bg-subtle border-emerald-500/20 text-zinc-400 hover:border-emerald-500/40 hover:text-white"
          }`}
        >
          📚 বিষয় অনুযায়ী
        </button>
        <button
          onClick={() => setBrowseMode("exam")}
          className={`px-3 py-1.5 rounded-full text-xs font-mono border transition-all ${
            mode === "exam"
              ? "bg-emerald-500 text-zinc-950 border-emerald-500 shadow-neon-glow"
              : "bg-subtle border-emerald-500/20 text-zinc-400 hover:border-emerald-500/40 hover:text-white"
          }`}
        >
          🎯 পরীক্ষা অনুযায়ী
        </button>
      </div>

      {/* View toggle (all vs saved) */}
      <div className="flex gap-2 flex-wrap">
        <button
          onClick={() => setView("all")}
          className={`px-3 py-1.5 rounded-full text-xs font-mono border transition-all ${
            view === "all"
              ? "bg-emerald-500 text-zinc-950 border-emerald-500 shadow-neon-glow"
              : "bg-subtle border-emerald-500/20 text-zinc-400 hover:border-emerald-500/40 hover:text-white"
          }`}
        >
          সব প্রশ্ন
        </button>
        <button
          onClick={() => setView("saved")}
          className={`px-3 py-1.5 rounded-full text-xs font-mono border transition-all flex items-center gap-1.5 ${
            view === "saved"
              ? "bg-emerald-500 text-zinc-950 border-emerald-500 shadow-neon-glow"
              : "bg-subtle border-emerald-500/20 text-zinc-400 hover:border-emerald-500/40 hover:text-white"
          }`}
        >
          <BookMarked className="w-3.5 h-3.5" /> সংরক্ষিত ({bookmarks.length})
        </button>
        {view === "saved" && savedQuestions.length > 0 && (
          <button
            onClick={() => setDrilling(true)}
            className="px-3 py-1.5 rounded-full text-xs font-mono border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20 transition-all flex items-center gap-1.5"
          >
            <Play className="w-3.5 h-3.5" /> প্র্যাকটিস
          </button>
        )}
      </div>

      {/* PYQ filters (year + source exam) — only meaningful for the "all" view */}
      {view === "all" && (
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-[10px] text-zinc-500 font-mono uppercase tracking-wider">PYQ:</span>
          <button
            onClick={() => setYear(null)}
            className={`px-2.5 py-1 rounded-full text-[11px] font-mono border transition-all ${
              year === null
                ? "bg-emerald-500/20 border-emerald-500/40 text-emerald-300"
                : "border-zinc-700 text-zinc-400 hover:text-white"
            }`}
          >
            সব বছর
          </button>
          {years.map((y) => (
            <button
              key={y}
              onClick={() => setYear(y)}
              className={`px-2.5 py-1 rounded-full text-[11px] font-mono border transition-all ${
                year === y
                  ? "bg-emerald-500/20 border-emerald-500/40 text-emerald-300"
                  : "border-zinc-700 text-zinc-400 hover:text-white"
              }`}
            >
              {y}
            </button>
          ))}
          {sourceExams.map((se) => (
            <button
              key={se}
              onClick={() => setSourceExam(sourceExam === se ? null : se)}
              className={`px-2.5 py-1 rounded-full text-[11px] font-mono border transition-all ${
                sourceExam === se
                  ? "bg-sky-500/20 border-sky-500/40 text-sky-300"
                  : "border-zinc-700 text-zinc-400 hover:text-white"
              }`}
            >
              {se}
            </button>
          ))}
        </div>
      )}
      
      {/* BCS Term filters */}
      {view === "all" && (
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-[10px] text-zinc-500 font-mono uppercase tracking-wider">BCS:</span>
          <button
            onClick={() => setBcsTerm(null)}
            className={`px-2.5 py-1 rounded-full text-[11px] font-mono border transition-all ${
              bcsTerm === null
                ? "bg-emerald-500/20 border-emerald-500/40 text-emerald-300"
                : "border-zinc-700 text-zinc-400 hover:text-white"
            }`}
          >
            সব টার্ম
          </button>
          {bcsTerms.map((term) => (
            <button
              key={term}
              onClick={() => setBcsTerm(bcsTerm === term ? null : term)}
              className={`px-2.5 py-1 rounded-full text-[11px] font-mono border transition-all ${
                bcsTerm === term
                  ? "bg-amber-500/20 border-amber-500/40 text-amber-300"
                  : "border-zinc-700 text-zinc-400 hover:text-white"
              }`}
            >
              {term}
            </button>
          ))}
        </div>
      )}

      {/* Filter tags */}
      {view === "all" && (
        <div className="flex flex-wrap gap-2">
          {categories.map((cat, i) => (
            <motion.button
              key={cat.label}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: i * 0.04 }}
              onClick={() => setActiveCategory(cat.label)}
              className={`px-3 py-1.5 rounded-full text-xs font-mono border transition-all ${
                activeCategory === cat.label
                  ? "bg-emerald-500 text-zinc-950 border-emerald-500 shadow-neon-glow"
                  : "bg-subtle border-emerald-500/20 text-zinc-400 hover:border-emerald-500/40 hover:text-white"
              }`}
            >
              {cat.label} ({cat.count?.toLocaleString?.() ?? cat.count})
            </motion.button>
          ))}
        </div>
      )}

      {/* Questions list */}
      <div className="space-y-3">
        {loading ? (
          <div className="glass-card rounded-terminal-rounded border border-terminal-border p-10 text-center" role="status">
            <span className="sr-only">লোড হচ্ছে…</span>
            <p className="text-sm text-zinc-400 font-mono">প্রশ্ন লোড হচ্ছে...</p>
          </div>
        ) : (
          <AnimatePresence mode="popLayout">
            {visibleQuestions.map((item, i) => {
              const isSaved = bookmarks.includes(item.id);
              return (
                <motion.div
                  key={`${view}-${item.id}-${i}`}
                  layout
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ delay: Math.min(i * 0.05, 0.3) }}
                  className="glass-card rounded-terminal-rounded border border-terminal-border p-4"
                >
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="px-1.5 py-0.5 bg-zinc-800 rounded text-[10px] font-mono text-zinc-400">#{String(i + 1).padStart(3, "0")}</span>
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-mono ${
                          item.difficulty === "EASY"
                            ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                            : item.difficulty === "MEDIUM"
                            ? "bg-yellow-500/10 text-yellow-400 border border-yellow-500/20"
                            : "bg-red-500/10 text-red-400 border border-red-500/20"
                        }`}
                      >
                        {item.difficulty}
                      </span>
                      {item.year ? (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-sky-500/10 text-sky-300 border border-sky-500/20">
                          {item.year}
                        </span>
                      ) : null}
                      {item.sourceExam ? (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-purple-500/10 text-purple-300 border border-purple-500/20">
                          {item.sourceExam}
                        </span>
                      ) : null}
                    </div>
                    <button
                      onClick={() => {
                        void toggleSave(item.id);
                      }}
                      className="text-zinc-500 hover:text-emerald-400 transition-colors"
                      aria-label={isSaved ? "Remove from saved" : "Save question"}
                    >
                      {isSaved ? <BookmarkCheck className="w-4 h-4 text-emerald-400" /> : <Bookmark className="w-4 h-4" />}
                    </button>
                  </div>
                  <p className="text-sm text-white mb-3">
                    <Highlight text={item.question} query={query} />
                  </p>
                  {(view === "saved" || item.options.length === 0) && (
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 text-xs text-emerald-400 font-mono">
                        <CheckCircle className="w-3.5 h-3.5" />
                        <span>{item.correctAnswer}</span>
                      </div>
                      <div className="flex items-center gap-1 text-xs text-zinc-500 font-mono">
                        <Clock className="w-3 h-3" /> 45s
                      </div>
                    </div>
                  )}
                </motion.div>
              );
            })}
          </AnimatePresence>
        )}

        {!loading && visibleQuestions.length === 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center py-12 text-zinc-500 font-mono"
          >
            <XCircle className="w-12 h-12 mx-auto mb-3 text-zinc-600" />
            <p>$ 0 results{query ? ` for "${query}"` : ""}{view === "saved" ? " in সংরক্ষিত" : ` in ${activeCategory}`}</p>
          </motion.div>
        )}
      </div>
    </div>
  );
}
