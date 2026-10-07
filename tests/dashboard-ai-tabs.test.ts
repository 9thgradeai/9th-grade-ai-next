import { describe, it, expect, vi } from "vitest";
import { TABS, NAV_GROUPS } from "@/lib/data";
import { TAB_ICONS } from "@/lib/exam-ui";

vi.mock("@/lib/services/ai", () => ({ solve: vi.fn() }));
vi.mock("@/lib/services/ai/mockTest", () => ({ generateMockTest: vi.fn() }));
vi.mock("@/lib/services/ai/advisor", () => ({ getCareerAdvice: vi.fn() }));
vi.mock("@/lib/services/ai/evaluator", () => ({ evaluateAnswer: vi.fn() }));
vi.mock("@/lib/services/ai/tutor", () => ({ tutorTurn: vi.fn() }));
vi.mock("@/lib/services/ai/studentModel", () => ({ getStudentModel: vi.fn(() => Promise.resolve(null)) }));
vi.mock("@/lib/services/ai/usage", () => ({ getUsageSummary: vi.fn(() => Promise.resolve(null)) }));
vi.mock("@/lib/services/api", () => ({ api: {}, invalidateCache: vi.fn() }));

const ORPHANS: { id: string; path: string }[] = [
  { id: "ai-solver", path: "@/components/dashboard/AISolverTab" },
  { id: "ai-mock", path: "@/components/dashboard/AIMockTestTab" },
  { id: "advisor", path: "@/components/dashboard/AdvisorTab" },
  { id: "evaluator", path: "@/components/dashboard/AnswerEvaluatorTab" },
  { id: "voice-interview", path: "@/components/dashboard/VoiceInterviewTab" },
  { id: "student-model", path: "@/components/dashboard/StudentModelTab" },
  { id: "usage", path: "@/components/dashboard/UsageTab" },
];

describe("P1a re-homed AI tabs", () => {
  it("every orphan has TABS meta + NAV_GROUPS entry + icon", () => {
    for (const o of ORPHANS) {
      expect(TABS.some((t) => t.id === o.id), `missing TABS ${o.id}`).toBe(true);
      expect(
        NAV_GROUPS.some((g) => (g.ids as string[]).includes(o.id)),
        `missing NAV_GROUPS ${o.id}`,
      ).toBe(true);
      expect((TAB_ICONS as Record<string, unknown>)[o.id], `missing icon ${o.id}`).toBeDefined();
    }
  });

  it.each(ORPHANS)("imports $id without crashing", async ({ path }) => {
    const mod = await import(path);
    expect(mod.default).toBeDefined();
  });
});
