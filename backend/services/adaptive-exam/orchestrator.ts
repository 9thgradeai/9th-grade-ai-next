// backend/services/adaptive-exam/orchestrator.ts
// Module 10 of Adaptive Exam V2.0: AdaptiveExamOrchestrator.
//
// The only module route handlers call. Orders the pipeline, enforces ownership
// and idempotency at each boundary and delegates all logic to injected ports.
// Missing paper/key/profile/verification always fails loud — never a zero score
// or a guessed answer.

import "server-only";

import type {
  AdaptiveExecutionContext,
  AdaptiveExamOrchestrator,
  AiGenerationPort,
  AnswerKeyStore,
  AnswerVerificationPort,
  CandidatePaperQuestion,
  EntityId,
  ExamAuditService,
  ExamBlueprint,
  ExamProfile,
  ExamProfileRegistry,
  ExamSession,
  GenerationTelemetry,
  GenerationTelemetrySummary,
  GlobalDuplicateService,
  HistoricalAnalyticsService,
  HistoricalQuestionRecord,
  PaperSnapshot,
  PaperStore,
  PerformanceReport,
  PreparedExam,
  PrepareAdaptiveExamCommand,
  QuestionIdentityService,
  ScoreReport,
  ScoreReportStore,
  SecureAnswerKey,
  SubmitAdaptiveExamCommand,
} from "./contracts";
import { adaptiveError } from "./errors";
import type { AnswerKeyEntitlementService } from "./answer-key-entitlement";
import { createCandidatePerformanceService, createInMemoryCandidateEvidenceReader, type CandidateEvidenceReader } from "./candidate-performance";
import {
  createAdaptiveBlueprintService,
  createInMemoryAdaptiveBlueprintStore,
  type AdaptiveBlueprintStore,
} from "./adaptive-blueprint";
import { createQuestionSelectionService } from "./question-selection";
import { createSubjectSpecialistService } from "./subject-specialist";
import { createQuestionGenerationService } from "./question-generation";
import { createQuestionValidationService } from "./question-validation";
import {
  createExamSessionService,
  createInMemoryExamSessionStore,
  type ExamSessionStore,
} from "./exam-session";
import { createExamScoringService } from "./exam-scoring";
import { createAdaptiveRecommendationService } from "./adaptive-recommendation";
import { hashSnapshot } from "./hash";
import { createQuestionIdentityService } from "./question-identity";
import {
  createGlobalDuplicateService,
  createInMemoryQuestionExposureStore,
} from "./global-duplicate-service";
import {
  createAnswerVerificationEngine,
  createIndependentSolver,
} from "./answer-verification-engine";

export type OrchestratorPorts = {
  profileRegistry: ExamProfileRegistry;
  historicalAnalytics: HistoricalAnalyticsService;
  historicalRepository: {
    findEligible(criteria: unknown): Promise<HistoricalQuestionRecord[]>;
    count(criteria: unknown): Promise<number>;
    getByIds(ids: EntityId[]): Promise<HistoricalQuestionRecord[]>;
    findDuplicateGroup(fingerprint: string): Promise<EntityId | null>;
    findAll?(criteria: unknown): Promise<HistoricalQuestionRecord[]>;
  };
  clock: { now(): string };
  candidateReader?: CandidateEvidenceReader;
  blueprintStore?: AdaptiveBlueprintStore;
  paperStore?: PaperStore;
  sessionStore?: ExamSessionStore;
  answerKeys?: AnswerKeyStore;
  reportStore?: ScoreReportStore;
  audit?: ExamAuditService;
  ai?: AiGenerationPort;
  identity?: QuestionIdentityService;
  duplicateGate?: GlobalDuplicateService;
  verification?: AnswerVerificationPort;
  generationTelemetry?: (records: GenerationTelemetry[], ctx: AdaptiveExecutionContext) => Promise<void>;
  answerKeyEntitlement?: AnswerKeyEntitlementService;
  newId?(): string;
};

