/* Centralized Unicode/text pipeline utilities.
   Every PDF text path normalizes through here (NFC + safe sanitize).
   No scattered .normalize() calls — one authoritative layer. */
export function normalizeText(text: unknown): string {
  if (text === null || text === undefined) return "";
  const s = typeof text === "string" ? text : String(text);
  // NFC: canonical composition (Bengali vowel signs + consonants compose correctly)
  return s.normalize("NFC");
}

export function sanitizeForPdf(text: unknown, maxLen = 2000): string {
  let s = normalizeText(text);
  // Strip C0 controls except tab/newline; strip lone surrogates; never split valid multi-byte chars
  s = s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "");
  s = s.replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/g, "");
  s = s.replace(/(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, "");
  return s.length > maxLen ? s.slice(0, maxLen) + "\u2026" : s;
}
