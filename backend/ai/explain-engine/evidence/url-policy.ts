// URL safety policy for evidence records.
//
// We do NOT fetch arbitrary result URLs (that would be an SSRF surface). We
// validate them syntactically and only ever display them. Reachability is
// therefore reported as unknown, never as "verified live".

export type UrlPolicyResult =
  | { ok: true; url: string; hostname: string }
  | { ok: false; reason: string };

const BLOCKED_HOSTS = new Set([
  "localhost",
  "localhost.localdomain",
  "0.0.0.0",
  "metadata.google.internal",
  "metadata",
]);

const BLOCKED_SUFFIXES = [".localhost", ".local", ".internal", ".home.arpa", ".lan", ".test", ".invalid"];

const ALLOWED_PORTS = new Set(["", "80", "443"]);

function isPrivateIpv4(host: string): boolean {
  const parts = host.split(".").map((p) => Number(p));
  if (parts.length !== 4 || parts.some((p) => !Number.isInteger(p) || p < 0 || p > 255)) {
    return false;
  }
  const [a, b] = parts;
  if (a === 10 || a === 127 || a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a >= 224) return true;
  return false;
}

function isPrivateIpv6(host: string): boolean {
  const h = host.replace(/^\[|\]$/g, "").toLowerCase();
  if (h === "::1" || h === "::") return true;
  if (h.startsWith("fc") || h.startsWith("fd")) return true;
  if (h.startsWith("fe8") || h.startsWith("fe9") || h.startsWith("fea") || h.startsWith("feb")) return true;
  if (h.startsWith("::ffff:")) return isPrivateIpv4(h.slice(7));
  if (h.startsWith("64:ff9b:")) return true;
  return false;
}

export function checkSourceUrl(raw: string): UrlPolicyResult {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > 2_000) {
    return { ok: false, reason: "empty-or-too-long" };
  }
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, reason: "malformed-url" };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, reason: "non-http-protocol" };
  }
  if (url.username || url.password) {
    return { ok: false, reason: "credentials-in-url" };
  }
  if (!ALLOWED_PORTS.has(url.port)) {
    return { ok: false, reason: "non-standard-port" };
  }
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (!host) return { ok: false, reason: "missing-host" };
  if (BLOCKED_HOSTS.has(host) || BLOCKED_SUFFIXES.some((s) => host.endsWith(s))) {
    return { ok: false, reason: "private-host" };
  }
  if (isPrivateIpv4(host) || isPrivateIpv6(host)) {
    return { ok: false, reason: "private-ip" };
  }
  return { ok: true, url: url.toString(), hostname: host };
}

const OFFICIAL_SUFFIXES = [
  ".gov.bd",
  ".gov",
  ".gov.uk",
  ".gov.in",
  ".ac.bd",
  ".edu",
  ".edu.bd",
  ".un.org",
  ".imf.org",
  ".worldbank.org",
  ".who.int",
  ".ilo.org",
  ".bb.org.bd",
  ".bbs.gov.bd",
  ".bpsc.gov.bd",
  ".mof.gov.bd",
  ".nbr.gov.bd",
  ".legislation.gov.bd",
  ".bangladesh.gov.bd",
];

export type EvidenceTypeHint = "PRIMARY" | "OFFICIAL" | "REPUTABLE" | "REFERENCE" | "DERIVED" | "UNVERIFIED";

const REFERENCE_DOMAINS = new Set([
  "wikipedia.org",
  "en.wikipedia.org",
  "bn.wikipedia.org",
  "britannica.com",
  "merriam-webster.com",
  "dictionary.com",
  "cambridge.org",
  "oxfordlearnersdictionaries.com",
  "banglaacademy.org.bd",
]);

const UNVERIFIED_DOMAINS = new Set([
  "facebook.com",
  "x.com",
  "twitter.com",
  "reddit.com",
  "quora.com",
  "medium.com",
  "blogspot.com",
  "wordpress.com",
  "youtube.com",
]);

export function classifySource(hostname: string): EvidenceTypeHint {
  const host = hostname.toLowerCase().replace(/^www\./, "");
  if (OFFICIAL_SUFFIXES.some((s) => host === s.slice(1) || host.endsWith(s))) return "OFFICIAL";
  if (REFERENCE_DOMAINS.has(host) || [...REFERENCE_DOMAINS].some((d) => host.endsWith(`.${d}`))) {
    return "REFERENCE";
  }
  if (UNVERIFIED_DOMAINS.has(host) || [...UNVERIFIED_DOMAINS].some((d) => host.endsWith(`.${d}`))) {
    return "UNVERIFIED";
  }
  return "REPUTABLE";
}

export function publisherFor(hostname: string): string {
  return hostname.replace(/^www\./, "");
}
