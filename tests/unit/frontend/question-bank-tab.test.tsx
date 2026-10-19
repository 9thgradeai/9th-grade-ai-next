import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within, configure } from "@testing-library/react";
import { useEffect } from "react";
import QuestionBankTab from "@/components/dashboard/QuestionBankTab";
import { EcosystemProvider } from "@/lib/ecosystem-ctx";
import { useDashboardStore } from "@/lib/store-ctx/dashboard";
import { api } from "@/lib/services/api";
import type { QuestionBankCategoryDTO, QuestionDTO } from "@/lib/types";

// The tab tags its cards with data-cy (repo-wide convention).
configure({ testIdAttribute: "data-cy" });

vi.mock("@/lib/services/api", () => ({
  api: {
    questionBankCategories: vi.fn(),
    questions: vi.fn(),
    bookmarks: vi.fn(),
    toggleBookmark: vi.fn(),
    examLibrary: vi.fn(),
    submitPractice: vi.fn(),
  },
}));

const CATS: QuestionBankCategoryDTO[] = [
  { id: 1, label: "বাংলা ভাষা ও সাহিত্য", count: 120 },
  { id: 2, label: "সাধারণ বিজ্ঞান", count: 80 },
];

function makeQuestion(id: number, overrides: Partial<QuestionDTO> = {}): QuestionDTO {
  return {
    id,
    subjectId: 1,
    subject: "বাংলা ভাষা ও সাহিত্য",
    topic: "ব্যাকরণ",
    subtopic: "",
    question: `প্রশ্ন নং ${id}?`,
    options: ["ক বিকল্প", "খ বিকল্প", "গ বিকল্প", "ঘ বিকল্প"],
    correctAnswer: "গ বিকল্প",
    explanation: `ব্যাখ্যা ${id}`,
    difficulty: "MEDIUM",
    year: 2024,
    sourceExam: "৫০তম বিসিএস",
    bcsTerm: "50th",
    questionType: "SINGLE_CHOICE",
    correctAnswers: ["গ বিকল্প"],
    statements: [],
    media: [],
    ...overrides,
  };
}

const PAGE_1 = [makeQuestion(1), makeQuestion(2)];
const FACET_POOL = [
  makeQuestion(1),
  makeQuestion(2),
  makeQuestion(3, { year: 2023, bcsTerm: "49th" }),
];

/**
 * Routes every api.questions call by shape:
 *   ids            → saved-questions fetch
 *   limit 200      → unfiltered facet bootstrap
 *   limit 50       → paginated display fetch (page N)
 */
function mockQuestions({
  facetPool = FACET_POOL,
  pages = { 1: PAGE_1 },
  saved = PAGE_1,
}: {
  facetPool?: QuestionDTO[];
  pages?: Record<number, QuestionDTO[]>;
  saved?: QuestionDTO[];
} = {}) {
  vi.mocked(api.questions).mockImplementation(((params?: Record<string, unknown>) => {
    if (params?.ids) return Promise.resolve(saved);
    if (params?.limit === 200) return Promise.resolve(facetPool);
    const page = (params?.page as number) ?? 1;
    return Promise.resolve(pages[page] ?? []);
  }) as never);
}

/** Resets the module-level dashboard store between tests (localStorage-backed
 * state persists across tests within a file otherwise). */
function ResetStoreProbe() {
  const resetStore = useDashboardStore((s) => s.resetStore);
  useEffect(() => {
    resetStore();
  }, [resetStore]);
  return null;
}

function renderTab() {
  return render(
    <EcosystemProvider>
      <QuestionBankTab />
    </EcosystemProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  mockQuestions();
  vi.mocked(api.questionBankCategories).mockResolvedValue(CATS as never);
  vi.mocked(api.bookmarks).mockResolvedValue([] as never);
  vi.mocked(api.toggleBookmark).mockResolvedValue({ bookmarked: true } as never);
  render(<ResetStoreProbe />);
});

