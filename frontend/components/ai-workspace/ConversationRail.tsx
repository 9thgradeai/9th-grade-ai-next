"use client";

// Workspace conversation rail — brand mark, real client-side search over the
// loaded conversation list, then the grouped history. Used as the desktop
// sidebar and inside the mobile slide-over drawer.

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import AiLogo from "@/components/ui/AiLogo";
import ConversationList from "@/components/chat/ConversationList";
import type { AIConversationSummary } from "@/lib/services/ai/types";

type ConversationRailProps = {
  conversations: AIConversationSummary[];
  activeConversationId: string | null;
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
  onRename: (id: string, title: string) => void;
  onPin: (id: string, pinned: boolean) => void;
  onNew: () => void;
};

export default function ConversationRail({
  conversations,
  activeConversationId,
  onOpen,
  onDelete,
  onRename,
  onPin,
  onNew,
}: ConversationRailProps) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return conversations;
    return conversations.filter((c) => c.title.toLowerCase().includes(q));
  }, [conversations, query]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-[var(--dashboard-border-muted)] px-4 py-3">
        <AiLogo className="h-6 w-6 flex-shrink-0" />
        <div className="min-w-0">
          <p className="truncate font-mono text-sm font-bold tracking-tight text-[var(--text-primary)]">
            AI Workspace
          </p>
          <p className="font-mono text-[10px] tracking-[0.12em] text-[var(--dashboard-text-muted)] uppercase">
            Show, don&apos;t just tell
          </p>
        </div>
      </div>

      <div className="px-3 pb-1 pt-3">
        <label className="flex h-9 items-center gap-2 rounded-xl border border-[var(--dashboard-border-muted)] bg-[var(--dashboard-surface-solid)] px-2.5 transition-colors focus-within:border-[var(--dashboard-primary)]/60">
          <Search className="h-3.5 w-3.5 flex-shrink-0 text-[var(--dashboard-text-muted)]" aria-hidden="true" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search conversations…"
            aria-label="Search conversations"
            className="min-w-0 flex-1 bg-transparent font-mono text-xs text-[var(--dashboard-text-primary)] placeholder:text-[var(--dashboard-text-muted)] focus:outline-none"
          />
          {query && (
            <span className="font-mono text-[10px] text-[var(--dashboard-text-muted)]">
              {filtered.length}
            </span>
          )}
        </label>
      </div>

      <div className="min-h-0 flex-1">
        <ConversationList
          grouped
          conversations={filtered}
          activeConversationId={activeConversationId}
          onOpen={onOpen}
          onDelete={onDelete}
          onRename={onRename}
          onPin={onPin}
          onNew={onNew}
        />
      </div>
    </div>
  );
}