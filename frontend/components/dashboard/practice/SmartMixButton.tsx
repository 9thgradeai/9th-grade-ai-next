"use client";

import { useState } from "react";
import { LightningA } from "@phosphor-icons/react";
import { api } from "@/lib/services/api";
import type { Server } from "@/lib/types";
import { flattenNodes, type Selection } from "../TopicTreePicker";

/**
 * SmartMixButton, "AI weak-topic mix" preset.
 * Pulls /api/weak-topics, maps the weakest entries onto the exam
 * subject tree, and hands a ready Selection back to the parent.
 */
export default function SmartMixButton({
  subjects,
  totalQuestions = 20,
  onApply,
}: {
  subjects: Server.ExamSubjectDTO[];
  totalQuestions?: number;
  onApply: (selection: Selection) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [applied, setApplied] = useState(false);

  const apply = async () => {
    setLoading(true);
    setError(null);
    try {
      const weak = await api.weakTopics();
      if (!weak || weak.length === 0) {
        setError("দুর্বল টপিক পাওয়া যায়নি, আগে কিছু প্র্যাকটিস করুন।");
        return;
      }
      const top = weak.slice(0, 3);
      const per = Math.max(3, Math.floor(totalQuestions / Math.max(1, top.length)));
      const next: Selection = {};
      for (const w of top) {
        const subj =
          subjects.find((s) => s.nameBn === w.subject) ??
          subjects.find((s) => (s.nameEn ?? "").toLowerCase() === w.subject.toLowerCase());
        if (!subj) continue;
        const leaves = flattenNodes(subj.nodes).filter((n) => n.children.length === 0);
        const match =
          leaves.find((l) => l.path.includes(w.topic)) ??
          leaves.find((l) => w.topic.includes(l.path.split("/").pop() ?? ""));
        const paths = match ? [match.path] : [];
        next[subj.id] = {
          paths,
          count: Math.min(subj.questionCount, per),
        };
      }
      if (Object.keys(next).length === 0) {
        setError("দুর্বল টপিক এই সিলেবাসে মেলেনি।");
        return;
      }
      onApply(next);
      setApplied(true);
    } catch {
      setError("স্মার্ট মিক্স লোড করা যায়নি। আবার চেষ্টা করুন।");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <button
        type="button"
        onClick={() => void apply()}
        disabled={loading || subjects.length === 0}
        className="inline-flex items-center gap-2 min-h-[44px] px-4 rounded-xl border font-mono text-xs font-bold cursor-pointer transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--dashboard-focus-ring)]"
        style={{
          borderColor: "color-mix(in srgb, var(--dashboard-primary) 40%, transparent)",
          background: "var(--dashboard-primary-subtle)",
          color: "var(--dashboard-primary)",
        }}
      >
        <LightningA className="w-4 h-4" aria-hidden="true" />
        {loading ? "বিশ্লেষণ চলছে..." : applied ? "স্মার্ট মিক্স প্রয়োগ হয়েছে ✓" : "স্মার্ট মিক্স (AI দুর্বল টপিক)"}
      </button>
      {error && (
        <p className="text-[11px] font-mono mt-1.5" style={{ color: "var(--dashboard-warning)" }} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
