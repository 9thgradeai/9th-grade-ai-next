"use client";

// The conversation thread — an aria-live transcript of user rows and AI rows
// (prose, suggested actions, coach cards, metadata). Rows stream in the same
// DOM frame they resolve into; only the actively streaming row re-renders
// thanks to memoized ChatMessage rows.

import type { RefObject } from "react";
import ChatMessage, { TypingIndicator, type ChatMessageData } from "@/components/chat/ChatMessage";
import AgentBlocks from "@/components/dashboard/ai/AgentBlocks";
import AiLogo from "@/components/ui/AiLogo";
import type { Status, UIMessage, WorkspaceMeta } from "./types";

type ThreadViewProps = {
  messages: UIMessage[];
  status: Status;
  meta: WorkspaceMeta;
  copiedId: string | null;
  feedbackSent: ReadonlySet<string>;
  terminalRef: RefObject<HTMLDivElement | null>;
  onCopy: (id: string, text: string) => void;
  onFeedback: (messageId: string | undefined, rating: "HELPFUL" | "NOT_HELPFUL") => void;
  onQuickPrompt: (prompt: string) => void;
  onBlocksAction: () => void;
};

export default function ThreadView({
  messages,
  status,
  meta,
  copiedId,
  feedbackSent,
  terminalRef,
  onCopy,
  onFeedback,
  onQuickPrompt,
  onBlocksAction,
}: ThreadViewProps) {
  const last = messages[messages.length - 1];
  const showThinkingRow =
    status === "generating" && (messages.length === 0 || last.role !== "ai" || last.text !== "");

  const lastAiIndex = messages.map((m) => m.role).lastIndexOf("ai");
  const showMeta =
    meta && lastAiIndex === messages.length - 1 && status !== "generating" && last.text !== "";

  return (
    <div ref={terminalRef} role="log" aria-live="polite" className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto max-w-3xl space-y-5 px-3 py-4 sm:px-6 sm:py-5">
        {messages.map((msg, i) => {
          const isLast = i === messages.length - 1;
          const isStreaming = status === "generating" && isLast && msg.role === "ai";
          return (
            <div key={msg.id} className={!isStreaming && isLast ? "ai-msg-enter" : undefined}>
              <ChatMessage
                message={msg as ChatMessageData}
                streaming={isStreaming}
                copied={copiedId === msg.id}
                feedbackSent={feedbackSent.has(msg.messageId ?? "")}
                onCopy={onCopy}
                onFeedback={onFeedback}
                onAction={onQuickPrompt}
              />
              {msg.blocks && msg.blocks.length > 0 && (
                <AgentBlocks blocks={msg.blocks} onAction={onBlocksAction} />
              )}
            </div>
          );
        })}

        {showThinkingRow && (
          <div className="flex items-start gap-3">
            <div className="ai-avatar h-8 w-8">
              <AiLogo solid={false} className="h-4 w-4" />
            </div>
            <TypingIndicator />
          </div>
        )}

        {showMeta && (
          <p className="px-1 font-mono text-[10px] tracking-[0.12em] text-[var(--dashboard-text-muted)]">
            source: <span className="text-[var(--dashboard-primary)]">{meta.provider ?? "unset"}</span>
            {meta.model ? ` · ${meta.model}` : ""}
            {meta.provider === "mock" ? "  (সেট করা API কী নেই — গণনা ও তথ্য যাচাই করুন)" : ""}
          </p>
        )}
      </div>
    </div>
  );
}