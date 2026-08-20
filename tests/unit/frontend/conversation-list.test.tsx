import { describe, it, expect, vi } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import ConversationList from "@/components/chat/ConversationList"
import type { AIConversationSummary } from "@/lib/services/ai/types"

function makeConv(
  overrides: Partial<AIConversationSummary> & { id: string }
): AIConversationSummary {
  return {
    kind: "TUTOR",
    title: "Title",
    pinned: false,
    subjectId: null,
    topicId: null,
    topicPath: "",
    messageCount: 0,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  }
}

const defaultProps = {
  conversations: [
    makeConv({ id: "c1", title: "প্রথম" }),
    makeConv({ id: "c2", title: "দ্বিতীয়", pinned: true }),
  ],
  activeConversationId: null,
  onOpen: vi.fn(),
  onDelete: vi.fn(),
  onRename: vi.fn(),
  onPin: vi.fn(),
  onNew: vi.fn(),
}

describe("ConversationList", () => {
  it("renders conversation titles", () => {
    render(<ConversationList {...defaultProps} />)
    expect(screen.getByText("প্রথম")).toBeInTheDocument()
    expect(screen.getByText("দ্বিতীয়")).toBeInTheDocument()
  })

  it("sorts pinned conversations first", () => {
    render(<ConversationList {...defaultProps} />)
    const rows = screen.getAllByRole("button", { name: "Conversation actions" })
    expect(rows[0].closest("div")?.parentElement?.textContent).toContain("দ্বিতীয়")
  })

  it("renames a conversation inline", () => {
    render(<ConversationList {...defaultProps} />)
    fireEvent.click(screen.getAllByLabelText("Conversation actions")[1])
    fireEvent.click(screen.getByText("Rename"))
    const input = screen.getByLabelText("Rename conversation")
    fireEvent.change(input, { target: { value: "নতুন" } })
    fireEvent.keyDown(input, { key: "Enter" })
    expect(defaultProps.onRename).toHaveBeenCalledWith("c1", "নতুন")
  })

  it("pins and unpins a conversation", () => {
    render(<ConversationList {...defaultProps} />)
    // First row is the pinned c2 → shows Unpin.
    fireEvent.click(screen.getAllByLabelText("Conversation actions")[0])
    fireEvent.click(screen.getByText("Unpin"))
    expect(defaultProps.onPin).toHaveBeenCalledWith("c2", false)
    // Second row is the unpinned c1 → shows Pin.
    fireEvent.click(screen.getAllByLabelText("Conversation actions")[1])
    fireEvent.click(screen.getByText("Pin"))
    expect(defaultProps.onPin).toHaveBeenCalledWith("c1", true)
  })

  it("deletes a conversation", () => {
    render(<ConversationList {...defaultProps} />)
    fireEvent.click(screen.getAllByLabelText("Conversation actions")[1])
    fireEvent.click(screen.getByText("Delete"))
    expect(defaultProps.onDelete).toHaveBeenCalledWith("c1")
  })
})
