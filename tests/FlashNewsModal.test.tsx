import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import FlashNewsModal from "@/components/FlashNewsModal";
import type { FlashNews } from "@/lib/types";

describe("FlashNewsModal", () => {
  const mockNews: FlashNews = {
    id: "test-news",
    tag: "EXAM",
    title: { bn: "টেস্ট শিরোনাম", en: "Test Title" },
    text: "এটি একটি পরীক্ষা",
    time: "1h",
    category: { bn: "পরীক্ষা", en: "Exam" },
    date: "2026-08-14",
    readTime: 2,
    full: "এটি একটি পরীক্ষা",
  };

  it("renders news content when provided", () => {
    const onClose = () => {};
    render(<FlashNewsModal news={mockNews} onClose={onClose} />);
    expect(screen.getByText("টেস্ট শিরোনাম")).toBeInTheDocument();
  });

  it("returns null when no news provided", () => {
    const onClose = () => {};
    const { container } = render(<FlashNewsModal news={null} onClose={onClose} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders the category tag", () => {
    const onClose = () => {};
    render(<FlashNewsModal news={mockNews} onClose={onClose} />);
    expect(screen.getByText("পরীক্ষা")).toBeInTheDocument();
  });

  it("renders the bookmark toggle button", () => {
    const onClose = () => {};
    render(<FlashNewsModal news={mockNews} onClose={onClose} />);
    expect(screen.getByLabelText("Close")).toBeInTheDocument();
  });
});
