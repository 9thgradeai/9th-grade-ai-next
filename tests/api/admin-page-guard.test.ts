// @vitest-environment node
//
// Server-side gate for /admin (app/admin/layout.tsx).
//
// The layout must NEVER render admin markup for a non-admin:
//   • no session        → redirect("/login")
//   • student / banned  → notFound() (404, hides that /admin exists)
//   • admin             → children
//
// redirect()/notFound() throw control-flow signals in Next.js, so the mocks
// throw sentinels to reproduce that behaviour faithfully.

import { describe, it, expect, beforeEach, vi } from "vitest";
import { redirect, notFound } from "next/navigation";

import { getSessionUserFromCookies } from "~backend/auth";
import AdminLayout from "~app/admin/layout";

vi.mock("~backend/auth", () => ({
  getSessionUserFromCookies: vi.fn(),
}));

const ADMIN_USER = {
  id: "usr_admin",
  name: "Admin",
  email: "admin@example.com",
  handle: "admin",
  tokenVersion: 0,
  role: "admin" as const,
  emailVerified: true,
  onboarded: true,
  createdAt: "2026-01-01T00:00:00.000Z",
  authProvider: "password" as const,
};

const STUDENT_USER = { ...ADMIN_USER, id: "usr_student", role: "student" as const };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(redirect).mockImplementation(() => {
    throw new Error("NEXT_REDIRECT");
  });
  vi.mocked(notFound).mockImplementation(() => {
    throw new Error("NEXT_NOT_FOUND");
  });
});

describe("admin layout server gate", () => {
  it("redirects unauthenticated visitors to /login", async () => {
    vi.mocked(getSessionUserFromCookies).mockResolvedValue(null);
    await expect(AdminLayout({ children: "secret" })).rejects.toThrow("NEXT_REDIRECT");
    expect(redirect).toHaveBeenCalledWith("/login");
  });

  it("returns 404 for an authenticated non-admin", async () => {
    vi.mocked(getSessionUserFromCookies).mockResolvedValue(STUDENT_USER);
    await expect(AdminLayout({ children: "secret" })).rejects.toThrow("NEXT_NOT_FOUND");
    expect(notFound).toHaveBeenCalled();
  });

  it("renders the console for an admin", async () => {
    vi.mocked(getSessionUserFromCookies).mockResolvedValue(ADMIN_USER);
    const result = await AdminLayout({ children: "console" });
    expect(result).toBe("console");
    expect(redirect).not.toHaveBeenCalled();
    expect(notFound).not.toHaveBeenCalled();
  });
});
