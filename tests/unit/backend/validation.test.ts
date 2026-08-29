import { describe, it, expect } from "vitest";
import {
  assertNoUnknownFields,
  validateBoundedInt,
  validateEnumValue,
  validateLoginInput,
  validateRegisterInput,
  validateUpdateProfileInput,
  validateChangePasswordInput,
  validateQuestionSearchParams,
  validatePagination,
  validatePositiveInteger,
} from "~backend/validation";

const VALIDATION_ERROR = { statusCode: 400, code: "VALIDATION_ERROR" };

describe("shared error contract (Phase 7)", () => {
  it("validation failures are 400 VALIDATION_ERROR — never 500", async () => {
    const bad = [
      () => validateLoginInput({}),
      () => validateRegisterInput({ name: "ab", email: "nope", password: "longenough1" }),
      () => validatePositiveInteger("x", "id"),
      () => validatePagination(new URLSearchParams("page=abc")),
      () => validateQuestionSearchParams(new URLSearchParams("difficulty=impossible")),
      () => validateBoundedInt(1.5, "n"),
    ];
    for (const fn of bad) {
      await expect(Promise.resolve().then(fn)).rejects.toMatchObject(VALIDATION_ERROR);
    }
  });
});

describe("assertNoUnknownFields (strict mode)", () => {
  it("rejects bodies with undeclared fields", () => {
    expect(() =>
      assertNoUnknownFields({ email: "a@b.c", password: "x", admin: true }, ["email", "password"]),
    ).toThrow(/Unexpected field\(s\): admin/);
  });

  it("accepts exact and subset bodies; ignores non-objects", () => {
    expect(() => assertNoUnknownFields({ email: "a@b.c" }, ["email", "password"])).not.toThrow();
    expect(() => assertNoUnknownFields(null, ["email"])).not.toThrow();
  });
});

describe("validateEnumValue / validateBoundedInt", () => {
  it("enum: undefined passes through, non-members rejected", () => {
    expect(validateEnumValue(undefined, [0, 1], "r")).toBeUndefined();
    expect(validateEnumValue(2, [0, 1, 2] as const, "rating")).toBe(2);
    expect(() => validateEnumValue(9, [0, 1, 2] as const, "rating")).toThrow(/rating must be one of/);
  });

  it("bounded int: default clamped into range, bounds enforced", () => {
    expect(validateBoundedInt(undefined, "limit", { min: 1, max: 50, default: 20 })).toBe(20);
    expect(validateBoundedInt(10, "n", { min: 0 })).toBe(10);
    expect(() => validateBoundedInt(-1, "n", { min: 0 })).toThrow(/>= 0/);
    expect(() => validateBoundedInt(51, "n", { min: 1, max: 50 })).toThrow(/<= 50/);
  });
});

describe("auth validators (single source of truth)", () => {
  it("register enforces the LIVE rules: name>=2, valid email, password>=8", async () => {
    const ok = await validateRegisterInput({
      name: "Farhan",
      email: "F@Example.com ",
      password: "xK9!mP2@vQ7w",
    });
    expect(ok.email).toBe("f@example.com");
    // Strict mode: undeclared fields are rejected, not stripped.
    await expect(
      validateRegisterInput({
        name: "Farhan",
        email: "F@Example.com",
        password: "xK9!mP2@vQ7w",
        admin: true,
      }),
    ).rejects.toThrow(/Unexpected field\(s\): admin/);
  });

  it("register rejects the historical weak-password rule (6–7 chars)", async () => {
    await expect(
      validateRegisterInput({ name: "Ab", email: "a@b.co", password: "123456" }),
    ).rejects.toMatchObject(VALIDATION_ERROR);
  });

  it("login validates email shape strictly", () => {
    expect(validateLoginInput({ email: "a@b.co", password: "x" }).email).toBe("a@b.co");
    expect(() => validateLoginInput({ email: "a@b", password: "x" })).toThrow(/Valid email/);
  });

  it("profile rejects short names; changePassword enforces >=8 + match", async () => {
    expect(validateUpdateProfileInput({})).toEqual({});
    expect(() => validateUpdateProfileInput({ name: "A" })).toThrow(/at least 2/);

    expect(
      await validateChangePasswordInput({ currentPassword: "a", newPassword: "xK9!mP2@vQ7w", confirmPassword: "xK9!mP2@vQ7w" }),
    ).toBeDefined();
    await expect(
      validateChangePasswordInput({ currentPassword: "a", newPassword: "short", confirmPassword: "short" }),
    ).rejects.toThrow(/at least 8/);
    await expect(
      validateChangePasswordInput({ currentPassword: "a", newPassword: "xK9!mP2@vQ7w", confirmPassword: "zzzz" }),
    ).rejects.toThrow(/do not match/i);
  });
});

describe("query validators", () => {
  it("question search parses paths and caps limit at 200", () => {
    const f = validateQuestionSearchParams(
      new URLSearchParams("subject=বাংলা&difficulty=MEDIUM&paths=a/b,c&q=x&limit=500"),
    );
    expect(f.paths).toEqual(["a/b", "c"]);
    expect(f.limit).toBe(200);
    expect(f.difficulty).toBe("MEDIUM");
  });

  it("question search rejects junk numerics and unknown params", () => {
    expect(() => validateQuestionSearchParams(new URLSearchParams("limit=abc"))).toThrow(/positive integer/);
    expect(() => validateQuestionSearchParams(new URLSearchParams("foo=1"))).toThrow(/foo/);
  });

  it("pagination defaults and caps", () => {
    expect(validatePagination(new URLSearchParams())).toEqual({ page: 1, limit: 20 });
    expect(validatePagination(new URLSearchParams("page=2&limit=1000"))).toEqual({ page: 2, limit: 100 });
  });
});

describe("question search — notebook / PYQ filters", () => {
  it("parses ids, year and sourceExam", () => {
    const f = validateQuestionSearchParams(
      new URLSearchParams("ids=1,2,3&year=2021&sourceExam=45th%20BCS"),
    );
    expect(f.ids).toEqual([1, 2, 3]);
    expect(f.year).toBe(2021);
    expect(f.sourceExam).toBe("45th BCS");
  });

  it("caps ids at 200 and rejects non-positive entries", () => {
    const many = Array.from({ length: 201 }, (_, i) => i + 1).join(",");
    expect(() => validateQuestionSearchParams(new URLSearchParams(`ids=${many}`))).toThrow(/at most 200/);
    expect(() => validateQuestionSearchParams(new URLSearchParams("ids=1,x,2"))).toThrow(/positive integers/);
  });

  it("year must be within the plausible range", () => {
    expect(validateQuestionSearchParams(new URLSearchParams("year=2020")).year).toBe(2020);
    expect(() => validateQuestionSearchParams(new URLSearchParams("year=1800"))).toThrow(/1950/);
    expect(() => validateQuestionSearchParams(new URLSearchParams("year=3000"))).toThrow(/2100/);
  });

  it("sourceExam is length-bounded and not required", () => {
    expect(validateQuestionSearchParams(new URLSearchParams("sourceExam=BCS")).sourceExam).toBe("BCS");
    expect(() =>
      validateQuestionSearchParams(new URLSearchParams("sourceExam=" + "x".repeat(41))),
    ).toThrow(/at most 40/);
    expect(validateQuestionSearchParams(new URLSearchParams("q=xyz")).sourceExam).toBeUndefined();
  });
});
