// @vitest-environment node
//
// Route-handler test for POST /api/auth/resend-verification. The user service
// is mocked; we assert the endpoint always returns 200 (account enumeration
// safe) and forwards the email to resendVerification.

import { describe, it, expect, beforeEach, vi } from "vitest";

const { resendVerification } = vi.hoisted(() => ({
  resendVerification: vi.fn(async () => ({ ok: true, devLink: null as string | null })),
}));

vi.mock("~backend/services/user", () => ({
  resendVerification,
}));

import { POST } from "~app/api/auth/resend-verification/route";
import { resetRateLimitStore } from "~backend/rate-limit";

const BASE = "https://app.example.com";

beforeEach(() => {
  vi.clearAllMocks();
  void resetRateLimitStore();
});

describe("POST /api/auth/resend-verification", () => {
  it("returns 200 and calls resendVerification with the email (enumeration-safe)", async () => {
    const res = await POST(
      new Request(`${BASE}/api/auth/resend-verification`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "newbie@example.com" }),
      }),
    );

    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok: boolean };
    expect(json.ok).toBe(true);
    expect(resendVerification).toHaveBeenCalledWith("newbie@example.com", BASE);
  });

  it("still returns 200 when no email is supplied", async () => {
    const res = await POST(
      new Request(`${BASE}/api/auth/resend-verification`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      }),
    );
    expect(res.status).toBe(200);
    expect(resendVerification).toHaveBeenCalledWith("", BASE);
  });
});