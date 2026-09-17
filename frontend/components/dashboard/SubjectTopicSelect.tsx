"use client";

/**
 * SubjectTopicSelect
 * ─────────────────────────────────────────────────────────────────────────────
 * Subject → topic → subtopic picker shown in the config phase of every practice
 * mode (CUSTOM EXAM / MOCK_TEST / QUICK_PRACTICE).
 *
 * Every subject is visible up-front as a clickable card. Tapping a card opens
 * a responsive popup for that subject with a multi-select topic tree and a
 * per-subject question-count stepper:
 *   • "সম্পূর্ণ বিষয়" — whole subject (empty path list)
 *   • টপিক — top-level topic rows with checkboxes
 *   • সাবটপিক — any deepening descendant under an expanded topic, selectable
 *     alongside other topics/subtopics (multiple paths per subject supported)
 *
 * Each selection is committed live into the parent-owned `selection` as a list
 * of node paths, so the totals update in real time while the popup is open.
 * Ticking a node keeps the list clean: selecting it removes any previously
 * selected descendants (it covers them) and ancestors (it narrows them); empty
 * `paths` means the whole subject. "সম্পন্ন" closes the popup without losing
 * the chosen config; "বিষয়টি সরান" removes the subject entirely. On small
 * screens the popup docks to the bottom edge (bottom sheet); on larger screens
 * it centers as a maximized-height dialog.
 */

import { useState, useCallback } from "react";
import { Check, Minus, Plus, X } from "lucide-react";
import { motion } from "framer-motion";
import type { Server } from "@/lib/types";
import { useDialogA11y } from "@/lib/use-dialog-a11y";
import {
  type Selection,
  subtreeHasSelected,
  availableForSubject,
} from "./TopicTreePicker";

type Props = {
  subjects: Server.ExamSubjectDTO[];
  selection: Selection;
  onSelectionChange: (selection: Selection) => void;
};

