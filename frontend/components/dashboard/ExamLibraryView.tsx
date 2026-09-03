"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronRight,
  Layers,
  BookOpen,
  Clock,
  ListChecks,
  Play,
  Calendar,
  Shuffle,
} from "lucide-react";
import { api } from "@/lib/services/api";
import type { ExamCategoryDTO, ExamDTO, ExamPaperDTO, QuestionDTO } from "@/lib/types";
import QuestionDrill from "./QuestionDrill";

type PaperSelection = {
  paper: ExamPaperDTO;
  exam: ExamDTO;
  category: ExamCategoryDTO;
};

/**
 * Exam-library browser (BCS → BCS Preliminary → 50th BCS → questions).
 *
 * Purely informational, data-driven navigation over the exam taxonomy that the
 * import pipeline bootstraped. Nothing here is fabricated: only real categories,
 * exams, and papers (with real question counts) are shown. Selecting a paper
 * loads its validated questions via paperId and offers an inline practice run.
 */
export default function ExamLibraryView() {
  const [categories, setCategories] = useState<ExamCategoryDTO[]>([]);
  const [loadingTree, setLoadingTree] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<ExamCategoryDTO | null>(null);
  const [selectedExam, setSelectedExam] = useState<ExamDTO | null>(null);
  const [selection, setSelection] = useState<PaperSelection | null>(null);

  // Paper question state.
  const [questions, setQuestions] = useState<QuestionDTO[]>([]);
  const [loadingQuestions, setLoadingQuestions] = useState(false);
  const [drilling, setDrilling] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .examLibrary()
      .then((cats) => {
        if (cancelled) return;
        setCategories(cats);
        if (cats.length > 0) setSelectedCategory(cats[0]);
      })
      .catch(() => {
        /* keep empty → empty state */
      })
      .finally(() => {
        if (!cancelled) setLoadingTree(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

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
    setLoadingQuestions(true);
    try {
      const qs = await api.questions({ paperId: paper.id, limit: 200 });
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
        <button onClick={reset} className="hover:text-[var(--text-primary)] transition-colors">
          পরীক্ষার লাইব্রেরি
        </button>
        {crumbs.map((c, i) => (
          <span key={i} className="flex items-center gap-1">
            <ChevronRight className="w-3 h-3 text-[var(--dashboard-text-secondary)]" />
            <button
              onClick={c.onClick}
              className={`${i === crumbs.length - 1 ? "text-[var(--dashboard-primary)]" : "text-[var(--dashboard-text-muted)]"} hover:text-[var(--text-primary)] transition-colors`}
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
      <div className="glass-card rounded-terminal-rounded border border-terminal-border p-10 text-center">
        <p className="text-sm text-[var(--dashboard-text-muted)] font-mono">কোনো পরীক্ষার লাইব্রেরি নেই — BCS ডেটা এখনো ইমপোর্ট করা হয়নি।</p>
      </div>
    );
  }

  // ── Paper selected: question browser ------------
  if (selection) {
    const { paper, exam, category } = selection;
    if (drilling) {
      return (
        <QuestionDrill
          key={`paper-${paper.id}`}
          questions={questions}
          title={paper.titleBn}
          onExit={() => setDrilling(false)}
        />
      );
    }
    return (
      <div className="space-y-4">
        {renderBreadcrumb()}

        <div className="glass-card rounded-terminal-rounded border border-terminal-border p-5">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-2xl">{category.icon}</span>
                <h3 className="text-lg font-bold text-[var(--text-primary)] font-mono">{paper.titleBn}</h3>
              </div>
              <div className="flex items-center gap-2 text-[11px] text-[var(--dashboard-text-muted)] font-mono">
                <span className="px-1.5 py-0.5 rounded bg-[var(--surface-overlay)] text-[var(--dashboard-text-secondary)]">{category.nameBn} · {exam.nameBn}</span>
                {paper.bcsTerm ? (
                  <span className="px-1.5 py-0.5 rounded bg-[var(--info)]/10 text-[var(--info)] border border-sky-500/20">
                    {paper.termLabel} BCS
                  </span>
                ) : null}
                {paper.year ? (
                  <span className="px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-300 border border-purple-500/20 flex items-center gap-1">
                    <Calendar className="w-3 h-3" /> {paper.year}
                  </span>
                ) : null}
              </div>
            </div>
            <button
              onClick={() => (questions.length ? setDrilling(true) : null)}
              disabled={questions.length === 0}
              className="px-3 py-1.5 rounded-full text-xs font-mono border border-emerald-500/30 bg-[var(--dashboard-primary-subtle)] text-[var(--dashboard-primary)] hover:bg-[var(--dashboard-primary-subtle)] disabled:opacity-40 flex items-center gap-1.5 transition-all"
            >
              <Play className="w-3.5 h-3.5" /> প্র্যাকটিস ({questions.length})
            </button>
          </div>

          <div className="grid grid-cols-3 gap-3 mt-4 text-center">
            <div className="rounded-lg bg-white/[0.04] border border-terminal-border p-3">
              <div className="flex items-center justify-center gap-1.5 text-[var(--dashboard-primary)] font-mono text-lg font-bold">
                <ListChecks className="w-4 h-4" /> {paper.availableQuestions}
              </div>
              <div className="text-[10px] text-[var(--dashboard-text-muted)] font-mono mt-1">লোডকৃত প্রশ্ন</div>
            </div>
            <div className="rounded-lg bg-white/[0.04] border border-terminal-border p-3">
              <div className="flex items-center justify-center gap-1.5 text-[var(--info)] font-mono text-lg font-bold">
                <Clock className="w-4 h-4" /> {paper.durationMin ?? "—"}
              </div>
              <div className="text-[10px] text-[var(--dashboard-text-muted)] font-mono mt-1">সময় (মিনিট)</div>
            </div>
            <div className="rounded-lg bg-white/[0.04] border border-terminal-border p-3">
              <div className="flex items-center justify-center gap-1.5 text-[var(--dashboard-warning)] font-mono text-lg font-bold">
                <Shuffle className="w-4 h-4" /> {paper.totalQuestions ?? "—"}
              </div>
              <div className="text-[10px] text-[var(--dashboard-text-muted)] font-mono mt-1">মোট প্রশ্ন</div>
            </div>
          </div>
        </div>

        <div className="text-[11px] text-[var(--dashboard-text-muted)] font-mono flex items-center justify-between">
          <span>নিচের প্রশ্নগুলো এই পেপার থেকে</span>
          <span className="flex items-center gap-1">
            <span className={`px-1.5 py-0.5 rounded text-[10px] ${paper.verified ? "text-[var(--dashboard-primary)] bg-[var(--dashboard-primary-subtle)]" : "text-[var(--dashboard-text-muted)] bg-[var(--surface-overlay)]"}`}>
              {paper.provenance}
            </span>
          </span>
        </div>

        {loadingQuestions ? (
          <div className="glass-card rounded-terminal-rounded border border-terminal-border p-8 text-center" role="status">
            <span className="sr-only">লোড হচ্ছে…</span>
            <p className="text-sm text-[var(--dashboard-text-muted)] font-mono">প্রশ্ন লোড হচ্ছে...</p>
          </div>
        ) : questions.length === 0 ? (
          <div className="glass-card rounded-terminal-rounded border border-terminal-border p-8 text-center">
            <p className="text-sm text-[var(--dashboard-text-muted)] font-mono">কোনো বৈধ প্রশ্ন নেই</p>
          </div>
        ) : (
          <div className="space-y-3">
            <AnimatePresence mode="popLayout">
              {questions.map((item, i) => (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(i * 0.04, 0.3) }}
                  className="glass-card rounded-terminal-rounded border border-terminal-border p-4"
                >
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="px-1.5 py-0.5 bg-[var(--surface-overlay)] rounded text-[10px] font-mono text-[var(--dashboard-text-muted)]">
                        #{item.questionNumber ?? String(i + 1).padStart(3, "0")}
                      </span>
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-mono text-[var(--dashboard-primary)] bg-[var(--dashboard-primary-subtle)] border border-[var(--accent)]/20">
                        {item.subtopic || item.topic || "পরীক্ষা"}
                      </span>
                    </div>
                  </div>
                  <p className="text-sm text-[var(--text-primary)]">{item.question}</p>
                  <div className="grid sm:grid-cols-2 gap-1.5 mt-3">
                    {item.options.map((opt, oi) => (
                      <div
                        key={oi}
                        className="flex items-start gap-2 text-xs text-[var(--dashboard-text-secondary)] bg-white/[0.03] border border-terminal-border rounded px-2.5 py-1.5"
                      >
                        <span className="font-mono text-[var(--dashboard-text-muted)]">{["ক", "খ", "গ", "ঘ"][oi] ?? oi + 1}.</span>
                        <span>{opt}</span>
                      </div>
                    ))}
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>
    );
  }

  // ── Hierarchy browse (categories → exams → papers) -----
  const papersToShow = activeExam?.papers ?? [];
  return (
    <div className="space-y-5">
      {renderBreadcrumb()}

      {loadingTree ? (
        <div className="glass-card rounded-terminal-rounded border border-terminal-border p-10 text-center" role="status">
          <span className="sr-only">লোড হচ্ছে…</span>
          <p className="text-sm text-[var(--dashboard-text-muted)] font-mono">পরীক্ষার লাইব্রেরি লোড হচ্ছে...</p>
        </div>
      ) : (
        <>
          {/* Category panel */}
          <div>
            <p className="text-[10px] text-[var(--dashboard-text-muted)] font-mono uppercase tracking-wider mb-2">পরীক্ষার বিভাগ</p>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {categories.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => {
                    setSelectedCategory(cat);
                    setSelectedExam(null);
                  }}
                  className={`glass-card rounded-terminal-rounded border p-4 text-left transition-all ${
                    activeCategory?.id === cat.id
                      ? "border-emerald-500/50 bg-[var(--dashboard-primary-subtle)]"
                      : "border-terminal-border hover:border-emerald-500/30"
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
              <p className="text-[10px] text-[var(--dashboard-text-muted)] font-mono uppercase tracking-wider mb-2">ঝটপট — {activeCategory.nameBn}</p>
              <div className="flex flex-wrap gap-2">
                {activeCategory.exams.map((exam) => (
                  <button
                    key={exam.id}
                    onClick={() => chooseExam(exam)}
                    className={`px-3 py-1.5 rounded-full text-xs font-mono border transition-all ${
                      activeExam?.id === exam.id
                        ? "bg-[var(--dashboard-primary-subtle)] border-emerald-500/40 text-[var(--dashboard-primary)]"
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
              <p className="text-[10px] text-[var(--dashboard-text-muted)] font-mono uppercase tracking-wider mb-2">
                {activeExam.nameBn} — সিলেক্ট করুন
              </p>
              {papersToShow.length === 0 ? (
                <div className="glass-card rounded-terminal-rounded border border-terminal-border p-6 text-center">
                  <p className="text-sm text-[var(--dashboard-text-muted)] font-mono">এই পরীক্ষার জন্য এখনো কোনো পেপার ইমপোর্ট হয়নি।</p>
                </div>
              ) : (
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {papersToShow.map((paper, i) => (
                    <motion.button
                      key={paper.id}
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: Math.min(i * 0.04, 0.4) }}
                      onClick={() => void choosePaper(paper, activeExam, activeCategory!)}
                      className="glass-card rounded-terminal-rounded border border-terminal-border p-4 text-left hover:border-[var(--accent)]/40 transition-all group"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <BookOpen className="w-4 h-4 text-[var(--dashboard-primary)]" />
                          <span className="font-semibold text-[var(--text-primary)] font-mono text-sm">{paper.titleBn}</span>
                        </div>
                        <ChevronRight className="w-4 h-4 text-[var(--dashboard-text-secondary)] group-hover:text-[var(--dashboard-primary)] transition-colors" />
                      </div>
                      <div className="flex items-center gap-3 text-[11px] text-[var(--dashboard-text-muted)] font-mono">
                        <span className="flex items-center gap-1">
                          <ListChecks className="w-3 h-3" /> {paper.availableQuestions} প্রশ্ন
                        </span>
                        {paper.bcsTerm ? (
                          <span className="px-1.5 py-0.5 rounded bg-[var(--info)]/10 text-[var(--info)] border border-sky-500/20">
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
              <Layers className="w-4 h-4" />
              একটি পরীক্ষা বেছে নিয়ে সুনির্দিষ্ট পেপারের প্রশ্ন দেখুন।
            </div>
          )}
        </>
      )}
    </div>
  );
}
