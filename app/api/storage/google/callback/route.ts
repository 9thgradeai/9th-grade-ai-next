import { NextResponse } from "next/server";
import { getUserIdFromRequest } from "~backend/services/user";
import { exchangeCode, fetchGoogleProfile, saveConnection } from "~backend/services/storage/connection";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  if (error) {
    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL || ""}/dashboard?tab=settings&storage_error=${encodeURIComponent(error)}`, 302);
  }
  if (!code || !state) {
    return NextResponse.json({ error: "Missing code/state", code: "VALIDATION_ERROR" }, { status: 400 });
  }

  // Verify state + PKCE verifier from cookies
  const cookieHeader = request.headers.get("cookie") || "";
  const stateCookie = cookieHeader.split(";").find((c) => c.trim().startsWith("storage_oauth_state="))?.split("=")[1];
  const userCookie = cookieHeader.split(";").find((c) => c.trim().startsWith("storage_oauth_user="))?.split("=")[1];
  const verifierCookie = cookieHeader.split(";").find((c) => c.trim().startsWith("storage_oauth_verifier="))?.split("=")[1];
  const codeVerifier = verifierCookie ? decodeURIComponent(verifierCookie) : undefined;

  if (!stateCookie || decodeURIComponent(stateCookie) !== state) {
    return NextResponse.json({ error: "Invalid state (CSRF)", code: "CSRF_ERROR" }, { status: 403 });
  }

  const userId = await getUserIdFromRequest(request);
  // Ensure same user who initiated
  if (!userId || (userCookie && decodeURIComponent(userCookie) !== userId)) {
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

    const res = NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL || ""}/dashboard?tab=settings&storage=connected`, 302);
    res.cookies.set("storage_oauth_state", "", { maxAge: 0, path: "/" });
    res.cookies.set("storage_oauth_user", "", { maxAge: 0, path: "/" });
    res.cookies.set("storage_oauth_verifier", "", { maxAge: 0, path: "/" });
    return res;
  } catch (e) {
    const msg = (e as Error).message.slice(0, 200);
    // Never log tokens
    console.error("[storage] OAuth callback failed:", msg);
    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL || ""}/dashboard?tab=settings&storage_error=${encodeURIComponent(msg)}`, 302);
  }
}
