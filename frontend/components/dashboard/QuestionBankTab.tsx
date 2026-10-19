"use client";

/**
 * Question Bank tab — browse-by-subject or browse-by-exam.
 *
 * Simplified zones (top → bottom):
 *   1. Header card    — plain title, browse segmented, search, live result count
 *   2. Category strip — one horizontally scrollable chip row (never wraps)
 *   3. Control row    — view segmented (সব / সংরক্ষিত), filter toggle, practice entry
 *   4. Filters        — collapsible panel (বছর / উৎস পরীক্ষা / BCS টার্ম); the
 *                       collapsed state shows the applied filters as removable chips
 *   5. Question list  — expandable cards with bookmark + PYQ meta; load-more paging
 *
 * Design contracts (see docs/DASHBOARD.md):
 * - Facets (year / sourceExam / bcsTerm) are derived from an *unfiltered* fetch
 *   keyed by (subject, ecosystem), so applying a filter never collapses the
 *   option lists (regression covered in tests/unit/frontend/question-bank-tab).
 * - Accordion cards: header = <button aria-expanded aria-controls>, panel is a
 *   persistent container toggled via `hidden` (aria-controls target always
 *   exists — axe-safe).
 * - No command-eyebrow (10.5px < 11px audit floor); no per-card entrance
 *   animations (motion-calm: functional state changes only).
 * - The Question Bank shows Previous Years Questions exclusively (pyqOnly),
 *   same as before the redesign.
 */

import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowClockwise,
  BookmarkSimple,
  CaretDown,
  CheckCircle,
  MagnifyingGlass,
  SlidersHorizontal,
  Sparkle,
  Warning,
  X,
  XCircle,
} from "@phosphor-icons/react";

import Button from "@/components/ui/Button";
import EmptyState from "@/components/ui/EmptyState";
import RichText from "@/components/ui/RichText";
import { SkeletonTable } from "@/components/ui/Skeleton";
import ExamLibraryView from "@/components/dashboard/ExamLibraryView";
import ScrollPractice from "@/components/dashboard/ScrollPractice";
import { useToastSafe } from "@/lib/toast-ctx";
import { useEcosystem } from "@/lib/ecosystem-ctx";
import { useDashboardStore } from "@/lib/store-ctx/dashboard";
import { QUESTION_BANK_CATEGORIES } from "@/lib/data";
import { api } from "@/lib/services/api";
import type { QuestionBankCategoryDTO, QuestionDTO } from "@/lib/types";

/* Search debounce (ms) — the input stays bound to the live query, filtering
 * and highlighting only run on the settled value. */
const SEARCH_DEBOUNCE_MS = 250;
/* Questions per list page; "আরও দেখুন" appends the next page. */
const PAGE_SIZE = 50;
/* Cap for the facet bootstrap fetch (server hard-caps `limit` at 200). */
const FACET_LIMIT = 200;
/* Subject shown when nothing is stored. */
const DEFAULT_CATEGORY = "বাংলা ভাষা ও সাহিত্য";
/* Bengali option markers for expandable question cards. */
const OPTION_LETTERS = ["ক", "খ", "গ", "ঘ"] as const;
/* Question difficulty — server values are English, display is Bengali. */
const DIFFICULTY_LABELS: Record<QuestionDTO["difficulty"], string> = {
  EASY: "সহজ",
  MEDIUM: "মাঝারি",
  HARD: "কঠিন",
};
/* Difficulty accent — mirrors the previous card chips. */
const DIFFICULTY_CLASSES: Record<QuestionDTO["difficulty"], string> = {
  EASY: "text-[var(--accent)] border-[var(--accent)]/25 bg-[var(--accent-muted)]",
  MEDIUM: "text-[var(--warning)] border-[var(--warning)]/25 bg-[var(--warning-muted)]",
  HARD: "text-[var(--danger)] border-[var(--danger)]/25 bg-[var(--danger-muted)]",
};
/* PYQ year facets are newest-first; BCS terms ("50th", "49th"…) by number. */
const SORTED_YEARS = (years: number[]) => [...years].sort((a, b) => b - a);
const SORTED_TERMS = (terms: string[]) =>
  [...terms].sort((a, b) => parseInt(b.replace("th", ""), 10) - parseInt(a.replace("th", ""), 10));

