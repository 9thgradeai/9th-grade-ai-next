// @vitest-environment node
//
// The event subscriber must rate-limit by construction: every sourceKey is
// scoped to (user, kind, UTC day) so createNotification's findUnique dedupe
// collapses repeats into one row per day instead of unbounded inserts.

import { describe, it, expect, vi } from "vitest";

const h = vi.hoisted(() => ({ created: [] as { sourceKey?: string }[] }));

vi.mock("~backend/services/notification", () => ({
  createNotification: vi.fn((input: { sourceKey?: string }) => {
    h.created.push(input);
    return Promise.resolve({ id: 1 });
  }),
}));

import { createNotificationsForEvent } from "~backend/events/notification-subscriber";

describe("notification-subscriber rate limit", () => {
  it("emits identical day-scoped sourceKeys for repeated practice events", async () => {
    h.created.length = 0;
    const evt = {
      name: "PRACTICE_SUBMITTED",
      userId: "u1",
      total: 10,
      correct: 9,
    } as never;
    await createNotificationsForEvent(evt);
    await createNotificationsForEvent(evt);
    expect(h.created).toHaveLength(2);
    expect(h.created[0].sourceKey).toMatch(/^practice-high-u1-\d{4}-\d{2}-\d{2}$/);
    expect(h.created[0].sourceKey).toBe(h.created[1].sourceKey);
  });

  it("scopes flashcard and tutor events to the day", async () => {
    h.created.length = 0;
    await createNotificationsForEvent({
      name: "FLASHCARD_REVIEWED",
      userId: "u2",
      flashcardId: 3,
      rating: 1,
    } as never);
    await createNotificationsForEvent({
      name: "AI_TUTOR_TURN",
      userId: "u2",
      kind: "tutor",
      intent: "tutor",
    } as never);
    const keys = h.created.map((c) => c.sourceKey);
    expect(keys[0]).toMatch(/^flashcard-again-u2-\d{4}-\d{2}-\d{2}$/);
    expect(keys[1]).toMatch(/^ai-tutor-u2-\d{4}-\d{2}-\d{2}$/);
  });
});
