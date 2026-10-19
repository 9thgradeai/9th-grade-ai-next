import { describe, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import QuestionBankTab from "@/components/dashboard/QuestionBankTab";
import { EcosystemProvider } from "@/lib/ecosystem-ctx";
import { useDashboardStore } from "@/lib/store-ctx/dashboard";
import { api } from "@/lib/services/api";
import type { QuestionBankCategoryDTO, QuestionDTO } from "@/lib/types";

vi.mock("@/lib/services/api", () => ({
  api: { questionBankCategories: vi.fn(), questions: vi.fn(), bookmarks: vi.fn(), toggleBookmark: vi.fn(), examLibrary: vi.fn(), submitPractice: vi.fn() },
}));

const CATS: QuestionBankCategoryDTO[] = [
  { id: 1, label: "বাংলা ভাষা ও সাহিত্য", count: 120 },
  { id: 2, label: "সাধারণ বিজ্ঞান", count: 80 },
];
function makeQuestion(id: number): QuestionDTO {
  return { id, subjectId: 1, subject: "X", topic: "", subtopic: "", question: `প্রশ্ন নং ${id}?`, options: ["a","b","c","d"], correctAnswer: "a", explanation: "", difficulty: "MEDIUM", year: 2024, sourceExam: "s", bcsTerm: "50th", questionType: "SINGLE_CHOICE", correctAnswers: ["a"], statements: [], media: [] };
}
function Probe() {
  const f = useDashboardStore((s) => s.questionBankFilters);
  const set = useDashboardStore((s) => s.setQuestionBankFilters);
  return (
    <>
      <div data-cy="probe">{JSON.stringify(f)}</div>
      <button data-cy="set-btn" onClick={() => set({ category: "সাধারণ বিজ্ঞান" })}>set-category</button>
    </>
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  vi.mocked(api.questionBankCategories).mockResolvedValue(CATS as never);
  vi.mocked(api.bookmarks).mockResolvedValue([] as never);
  vi.mocked(api.questions).mockImplementation((() => Promise.resolve([makeQuestion(1)])) as never);
});

describe("debug", () => {
  it("store updates on chip click", async () => {
    render(<EcosystemProvider><Probe /><QuestionBankTab /></EcosystemProvider>);
    const chip = await screen.findByRole("button", { name: /সাধারণ বিজ্ঞান/ });
    console.log("BEFORE:", document.querySelector('[data-cy="probe"]')!.textContent);
    console.log("CHIP HTML:", chip.outerHTML.slice(0, 200));
    chip.addEventListener("click", () => console.log("NATIVE CLICK FIRED"), { once: true });
    console.log("CONNECTED:", chip.isConnected, "PARENT:", chip.parentElement?.tagName, "GRANDPARENT:", chip.parentElement?.parentElement?.tagName, "DOCBODY CONTAINS:", document.body.contains(chip));
    fireEvent.click(chip);
    await new Promise((r) => setTimeout(r, 300));
    console.log("AFTER CLICK:", document.querySelector('[data-cy="probe"]')!.textContent);
    fireEvent.click(screen.getByText("set-category"));
    await new Promise((r) => setTimeout(r, 200));
    console.log("AFTER SET:", document.querySelector('[data-cy="probe"]')!.textContent);
  });
});
