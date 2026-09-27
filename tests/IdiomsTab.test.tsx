import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import IdiomsTab from "@/components/dashboard/vocab/IdiomsTab";
import { LanguageProvider } from "@/lib/lang-ctx";
import { invalidateCache } from "@/lib/services/api";

const IDIOMS = {
  words: [
    {
      id: 1,
      word: "Break the ice",
      bengaliMeaning: "জড়তা ভাঙা",
      partOfSpeech: "Idiom",
      exampleSentence: "He told a joke to break the ice.",
      exampleSentenceBn: null,
      context: "Starting a conversation",
      examRelevance: ["BCS"],
    },
    {
      id: 2,
      word: "In a nutshell",
      bengaliMeaning: "সংক্ষেপে",
      partOfSpeech: "Phrase",
      exampleSentence: "In a nutshell, the plan failed.",
      exampleSentenceBn: null,
      context: "",
      examRelevance: ["Bank"],
    },
  ],
};

function stubWords(payload: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, status: 200, json: async () => payload }) as Response),
  );
}

describe("IdiomsTab", () => {
  beforeEach(() => {
    invalidateCache();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders idiom entries fetched with kind=idioms", async () => {
    stubWords(IDIOMS);
    render(<LanguageProvider><IdiomsTab /></LanguageProvider>);
    expect(await screen.findByText("Break the ice")).toBeInTheDocument();
    expect(screen.getByText("In a nutshell")).toBeInTheDocument();
    const [[url]] = (fetch as unknown as { mock: { calls: string[][] } }).mock.calls;
    expect(url).toContain("kind=idioms");
  });

  it("expands an entry to show the example sentence", async () => {
    stubWords(IDIOMS);
    render(<LanguageProvider><IdiomsTab /></LanguageProvider>);
    fireEvent.click(await screen.findByText("Break the ice"));
    expect(await screen.findByText(/He told a joke to break the ice/)).toBeInTheDocument();
  });

  it("filters entries via search", async () => {
    stubWords(IDIOMS);
    render(<LanguageProvider><IdiomsTab /></LanguageProvider>);
    await screen.findByText("Break the ice");
    fireEvent.change(screen.getByLabelText("Search idioms and phrases"), {
      target: { value: "nutshell" },
    });
    await waitFor(() => {
      expect(screen.queryByText("Break the ice")).not.toBeInTheDocument();
    });
    expect(screen.getByText("In a nutshell")).toBeInTheDocument();
  });

  it("shows the coming-soon empty state when no idioms are imported yet", async () => {
    stubWords({ words: [] });
    render(<LanguageProvider><IdiomsTab /></LanguageProvider>);
    expect(await screen.findByText("Coming soon")).toBeInTheDocument();
  });
});
