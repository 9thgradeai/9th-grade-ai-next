// @vitest-environment node
//
// Auth tests for the BYOS storage worker and the daily cron trigger:
// Bearer gating, fail-closed production without a secret, and the
// anonymous status probe. The job processor is mocked.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import { GET as workerGET, POST as workerPOST } from "~app/api/storage/worker/route";
import { GET as cronGET } from "~app/api/cron/daily-current-affairs/route";
import { processPendingJobs } from "~backend/services/storage/syncService";
import { publishDailyNote } from "~backend/services/current-affairs";

vi.mock("~backend/services/storage/syncService", () => ({
  processPendingJobs: vi.fn(),
}));

vi.mock("~backend/services/current-affairs", () => ({
  publishDailyNote: vi.fn(),
}));

const BASE = "https://app.example.com";

function workerPost(auth?: string): Request {
  return new Request(`${BASE}/api/storage/worker`, {
    method: "POST",
    headers: auth ? { authorization: auth } : {},
  });
}

function workerGet(auth?: string): Request {
  return new Request(
    `${BASE}/api/storage/worker`,
    auth ? { headers: { authorization: auth } } : {},
  );
}

describe("POST /api/storage/worker — Bearer gate", () => {
  const OLD_CRON = process.env.CRON_SECRET;
  const OLD_WORKER = process.env.WORKER_SECRET;
  const OLD_NODE_ENV = process.env.NODE_ENV;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = "test-worker-secret";
    delete process.env.WORKER_SECRET;
    process.env.NODE_ENV = "test";
  });

  afterEach(() => {
    if (OLD_CRON === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = OLD_CRON;
    if (OLD_WORKER === undefined) delete process.env.WORKER_SECRET;
    else process.env.WORKER_SECRET = OLD_WORKER;
    process.env.NODE_ENV = OLD_NODE_ENV;
  });

  it("returns 401 without credentials and runs nothing", async () => {
    const res = await workerPOST(workerPost());
    expect(res.status).toBe(401);
    expect(vi.mocked(processPendingJobs)).not.toHaveBeenCalled();
  });

  it("returns 401 for a wrong secret", async () => {
    const res = await workerPOST(workerPost("Bearer wrong-secret"));
    expect(res.status).toBe(401);
    expect(vi.mocked(processPendingJobs)).not.toHaveBeenCalled();
  });

  it("rejects a near-miss secret (constant-time compare, no prefix oracle)", async () => {
    const res = await workerPOST(workerPost("Bearer test-worker-secreX"));
    expect(res.status).toBe(401);
  });

  it("processes jobs with the correct Bearer secret", async () => {
    vi.mocked(processPendingJobs).mockResolvedValue(4 as never);
    const res = await workerPOST(workerPost("Bearer test-worker-secret"));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ processed: 4 });
  });

  it("fails closed in production when no secret is configured", async () => {
    delete process.env.CRON_SECRET;
    process.env.NODE_ENV = "production";
    const res = await workerPOST(workerPost("Bearer anything"));
    expect(res.status).toBe(401);
    expect(vi.mocked(processPendingJobs)).not.toHaveBeenCalled();
  });
});

describe("GET /api/storage/worker — probe vs processing", () => {
  const OLD_CRON = process.env.CRON_SECRET;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = "test-worker-secret";
  });

  afterEach(() => {
    if (OLD_CRON === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = OLD_CRON;
  });

  it("answers the anonymous status probe without side effects", async () => {
    const res = await workerGET(workerGet());
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true });
    expect(vi.mocked(processPendingJobs)).not.toHaveBeenCalled();
  });

  it("processes when Bearer-authorized (Vercel Cron issues GET)", async () => {
    vi.mocked(processPendingJobs).mockResolvedValue(2 as never);
    const res = await workerGET(workerGet("Bearer test-worker-secret"));
    expect(await res.json()).toMatchObject({ processed: 2 });
  });
});

describe("GET /api/cron/daily-current-affairs — secret configuration", () => {
  const OLD_CRON = process.env.CRON_SECRET;

  afterEach(() => {
    if (OLD_CRON === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = OLD_CRON;
  });

  it("returns 503 when CRON_SECRET is not configured", async () => {
    delete process.env.CRON_SECRET;
    const res = await cronGET(new Request(`${BASE}/api/cron/daily-current-affairs`));
    expect(res.status).toBe(503);
    expect(vi.mocked(publishDailyNote)).not.toHaveBeenCalled();
  });
});
