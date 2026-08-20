import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import VoiceAITutor from "@/components/dashboard/VoiceAITutor";

vi.mock("@/lib/auth-ctx", () => ({
  useAuth: () => ({ user: { id: "u1", name: "Test User", email: "t@t.com" } }),
}));

const { MockAIError } = vi.hoisted(() => {
  class MockAIError extends Error {
    status?: number;
    constructor(message: string, status?: number) {
      super(message);
      this.status = status;
    }
  }
  return { MockAIError };
});

vi.mock("@/lib/services/ai", () => ({
  listConversations: vi.fn().mockResolvedValue([]),
  getConversation: vi.fn().mockResolvedValue({ messages: [] }),
  tutorTurn: vi.fn().mockResolvedValue({ conversationId: "c1" }),
  askAssistant: vi.fn().mockResolvedValue({ conversationId: "c1", reply: "ok" }),
  deleteConversation: vi.fn().mockResolvedValue(undefined),
  submitFeedback: vi.fn().mockResolvedValue(undefined),
  streamChat: vi.fn(),
  aiJson: vi.fn(),
  AIError: MockAIError,
}));

describe("VoiceAITutor (AI workspace)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the floating launcher button", () => {
    render(<VoiceAITutor />);
    expect(screen.getByLabelText("Open AI Tutor and Assistant")).toBeInTheDocument();
  });

  it("opens the workspace and shows tutor mode by default", () => {
    render(<VoiceAITutor />);
    fireEvent.click(screen.getByLabelText("Open AI Tutor and Assistant"));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("9Th-Grade AI")).toBeInTheDocument();
    expect(screen.getByText("টিউটর")).toBeInTheDocument();
    expect(screen.getByText("সহায়ক")).toBeInTheDocument();
  });

  it("shows preset prompts in tutor mode", () => {
    render(<VoiceAITutor />);
    fireEvent.click(screen.getByLabelText("Open AI Tutor and Assistant"));
    expect(screen.getByText("৯ম শ্রেণীর পদার্থবিজ্ঞানের গতি সূত্রগুলো ব্যাখ্যা করো")).toBeInTheDocument();
    expect(screen.getByText("রসায়নের পর্যায় সারণি মনে রাখার সহজ উপায়")).toBeInTheDocument();
  });

  it("switches to assistant mode and shows quick actions", () => {
    render(<VoiceAITutor />);
    fireEvent.click(screen.getByLabelText("Open AI Tutor and Assistant"));
    fireEvent.click(screen.getByText("সহায়ক"));
    expect(screen.getByText("আজ কী পড়ব?")).toBeInTheDocument();
    expect(screen.getByText("কারেন্ট অ্যাফেয়ার্স")).toBeInTheDocument();
  });

  it("closes the workspace on Escape", async () => {
    render(<VoiceAITutor />);
    fireEvent.click(screen.getByLabelText("Open AI Tutor and Assistant"));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });
});