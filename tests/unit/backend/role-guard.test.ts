import { describe, it, expect, vi, beforeEach } from "vitest";
import { getAuthedUser, requireRole } from "~backend/services/user";
import { ForbiddenError, UnauthorizedError } from "~backend/errors";

// getAuthedUser/requireRole delegate session resolution to getSessionUser —
// mock that seam (the JWT plumbing is covered by auth-hardening.test.ts).
vi.mock("~backend/auth", () => ({
  getSessionUser: vi.fn(),
}));

import { getSessionUser } from "~backend/auth";

const mockedSession = vi.mocked(getSessionUser);

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
    mockedSession.mockResolvedValue({
      id: "u1",
      email: "a@b.c",
      role: "admin",
    } as never);

    const user = await getAuthedUser(requestWithCookie("tok"));
    expect(user).toEqual({ id: "u1", email: "a@b.c", role: "admin" });
  });

  it("returns null without a session", async () => {
    mockedSession.mockResolvedValue(null);
    expect(await getAuthedUser(requestWithCookie("tok"))).toBeNull();
    expect(mockedSession).toHaveBeenCalledTimes(1);
  });
});

describe("requireRole (role enforcement)", () => {
  it("throws UnauthorizedError with no session", async () => {
    mockedSession.mockResolvedValue(null);
    await expect(requireRole(requestWithCookie(null), ["admin"])).rejects.toBeInstanceOf(
      UnauthorizedError,
    );
  });

  it("throws ForbiddenError when the role does not match", async () => {
    mockedSession.mockResolvedValue({
      id: "u2",
      email: "s@b.c",
      role: "student",
    } as never);

    await expect(requireRole(requestWithCookie("tok"), ["admin"])).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });

  it("returns the user when the role is allowed", async () => {
    mockedSession.mockResolvedValue({
      id: "u1",
      email: "a@b.c",
      role: "admin",
    } as never);

    const user = await requireRole(requestWithCookie("tok"), ["admin"]);
    expect(user.id).toBe("u1");
  });

  it("allows students through a student gate", async () => {
    mockedSession.mockResolvedValue({
      id: "u2",
      email: "s@b.c",
      role: "student",
    } as never);

    const user = await requireRole(requestWithCookie("tok"), ["student", "admin"]);
    expect(user.role).toBe("student");
  });
});
