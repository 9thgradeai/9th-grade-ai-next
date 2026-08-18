"use client";

import { useState, useMemo, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Terminal, Clock, CheckCircle, XCircle, Bookmark, BookmarkCheck } from "lucide-react";
import { QUESTION_BANK_CATEGORIES } from "@/lib/data";
import { api } from "@/lib/services/api";

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

type QItem = { id: number; q: string; a: string; difficulty: string };

export default function QuestionBankTab() {
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<string>("বাংলা ভাষা ও সাহিত্য");
  const [categories, setCategories] = useState(QUESTION_BANK_CATEGORIES);
  const [questions, setQuestions] = useState<QItem[]>([]);
  const [bookmarks, setBookmarks] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);

  // Load categories + bookmarks from the DB (fallback to static data).
  useEffect(() => {
    let cancelled = false;
    (async () => {
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
  }, []);

  // Load questions for the active category from the DB.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const qs = await api.questions({ subject: activeCategory, limit: 100 });
        if (!cancelled) {
          setQuestions(
            qs.map((q) => ({ id: q.id, q: q.question, a: q.correctAnswer, difficulty: q.difficulty })),
          );
        }
      } catch {
        if (!cancelled) {
          // Fall back to static samples when the backend is unavailable.
          setQuestions(
            (SAMPLE_QUESTIONS[activeCategory] ?? []).map((s, i) => ({
              id: -i - 1,
              q: s.q,
              a: s.a,
              difficulty: s.difficulty,
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
  }, [activeCategory]);

  const toggleSave = async (id: number) => {
    if (id < 0) return; // static fallback question — not persisted
    try {
      const res = await api.toggleBookmark(id);
      setBookmarks((prev) => (res.bookmarked ? [...prev, id] : prev.filter((x) => x !== id)));
    } catch {
      /* ignore */
    }
  };

  const visibleQuestions = useMemo(() => {
    if (!query) return questions;
    const lower = query.toLowerCase();
    return questions.filter(
      (item) => item.q.toLowerCase().includes(lower) || item.a.toLowerCase().includes(lower),
    );
  }, [questions, query]);

  return (
    <div className="space-y-6">
      {/* Live query terminal */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass rounded-terminal-rounded border border-terminal-border overflow-hidden"
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

      {/* Filter tags */}
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
                : "bg-zinc-900/50 border-emerald-500/20 text-zinc-400 hover:border-emerald-500/40 hover:text-white"
            }`}
          >
            {cat.label} ({cat.count?.toLocaleString?.() ?? cat.count})
          </motion.button>
        ))}
      </div>

      {/* Questions list */}
      <div className="space-y-3">
        <AnimatePresence mode="popLayout">
          {visibleQuestions.map((item, i) => {
            const isSaved = bookmarks.includes(item.id);
            return (
             <motion.div
                 key={`${activeCategory}-${i}`}
                 layout
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ delay: i * 0.05 }}
                className="glass rounded-terminal-rounded border border-terminal-border p-4"
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
                  </div>
                  <button
                    onClick={() => toggleSave(item.id)}
                    className="text-zinc-500 hover:text-emerald-400 transition-colors"
                    aria-label={isSaved ? "Remove from saved" : "Save question"}
                  >
                    {isSaved ? <BookmarkCheck className="w-4 h-4 text-emerald-400" /> : <Bookmark className="w-4 h-4" />}
                  </button>
                </div>
                <p className="text-sm text-white mb-3">{item.q}</p>
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-xs text-emerald-400 font-mono">
                    <CheckCircle className="w-3.5 h-3.5" />
                    <span>{item.a}</span>
                  </div>
                  <div className="flex items-center gap-1 text-xs text-zinc-500 font-mono">
                    <Clock className="w-3 h-3" /> 45s
                  </div>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>

        {visibleQuestions.length === 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center py-12 text-zinc-500 font-mono"
          >
            <XCircle className="w-12 h-12 mx-auto mb-3 text-zinc-600" />
             <p>$ 0 results for &quot;{query}&quot; in {activeCategory}</p>
          </motion.div>
        )}
      </div>
    </div>
  );
}