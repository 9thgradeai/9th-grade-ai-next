import { describe, it, expect, vi, beforeEach } from "vitest";
import { mkdtemp } from "fs/promises";
import { tmpdir } from "os";
import path from "path";

import { InMemoryRateLimitStore } from "~backend/infrastructure/cache/rate-limit-memory";
import { RedisRateLimitStore } from "~backend/infrastructure/cache/rate-limit-redis";
import { getRateLimitStore } from "~backend/infrastructure/cache";
import { InProcessQueue } from "~backend/infrastructure/queue/in-memory";
import { LocalDiskStorage } from "~backend/infrastructure/storage/local-disk";
import { chunkText } from "~backend/ai/retrieval/chunker";
import {
  HashingEmbedder,
  cosineSimilarity,
  embeddingsEnabled,
} from "~backend/ai/retrieval/embeddings";
import { log, __redactFieldsForTest } from "~backend/infrastructure/observability/logger";
import { clearSubscriptions, emit, subscribe } from "~backend/events/bus";

beforeEach(() => {
  vi.unstubAllEnvs();
});

describe("RateLimitStore selection + Redis adapter (injected client)", () => {
  it("defaults to memory without REDIS_URL", () => {
    expect(getRateLimitStore().name).toBe("memory");
  });

  it("Redis store matches memory semantics with a fake client", async () => {
    const incr = vi.fn().mockResolvedValue(1);
    const pexpire = vi.fn().mockResolvedValue(1);
    let n = 0;
    incr.mockImplementation(async () => ++n);
    const store = new RedisRateLimitStore({ incr, pexpire });

    const r1 = await store.consume("k", 2, 60_000);
    const r2 = await store.consume("k", 2, 60_000);
    const r3 = await store.consume("k", 2, 60_000);

    expect([r1.allowed, r2.allowed, r3.allowed]).toEqual([true, true, false]);
    expect(pexpire).toHaveBeenCalledTimes(1); // TTL set once by window owner
    expect(r3.count).toBe(3);
    expect(store.name).toBe("redis");
  });

  it("resetAll is a safe no-op on the shared-store adapter", async () => {
    const store = new RedisRateLimitStore({ incr: vi.fn(), pexpire: vi.fn() });
    await expect(store.resetAll()).resolves.toBeUndefined();
  });
});

describe("InProcessQueue (Phase 16)", () => {
  it("delivers jobs to the registered handler and reports ids", async () => {
    const q = new InProcessQueue();
    const seen: Array<[string, unknown]> = [];
    await q.start(async (name, payload) => {
      seen.push([name, payload]);
    });
    const job = await q.enqueue("test-job", { hello: "world" });
    expect(job.id).toMatch(/^job_/);

    await q.flush();
    expect(seen).toEqual([["test-job", { hello: "world" }]]);
    await q.stop();
  });

  it("retries failures then dead-letters after max attempts", async () => {
    const q = new InProcessQueue();
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    await q.start(async () => {
      throw new Error("always fails");
    });
    await q.enqueue("doomed", {});
    await q.flush();
    await q.flush(); // attempt 2
    await q.flush(); // attempt 3 → dead-letter
    expect(errSpy).toHaveBeenCalledWith(
      expect.stringContaining("dead-lettered"),
      expect.any(String),
    );
    errSpy.mockRestore();
    await q.stop();
  });
});

describe("LocalDiskStorage (Phase 17)", () => {
  async function makeStorage() {
    const dir = await mkdtemp(path.join(tmpdir(), "storage-"));
    return { storage: new LocalDiskStorage(dir), dir };
  }

  it("put/get/delete round-trips bytes", async () => {
    const { storage } = await makeStorage();
    await storage.put("docs/a.txt", new TextEncoder().encode("hello"), {
      contentType: "text/plain",
    });
    const got = await storage.get("docs/a.txt");
    expect(new TextDecoder().decode(got!.data)).toBe("hello");
    await storage.delete("docs/a.txt");
    expect(await storage.get("docs/a.txt")).toBeNull();
  });

  it("rejects path traversal keys", async () => {
    const { storage } = await makeStorage();
    await expect(storage.put("../escape.txt", new Uint8Array())).rejects.toThrow(/Invalid storage key/);
  });
});

describe("Retrieval primitives (Phase 15, flag-off pipeline)", () => {
  it("chunker slides with overlap and never loses coverage", () => {
    const text = "x".repeat(2000);
    const chunks = chunkText(text, { maxChars: 500, overlap: 50 });
    expect(chunks.length).toBeGreaterThan(1);
    // Consecutive chunks overlap by ~50 chars.
    expect(chunks[1].text.length).toBeLessThanOrEqual(500);
    expect(chunks[0].text.endsWith(chunks[1].text.slice(0, 10))).toBe(true);
  });

  it("hashing embedder is deterministic, normalized, and similarity behaves", async () => {
    const e = new HashingEmbedder();
    const [a] = await e.embed(["বাংলা ভাষা"]);
    const [b] = await e.embed(["বাংলা ভাষা"]);
    const [c] = await e.embed(["completely different topic xyz"]);
    expect(Array.from(a)).toEqual(Array.from(b)); // deterministic
    const norm = Math.sqrt(a.reduce((s, v) => s + v * v, 0));
    expect(norm).toBeCloseTo(1, 5);
    expect(cosineSimilarity(a, b)).toBeCloseTo(1, 5);
    expect(cosineSimilarity(a, c)).toBeLessThan(cosineSimilarity(a, b));
  });

  it("embeddings stay disabled unless explicitly enabled", () => {
    delete process.env.EMBEDDINGS_ENABLED;
    expect(embeddingsEnabled()).toBe(false);
  });
});

describe("Logger redaction contract (Phase 18)", () => {
  it("never emits sensitive values regardless of level", () => {
    const out = __redactFieldsForTest({
      userId: "u1",
      password: "hunter2",
      authorization: "Bearer abc",
      authToken: "xyz",
      nestedSafe: 42,
    });
    expect(out.password).toBe("[REDACTED]");
    expect(out.authorization).toBe("[REDACTED]");
    expect(out.authToken).toBe("[REDACTED]");
    expect(out.userId).toBe("u1");
  });

  it("log calls are silent under NODE_ENV=test", () => {
    const spy = vi.spyOn(console, "info").mockImplementation(() => {});
    log.info("probe", { a: 1 });
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
