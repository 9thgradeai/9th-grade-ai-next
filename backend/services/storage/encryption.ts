import "server-only";
import { createCipheriv, createDecipheriv, randomBytes, createHash } from "crypto";

function getKey(): Buffer {
  const raw = process.env.GOOGLE_OAUTH_ENCRYPTION_KEY || process.env.AUTH_SECRET;
  if (!raw) throw new Error("GOOGLE_OAUTH_ENCRYPTION_KEY or AUTH_SECRET required for token encryption");
  // Derive 32-byte key via SHA-256 if not exactly 32 bytes
  if (raw.length === 64 && /^[0-9a-f]+$/i.test(raw)) return Buffer.from(raw, "hex").subarray(0, 32);
  if (raw.length >= 32) return createHash("sha256").update(raw).digest();
  return createHash("sha256").update(raw).digest();
}

/**
 * AES-256-GCM encrypt. Returns "iv:authTag:ciphertext" hex.
 * Never logs plaintext.
 */
export function encryptToken(plaintext: string): string {
  if (!plaintext) return "";
  const key = getKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${tag.toString("hex")}:${enc.toString("hex")}`;
}

export function decryptToken(enc: string): string {
  if (!enc) return "";
  const [ivHex, tagHex, dataHex] = enc.split(":");
  if (!ivHex || !tagHex || !dataHex) throw new Error("Invalid encrypted token format");
  const key = getKey();
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  const dec = Buffer.concat([decipher.update(Buffer.from(dataHex, "hex")), decipher.final()]);
  return dec.toString("utf8");
}

export function hashForLog(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 8);
}
