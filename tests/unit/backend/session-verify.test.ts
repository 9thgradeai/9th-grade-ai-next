// @vitest-environment node
//
// Edge-safe session-token verification used by proxy.ts. Node environment is
// required because jose fails its cross-realm Uint8Array check inside jsdom.

import { describe, it, expect } from "vitest";
import { SignJWT } from "jose";
import {
  isValidSessionToken,
  readSessionCookie,
  SESSION_COOKIE_NAME,
} from "~backend/session-verify";

const SECRET = process.env.AUTH_SECRET ?? "test-secret-key-for-unit-tests-only";
const key = new TextEncoder().encode(SECRET);

async function mint(expires: string | number = "1h"): Promise<string> {
  return new SignJWT({ email: "a@b.com" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(expires)
    .sign(key);
}

describe("isValidSessionToken", () => {
  it("accepts a well-formed, unexpired HS256 token", async () => {
    await expect(isValidSessionToken(await mint(), SECRET)).resolves.toBe(true);
  });

  it("rejects an expired token (the redirect-loop killer)", async () => {
    await expect(isValidSessionToken(await mint("-1h"), SECRET)).resolves.toBe(false);
  });

  it("rejects garbage and missing tokens", async () => {
    await expect(isValidSessionToken("not-a-jwt", SECRET)).resolves.toBe(false);
    await expect(isValidSessionToken("", SECRET)).resolves.toBe(false);
    await expect(isValidSessionToken(null, SECRET)).resolves.toBe(false);
    await expect(isValidSessionToken(undefined, SECRET)).resolves.toBe(false);
  });

  it("fails closed without a secret configured", async () => {
    await expect(isValidSessionToken(await mint(), undefined)).resolves.toBe(false);
  });

  it("rejects tokens signed with a different secret", async () => {
    const forged = await new SignJWT({ email: "a@b.com" })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(new TextEncoder().encode("attacker-secret-attacker-secret"));
    await expect(isValidSessionToken(forged, SECRET)).resolves.toBe(false);
  });
});

describe("readSessionCookie", () => {
  it("reads the auth_token value from a NextRequest-style cookie jar", () => {
    const jar = { get: (n: string) => (n === SESSION_COOKIE_NAME ? { value: "tok" } : undefined) };
    expect(readSessionCookie(jar)).toBe("tok");
  });

  it("returns null when the cookie is absent", () => {
    expect(readSessionCookie({ get: () => undefined })).toBeNull();
  });
});
