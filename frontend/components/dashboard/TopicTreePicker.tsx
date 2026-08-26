"use client";

import { Check, Minus, Plus } from "lucide-react";
import { motion } from "framer-motion";
import type { Server } from "@/lib/types";

// ── Selection types (shared by custom exam, mock test and quick practice) ──
export type SubjectSelection = { paths: string[]; count?: number };
export type Selection = Record<number, SubjectSelection>;

// Depth-first lookup of a node in the recursive selection tree.
export function findNodeByPath(
  nodes: Server.ExamSelectionNodeDTO[],
  path: string,
): Server.ExamSelectionNodeDTO | null {
  for (const n of nodes) {
    if (n.path === path) return n;
    const found = findNodeByPath(n.children, path);
    if (found) return found;
  }
  return null;
}

export function flattenNodes(nodes: Server.ExamSelectionNodeDTO[]): Server.ExamSelectionNodeDTO[] {
  return nodes.flatMap((n) => [n, ...flattenNodes(n.children)]);
}

// Exact number of questions covered under a node by the current selection —
// the union of every selected node's subtree (no double counting when a parent
// and child are both selected, since a selected node short-circuits to its
// whole aggregated count). Matches the server-side eligibility.
export function subtreeCoveredCount(
  node: Server.ExamSelectionNodeDTO,
  selectedPaths: string[],
): number {
  if (selectedPaths.includes(node.path)) return node.questionCount;
  if (node.children.length === 0) return 0;
  return node.children.reduce((acc, c) => acc + subtreeCoveredCount(c, selectedPaths), 0);
}

export function subtreeHasSelected(
  node: Server.ExamSelectionNodeDTO,
  selectedPaths: string[],
): boolean {
  if (selectedPaths.includes(node.path)) return true;
  return node.children.some((c) => subtreeHasSelected(c, selectedPaths));
}

// Questions available within the current path selection for one subject.
export function availableForSubject(
  subject: Server.ExamSubjectDTO,
  selection: Selection,
): number {
  const sel = selection[subject.id];
  if (!sel) return 0;
  if (sel.paths.length === 0) return subject.questionCount;
  return subject.nodes.reduce((acc, n) => acc + subtreeCoveredCount(n, sel.paths), 0);
}

// Build the API payload from the current selection.
export function buildExamSelectionRequest(
  subjects: Server.ExamSubjectDTO[],
  selection: Selection,
  totalCount: number,
  durationSec: number,
): Server.ExamSelectionRequest {
  return {
    subjects: subjects
      .filter((s) => selection[s.id] !== undefined)
      .map((s) => ({
        subjectId: s.id,
        paths: selection[s.id].paths,
        count: selection[s.id].count ?? 0,
      })),
    questionCount: totalCount,
    durationSec,
  };
}

