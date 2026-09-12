"use client";

/**
 * SubjectTopicSelect
 * ─────────────────────────────────────────────────────────────────────────────
 * Inline subject → topic → subtopic picker shown directly in the config phase
 * of every practice mode (CUSTOM EXAM / MOCK_TEST / QUICK_PRACTICE).
 *
 * Unlike the old modal flow, every subject is visible up-front without needing
 * to press a "বাছাই করুন" button. Selecting a subject reveals two cascading
 * dropdowns:
 *   • টপিক    — top-level groups of the subject (+ "সম্পূর্ণ বিষয়")
 *   • সাবটপিক — descendants of the chosen topic (+ "সব সাবটপিক")
 *
 * The component is controlled: `selection` lives in the parent tab so the
 * existing session/request logic is shared unchanged.
 */

import { Check, Minus, Plus } from "lucide-react";
import type { Server } from "@/lib/types";
import {
  type Selection,
  findNodeByPath,
  flattenNodes,
  availableForSubject,
} from "./TopicTreePicker";

// First path segment of a hierarchical node path, e.g. `A/B/C` → `A`.
function topLevelPath(path: string): string {
  return path.split("/")[0];
}

type Props = {
  subjects: Server.ExamSubjectDTO[];
  selection: Selection;
  onSelectionChange: (selection: Selection) => void;
};

