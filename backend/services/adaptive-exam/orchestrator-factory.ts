// backend/services/adaptive-exam/orchestrator-factory.ts
// Production wiring. Every port is a real service; in-memory fallbacks exist
// only inside tests. Seeding is idempotent and runs before any candidate call.

import "server-only";

import { randomUUID } from "node:crypto";

import { prisma } from "~backend/db";
import {
  createAdaptiveExamOrchestrator,
  type OrchestratorPorts,
} from "./orchestrator";
import {
  createProfileRegistry,
  type ProfileRegistry,
} from "./profile-registry";
import { createPrismaProfileSnapshotStore } from "./prisma-profile-snapshot-store";
import {
  createHistoricalAnalyticsService,
  createPrismaAnalyticsSnapshotStore,
} from "./historical-analytics";
import {
  createPrismaHistoricalRepository,
} from "./historical-repository";
import { createPrismaCandidateEvidenceReader } from "./candidate-performance";
import { createPrismaAdaptiveBlueprintStore } from "./adaptive-blueprint";
import { createPrismaPaperStore } from "./prisma-paper-store";
import { createPrismaExamSessionStore } from "./prisma-session-store";
import {
  createAttemptOwnerResolver,
  createPrismaAnswerKeyStore,
} from "./prisma-answer-key-store";
import { createPrismaScoreReportStore } from "./prisma-score-report-store";
import { createPrismaExamAuditService } from "./prisma-audit-service";
import { createPrismaQuestionExposureStore } from "./prisma-exposure-store";
import { createPrismaMockPublicationStore } from "./prisma-publication-store";
import { createPrismaGenerationJobStore } from "./prisma-generation-job-store";
import { createPrismaAdaptiveCatalogStore } from "./prisma-catalog-store";
import { createAdaptiveCatalogService } from "./adaptive-catalog-service";
import { createAdaptiveLibraryService } from "./adaptive-library-service";
import { createAnswerKeyEntitlementService } from "./answer-key-entitlement";
import { createLiveQuestionImportService } from "./live-question-import";
import { createAiGenerationAdapter } from "./ai-generation-adapter";
import { createAdaptiveGenerationTelemetryRecorder } from "./adaptive-generation-telemetry";
import { createQuestionIdentityService } from "./question-identity";
import { createGlobalDuplicateService } from "./global-duplicate-service";
import {
  createAnswerVerificationEngine,
  createIndependentSolver,
} from "./answer-verification-engine";
import { createGenerationJobService } from "./generation-job";
import type {
  AdaptiveExamOrchestrator,
  GenerationJobService,
} from "./contracts";

export type AdaptiveServices = {
  orchestrator: AdaptiveExamOrchestrator;
  ports: OrchestratorPorts;
  registry: ProfileRegistry;
  catalog: ReturnType<typeof createAdaptiveCatalogService>;
  library: ReturnType<typeof createAdaptiveLibraryService>;
  generationJobs: GenerationJobService;
  liveImport: ReturnType<typeof createLiveQuestionImportService>;
};

let cached: Promise<AdaptiveServices> | null = null;

async function buildServices(): Promise<AdaptiveServices> {
  const clock = { now: () => new Date().toISOString() };
  const requestId = "adaptive-api";

  const registry = createProfileRegistry({
    store: createPrismaProfileSnapshotStore(prisma),
    clock,
    requestId,
  });
  await registry.ensureSeeded();

  const answerKeys = createPrismaAnswerKeyStore(prisma);
  const audit = createPrismaExamAuditService(prisma);
  const paperStore = createPrismaPaperStore(prisma);
  const sessionStore = createPrismaExamSessionStore(prisma);
  const reportStore = createPrismaScoreReportStore(prisma);
  const historicalRepository = createPrismaHistoricalRepository(prisma);
  const historicalAnalytics = createHistoricalAnalyticsService({
    repository: historicalRepository,
    clock,
    requestId,
    snapshotStore: createPrismaAnalyticsSnapshotStore(prisma),
  });

  const identity = createQuestionIdentityService();
  const duplicateGate = createGlobalDuplicateService({
    identity,
    store: createPrismaQuestionExposureStore(prisma),
    idFactory: () => randomUUID(),
  });

  const ports: OrchestratorPorts = {
    profileRegistry: registry,
    historicalAnalytics,
    historicalRepository,
    clock,
    candidateReader: createPrismaCandidateEvidenceReader(prisma),
    blueprintStore: createPrismaAdaptiveBlueprintStore(prisma),
    paperStore,
    sessionStore,
    answerKeys,
    reportStore,
    audit,
    ai: createAiGenerationAdapter(),
    generationTelemetry: createAdaptiveGenerationTelemetryRecorder(),
    identity,
    duplicateGate,
    verification: createAnswerVerificationEngine(createIndependentSolver()),
    answerKeyEntitlement: createAnswerKeyEntitlementService({
      store: answerKeys,
      audit,
      clock,
      requestId,
      attemptOwner: createAttemptOwnerResolver(prisma),
      isSubmitted: async (attemptId) => {
        const row = await prisma.adaptiveExamSession.findUnique({
          where: { id: attemptId },
          select: { status: true },
        });
        return row?.status === "COMPLETED";
      },
      isAdmin: async (userId) => {
        const user = await prisma.user.findUnique({
          where: { id: userId },
          select: { role: true },
        });
        return user?.role === "ADMIN";
      },
    }),
    newId: () => randomUUID(),
  };

  const orchestrator = createAdaptiveExamOrchestrator(ports);
  const catalog = createAdaptiveCatalogService(
    registry,
    createPrismaAdaptiveCatalogStore(prisma),
  );
  const library = createAdaptiveLibraryService({
    publications: createPrismaMockPublicationStore(prisma),
    papers: paperStore,
    clock,
    resolvePaperProfile: async (paperId) => {
      const paper = await paperStore.get(paperId);
      if (!paper) return null;
      const row = await prisma.adaptiveBlueprint.findUnique({
        where: { id: paper.blueprintId },
        select: { family: true, profileId: true },
      });
      if (!row) return null;
      return {
        family: row.family as "BCS" | "BANK" | "OTHERS",
        profileId: row.profileId,
      };
    },
  });
  const generationJobs = createGenerationJobService({
    store: createPrismaGenerationJobStore(prisma),
    orchestrator,
    clock,
    newId: () => randomUUID(),
  });
  const liveImport = createLiveQuestionImportService({
    client: prisma,
    clock,
    requestId,
    registry,
    verification: createAnswerVerificationEngine(createIndependentSolver()),
  });

  return { orchestrator, ports, registry, catalog, library, generationJobs, liveImport };
}

/** Cached so repeated route calls do not re-run seed checks per request. */
export function createDefaultAdaptiveServices(): Promise<AdaptiveServices> {
  if (!cached) {
    cached = buildServices().catch((error) => {
      cached = null;
      throw error;
    });
  }
  return cached;
}

export async function createDefaultAdaptiveOrchestrator(): Promise<AdaptiveExamOrchestrator> {
  return (await createDefaultAdaptiveServices()).orchestrator;
}