// ── Recursive topic-tree row ──────────────────────────────
// Checkbox + name + aggregated count. A node's children expand when the node
// itself (or any descendant) is selected, so the dashboard mirrors the
// taxonomy at any depth.
function TopicNodeRow({
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
          selected ? "border-emerald-500/30 bg-emerald-500/5" : "border-transparent hover:border-zinc-800"
        }`}
        style={{ marginLeft: (depth - 1) * 16 }}
      >
        <button
          onClick={() => onToggle(node)}
          role="checkbox"
          aria-checked={selected}
          aria-label={`${node.name} (${node.questionCount}টি প্রশ্ন)`}
          className={`w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center ${
            selected ? "bg-emerald-500 border-emerald-500" : "border-zinc-600"
          }`}
        >
          {selected && <Check className="w-3 h-3 text-zinc-950" />}
        </button>
        <button onClick={() => onToggle(node)} className="flex-1 text-left min-w-0">
          <span className="text-xs font-medium text-white break-words">{node.name}</span>
          <span className="block text-[10px] text-zinc-500 font-mono">{node.questionCount}টি প্রশ্ন</span>
        </button>
      </div>
      {expanded && node.children.length > 0 && (
        <div className="mt-1 space-y-1">
          {node.children.map((child) => (
            <TopicNodeRow
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

// ── Shared subject → topic → subtopic picker ──────────────
// Controlled: selection lives in the parent so custom exam, mock test and
// quick practice can all drive their own runners from the same component.
export default function TopicTreePicker({
  subjects,
  selection,
  onSelectionChange,
}: {
  subjects: Server.ExamSubjectDTO[];
  selection: Selection;
  onSelectionChange: (selection: Selection) => void;
}) {
  const toggleSubject = (subject: Server.ExamSubjectDTO) => {
    const next = { ...selection };
    if (next[subject.id]) {
      delete next[subject.id];
    } else {
      next[subject.id] = { paths: [], count: Math.min(subject.questionCount, 10) };
    }
    onSelectionChange(next);
  };

  const toggleWholeSubject = (subject: Server.ExamSubjectDTO) => {
    const next = { ...selection };
    next[subject.id] = {
      paths: [],
      count: selection[subject.id]?.count ?? Math.min(subject.questionCount, 10),
    };
    onSelectionChange(next);
  };

  // Toggling a node keeps the selection clean: selecting a node removes any
  // selected descendants (it covers them) and any selected ancestors (it
  // narrows them). Empty paths means the whole subject.
  const toggleNode = (subject: Server.ExamSubjectDTO, node: Server.ExamSelectionNodeDTO) => {
    const existing = selection[subject.id] ?? { paths: [] as string[] };
    const isSelected = existing.paths.includes(node.path);
    let paths: string[];
    if (isSelected) {
      paths = existing.paths.filter((p) => p !== node.path && !p.startsWith(node.path + "/"));
    } else {
      paths = [
        ...existing.paths.filter(
          (p) => p !== node.path && !p.startsWith(node.path + "/") && !node.path.startsWith(p + "/"),
        ),
        node.path,
      ];
    }
    onSelectionChange({ ...selection, [subject.id]: { ...existing, paths } });
  };

  const setSubjectCount = (subject: Server.ExamSubjectDTO, value: number) => {
    const max = availableForSubject(subject, selection);
    const clamped = Math.min(Math.max(0, Math.floor(value)), max);
    const existing = selection[subject.id];
    if (!existing) return;
    onSelectionChange({ ...selection, [subject.id]: { ...existing, count: clamped } });
  };

  const selectedSubjects = subjects.filter((s) => selection[s.id] !== undefined);

  return (
    <div className="space-y-6">
      {/* Subject multi-select */}
      <div>
        <p className="text-xs text-zinc-500 font-mono uppercase tracking-widest mb-2">
          ১. বিষয় নির্বাচন করুন
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {subjects.map((subject, i) => {
            const selected = selection[subject.id] !== undefined;
            return (
              <motion.button
                key={subject.id}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: i * 0.03 }}
                whileHover={{ y: -2 }}
                onClick={() => toggleSubject(subject)}
                className={`glass-card rounded-2xl border p-3 text-left transition-all ${
                  selected
                    ? "border-emerald-500/40 bg-emerald-500/10 shadow-neon-glow"
                    : "border-terminal-border hover:border-emerald-500/20"
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className={`w-8 h-8 rounded-lg ${subject.bg} flex items-center justify-center text-base flex-shrink-0`}>
                    {subject.icon}
                  </span>
                  <span className={`text-[11px] font-mono leading-tight line-clamp-2 ${subject.color}`}>
                    {subject.nameBn}
                  </span>
                  <span
                    className={`ml-auto w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center ${
                      selected ? "bg-emerald-500 border-emerald-500" : "border-zinc-600"
                    }`}
                  >
                    {selected && <Check className="w-3 h-3 text-zinc-950" />}
                  </span>
                </div>
                <p className="text-[10px] text-zinc-500 font-mono mt-1.5">
                  {subject.questionCount}টি প্রশ্ন
                </p>
              </motion.button>
            );
          })}
        </div>
      </div>

      {/* Topic / subtopic drill-down per selected subject */}
      <motion.div layout className="space-y-4">
        {selectedSubjects.map((subject) => {
          const sel = selection[subject.id];
          const allSelected = sel.paths.length === 0;
          return (
            <motion.div
              key={subject.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              layout
              className="glass-card rounded-2xl border border-emerald-500/20 p-4 md:p-5"
            >
              <div className="flex items-center justify-between gap-3 mb-3">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-lg">{subject.icon}</span>
                  <h3 className="text-sm font-semibold text-white truncate">{subject.nameBn}</h3>
                </div>
                <button
                  onClick={() => toggleWholeSubject(subject)}
                  className={`px-2.5 py-1 rounded-lg text-[10px] font-mono border transition-colors flex-shrink-0 ${
                    allSelected
                      ? "bg-emerald-500 text-zinc-950 border-emerald-500"
                      : "border-zinc-700 text-zinc-400 hover:border-emerald-500/40"
                  }`}
                >
                  {allSelected ? "পুরো বিষয় ✓" : "সব টপিক নির্বাচন"}
                </button>
              </div>

              {allSelected ? (
                <p className="text-xs text-zinc-500 font-mono mb-3">
                  বিষয়ের সব টপিক নির্বাচিত — {subject.questionCount}টি প্রশ্ন
                </p>
              ) : null}

              <div className="space-y-1.5">
                {subject.nodes.map((node) => (
                  <TopicNodeRow
                    key={node.path}
                    node={node}
                    depth={1}
                    selectedPaths={sel.paths}
                    onToggle={(n) => toggleNode(subject, n)}
                  />
                ))}
              </div>

              {/* Per-subject question count */}
              <div className="mt-3 pt-3 border-t border-zinc-800 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs text-zinc-300 font-mono">এই বিষয় থেকে প্রশ্ন</p>
                  <p className="text-[10px] text-zinc-500 font-mono">
                    উপলব্ধ: <span className="text-emerald-400">{availableForSubject(subject, selection)}টি</span>
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setSubjectCount(subject, (sel.count ?? 0) - 1)}
                    className="w-8 h-8 rounded-lg bg-zinc-900 border border-emerald-500/20 flex items-center justify-center text-emerald-400 hover:border-emerald-500/40"
                    aria-label="বিষয়ের প্রশ্ন কমান"
                  >
                    <Minus className="w-4 h-4" />
                  </button>
                  <input
                    type="number"
                    min={0}
                    max={availableForSubject(subject, selection)}
                    value={sel.count ?? 0}
                    onChange={(e) => setSubjectCount(subject, Number(e.target.value))}
                    aria-label={`${subject.nameBn} এর প্রশ্ন সংখ্যা`}
                    className="w-16 text-center bg-zinc-900 border border-emerald-500/20 rounded-lg py-2 text-emerald-400 font-mono text-sm focus:outline-none focus:border-emerald-500/50 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                  />
                  <button
                    onClick={() => setSubjectCount(subject, (sel.count ?? 0) + 1)}
                    className="w-8 h-8 rounded-lg bg-zinc-900 border border-emerald-500/20 flex items-center justify-center text-emerald-400 hover:border-emerald-500/40"
                    aria-label="বিষয়ের প্রশ্ন বাড়ান"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </motion.div>
          );
        })}
      </motion.div>
    </div>
  );
}