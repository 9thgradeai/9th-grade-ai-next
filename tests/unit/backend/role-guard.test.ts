import { describe, it, expect, vi, beforeEach } from "vitest";
import { prisma } from "~backend/db";
import { getAuthedUser, requireRole } from "~backend/services/user";
import { ForbiddenError, UnauthorizedError } from "~backend/errors";

vi.mock("~backend/auth", () => ({
  verifySession: vi.fn(),
  signSession: vi.fn(),
}));

import { verifySession } from "~backend/auth";

const mockedVerify = vi.mocked(verifySession);

function requestWithCookie(value: string | null): Request {
  const headers = new Headers();
  if (value !== null) headers.set("cookie", `auth_token=${value}`);
  return new Request("http://localhost/api/test", { headers });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getAuthedUser", () => {
  it("resolves id and role for a valid session", async () => {
    mockedVerify.mockResolvedValue({ email: "a@b.c", origIat: 0 } as never);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: "u1",
      email: "a@b.c",
      role: "ADMIN",
    } as never);

    const user = await getAuthedUser(requestWithCookie("tok"));
    expect(user).toEqual({ id: "u1", email: "a@b.c", role: "admin" });
  });

  it("returns null without a cookie", async () => {
    expect(await getAuthedUser(requestWithCookie(null))).toBeNull();
    expect(verifySession).not.toHaveBeenCalled();
  });

  it("returns null when the session user no longer exists", async () => {
    mockedVerify.mockResolvedValue({ email: "ghost@b.c" } as never);
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
    expect(await getAuthedUser(requestWithCookie("tok"))).toBeNull();
  });
});

describe("requireRole (role enforcement)", () => {
  it("throws UnauthorizedError with no session", async () => {
    await expect(requireRole(requestWithCookie(null), ["admin"])).rejects.toBeInstanceOf(
      UnauthorizedError,
    );
  });

  it("throws ForbiddenError when the role does not match", async () => {
    mockedVerify.mockResolvedValue({ email: "s@b.c" } as never);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: "u2",
      email: "s@b.c",
      role: "STUDENT",
    } as never);

    await expect(requireRole(requestWithCookie("tok"), ["admin"])).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });

  it("returns the user when the role is allowed", async () => {
    mockedVerify.mockResolvedValue({ email: "a@b.c" } as never);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: "u1",
      email: "a@b.c",
      role: "ADMIN",
    } as never);

    const user = await requireRole(requestWithCookie("tok"), ["admin"]);
    expect(user.id).toBe("u1");
  });

  it("allows students through a student gate", async () => {
    mockedVerify.mockResolvedValue({ email: "s@b.c" } as never);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: "u2",
      email: "s@b.c",
      role: "STUDENT",
    } as never);

    const user = await requireRole(requestWithCookie("tok"), ["student", "admin"]);
    expect(user.role).toBe("student");
  });
});
