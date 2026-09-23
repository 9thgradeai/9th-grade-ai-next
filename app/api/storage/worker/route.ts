import { NextResponse } from "next/server";
import { processPendingJobs } from "~backend/services/storage/syncService";

// Protected by cron secret or internal call
export async function POST(request: Request) {
  const auth = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET || process.env.WORKER_SECRET;
  // Allow internal calls without secret in dev, but require in prod
  if (process.env.NODE_ENV === "production" && cronSecret && auth !== `Bearer ${cronSecret}`) {
    // Also allow Vercel cron (no auth) if explicitly configured
    const isVercelCron = request.headers.get("x-vercel-cron") === "1";
    if (!isVercelCron) return NextResponse.json({ error: "Unauthorized", code: "AUTH_UNAUTHORIZED" }, { status: 401 });
  }
  const count = await processPendingJobs(10);
  return NextResponse.json({ processed: count });
}

export async function GET(request: Request) {
  // Vercel Cron does GET with x-vercel-cron:1 — process jobs in that case
  const isVercelCron = request.headers.get("x-vercel-cron") === "1";
  if (isVercelCron) {
    const count = await processPendingJobs(10);
    return NextResponse.json({ processed: count, via: "cron" });
  }
  return NextResponse.json({ ok: true, message: "Worker endpoint — POST to process" });
}
