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

  it("accepts a bare JSON array of blocks (the prompted shape)", () => {
    const raw = [
      { type: "text", text: "আজকের সংক্ষিপ্ত প্রতিবেদন: ৬৮৪টি প্রশ্ন, সঠিকতা ৭৩%।" },
      { type: "progress", accuracy: 73, streak: 0, questionsAnswered: 684, actions: [] },
      { type: "weakness", subject: "Bangla", topic: "সাহিত্য", accuracy: 68, attempts: 0, wrongCount: 0, advice: "পুনরায় পড়ুন।" },
    ];
    const out = validateAgentOutput(raw, "fallback");
    expect(out.blocks[0].type).toBe("text");
    expect(out.blocks).toHaveLength(3);
    // The persisted/display prose must be human text, never raw JSON.
    expect(agentResponseText(out)).toContain("৬৮৪টি প্রশ্ন");
    expect(agentResponseText(out)).not.toContain('"type"');
  });

  it("recovers blocks from a JSON string with fences or surrounding prose", () => {
    const fenced = '```json\n[{"type":"text","text":"হ্যালো"},{"type":"progress","accuracy":80,"streak":2,"questionsAnswered":10}]\n```';
    const out = validateAgentOutput(fenced, "fallback");
    expect(out.blocks[0].type).toBe("text");
    if (out.blocks[0].type === "text") {
      expect(out.blocks[0].text).toBe("হ্যালো");
    }
    const wrapped = `Here is your brief: [{"type":"text","text":"এগিয়ে যান"}] hope it helps.`;
    const out2 = validateAgentOutput(wrapped, "fallback");
    expect(out2.blocks[0].type).toBe("text");
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
