import { describe, expect, it, vi } from "vitest";

import {
  conceptKey,
  createQuestionIdentityService,
  exactHash,
  nearHash,
  normalizeQuestionIdentity,
  templateHash,
} from "~backend/services/adaptive-exam/question-identity";
import {
  createGlobalDuplicateService,
  createInMemoryQuestionExposureStore,
} from "~backend/services/adaptive-exam/global-duplicate-service";
import { createAnswerVerificationEngine } from "~backend/services/adaptive-exam/answer-verification-engine";
import type {
  IndependentSolverPort,
  QuestionOptions,
} from "~backend/services/adaptive-exam/contracts";

const OPTIONS: QuestionOptions = { A: " Dhaka ", B: "Chattogram", C: "Khulna", D: "Rajshahi" };
const BASE_INPUT = {
  profileId: "BCS_PRELIMINARY" as const,
  subjectId: "bangla",
  topicPath: "bangla/sahitya",
  revisionMode: false,
  currentPaperFingerprints: new Set<string>(),
};

function service() {
  const store = createInMemoryQuestionExposureStore();
  const identity = createQuestionIdentityService();
  const duplicates = createGlobalDuplicateService({ identity, store });
  return { store, identity, duplicates };
}

function solver(answer: "A" | "B" | "C" | "D", provider = "groq"): IndependentSolverPort {
  return {
    async solve() {
      return { answer, explanation: "independent derivation", provider, model: "test-model", confidence: 0.9 };
    },
  };
}

describe("adaptive question identity and global duplicate gate", () => {
  it("normalizes invisible characters, Bengali numerals, case and whitespace without losing meaning", () => {
    expect(normalizeQuestionIdentity("  কত  ১২৩\u200B?  ")).toBe("কত 123?");
    expect(normalizeQuestionIdentity("WHAT  IS\t2")).toBe("what is 2");
  });

  it("rejects exact duplicates across papers even after normalization", async () => {
    const { duplicates, identity } = service();
    const original = "What is the capital of Bangladesh?";
    const decision = await duplicates.check({
      ...BASE_INPUT,
      questionText: "  what is the capital of bangladesh?\u200B ",
      options: OPTIONS,
    });
    expect(decision.accepted).toBe(true);

    await duplicates.record({
      fingerprint: identity.fingerprint(original, OPTIONS),
      profileId: BASE_INPUT.profileId,
      subjectId: BASE_INPUT.subjectId,
      topicPath: BASE_INPUT.topicPath,
      source: "GENERATED",
      visibility: "PUBLIC",
      paperId: "paper-1",
    });

    const repeat = await duplicates.check({ ...BASE_INPUT, questionText: original, options: OPTIONS });
    expect(repeat.accepted).toBe(false);
    expect(repeat.level).toBe("EXACT");
    expect(repeat.matchedExposureId).toBe("exposure-1");
  });

  it("catches near duplicates that differ only by punctuation", async () => {
    const { duplicates, identity, store } = service();
    const options = { A: "one", B: "two", C: "three", D: "four" };
    const first = "Which number comes after nine?";
    const second = "Which number comes after nine!";
    expect(exactHash(first, options)).not.toBe(exactHash(second, options));
    expect(nearHash(first, options)).toBe(nearHash(second, options));

    await duplicates.record({
      fingerprint: identity.fingerprint(first, options),
      profileId: BASE_INPUT.profileId,
      subjectId: BASE_INPUT.subjectId,
      topicPath: BASE_INPUT.topicPath,
      source: "PYQ",
      visibility: "PUBLIC",
    });
    const decision = await duplicates.check({
      ...BASE_INPUT,
      questionText: second,
      options,
    });
    expect(decision.level).toBe("NEAR");
    expect(decision.accepted).toBe(false);
    expect(store).toBeDefined();
  });

  it("catches template repeats where only numbers change", async () => {
    const { duplicates, identity } = service();
    const firstOptions = { A: "13", B: "24", C: "25", D: "26" };
    const secondOptions = { A: "38", B: "74", C: "75", D: "76" };
    const first = "What is 12 + 12?";
    const second = "What is 37 + 37?";
    expect(templateHash(first, firstOptions)).toBe(templateHash(second, secondOptions));

    await duplicates.record({
      fingerprint: identity.fingerprint(first, firstOptions),
      profileId: BASE_INPUT.profileId,
      subjectId: BASE_INPUT.subjectId,
      topicPath: BASE_INPUT.topicPath,
      source: "GENERATED",
      visibility: "PUBLIC",
    });
    const decision = await duplicates.check({
      ...BASE_INPUT,
      questionText: second,
      options: secondOptions,
    });
    expect(decision.level).toBe("TEMPLATE");
  });

  it("enforces the per-paper concept cap and never stores question text in exposure rows", async () => {
    const { duplicates, identity, store } = service();
    const firstText = "unique question 0";
    await duplicates.record({
      fingerprint: identity.fingerprint(firstText, OPTIONS),
      profileId: BASE_INPUT.profileId,
      subjectId: BASE_INPUT.subjectId,
      topicPath: BASE_INPUT.topicPath,
      source: "GENERATED",
      visibility: "PUBLIC",
    });
    const exposure = await store.findByExactHash(exactHash(firstText, OPTIONS));
    expect(exposure).not.toBeNull();
    expect(Object.keys(exposure ?? {})).not.toContain("questionText");

    const key = conceptKey("unique question 1", BASE_INPUT.subjectId, BASE_INPUT.topicPath);
    const decision = await duplicates.check({
      ...BASE_INPUT,
      questionText: "a fresh wording of the same concept",
      options: OPTIONS,
      conceptKey: key,
      currentPaperConcepts: [key, key, key],
      maxConceptOverlapPerTopic: 3,
    });
    expect(decision.level).toBe("CONCEPT");
    expect(decision.accepted).toBe(false);

  });

  it("allows deliberate revision repeats but not a repeat inside one paper", async () => {
    const { duplicates, identity } = service();
    const text = "Authentic previous-year question?";
    await duplicates.record({
      fingerprint: identity.fingerprint(text, OPTIONS),
      profileId: BASE_INPUT.profileId,
      subjectId: BASE_INPUT.subjectId,
      topicPath: BASE_INPUT.topicPath,
      source: "PYQ",
      visibility: "PUBLIC",
    });

    const revision = await duplicates.check({
      ...BASE_INPUT,
      revisionMode: true,
      questionText: text,
      options: OPTIONS,
    });
    expect(revision.accepted).toBe(true);
    expect(revision.level).toBe("REVISION");

    const fp = identity.fingerprint(text, OPTIONS);
    const inPaper = await duplicates.check({
      ...BASE_INPUT,
      revisionMode: true,
      questionText: text,
      options: OPTIONS,
      currentPaperFingerprints: new Set([fp.exactHash]),
    });
    expect(inPaper.accepted).toBe(false);
    expect(inPaper.level).toBe("EXACT");
  });
});

