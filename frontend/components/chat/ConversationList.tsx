"use client"

// Shared conversation list rendered both in the desktop sidebar and the
// mobile slide-over drawer of the AI workspace.
//
// Each conversation row supports rename, pin/unpin and delete via a small
// overflow menu. Rename switches the row into an inline edit input.

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react"
import {
  BrainCircuit,
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
}

export default function ConversationList({
  conversations,
  activeConversationId,
  onOpen,
  onDelete,
  onRename,
  onPin,
  onNew,
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
        {sorted.length === 0 && (
          <p className="p-3 font-mono text-xs text-zinc-600">No conversations yet.</p>
        )}
        {sorted.map((conv) => {
          const isActive = activeConversationId === conv.id
          const isMenuOpen = menuOpenId === conv.id
          const isRenaming = renamingId === conv.id
          return (
            <div
              key={conv.id}
              className={`group relative flex cursor-pointer items-center gap-2 rounded-lg border px-2 py-2 text-sm transition-colors ${
                isActive
                  ? "border-emerald-500/25 bg-emerald-500/10"
                  : "border-transparent hover:bg-zinc-800/40"
              }`}
              onClick={() => onOpen(conv.id)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => handleRowKeyDown(e, conv.id)}
            >
              {conv.kind === "ASSISTANT" ? (
                <BrainCircuit
                  className="h-4 w-4 flex-shrink-0 text-emerald-500"
                  aria-hidden="true"
                />
              ) : (
                <MessageSquare
                  className="h-4 w-4 flex-shrink-0 text-emerald-500"
                  aria-hidden="true"
                />
              )}

              {isRenaming ? (
                <input
                  ref={renameInputRef}
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onKeyDown={handleRenameKeyDown}
                  onBlur={cancelRename}
                  onClick={(e) => e.stopPropagation()}
                  aria-label="Rename conversation"
                  className="min-w-0 flex-1 rounded border border-emerald-500/40 bg-subtle px-1.5 py-0.5 text-sm text-zinc-200 focus:outline-none"
                />
              ) : (
                <>
                  {conv.pinned && (
                    <Pin
                      className="h-3.5 w-3.5 flex-shrink-0 text-emerald-400"
                      aria-label="Pinned"
                      aria-hidden="true"
                    />
                  )}
                  <span className="min-w-0 flex-1 truncate text-zinc-300">{conv.title}</span>
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
                    className={`flex h-6 w-6 items-center justify-center rounded p-1 transition-opacity focus:opacity-100 group-hover:opacity-100 ${
                      isMenuOpen ? "opacity-100" : "opacity-0"
                    } ${isActive ? "text-emerald-300" : "text-zinc-500 hover:text-white"}`}
                    aria-label="Conversation actions"
                    aria-expanded={isMenuOpen}
                  >
                    <MoreVertical className="h-3.5 w-3.5" />
                  </button>

                  {isMenuOpen && (
                    <div
                      role="menu"
                      className="absolute right-0 top-full z-20 mt-1 w-36 overflow-hidden rounded-lg border border-emerald-500/20 bg-[var(--surface-raised)] py-1 shadow-2xl"
                    >
                      <button
                        type="button"
                        role="menuitem"
                        onClick={(e) => {
                          e.stopPropagation()
                          beginRename(conv)
                        }}
                        className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-zinc-300 transition-colors hover:bg-emerald-500/10 hover:text-emerald-300"
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
                        className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-zinc-300 transition-colors hover:bg-emerald-500/10 hover:text-emerald-300"
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
                        className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-red-400 transition-colors hover:bg-red-500/10"
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
        })}
      </div>
    </div>
  )
}
