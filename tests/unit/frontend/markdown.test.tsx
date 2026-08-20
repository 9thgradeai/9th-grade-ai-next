import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import Markdown from "@/components/chat/Markdown";
import ChatMessage from "@/components/chat/ChatMessage";

describe("Markdown renderer", () => {
  it("renders bold text as <strong> without raw asterisks", () => {
    const { container } = render(<Markdown text="**গতি সূত্র** হলো গুরুত্বপূর্ণ" />);
    expect(screen.getByText("গতি সূত্র").tagName).toBe("STRONG");
    expect(screen.getByText("হলো গুরুত্বপূর্ণ")).toBeTruthy();
    expect(container.textContent).not.toContain("**");
  });

  it("renders italic text as <em>", () => {
    const { container } = render(<Markdown text="সূত্রটি *প্রমাণযোগ্য*।" />);
    expect(screen.getByText("প্রমাণযোগ্য").tagName).toBe("EM");
    expect(container.textContent).not.toContain("*প্রমাণযোগ্য*");
  });

  it("renders bullet and numbered lists", () => {
    render(
      <Markdown
        text={"গতির তিনটি সূত্র:\n- প্রথম সূত্র\n- দ্বিতীয় সূত্র\n- তৃতীয় সূত্র"}
      />,
    );
    expect(screen.getByText("প্রথম সূত্র")).toBeTruthy();
    expect(screen.getByText("দ্বিতীয় সূত্র")).toBeTruthy();
    expect(screen.getByText("তৃতীয় সূত্র")).toBeTruthy();

    render(<Markdown text={"ধাপসমূহ:\n1. পড়ো\n2. মনে রাখো"} />);
    expect(screen.getByText("পড়ো")).toBeTruthy();
    expect(screen.getByText("মনে রাখো")).toBeTruthy();
  });

  it("renders fenced code blocks without asterisks", () => {
    const { container } = render(
      <Markdown text={"```python\nprint('hello')\n```"} />,
    );
    expect(container.querySelector("pre code")).toBeTruthy();
    expect(container.textContent).toContain("print('hello')");
  });

  it("renders inline code", () => {
    const { container } = render(<Markdown text="`v = u + at` সূত্রটি মনে রাখো" />);
    expect(container.querySelector("code")).toBeTruthy();
  });

  it("renders headings", () => {
    render(<Markdown text={"### মোট গতি"} />);
    expect(screen.getByText("মোট গতি")).toBeTruthy();
  });

  it("strips decorative asterisk lines instead of showing them", () => {
    const { container } = render(
      <Markdown text={"আজকের বিষয়।\n**\n***\nব্যাখ্যা:"} />,
    );
    expect(container.textContent).not.toContain("***");
    expect(container.textContent).toContain("আজকের বিষয়।");
    expect(container.textContent).toContain("ব্যাখ্যা:");
  });

  it("removes empty emphasis like '** **'", () => {
    const { container } = render(<Markdown text="ভালো। ** ** পরে শিখব।" />);
    expect(container.textContent).not.toContain("**");
    expect(container.textContent).toContain("ভালো।");
  });

  it("treats a long dash run as a divider", () => {
    const { container } = render(<Markdown text={"উপরে\n---\nনিচে"} />);
    expect(container.querySelector("hr")).toBeTruthy();
  });
});

describe("ChatMessage", () => {
  const noop = () => {};
  const copy = vi.fn();
  const feedback = vi.fn();
  const action = vi.fn();

  it("renders AI messages as Markdown without raw asterisks", () => {
    const { container } = render(
      <ChatMessage
        message={{ id: "a1", role: "ai", text: "**নিউটনের দ্বিতীয় সূত্র** প্রযোজ্য" }}
        copied={false}
        feedbackSent={false}
        onCopy={copy}
        onFeedback={feedback}
        onAction={action}
      />,
    );
    expect(screen.getByText("নিউটনের দ্বিতীয় সূত্র").tagName).toBe("STRONG");
    expect(container.textContent).not.toContain("**");
  });

  it("renders user messages in a right-aligned bubble", () => {
    const { container } = render(
      <ChatMessage
        message={{ id: "u1", role: "user", text: "সূত্রগুলো ব্যাখ্যা করো" }}
        copied={false}
        feedbackSent={false}
        onCopy={copy}
        onFeedback={feedback}
        onAction={action}
      />,
    );
    expect(screen.getByText("সূত্রগুলো ব্যাখ্যা করো")).toBeTruthy();
    expect(container.querySelector(".justify-end")).toBeTruthy();
  });

  it("renders suggested action chips for AI messages", () => {
    render(
      <ChatMessage
        message={{
          id: "a2",
          role: "ai",
          text: "এখানে কিছু প্রস্তাবনা",
          actions: [{ id: "x1", labelBn: "আরও শিখি" }],
        }}
        copied={false}
        feedbackSent={false}
        onCopy={copy}
        onFeedback={feedback}
        onAction={action}
      />,
    );
    expect(screen.getByText("আরও শিখি")).toBeTruthy();
  });

  it("shows an error style when the AI message failed", () => {
    const { container } = render(
      <ChatMessage
        message={{ id: "a3", role: "ai", text: "দুঃখিত, উত্তর তৈরি করা যাচ্ছে না।", error: true }}
        copied={false}
        feedbackSent={false}
        onCopy={copy}
        onFeedback={feedback}
        onAction={action}
      />,
    );
    expect(container.querySelector(".text-red-300")).toBeTruthy();
  });
});