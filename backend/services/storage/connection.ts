import "server-only";
import { prisma } from "~backend/db";
import { encryptToken, decryptToken } from "./encryption";

const GOOGLE_AUTH = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO = "https://www.googleapis.com/oauth2/v2/userinfo";

// Least-privilege: only app-created files (drive.file) + profile email
export const DRIVE_SCOPES = [
  "https://www.googleapis.com/auth/drive.file",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
].join(" ");

export function getOAuthConfig() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/api/storage/google/callback`;
  if (!clientId || !clientSecret) throw new Error("GOOGLE_CLIENT_ID/SECRET not configured");
  return { clientId, clientSecret, redirectUri };
}

export function buildAuthUrl(state: string): string {
  const { clientId, redirectUri } = getOAuthConfig();
  const p = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: DRIVE_SCOPES,
    access_type: "offline",
    prompt: "consent",
    state,
    include_granted_scopes: "false",
  });
  return `${GOOGLE_AUTH}?${p.toString()}`;
}

export async function exchangeCode(code: string): Promise<{ access_token: string; refresh_token?: string; expires_in: number; scope: string }> {
  const { clientId, clientSecret, redirectUri } = getOAuthConfig();
  const res = await fetch(GOOGLE_TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, grant_type: "authorization_code" }),
  });
  if (!res.ok) throw new Error(`Token exchange failed ${res.status}: ${await res.text().then((t) => t.slice(0, 300))}`);
  return res.json();
}

export async function refreshAccessToken(refreshToken: string): Promise<{ access_token: string; expires_in: number }> {
  const { clientId, clientSecret } = getOAuthConfig();
  const res = await fetch(GOOGLE_TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ refresh_token: refreshToken, client_id: clientId, client_secret: clientSecret, grant_type: "refresh_token" }),
  });
  if (!res.ok) throw new Error(`Refresh failed ${res.status}`);
  return res.json();
}

export async function fetchGoogleProfile(accessToken: string): Promise<{ id: string; email: string; name: string }> {
  const res = await fetch(GOOGLE_USERINFO, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) throw new Error("Failed to fetch Google profile");
  return res.json();
}

export async function getValidAccessToken(userId: string): Promise<{ token: string; connectionId: string }> {
  const conn = await prisma.storageConnection.findUnique({ where: { userId } });
  if (!conn || conn.status !== "CONNECTED") throw Object.assign(new Error("Not connected"), { code: "NOT_CONNECTED" });
  if (!conn.accessTokenEnc || !conn.refreshTokenEnc) throw Object.assign(new Error("Missing tokens"), { code: "NO_TOKENS" });
  const expiresAt = conn.tokenExpiresAt ? new Date(conn.tokenExpiresAt).getTime() : 0;
  if (expiresAt - Date.now() > 60_000) {
    return { token: decryptToken(conn.accessTokenEnc), connectionId: conn.id };
  }
  // Refresh
  const refreshToken = decryptToken(conn.refreshTokenEnc);
  try {
    const refreshed = await refreshAccessToken(refreshToken);
    const newAccessEnc = encryptToken(refreshed.access_token);
    await prisma.storageConnection.update({
      where: { userId },
      data: { accessTokenEnc: newAccessEnc, tokenExpiresAt: new Date(Date.now() + refreshed.expires_in * 1000), status: "CONNECTED", lastError: null },
    });
    return { token: refreshed.access_token, connectionId: conn.id };
  } catch (e) {
    await prisma.storageConnection.update({ where: { userId }, data: { status: "EXPIRED", lastError: (e as Error).message.slice(0, 500) } });
    throw Object.assign(new Error("Token refresh failed, re-auth required"), { code: "TOKEN_EXPIRED" });
  }
}

export async function saveConnection(userId: string, tokens: { access_token: string; refresh_token?: string; expires_in: number; scope: string }, profile: { id: string; email: string; name: string }) {
  const existing = await prisma.storageConnection.findUnique({ where: { userId } });
  const accessEnc = encryptToken(tokens.access_token);
  const refreshEnc = tokens.refresh_token ? encryptToken(tokens.refresh_token) : existing?.refreshTokenEnc;
  if (!refreshEnc) throw new Error("No refresh_token — ensure prompt=consent");
  return prisma.storageConnection.upsert({
    where: { userId },
    update: {
      googleAccountId: profile.id,
      googleEmail: profile.email,
      googleName: profile.name,
      accessTokenEnc: accessEnc,
      refreshTokenEnc: refreshEnc,
      tokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000),
      scope: tokens.scope,
      status: "CONNECTED",
      lastError: null,
    },
    create: {
      userId,
      provider: "GOOGLE_DRIVE",
      googleAccountId: profile.id,
      googleEmail: profile.email,
      googleName: profile.name,
      accessTokenEnc: accessEnc,
      refreshTokenEnc: refreshEnc,
      tokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000),
      scope: tokens.scope,
      status: "CONNECTED",
    },
  });
}
