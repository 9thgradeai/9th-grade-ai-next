import { describe, it, expect } from "vitest";
import { validateAgentOutput, agentResponseText } from "~backend/ai/agent/response";
import { parseAgentTurn, MAX_AGENT_STEPS } from "~backend/ai/agent/prompt";
import { validateAgentRequest } from "~backend/ai/schemas";
import { ValidationError } from "~backend/errors";

describe("agent response validation", () => {
  it("normalizes a valid blocks array and guarantees a leading text block", () => {
    const out = validateAgentOutput({
      blocks: [
        { type: "progress", accuracy: 62, streak: 3, questionsAnswered: 40 },
        { type: "weakness", subject: "গণিত", topic: "Algebra", accuracy: 40, attempts: 10, wrongCount: 6, advice: "Practice linear equations." },
      ],
    }, "fallback");
    expect(out.blocks[0].type).toBe("text");
    expect(out.blocks[1].type).toBe("progress");
    expect(out.blocks[2].type).toBe("weakness");
  });

  it("drops malformed blocks and clamps actions", () => {
    const out = validateAgentOutput({
      blocks: [
        { type: "nonsense" },
        { type: "practice_action", label: "Go", questionCount: 5, actions: [{ type: "practice", label: "Start" }, { type: "evil", label: "No" }] },
        42,
        "text",
      ],
    });
    expect(out.blocks).toHaveLength(2);
    expect(out.blocks[1].type).toBe("practice_action");
    if (out.blocks[1].type === "practice_action") {
      expect(out.blocks[1].actions).toHaveLength(1);
      expect(out.blocks[1].actions![0].type).toBe("practice");
    }
  });

  it("wraps bare prose into a single text block", () => {
    const out = validateAgentOutput("just some prose", "fb");
    expect(out.blocks).toHaveLength(1);
    expect(out.blocks[0].type).toBe("text");
  });

  it("agentResponseText extracts only text blocks", () => {
    const out = validateAgentOutput({
      blocks: [
        { type: "text", text: "Hello" },
        { type: "study_recommendation", title: "T", reason: "R", actions: [] },
        { type: "text", text: "World" },
      ],
    });
    expect(agentResponseText(out)).toBe("Hello\n\nWorld");
  });
});

describe("agent prompt parsing", () => {
  it("exposes a step bound", () => {
    expect(MAX_AGENT_STEPS).toBeGreaterThan(0);
  });

  it("parses a tool-call turn into a typed envelope", () => {
    const raw = JSON.stringify({ tool: "get_my_profile", arguments: {} });
    const turn = parseAgentTurn(raw);
    expect(turn.toolCall).not.toBeNull();
    expect(turn.toolCall!.name).toBe("get_my_profile");
  });

  it("treats a text-only turn as final", () => {
    const raw = JSON.stringify({ thought: "done", blocks: [{ type: "text", text: "hi" }] });
    const turn = parseAgentTurn(raw);
    expect(turn.toolCall).toBeNull();
  });
});

describe("agent request validation", () => {
  it("requires a non-empty question", () => {
    expect(() => validateAgentRequest({})).toThrow(ValidationError);
    expect(() => validateAgentRequest({ question: "   " })).toThrow(ValidationError);
  });

  it("carries context + intent", () => {
    const req = validateAgentRequest({ question: "What next?", context: { subjectId: 3, topicId: 9 }, intent: "recommend" });
    expect(req.question).toBe("What next?");
    expect(req.context.subjectId).toBe(3);
    expect(req.context.topicId).toBe(9);
    expect(req.intent).toBe("recommend");
  });

  it("tolerates missing context", () => {
    const req = validateAgentRequest({ question: "ok" });
    expect(req.context).toEqual({ subjectId: undefined, topicId: undefined, topicPath: undefined, questionId: undefined });
  });
});
