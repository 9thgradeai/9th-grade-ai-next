import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import AgentActivityTimeline from "@/components/ai-workspace/AgentActivityTimeline";
import ComposerBar from "@/components/ai-workspace/ComposerBar";
import ChatMessage from "@/components/chat/ChatMessage";

describe("AgentActivityTimeline (coach tool activity canvas)", () => {
  it("renders running, done and failed steps", () => {
    render(
      <AgentActivityTimeline
        tools={[
          { name: "get_my_profile", label: "ভবিষ্যত প্রোফাইল", ok: true },
          { name: "get_weak_topics", label: "দুর্বল টপিক", ok: false },
          { name: "get_mistakes", label: "ভুল প্রশ্ন" },
        ]}
      />,
    );
    expect(screen.getByRole("list")).toBeInTheDocument();
    expect(screen.getByText("ভবিষ্যত প্রোফাইল")).toBeInTheDocument();
    expect(screen.getByText("working…")).toBeInTheDocument();
    expect(screen.getByText("failed")).toBeInTheDocument();
    // Coach identity header.
    expect(screen.getByText(/coach tool steps/i)).toBeInTheDocument();
  });

  it("renders nothing for an empty log", () => {
    const { container } = render(<AgentActivityTimeline tools={[]} />);
    expect(container.firstChild).toBeNull();
  });
});

describe("ComposerBar (input law + image attach + auto-read)", () => {
  const baseProps = {
    input: "",
    status: "idle" as const,
    activity: null,
    tools: [],
    imagePreview: null,
    canAttachImage: true,
    speakOnReply: true,
    isSpeaking: false,
    isListening: false,
    textareaRef: { current: null },
    onInputChange: vi.fn(),
    onKeyDown: vi.fn(),
    onSubmit: vi.fn(),
    onStop: vi.fn(),
    onToggleVoice: vi.fn(),
    onAttachImage: vi.fn(),
    onRemoveImage: vi.fn(),
    onToggleSpeak: vi.fn(),
  };

  it("allows image attach in tutor mode and exposes the auto-read toggle", () => {
    render(<ComposerBar {...baseProps} mode="tutor" />);
    const attach = screen.getByLabelText("Attach a question image");
    expect((attach as HTMLButtonElement).disabled).toBe(false);
    const speakBtn = screen.getByText(/Auto-read on/i);
    fireEvent.click(speakBtn);
    expect(baseProps.onToggleSpeak).toHaveBeenCalled();
  });

  it("disables image attach when gated off (photo upload is tutor-only)", () => {
    const { rerender } = render(<ComposerBar {...baseProps} mode="tutor" canAttachImage={false} />);
    const attach = screen.getByLabelText("Attach a question image");
    expect((attach as HTMLButtonElement).disabled).toBe(true);
    rerender(<ComposerBar {...baseProps} mode="agent" canAttachImage={true} />);
    expect(screen.getByLabelText("Attach a question image").getAttribute("title")).toContain("Tutor mode");
  });

  it("enables send for an image-only tutor question and blocks empty sends", () => {
    const { rerender } = render(<ComposerBar {...baseProps} mode="tutor" />);
    expect((screen.getByRole("button", { name: "Send message" }) as HTMLButtonElement).disabled).toBe(true);
    rerender(<ComposerBar {...baseProps} mode="tutor" imagePreview="data:image/png;base64,AAA=" />);
    expect((screen.getByRole("button", { name: "Send message" }) as HTMLButtonElement).disabled).toBe(false);
    expect(screen.getByText("question image attached")).toBeInTheDocument();
  });
});

describe("ChatMessage suggested-action cards (B8)", () => {
  it("renders actions as cards with the English hint and dispatches on click", () => {
    const onAction = vi.fn();
    render(
      <ChatMessage
        message={{
          id: "m1",
          role: "ai",
          text: "উত্তর",
          actions: [{ id: "next", labelBn: "পরের ধাপ কী করবো?", labelEn: "What should I do next?" }],
        }}
        copied={false}
        feedbackSent={false}
        onCopy={vi.fn()}
        onFeedback={vi.fn()}
        onAction={onAction}
      />,
    );
    fireEvent.click(screen.getByText("পরের ধাপ কী করবো?"));
    expect(onAction).toHaveBeenCalledWith("পরের ধাপ কী করবো?");
    expect(screen.getByText("What should I do next?")).toBeInTheDocument();
  });
});