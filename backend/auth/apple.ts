// backend/auth/apple.ts — Apple Sign In (OAuth 2.0 + OIDC) helpers.
//
// Mirrors the Google module's safety posture: Authorization Code flow, opaque
// CSRF `state`, and local verification of Apple's `id_token` against Apple's
// published JWKS (issuer + audience + expiry + nonce) with `jose`. The Apple
// `client_secret` is a short-lived ES256 JWT signed with the private key
// (p8) — never a static secret in the browser.
//
// Server-only: never import into a client component.

import "server-only";

import { randomBytes, createHash } from "crypto";
import { createRemoteJWKSet, jwtVerify, SignJWT, importPKCS8 } from "jose";
import { AppError, ConfigurationError, ValidationError } from "~backend/errors";

const APPLE_AUTH_ENDPOINT = "https://appleid.apple.com/auth/authorize";
const APPLE_TOKEN_ENDPOINT = "https://appleid.apple.com/auth/token";
const APPLE_JWKS_URI = "https://appleid.apple.com/auth/keys";

const APPLE_ISSUER = "https://appleid.apple.com";

export type AppleProfile = {
  sub: string;
  email: string;
  emailVerified: boolean;
  name: string;
  picture?: string;
};

/** True when Apple Sign In is configured via environment variables. */
export function isAppleEnabled(): boolean {
  return Boolean(
    process.env.APPLE_CLIENT_ID &&
      process.env.APPLE_TEAM_ID &&
      process.env.APPLE_KEY_ID &&
      process.env.APPLE_PRIVATE_KEY,
  );
}

/**
 * Redirect URI used for the OAuth `redirect_uri`. Defaults to
 * `<origin>/api/auth/apple/callback`; override with APPLE_REDIRECT_URI behind a
 * proxy or when the canonical host differs from what the browser sees.
 */
export function getAppleRedirectUri(origin: string): string {
  return process.env.APPLE_REDIRECT_URI || `${origin}/api/auth/apple/callback`;
}

function clientId(): string {
  const id = process.env.APPLE_CLIENT_ID;
  if (!id) throw new ConfigurationError("APPLE_CLIENT_ID is not configured.");
  return id;
}

function teamId(): string {
  const id = process.env.APPLE_TEAM_ID;
  if (!id) throw new ConfigurationError("APPLE_TEAM_ID is not configured.");
  return id;
}

function keyId(): string {
  const id = process.env.APPLE_KEY_ID;
  if (!id) throw new ConfigurationError("APPLE_KEY_ID is not configured.");
  return id;
}

/** Apple p8 key, tolerating escaped newlines in env values. */
function privateKey(): string {
  const key = process.env.APPLE_PRIVATE_KEY;
  if (!key) throw new ConfigurationError("APPLE_PRIVATE_KEY is not configured.");
  return key.replace(/\\n/g, "\n");
}

// ── State / nonce primitives ────────────────────────────────

/** A 32-byte random, opaque state value (CSRF protection). */
export function generateOAuthState(): string {
  return randomBytes(32).toString("hex");
}

/** A high-entropy nonce sent to Apple and echoed back in the id_token. */
export function generateNonce(): string {
  return randomBytes(16).toString("base64url");
}

// ── Authorization URL ───────────────────────────────────────

export function buildAppleAuthUrl(opts: {
  state: string;
  redirectUri: string;
  nonce: string;
  loginHint?: string;
}): string {
  const url = new URL(APPLE_AUTH_ENDPOINT);
  url.searchParams.set("client_id", clientId());
  url.searchParams.set("redirect_uri", opts.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "name email");
  url.searchParams.set("response_mode", "query");
  url.searchParams.set("state", opts.state);
  url.searchParams.set("nonce", opts.nonce);
  if (opts.loginHint) url.searchParams.set("login_hint", opts.loginHint);
  return url.toString();
}

// ── client_secret JWT (ES256) ───────────────────────────────

/**
 * Build the Apple `client_secret`: a JWT signed with the developer key. Apple
 * rejects tokens older than ~6 months, so we cap `exp` at 5 minutes out — the
 * secret is single-use per exchange, not a long-lived credential.
 */
async function buildClientSecret(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({})
    .setProtectedHeader({ alg: "ES256", kid: keyId(), typ: "JWT" })
    .setIssuer(teamId())
    .setIssuedAt(now)
    .setExpirationTime(now + 5 * 60)
    .setAudience(APPLE_ISSUER)
    .setSubject(clientId())
    .sign(await importPKCS8(privateKey(), "ES256"));
}

// ── Token exchange ──────────────────────────────────────────

/**
 * Exchange the authorization `code` for Apple tokens. Returns the `id_token`
 * we then verify locally. Throws on any non-2xx or malformed response so the
 * caller can redirect the user back to login.
 */
export async function exchangeCodeForTokens(
  code: string,
  redirectUri: string,
): Promise<{ idToken: string }> {
  const clientSecret = await buildClientSecret();
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
    client_id: clientId(),
    client_secret: clientSecret,
  });

  let res: Response;
  try {
    res = await fetch(APPLE_TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
  } catch {
    throw new AppError(502, "Could not reach Apple to complete sign-in.", "OAUTH_TOKEN_FAILED");
  }

  if (!res.ok) {
    throw new AppError(502, "Apple rejected the sign-in request.", "OAUTH_TOKEN_FAILED");
  }

  const data = (await res.json().catch(() => ({}))) as {
    id_token?: string;
    error?: string;
  };
  if (!data.id_token) {
    throw new AppError(502, "Apple did not return an ID token.", "OAUTH_NO_ID_TOKEN");
  }
  return { idToken: data.id_token };
}

// ── ID-token verification ───────────────────────────────────

const JWKS = createRemoteJWKSet(new URL(APPLE_JWKS_URI));

/**
 * Verify an Apple-issued `id_token` (ES256) against Apple's JWKS, enforcing the
 * expected issuer, audience and (optional) nonce. Returns the decoded profile.
 */
export async function verifyAppleIdToken(
  idToken: string,
  nonce?: string,
): Promise<AppleProfile> {
  let payload: Record<string, unknown>;
  try {
    const result = await jwtVerify(idToken, JWKS, {
      issuer: APPLE_ISSUER,
      audience: clientId(),
      algorithms: ["ES256"],
    });
    payload = result.payload as Record<string, unknown>;
  } catch {
    throw new ValidationError("Apple sign-in token could not be verified.");
  }

  if (nonce && payload.nonce && payload.nonce !== nonce) {
    throw new ValidationError("Apple sign-in nonce did not match.");
  }

  const sub = typeof payload.sub === "string" ? payload.sub : undefined;
  const email = typeof payload.email === "string" ? payload.email.toLowerCase() : undefined;
  if (!sub || !email) {
    throw new ValidationError("Apple sign-in token is missing required claims.");
  }

  const name =
    typeof payload.name === "object" && payload.name && typeof (payload.name as { name?: unknown }).name === "string"
      ? ((payload.name as { name: string }).name.trim() || email.split("@")[0])
      : email.split("@")[0];

  return {
    sub,
    email,
    emailVerified: payload.email_verified === true,
    name,
    picture: undefined,
  };
}

/** SHA-256 of `input`, returned base64url — used if a raw nonce needs hashing. */
export function sha256Base64Url(input: string): string {
  return createHash("sha256").update(input).digest("base64url");
}
