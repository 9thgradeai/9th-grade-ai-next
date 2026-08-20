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
  listConversations: vi.fn().mockResolvedValue([
    {
      id: "c1",
      kind: "TUTOR",
      title: "গতি সূত্র",
      subjectId: null,
      topicId: null,
      topicPath: "",
      messageCount: 2,
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
    },
  ]),
  getConversation: vi.fn().mockImplementation((id: string) =>
    Promise.resolve({
      messages: [
        { id: "m2", conversationId: id, role: "USER", status: "COMPLETE", content: "সূত্রগুলো ব্যাখ্যা করো", intent: null, provider: null, model: null, errorCode: null, createdAt: "2026-01-01T00:00:00Z" },
        { id: "m1", conversationId: id, role: "ASSISTANT", status: "COMPLETE", content: "**নিউটনের দ্বিতীয় সূত্র**: F = ma", intent: null, provider: null, model: null, errorCode: null, createdAt: "2026-01-01T00:00:00Z" },
      ],
    }),
  ),
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

  it("renders loaded conversation responses as Markdown without raw asterisks", async () => {
    render(<VoiceAITutor />);
    fireEvent.click(screen.getByLabelText("Open AI Tutor and Assistant"));
    await waitFor(() => {
      expect(screen.getByText("গতি সূত্র")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("গতি সূত্র"));
    await waitFor(() => {
      expect(screen.getByText("নিউটনের দ্বিতীয় সূত্র").tagName).toBe("STRONG");
    });
    expect(screen.getByText(/F = ma/)).toBeTruthy();
    expect(screen.queryByText("**নিউটনের দ্বিতীয় সূত্র**")).not.toBeInTheDocument();
  });

  it("sends a message through the auto-growing textarea", async () => {
    render(<VoiceAITutor />);
    fireEvent.click(screen.getByLabelText("Open AI Tutor and Assistant"));
    const textarea = screen.getByLabelText("Type your question or use voice input");
    fireEvent.change(textarea, { target: { value: "পরীক্ষা বার্তা" } });
    fireEvent.keyDown(textarea, { key: "Enter" });
    await waitFor(() => {
      expect(screen.getByText("পরীক্ষা বার্তা")).toBeInTheDocument();
    });
  });
});