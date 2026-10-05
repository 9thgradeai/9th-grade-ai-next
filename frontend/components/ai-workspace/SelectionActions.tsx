"use client";

import { useCallback } from "react";
import { Lightbulb, Question, Sparkle } from "@phosphor-icons/react";
import { launchAI } from "@/lib/ai-launcher";
import { selectionPrompt, type SelectionAction } from "@/lib/ai-orchestrator";

/**
 * Phase 2 selection-anchored actions — floating Explain / Quiz-me / Simplify
 * on any text selection. Routes into the single AI orchestrator (tutor mode,
 * Socratic) instead of six bespoke entry points.
 */
export default function SelectionActions() {
  const run = useCallback((action: SelectionAction) => {
    const sel = window.getSelection()?.toString().trim();
    if (!sel) return;
    launchAI({ mode: "tutor", prompt: selectionPrompt(action, sel) });
  }, []);

  return (
    <div
      className="selection-actions ambient-glass fixed z-[var(--z-sticky)] hidden items-center gap-1 rounded-xl border p-1 shadow-lg"
      style={{ borderColor: "var(--dashboard-border-muted)" }}
      data-selection-actions
      role="toolbar"
      aria-label="AI actions for selection"
    >
      <button type="button" onClick={() => run("explain")} className="command-dock-btn !min-h-[40px] px-3" title="Explain step by step">
        <Lightbulb className="h-4 w-4" /> Explain
      </button>
      <button type="button" onClick={() => run("quiz-me")} className="command-dock-btn !min-h-[40px] px-3" title="Make MCQs from selection">
        <Question className="h-4 w-4" /> Quiz me
      </button>
      <button type="button" onClick={() => run("simplify")} className="command-dock-btn !min-h-[40px] px-3" title="Simplify in Bangla">
        <Sparkle className="h-4 w-4" /> Simplify
      </button>
    </div>
  );
}
