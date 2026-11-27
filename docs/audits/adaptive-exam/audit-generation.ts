// Isolated AUDIT script — SIMULATED AI provider stub (no real provider calls).
// Purpose: exercise the real generation pipeline mechanics and measure repetition.
import fs from "node:fs";
import { createAdaptiveExamOrchestrator } from "../../../backend/services/adaptive-exam/orchestrator";
import { createInMemoryProfileSnapshotStore, createProfileRegistry } from "../../../backend/services/adaptive-exam/profile-registry";
import { createHistoricalAnalyticsService, createInMemoryAnalyticsSnapshotStore } from "../../../backend/services/adaptive-exam/historical-analytics";
import { createInMemoryHistoricalRepository } from "../../../backend/services/adaptive-exam/historical-repository";
import { createInMemoryAnswerKeyStore } from "../../../backend/services/adaptive-exam/answer-key-store";
import type { AdaptiveExecutionContext } from "../../../backend/services/adaptive-exam/contracts";

async function main() {
  const clock = { now: () => new Date().toISOString() };
  const snapshotStore = createInMemoryProfileSnapshotStore();
  const profileRegistry = createProfileRegistry({ store: snapshotStore, clock, requestId: "audit" });
  const historicalRepository = createInMemoryHistoricalRepository([]);
  const historicalAnalytics = createHistoricalAnalyticsService({
    repository: historicalRepository,
    clock,
    requestId: "audit",
    snapshotStore: createInMemoryAnalyticsSnapshotStore(),
  });
  const answerKeys = createInMemoryAnswerKeyStore();
  const orchestrator = createAdaptiveExamOrchestrator({ profileRegistry, historicalAnalytics, historicalRepository, clock });

  let aiCalls = 0;
  const ai = {
    async generate(req: any) {
      aiCalls += 1;
      const topic = req.topicPath ?? req.subjectId;
      return {
        questions: [{
          questionText: `Simulated question about ${req.subjectId} | ${topic} | ${req.language} | ${req.difficulty}`,
          options: { A: "Option A", B: "Option B", C: "Option C", D: "Option D" },
          correctOption: "A",
          explanation: "Simulated explanation.",
          topicPath: topic,
          difficulty: req.difficulty,
          provenance: { sourceType: "ORIGINAL", generatedAt: clock.now(), generator: "audit-stub" },
        }],
        provider: "audit-simulated",
        model: "deterministic-stub",
        promptVersion: "audit-v1",
      };
    },
  };

  const results: any[] = [];
  const allTexts: string[] = [];
  for (let i = 1; i <= 5; i += 1) {
    const c: AdaptiveExecutionContext = {
      userId: `audit-user-${i}`,
      requestId: `audit-${i}`,
      ports: { ai, answerKeys } as any,
    };
    const prepared = await orchestrator.prepare(c, {
      userId: c.userId,
      family: "BCS",
      profileId: "BCS_PRELIMINARY",
      profileVersion: 1,
      subjects: [],
      requestedQuestionCount: 200,
      mode: "PRACTICE",
      adaptationEnabled: false,
      idempotencyKey: `audit-${i}`,
    } as any);
    const paper = await orchestrator.generatePaper(c, prepared.blueprint.id);
    const texts = paper.questions.map((q: any) => q.questionText as string);
    allTexts.push(...texts);
    results.push({
      paper: i,
      blueprintId: prepared.blueprint.id,
      questionCount: texts.length,
      uniqueTextsWithinPaper: new Set(texts).size,
      subjects: new Set(paper.questions.map((q: any) => q.subjectId)).size,
      sourceTypes: [...new Set(paper.questions.map((q: any) => q.sourceType))],
      validation: paper.validation,
      answerKeyEntries: (await answerKeys.getForScoring(prepared.blueprint.id))?.entries.length ?? 0,
    });
  }
  const total = allTexts.length;
  const unique = new Set(allTexts).size;
  const output = {
    label: "SIMULATED — deterministic AI stub, not a real provider",
    aiCalls,
    papers: results,
    totalQuestions: total,
    uniqueQuestionsAcrossPapers: unique,
    exactDuplicateRate: Number(((total - unique) / Math.max(1, total)).toFixed(4)),
  };
  fs.mkdirSync("docs/audits/adaptive-exam", { recursive: true });
  fs.writeFileSync("docs/audits/adaptive-exam/generation-simulated.json", JSON.stringify(output, null, 2));
  console.log(JSON.stringify(output, null, 2));
}
main().catch((e) => { console.error(e); process.exit(1); });
