"use client";

import { useState, useMemo, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MagnifyingGlass, Clock, CheckCircle, XCircle, Bookmark, Play } from "@phosphor-icons/react";
import { QUESTION_BANK_CATEGORIES } from "@/lib/data";
import { useDashboardStore } from "@/lib/store-ctx/dashboard";
import RichText from "@/components/ui/RichText";
import { useToastSafe } from "@/lib/toast-ctx";
import { api } from "@/lib/services/api";
import { useEcosystem } from "@/lib/ecosystem-ctx";
import type { QuestionDTO } from "@/lib/types";
import ScrollPractice from "./ScrollPractice";
import ExamLibraryView from "./ExamLibraryView";
import EmptyState from "@/components/ui/EmptyState";
import Button from "@/components/ui/Button";

export default function QuestionBankTab() {
  const toast = useToastSafe();
  const { ecosystem } = useEcosystem();
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
  const [practiceMode, setPracticeMode] = useState<"none" | "scroll">("none");
  // Honest outage signal — a failed fetch shows an error with retry instead
  // of silently serving static sample questions (which masked outages and
  // broke bookmarks with unpersistable negative ids).
  const [loadFailed, setLoadFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
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

  // Deep-link: ?view=bookmarks lands on the saved view (sentinel category
  // "__saved__" from the dashboard router), not the generic bank.
  useEffect(() => {
    if (questionBankFilters.category === "__saved__") {
      setView("saved");
      setQuestionBankFilters({ category: "" });
    }
  }, [questionBankFilters.category, setQuestionBankFilters]);

  // Load categories + bookmarks from the DB (fallback to static data).
  useEffect(() => {
    let cancelled = false;
    // Reset stale category/practice state when ecosystem toggles (BCS <-> Bank)
    setPracticeMode("none");
    void (async () => {
      try {
        const [cats, bk] = await Promise.all([
          api.questionBankCategories(ecosystem).catch(() => categories),
          api.bookmarks().catch(() => []),
        ]);
        if (!cancelled) {
          if (cats && cats.length) {
            setCategories(cats);
            // If current category doesn't exist in new ecosystem, switch to first available
            const exists = cats.some((c) => c.label === activeCategory);
            if (!exists) setActiveCategory(cats[0].label);
          }
          setBookmarks(bk ?? []);
        }
      } catch {
        /* keep static fallback */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ecosystem]);

  // Load questions for the active category from the DB (PYQ only — the
  // Question Bank tab shows Previous Years Questions exclusively; the
  // subject-wise practice pool lives in Practice / Mock flows).
  useEffect(() => {
    if (view === "saved") return;
    let cancelled = false;
    void (async () => {
      await Promise.resolve();
      if (cancelled) return;
      setLoading(true);
      setLoadFailed(false);
      try {
        const qs = await api.questions({
          subject: activeCategory,
          limit: 100,
          year: year ?? undefined,
          sourceExam: sourceExam ?? undefined,
          bcsTerm: bcsTerm ?? undefined,
          pyqOnly: true,
          ecosystem,
        });
        if (!cancelled) setQuestions(qs);
      } catch {
        if (!cancelled) {
          setQuestions([]);
          setLoadFailed(true);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeCategory, year, sourceExam, bcsTerm, view, ecosystem, reloadKey]);

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
      <ScrollPractice
        questions={savedQuestions}
        title="সংরক্ষিত প্রশ্ন — স্ক্রল প্র্যাকটিস"
        onExit={() => setDrilling(false)}
      />
    );
  }

  // Scroll-based practice for the current filtered set (BCS/Bank aware via ecosystem)
  if (practiceMode === "scroll" && visibleQuestions.length > 0) {
    return (
      <div className="space-y-4">
        <button
          onClick={() => setPracticeMode("none")}
          className="text-xs font-mono text-[var(--dashboard-text-muted)] hover:text-[var(--dashboard-text-secondary)] transition-colors"
        >
          ← প্রশ্ন তালিকায় ফিরে যান
        </button>
        <ScrollPractice
          questions={visibleQuestions}
          title={`${activeCategory} — স্ক্রল প্র্যাকটিস (${ecosystem === "BANGLADESH_BANK" ? "ব্যাংক" : "BCS"})`}
          onExit={() => setPracticeMode("none")}
        />
      </div>
    );
  }

  const isExamBrowse = browseMode === "exam";
  if (isExamBrowse) {
    return <ExamLibraryView />;
  }

  return (    <div className="space-y-6">
      {/* Search */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass-card rounded-2xl border border-terminal-border"
      >
        <div className="p-4 md:p-5">
          <p className="command-eyebrow mb-3">Question Bank</p>
          <div className="flex items-center gap-2">
            <MagnifyingGlass className="w-4 h-4 shrink-0 text-[var(--dashboard-text-muted)]" aria-hidden="true" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="প্রশ্ন খুঁজুন, যেমন 'মুক্তিযুদ্ধ'…"
              aria-label="Search question bank"
              className="flex-1 bg-transparent px-2 py-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none"
            />
            <span className="pr-1 text-xs tabular-nums text-[var(--dashboard-text-muted)]" aria-live="polite">
              {visibleQuestions.length} results
            </span>
          </div>
        </div>
      </motion.div>

      {/* Browse mode: subject taxonomy vs exam library */}
      <div className="flex gap-2 flex-wrap">
        <button
          onClick={() => setBrowseMode("subject")}
          className={`px-3 py-1.5 rounded-full text-xs font-mono border transition-all ${
            mode === "subject"
              ? "bg-[var(--accent)] text-[var(--dashboard-text-inverse)] border-[var(--accent)]"
              : "bg-subtle border-[var(--accent)]/20 text-[var(--dashboard-text-muted)] hover:border-[var(--accent)]/40 hover:text-[var(--text-primary)]"
          }`}
        >
          📚 বিষয় অনুযায়ী
        </button>
        <button
          onClick={() => setBrowseMode("exam")}
          className={`px-3 py-1.5 rounded-full text-xs font-mono border transition-all ${
            mode === "exam"
              ? "bg-[var(--accent)] text-[var(--dashboard-text-inverse)] border-[var(--accent)]"
              : "bg-subtle border-[var(--accent)]/20 text-[var(--dashboard-text-muted)] hover:border-[var(--accent)]/40 hover:text-[var(--text-primary)]"
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
              ? "bg-[var(--accent)] text-[var(--dashboard-text-inverse)] border-[var(--accent)]"
              : "bg-subtle border-[var(--accent)]/20 text-[var(--dashboard-text-muted)] hover:border-[var(--accent)]/40 hover:text-[var(--text-primary)]"
          }`}
        >
          সব প্রশ্ন
        </button>
        <button
          onClick={() => setView("saved")}
          className={`px-3 py-1.5 rounded-full text-xs font-mono border transition-all flex items-center gap-1.5 ${
            view === "saved"
              ? "bg-[var(--accent)] text-[var(--dashboard-text-inverse)] border-[var(--accent)]"
              : "bg-subtle border-[var(--accent)]/20 text-[var(--dashboard-text-muted)] hover:border-[var(--accent)]/40 hover:text-[var(--text-primary)]"
          }`}
        >
          <Bookmark className="w-3.5 h-3.5" /> সংরক্ষিত ({bookmarks.length})
        </button>
        {view === "saved" && savedQuestions.length > 0 && (
          <button
            onClick={() => setDrilling(true)}
            className="px-3 py-1.5 rounded-full text-xs font-mono border border-[var(--accent)]/30 bg-[var(--dashboard-primary-subtle)] text-[var(--dashboard-primary)] hover:bg-[var(--dashboard-primary-subtle)] transition-all flex items-center gap-1.5"
          >
            <Play className="w-3.5 h-3.5" /> প্র্যাকটিস
          </button>
        )}
        {view === "all" && visibleQuestions.length > 0 && (
          <button
            onClick={() => setPracticeMode("scroll")}
            className="px-3 py-1.5 rounded-full text-xs font-mono border border-[var(--accent)]/30 bg-[var(--accent)] text-[var(--dashboard-text-inverse)] hover:bg-[var(--accent-hover)] transition-all flex items-center gap-1.5"
          >
            <Play className="w-3.5 h-3.5" /> স্ক্রল প্র্যাকটিস — {visibleQuestions.length} প্রশ্ন
          </button>
        )}
      </div>

      {/* PYQ filters (year + source exam) — only meaningful for the "all" view */}
      {view === "all" && (
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-[10px] text-[var(--dashboard-text-muted)] font-mono uppercase tracking-wider">PYQ:</span>
          <button
            onClick={() => setYear(null)}
            className={`px-2.5 py-1 rounded-full text-[11px] font-mono border transition-all ${
              year === null
                ? "bg-[var(--dashboard-primary-subtle)] border-[var(--accent)]/40 text-[var(--dashboard-primary)]"
                : "border-[var(--border-subtle)] text-[var(--dashboard-text-muted)] hover:text-[var(--text-primary)]"
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
                  ? "bg-[var(--dashboard-primary-subtle)] border-[var(--accent)]/40 text-[var(--dashboard-primary)]"
                  : "border-[var(--border-subtle)] text-[var(--dashboard-text-muted)] hover:text-[var(--text-primary)]"
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
                  ? "bg-[var(--info)]/20 border-[var(--info)]/40 text-[var(--info)]"
                  : "border-[var(--border-subtle)] text-[var(--dashboard-text-muted)] hover:text-[var(--text-primary)]"
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
          <span className="text-[10px] text-[var(--dashboard-text-muted)] font-mono uppercase tracking-wider">BCS:</span>
          <button
            onClick={() => setBcsTerm(null)}
            className={`px-2.5 py-1 rounded-full text-[11px] font-mono border transition-all ${
              bcsTerm === null
                ? "bg-[var(--dashboard-primary-subtle)] border-[var(--accent)]/40 text-[var(--dashboard-primary)]"
                : "border-[var(--border-subtle)] text-[var(--dashboard-text-muted)] hover:text-[var(--text-primary)]"
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
                  ? "bg-[var(--dashboard-warning-subtle)] border-amber-500/40 text-[var(--dashboard-warning)]"
                  : "border-[var(--border-subtle)] text-[var(--dashboard-text-muted)] hover:text-[var(--text-primary)]"
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
                  ? "bg-[var(--accent)] text-[var(--dashboard-text-inverse)] border-[var(--accent)]"
                  : "bg-subtle border-[var(--accent)]/20 text-[var(--dashboard-text-muted)] hover:border-[var(--accent)]/40 hover:text-[var(--text-primary)]"
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
          <div className="glass-card rounded-2xl border border-terminal-border p-10 text-center" role="status">
            <span className="sr-only">লোড হচ্ছে…</span>
            <p className="text-sm text-[var(--dashboard-text-muted)] font-mono">প্রশ্ন লোড হচ্ছে...</p>
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
                  className="glass-card rounded-2xl border border-terminal-border p-4"
                >
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="px-1.5 py-0.5 bg-[var(--surface-overlay)] rounded text-[10px] font-mono text-[var(--dashboard-text-muted)]">#{String(i + 1).padStart(3, "0")}</span>
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-mono ${
                          item.difficulty === "EASY"
                            ? "bg-[var(--dashboard-primary-subtle)] text-[var(--dashboard-primary)] border border-[var(--accent)]/20"
                            : item.difficulty === "MEDIUM"
                            ? "bg-[var(--warning-soft)] text-[var(--warning)] border border-[var(--warning)]/20"
                            : "bg-[var(--dashboard-danger-subtle)] text-[var(--dashboard-danger)] border border-[var(--danger)]/20"
                        }`}
                      >
                        {item.difficulty}
                      </span>
                      {item.year ? (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-[var(--info)]/10 text-[var(--info)] border border-[var(--info)]/20">
                          {item.year}
                        </span>
                      ) : null}
                      {item.sourceExam ? (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-[var(--primary-soft)] text-[var(--primary)] border border-[var(--primary)]/20">
                          {item.sourceExam}
                        </span>
                      ) : null}
                    </div>
                    <button
                      onClick={() => {
                        void toggleSave(item.id);
                      }}
                      className="text-[var(--dashboard-text-muted)] hover:text-[var(--dashboard-primary)] transition-colors"
                      aria-label={isSaved ? "Remove from saved" : "Save question"}
                    >
                      {isSaved ? <Bookmark className="w-4 h-4 text-[var(--dashboard-primary)]" /> : <Bookmark className="w-4 h-4" />}
                    </button>
                  </div>
                  <p className="text-sm text-[var(--text-primary)] mb-3">
                    <RichText text={item.question} query={query} />
                  </p>
                  {(view === "saved" || item.options.length === 0) && (
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 text-xs text-[var(--dashboard-primary)] font-mono">
                        <CheckCircle className="w-3.5 h-3.5" />
                        <span><RichText text={item.correctAnswer} /></span>
                      </div>
                      <div className="flex items-center gap-1 text-xs text-[var(--dashboard-text-muted)] font-mono">
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
          loadFailed ? (
            <div className="glass-card rounded-2xl border border-terminal-border">
              <EmptyState
                icon={XCircle}
                title="প্রশ্ন লোড করা যায়নি"
                hint="সার্ভারে সমস্যা হয়েছে। আবার চেষ্টা করুন।"
                action={
                  <Button variant="primary" size="sm" onClick={() => setReloadKey((k) => k + 1)}>
                    আবার চেষ্টা করুন
                  </Button>
                }
              />
            </div>
          ) : (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-center py-12 text-[var(--dashboard-text-muted)]"
            >
              <XCircle className="w-12 h-12 mx-auto mb-3 text-[var(--dashboard-text-secondary)]" />
              <p>0 results{query ? ` for "${query}"` : ""}{view === "saved" ? " in সংরক্ষিত" : ` in ${activeCategory}`}</p>
            </motion.div>
          )
        )}
      </div>
    </div>
  );
}
