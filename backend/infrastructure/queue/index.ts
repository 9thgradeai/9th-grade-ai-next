// backend/infrastructure/queue/index.ts — driver selection (Phase 16).
// In-process by default; swap to a Redis-backed driver (BullMQ-class) when
// workers become a separate deployment (Phase 24). Same interface either way.

import "server-only";

import { InProcessQueue } from "./in-memory";
import type { QueueDriver } from "./types";

let queue: QueueDriver | null = null;

export function getQueue(): QueueDriver {
  if (!queue) queue = new InProcessQueue();
  return queue;
}

/** Test hook. */
export function resetQueue(): void {
  queue = null;
}

export type { QueueDriver, JobPayloadMap, EnqueuedJob } from "./types";
