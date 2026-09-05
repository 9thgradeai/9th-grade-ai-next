"use client";

// Typed renderer for the AI study coach's structured blocks. Each block kind
// renders as a native insight card (progress, weakness, recommendation,
// practice / revision / exam action). Action chips execute allowlisted UI
// actions: switching dashboard tabs, opening the question bank filtered to a
// question, or refreshing the home feed. The leading text block is omitted
// here — the chat bubble already renders it as prose.

import { useMemo } from "react";
import { motion } from "framer-motion";
import { ArrowRight, TrendingUp, Target, FileQuestion, BookOpen, ListChecks, AlertTriangle } from "lucide-react";
import { useDashboardStore } from "@/lib/store-ctx/dashboard";
import type { TabId } from "@/lib/data";
import type { AgentActionDto, AgentBlockDto } from "@/lib/types";

const TABS: TabId[] = [
  "home",
  "study-planner",
  "practice",
  "flashcards",
  "question-bank",
  "progress",
  "mistakes",
  "settings",
];

function actionToTab(action: AgentActionDto): TabId | null {
  switch (action.type) {
    case "practice":
    case "mock_exam":
      return "practice";
    case "revision":
      return "flashcards";
    case "open_study_plan":
      return "study-planner";
    case "open_wrong_answers":
      return "mistakes";
    case "open_tab": {
      const target = action.params?.target as string | undefined;
      return target && TABS.includes(target as TabId) ? (target as TabId) : "home";
    }
    default:
      return null;
  }
}

function useBlockDispatcher(onClose?: () => void) {
  const setActiveTab = useDashboardStore((s) => s.setActiveTab);
  return useMemo(() => {
    const dispatch = (action: AgentActionDto) => {
      if (action.type === "refresh") {
        window.dispatchEvent(new CustomEvent("ai:refresh-home"));
        onClose?.();
        return;
      }
      if (action.type === "open_question") {
        const qid = action.params?.questionId as number | undefined;
        setActiveTab("question-bank");
        if (qid) {
          window.dispatchEvent(new CustomEvent("ai:open-question", { detail: { questionId: qid } }));
        }
        onClose?.();
        return;
      }
      // Practice / mock-exam actions that carry a concrete, server-minted
      // question set launch the drill overlay directly instead of merely
      // switching tabs (the LLM never picks the questions — the session
      // tools injected the ids, see backend/ai/agent/response.ts).
      if (action.type === "practice" || action.type === "mock_exam") {
        const ids = Array.isArray(action.params?.questionIds)
          ? (action.params.questionIds as unknown[]).filter((v): v is number => typeof v === "number")
          : [];
        if (ids.length > 0) {
          window.dispatchEvent(
            new CustomEvent("ai:start-practice", {
              detail: { questionIds: ids, title: action.label },
            }),
          );
          onClose?.();
          return;
        }
      }
      const tab = actionToTab(action);
      if (tab) {
        setActiveTab(tab);
        onClose?.();
      }
    };
    return dispatch;
  }, [setActiveTab, onClose]);
}

function ActionChips({ actions, onDispatch }: { actions?: AgentActionDto[]; onDispatch: (a: AgentActionDto) => void }) {
  if (!actions || actions.length === 0) return null;
  return (
    <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
      {actions.map((a, i) => (
        <button
          key={`${a.type}-${i}`}
          type="button"
          onClick={() => onDispatch(a)}
          className="ai-chip group"
        >
          {a.label}
          <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
        </button>
      ))}
    </div>
  );
}

const CARD =
  "rounded-xl border border-[var(--dashboard-border-muted)] bg-[var(--dashboard-surface-muted)]/80 p-3.5 text-left shadow-sm";

