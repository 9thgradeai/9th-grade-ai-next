import { describe, it, expect, beforeEach, vi } from "vitest";
import { encryptToken, decryptToken, CURRENT_KEY_VERSION } from "~backend/services/storage/encryption";

describe("encryption", () => {
  beforeEach(() => {
    process.env.GOOGLE_OAUTH_ENCRYPTION_KEY = "test-key-32-chars-long-for-testing-123456";
    process.env.AUTH_SECRET = "fallback-secret-not-used-in-test";
  });

  it("encrypts and decrypts round-trip with version prefix", () => {
    const plain = "ya29.test-access-token-123";
    const enc = encryptToken(plain);
    expect(enc.startsWith(`v${CURRENT_KEY_VERSION}:`)).toBe(true);
    expect(decryptToken(enc)).toBe(plain);
  });

  it("decrypts legacy format (without version)", async () => {
    // Simulate legacy enc without v prefix
    const { createCipheriv, randomBytes, createHash } = await import("crypto");
    const key = createHash("sha256").update(process.env.GOOGLE_OAUTH_ENCRYPTION_KEY!).digest();
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    const enc = Buffer.concat([cipher.update("legacy-token", "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    const legacy = `${iv.toString("hex")}:${tag.toString("hex")}:${enc.toString("hex")}`;
    expect(decryptToken(legacy)).toBe("legacy-token");
  });

  it("reencryptIfNeeded upgrades legacy", async () => {
    const { reencryptIfNeeded } = await import("~backend/services/storage/encryption");
    const legacy = encryptToken("test").replace(/^v1:/, "");
    const upgraded = reencryptIfNeeded(legacy);
    expect(upgraded.startsWith("v1:")).toBe(true);
  });
});
