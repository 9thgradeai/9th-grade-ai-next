// backend/infrastructure/queue/types.ts — Queue/Worker seam (Phase 16).
// Application services depend on THIS interface only. Vendors (Redis/BullMQ,
// pg-boss, cloud tasks…) plug in behind `QueueDriver`; workers are plain
// async functions registered per job name.

export type JobPayloadMap = Record<string, unknown>;

export interface EnqueuedJob {
  id: string;
  name: string;
}

export interface QueueDriver {
  readonly name: string;
  enqueue<T extends keyof JobPayloadMap & string>(
    name: T,
    payload: JobPayloadMap[T],
    opts?: { delayMs?: number },
  ): Promise<EnqueuedJob>;
  /** Start polling/dispatching. InProcess driver runs inline; others poll. */
  start(handler: (name: string, payload: unknown) => Promise<void>): Promise<void>;
  stop(): Promise<void>;
}