function BlockCard({ block, onDispatch }: { block: AgentBlockDto; onDispatch: (a: AgentActionDto) => void }) {
  switch (block.type) {
    case "progress":
      return (
        <div className={CARD}>
          <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--dashboard-text-muted)]">
            <TrendingUp className="h-3.5 w-3.5 text-[var(--dashboard-primary)]" aria-hidden="true" />
            Progress
          </div>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-sm">
            <span className="font-mono text-base font-bold text-[var(--dashboard-primary)]">{Math.round(block.accuracy)}%</span>
            <span className="text-[var(--dashboard-text-secondary)]">
              streak <b className="text-[var(--dashboard-text-primary)]">{block.streak}</b> · questions{" "}
              <b className="text-[var(--dashboard-text-primary)]">{block.questionsAnswered}</b>
            </span>
          </div>
          <ActionChips actions={block.actions} onDispatch={onDispatch} />
        </div>
      );
    case "weakness":
      return (
        <div className={CARD}>
          <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--dashboard-danger)]">
            <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
            Weakness
          </div>
          <p className="text-sm font-semibold text-[var(--text-primary)]">
            {block.topic} <span className="font-normal text-[var(--dashboard-text-muted)]">· {block.subject}</span>
          </p>
          <p className="mt-0.5 font-mono text-xs text-[var(--dashboard-text-muted)]">
            accuracy {Math.round(block.accuracy)}% · {block.attempts} attempts · {block.wrongCount} wrong
          </p>
          {block.advice ? <p className="mt-1.5 text-sm text-[var(--dashboard-text-secondary)]">{block.advice}</p> : null}
          <ActionChips actions={block.actions} onDispatch={onDispatch} />
        </div>
      );
    case "study_recommendation":
      return (
        <div className={CARD}>
          <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--dashboard-primary)]">
            <Target className="h-3.5 w-3.5" aria-hidden="true" />
            Recommended next step
          </div>
          <p className="text-sm font-semibold text-[var(--text-primary)]">{block.title}</p>
          <p className="mt-1 text-sm text-[var(--dashboard-text-secondary)]">{block.reason}</p>
          <ActionChips actions={block.actions} onDispatch={onDispatch} />
        </div>
      );
    case "practice_action":
      return (
        <div className={CARD}>
          <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--dashboard-primary)]">
            <FileQuestion className="h-3.5 w-3.5" aria-hidden="true" />
            Practice
            {block.questionCount ? (
              <span className="ml-auto font-mono font-normal text-[var(--dashboard-text-muted)]">{block.questionCount} q</span>
            ) : null}
          </div>
          <p className="mt-1 text-sm text-[var(--dashboard-text-secondary)]">{block.label}</p>
          <ActionChips actions={block.actions} onDispatch={onDispatch} />
        </div>
      );
    case "revision_action":
      return (
        <div className={CARD}>
          <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--dashboard-primary)]">
            <BookOpen className="h-3.5 w-3.5" aria-hidden="true" />
            Revision
          </div>
          <p className="mt-1 text-sm text-[var(--dashboard-text-secondary)]">{block.label}</p>
          <ActionChips actions={block.actions} onDispatch={onDispatch} />
        </div>
      );
    case "exam_action":
      return (
        <div className={CARD}>
          <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--dashboard-primary)]">
            <ListChecks className="h-3.5 w-3.5" aria-hidden="true" />
            Mock exam
          </div>
          <p className="mt-1 text-sm text-[var(--dashboard-text-secondary)]">{block.label}</p>
          <ActionChips actions={block.actions} onDispatch={onDispatch} />
        </div>
      );
    default:
      return null;
  }
}

/** Render a validated agent response's cards; the leading text block is omitted (shown as chat prose). */
export default function AgentBlocks({ blocks, onAction }: { blocks: AgentBlockDto[]; onAction?: (clicked?: boolean) => void }) {
  const dispatch = useBlockDispatcher(onAction ? () => onAction(true) : undefined);
  const cards = blocks.filter((b) => b.type !== "text");
  return (
    <div className="mt-2.5 space-y-2.5">
      {cards.map((block, i) => (
        <motion.div
          key={`${block.type}-${i}`}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 140, damping: 18, delay: i * 0.04 }}
        >
          <BlockCard block={block} onDispatch={dispatch} />
        </motion.div>
      ))}
    </div>
  );
}