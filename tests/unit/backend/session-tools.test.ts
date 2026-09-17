import { describe, it, expect, vi, beforeEach } from "vitest";
import { findTool } from "~backend/ai/tools/registry";
import type { ToolContext } from "~backend/ai/tools/types";

vi.mock("~backend/services/question-progress", () => ({
  getMistakeQuestionIdsBySelectionForUser: vi.fn(),
  getCrossSubjectMistakeIdsForUser: vi.fn(),
  scoreMistakeQuestions: vi.fn((rows: { questionId: number }[]) =>
    rows.map((r) => ({ questionId: r.questionId, score: 100 })),
  ),
}));

import {
  getMistakeQuestionIdsBySelectionForUser,
  getCrossSubjectMistakeIdsForUser,
} from "~backend/services/question-progress";

const ctx: ToolContext = { userId: "session-tool-user" };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("session-builder tools (§3 create_practice_session / create_mock_exam)", () => {
  it("create_practice_session mints a question set and emits the action with those ids", async () => {
    vi.mocked(getMistakeQuestionIdsBySelectionForUser).mockResolvedValue([
      { questionId: 11, mistakeCount: 2, masteryScore: 12 },
      { questionId: 22, mistakeCount: 1, masteryScore: 30 },
    ] as never);

    const tool = findTool("create_practice_session");
    expect(tool).toBeDefined();

    const args = tool!.validateInput({ subject: "বাংলা", difficulty: "HARD", count: 10 });
    const result = await tool!.execute(ctx, args);

    expect(getMistakeQuestionIdsBySelectionForUser).toHaveBeenCalledWith(
      ctx.userId,
      { subject: "বাংলা", topic: undefined, difficulty: "HARD" },
      10,
      undefined,
    );
    expect(result.ok).toBeUndefined(); // success: ok field is absent
    expect(result.data).toMatchObject({ questionIds: [11, 22], count: 2 });
    // The frontend needs the deterministic ids in the action (LLM never guesses them).
    const action = result.action as { type: string; params: Record<string, unknown> };
    expect(action.type).toBe("practice");
    expect(action.params.questionIds).toEqual([11, 22]);
  });

  it("create_practice_session caps count at 20 and rejects bad difficulty", async () => {
    vi.mocked(getMistakeQuestionIdsBySelectionForUser).mockResolvedValue([] as never);
    const tool = findTool("create_practice_session")!;

    const args = tool.validateInput({ count: 999, difficulty: "NOPE" });
    expect(args.count).toBe(20);
    expect(args.difficulty).toBe("");

    const result = await tool.execute(ctx, args);
    expect(result.ok).toBe(false);
    expect(result.data).toMatchObject({ reason: "empty_pool" });
  });

  it("create_mock_exam is cross-subject by default", async () => {
    vi.mocked(getCrossSubjectMistakeIdsForUser).mockResolvedValue([7, 8, 9]);
    const tool = findTool("create_mock_exam")!;

    const result = await tool.execute(ctx, tool.validateInput({ count: 20 }));
    expect(getCrossSubjectMistakeIdsForUser).toHaveBeenCalledWith(ctx.userId, 20);
    expect(result.ok).toBeUndefined(); // success: ok field is absent
    expect(result.data).toMatchObject({ questionIds: [7, 8, 9] });
    const action = result.action as { type: string; params: Record<string, unknown> };
    expect(action.type).toBe("mock_exam");
    expect(action.params.questionIds).toEqual([7, 8, 9]);
  });

  it("create_mock_exam focuses one subject when given a subject", async () => {
    vi.mocked(getMistakeQuestionIdsBySelectionForUser).mockResolvedValue([
      { questionId: 5, mistakeCount: 1, masteryScore: 40 },
    ] as never);
    const tool = findTool("create_mock_exam")!;

    const result = await tool.execute(ctx, tool.validateInput({ subject: "English" }));
    expect(getMistakeQuestionIdsBySelectionForUser).toHaveBeenCalledWith(
      ctx.userId,
      { subject: "English", difficulty: undefined },
      20,
      "weakest_topics",
    );
    expect(result.ok).toBeUndefined(); // success
    expect(result.data).toMatchObject({ questionIds: [5] });
  });

  it("create_mock_exam returns ok:false when the mistake pool is empty", async () => {
    vi.mocked(getCrossSubjectMistakeIdsForUser).mockResolvedValue([]);
    const tool = findTool("create_mock_exam")!;
    const result = await tool.execute(ctx, tool.validateInput({}));
    expect(result.ok).toBe(false);
    expect(result.data).toMatchObject({ reason: "empty_pool" });
  });
});