// ── Recursive topic-tree row ──────────────────────────────
// Checkbox + name + aggregated count. A node's children expand when the node
// itself (or any descendant) is selected, so the taxonomy is browsable at any
// depth. Any depth can be toggled independently, enabling multi-topic and
// multi-subtopic selection.
function PopupTopicNode({
  node,
  depth,
  selectedPaths,
  onToggle,
}: {
  node: Server.ExamSelectionNodeDTO;
  depth: number;
  selectedPaths: string[];
  onToggle: (node: Server.ExamSelectionNodeDTO) => void;
}) {
  const selected = selectedPaths.includes(node.path);
  const expanded = selected || subtreeHasSelected(node, selectedPaths);
  return (
    <div>
      <div
        className={`flex items-center gap-2 rounded-lg border px-2.5 py-2 transition-colors ${
          selected
            ? "border-[var(--accent)]/30 bg-[var(--dashboard-primary-subtle)]"
            : "border-transparent hover:border-[var(--dashboard-border-muted)]"
        }`}
        style={{ marginLeft: (depth - 1) * 16 }}
      >
        <button
          onClick={() => onToggle(node)}
          role="checkbox"
          aria-checked={selected}
          aria-label={`${node.name} (${node.questionCount}টি প্রশ্ন)`}
          className={`w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center ${
            selected
              ? "bg-[var(--accent)] border-[var(--accent)]"
              : "border-[var(--border-default)]"
          }`}
        >
          {selected && <Check className="w-3 h-3 text-[var(--dashboard-text-inverse)]" />}
        </button>
        <button
          onClick={() => onToggle(node)}
          className="flex-1 text-left min-w-0"
        >
          <span className="text-xs font-medium text-[var(--text-primary)] break-words">
            {node.name}
          </span>
          <span className="block text-[10px] text-[var(--dashboard-text-muted)] font-mono">
            {node.questionCount}টি প্রশ্ন
          </span>
        </button>
      </div>
      {expanded && node.children.length > 0 && (
        <div className="mt-1 space-y-1">
          {node.children.map((child) => (
            <PopupTopicNode
              key={child.path}
              node={child}
              depth={depth + 1}
              selectedPaths={selectedPaths}
              onToggle={onToggle}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function SubjectTopicSelect({
  subjects,
  selection,
  onSelectionChange,
}: Props) {
  const [openSubject, setOpenSubject] = useState<Server.ExamSubjectDTO | null>(null);

  const closePopup = useCallback(() => setOpenSubject(null), []);
  const dialogRef = useDialogA11y<HTMLDivElement>(openSubject !== null, closePopup);

  // Tapping a card selects the subject (with defaults when new) and opens its
  // popup. Selection changes are committed live to the parent.
  const handleCardClick = (subject: Server.ExamSubjectDTO) => {
    if (!selection[subject.id]) {
      onSelectionChange({
        ...selection,
        [subject.id]: { paths: [], count: Math.min(subject.questionCount, 10) },
      });
    }
    setOpenSubject(subject);
  };

  const removeSubject = (subject: Server.ExamSubjectDTO) => {
    const next = { ...selection };
    delete next[subject.id];
    onSelectionChange(next);
    setOpenSubject(null);
  };

  // Toggling a node keeps the selection clean: selecting a node removes any
  // selected descendants (it covers them) and any selected ancestors (it
  // narrows them). Empty paths means the whole subject.
  const toggleNodeForOpenSubject = (node: Server.ExamSelectionNodeDTO) => {
    if (!openSubject) return;
    const existing = selection[openSubject.id] ?? { paths: [] as string[] };
    const isSelected = existing.paths.includes(node.path);
    let paths: string[];
    if (isSelected) {
      paths = existing.paths.filter(
        (p) => p !== node.path && !p.startsWith(node.path + "/"),
      );
    } else {
      paths = [
        ...existing.paths.filter(
          (p) =>
            p !== node.path &&
            !p.startsWith(node.path + "/") &&
            !node.path.startsWith(p + "/"),
        ),
        node.path,
      ];
    }
    onSelectionChange({ ...selection, [openSubject.id]: { ...existing, paths } });
  };

  const toggleWholeSubject = () => {
    if (!openSubject) return;
    const existing = selection[openSubject.id];
    if (!existing) return;
    onSelectionChange({
      ...selection,
      [openSubject.id]: { ...existing, paths: [] },
    });
  };

  const setPopupCount = (value: number) => {
    if (!openSubject) return;
    const existing = selection[openSubject.id];
    if (!existing) return;
    const max = availableForSubject(openSubject, selection);
    const clamped = Math.min(Math.max(0, Math.floor(value)), max);
    onSelectionChange({
      ...selection,
      [openSubject.id]: { ...existing, count: clamped },
    });
  };

  // Live-derived state for the open popup.
  const popupSel = openSubject ? selection[openSubject.id] : undefined;
  const popupPaths = popupSel?.paths ?? [];
  const popupAvailable = openSubject ? availableForSubject(openSubject, selection) : 0;

  return (
    <div className="space-y-4">
      {/* ── Subjects ── */}
      <div>
        <p className="text-xs text-[var(--dashboard-text-muted)] font-mono uppercase tracking-widest mb-2">
          ১. বিষয় নির্বাচন করুন
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {subjects.map((subject) => {
            const sel = selection[subject.id];
            const selected = sel !== undefined;
            return (
              <button
                key={subject.id}
                type="button"
                onClick={() => handleCardClick(subject)}
                aria-expanded={openSubject?.id === subject.id}
                className={`glass-card rounded-2xl border p-3 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--dashboard-primary)] ${
                  selected
                    ? "border-[var(--accent)]/40 bg-[var(--dashboard-primary-subtle)] shadow-neon-glow"
                    : "border-terminal-border hover:border-[var(--accent)]/20"
                }`}
              >
                <div className="flex items-center gap-2">
                  <span
                    className={`w-8 h-8 rounded-lg ${subject.bg} flex items-center justify-center text-base flex-shrink-0`}
                  >
                    {subject.icon}
                  </span>
                  <span
                    className="text-[11px] font-semibold leading-tight line-clamp-2 flex-1"
                    style={{ color: "var(--dashboard-text-primary)" }}
                  >
                    {subject.nameBn}
                  </span>
                  <span
                    className={`w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center ${
                      selected ? "bg-[var(--accent)] border-[var(--accent)]" : "border-[var(--border-default)]"
                    }`}
                  >
                    {selected && <Check className="w-3 h-3 text-[var(--dashboard-text-inverse)]" />}
                  </span>
                </div>
                <p className="text-[10px] font-mono mt-1.5" style={{ color: "var(--dashboard-text-muted)" }}>
                  {subject.questionCount}টি প্রশ্ন
                </p>
                {selected && sel?.count !== undefined && (
                  <p
                    className="text-[10px] font-mono mt-0.5 tabular-nums"
                    style={{ color: "var(--dashboard-primary)" }}
                  >
                    নির্বাচিত: {sel.count}/{subject.questionCount}
                  </p>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Popup: multi-select topics / count for the clicked subject ── */}
      {openSubject && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="fixed inset-0 z-50 bg-[var(--overlay)] backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-6"
          onClick={closePopup}
        >
          <motion.div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="subject-topic-popup-title"
            tabIndex={-1}
            initial={{ y: 48, scale: 0.98 }}
            animate={{ y: 0, scale: 1 }}
            transition={{ type: "spring", damping: 28, stiffness: 320 }}
            onClick={(e) => e.stopPropagation()}
            className="glass-card rounded-t-2xl sm:rounded-2xl border border-[var(--accent)]/30 w-full sm:max-w-md max-h-[88vh] flex flex-col overflow-hidden"
          >
            {/* Header */}
            <div className="p-4 sm:p-5 border-b border-[var(--dashboard-border-muted)] flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="text-xl flex-shrink-0">{openSubject.icon}</span>
                <div className="min-w-0">
                  <h3
                    id="subject-topic-popup-title"
                    className="text-base font-bold truncate"
                    style={{ color: "var(--dashboard-text-primary)" }}
                  >
                    {openSubject.nameBn}
                  </h3>
                  <p className="text-[10px] font-mono" style={{ color: "var(--dashboard-text-muted)" }}>
                    {openSubject.questionCount}টি প্রশ্ন উপলব্ধ
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={closePopup}
                aria-label="বন্ধ করুন"
                className="w-9 h-9 rounded-xl flex items-center justify-center text-[var(--dashboard-text-muted)] hover:text-[var(--dashboard-text-primary)] hover:bg-[var(--surface-hover)] flex-shrink-0 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Scrollable body */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
              {/* Whole-subject toggle */}
              <button
                type="button"
                onClick={toggleWholeSubject}
                className={`w-full px-3 py-2.5 rounded-xl border text-xs font-mono transition-colors ${
                  popupPaths.length === 0
                    ? "bg-[var(--accent)] text-[var(--dashboard-text-inverse)] border-[var(--accent)]"
                    : "border-[var(--dashboard-border-muted)] text-[var(--dashboard-text-muted)] hover:border-[var(--accent)]/40"
                }`}
              >
                {popupPaths.length === 0 ? "পুরো বিষয় ✓" : "সম্পূর্ণ বিষয় নির্বাচন করুন"}
              </button>

              {/* Multi-select topic tree */}
              <div>
                <p
                  className="block text-[10px] font-mono uppercase tracking-widest mb-1.5"
                  style={{ color: "var(--dashboard-text-muted)" }}
                >
                  টপিক নির্বাচন করুন
                </p>
                <div className="space-y-1">
                  {openSubject.nodes.map((node) => (
                    <PopupTopicNode
                      key={node.path}
                      node={node}
                      depth={1}
                      selectedPaths={popupPaths}
                      onToggle={toggleNodeForOpenSubject}
                    />
                  ))}
                </div>
              </div>

              {/* Per-subject question count */}
              <div className="pt-4 border-t border-[var(--dashboard-border-muted)]">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <p className="text-xs font-mono" style={{ color: "var(--dashboard-text-secondary)" }}>
                    এই বিষয় থেকে প্রশ্ন
                  </p>
                  <p className="text-[10px] font-mono" style={{ color: "var(--dashboard-text-muted)" }}>
                    উপলব্ধ:{" "}
                    <span style={{ color: "var(--dashboard-primary)" }} className="tabular-nums">
                      {popupAvailable}টি
                    </span>
                  </p>
                </div>
                <div className="flex items-center justify-center gap-3">
                  <button
                    type="button"
                    onClick={() => setPopupCount((popupSel?.count ?? 0) - 1)}
                    aria-label="বিষয়ের প্রশ্ন কমান"
                    disabled={(popupSel?.count ?? 0) <= 0}
                    className="w-10 h-10 rounded-xl bg-[var(--surface-raised)] border border-[var(--accent)]/20 flex items-center justify-center text-[var(--dashboard-primary)] hover:border-[var(--accent)]/40 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    <Minus className="w-5 h-5" />
                  </button>
                  <input
                    type="number"
                    min={0}
                    max={popupAvailable}
                    value={popupSel?.count ?? 0}
                    onChange={(e) => setPopupCount(Number(e.target.value))}
                    aria-label={`${openSubject.nameBn} এর প্রশ্ন সংখ্যা`}
                    className="w-20 text-center bg-[var(--surface-raised)] border border-[var(--accent)]/20 rounded-xl py-2.5 text-[var(--dashboard-primary)] font-mono text-base font-bold focus:outline-none focus:border-[var(--accent)]/50 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none tabular-nums"
                  />
                  <button
                    type="button"
                    onClick={() => setPopupCount((popupSel?.count ?? 0) + 1)}
                    aria-label="বিষয়ের প্রশ্ন বাড়ান"
                    className="w-10 h-10 rounded-xl bg-[var(--surface-raised)] border border-[var(--accent)]/20 flex items-center justify-center text-[var(--dashboard-primary)] hover:border-[var(--accent)]/40 transition-colors"
                  >
                    <Plus className="w-5 h-5" />
                  </button>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="p-4 sm:p-5 border-t border-[var(--dashboard-border-muted)] flex items-center gap-3">
              {selection[openSubject.id] !== undefined && (
                <button
                  type="button"
                  onClick={() => removeSubject(openSubject)}
                  className="px-4 py-2.5 rounded-xl border border-[var(--danger)]/20 text-[var(--dashboard-danger)] font-mono text-xs sm:text-sm hover:bg-[var(--dashboard-danger-subtle)] transition-colors whitespace-nowrap"
                >
                  বিষয়টি সরান
                </button>
              )}
              <button
                type="button"
                onClick={closePopup}
                className="flex-1 py-2.5 bg-[var(--accent)] text-[var(--dashboard-text-inverse)] font-mono text-sm rounded-xl hover:bg-[var(--accent-hover)] transition-colors shadow-neon-glow"
              >
                সম্পন্ন
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </div>
  );
}