"use client"

// Shared conversation list rendered in the AI workspace rail (desktop sidebar
// and mobile drawer) and the compact history list. Each row supports rename,
// pin/unpin and delete via a small overflow menu; rename switches the row into
// an inline edit input.
//
// `grouped` toggles the workspace layout — history is split into Today /
// Yesterday / This week / Earlier sections (pinned conversations stay on top
// within each group). The default flat, pinned-first order is preserved for
// standalone consumers.

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react"
import {
  BrainCircuit,
  GraduationCap,
  MessageSquare,
  MoreVertical,
  Pencil,
  Pin,
  PinOff,
  Plus,
  Trash2,
} from "lucide-react"
import type { AIConversationSummary } from "@/lib/services/ai/types"

type ConversationListProps = {
  conversations: AIConversationSummary[]
  activeConversationId: string | null
  onOpen: (id: string) => void
  onDelete: (id: string) => void
  onRename: (id: string, title: string) => void
  onPin: (id: string, pinned: boolean) => void
  onNew: () => void
  /** Group history by day (workspace mode). Defaults to a flat pinned-first list. */
  grouped?: boolean
}

function toDayKey(date: string): string {
  const d = new Date(date)
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
}

function dayGroup(date: string): string {
  const now = new Date()
  const today = toDayKey(now.toISOString())
  const yesterdayDate = new Date(now)
  yesterdayDate.setDate(now.getDate() - 1)
  const yesterday = toDayKey(yesterdayDate.toISOString())
  const weekAgo = new Date(now)
  weekAgo.setDate(now.getDate() - 7)

  const key = toDayKey(date)
  if (key === today) return "Today"
  if (key === yesterday) return "Yesterday"
  if (new Date(key) >= new Date(toDayKey(weekAgo.toISOString()))) return "This week"
  return "Earlier"
}

function kindIcon(kind: AIConversationSummary["kind"]) {
  if (kind === "ASSISTANT") return BrainCircuit
  if (kind === "TUTOR") return GraduationCap
  return MessageSquare
}

