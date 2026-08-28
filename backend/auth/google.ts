// backend/auth/google.ts — Google OAuth 2.0 / OpenID Connect helpers.
//
// "Optimized" design choices:
//   • Authorization Code flow with PKCE (S256). No client_secret-in-browser,
//     and the code alone is useless without the verifier we keep in an HttpOnly
//     cookie — so a leaked `code` from logs/proxies cannot be exchanged.
//   • Opaque, single-use `state` (CSRF protection) bound to the same cookie as
//     the verifier, so both are verified together in the callback.
//   • The Google `id_token` is verified locally against Google's published JWKS
//     (issuer + audience + expiry) with `jose` — no extra round-trip and no new
//     dependency beyond what the project already uses for session JWTs.
//
// Server-only: never import into a client component.

import "server-only";

import { createHash, randomBytes } from "crypto";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { AppError, ConfigurationError, ValidationError } from "~backend/errors";

const GOOGLE_AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const GOOGLE_JWKS_URI = "https://www.googleapis.com/oauth2/v3/certs";

const GOOGLE_ISSUERS = ["https://accounts.google.com", "accounts.google.com"];

export type GoogleProfile = {
  sub: string;
  email: string;
  emailVerified: boolean;
  name: string;
  picture?: string;
};

/** True when Google OAuth is configured via environment variables. */
export function isGoogleEnabled(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID) && Boolean(process.env.GOOGLE_CLIENT_SECRET);
}

/**
 * Redirect URI used for the OAuth `redirect_uri`. Defaults to
 * `<origin>/api/auth/google/callback`; override with GOOGLE_REDIRECT_URI when the
 * app is served behind a proxy or on a different canonical host than the
 * browser sees.
 */
export function getGoogleRedirectUri(origin: string): string {
  return process.env.GOOGLE_REDIRECT_URI || `${origin}/api/auth/google/callback`;
}

function clientId(): string {
  const id = process.env.GOOGLE_CLIENT_ID;
  if (!id) throw new ConfigurationError("GOOGLE_CLIENT_ID is not configured.");
  return id;
}

function clientSecret(): string {
  const secret = process.env.GOOGLE_CLIENT_SECRET;
  if (!secret) throw new ConfigurationError("GOOGLE_CLIENT_SECRET is not configured.");
  return secret;
}

// ── PKCE primitives ─────────────────────────────────────────

/** Base64url-encode a buffer (RFC 7636 §A). */
export function base64URLEncode(buf: Buffer): string {
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/** SHA-256 of `input`, returned base64url (the PKCE code_challenge). */
export function sha256Base64Url(input: string): string {
  return base64URLEncode(createHash("sha256").update(input).digest());
}

/** A 32-byte random, URL-safe code_verifier. */
export function generateCodeVerifier(): string {
  return base64URLEncode(randomBytes(32));
}

/** A 32-byte random, opaque state value. */
export function generateOAuthState(): string {
  return randomBytes(32).toString("hex");
}

// ── Authorization URL ──────────────────────────────────────

export function buildGoogleAuthUrl(opts: {
  state: string;
  codeChallenge: string;
  redirectUri: string;
  loginHint?: string;
}): string {
  const url = new URL(GOOGLE_AUTH_ENDPOINT);
  url.searchParams.set("client_id", clientId());
  url.searchParams.set("redirect_uri", opts.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("state", opts.state);
  url.searchParams.set("code_challenge", opts.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  if (opts.loginHint) url.searchParams.set("login_hint", opts.loginHint);
  return url.toString();
}

// ── Token exchange ─────────────────────────────────────────

/**
 * Exchange the authorization `code` (plus PKCE verifier) for Google tokens.
 * Returns the `id_token` we then verify locally. Throws on any non-2xx or
 * malformed response so the caller can redirect the user back to login.
 */
export async function exchangeCodeForTokens(
  code: string,
  codeVerifier: string,
  redirectUri: string,
): Promise<{ idToken: string }> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    code_verifier: codeVerifier,
    client_id: clientId(),
    client_secret: clientSecret(),
    redirect_uri: redirectUri,
  });

  let res: Response;
  try {
    res = await fetch(GOOGLE_TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
  } catch {
    throw new AppError(502, "Could not reach Google to complete sign-in.", "OAUTH_TOKEN_FAILED");
  }

  if (!res.ok) {
    throw new AppError(502, "Google rejected the sign-in request.", "OAUTH_TOKEN_FAILED");
  }

  const data = (await res.json().catch(() => ({}))) as {
    id_token?: string;
    error?: string;
  };
  if (!data.id_token) {
    throw new AppError(502, "Google did not return an ID token.", "OAUTH_NO_ID_TOKEN");
  }
  return { idToken: data.id_token };
}

// ── ID-token verification ──────────────────────────────────

// Lazily-fetched Google signing keys. Created once per server instance; `jose`
// caches and rotates the JWKS automatically.
const JWKS = createRemoteJWKSet(new URL(GOOGLE_JWKS_URI));

/**
 * Verify a Google-issued `id_token` (RS256) against Google's JWKS, enforcing
 * the expected issuer and audience. Returns the decoded profile on success.
 */
export async function verifyGoogleIdToken(idToken: string): Promise<GoogleProfile> {
  let payload: Record<string, unknown>;
  try {
    const result = await jwtVerify(idToken, JWKS, {
      issuer: GOOGLE_ISSUERS,
      audience: clientId(),
    });
    payload = result.payload as Record<string, unknown>;
  } catch {
    throw new ValidationError("Google sign-in token could not be verified.");
  }

  const sub = typeof payload.sub === "string" ? payload.sub : undefined;
  const email = typeof payload.email === "string" ? payload.email.toLowerCase() : undefined;
  if (!sub || !email) {
    throw new ValidationError("Google sign-in token is missing required claims.");
  }

  const name =
    typeof payload.name === "string" && payload.name.trim().length > 0
      ? payload.name.trim()
      : email.split("@")[0];

  return {
    sub,
    email,
    emailVerified: payload.email_verified === true,
    name,
    picture: typeof payload.picture === "string" ? payload.picture : undefined,
  };
}
