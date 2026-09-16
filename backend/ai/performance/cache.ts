// Performance optimization utilities — caching strategies, lazy loading,
// query optimization helpers, and memory-efficient data structures.

import "server-only";

import { log } from "~backend/infrastructure/observability/logger";

// ── TTL Cache ───────────────────────────────────────────────

/**
 * Generic TTL cache with size limit and LRU eviction.
 * Used for caching frequently accessed data (questions, topics, etc.).
 */
export class TTLCache<V> {
  private cache = new Map<string, { value: V; expiresAt: number }>();
  private readonly maxSize: number;
  private readonly ttlMs: number;

  constructor(opts: { maxSize?: number; ttlMs?: number }) {
    this.maxSize = opts.maxSize ?? 1000;
    this.ttlMs = opts.ttlMs ?? 5 * 60 * 1000; // 5 minutes default
  }

  get(key: string): V | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return undefined;
    }

    // Move to end (most recently used)
    this.cache.delete(key);
    this.cache.set(key, entry);

    return entry.value;
  }

  set(key: string, value: V): void {
    // Evict oldest if at capacity
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) {
        this.cache.delete(firstKey);
      }
    }

    this.cache.set(key, {
      value,
      expiresAt: Date.now() + this.ttlMs,
    });
  }

  has(key: string): boolean {
    return this.get(key) !== undefined;
  }

  delete(key: string): void {
    this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }

  get size(): number {
    return this.cache.size;
  }
}

// ── Batch Processor ─────────────────────────────────────────

/**
 * Batch processor — collects items and processes them in batches.
 * Useful for database bulk operations and API rate limiting.
 */
export class BatchProcessor<T, R> {
  private queue: T[] = [];
  private processing = false;
  private readonly batchSize: number;
  private readonly processFn: (items: T[]) => Promise<R[]>;
  private readonly flushIntervalMs: number;
  private flushTimer: ReturnType<typeof setInterval> | null = null;

  constructor(opts: {
    batchSize?: number;
    flushIntervalMs?: number;
    processFn: (items: T[]) => Promise<R[]>;
  }) {
    this.batchSize = opts.batchSize ?? 100;
    this.flushIntervalMs = opts.flushIntervalMs ?? 5000;
    this.processFn = opts.processFn;
  }

  add(item: T): void {
    this.queue.push(item);

    if (this.queue.length >= this.batchSize) {
      void this.flush();
    } else if (!this.flushTimer) {
      this.flushTimer = setTimeout(() => void this.flush(), this.flushIntervalMs);
    }
  }

  async flush(): Promise<R[]> {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }

    if (this.queue.length === 0 || this.processing) {
      return [];
    }

    this.processing = true;
    const batch = this.queue.splice(0, this.batchSize);

    try {
      const results = await this.processFn(batch);
      return results;
    } catch (err) {
      log.error("Batch processing failed", { error: String(err), batchSize: batch.length });
      return [];
    } finally {
      this.processing = false;

      // Process remaining items
      if (this.queue.length > 0) {
        setTimeout(() => void this.flush(), 0);
      }
    }
  }

  get pendingCount(): number {
    return this.queue.length;
  }
}

// ── Object Pool ─────────────────────────────────────────────

/**
 * Simple object pool for reusing expensive objects.
 * Reduces garbage collection pressure for frequently created/destroyed objects.
 */
export class ObjectPool<T> {
  private pool: T[] = [];
  private readonly factory: () => T;
  private readonly reset: (obj: T) => void;
  private readonly maxSize: number;

  constructor(opts: {
    factory: () => T;
    reset: (obj: T) => void;
    maxSize?: number;
    initialSize?: number;
  }) {
    this.factory = opts.factory;
    this.reset = opts.reset;
    this.maxSize = opts.maxSize ?? 50;

    // Pre-populate pool
    for (let i = 0; i < (opts.initialSize ?? 0); i++) {
      this.pool.push(this.factory());
    }
  }

  acquire(): T {
    if (this.pool.length > 0) {
      return this.pool.pop()!;
    }
    return this.factory();
  }

  release(obj: T): void {
    if (this.pool.length < this.maxSize) {
      this.reset(obj);
      this.pool.push(obj);
    }
  }

  get size(): number {
    return this.pool.length;
  }
}

// ── Lazy Loader ─────────────────────────────────────────────

/**
 * Lazy loader — defers expensive initialization until first use.
 * Useful for database connections, heavy computations, etc.
 */
export class LazyLoader<T> {
  private value: T | undefined;
  private loading = false;
  private readonly factory: () => Promise<T>;

  constructor(factory: () => Promise<T>) {
    this.factory = factory;
  }

  async get(): Promise<T> {
    if (this.value !== undefined) {
      return this.value;
    }

    if (this.loading) {
      // Wait for existing load to complete
      while (this.loading) {
        await new Promise((r) => setTimeout(r, 10));
      }
      return this.value!;
    }

    this.loading = true;
    try {
      this.value = await this.factory();
      return this.value;
    } finally {
      this.loading = false;
    }
  }

  get isLoaded(): boolean {
    return this.value !== undefined;
  }

  invalidate(): void {
    this.value = undefined;
  }
}

// ── Query Optimizer ─────────────────────────────────────────

/**
 * Build a Prisma `select` object that includes only needed fields.
 * Reduces data transfer and memory usage.
 */
export function buildOptimizedSelect<T extends Record<string, boolean>>(
  fields: T,
): T {
  return fields;
}

/**
 * Chunk an array for batch database operations.
 * Prevents "too many parameters" errors in Prisma.
 */
export function chunkArray<T>(array: T[], chunkSize: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += chunkSize) {
    chunks.push(array.slice(i, i + chunkSize));
  }
  return chunks;
}

/**
 * Deduplicate an array by a key function.
 * More efficient than using Set for complex objects.
 */
export function deduplicateBy<T>(array: T[], keyFn: (item: T) => string | number): T[] {
  const seen = new Set<string | number>();
  return array.filter((item) => {
    const key = keyFn(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ── Memoize ─────────────────────────────────────────────────

/**
 * Memoize a synchronous function with TTL cache.
 * Useful for expensive pure functions called frequently.
 */
export function memoize<TArgs extends unknown[], TResult>(
  fn: (...args: TArgs) => TResult,
  opts?: { ttlMs?: number; maxSize?: number },
): (...args: TArgs) => TResult {
  const cache = new TTLCache<TResult>({
    ttlMs: opts?.ttlMs ?? 60_000,
    maxSize: opts?.maxSize ?? 100,
  });

  return (...args: TArgs): TResult => {
    const key = JSON.stringify(args);
    const cached = cache.get(key);
    if (cached !== undefined) return cached;

    const result = fn(...args);
    cache.set(key, result);
    return result;
  };
}
