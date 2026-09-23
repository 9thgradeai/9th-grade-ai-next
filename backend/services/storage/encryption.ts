import "server-only";
import { createCipheriv, createDecipheriv, randomBytes, createHash } from "crypto";

export const CURRENT_KEY_VERSION = 1;

function getRawKey(version: number = CURRENT_KEY_VERSION): string {
  // Production must have dedicated key — fail fast, no fallback to AUTH_SECRET
  const isProd = process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production";
  const dedicated = process.env.GOOGLE_OAUTH_ENCRYPTION_KEY;
  const versioned = version > 1 ? process.env[`GOOGLE_OAUTH_ENCRYPTION_KEY_V${version}`] : undefined;
  const raw = versioned || dedicated || (isProd ? undefined : process.env.AUTH_SECRET);
  if (!raw) {
    throw new Error(
      isProd
        ? "GOOGLE_OAUTH_ENCRYPTION_KEY is required in production (dedicated key, no fallback to AUTH_SECRET)"
        : "GOOGLE_OAUTH_ENCRYPTION_KEY or AUTH_SECRET required for token encryption"
    );
  }
  if (isProd && !dedicated && !versioned) {
    throw new Error("Production requires GOOGLE_OAUTH_ENCRYPTION_KEY (independent from AUTH_SECRET)");
  }
  return raw;
}

function getKey(version: number = CURRENT_KEY_VERSION): Buffer {
  const raw = getRawKey(version);
  if (raw.length === 64 && /^[0-9a-f]+$/i.test(raw)) return Buffer.from(raw, "hex").subarray(0, 32);
  return createHash("sha256").update(raw).digest();
}

export function validateEncryptionConfig(): void {
  // Fail fast on startup if prod config is missing
  getRawKey(CURRENT_KEY_VERSION);
}

/**
 * AES-256-GCM encrypt. Returns "v1:iv:authTag:ciphertext" hex.
 * Never logs plaintext. Versioned for key rotation.
 */
export function encryptToken(plaintext: string, version: number = CURRENT_KEY_VERSION): string {
  if (!plaintext) return "";
  const key = getKey(version);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v${version}:${iv.toString("hex")}:${tag.toString("hex")}:${enc.toString("hex")}`;
}

export function decryptToken(enc: string): string {
  if (!enc) return "";
  // Support both v1:iv:tag:data and legacy iv:tag:data
  const parts = enc.split(":");
  let version = CURRENT_KEY_VERSION;
  let ivHex: string, tagHex: string, dataHex: string;
  if (parts[0]?.startsWith("v")) {
    version = parseInt(parts[0].slice(1), 10) || CURRENT_KEY_VERSION;
    [, ivHex, tagHex, dataHex] = parts as unknown as [string, string, string, string];
  } else {
    [ivHex, tagHex, dataHex] = parts as unknown as [string, string, string];
  }
  if (!ivHex || !tagHex || !dataHex) throw new Error("Invalid encrypted token format");
  const key = getKey(version);
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  const dec = Buffer.concat([decipher.update(Buffer.from(dataHex, "hex")), decipher.final()]);
  return dec.toString("utf8");
}

// Rotation helper: re-encrypt with current version
export function reencryptIfNeeded(enc: string): string {
  if (!enc.startsWith(`v${CURRENT_KEY_VERSION}:`)) {
    const plain = decryptToken(enc);
    return encryptToken(plain, CURRENT_KEY_VERSION);
  }
  return enc;
}

export function hashForLog(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 8);
}