export default function SubjectTopicSelect({
  subjects,
  selection,
  onSelectionChange,
}: Props) {
  const selectedSubjects = subjects.filter((s) => selection[s.id] !== undefined);

  const toggleSubject = (subject: Server.ExamSubjectDTO) => {
    const next = { ...selection };
    if (next[subject.id]) {
      delete next[subject.id];
    } else {
      next[subject.id] = { paths: [], count: Math.min(subject.questionCount, 10) };
    }
    onSelectionChange(next);
  };

  const handleTopicChange = (
    subject: Server.ExamSubjectDTO,
    value: string,
  ) => {
    const existing = selection[subject.id];
    if (!existing) return;
    onSelectionChange({
      ...selection,
      [subject.id]: { ...existing, paths: value ? [value] : [] },
    });
  };

  const handleSubtopicChange = (
    subject: Server.ExamSubjectDTO,
    topicPath: string,
    value: string,
  ) => {
    const existing = selection[subject.id];
    if (!existing) return;
    onSelectionChange({
      ...selection,
      [subject.id]: { ...existing, paths: value ? [value] : [topicPath] },
    });
  };

  const setSubjectCount = (subject: Server.ExamSubjectDTO, value: number) => {
    const max = availableForSubject(subject, selection);
    const clamped = Math.min(Math.max(0, Math.floor(value)), max);
    const existing = selection[subject.id];
    if (!existing) return;
    onSelectionChange({ ...selection, [subject.id]: { ...existing, count: clamped } });
  };

  return (
    <div className="space-y-6">
      {/* ── Subjects ── */}
      <div>
        <p className="text-xs text-[var(--dashboard-text-muted)] font-mono uppercase tracking-widest mb-2">
          ১. বিষয় নির্বাচন করুন
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {subjects.map((subject) => {
            const selected = selection[subject.id] !== undefined;
            return (
              <button
                key={subject.id}
                type="button"
                onClick={() => toggleSubject(subject)}
                className={`glass-card rounded-2xl border p-3 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--dashboard-primary)] ${
                  selected
                    ? "border-[var(--accent)]/40 bg-[var(--dashboard-primary-subtle)] shadow-neon-glow"
                    : "border-terminal-border hover:border-[var(--accent)]/20"
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className={`w-8 h-8 rounded-lg ${subject.bg} flex items-center justify-center text-base flex-shrink-0`}>
                    {subject.icon}
                  </span>
                  <span className="text-[11px] font-semibold leading-tight line-clamp-2" style={{ color: "var(--dashboard-text-primary)" }}>
                    {subject.nameBn}
                  </span>
                  <span
                    className={`ml-auto w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center ${
                      selected ? "bg-[var(--accent)] border-[var(--accent)]" : "border-[var(--border-default)]"
                    }`}
                  >
                    {selected && <Check className="w-3 h-3 text-[var(--dashboard-text-inverse)]" />}
                  </span>
                </div>
                <p className="text-[10px] font-mono mt-1.5" style={{ color: "var(--dashboard-text-muted)" }}>
                  {subject.questionCount}টি প্রশ্ন
                </p>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Topics / subtopics per selected subject ── */}
      {selectedSubjects.length > 0 && (
        <div className="space-y-4">
          <p className="text-xs text-[var(--dashboard-text-muted)] font-mono uppercase tracking-widest mb-2">
            ২. টপিক ও সাবটপিক নির্বাচন করুন
          </p>
          {selectedSubjects.map((subject) => {
            const sel = selection[subject.id];
            const paths = sel?.paths ?? [];
            const topicPath = paths.length > 0 ? topLevelPath(paths[0]) : "";
            const subtopicPath = paths.length > 0 && paths[0] !== topicPath ? paths[0] : "";
            const activeTopic = topicPath ? findNodeByPath(subject.nodes, topicPath) : null;
            const subTopicOptions = activeTopic
              ? flattenNodes(activeTopic.children)
              : [];
            const available = availableForSubject(subject, selection);

            return (
              <div
                key={subject.id}
                className="glass-card rounded-2xl border border-[var(--accent)]/20 p-4 md:p-5"
              >
                <div className="flex items-center gap-2.5 mb-4">
                  <span className="text-lg">{subject.icon}</span>
                  <div className="min-w-0">
                    <h3 className="text-sm font-semibold truncate" style={{ color: "var(--text-primary)" }}>
                      {subject.nameBn}
                    </h3>
                    <p className="text-[10px] font-mono" style={{ color: "var(--dashboard-text-muted)" }}>
                      {subject.questionCount}টি প্রশ্ন উপলব্ধ
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* Topic dropdown */}
                  <div>
                    <label
                      htmlFor={`subject-${subject.id}-topic`}
                      className="block text-[10px] font-mono uppercase tracking-widest mb-1.5"
                      style={{ color: "var(--dashboard-text-muted)" }}
                    >
                      টপিক
                    </label>
                    <select
                      id={`subject-${subject.id}-topic`}
                      value={topicPath}
                      onChange={(e) => handleTopicChange(subject, e.target.value)}
                      className="w-full rounded-xl px-3 py-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--dashboard-primary)]"
                      style={{
                        background: "var(--dashboard-surface-muted)",
                        border: "1px solid var(--dashboard-border-muted)",
                        color: "var(--dashboard-text-primary)",
                      }}
                    >
                      <option value="">সম্পূর্ণ বিষয়</option>
                      {subject.nodes.map((node) => (
                        <option key={node.path} value={node.path}>
                          {node.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Subtopic dropdown */}
                  <div>
                    <label
                      htmlFor={`subject-${subject.id}-subtopic`}
                      className="block text-[10px] font-mono uppercase tracking-widest mb-1.5"
                      style={{ color: "var(--dashboard-text-muted)" }}
                    >
                      সাবটপিক
                    </label>
                    <select
                      id={`subject-${subject.id}-subtopic`}
                      value={subtopicPath}
                      disabled={!topicPath || subTopicOptions.length === 0}
                      onChange={(e) => handleSubtopicChange(subject, topicPath, e.target.value)}
                      className="w-full rounded-xl px-3 py-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--dashboard-primary)] disabled:opacity-40 disabled:cursor-not-allowed"
                      style={{
                        background: "var(--dashboard-surface-muted)",
                        border: "1px solid var(--dashboard-border-muted)",
                        color: "var(--dashboard-text-primary)",
                      }}
                    >
                      <option value="">সব সাবটপিক</option>
                      {subTopicOptions.map((node) => (
                        <option key={node.path} value={node.path}>
                          {node.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Per-subject question count */}
                <div className="mt-4 pt-4 border-t border-[var(--dashboard-border-muted)] flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-mono" style={{ color: "var(--dashboard-text-secondary)" }}>এই বিষয় থেকে প্রশ্ন</p>
                    <p className="text-[10px] font-mono" style={{ color: "var(--dashboard-text-muted)" }}>
                      উপলব্ধ: <span style={{ color: "var(--dashboard-primary)" }}>{available}টি</span>
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setSubjectCount(subject, (sel?.count ?? 0) - 1)}
                      aria-label="বিষয়ের প্রশ্ন কমান"
                      className="w-8 h-8 rounded-lg bg-[var(--surface-raised)] border border-[var(--accent)]/20 flex items-center justify-center text-[var(--dashboard-primary)] hover:border-[var(--accent)]/40"
                    >
                      <Minus className="w-4 h-4" />
                    </button>
                    <input
                      type="number"
                      min={0}
                      max={available}
                      value={sel?.count ?? 0}
                      onChange={(e) => setSubjectCount(subject, Number(e.target.value))}
                      aria-label={`${subject.nameBn} এর প্রশ্ন সংখ্যা`}
                      className="w-16 text-center bg-[var(--surface-raised)] border border-[var(--accent)]/20 rounded-lg py-2 text-[var(--dashboard-primary)] font-mono text-sm focus:outline-none focus:border-[var(--accent)]/50 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                    />
                    <button
                      type="button"
                      onClick={() => setSubjectCount(subject, (sel?.count ?? 0) + 1)}
                      aria-label="বিষয়ের প্রশ্ন বাড়ান"
                      className="w-8 h-8 rounded-lg bg-[var(--surface-raised)] border border-[var(--accent)]/20 flex items-center justify-center text-[var(--dashboard-primary)] hover:border-[var(--accent)]/40"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}