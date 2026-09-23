import { NextResponse } from "next/server";
import { getUserIdFromRequest } from "~backend/services/user";
import { buildAuthUrl } from "~backend/services/storage/connection";
import { randomBytes } from "crypto";

export async function GET(request: Request) {
  const userId = await getUserIdFromRequest(request);
  if (!userId) return NextResponse.json({ error: "Unauthorized", code: "AUTH_UNAUTHORIZED" }, { status: 401 });

  const state = randomBytes(24).toString("base64url");
  const url = buildAuthUrl(state);

  const res = NextResponse.redirect(url, 302);
  // State in httpOnly, secure, sameSite, 10 min
  res.cookies.set("storage_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
  // Bind state to user to prevent fixation
  res.cookies.set("storage_oauth_user", userId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
  return res;
}
