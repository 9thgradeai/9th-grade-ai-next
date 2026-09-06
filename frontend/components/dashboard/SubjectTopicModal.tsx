"use client";

/**
 * SubjectTopicModal
 * ─────────────────────────────────────────────────────────────────────────────
 * A two-pane popup for picking subjects → topics → subtopics.
 *
 * Layout:
 *   • Mobile  : full-viewport bottom sheet — subject chips horizontally,
 *               topic tree below, scrollable
 *   • Desktop : centred dialog (max 860px wide, 90vh) — left sidebar for
 *               subjects, right pane for the active subject's topic tree
 *
 * Accessibility: role="dialog", aria-modal, focus trap, Escape closes.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { X, Check, ChevronRight, Minus, Plus, Search, Zap } from "lucide-react";
import type { Server } from "@/lib/types";
import {
  type Selection,
  availableForSubject,
  subtreeCoveredCount,
  subtreeHasSelected,
} from "./TopicTreePicker";

// ─────────────────── Topic row (inside the modal) ────────────────────────────

function TopicRow({
  node,
  depth,
  selectedPaths,
  onToggle,
}: {
  node: Server.ExamSelectionNodeDTO;
  depth: number;
  selectedPaths: string[];
  onToggle: (n: Server.ExamSelectionNodeDTO) => void;
}) {
  const selected = selectedPaths.includes(node.path);
  const expanded = selected || subtreeHasSelected(node, selectedPaths);
  const covered = subtreeCoveredCount(node, selectedPaths);

  return (
    <div>
      <button
        onClick={() => onToggle(node)}
        role="checkbox"
        aria-checked={selected}
        aria-label={`${node.name} — ${node.questionCount} প্রশ্ন`}
        className="w-full flex items-center gap-3 rounded-xl px-3 py-2.5 transition-all duration-150 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--dashboard-primary)]"
        style={{
          marginLeft: (depth - 1) * 18,
          background: selected ? "var(--dashboard-primary-subtle)" : "transparent",
          border: selected
            ? "1px solid color-mix(in oklch, var(--dashboard-primary) 30%, transparent)"
            : "1px solid transparent",
        }}
      >
        <span
          className="w-5 h-5 rounded-md flex-shrink-0 flex items-center justify-center transition-all duration-150"
          style={
            selected
              ? { background: "var(--dashboard-primary)", border: "none" }
              : { background: "var(--dashboard-surface-muted)", border: "1.5px solid var(--dashboard-border-muted)" }
          }
        >
          {selected && <Check className="w-3 h-3 text-white" />}
        </span>

        <span className="flex-1 min-w-0">
          <span
            className="block text-sm font-medium truncate"
            style={{ color: selected ? "var(--dashboard-primary)" : "var(--dashboard-text-primary)" }}
          >
            {node.name}
          </span>
          <span className="block text-[10px] font-mono mt-0.5" style={{ color: "var(--dashboard-text-muted)" }}>
            {covered > 0 && covered < node.questionCount
              ? `${covered} / ${node.questionCount} প্রশ্ন`
              : `${node.questionCount} প্রশ্ন`}
          </span>
        </span>

        {node.children.length > 0 && (
          <ChevronRight
            className="w-4 h-4 flex-shrink-0 transition-transform duration-200"
            style={{
              color: "var(--dashboard-text-muted)",
              transform: expanded ? "rotate(90deg)" : "rotate(0deg)",
            }}
          />
        )}
      </button>

      {expanded && node.children.length > 0 && (
        <div className="overflow-hidden">
          <div className="mt-1 space-y-0.5 pb-1">
            {node.children.map((child) => (
              <TopicRow
                key={child.path}
                node={child}
                depth={depth + 1}
                selectedPaths={selectedPaths}
                onToggle={onToggle}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────── Main Modal ───────────────────────────────────────────────

type Props = {
  open: boolean;
  subjects: Server.ExamSubjectDTO[];
  selection: Selection;
  onSelectionChange: (s: Selection) => void;
  onClose: () => void;
  onConfirm: () => void;
  totalCount: number;
  availableTotal: number;
  insufficient: boolean;
};

export default function SubjectTopicModal({
  open,
  subjects,
  selection,
  onSelectionChange,
  onClose,
  onConfirm,
  totalCount,
  availableTotal,
  insufficient,
}: Props) {
  const [activeSubjectId, setActiveSubjectId] = useState<number | null>(
    subjects[0]?.id ?? null,
  );
  const [search, setSearch] = useState("");
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (subjects.length > 0 && activeSubjectId === null) {
      setActiveSubjectId(subjects[0].id);
    }
  }, [subjects, activeSubjectId]);

  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    setTimeout(() => closeRef.current?.focus(), 50);
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("keydown", onKey); prev?.focus(); };
  }, [open, onClose]);

  useEffect(() => {
    if (open) { document.body.style.overflow = "hidden"; }
    else { document.body.style.overflow = ""; }
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  const activeSubject = subjects.find((s) => s.id === activeSubjectId);
  const selectedSubjectCount = Object.keys(selection).length;

  const toggleSubject = useCallback(
    (subject: Server.ExamSubjectDTO) => {
      const next = { ...selection };
      if (next[subject.id]) {
        delete next[subject.id];
        if (activeSubjectId === subject.id) {
          const remaining = subjects.find((s) => s.id !== subject.id && next[s.id]);
          setActiveSubjectId(remaining?.id ?? subjects[0]?.id ?? null);
        }
      } else {
        next[subject.id] = { paths: [], count: Math.min(subject.questionCount, 10) };
        setActiveSubjectId(subject.id);
      }
      onSelectionChange(next);
    },
    [selection, onSelectionChange, activeSubjectId, subjects],
  );

  const toggleNode = useCallback(
    (subject: Server.ExamSubjectDTO, node: Server.ExamSelectionNodeDTO) => {
      const existing = selection[subject.id] ?? { paths: [] as string[] };
      const isSelected = existing.paths.includes(node.path);
      const paths = isSelected
        ? existing.paths.filter((p) => p !== node.path && !p.startsWith(node.path + "/"))
        : [
            ...existing.paths.filter(
              (p) => p !== node.path && !p.startsWith(node.path + "/") && !node.path.startsWith(p + "/"),
            ),
            node.path,
          ];
      onSelectionChange({ ...selection, [subject.id]: { ...existing, paths } });
    },
    [selection, onSelectionChange],
  );

  const setSubjectCount = useCallback(
    (subject: Server.ExamSubjectDTO, value: number) => {
      const max = availableForSubject(subject, selection);
      const clamped = Math.min(Math.max(0, Math.floor(value)), max);
      const existing = selection[subject.id];
      if (!existing) return;
      onSelectionChange({ ...selection, [subject.id]: { ...existing, count: clamped } });
    },
    [selection, onSelectionChange],
  );

  const toggleWholeSubject = useCallback(
    (subject: Server.ExamSubjectDTO) => {
      const next = { ...selection };
      next[subject.id] = {
        paths: [],
        count: selection[subject.id]?.count ?? Math.min(subject.questionCount, 10),
      };
      onSelectionChange(next);
    },
    [selection, onSelectionChange],
  );

  const filteredNodes = activeSubject
    ? search.trim()
      ? activeSubject.nodes.flatMap((n) =>
          n.name.toLowerCase().includes(search.toLowerCase())
            ? [n]
            : n.children.filter((c) => c.name.toLowerCase().includes(search.toLowerCase())),
        )
      : activeSubject.nodes
    : [];

  return (
    <>
      {open && (
        <>
          {/* Backdrop */}
          <div
            key="backdrop"
            className="fixed inset-0 z-[60]"
            style={{ background: "rgba(0,0,0,0.55)", backdropFilter: "blur(5px)", WebkitBackdropFilter: "blur(5px)" }}
            onClick={onClose}
            aria-hidden="true"
          />

          {/* Dialog */}
          <div
            key="dialog"
            role="dialog"
            aria-modal="true"
            aria-label="বিষয় ও টপিক নির্বাচন"
            className="fixed inset-x-0 bottom-0 sm:inset-0 sm:flex sm:items-center sm:justify-center z-[61] sm:p-4"
          >
            <div
              className="relative flex flex-col w-full sm:max-w-3xl rounded-t-3xl sm:rounded-2xl overflow-hidden"
              style={{
                background: "var(--dashboard-surface)",
                border: "1px solid var(--dashboard-border-muted)",
                boxShadow: "0 24px 64px rgba(0,0,0,0.24), 0 4px 16px rgba(0,0,0,0.12)",
                maxHeight: "92vh",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* ── HEADER ────────────────────────────────────────── */}
              <div
                className="flex items-center justify-between px-5 py-4 border-b flex-shrink-0"
                style={{ borderColor: "var(--dashboard-border-muted)", background: "var(--dashboard-surface-muted)" }}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <span
                    className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ background: "var(--dashboard-primary-subtle)", color: "var(--dashboard-primary)" }}
                  >
                    <Zap className="w-4 h-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-[13px] font-bold" style={{ color: "var(--dashboard-text-primary)" }}>
                      বিষয় ও টপিক নির্বাচন
                    </p>
                    <p className="text-[10px] font-mono" style={{ color: "var(--dashboard-text-muted)" }}>
                      {selectedSubjectCount > 0
                        ? `${selectedSubjectCount}টি বিষয় · ${totalCount}টি প্রশ্ন নির্বাচিত`
                        : "একটি বিষয় বেছে টপিক নির্বাচন করুন"}
                    </p>
                  </div>
                </div>
                <button
                  ref={closeRef}
                  onClick={onClose}
                  aria-label="বন্ধ করুন"
                  className="w-8 h-8 rounded-xl flex items-center justify-center transition-colors flex-shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--dashboard-primary)]"
                  style={{
                    background: "var(--dashboard-surface)",
                    border: "1px solid var(--dashboard-border-muted)",
                    color: "var(--dashboard-text-secondary)",
                  }}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* ── BODY ─────────────────────────────────────────── */}
              <div className="flex flex-1 min-h-0" style={{ overflow: "hidden" }}>

                {/* ── LEFT: subjects ── */}
                {/* Mobile: horizontal chips row */}
                <div
                  className="sm:hidden flex-shrink-0 flex gap-2 px-4 py-3 border-b overflow-x-auto"
                  style={{ borderColor: "var(--dashboard-border-muted)", background: "var(--dashboard-surface-muted)" }}
                >
                  {subjects.map((subject) => {
                    const isSelected = selection[subject.id] !== undefined;
                    const isActive = activeSubjectId === subject.id;
                    return (
                      <button
                        key={subject.id}
                        onClick={() => {
                          setActiveSubjectId(subject.id);
                          if (!isSelected) toggleSubject(subject);
                        }}
                        className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all"
                        style={
                          isActive
                            ? { background: "var(--dashboard-primary)", color: "white" }
                            : isSelected
                            ? { background: "var(--dashboard-primary-subtle)", color: "var(--dashboard-primary)", border: "1px solid color-mix(in oklch, var(--dashboard-primary) 25%, transparent)" }
                            : { background: "var(--dashboard-surface)", color: "var(--dashboard-text-secondary)", border: "1px solid var(--dashboard-border-muted)" }
                        }
                      >
                        <span>{subject.icon}</span>
                        <span className="truncate max-w-[72px]">{subject.nameBn}</span>
                        {isSelected && !isActive && <Check className="w-3 h-3 flex-shrink-0" />}
                      </button>
                    );
                  })}
                </div>

                {/* Desktop: vertical sidebar */}
                <div
                  className="hidden sm:flex sm:flex-col flex-shrink-0 overflow-y-auto border-r"
                  style={{
                    width: "200px",
                    borderColor: "var(--dashboard-border-muted)",
                    background: "var(--dashboard-surface-muted)",
                  }}
                >
                  <p
                    className="px-3 pt-4 pb-2 text-[9px] font-bold tracking-[0.16em] uppercase flex-shrink-0"
                    style={{ color: "var(--dashboard-text-muted)" }}
                  >
                    বিষয়সমূহ
                  </p>
                  <div className="flex flex-col gap-0.5 px-2 pb-3">
                    {subjects.map((subject) => {
                      const isSelected = selection[subject.id] !== undefined;
                      const isActive = activeSubjectId === subject.id;
                      const count = selection[subject.id]?.count ?? 0;
                      return (
                        <div
                          key={subject.id}
                          role="button"
                          tabIndex={0}
                          onClick={() => setActiveSubjectId(subject.id)}
                          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setActiveSubjectId(subject.id); }}
                          className="w-full flex items-center gap-2 px-2.5 py-2 rounded-xl text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--dashboard-primary)] cursor-pointer"
                          style={
                            isActive
                              ? { background: "var(--dashboard-primary-subtle)", border: "1px solid color-mix(in oklch, var(--dashboard-primary) 20%, transparent)" }
                              : { background: "transparent", border: "1px solid transparent" }
                          }
                        >
                          <span className="text-base flex-shrink-0">{subject.icon}</span>
                          <span className="flex-1 min-w-0">
                            <span
                              className="block text-[11px] font-semibold leading-tight truncate"
                              style={{ color: isActive ? "var(--dashboard-primary)" : "var(--dashboard-text-primary)" }}
                            >
                              {subject.nameBn}
                            </span>
                            {isSelected && (
                              <span className="block text-[9px] font-mono mt-0.5" style={{ color: "var(--dashboard-primary)" }}>
                                ✓ {count}টি নির্বাচিত
                              </span>
                            )}
                          </span>
                          {/* toggle checkbox */}
                          <button
                            onClick={(e) => { e.stopPropagation(); toggleSubject(subject); }}
                            aria-label={isSelected ? `${subject.nameBn} বাদ দিন` : `${subject.nameBn} যোগ করুন`}
                            className="w-5 h-5 rounded-md flex-shrink-0 flex items-center justify-center transition-all focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--dashboard-primary)]"
                            style={
                              isSelected
                                ? { background: "var(--dashboard-primary)" }
                                : { background: "var(--dashboard-surface)", border: "1.5px solid var(--dashboard-border-muted)" }
                            }
                          >
                            {isSelected && <Check className="w-3 h-3 text-white" />}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* ── RIGHT: topic tree ── */}
                <div className="flex flex-col flex-1 min-w-0" style={{ overflow: "hidden" }}>
                  {activeSubject ? (
                    <>
                      {/* Active subject header */}
                      <div
                        className="flex items-center justify-between gap-3 px-4 py-3 border-b flex-shrink-0"
                        style={{ borderColor: "var(--dashboard-border-muted)" }}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-xl flex-shrink-0">{activeSubject.icon}</span>
                          <div className="min-w-0">
                            <p className="text-sm font-bold truncate" style={{ color: "var(--dashboard-text-primary)" }}>
                              {activeSubject.nameBn}
                            </p>
                            <p className="text-[10px] font-mono" style={{ color: "var(--dashboard-text-muted)" }}>
                              {activeSubject.questionCount}টি প্রশ্ন উপলব্ধ
                            </p>
                          </div>
                        </div>
                        {selection[activeSubject.id] !== undefined ? (
                          <button
                            onClick={() => toggleWholeSubject(activeSubject)}
                            className="flex-shrink-0 px-2.5 py-1 rounded-lg text-[11px] font-mono font-semibold transition-all"
                            style={
                              selection[activeSubject.id]?.paths.length === 0
                                ? { background: "var(--dashboard-primary)", color: "white" }
                                : { background: "var(--dashboard-surface-muted)", color: "var(--dashboard-text-secondary)", border: "1px solid var(--dashboard-border-muted)" }
                            }
                          >
                            {selection[activeSubject.id]?.paths.length === 0 ? "সব নির্বাচিত ✓" : "সব নির্বাচন"}
                          </button>
                        ) : (
                          <button
                            onClick={() => toggleSubject(activeSubject)}
                            className="flex-shrink-0 px-3 py-1 rounded-lg text-[11px] font-mono font-semibold transition-all"
                            style={{ background: "var(--dashboard-primary)", color: "white" }}
                          >
                            + যোগ করুন
                          </button>
                        )}
                      </div>

                      {/* Search bar */}
                      <div
                        className="flex-shrink-0 px-4 py-2.5 border-b"
                        style={{ borderColor: "var(--dashboard-border-muted)" }}
                      >
                        <div
                          className="flex items-center gap-2 rounded-xl px-3 py-2"
                          style={{ background: "var(--dashboard-surface-muted)", border: "1px solid var(--dashboard-border-muted)" }}
                        >
                          <Search className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "var(--dashboard-text-muted)" }} />
                          <input
                            type="text"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="টপিক খুঁজুন..."
                            className="flex-1 bg-transparent text-xs outline-none font-mono"
                            style={{ color: "var(--dashboard-text-primary)" }}
                          />
                          {search && (
                            <button onClick={() => setSearch("")} style={{ color: "var(--dashboard-text-muted)" }}>
                              <X className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Topic tree — scrollable */}
                      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-0.5">
                        {selection[activeSubject.id] !== undefined ? (
                          filteredNodes.length > 0 ? (
                            filteredNodes.map((node) => (
                              <TopicRow
                                key={node.path}
                                node={node}
                                depth={1}
                                selectedPaths={selection[activeSubject.id]?.paths ?? []}
                                onToggle={(n) => toggleNode(activeSubject, n)}
                              />
                            ))
                          ) : (
                            <div className="py-12 text-center">
                              <p className="text-sm font-mono" style={{ color: "var(--dashboard-text-muted)" }}>কোনো টপিক পাওয়া যায়নি</p>
                            </div>
                          )
                        ) : (
                          <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
                            <div
                              className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl"
                              style={{ background: "var(--dashboard-surface-muted)" }}
                            >
                              {activeSubject.icon}
                            </div>
                            <div>
                              <p className="text-sm font-semibold" style={{ color: "var(--dashboard-text-primary)" }}>বিষয়টি যোগ করুন</p>
                              <p className="text-xs font-mono mt-1" style={{ color: "var(--dashboard-text-muted)" }}>টপিক নির্বাচন করতে প্রথমে বিষয়টি যোগ করুন</p>
                            </div>
                            <button
                              onClick={() => toggleSubject(activeSubject)}
                              className="px-4 py-2 rounded-xl text-sm font-semibold"
                              style={{ background: "var(--dashboard-primary)", color: "white" }}
                            >
                              + যোগ করুন
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Per-subject count stepper */}
                      {selection[activeSubject.id] !== undefined && (
                        <div
                          className="flex-shrink-0 flex items-center justify-between gap-3 px-4 py-3 border-t"
                          style={{ borderColor: "var(--dashboard-border-muted)", background: "var(--dashboard-surface-muted)" }}
                        >
                          <div className="min-w-0">
                            <p className="text-xs font-semibold" style={{ color: "var(--dashboard-text-primary)" }}>
                              এই বিষয় থেকে প্রশ্ন
                            </p>
                            <p className="text-[10px] font-mono mt-0.5" style={{ color: "var(--dashboard-text-muted)" }}>
                              উপলব্ধ:{" "}
                              <span style={{ color: "var(--dashboard-primary)" }}>
                                {availableForSubject(activeSubject, selection)}টি
                              </span>
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => setSubjectCount(activeSubject, (selection[activeSubject.id]?.count ?? 0) - 1)}
                              aria-label="প্রশ্ন কমান"
                              className="w-8 h-8 rounded-xl flex items-center justify-center transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--dashboard-primary)]"
                              style={{ background: "var(--dashboard-surface)", border: "1px solid var(--dashboard-border-muted)", color: "var(--dashboard-text-secondary)" }}
                            >
                              <Minus className="w-3.5 h-3.5" />
                            </button>
                            <input
                              type="number"
                              min={0}
                              max={availableForSubject(activeSubject, selection)}
                              value={selection[activeSubject.id]?.count ?? 0}
                              onChange={(e) => setSubjectCount(activeSubject, Number(e.target.value))}
                              aria-label="প্রশ্ন সংখ্যা"
                              className="w-14 text-center rounded-xl py-1.5 text-sm font-mono font-bold outline-none focus-visible:ring-2 focus-visible:ring-[var(--dashboard-primary)] [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                              style={{ background: "var(--dashboard-surface)", border: "1px solid var(--dashboard-border-muted)", color: "var(--dashboard-primary)" }}
                            />
                            <button
                              onClick={() => setSubjectCount(activeSubject, (selection[activeSubject.id]?.count ?? 0) + 1)}
                              aria-label="প্রশ্ন বাড়ান"
                              className="w-8 h-8 rounded-xl flex items-center justify-center transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--dashboard-primary)]"
                              style={{ background: "var(--dashboard-surface)", border: "1px solid var(--dashboard-border-muted)", color: "var(--dashboard-text-secondary)" }}
                            >
                              <Plus className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="flex-1 flex items-center justify-center">
                      <p className="text-sm font-mono" style={{ color: "var(--dashboard-text-muted)" }}>
                        বাম দিক থেকে একটি বিষয় নির্বাচন করুন
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* ── FOOTER ──────────────────────────────────────────── */}
              <div
                className="flex-shrink-0 flex items-center justify-between gap-3 px-5 py-4 border-t"
                style={{ borderColor: "var(--dashboard-border-muted)", background: "var(--dashboard-surface-muted)" }}
              >
                <div className="min-w-0">
                  {totalCount > 0 ? (
                    <>
                      <p
                        className="text-sm font-bold"
                        style={{ color: insufficient ? "var(--dashboard-danger)" : "var(--dashboard-primary)" }}
                      >
                        {totalCount}টি প্রশ্ন নির্বাচিত
                      </p>
                      <p className="text-[10px] font-mono mt-0.5" style={{ color: "var(--dashboard-text-muted)" }}>
                        {selectedSubjectCount}টি বিষয় · উপলব্ধ {availableTotal}টি
                      </p>
                    </>
                  ) : (
                    <p className="text-sm" style={{ color: "var(--dashboard-text-muted)" }}>কোনো বিষয় নির্বাচিত হয়নি</p>
                  )}
                </div>
                <div className="flex items-center gap-2.5 flex-shrink-0">
                  <button
                    onClick={onClose}
                    className="px-4 py-2.5 rounded-xl text-sm font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--dashboard-primary)]"
                    style={{ background: "var(--dashboard-surface)", border: "1px solid var(--dashboard-border-muted)", color: "var(--dashboard-text-secondary)" }}
                  >
                    বাতিল
                  </button>
                  <button
                    onClick={() => { onConfirm(); onClose(); }}
                    disabled={selectedSubjectCount === 0 || totalCount === 0}
                    className="px-5 py-2.5 rounded-xl text-sm font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--dashboard-primary)] flex items-center gap-2"
                    style={{ background: "var(--dashboard-primary)", color: "white" }}
                  >
                    <Zap className="w-4 h-4" />
                    প্র্যাকটিস শুরু
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}
