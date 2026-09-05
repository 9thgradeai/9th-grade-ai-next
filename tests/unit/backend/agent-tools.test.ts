import { describe, it, expect } from "vitest";
import { getTools, findTool, parseToolCall, executeTool } from "~backend/ai/tools/registry";
import type { ToolDefinition, ToolContext } from "~backend/ai/tools/types";

const ctx: ToolContext = { userId: "tool-test-user" };

describe("agent tool registry", () => {
  it("registers the 16 read-only tools", () => {
    const tools = getTools();
    expect(tools.length).toBe(16);
    const names = tools.map((t) => t.name);
    expect(names).toContain("get_my_profile");
    expect(names).toContain("get_my_mastery");
    expect(names).toContain("get_wrong_answers");
    expect(names).toContain("search_questions");
    expect(names).toContain("search_syllabus");
    expect(names).toContain("calculate_readiness");
    expect(names).toContain("recommend_next_action");
    expect(names).toContain("search_current_affairs");
    expect(names).toContain("create_practice_session");
    expect(names).toContain("create_mock_exam");
    for (const t of tools) {
      expect(t.execute).toBeInstanceOf(Function);
      expect(t.validateInput).toBeInstanceOf(Function);
    }
  });

  it("finds tools by name and rejects invented names", () => {
    expect(findTool("get_my_goals")?.name).toBe("get_my_goals");
    expect(findTool("drop_database")).toBeUndefined();
  });

  it("parses a tool-call envelope", () => {
    expect(parseToolCall({ name: "get_topic", arguments: { topicId: 3 } })).toEqual({
      name: "get_topic",
      arguments: { topicId: 3 },
    });
    expect(() => parseToolCall(null)).toThrow();
    expect(() => parseToolCall({})).toThrow();
  });

  it("returns ok:false rather than throwing when a tool fails", async () => {
    const bad: ToolDefinition = {
      name: "boom",
      description: "fails",
      inputShape: "{}",
      validateInput: () => ({}),
      // @ts-expect-error minimal definition for the failure path test
      async execute() {
        throw new Error("database down");
      },
    };
    const result = await executeTool(bad, ctx, {});
    expect(result.ok).toBe(false);
    expect(result.summary).toContain("database down");
  });

  it("timeout-enforces hung tool execution", async () => {
    const hung: ToolDefinition = {
      name: "hang",
      description: "never resolves",
      inputShape: "{}",
      validateInput: () => ({}),
      timeoutMs: 20,
      // @ts-expect-error minimal definition for the timeout path test
      async execute() {
        return new Promise(() => {});
      },
    };
    const result = await executeTool(hung, ctx, {});
    expect(result.ok).toBe(false);
    expect(result.summary).toContain("timed out");
  });
});