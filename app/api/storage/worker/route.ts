import { NextResponse } from "next/server";
import { processPendingJobs } from "~backend/services/storage/syncService";

export const maxDuration = 60;

function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET || process.env.WORKER_SECRET;
  // In production a secret is mandatory — never fail open.
  if (process.env.NODE_ENV === "production" && !secret) return false;
  if (!secret) return process.env.NODE_ENV !== "production";
  const auth = request.headers.get("authorization");
  return auth === `Bearer ${secret}`;
}

// POST triggers job processing. Requires Bearer CRON_SECRET/WORKER_SECRET
// in every environment except local dev. The `x-vercel-cron` header alone
// is client-spoofable and is NOT accepted as auth.
export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized", code: "AUTH_UNAUTHORIZED" }, { status: 401 });
  }
  const count = await processPendingJobs(10);
  return NextResponse.json({ processed: count });
}

// GET is status-only and MUST NOT trigger side effects.
export async function GET() {
  return NextResponse.json({ ok: true, message: "Worker endpoint — POST to process" });
}
