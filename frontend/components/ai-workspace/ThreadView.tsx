"use client";

// The conversation thread — an aria-live transcript of user rows and AI rows
// (prose, suggested actions, coach cards, metadata). Rows stream in the same
// DOM frame they resolve into; only the actively streaming row re-renders
// thanks to memoized ChatMessage rows.

import type { RefObject } from "react";
import ChatMessage, { TypingIndicator, type ChatMessageData } from "@/components/chat/ChatMessage";
import AgentBlocks from "@/components/dashboard/ai/AgentBlocks";
import AiLogo from "@/components/ui/AiLogo";
import AgentActivityTimeline from "./AgentActivityTimeline";
import type { AgentActivityStepDto, Mode, Status, UIMessage, WorkspaceMeta } from "./types";

type ThreadViewProps = {
  messages: UIMessage[];
  status: Status;
  meta: WorkspaceMeta;
  mode: Mode;
  /** Live coach tool steps streaming from the current agent turn. */
  liveTools: AgentActivityStepDto[];
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
  liveTools,
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
  const lastAi = lastAiIndex >= 0 ? messages[lastAiIndex] : null;
  const showMeta =
    meta && lastAiIndex === messages.length - 1 && status !== "generating" && last.text !== "";

  // Production guard: structured coach turns stream as a raw JSON blocks
  // array mid-flight. Never paint that payload as chat prose — collapse it
  // to the typing indicator until the typed cards resolve.
  const isBlocksPayload = (text: string): boolean => {
    const trimmed = text.trim();
    if (!trimmed) return false;
    if (trimmed.startsWith("[") || trimmed.startsWith("{")) return true;
    const start = trimmed.indexOf("[");
    const end = trimmed.lastIndexOf("]");
    if (start === -1 || end <= start) return false;
    try {
      JSON.parse(trimmed.slice(start, end + 1));
      return true;
    } catch {
      return false;
    }
  };

  return (
    <div ref={terminalRef} role="log" aria-live="polite" className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto max-w-3xl space-y-5 px-3 py-4 sm:px-6 sm:py-5">
        {messages.map((msg, i) => {
          const isLast = i === messages.length - 1;
          const isStreaming = status === "generating" && isLast && msg.role === "ai";
          const visible = isStreaming && isBlocksPayload(msg.text) ? { ...msg, text: "" } : msg;
          return (
            <div key={msg.id} className={!isStreaming && isLast ? "ai-msg-enter" : undefined}>
              <ChatMessage
                message={visible as ChatMessageData}
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
              {msg.tools && msg.tools.length > 0 && (
                <AgentActivityTimeline tools={msg.tools} />
              )}
              {isStreaming && liveTools.length > 0 && (
                <AgentActivityTimeline tools={liveTools} />
              )}
            </div>
          );
        })}

        {showThinkingRow && (
          <div className="flex items-start gap-3">
            <div className="ai-avatar aurora-glow h-8 w-8">
              <AiLogo solid={false} className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <TypingIndicator />
              {liveTools.length > 0 && <AgentActivityTimeline tools={liveTools} className="mt-2.5" />}
            </div>
          </div>
        )}

        {showMeta && (
          <p className="break-words px-1 font-mono text-[10px] leading-relaxed tracking-[0.12em] text-[var(--dashboard-text-muted)]">
            {meta.provider === "mock"
              ? "demo source — set an AI key to go live (verify counts)"
              : `AI guidance · ${lastAi?.tools?.length ?? 0} tools · verify with the question bank`}
          </p>
        )}
      </div>
    </div>
  );
}