const UNAVAILABLE_AI: AiGenerationPort = {
  async generate() {
    throw adaptiveError("ADAPTIVE_DEPENDENCY_UNAVAILABLE", "No AI generation provider is configured for adaptive papers.", {
      stage: "generation",
      requestId: "orchestrator",
    });
  },
};

export function createAdaptiveExamOrchestrator(ports: OrchestratorPorts): AdaptiveExamOrchestrator {
  const {
    profileRegistry,
    historicalAnalytics,
    historicalRepository,
    clock,
  } = ports;

  const identity = ports.identity ?? createQuestionIdentityService();
  const duplicateGate = ports.duplicateGate ?? createGlobalDuplicateService({
    identity,
    store: createInMemoryQuestionExposureStore(),
  });
  const verification = ports.verification ?? createAnswerVerificationEngine(createIndependentSolver());
  const paperStore = ports.paperStore ?? createInMemoryPaperStore();
  const sessionStore = ports.sessionStore ?? createInMemoryExamSessionStore();
  const answerKeys = ports.answerKeys ?? {
    put: async () => undefined,
    getForScoring: async () => null,
    releaseForReview: async () => null,
  } satisfies AnswerKeyStore;
  const reportStore = ports.reportStore ?? createInMemoryReportStore();
  const blueprintStore = ports.blueprintStore ?? createInMemoryAdaptiveBlueprintStore();

  const candidateService = createCandidatePerformanceService({
    reader: ports.candidateReader ?? createInMemoryCandidateEvidenceReader(),
    clock,
    requestId: "orchestrator",
  });
  const blueprintService = createAdaptiveBlueprintService({
    clock,
    requestId: "orchestrator",
    store: blueprintStore,
  });
  const selectionService = createQuestionSelectionService({
    repository: historicalRepository as Parameters<typeof createQuestionSelectionService>[0]["repository"],
  });
  const specialistService = createSubjectSpecialistService();
  const generationService = createQuestionGenerationService({
    identity,
    duplicateGate,
    verification,
  });
  const validationService = createQuestionValidationService({ clock });
  const scoringService = createExamScoringService();
  const recommendationService = createAdaptiveRecommendationService();

  const sessionService = createExamSessionService({
    store: sessionStore,
    clock,
    requestId: "orchestrator",
    resolvePaper: async (paperId) => {
      const paper = await paperStore.get(paperId);
      if (!paper) return null;
      const blueprint = await blueprintService.getById(paper.blueprintId);
      if (!blueprint) return null;
      return {
        paperId: paper.id,
        blueprintId: blueprint.id,
        profileId: blueprint.profileId,
        profileVersion: blueprint.profileVersion,
        durationSec: blueprint.durationSec,
      };
    },
  });

  function fail(
    code: Parameters<typeof adaptiveError>[0],
    message: string,
    metadata: Record<string, unknown> = {},
  ): never {
    throw adaptiveError(code, message, { stage: "integration", requestId: "orchestrator", metadata });
  }

  async function audit(
    ctx: AdaptiveExecutionContext,
    name: Parameters<NonNullable<ExamAuditService["record"]>>[0]["name"],
    entityType: string,
    entityId: EntityId,
    metadata: Record<string, unknown> = {},
  ): Promise<void> {
    if (!ports.audit) return;
    await ports.audit.record({
      name,
      occurredAt: clock.now(),
      requestId: ctx.requestId,
      ...(ctx.correlationId ? { correlationId: ctx.correlationId } : {}),
      actorId: ctx.userId,
      entityType,
      entityId,
      metadata,
    });
  }

  function summarizeTelemetry(records: GenerationTelemetry[]): GenerationTelemetrySummary {
    const providers = new Set<string>();
    const models = new Set<string>();
    const promptVersions = new Set<string>();
    const total: GenerationTelemetrySummary = {
      providers: [],
      models: [],
      promptVersions: [],
      mock: false,
      batches: 0,
      questions: 0,
      inputTokens: 0,
      outputTokens: 0,
      costUsd: 0,
      durationMs: 0,
    };
    for (const record of records) {
      providers.add(record.provider);
      models.add(record.model);
      promptVersions.add(record.promptVersion);
      total.mock ||= record.mock;
      total.batches += record.batches;
      total.questions += record.questions;
      total.inputTokens += record.inputTokens;
      total.outputTokens += record.outputTokens;
      total.costUsd += record.costUsd;
      total.durationMs += record.durationMs;
    }
    total.providers = [...providers].sort();
    total.models = [...models].sort();
    total.promptVersions = [...promptVersions].sort();
    return total;
  }

  async function resolveProfile(id: string, version?: number): Promise<ExamProfile> {
    const profile = await profileRegistry.resolve(id, version);
    if (!profile) {
      fail("ADAPTIVE_PROFILE_NOT_FOUND", "Profile not found.", { profileId: id, version });
    }
    return profile;
  }

  return {
    async prepare(ctx, command: PrepareAdaptiveExamCommand) {
      const profile = await resolveProfile(command.profileId, command.profileVersion);
      if (command.family !== profile.family) {
        fail("ADAPTIVE_HISTORICAL_SCOPE_INVALID", "Requested family does not match the profile.", {
          family: command.family,
          profileFamily: profile.family,
        });
      }
      if (command.mode === "FULL_EXAM_SIMULATION" && !profileRegistry.officialSimulationEnabled(profile)) {
        fail("ADAPTIVE_PROFILE_NOT_APPROVED", "Official simulation is not enabled for this profile.", {
          profileId: profile.id,
          verificationStatus: profile.verificationStatus,
          provisional: profile.provisional,
        });
      }

      const candidate = await candidateService.snapshot(ctx.userId, profile.id);
      const historical = await historicalAnalytics.analyze({ family: profile.family, profileId: profile.id });
      const draft = await blueprintService.build(command, profile, candidate, historical);
      const validation = blueprintService.validate(draft);
      if (!validation.valid) {
        fail("ADAPTIVE_BLUEPRINT_INVALID", "Blueprint validation failed.", { issues: validation.issues });
      }
      const blueprint = await blueprintService.commit(draft, ctx);
      await audit(ctx, "BLUEPRINT_COMMITTED", "ExamBlueprint", blueprint.id, {
        profileId: profile.id,
        profileVersion: profile.version,
        mode: command.mode,
      });

      return {
        blueprint,
        candidateSnapshotHash: candidate.hash,
        estimatedHistoricalCount: blueprint.sourceAllocation.PYQ ?? 0,
        estimatedGeneratedCount: blueprint.sourceAllocation.ORIGINAL ?? 0,
        warnings: [...blueprint.warnings, ...candidate.warnings],
      } satisfies PreparedExam;
    },

    async generatePaper(ctx, blueprintId) {
      const blueprint = await blueprintService.getById(blueprintId);
      if (!blueprint) {
        fail("ADAPTIVE_BLUEPRINT_NOT_FOUND", "Blueprint not found.", { blueprintId });
      }
      const profile = await resolveProfile(blueprint.profileId, blueprint.profileVersion);

      const candidateSnapshot = await candidateService.snapshot(ctx.userId, blueprint.profileId);
      const selectedQuestions = await selectionService.select({
        blueprint,
        candidate: candidateSnapshot,
        excludeIds: [...(candidateSnapshot.attemptedQuestionIds ?? [])],
      });

      const generation = await generationService.generateWithKeys(
        selectedQuestions,
        profile,
        specialistService,
        { ...ctx, ports: { ...ctx.ports, ai: ports.ai ?? ctx.ports?.ai ?? UNAVAILABLE_AI } },
      );
      const telemetry = summarizeTelemetry(generation.telemetry);
      if (ports.generationTelemetry) {
        await ports.generationTelemetry(generation.telemetry, ctx);
      }
      await audit(ctx, "QUESTIONS_GENERATED", "PaperSnapshot", blueprint.id, { telemetry });

      const validationReport = await validationService.validatePaper(generation.candidateQuestions, blueprint);
      if (validationReport.outcome === "REJECTED") {
        await audit(ctx, "PAPER_REJECTED", "PaperSnapshot", blueprint.id, {
          findings: validationReport.findings.map((finding) => finding.rule),
        });
        fail("ADAPTIVE_VALIDATION_FAILED", "Paper validation failed.", {
          findings: validationReport.findings,
        });
      }

      const keyByPosition = new Map(generation.answerKeyEntries.map((entry) => [entry.position, entry]));
      const validatedQuestions: CandidatePaperQuestion[] = [];
      const answerKeyEntries: SecureAnswerKey["entries"] = [];
      for (const question of generation.candidateQuestions) {
        const entry = keyByPosition.get(question.position);
        // Fail loud: a question without an independently verified key entry
        // must never reach a candidate or be scored as "A"/zero.
        if (!entry) {
          fail("ADAPTIVE_ANSWER_KEY_MISSING", "No verified answer key entry for a generated question.", {
            position: question.position,
            subjectId: question.subjectId,
          });
        }
        validatedQuestions.push(question);
        answerKeyEntries.push(entry);
      }
      if (answerKeyEntries.length !== validatedQuestions.length) {
        fail("ADAPTIVE_ANSWER_KEY_CORRUPT", "Answer key count does not match paper.", {
          questions: validatedQuestions.length,
          keyEntries: answerKeyEntries.length,
        });
      }

      const paper: PaperSnapshot = {
        id: ports.newId?.() ?? randomId(),
        version: 1,
        blueprintId: blueprint.id,
        blueprintHash: blueprint.hash,
        createdAt: clock.now(),
        questions: validatedQuestions,
        contentHash: hashSnapshot({
          blueprintId: blueprint.id,
          blueprintHash: blueprint.hash,
          questions: validatedQuestions,
        }),
        validation: validationReport.outcome,
      };
      await paperStore.put(paper);
      if (sessionStore.putPaperSnapshot) await sessionStore.putPaperSnapshot(paper);

      const secureKey: SecureAnswerKey = {
        paperId: paper.id,
        contentHash: paper.contentHash,
        entries: answerKeyEntries,
        createdAt: clock.now(),
      };
      await answerKeys.put(paper.id, secureKey);
      await audit(ctx, "PAPER_SNAPSHOT_CREATED", "PaperSnapshot", paper.id, {
        blueprintId: blueprint.id,
        questionCount: paper.questions.length,
      });
      return paper;
    },

    async getPaper(paperId) {
      return paperStore.get(paperId);
    },

    async startSession(ctx, command) {
      const session = await sessionService.create(ctx, command);
      await audit(ctx, "SESSION_STARTED", "ExamSession", session.attemptId, {
        paperId: session.paperId,
        expiresAt: session.expiresAt,
      });
      return session;
    },

    async getSession(userId, attemptId) {
      return sessionService.get(userId, attemptId);
    },

    async recordAnswer(userId, attemptId, position, option, expectedVersion) {
      return sessionService.recordAnswer(userId, attemptId, position, option, expectedVersion);
    },

    async setFlag(userId, attemptId, position, flagged, expectedVersion) {
      return sessionService.setFlag(userId, attemptId, position, flagged, expectedVersion);
    },

    async submit(ctx, command: SubmitAdaptiveExamCommand) {
      const existingReport = await reportStore.getScore(command.attemptId);
      if (existingReport) return existingReport;

      // Resolve every immutable artifact BEFORE the session becomes terminal.
      const session = await sessionService.get(ctx.userId, command.attemptId);
      if (!session) {
        fail("ADAPTIVE_OWNERSHIP_DENIED", "Session not found or not owned by user.", {
          attemptId: command.attemptId,
        });
      }
      const paper = await paperStore.get(command.paperId);
      if (!paper || paper.id !== session.paperId) {
        fail("ADAPTIVE_PAPER_NOT_FOUND", "Paper not found for this attempt.", {
          attemptId: command.attemptId,
          paperId: command.paperId,
        });
      }
      const key = await answerKeys.getForScoring(paper.id);
      if (!key) {
        fail("ADAPTIVE_ANSWER_KEY_MISSING", "No verified answer key exists for this paper.", {
          paperId: paper.id,
        });
      }
      const profile = await resolveProfile(session.profileId, session.profileVersion);

      const finalSession = await sessionService.submit(ctx, command);
      const submittedAt = finalSession.submittedAt ?? clock.now();
      const elapsedSec = Math.max(
        0,
        Math.floor((new Date(submittedAt).getTime() - new Date(finalSession.startsAt).getTime()) / 1000),
      );
      const serverCommand: SubmitAdaptiveExamCommand = {
        ...command,
        answers: Object.entries(finalSession.answers).map(([position, option]) => ({
          position: Number(position),
          option,
        })),
        durationSec: elapsedSec,
      };
      const score = scoringService.score(paper, key, profile, serverCommand);
      const candidateSnapshot = await candidateService.snapshot(ctx.userId, profile.id);
      const performance = recommendationService.buildReport(score, candidateSnapshot, paper);
      await reportStore.put({
        score,
        report: performance,
        candidateSnapshotHash: candidateSnapshot.hash,
      });
      await recommendationService.applyToCandidateProfile(ctx, performance);
      await audit(ctx, "SCORE_COMPUTED", "ScoreReport", command.attemptId, {
        paperId: paper.id,
        correct: score.correct,
        elapsedSec,
      });
      return score;
    },

    async report(ctx, attemptId) {
      const session = await sessionService.get(ctx.userId, attemptId);
      if (!session) {
        fail("ADAPTIVE_OWNERSHIP_DENIED", "Attempt not found or not owned by user.", { attemptId });
      }
      const stored = await reportStore.getReport(attemptId);
      if (!stored) {
        fail("ADAPTIVE_SUBMISSION_NOT_FOUND", "No immutable report exists for this attempt.", {
          attemptId,
        });
      }
      return stored;
    },

    async releaseAnswerKey(ctx, attemptId) {
      const session = await sessionService.get(ctx.userId, attemptId);
      if (!session || session.status !== "COMPLETED") {
        fail("ADAPTIVE_ANSWER_KEY_RELEASE_DENIED", "Answer key is not available before submission.", {
          attemptId,
        });
      }
      if (ports.answerKeyEntitlement) {
        return ports.answerKeyEntitlement.release(attemptId, ctx);
      }
      return answerKeys.releaseForReview(attemptId, ctx);
    },
  };
}

function createInMemoryPaperStore(): PaperStore {
  const rows = new Map<string, PaperSnapshot>();
  return {
    async put(paper) {
      if (rows.has(paper.id)) {
        throw adaptiveError("ADAPTIVE_IDEMPOTENCY_CONFLICT", "Paper id already exists.", {
          stage: "generation",
          requestId: "orchestrator",
          metadata: { paperId: paper.id },
        });
      }
      rows.set(paper.id, paper);
      return paper;
    },
    async get(paperId) {
      return rows.get(paperId) ?? null;
    },
  };
}

function createInMemoryReportStore(): ScoreReportStore {
  const scores = new Map<string, ScoreReport>();
  const reports = new Map<string, PerformanceReport>();
  return {
    async put({ score, report }) {
      if (scores.has(score.attemptId)) return;
      scores.set(score.attemptId, score);
      reports.set(report.attemptId, report);
    },
    async getScore(attemptId) {
      return scores.get(attemptId) ?? null;
    },
    async getReport(attemptId) {
      return reports.get(attemptId) ?? null;
    },
  };
}

let fallbackIdCounter = 0;
function randomId(): string {
  fallbackIdCounter += 1;
  return `paper-${Date.now().toString(36)}-${fallbackIdCounter}`;
}
