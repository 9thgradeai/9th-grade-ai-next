// Regression test for the first-release P0 bug: `instrumentation.ts` once
// exported a `register()` that wired the domain-event subscribers, but a later
// commit replaced it with a bare Sentry.init — so badges, learning events and
// event-driven notifications were silently dead in production (events were
// emitted, nobody listened). This test proves register() wires them again.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// instrumentation.ts calls Sentry.init at module load; stub it so the test
// neither starts the real SDK nor prints "No DSN provided" noise.
vi.mock("@sentry/nextjs", () => ({ init: vi.fn() }));

import { register } from "../../../instrumentation";
import { prisma } from "~backend/db";
import { clearSubscriptions, emit } from "~backend/events/bus";

const GLOBAL_KEY = "__9th_grade_ai_subscribers_registered__";

type Globals = typeof globalThis & { [GLOBAL_KEY]?: boolean };

const savedNextRuntime = process.env.NEXT_RUNTIME;

beforeEach(() => {
  // The bus and the subscribers' globalThis guard are module-level state:
  // clear both so each test re-registers from a clean slate (mirrors a fresh
  // server process). register() itself is stateless and safe to call again.
  clearSubscriptions();
  delete (globalThis as Globals)[GLOBAL_KEY];
  process.env.NEXT_RUNTIME = "nodejs";
  // The badge subscriber runs computeStreak(), which does rows.map() on a raw
  // query result — the deep-mock returns undefined for unconfigured methods.
  vi.mocked(prisma.$queryRaw).mockResolvedValue([] as never);
});

afterEach(() => {
  clearSubscriptions();
  delete (globalThis as Globals)[GLOBAL_KEY];
  if (savedNextRuntime === undefined) delete process.env.NEXT_RUNTIME;
  else process.env.NEXT_RUNTIME = savedNextRuntime;
});

describe("instrumentation register()", () => {
  it("registers domain-event subscribers (badges, learning events, notifications)", async () => {
    await register();

    expect((globalThis as Globals)[GLOBAL_KEY]).toBe(true);
  });

  it("is idempotent — a second register() call does not double-subscribe", async () => {
    await register();
    await register();

    // 5 event names × 3 handlers each; a double registration would double it.
    const createMock = vi.mocked(prisma.appNotification.create);
    createMock.mockClear();

    // 90% practice score → notification subscriber creates a notification.
    emit({ name: "PRACTICE_SUBMITTED", userId: "u1", correct: 9, total: 10, score: 90, attempts: [] });
    await vi.waitFor(() => expect(createMock).toHaveBeenCalled());
    expect(createMock).toHaveBeenCalledTimes(1);
  });

  it("end-to-end: an emitted event reaches the notification subscriber", async () => {
    await register();

    const createMock = vi.mocked(prisma.appNotification.create);
    createMock.mockClear();

    emit({ name: "EXAM_COMPLETED", userId: "u2", correct: 7, wrong: 3, finalScore: 70, attempts: [] });
    await vi.waitFor(() => expect(createMock).toHaveBeenCalled());
    expect(createMock.mock.calls[0]?.[0]).toMatchObject({
      data: { userId: "u2", title: "Exam Completed!" },
    });
  });

  it("does nothing outside the nodejs runtime (edge guard)", async () => {
    process.env.NEXT_RUNTIME = "edge";
    await register();

    expect((globalThis as Globals)[GLOBAL_KEY]).toBeUndefined();
  });
});
