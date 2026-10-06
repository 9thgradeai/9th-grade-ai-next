import { describe, it, expect, vi, beforeEach } from "vitest";
import { prisma } from "~backend/db";
import {
  toUserRecord,
  findUserByEmail,
  findUserCredentialsByEmail,
  resetPassword,
} from "~backend/services/user";
import { ValidationError } from "~backend/errors";

function prismaRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "user-1",
    name: "Test User",
    email: "test@example.com",
    handle: "test",
    passwordHash: "$2b$10$abcdefghijklmnopqrstuvwxyz0123456789ABCDEF",
    tokenVersion: 0,
    role: "STUDENT",
    emailVerified: true,
    onboarded: true,
    createdAt: new Date("2024-01-01"),
    examTarget: null,
    examDate: null,
    prepLevel: null,
    studyHoursPerDay: null,
    goal: null,
    googleId: null,
    authProvider: "password",
    imageUrl: null,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("credential hygiene (Phase 0)", () => {
  it("toUserRecord never carries passwordHash", () => {
    const record = toUserRecord(prismaRow() as never);
    expect(record).not.toHaveProperty("passwordHash");
    expect(record.email).toBe("test@example.com");
  });

  it("findUserByEmail returns the safe record", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(prismaRow() as never);
    const record = await findUserByEmail("test@example.com");
    expect(record).not.toBeNull();
    expect(record).not.toHaveProperty("passwordHash");
  });

  it("findUserCredentialsByEmail carries the hash for the login path only", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(prismaRow() as never);
    const creds = await findUserCredentialsByEmail("test@example.com");
    expect(creds?.passwordHash).toContain("$2b$10$");
  });

  it("resetPassword rejects a malformed token without touching the DB", async () => {
    await expect(resetPassword("short", "newpassword123")).rejects.toBeInstanceOf(ValidationError);
    expect(prisma.user.findFirst).not.toHaveBeenCalled();
    expect(prisma.user.updateMany).not.toHaveBeenCalled();
  });

  it("resetPassword rejects an unknown token instead of silently succeeding", async () => {
    vi.mocked(prisma.user.findFirst).mockResolvedValue(null);
    await expect(
      resetPassword("a".repeat(64), "newpassword123"),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(prisma.user.updateMany).not.toHaveBeenCalled();
  });
});