describe("QuestionBankTab (simplified redesign)", () => {
  it("renders header, category strip, and loaded questions", async () => {
    renderTab();
    expect(await screen.findByText("প্রশ্ন ব্যাংক")).toBeInTheDocument();
    // Category chips from the DB endpoint (labels = Subject.nameBn).
    expect(await screen.findByRole("button", { name: /বাংলা ভাষা ও সাহিত্য/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /সাধারণ বিজ্ঞান/ })).toBeInTheDocument();
    // Page-1 questions render as expandable cards.
    expect(await screen.findByText("প্রশ্ন নং 1?")).toBeInTheDocument();
    expect(screen.getByText("প্রশ্ন নং 2?")).toBeInTheDocument();
    // Live result count (Bengali label, not the old mixed-language "results").
    expect(await screen.findByText("2 ফলাফল")).toBeInTheDocument();
    // Display fetch is PYQ-only page 1; facet fetch is the unfiltered pool.
    expect(api.questions).toHaveBeenCalledWith(
      expect.objectContaining({ subject: "বাংলা ভাষা ও সাহিত্য", pyqOnly: true, limit: 50, page: 1 }),
    );
    expect(api.questions).toHaveBeenCalledWith(
      expect.objectContaining({ subject: "বাংলা ভাষা ও সাহিত্য", pyqOnly: true, limit: 200 }),
    );
  });

  it("filters the list from the search box (deferred)", async () => {
    renderTab();
    const input = await screen.findByRole("searchbox", { name: "প্রশ্ন খুঁজুন" });
    fireEvent.change(input, { target: { value: "নং 2" } });
    await waitFor(() => expect(screen.getByText("1 ফলাফল")).toBeInTheDocument(), { timeout: 3000 });
    // Highlighting splits the matched text across nodes — match on the card's
    // full textContent instead.
    const cards = document.querySelectorAll('[data-cy="question-card"]');
    expect(cards).toHaveLength(1);
    expect(cards[0].textContent).toContain("প্রশ্ন নং 2?");
    expect(screen.queryByText("প্রশ্ন নং 1?")).not.toBeInTheDocument();
    // Clear button restores the full list.
    fireEvent.click(screen.getByRole("button", { name: "সার্চ মুছুন" }));
    await waitFor(() => expect(screen.getByText("2 ফলাফল")).toBeInTheDocument(), { timeout: 3000 });
  });

  it("switches subject via the category strip and refetches", async () => {
    renderTab();
    // Wait until the bootstrap settled (categories + list loaded) so the chip
    // we click is the committed one, not a static-fallback node about to be
    // replaced by the API-driven strip.
    await screen.findByText("প্রশ্ন নং 1?");
    fireEvent.click(screen.getByRole("button", { name: /সাধারণ বিজ্ঞান/ }));
    await waitFor(() =>
      expect(api.questions).toHaveBeenCalledWith(
        expect.objectContaining({ subject: "সাধারণ বিজ্ঞান", limit: 50, page: 1 }),
      ),
    );
  });

  it("keeps facet options stable when a filter is applied (regression)", async () => {
    renderTab();
    await screen.findByText("প্রশ্ন নং 1?");
    // Open the filters panel — years 2024 + 2023 from the unfiltered pool.
    fireEvent.click(screen.getByRole("button", { name: /^ফিল্টার/ }));
    expect(await screen.findByRole("button", { name: "2024", pressed: false })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "2023", pressed: false })).toBeInTheDocument();
    const facetFetchesBefore = vi.mocked(api.questions).mock.calls.filter((c) => (c[0] as { limit?: number })?.limit === 200).length;
    // Apply the 2024 facet → display list narrows…
    fireEvent.click(screen.getByRole("button", { name: "2024", pressed: false }));
    await waitFor(() =>
      expect(api.questions).toHaveBeenCalledWith(expect.objectContaining({ year: 2024 })),
    );
    // …but the facet option list must NOT collapse (still unfiltered).
    const facetFetchesAfter = vi.mocked(api.questions).mock.calls.filter((c) => (c[0] as { limit?: number })?.limit === 200).length;
    expect(facetFetchesAfter).toBe(facetFetchesBefore);
    expect(screen.getByRole("button", { name: "2024", pressed: true })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "2023", pressed: false })).toBeInTheDocument();
  });

  it("shows applied filters as removable chips when the panel is closed", async () => {
    renderTab();
    await screen.findByText("প্রশ্ন নং 1?");
    fireEvent.click(screen.getByRole("button", { name: /^ফিল্টার/ }));
    fireEvent.click(await screen.findByRole("button", { name: "2023", pressed: false }));
    const displayFetches = () =>
      vi.mocked(api.questions).mock.calls.filter((c) => (c[0] as { limit?: number })?.limit === 50).length;
    await waitFor(() => expect(displayFetches()).toBe(2)); // initial + year-filtered
    fireEvent.click(screen.getByRole("button", { name: /^ফিল্টার/ })); // close panel
    const chip = await screen.findByRole("button", { name: "বছর: 2023 ফিল্টার মুছুন" });
    fireEvent.click(chip);
    // Removing the chip refetches the unfiltered display page.
    await waitFor(() => expect(displayFetches()).toBe(3));
  });

  it("bookmarks a question and lists it in the সংরক্ষিত view", async () => {
    mockQuestions({ saved: [makeQuestion(1)] });
    renderTab();
    const card = (await screen.findAllByTestId("question-card"))[0];
    fireEvent.click(within(card).getByRole("button", { name: "সংরক্ষণ করুন" }));
    await waitFor(() => expect(api.toggleBookmark).toHaveBeenCalledWith(1));
    // Saved view fetches the full question objects by bookmarked ids.
    fireEvent.click(await screen.findByRole("button", { name: "সংরক্ষিত (1)" }));
    await waitFor(() =>
      expect(api.questions).toHaveBeenCalledWith(expect.objectContaining({ ids: [1], limit: 200 })),
    );
    expect(await screen.findByText("প্রশ্ন নং 1?")).toBeInTheDocument();
  });

  it("expands a card to reveal options, correct answer highlight, and explanation", async () => {
    renderTab();
    const card = (await screen.findAllByTestId("question-card"))[0];
    const header = within(card).getAllByRole("button")[0];
    expect(header).toHaveAttribute("aria-expanded", "false");
    // Collapsed: options are hidden (persistent aria-controls target).
    expect(within(card).queryByText("গ বিকল্প")).not.toBeVisible();
    fireEvent.click(header);
    expect(header).toHaveAttribute("aria-expanded", "true");
    expect(within(card).getByText("গ বিকল্প")).toBeVisible();
    expect(within(card).getByText("ব্যাখ্যা 1")).toBeVisible();
  });

  it("enters and exits scroll practice from the control row", async () => {
    renderTab();
    fireEvent.click(await screen.findByRole("button", { name: "প্র্যাকটিস (2)" }));
    // Practice replaces the tab with the full-height ScrollPractice view.
    expect(await screen.findByText(/স্ক্রল প্র্যাকটিস/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "সব উত্তর জমা দিন" })).toBeInTheDocument();
    // The header "বাতিল" exits back to the list (single back path).
    fireEvent.click(screen.getByRole("button", { name: "বাতিল" }));
    expect(await screen.findByText("প্রশ্ন ব্যাংক")).toBeInTheDocument();
  });

  it("shows an error state with working retry", async () => {
    vi.mocked(api.questions).mockImplementation(((params?: Record<string, unknown>) =>
      params?.limit === 200
        ? Promise.resolve(FACET_POOL)
        : Promise.reject(new Error("network down"))) as never);
    renderTab();
    expect(await screen.findByText("প্রশ্ন লোড করা যায়নি")).toBeInTheDocument();
    mockQuestions();
    fireEvent.click(screen.getByRole("button", { name: /আবার চেষ্টা করুন/ }));
    expect(await screen.findByText("প্রশ্ন নং 1?")).toBeInTheDocument();
  });

  it("pages the list with আরও দেখুন (load-more)", async () => {
    const page1 = Array.from({ length: 50 }, (_, i) => makeQuestion(i + 1));
    const page2 = [makeQuestion(51)];
    mockQuestions({ pages: { 1: page1, 2: page2 } });
    renderTab();
    expect(await screen.findByText("50 ফলাফল")).toBeInTheDocument();
    fireEvent.click(await screen.findByRole("button", { name: "আরও দেখুন" }));
    await waitFor(() => expect(api.questions).toHaveBeenCalledWith(expect.objectContaining({ page: 2 })));
    expect(await screen.findByText("51 ফলাফল")).toBeInTheDocument();
    // Short page = end of list → the load-more affordance disappears.
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "আরও দেখুন" })).not.toBeInTheDocument(),
    );
  });

  it("switches to exam browse mode and back without losing the toggle", async () => {
    vi.mocked(api.examLibrary).mockResolvedValue([] as never);
    renderTab();
    fireEvent.click(await screen.findByRole("button", { name: "পরীক্ষা অনুযায়ী" }));
    expect(await screen.findByText(/কোনো পরীক্ষার লাইব্রেরি নেই/)).toBeInTheDocument();
    // The mode toggle stays reachable in exam mode (previous version hid it).
    fireEvent.click(screen.getByRole("button", { name: "বিষয় অনুযায়ী" }));
    expect(await screen.findByText("প্রশ্ন ব্যাংক")).toBeInTheDocument();
  });

  it("lands on the saved view for the __saved__ deep-link sentinel", async () => {
    render(
      <EcosystemProvider>
        <SentinelSeed />
        <QuestionBankTab />
      </EcosystemProvider>,
    );
    expect(await screen.findByText("সংরক্ষিত প্রশ্ন নেই")).toBeInTheDocument();
    // The sentinel is consumed: browse mode is subject and the view toggle
    // shows the saved view as active.
    expect(await screen.findByRole("button", { name: "সংরক্ষিত (0)", pressed: true })).toBeInTheDocument();
  });
});

/** Sets the store to the router's ?view=bookmarks sentinel before the tab
 * reads it (DashboardTabClient normally does this on deep link). */
function SentinelSeed() {
  const setQuestionBankFilters = useDashboardStore((s) => s.setQuestionBankFilters);
  useEffect(() => {
    setQuestionBankFilters({ category: "__saved__" });
  }, [setQuestionBankFilters]);
  return null;
}
