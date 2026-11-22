// backend/services/adaptive-exam/orchestrator-factory.ts
// Wires the adaptive orchestrator to real (or in-memory) services.

import "server-only";

import { createAdaptiveExamOrchestrator } from "./orchestrator";
import { createProfileRegistry } from "./profile-registry";
import { createInMemoryProfileSnapshotStore } from "./profile-registry";
import { createHistoricalAnalyticsService, createInMemoryAnalyticsSnapshotStore } from "./historical-analytics";
import { createInMemoryHistoricalRepository } from "./historical-repository";

export function createDefaultAdaptiveOrchestrator() {
  const profileRegistry = createProfileRegistry({
    store: createInMemoryProfileSnapshotStore(),
    clock: { now: () => new Date().toISOString() },
    requestId: "adaptive-api",
  });
  const historicalAnalytics = createHistoricalAnalyticsService({
    repository: createInMemoryHistoricalRepository([]),
    clock: { now: () => new Date().toISOString() },
    requestId: "adaptive-api",
    snapshotStore: createInMemoryAnalyticsSnapshotStore(),
  });
  return createAdaptiveExamOrchestrator({
    profileRegistry,
    historicalAnalytics,
    clock: { now: () => new Date().toISOString() },
  });
}
