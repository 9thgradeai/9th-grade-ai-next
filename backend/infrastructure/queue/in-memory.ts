// backend/infrastructure/queue/in-memory.ts — dev/test queue driver (Phase 16).
// Jobs run through the same handler contract a real worker would use. Delayed
// jobs are held in memory and flushed by timers; failures are retried up to
// maxAttempts with linear backoff, then dropped (dead-letter logging hook).

import "server-only";

import type { EnqueuedJob, JobPayloadMap, QueueDriver } from "./types";

const DEFAULT_MAX_ATTEMPTS = 3;

interface PendingJob {
  id: string;
  name: string;
  payload: unknown;
  runAt: number;
  attempts: number;
}

export class InProcessQueue implements QueueDriver {
  readonly name = "in-process";

  private pending: PendingJob[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  private handler: ((name: string, payload: unknown) => Promise<void>) | null = null;
  private stopped = true;

  async enqueue<T extends keyof JobPayloadMap & string>(
    name: T,
    payload: JobPayloadMap[T],
    opts?: { delayMs?: number },
  ): Promise<EnqueuedJob> {
    const job: PendingJob = {
      id: `job_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
      name,
      payload,
      runAt: Date.now() + (opts?.delayMs ?? 0),
      attempts: 0,
    };
    this.pending.push(job);
    this.schedule();
    return { id: job.id, name: job.name };
  }

  async start(handler: (name: string, payload: unknown) => Promise<void>): Promise<void> {
    this.handler = handler;
    this.stopped = false;
    this.schedule();
  }

  async stop(): Promise<void> {
    this.stopped = true;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  /** Test hook — synchronously process everything currently due. */
  async flush(): Promise<number> {
    return this.drain(true);
  }

  private schedule(): void {
    if (this.stopped || !this.handler || this.timer) return;
    const nextDelay = this.pending.length
      ? Math.max(0, Math.min(...this.pending.map((j) => j.runAt)) - Date.now())
      : 250;
    this.timer = setTimeout(() => {
      void this.drain(false).finally(() => this.schedule());
    }, nextDelay);
    // Do not hold the event loop open for pending jobs.
    (this.timer as unknown as { unref?: () => void }).unref?.();
  }

  private async drain(ignoreTime: boolean): Promise<number> {
    if (!this.handler) return 0;
    let processed = 0;
    const now = Date.now();
    const due = this.pending.filter((j) => ignoreTime || j.runAt <= now);
    this.pending = this.pending.filter((j) => j.runAt > now);

    for (const job of due) {
      job.attempts += 1;
      try {
        await this.handler!(job.name, job.payload);
        processed += 1;
      } catch (err) {
        if (job.attempts < DEFAULT_MAX_ATTEMPTS) {
          job.runAt = now + job.attempts * 500; // linear backoff
          this.pending.push(job);
        } else {
          console.error(
            `[queue] job ${job.name} (${job.id}) dead-lettered after ${job.attempts} attempts:`,
            err instanceof Error ? err.message : err,
          );
        }
      }
    }
    return processed;
  }
}