export default function ConversationList({
  conversations,
  activeConversationId,
  onOpen,
  onDelete,
  onRename,
  onPin,
  onNew,
  grouped = false,
}: ConversationListProps) {
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState("")
  const menuRef = useRef<HTMLDivElement>(null)
  const renameInputRef = useRef<HTMLInputElement>(null)

  // Pinned conversations float to the top; otherwise keep server order.
  const sorted = useMemo(
    () =>
      [...conversations].sort((a, b) => {
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
        return 0
      }),
    [conversations]
  )

  const groups = useMemo(() => {
    if (!grouped) return null
    const sections = new Map<string, AIConversationSummary[]>()
    for (const conv of sorted) {
      const label = dayGroup(conv.updatedAt)
      const list = sections.get(label)
      if (list) list.push(conv)
      else sections.set(label, [conv])
    }
    const order = ["Today", "Yesterday", "This week", "Earlier"]
    return order
      .filter((label) => sections.has(label))
      .map((label) => ({ label, items: sections.get(label)! }))
  }, [sorted, grouped])

  // Close the overflow menu on outside click.
  useEffect(() => {
    if (!menuOpenId) return
    const onPointerDown = (e: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpenId(null)
      }
    }
    document.addEventListener("pointerdown", onPointerDown)
    return () => document.removeEventListener("pointerdown", onPointerDown)
  }, [menuOpenId])

  // Autofocus the rename input when a row enters edit mode.
  useEffect(() => {
    if (renamingId) renameInputRef.current?.select()
  }, [renamingId])

  const beginRename = (conv: AIConversationSummary) => {
    setMenuOpenId(null)
    setRenamingId(conv.id)
    setRenameValue(conv.title)
  }

  const commitRename = () => {
    const id = renamingId
    if (!id) return
    const title = renameValue.trim()
    setRenamingId(null)
    if (title) onRename(id, title)
  }

  const cancelRename = () => {
    setRenamingId(null)
  }

  const handleRenameKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault()
      commitRename()
    } else if (e.key === "Escape") {
      e.preventDefault()
      cancelRename()
    }
  }

  const handleRowKeyDown = (e: KeyboardEvent<HTMLDivElement>, id: string) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault()
      onOpen(id)
    }
  }

  const rowContent = (conv: AIConversationSummary) => {
    const isActive = activeConversationId === conv.id
    const isMenuOpen = menuOpenId === conv.id
    const isRenaming = renamingId === conv.id
    const Icon = kindIcon(conv.kind)

    return (
      <div
        key={conv.id}
        className={`group relative flex cursor-pointer items-center gap-2 rounded-xl border px-2.5 py-2 text-sm transition-colors ${
          isActive
            ? "border-[var(--dashboard-primary)]/30 bg-[var(--dashboard-primary-subtle)]"
            : "border-transparent hover:bg-[var(--dashboard-surface-hover)]"
        }`}
        onClick={() => onOpen(conv.id)}
        role="button"
        tabIndex={0}
        aria-current={isActive ? "true" : undefined}
        onKeyDown={(e) => handleRowKeyDown(e, conv.id)}
      >
        <Icon
          className="h-4 w-4 flex-shrink-0 text-[var(--dashboard-primary)]"
          aria-hidden="true"
        />

        {isRenaming ? (
          <input
            ref={renameInputRef}
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={handleRenameKeyDown}
            onBlur={cancelRename}
            onClick={(e) => e.stopPropagation()}
            aria-label="Rename conversation"
            className="min-w-0 flex-1 rounded-md border border-[var(--dashboard-primary)]/50 bg-[var(--dashboard-surface)] px-1.5 py-0.5 text-sm text-[var(--dashboard-text-primary)] focus:outline-none"
          />
        ) : (
          <>
            {conv.pinned && (
              <Pin
                className="h-3.5 w-3.5 flex-shrink-0 text-[var(--dashboard-primary)]"
                aria-label="Pinned"
                aria-hidden="true"
              />
            )}
            <span
              className={`min-w-0 flex-1 truncate ${
                isActive ? "text-[var(--dashboard-primary)]" : "text-[var(--dashboard-text-secondary)]"
              }`}
            >
              {conv.title}
            </span>
          </>
        )}

        {!isRenaming && (
          <div ref={isMenuOpen ? menuRef : undefined} className="relative flex-shrink-0">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                setMenuOpenId(isMenuOpen ? null : conv.id)
              }}
              className={`ai-icon-btn h-7 w-7 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100 focus-visible:opacity-100 ${
                isActive ? "text-[var(--dashboard-primary)]" : ""
              }`}
              aria-label="Conversation actions"
              aria-expanded={isMenuOpen}
              aria-haspopup="menu"
            >
              <MoreVertical className="h-4 w-4" />
            </button>

            {isMenuOpen && (
              <div
                role="menu"
                className="absolute right-0 top-full z-20 mt-1 w-36 overflow-hidden rounded-xl border border-[var(--dashboard-border-muted)] bg-[var(--dashboard-surface-raised)] py-1 shadow-xl"
              >
                <button
                  type="button"
                  role="menuitem"
                  onClick={(e) => {
                    e.stopPropagation()
                    beginRename(conv)
                  }}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-[var(--dashboard-text-secondary)] transition-colors hover:bg-[var(--dashboard-primary-subtle)] hover:text-[var(--dashboard-primary)]"
                >
                  <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                  Rename
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={(e) => {
                    e.stopPropagation()
                    setMenuOpenId(null)
                    onPin(conv.id, !conv.pinned)
                  }}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-[var(--dashboard-text-secondary)] transition-colors hover:bg-[var(--dashboard-primary-subtle)] hover:text-[var(--dashboard-primary)]"
                >
                  {conv.pinned ? (
                    <PinOff className="h-3.5 w-3.5" aria-hidden="true" />
                  ) : (
                    <Pin className="h-3.5 w-3.5" aria-hidden="true" />
                  )}
                  {conv.pinned ? "Unpin" : "Pin"}
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={(e) => {
                    e.stopPropagation()
                    setMenuOpenId(null)
                    onDelete(conv.id)
                  }}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-[var(--dashboard-danger)] transition-colors hover:bg-[var(--dashboard-danger-soft)]"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  Delete
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-3 pb-1 pt-3">
        <span className="font-mono text-[10px] tracking-[0.16em] text-[var(--dashboard-text-muted)] uppercase">
          Conversations
        </span>
        <button
          type="button"
          onClick={onNew}
          className="ai-icon-btn h-8 w-8"
          aria-label="New conversation"
          title="New conversation"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>
      <div className="flex-1 space-y-1 overflow-y-auto p-2">
        {sorted.length === 0 && (
          <p className="px-2 py-2 font-mono text-xs text-[var(--dashboard-text-muted)]">
            No conversations yet.
          </p>
        )}

        {grouped && groups
          ? groups.map((section) => (
              <div key={section.label} className="mb-1">
                <p className="px-2 pb-0.5 pt-2 font-mono text-[10px] tracking-[0.14em] text-[var(--dashboard-text-muted)] uppercase">
                  {section.label}
                </p>
                <div className="space-y-1">{section.items.map(rowContent)}</div>
              </div>
            ))
          : sorted.map(rowContent)}
      </div>
    </div>
  )
}