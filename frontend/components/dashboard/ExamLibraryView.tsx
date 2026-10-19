"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CaretRight, GridFour, BookOpen, Clock, ListChecks, Play, Calendar, Shuffle,  } from "@phosphor-icons/react";
import { api } from "@/lib/services/api";
import { useEcosystem } from "@/lib/ecosystem-ctx";
import type { ExamCategoryDTO, ExamDTO, ExamPaperDTO, QuestionDTO } from "@/lib/types";
import RichText from "@/components/ui/RichText";
import ScrollPractice from "./ScrollPractice";

type PaperSelection = {
  paper: ExamPaperDTO;
  exam: ExamDTO;
  category: ExamCategoryDTO;
};

/* Progressive rendering: a paper can hold up to 200 questions; paint the
 * first slice immediately and page the rest behind "আরও দেখুন". */
const INITIAL_QUESTION_SLICE = 40;

/**
 * Exam-library browser (BCS → BCS Preliminary → 50th BCS → questions).
 *
 * Purely informational, data-driven navigation over the exam taxonomy that the
 * import pipeline bootstraped. Nothing here is fabricated: only real categories,
 * exams, and papers (with real question counts) are shown. Selecting a paper
 * loads its validated questions via paperId and offers an inline practice run.
 */
export default function ExamLibraryView() {
  const { ecosystem } = useEcosystem();
  const [categories, setCategories] = useState<ExamCategoryDTO[]>([]);
  const [loadingTree, setLoadingTree] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<ExamCategoryDTO | null>(null);
  const [selectedExam, setSelectedExam] = useState<ExamDTO | null>(null);
  const [selection, setSelection] = useState<PaperSelection | null>(null);

  // Paper question state.
  const [questions, setQuestions] = useState<QuestionDTO[]>([]);
  const [visibleCount, setVisibleCount] = useState(INITIAL_QUESTION_SLICE);
  const [loadingQuestions, setLoadingQuestions] = useState(false);
  const [drilling, setDrilling] = useState(false);
  // Discovery controls, client-side search/filter/sort over real taxonomy.
  const [paperQuery, setPaperQuery] = useState("");
  const [paperSort, setPaperSort] = useState<"recent" | "questions" | "title">("recent");

  useEffect(() => {
    let cancelled = false;
    api
      .examLibrary(ecosystem)
      .then((cats) => {
        if (cancelled) return;
        setCategories(cats);
        if (cats.length > 0) setSelectedCategory(cats[0]);
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : "Exam library data could not be loaded.");
      })
      .finally(() => {
        if (!cancelled) setLoadingTree(false);
      });
    return () => {
      cancelled = true;
    };
  }, [ecosystem]);

  const activeCategory = selectedCategory;
  const activeExam = selectedExam;

  // When a different exam is chosen, clear its first paper selection.
  const chooseExam = (exam: ExamDTO) => {
    setSelectedExam(exam);
    setSelection(null);
    setQuestions([]);
  };

  const choosePaper = async (paper: ExamPaperDTO, exam: ExamDTO, category: ExamCategoryDTO) => {
    setSelection({ paper, exam, category });
    setDrilling(false);
    setVisibleCount(INITIAL_QUESTION_SLICE);
    setLoadingQuestions(true);
    try {
      const qs = await api.questions({ paperId: paper.id, limit: 200, ecosystem });
      setQuestions(qs);
    } catch {
      setQuestions([]);
    } finally {
      setLoadingQuestions(false);
    }
  };

  const reset = () => {
    setSelectedCategory(null);
    setSelectedExam(null);
    setSelection(null);
    setQuestions([]);
    setDrilling(false);
  };

  // ── Breadcrumb --------------------------------
  const renderBreadcrumb = () => {
    const crumbs: { label: string; onClick: () => void }[] = [];
    if (selectedCategory) crumbs.push({ label: selectedCategory.nameBn, onClick: () => {} });
    if (selectedExam) crumbs.push({ label: selectedExam.nameBn, onClick: () => setSelection(null) });
    if (selection) crumbs.push({ label: selection.paper.titleBn, onClick: () => {} });
    return (
      <div className="flex items-center gap-1 flex-wrap text-xs font-mono text-[var(--dashboard-text-muted)]">
        <button onClick={reset} className="min-h-11 px-2 hover:text-[var(--text-primary)] transition-colors">
          পরীক্ষার লাইব্রেরি
        </button>
        {crumbs.map((c, i) => (
          <span key={i} className="flex items-center gap-1">
            <CaretRight className="w-3 h-3 text-[var(--dashboard-text-secondary)]" aria-hidden="true" />
            <button
              onClick={c.onClick}
              className={`min-h-11 px-2 ${i === crumbs.length - 1 ? "text-[var(--dashboard-primary)]" : "text-[var(--dashboard-text-muted)]"} hover:text-[var(--text-primary)] transition-colors`}
            >
              {c.label}
            </button>
          </span>
        ))}
      </div>
    );
  };

  // ── Empty (no taxonomy yet) --------------------
  if (!loadingTree && categories.length === 0) {
    return (
      <div className="glass-card rounded-2xl border border-terminal-border p-10 text-center">
        <p className="text-sm text-[var(--dashboard-text-muted)] font-mono">কোনো পরীক্ষার লাইব্রেরি নেই, BCS ডেটা এখনো ইমপোর্ট করা হয়নি।</p>
      </div>
    );
  }

  // ── Paper selected: question browser ------------
  if (selection) {
    const { paper, exam, category } = selection;
    if (drilling) {
      return (
        <div className="space-y-4">
          <button
            onClick={() => setDrilling(false)}
            className="text-xs font-mono min-h-11 flex items-center text-[var(--dashboard-text-muted)] hover:text-[var(--dashboard-text-secondary)] transition-colors"
          >
            ← পেপারে ফিরে যান
          </button>
          <ScrollPractice
            key={`paper-${paper.id}`}
            questions={questions}
            title={`${paper.titleBn}, স্ক্রল প্র্যাকটিস (${questions.length} প্রশ্ন)`}
            onExit={() => setDrilling(false)}
          />
        </div>
      );
    }
    return (
      <div className="space-y-4">
        {renderBreadcrumb()}

        <div className="glass-card rounded-2xl border border-terminal-border p-5">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-2xl">{category.icon}</span>
                <h3 className="text-lg font-bold text-[var(--text-primary)] font-mono">{paper.titleBn}</h3>
              </div>
              <div className="flex items-center gap-2 text-[11px] text-[var(--dashboard-text-muted)] font-mono">
                <span className="px-1.5 py-0.5 rounded bg-[var(--surface-overlay)] text-[var(--dashboard-text-secondary)]">{category.nameBn} · {exam.nameBn}</span>
                {paper.bcsTerm ? (
                  <span className="px-1.5 py-0.5 rounded bg-[var(--info)]/10 text-[var(--info)] border border-[var(--info)]/20">
                    {paper.termLabel} BCS
                  </span>
                ) : null}
                {paper.year ? (
                  <span className="px-1.5 py-0.5 rounded bg-[var(--primary-soft)] text-[var(--primary)] border border-[var(--primary)]/20 flex items-center gap-1">
                    <Calendar className="w-3 h-3" /> {paper.year}
                  </span>
                ) : null}
              </div>
            </div>
            <button
              onClick={() => (questions.length ? setDrilling(true) : null)}
              disabled={questions.length === 0}
              className="min-h-11 px-4 rounded-full text-xs font-mono border border-[var(--primary)]/30 bg-[var(--dashboard-primary-subtle)] text-[var(--dashboard-primary)] hover:bg-[var(--dashboard-primary-subtle)] disabled:opacity-40 flex items-center gap-1.5 transition-all"
            >
              <Play className="w-3.5 h-3.5" aria-hidden="true" /> প্র্যাকটিস ({questions.length})
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4 text-center">
            <div className="rounded-lg bg-[var(--surface-muted)] border border-terminal-border p-3">
              <div className="flex items-center justify-center gap-1.5 text-[var(--dashboard-primary)] font-mono text-lg font-bold">
                <ListChecks className="w-4 h-4" /> {paper.availableQuestions}
              </div>
              <div className="text-[11px] text-[var(--dashboard-text-muted)] font-mono mt-1">লোডকৃত প্রশ্ন</div>
            </div>
            <div className="rounded-lg bg-[var(--surface-muted)] border border-terminal-border p-3">
              <div className="flex items-center justify-center gap-1.5 text-[var(--info)] font-mono text-lg font-bold">
                <Clock className="w-4 h-4" /> {paper.durationMin ?? "—"}
              </div>
              <div className="text-[11px] text-[var(--dashboard-text-muted)] font-mono mt-1">সময় (মিনিট)</div>
            </div>
            <div className="rounded-lg bg-[var(--surface-muted)] border border-terminal-border p-3">
              <div className="flex items-center justify-center gap-1.5 text-[var(--dashboard-warning)] font-mono text-lg font-bold">
                <Shuffle className="w-4 h-4" /> {paper.totalQuestions ?? "—"}
              </div>
              <div className="text-[11px] text-[var(--dashboard-text-muted)] font-mono mt-1">মোট প্রশ্ন</div>
            </div>
          </div>
        </div>

        <div className="text-[11px] text-[var(--dashboard-text-muted)] font-mono flex items-center justify-between">
          <span>নিচের প্রশ্নগুলো এই পেপার থেকে</span>
          <span className="flex items-center gap-1">
            <span className={`px-1.5 py-0.5 rounded text-[11px] ${paper.verified ? "text-[var(--dashboard-primary)] bg-[var(--dashboard-primary-subtle)]" : "text-[var(--dashboard-text-muted)] bg-[var(--surface-overlay)]"}`}>
              {paper.provenance}
            </span>
          </span>
        </div>

        {loadingQuestions ? (
          <div className="glass-card rounded-2xl border border-terminal-border p-8 text-center" role="status">
            <span className="sr-only">লোড হচ্ছে…</span>
            <p className="text-sm text-[var(--dashboard-text-muted)] font-mono">প্রশ্ন লোড হচ্ছে...</p>
          </div>
        ) : questions.length === 0 ? (
          <div className="glass-card rounded-2xl border border-terminal-border p-8 text-center">
            <p className="text-sm text-[var(--dashboard-text-muted)] font-mono">কোনো বৈধ প্রশ্ন নেই</p>
          </div>
        ) : (
          <div className="space-y-3">
            <AnimatePresence mode="popLayout">
              {questions.slice(0, visibleCount).map((item, i) => (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(i * 0.04, 0.3) }}
                  className="glass-card rounded-2xl border border-terminal-border p-4"
                >
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="px-1.5 py-0.5 bg-[var(--surface-overlay)] rounded text-[11px] font-mono text-[var(--dashboard-text-muted)]">
                        #{item.questionNumber ?? String(i + 1).padStart(3, "0")}
                      </span>
                      <span className="px-1.5 py-0.5 rounded text-[11px] font-mono text-[var(--dashboard-primary)] bg-[var(--dashboard-primary-subtle)] border border-[var(--accent)]/20">
                        {item.subtopic || item.topic || "পরীক্ষা"}
                      </span>
                    </div>
                  </div>
                  <p className="text-sm text-[var(--text-primary)]"><RichText text={item.question} /></p>
                  <div className="grid sm:grid-cols-2 gap-1.5 mt-3">
                    {item.options.map((opt, oi) => (
                      <div
                        key={oi}
                        className="flex items-start gap-2 text-xs text-[var(--dashboard-text-secondary)] bg-[var(--surface-muted)] border border-terminal-border rounded px-2.5 py-1.5"
                      >
                        <span className="font-mono text-[var(--dashboard-text-muted)]">{["ক", "খ", "গ", "ঘ"][oi] ?? oi + 1}.</span>
                        <RichText text={opt} />
                      </div>
                    ))}
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
            {questions.length > visibleCount && (
              <div className="flex justify-center pt-1">
                <button
                  type="button"
                  onClick={() => setVisibleCount((c) => c + INITIAL_QUESTION_SLICE)}
                  className="min-h-11 px-5 rounded-full text-xs font-mono border border-terminal-border text-[var(--dashboard-text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--accent)]/40 transition-colors"
                >
                  আরও দেখুন ({questions.length - visibleCount})
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  // ── Hierarchy browse (categories → exams → papers) -----
  const papersToShow = activeExam?.papers ?? [];
  const q = paperQuery.trim().toLowerCase();
  const filteredPapers = (q
    ? papersToShow.filter((p) =>
        [p.titleBn, p.titleEn ?? "", String(p.year ?? ""), p.termLabel ?? ""]
          .join(" ")
          .toLowerCase()
          .includes(q),
      )
    : [...papersToShow]
  ).sort((a, b) => {
    if (paperSort === "questions") return (b.availableQuestions ?? 0) - (a.availableQuestions ?? 0);
    if (paperSort === "title") return a.titleBn.localeCompare(b.titleBn, "bn");
    return (b.year ?? 0) - (a.year ?? 0) || (b.availableQuestions ?? 0) - (a.availableQuestions ?? 0);
  });
  return (
    <div className="space-y-5">
      {renderBreadcrumb()}

      {loadingTree ? (
        <div className="glass-card rounded-2xl border border-terminal-border p-10 text-center" role="status">
          <span className="sr-only">লোড হচ্ছে…</span>
          <p className="text-sm text-[var(--dashboard-text-muted)] font-mono">পরীক্ষার লাইব্রেরি লোড হচ্ছে...</p>
        </div>
      ) : (
        <>
          {/* Category panel */}
          <div>
            <p className="text-[11px] text-[var(--dashboard-text-muted)] font-mono uppercase tracking-wider mb-2">পরীক্ষার বিভাগ</p>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {categories.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => {
                    setSelectedCategory(cat);
                    setSelectedExam(null);
                  }}
                  className={`glass-card rounded-2xl border p-4 text-left transition-all ${
                    activeCategory?.id === cat.id
                      ? "border-[var(--primary)]/50 bg-[var(--dashboard-primary-subtle)]"
                      : "border-terminal-border hover:border-[var(--primary)]/30"
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-2xl">{cat.icon}</span>
                    <h3 className="font-bold text-[var(--text-primary)] font-mono">{cat.nameBn}</h3>
                  </div>
                  <p className="text-[11px] text-[var(--dashboard-text-muted)] font-mono">{cat.nameEn}</p>
                  <p className="text-[11px] text-[var(--dashboard-primary)] font-mono mt-2">{cat.exams.length}টি পরীক্ষা</p>
                </button>
              ))}
            </div>
          </div>

          {/* Exam panel */}
          {activeCategory && (
            <div>
              <p className="text-[11px] text-[var(--dashboard-text-muted)] font-mono uppercase tracking-wider mb-2">ঝটপট, {activeCategory.nameBn}</p>
              <div className="flex flex-wrap gap-2">
                {activeCategory.exams.map((exam) => (
                  <button
                    key={exam.id}
                    onClick={() => chooseExam(exam)}
                    className={`min-h-11 px-4 rounded-full text-xs font-mono border transition-all ${
                      activeExam?.id === exam.id
                        ? "bg-[var(--dashboard-primary-subtle)] border-[var(--primary)]/40 text-[var(--dashboard-primary)]"
                        : "bg-subtle border-[var(--accent)]/20 text-[var(--dashboard-text-muted)] hover:border-[var(--accent)]/40 hover:text-[var(--text-primary)]"
                    }`}
                  >
                    {exam.nameBn} ({exam.papers.length})
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Papers panel */}
          {activeExam && (
            <div>
              <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                <p className="text-[11px] text-[var(--dashboard-text-muted)] font-mono uppercase tracking-wider">
                  {activeExam.nameBn}, সিলেক্ট করুন
                </p>
                <div className="flex items-center gap-2 flex-wrap">
                  <label htmlFor="paper-search" className="sr-only">পেপার খুঁজুন</label>
                  <input
                    id="paper-search"
                    type="search"
                    value={paperQuery}
                    onChange={(e) => setPaperQuery(e.target.value)}
                    placeholder="পেপার খুঁজুন…"
                    className="h-11 min-h-[44px] px-3 rounded-xl border text-xs font-mono bg-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--dashboard-focus-ring)]"
                    style={{ borderColor: "var(--dashboard-border-muted)", color: "var(--dashboard-text-primary)" }}
                  />
                  <label htmlFor="paper-sort" className="sr-only">সাজান</label>
                  <select
                    id="paper-sort"
                    value={paperSort}
                    onChange={(e) => setPaperSort(e.target.value as typeof paperSort)}
                    className="h-11 min-h-[44px] px-2 rounded-xl border text-xs font-mono bg-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--dashboard-focus-ring)]"
                    style={{ borderColor: "var(--dashboard-border-muted)", color: "var(--dashboard-text-primary)" }}
                  >
                    <option value="recent">সাম্প্রতিক</option>
                    <option value="questions">বেশি প্রশ্ন</option>
                    <option value="title">নাম (অ-হ)</option>
                  </select>
                </div>
              </div>
              {papersToShow.length === 0 ? (
                <div className="glass-card rounded-2xl border border-terminal-border p-6 text-center">
                  <p className="text-sm text-[var(--dashboard-text-muted)] font-mono">এই পরীক্ষার জন্য এখনো কোনো পেপার ইমপোর্ট হয়নি।</p>
                </div>
              ) : filteredPapers.length === 0 ? (
                <div className="glass-card rounded-2xl border border-terminal-border p-6 text-center">
                  <p className="text-sm text-[var(--dashboard-text-muted)] font-mono">“{paperQuery.trim()}” এর সাথে মিলে এমন কোনো পেপার নেই।</p>
                  <button
                    type="button"
                    onClick={() => setPaperQuery("")}
                    className="mt-3 px-4 py-2 min-h-[44px] rounded-xl border text-xs font-mono focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--dashboard-focus-ring)]"
                    style={{ borderColor: "var(--dashboard-border-muted)", color: "var(--dashboard-text-secondary)" }}
                  >
                    ফিল্টার মুছুন
                  </button>
                </div>
              ) : (
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {filteredPapers.map((paper, i) => (
                    <motion.button
                      key={paper.id}
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: Math.min(i * 0.04, 0.4) }}
                      onClick={() => void choosePaper(paper, activeExam, activeCategory!)}
                      className="glass-card rounded-2xl border border-terminal-border p-4 text-left hover:border-[var(--accent)]/40 transition-all group"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <BookOpen className="w-4 h-4 text-[var(--dashboard-primary)]" />
                          <span className="font-semibold text-[var(--text-primary)] font-mono text-sm">{paper.titleBn}</span>
                        </div>
                        <CaretRight className="w-4 h-4 text-[var(--dashboard-text-secondary)] group-hover:text-[var(--dashboard-primary)] transition-colors" />
                      </div>
                      <div className="flex items-center gap-3 text-[11px] text-[var(--dashboard-text-muted)] font-mono">
                        <span className="flex items-center gap-1">
                          <ListChecks className="w-3 h-3" /> {paper.availableQuestions} প্রশ্ন
                        </span>
                        {paper.bcsTerm ? (
                          <span className="px-1.5 py-0.5 rounded bg-[var(--info)]/10 text-[var(--info)] border border-[var(--info)]/20">
                            {paper.termLabel} BCS
                          </span>
                        ) : null}
                      </div>
                    </motion.button>
                  ))}
                </div>
              )}
            </div>
          )}

          {!activeExam && (
            <div className="flex items-center gap-2 text-[11px] text-[var(--dashboard-text-muted)] font-mono">
              <GridFour className="w-4 h-4" />
              একটি পরীক্ষা বেছে নিয়ে সুনির্দিষ্ট পেপারের প্রশ্ন দেখুন।
            </div>
          )}
        </>
      )}
    </div>
  );
}
