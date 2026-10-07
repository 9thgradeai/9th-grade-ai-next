import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const h = vi.hoisted(() => ({
  getCareerAdvice: vi.fn(),
  getStudentModel: vi.fn(),
  getUsageSummary: vi.fn(),
}));

vi.mock("@/lib/services/ai/advisor", () => ({ getCareerAdvice: h.getCareerAdvice }));
vi.mock("@/lib/services/ai/studentModel", () => ({ getStudentModel: h.getStudentModel }));
vi.mock("@/lib/services/ai/usage", () => ({ getUsageSummary: h.getUsageSummary }));
vi.mock("@/lib/toast-ctx", () => ({
  useToastSafe: () => ({ success: vi.fn(), error: vi.fn() }),
}));
vi.mock("@/lib/ai-launcher", () => ({ launchAI: vi.fn() }));

import AdvisorTab from "@/components/dashboard/AdvisorTab";
import StudentModelTab from "@/components/dashboard/StudentModelTab";
import UsageTab from "@/components/dashboard/UsageTab";

describe("AdvisorTab weekly-hours validation", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects out-of-range hours without calling the API", async () => {
    render(<AdvisorTab />);
    const hours = screen.getByLabelText(/সপ্তাহে পড়ার সময়/);
    fireEvent.change(hours, { target: { value: "999" } });
    fireEvent.click(screen.getByRole("button", { name: "পরিকল্পনা নাও" }));
    await waitFor(() => expect(screen.getByText(/১–৮০ ঘণ্টার মধ্যে/)).toBeDefined());
    expect(h.getCareerAdvice).not.toHaveBeenCalled();
  });
});

describe("StudentModelTab / UsageTab error retry", () => {
  beforeEach(() => vi.clearAllMocks());

  it("student model shows retry and recovers", async () => {
    h.getStudentModel.mockRejectedValueOnce(new Error("down"));
    h.getStudentModel.mockResolvedValueOnce({
      weakTopics: [],
      strongTopics: [],
      examGoal: null,
      preferredLanguage: null,
      evaluatedCount: 0,
      totalAiQuestions: 0,
      usageByTask: [],
      lastActive: null,
    });
    render(<StudentModelTab />);
    await waitFor(() => expect(screen.getByText("আবার চেষ্টা করুন")).toBeDefined());
    fireEvent.click(screen.getByText("আবার চেষ্টা করুন"));
    await waitFor(() => expect(screen.getByText(/শিক্ষার্থী প্রোফাইল/)).toBeDefined());
    expect(h.getStudentModel).toHaveBeenCalledTimes(2);
  });

  it("usage shows retry and recovers", async () => {
    h.getUsageSummary.mockRejectedValueOnce(new Error("down"));
    h.getUsageSummary.mockResolvedValueOnce({
      totalCalls: 0,
      totalCostUsd: 0,
      successRate: 1,
      avgLatencyMs: 0,
      byDay: [],
      byProvider: [],
    });
    render(<UsageTab />);
    await waitFor(() => expect(screen.getByText("আবার চেষ্টা করুন")).toBeDefined());
    fireEvent.click(screen.getByText("আবার চেষ্টা করুন"));
    await waitFor(() => expect(screen.getByRole("heading", { name: /AI ব্যবহার/ })).toBeDefined());
    expect(h.getUsageSummary).toHaveBeenCalledTimes(2);
  });
});