const STATIC_CATEGORIES: QuestionBankCategoryDTO[] = QUESTION_BANK_CATEGORIES.map((c, i) => ({
  id: i,
  label: c.label,
  count: c.count,
}));

type View = "all" | "saved";
type BrowseMode = "subject" | "exam";
type PracticeSession = { questions: QuestionDTO[]; title: string } | null;

/** One row of facet chips (year / sourceExam / BCS term). */
function FilterGroup<T extends string | number>({ label, options, selected, onSelect }: {
  label: string;
  options: T[];
  selected: T | null;
  onSelect: (value: T | null) => void;
}) {
  return (
    <div role="group" aria-label={label}>
      <p className="text-[11px] font-mono uppercase tracking-wider text-[var(--text-muted)] mb-2">{label}</p>
      <div className="flex flex-wrap gap-2">
        {options.map((opt) => {
          const active = selected === opt;
          return (
            <button
              key={String(opt)}
              type="button"
              aria-pressed={active}
              onClick={() => onSelect(active ? null : opt)}
              className={`min-h-11 px-3.5 rounded-full text-sm font-medium border transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)] ${
                active
                  ? "bg-[var(--accent)] border-[var(--accent)] text-[var(--text-inverse)]"
                  : "bg-[var(--surface)] border-[var(--border-default)] text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--accent)]"
              }`}
            >
              {opt}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Toggle-pill segmented control. Uses `aria-pressed` (not role="tab") so
 * screen readers announce a simple on/off state without a tab-panel contract.
 */
function SegmentedControl({ label, options, value, onChange, className = "" }: {
  label: string;
  options: { value: string; label: string; count?: number }[];
  value: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className={`inline-flex flex-wrap gap-1 p-1 rounded-full border border-[var(--border-default)] bg-[var(--surface-muted)] ${className}`}
    >
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          aria-pressed={opt.value === value}
          onClick={() => onChange(opt.value)}
          className={`min-h-11 px-3.5 rounded-full text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)] ${
            opt.value === value
              ? "bg-[var(--surface-raised)] text-[var(--text-primary)] shadow-sm"
              : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          }`}
        >
          {opt.label}
          {typeof opt.count === "number" ? ` (${opt.count})` : ""}
        </button>
      ))}
    </div>
  );
}

/** One expandable question card: header (button) → options + answer + explanation. */
function QuestionCard({ item, index, expanded, onToggle, query, bookmarked, onBookmark }: {
  item: QuestionDTO;
  index: number;
  expanded: boolean;
  onToggle: () => void;
  query: string;
  bookmarked: boolean;
  onBookmark: () => void;
}) {
  const panelId = `qbq-${item.id}`;
  const headerId = `${panelId}-header`;
  const correctInOptions = item.options.some((o) => o.trim() === item.correctAnswer.trim());
  const meta = [
    item.year ? `${item.year}` : null,
    item.sourceExam || null,
    item.bcsTerm ? `${item.bcsTerm} BCS` : null,
  ].filter(Boolean) as string[];

  return (
    <div
      data-cy="question-card"
      className="rounded-2xl border border-[var(--border-default)] bg-[var(--surface-raised)] overflow-hidden"
    >
      <div className="flex items-start gap-1 p-4 pb-2">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          aria-controls={panelId}
          id={headerId}
          className="flex-1 min-h-11 text-start rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
        >
          <span className="sr-only">প্রশ্ন {index + 1}. </span>
          <span className="text-base leading-relaxed font-medium text-[var(--text-primary)]">
            <RichText text={item.question} query={query} />
          </span>
        </button>
        <button
          type="button"
          onClick={onBookmark}
          aria-label={bookmarked ? "সংরক্ষিত তালিকা থেকে সরান" : "সংরক্ষণ করুন"}
          aria-pressed={bookmarked}
          data-cy="bookmark-question"
          className={`min-w-11 min-h-11 shrink-0 rounded-full flex items-center justify-center transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)] ${
            bookmarked
              ? "text-[var(--accent)] hover:text-[var(--accent-hover)]"
              : "text-[var(--text-muted)] hover:text-[var(--accent)]"
          }`}
        >
          <BookmarkSimple className="w-4 h-4" weight={bookmarked ? "fill" : "regular"} aria-hidden="true" />
        </button>
        <CaretDown
          className={`w-4 h-4 mt-3.5 shrink-0 text-[var(--text-muted)] transition-transform ${expanded ? "rotate-180" : ""}`}
          aria-hidden="true"
        />
      </div>

      <div className="px-4 pb-3 flex flex-wrap items-center gap-2">
        <span className={`px-1.5 py-0.5 rounded text-[11px] font-mono border ${DIFFICULTY_CLASSES[item.difficulty]}`}>
          {DIFFICULTY_LABELS[item.difficulty]}
        </span>
        {meta.map((m) => (
          <span key={m} className="px-1.5 py-0.5 rounded text-[11px] font-mono text-[var(--text-muted)] bg-[var(--surface-muted)] border border-[var(--border-subtle)]">
            {m}
          </span>
        ))}
      </div>

      <div
        id={panelId}
        role="region"
        aria-labelledby={headerId}
        hidden={!expanded}
        className="border-t border-[var(--border-subtle)] p-4 pt-3 space-y-2"
      >
        {item.options.length > 0 && (
          <ul className="space-y-2">
            {item.options.map((opt, i) => {
              const isCorrect = opt.trim() === item.correctAnswer.trim();
              return (
                <li
                  key={i}
                  className={`flex items-start gap-3 p-3 rounded-xl border ${
                    isCorrect
                      ? "border-[var(--success)] bg-[var(--success)]/10"
                      : "border-[var(--border-subtle)] bg-[var(--surface)]"
                  }`}
                >
                  <span
                    className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 text-xs font-bold ${
                      isCorrect
                        ? "bg-[var(--success)] text-[var(--text-inverse)]"
                        : "bg-[var(--border-default)] text-[var(--text-secondary)]"
                    }`}
                  >
                    {OPTION_LETTERS[i] ?? i + 1}
                  </span>
                  <span className="text-sm leading-relaxed text-[var(--text-primary)] flex-1 min-w-0">
                    <RichText text={opt} />
                  </span>
                  {isCorrect && (
                    <CheckCircle className="w-4 h-4 text-[var(--success)] shrink-0 mt-1" aria-hidden="true" />
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {!correctInOptions && (
          <div className="p-3 rounded-xl border border-[var(--success)] bg-[var(--success)]/10">
            <span className="text-[11px] font-mono uppercase tracking-wider text-[var(--text-muted)]">সঠিক উত্তর</span>
            <p className="text-sm font-medium text-[var(--text-primary)] mt-1">
              <RichText text={item.correctAnswer} />
            </p>
          </div>
        )}

        {item.explanation && (
          <div className="p-3 rounded-xl bg-[var(--surface-muted)] border border-[var(--border-subtle)]">
            <span className="text-[11px] font-mono uppercase tracking-wider text-[var(--text-muted)]">ব্যাখ্যা</span>
            <p className="text-sm leading-relaxed text-[var(--text-secondary)] mt-1">
              <RichText text={item.explanation} />
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export default function QuestionBankTab() {
  const toast = useToastSafe();
  const { ecosystem } = useEcosystem();
  const questionBankFilters = useDashboardStore((s) => s.questionBankFilters);
  const setQuestionBankFilters = useDashboardStore((s) => s.setQuestionBankFilters);

  const [browseMode, setBrowseMode] = useState<BrowseMode>("subject");
  const [view, setView] = useState<View>("all");

  const [categories, setCategories] = useState<QuestionBankCategoryDTO[]>(STATIC_CATEGORIES);
  const [bookmarks, setBookmarks] = useState<number[]>([]);
  const [questions, setQuestions] = useState<QuestionDTO[]>([]);
  const [savedQuestions, setSavedQuestions] = useState<QuestionDTO[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  // Facets are derived from an unfiltered per-subject fetch so applying a
  // filter can never collapse the option lists (they are NOT sliced from the
  // already-filtered page).
  const [facets, setFacets] = useState<{ years: number[]; sources: string[]; terms: string[] }>({
    years: [],
    sources: [],
    terms: [],
  });

  // PYQ facets — selections live in local state (reset on subject/ecosystem
  // change); the query + subject persist in the dashboard store.
  const [yearFilter, setYearFilter] = useState<number | null>(null);
  const [sourceFilter, setSourceFilter] = useState<string | null>(null);
  const [bcsTerm, setBcsTerm] = useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const hasActiveFilters = Boolean(yearFilter || sourceFilter || bcsTerm);

  // Expandable card: at most one question open at a time.
  const [expandedId, setExpandedId] = useState<number | null>(null);

  // Unified practice state: entering practice replaces the whole tab with a
  // full-height ScrollPractice view (one back path, no nested back buttons).
  const [practice, setPractice] = useState<PracticeSession>(null);

  // "সংরক্ষিত" deep link: the dashboard router (DashboardTabClient) converts
  // /dashboard/question-bank?view=bookmarks into the "__saved__" sentinel
  // category — land on the saved view and clear the sentinel.
  useEffect(() => {
    if (questionBankFilters.category === "__saved__") {
      setView("saved");
      setBrowseMode("subject");
      setQuestionBankFilters({ category: "" });
    }
  }, [questionBankFilters.category, setQuestionBankFilters]);

  // ── Subject + bookmark bootstrap (per ecosystem) ────────────────────────
  const category =
    questionBankFilters.category && questionBankFilters.category !== "__saved__"
      ? questionBankFilters.category
      : DEFAULT_CATEGORY;
  const categoryRef = useRef(category);
  categoryRef.current = category;

  useEffect(() => {
    let cancelled = false;
    // Reset stale practice state when the ecosystem toggles (BCS <-> Bank).
    setPractice(null);
    void (async () => {
      try {
        const [cats, bk] = await Promise.all([
          api.questionBankCategories(ecosystem).catch(() => [] as QuestionBankCategoryDTO[]),
          api.bookmarks().catch(() => [] as number[]),
        ]);
        if (cancelled) return;
        if (cats.length > 0) {
          setCategories(cats);
          // If the current subject doesn't exist in the new ecosystem,
          // switch to the first available one and drop stale facets.
          if (!cats.some((c) => c.label === categoryRef.current)) {
            setQuestionBankFilters({ category: cats[0].label });
            setYearFilter(null);
            setSourceFilter(null);
            setBcsTerm(null);
          }
        }
        setBookmarks(bk ?? []);
      } catch {
        /* keep static fallback categories; bookmarks stay empty */
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ecosystem]);

  // ── Facet bootstrap: one unfiltered fetch per (subject, ecosystem) ──────
  // Runs independently of the display fetch so facet options stay complete
  // even while the display list is filtered (regression: collapsed chips).
  useEffect(() => {
    if (browseMode !== "subject") return;
    let cancelled = false;
    api
      .questions({ subject: category, pyqOnly: true, limit: FACET_LIMIT, ecosystem })
      .then((qs) => {
        if (cancelled) return;
        const years = new Set<number>();
        const sources = new Set<string>();
        const terms = new Set<string>();
        for (const q of qs) {
          if (q.year) years.add(q.year);
          if (q.sourceExam) sources.add(q.sourceExam);
          if (q.bcsTerm) terms.add(q.bcsTerm);
        }
        setFacets({ years: SORTED_YEARS([...years]), sources: [...sources].sort(), terms: SORTED_TERMS([...terms]) });
      })
      .catch(() => {
        if (!cancelled) setFacets({ years: [], sources: [], terms: [] });
      });
    return () => {
      cancelled = true;
    };
  }, [category, ecosystem, browseMode]);

  // ── Display list (server-side facet filtering, page 1) ──────────────────
  // listKey identifies the current filter combination; in-flight requests
  // from a previous key are ignored instead of clobbering fresh state.
  const listKey = [category, yearFilter, sourceFilter, bcsTerm, ecosystem, reloadKey].join("|");
  const listKeyRef = useRef(listKey);
  listKeyRef.current = listKey;

  useEffect(() => {
    if (view === "saved") return; // saved view loads via its own effect
    let cancelled = false;
    setLoading(true);
    setLoadFailed(false);
    api
      .questions({
        subject: category,
        pyqOnly: true,
        limit: PAGE_SIZE,
        page: 1,
        year: yearFilter ?? undefined,
        sourceExam: sourceFilter ?? undefined,
        bcsTerm: bcsTerm ?? undefined,
        ecosystem,
      })
      .then((qs) => {
        if (cancelled || listKeyRef.current !== listKey) return;
        setQuestions(qs);
        setHasMore(qs.length === PAGE_SIZE);
      })
      .catch((err: unknown) => {
        if (cancelled || listKeyRef.current !== listKey) return;
        console.error("[QuestionBank] Failed to load questions:", err);
        setQuestions([]);
        setHasMore(false);
        setLoadFailed(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [category, yearFilter, sourceFilter, bcsTerm, view, ecosystem, reloadKey, listKey]);

  const loadMore = useCallback(() => {
    if (loading || loadingMore || !hasMore) return;
    const keyAtStart = listKeyRef.current;
    setLoadingMore(true);
    const nextPage = Math.floor(questions.length / PAGE_SIZE) + 1;
    api
      .questions({
        subject: category,
        pyqOnly: true,
        limit: PAGE_SIZE,
        page: nextPage,
        year: yearFilter ?? undefined,
        sourceExam: sourceFilter ?? undefined,
        bcsTerm: bcsTerm ?? undefined,
        ecosystem,
      })
      .then((res) => {
        if (listKeyRef.current !== keyAtStart) return; // filters changed mid-flight
        setQuestions((prev) => {
          const seen = new Set(prev.map((q) => q.id));
          return [...prev, ...res.filter((q) => !seen.has(q.id))];
        });
        setHasMore(res.length === PAGE_SIZE);
      })
      .catch((err: unknown) => {
        if (listKeyRef.current !== keyAtStart) return;
        console.error("[QuestionBank] Failed to load more questions:", err);
        toast.error("আরও প্রশ্ন লোড করা যায়নি। আবার চেষ্টা করুন।");
      })
      .finally(() => {
        if (listKeyRef.current === keyAtStart) setLoadingMore(false);
      });
  }, [category, yearFilter, sourceFilter, bcsTerm, ecosystem, hasMore, loading, loadingMore, questions.length, toast]);

  // ── Saved questions (সংরক্ষিত view) ─────────────────────────────────────
  useEffect(() => {
    if (view !== "saved") return;
    let cancelled = false;
    setLoading(true);
    (bookmarks.length > 0 ? api.questions({ ids: bookmarks, limit: 200 }) : Promise.resolve([] as QuestionDTO[]))
      .then((qs) => {
        if (!cancelled) setSavedQuestions(qs);
      })
      .catch((err: unknown) => {
        console.error("[QuestionBank] Failed to load saved questions:", err);
        if (!cancelled) setSavedQuestions([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [view, bookmarks]);

  const toggleSave = useCallback(
    async (id: number) => {
      const wasSaved = bookmarks.includes(id);
      // Optimistic update; reconciled against the server's authoritative
      // state and rolled back on failure.
      setBookmarks((prev) => (wasSaved ? prev.filter((x) => x !== id) : [...prev, id]));
      try {
        const res = await api.toggleBookmark(id);
        setBookmarks((prev) => (res.bookmarked ? [...new Set([...prev, id])] : prev.filter((x) => x !== id)));
      } catch (err) {
        console.error("[QuestionBank] Failed to toggle bookmark:", err);
        setBookmarks((prev) => (wasSaved ? [...new Set([...prev, id])] : prev.filter((x) => x !== id)));
        toast.error("বুকমার্ক সংরক্ষণ করা যায়নি");
      }
    },
    [bookmarks, toast],
  );

  // ── Search (deferred, client-side, highlight via RichText) ──────────────
  const query = questionBankFilters.query;
  const deferredQuery = useDeferredValue(query);
  const filtered = useMemo(() => {
    if (!deferredQuery.trim()) return questions;
    const lower = deferredQuery.toLowerCase();
    return questions.filter(
      (item) =>
        item.question.toLowerCase().includes(lower) ||
        item.correctAnswer.toLowerCase().includes(lower),
    );
  }, [questions, deferredQuery]);

  const displayQuestions = view === "saved" ? savedQuestions : filtered;

  // ── Handlers ────────────────────────────────────────────────────────────
  const handleCategoryChange = useCallback(
    (name: string) => {
      // Subject change resets every facet: selections may not exist in the
      // new subject, and the facet effect rebuilds the option lists.
      setQuestionBankFilters({ category: name });
      setYearFilter(null);
      setSourceFilter(null);
      setBcsTerm(null);
      setExpandedId(null);
    },
    [setQuestionBankFilters],
  );

  const startPractice = useCallback(
    (pool: QuestionDTO[], title: string) => {
      if (pool.length === 0) {
        toast.error("প্র্যাকটিস শুরু করতে কমপক্ষে একটি প্রশ্ন প্রয়োজন।");
        return;
      }
      setPractice({ questions: pool, title });
    },
    [toast],
  );

  const closePractice = useCallback(() => setPractice(null), []);

  // ── Render ──────────────────────────────────────────────────────────────

  // Full-height practice view replaces the tab (single back path).
  if (practice) {
    return (
      <ScrollPractice
        questions={practice.questions}
        title={practice.title}
        onExit={closePractice}
        onComplete={closePractice}
      />
    );
  }

  const practicePool = view === "saved" ? savedQuestions : filtered;
  const practiceTitle =
    view === "saved"
      ? "সংরক্ষিত প্রশ্ন, স্ক্রল প্র্যাকটিস"
      : `${category}, স্ক্রল প্র্যাকটিস (${ecosystem === "BANGLADESH_BANK" ? "ব্যাংক" : "BCS"})`;

  const browseToggle = (
    <SegmentedControl
      label="ব্রাউজ মোড"
      value={browseMode}
      onChange={(v) => setBrowseMode(v as BrowseMode)}
      options={[
        { value: "subject", label: "বিষয় অনুযায়ী" },
        { value: "exam", label: "পরীক্ষা অনুযায়ী" },
      ]}
    />
  );

  if (browseMode === "exam") {
    return (
      <div className="space-y-6">
        {browseToggle}
        <ExamLibraryView />
      </div>
    );
  }

  const activeFilterChips: { key: string; label: string; onRemove: () => void }[] = [];
  if (yearFilter !== null) {
    activeFilterChips.push({ key: "year", label: `বছর: ${yearFilter}`, onRemove: () => setYearFilter(null) });
  }
  if (sourceFilter) {
    activeFilterChips.push({ key: "source", label: `উৎস: ${sourceFilter}`, onRemove: () => setSourceFilter(null) });
  }
  if (bcsTerm) {
    activeFilterChips.push({ key: "term", label: `${bcsTerm} BCS`, onRemove: () => setBcsTerm(null) });
  }
  const activeFilterCount = activeFilterChips.length;

  return (
    <div className="space-y-4">
      {/* ── Zone 1: header card ─────────────────────────────────────────── */}
      <div className="rounded-3xl border border-[var(--border-default)] bg-[var(--surface-raised)] shadow-sm p-5 sm:p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-[var(--text-primary)]">প্রশ্ন ব্যাংক</h1>
            <p className="text-sm text-[var(--text-secondary)] mt-0.5">বিষয় ও পরীক্ষা অনুযায়ী প্রশ্ন ব্রাউজ করুন</p>
          </div>
          {browseToggle}
        </div>

        <div className="relative">
          <MagnifyingGlass className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[var(--text-muted)] pointer-events-none" aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuestionBankFilters({ query: e.target.value })}
            placeholder="প্রশ্ন খুঁজুন, যেমন 'মুক্তিযুদ্ধ'…"
            aria-label="প্রশ্ন খুঁজুন"
            data-cy="question-search"
            className="w-full h-12 pl-12 pr-14 rounded-full border border-[var(--border-default)] bg-[var(--surface)] text-base text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-2 focus:outline-offset-2 focus:outline-[var(--focus-ring)]"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuestionBankFilters({ query: "" })}
              aria-label="সার্চ মুছুন"
              data-cy="clear-search"
              className="absolute right-1.5 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
            >
              <X className="w-4 h-4" aria-hidden="true" />
            </button>
          )}
        </div>

        <p className="text-sm text-[var(--text-secondary)]" aria-live="polite" data-cy="result-count">
          {loading ? "লোড হচ্ছে…" : `${displayQuestions.length} ফলাফল`}
        </p>
      </div>

      {/* ── Zone 2: category strip (single horizontal row, never wraps) ─── */}
      <div
        role="group"
        aria-label="বিষয় নির্বাচন"
        tabIndex={0}
        data-cy="category-strip"
        className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
      >
        {categories.map((cat) => (
          <button
            key={cat.id}
            type="button"
            aria-pressed={category === cat.label}
            onClick={() => handleCategoryChange(cat.label)}
            data-category={cat.label}
            className={`min-h-11 shrink-0 whitespace-nowrap rounded-full px-4 text-sm font-medium border transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)] ${
              category === cat.label
                ? "bg-[var(--accent)] border-[var(--accent)] text-[var(--text-inverse)]"
                : "bg-[var(--surface)] border-[var(--border-default)] text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--accent)]"
            }`}
          >
            {cat.label}
            <span className={`ml-2 text-[11px] font-mono ${category === cat.label ? "opacity-80" : "text-[var(--text-muted)]"}`}>
              {cat.count.toLocaleString("bn-BD")}
            </span>
          </button>
        ))}
      </div>

      {/* ── Zone 3: control row ─────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        <SegmentedControl
          label="তালিকা দেখুন"
          value={view}
          onChange={(v) => setView(v as View)}
          options={[
            { value: "all", label: "সব প্রশ্ন" },
            { value: "saved", label: "সংরক্ষিত", count: bookmarks.length },
          ]}
        />
        <button
          type="button"
          onClick={() => setFiltersOpen((o) => !o)}
          aria-expanded={filtersOpen}
          aria-controls="qb-filters"
          data-cy="toggle-filters"
          className={`min-h-11 inline-flex items-center gap-2 rounded-full px-4 text-sm font-medium border transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)] ${
            filtersOpen || hasActiveFilters
              ? "bg-[var(--accent-muted)] border-[var(--accent)] text-[var(--accent)]"
              : "bg-[var(--surface)] border-[var(--border-default)] text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--accent)]"
          }`}
        >
          <SlidersHorizontal className="w-4 h-4" aria-hidden="true" />
          ফিল্টার
          {activeFilterCount > 0 && (
            <span className="inline-flex items-center justify-center min-w-5 h-5 px-1 rounded-full bg-[var(--accent)] text-[var(--text-inverse)] text-[11px] font-bold">
              {activeFilterCount}
            </span>
          )}
        </button>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => startPractice(practicePool, practiceTitle)}
          disabled={practicePool.length === 0}
          data-cy="practice-questions"
        >
          <Sparkle className="w-4 h-4" aria-hidden="true" />
          প্র্যাকটিস ({practicePool.length})
        </Button>
      </div>

      {/* ── Zone 4: filters (panel when open, chips when collapsed) ─────── */}
      {filtersOpen ? (
        <div
          id="qb-filters"
          data-cy="filters-panel"
          className="rounded-2xl border border-[var(--border-default)] bg-[var(--surface-raised)] shadow-sm p-5 space-y-5"
        >
          {facets.years.length > 0 && (
            <FilterGroup label="বছর" options={facets.years} selected={yearFilter} onSelect={setYearFilter} />
          )}
          {facets.sources.length > 0 && (
            <FilterGroup label="উৎস পরীক্ষা" options={facets.sources} selected={sourceFilter} onSelect={setSourceFilter} />
          )}
          {facets.terms.length > 0 && (
            <FilterGroup label="BCS টার্ম" options={facets.terms} selected={bcsTerm} onSelect={setBcsTerm} />
          )}
          {facets.years.length === 0 && facets.sources.length === 0 && facets.terms.length === 0 && (
            <p className="text-sm text-[var(--text-muted)]">এই বিষয়ে ফিল্টারযোগ্য প্রশ্ন নেই।</p>
          )}
          {hasActiveFilters && (
            <button
              type="button"
              onClick={() => {
                setYearFilter(null);
                setSourceFilter(null);
                setBcsTerm(null);
              }}
              className="min-h-11 text-sm text-[var(--accent)] hover:text-[var(--accent-hover)] hover:underline"
            >
              সব ফিল্টার মুছুন
            </button>
          )}
        </div>
      ) : (
        activeFilterCount > 0 && (
          <div className="flex flex-wrap gap-2" data-cy="applied-filters">
            {activeFilterChips.map((chip) => (
              <button
                key={chip.key}
                type="button"
                onClick={chip.onRemove}
                aria-label={`${chip.label} ফিল্টার মুছুন`}
                className="min-h-11 inline-flex items-center gap-1.5 rounded-full px-3.5 text-sm font-medium bg-[var(--accent-muted)] text-[var(--accent)] border border-[var(--accent)]/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
              >
                {chip.label}
                <X className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            ))}
          </div>
        )
      )}

      {/* ── Zone 5: question list ───────────────────────────────────────── */}
      {loading ? (
        <SkeletonTable rows={5} />
      ) : (
        <div className="space-y-3">
          {displayQuestions.length === 0 ? (
            loadFailed && view === "all" ? (
              <div className="rounded-2xl border border-[var(--border-default)] bg-[var(--surface-raised)]" data-cy="question-error">
                <EmptyState
                  icon={Warning}
                  title="প্রশ্ন লোড করা যায়নি"
                  hint="সার্ভারে সমস্যা হয়েছে। আবার চেষ্টা করুন।"
                  action={
                    <Button variant="secondary" size="sm" onClick={() => setReloadKey((k) => k + 1)}>
                      <ArrowClockwise className="w-4 h-4" aria-hidden="true" /> আবার চেষ্টা করুন
                    </Button>
                  }
                />
              </div>
            ) : (
              <EmptyState
                icon={view === "saved" ? BookmarkSimple : XCircle}
                title={view === "saved" ? "সংরক্ষিত প্রশ্ন নেই" : "কোনো প্রশ্ন পাওয়া যায়নি"}
                hint={
                  view === "saved"
                    ? "যে প্রশ্নগুলো বুকমার্ক করবেন সেগুলো এখানে জমা হবে।"
                    : deferredQuery.trim()
                      ? `“${deferredQuery.trim()}” এর সাথে মিলে এমন প্রশ্ন নেই।`
                      : "অন্য বিষয় বা ফিল্টার দিয়ে খুঁজে দেখুন।"
                }
              />
            )
          ) : (
            <>
              <ul className="space-y-3" data-cy="question-list">
                {displayQuestions.map((item, i) => (
                  <li key={item.id}>
                    <QuestionCard
                      item={item}
                      index={i}
                      expanded={expandedId === item.id}
                      onToggle={() => setExpandedId((cur) => (cur === item.id ? null : item.id))}
                      query={view === "all" ? deferredQuery : ""}
                      bookmarked={bookmarks.includes(item.id)}
                      onBookmark={() => void toggleSave(item.id)}
                    />
                  </li>
                ))}
              </ul>

              {view === "all" && hasMore && (
                <div className="flex justify-center pt-2" data-cy="load-more">
                  <Button variant="secondary" onClick={loadMore} disabled={loadingMore}>
                    {loadingMore ? "লোড হচ্ছে…" : "আরও দেখুন"}
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
