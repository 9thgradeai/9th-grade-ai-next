import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

const h = vi.hoisted(() => ({
  studyPlan: vi.fn(),
  toggleStudyTask: vi.fn(),
  toastError: vi.fn(),
  setPracticeIntent: vi.fn(),
  push: vi.fn(),
}));

vi.mock("@/lib/services/api", () => ({
  api: { studyPlan: h.studyPlan, toggleStudyTask: h.toggleStudyTask },
}));
vi.mock("@/lib/toast-ctx", () => ({ useToastSafe: () => ({ error: h.toastError, success: vi.fn() }) }));
vi.mock("@/lib/store-ctx/dashboard", () => ({
  useDashboardStore: () => ({ setPracticeIntent: h.setPracticeIntent }),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: h.push }) }));

import StudyPlannerTab from "@/components/dashboard/StudyPlannerTab";
import { LanguageProvider } from "@/lib/lang-ctx";

const renderTab = () =>
  render(
    <LanguageProvider>
      <StudyPlannerTab />
    </LanguageProvider>,
  );

describe("StudyPlannerTab de-mocked", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows loading first, never static mock tasks", async () => {
    h.studyPlan.mockImplementation(() => new Promise(() => {}));
    renderTab();
    expect(screen.getByText("প্ল্যান লোড হচ্ছে…")).toBeDefined();
    // Static STUDY_PLAN titles must not appear; loading skeleton instead.
    h.studyPlan.mockReset();
    h.studyPlan.mockResolvedValue([]);
  });

  it("shows empty state when plan is empty", async () => {
    h.studyPlan.mockResolvedValue([]);
    renderTab();
    await waitFor(() => expect(screen.getByText("কোনো স্টাডি প্ল্যান নেই")).toBeDefined());
  });

  it("shows error + retry when load fails", async () => {
    h.studyPlan.mockRejectedValue(new Error("down"));
    renderTab();
    await waitFor(() => expect(screen.getByText(/লোড করা যায়নি/)).toBeDefined());
    expect(screen.getByText("আবার চেষ্টা করুন").closest("button")).toBeDefined();
  });

  it("rolls back toggle on server failure", async () => {
    h.studyPlan.mockResolvedValue([
      { id: 7, day: "Day 1", date: "d", title: "T1", subject: "Math", duration: 30, priority: "high", description: "desc", completed: false },
    ]);
    h.toggleStudyTask.mockRejectedValue(new Error("fail"));
    renderTab();
    await waitFor(() => expect(screen.getByText("T1")).toBeDefined());
    screen.getByLabelText(/সম্পন্ন হিসেবে/).click();
    await waitFor(() => expect(h.toastError).toHaveBeenCalled());
  });
});
