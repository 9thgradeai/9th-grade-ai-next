import { NextResponse } from "next/server";
import { getUserIdFromRequest } from "~backend/services/user";
import { exchangeCode, fetchGoogleProfile, saveConnection } from "~backend/services/storage/connection";
import { log } from "~backend/infrastructure/observability/logger";

/** Parse one cookie value without naive split(";") pitfalls (values may be quoted/encoded). */
function getCookie(request: Request, name: string): string | undefined {
  const header = request.headers.get("cookie") || "";
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    if (part.slice(0, idx).trim() === name) {
      try {
        return decodeURIComponent(part.slice(idx + 1).trim());
      } catch {
        return undefined;
      }
    }
  }
  return undefined;
}

/**
 * Redirect base for this callback. NEXT_PUBLIC_APP_URL is deployment config,
 * not user input — but it must still be a valid http(s) URL, otherwise we
 * fall back to the request origin. Never redirects to an arbitrary host,
 * killing the open-redirect vector.
 */
function redirectBase(request: Request): string {
  const configured = (process.env.NEXT_PUBLIC_APP_URL || "").trim();
  if (/^https?:\/\/[^/]+$/i.test(configured)) return configured;
  return new URL(request.url).origin;
}

const SETTINGS_OK = "/dashboard?tab=settings&storage=connected";
const SETTINGS_FAIL = "/dashboard?tab=settings&storage_error=oauth_failed";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  if (error) {
    return NextResponse.redirect(`${redirectBase(request)}${SETTINGS_FAIL}`, 302);
  }
  if (!code || !state) {
    return NextResponse.json({ error: "Missing code/state", code: "VALIDATION_ERROR" }, { status: 400 });
  }

  // Verify state + PKCE verifier from cookies (robust parse)
  const stateCookie = getCookie(request, "storage_oauth_state");
  const userCookie = getCookie(request, "storage_oauth_user");
  const codeVerifier = getCookie(request, "storage_oauth_verifier");

  if (!stateCookie || stateCookie !== state) {
    return NextResponse.json({ error: "Invalid state (CSRF)", code: "CSRF_ERROR" }, { status: 403 });
  }

  const userId = await getUserIdFromRequest(request);
  // Ensure same user who initiated
  if (!userId || (userCookie && userCookie !== userId)) {
    return NextResponse.json({ error: "User mismatch", code: "AUTH_UNAUTHORIZED" }, { status: 401 });
  }

  try {
    const tokens = await exchangeCode(code, codeVerifier);
    const profile = await fetchGoogleProfile(tokens.access_token);
    await saveConnection(userId!, tokens as never, profile);
    // Enqueue initial migration for all user-owned entities (resumable, idempotent, verified before marking complete)
    void import("~backend/services/storage/syncService").then(async (m) => {
      for (const et of ["BOOKMARKS", "FLASHCARD_STATE", "VOCAB_PROGRESS", "USER_PREFERENCES"] as const) {
        await m.enqueueSync({ userId: userId!, entityType: et as never }).catch(() => {});
      }
    }).catch(() => {});

    const res = NextResponse.redirect(`${redirectBase(request)}${SETTINGS_OK}`, 302);
    res.cookies.set("storage_oauth_state", "", { maxAge: 0, path: "/" });
    res.cookies.set("storage_oauth_user", "", { maxAge: 0, path: "/" });
    res.cookies.set("storage_oauth_verifier", "", { maxAge: 0, path: "/" });
    return res;
  } catch (e) {
    // Never reflect provider error text into the redirect (XSS) and never log tokens.
    log.error("storage.oauth-callback-failed", { error: (e as Error).message.slice(0, 200) });
    return NextResponse.redirect(`${redirectBase(request)}${SETTINGS_FAIL}`, 302);
  }
}
