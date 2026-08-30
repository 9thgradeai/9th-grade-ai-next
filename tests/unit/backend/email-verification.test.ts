// @vitest-environment node
//
// Email-verification auto-completion when no email transport is configured.
// With no RESEND_API_KEY a confirmation link can never be delivered, so new
// accounts are verified immediately (createUser) and "resend" resolves by
// verifying the account inline (resendVerification) instead of issuing an
// undeliverable link.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { prisma } from "~backend/db";
import { resendVerification } from "~backend/services/user";
import * as emailLib from "~backend/lib/email";

vi.mock("~backend/lib/email", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~backend/lib/email")>();
  return {
    ...actual,
    hasEmailTransport: vi.fn(() => false),
    sendEmail: vi.fn(async () => ({ sent: false })),
  };
});

beforeEach(() => {
  vi.clearAllMocks();
  // Default: no transport installed.
  vi.mocked(emailLib.hasEmailTransport).mockReturnValue(false);
});

describe("resendVerification without email transport", () => {
  it("verifies the account inline and reports autoVerified", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: "u1",
      email: "newbie@x.dev",
      emailVerified: false,
    } as never);
    vi.mocked(prisma.user.update).mockResolvedValue({} as never);

    const out = await resendVerification("newbie@x.dev");

    expect(out).toEqual({ ok: true, autoVerified: true });
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: "u1" },
      data: { emailVerified: true, emailVerifyToken: null, emailVerifyExpires: null },
    });
  });

  it("is a no-op (ok only) for an already-verified account and never re-writes", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: "u2",
      email: "v@x.dev",
      emailVerified: true,
    } as never);

    const out = await resendVerification("v@x.dev");

    expect(out).toEqual({ ok: true });
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it("is a no-op for unknown emails (enumeration-safe)", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);

    const out = await resendVerification("ghost@x.dev");

    expect(out).toEqual({ ok: true });
    expect(prisma.user.update).not.toHaveBeenCalled();
  });
});

describe("resendVerification with email transport configured", () => {
  it("issues a fresh token instead of auto-verifying", async () => {
    vi.mocked(emailLib.hasEmailTransport).mockReturnValue(true);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: "u3",
      email: "pending@x.dev",
      emailVerified: false,
    } as never);
    vi.mocked(prisma.user.update).mockResolvedValue({} as never);

    const out = await resendVerification("pending@x.dev");

    expect(out.ok).toBe(true);
    expect(out.autoVerified).toBeUndefined();
    const call = vi.mocked(prisma.user.update).mock.calls[0][0] as {
      data: { emailVerified?: boolean; emailVerifyToken: string };
    };
    expect(call.data.emailVerified).toBeUndefined();
    expect(call.data.emailVerifyToken.length).toBe(64); // sha256 hex
  });
});
