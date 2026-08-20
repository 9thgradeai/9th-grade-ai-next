"use client";

// Shared conversation list rendered both in the desktop sidebar and the
// mobile slide-over drawer of the AI workspace.

import { BrainCircuit, MessageSquare, Plus, Trash2 } from "lucide-react";
import type { AIConversationSummary } from "@/lib/services/ai/types";

type ConversationListProps = {
  conversations: AIConversationSummary[];
  activeConversationId: string | null;
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
  onNew: () => void;
};

export default function ConversationList({
  conversations,
  activeConversationId,
  onOpen,
  onDelete,
  onNew,
}: ConversationListProps) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-emerald-500/10 p-3">
        <span className="font-mono text-[11px] tracking-wider text-zinc-500">CONVERSATIONS</span>
        <button
          type="button"
          onClick={onNew}
          className="flex h-7 w-7 items-center justify-center rounded-lg border border-emerald-500/20 text-emerald-400 transition-colors hover:bg-emerald-500/10"
          aria-label="New conversation"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>
      <div className="flex-1 space-y-1 overflow-y-auto p-2">
        {conversations.length === 0 && (
          <p className="p-3 font-mono text-xs text-zinc-600">No conversations yet.</p>
        )}
        {conversations.map((conv) => (
          <div
            key={conv.id}
            className={`group flex cursor-pointer items-center gap-2 rounded-lg border px-2 py-2 text-sm transition-colors ${
              activeConversationId === conv.id
                ? "border-emerald-500/25 bg-emerald-500/10"
                : "border-transparent hover:bg-zinc-800/40"
            }`}
            onClick={() => onOpen(conv.id)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onOpen(conv.id);
              }
            }}
          >
            {conv.kind === "ASSISTANT" ? (
              <BrainCircuit className="h-4 w-4 flex-shrink-0 text-emerald-500" aria-hidden="true" />
            ) : (
              <MessageSquare className="h-4 w-4 flex-shrink-0 text-emerald-500" aria-hidden="true" />
            )}
            <span className="min-w-0 flex-1 truncate text-zinc-300">{conv.title}</span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onDelete(conv.id);
              }}
              className="flex h-6 w-6 items-center justify-center rounded p-1 text-zinc-500 opacity-0 transition-opacity hover:text-red-400 focus:opacity-100 group-hover:opacity-100"
              aria-label="Delete conversation"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}