describe("independent answer verification", () => {
  const input = {
    questionText: "What is the capital of Bangladesh?",
    options: OPTIONS,
    claimedOption: "A" as const,
    language: "en" as const,
    subjectId: "bangla",
    topicPath: "bangla/sahitya",
    profileId: "BCS_PRELIMINARY" as const,
  };

  it("refuses to verify from mock or zero-confidence solver output", async () => {
    const engine = createAnswerVerificationEngine(solver("A", "mock"));
    const decision = await engine.verify(input);
    expect(decision.accepted).toBe(false);
    expect(decision.method).toBe("unverified");
  });

  it("rejects solver disagreement with the claimed answer", async () => {
    const engine = createAnswerVerificationEngine(solver("B"));
    const decision = await engine.verify(input);
    expect(decision.accepted).toBe(false);
    expect(decision.method).toBe("independent-solver");
  });

  it("accepts only after independent agreement, with the claimed answer as the key", async () => {
    const solve = vi.fn(solver("A").solve);
    const engine = createAnswerVerificationEngine({ solve });
    const decision = await engine.verify(input);
    expect(solve).toHaveBeenCalledTimes(1);
    expect(decision.accepted).toBe(true);
    expect(decision.correctOption).toBe("A");
    expect(decision.confidence).toBeGreaterThan(0);
  });

  it("cross-checks arithmetic deterministically and rejects a false agreement", async () => {
    const engine = createAnswerVerificationEngine(solver("B"));
    const decision = await engine.verify({
      ...input,
      questionText: "What is 2 + 2?",
      options: { A: "3", B: "5", C: "4", D: "6" },
      claimedOption: "B",
      subjectId: "ganit",
      topicPath: "ganit/arithmetic",
    });
    expect(decision.accepted).toBe(false);
    expect(decision.method).toBe("deterministic");
  });

  it("requires dated evidence for current-affairs questions", async () => {
    const engine = createAnswerVerificationEngine(solver("A"));
    const currentAffairs = { ...input, subjectId: "current-affairs", topicPath: "current-affairs/2026" };
    expect((await engine.verify(currentAffairs)).accepted).toBe(false);
    const withEvidence = await engine.verify({
      ...currentAffairs,
      evidence: [{ url: "https://example.com/notice", publishedAt: "2026-11-01T00:00:00.000Z" }],
    });
    expect(withEvidence.accepted).toBe(true);
  });

  it("rejects malformed options and missing claims without calling a solver", async () => {
    const solve = vi.fn(solver("A").solve);
    const engine = createAnswerVerificationEngine({ solve });
    expect((await engine.verify({ ...input, options: { A: "only one" } as never })).accepted).toBe(false);
    expect((await engine.verify({ ...input, claimedOption: undefined })).accepted).toBe(false);
    expect(solve).not.toHaveBeenCalled();
  });
});
