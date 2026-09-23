import { NextResponse } from "next/server";
import { getUserIdFromRequest } from "~backend/services/user";
import { prisma } from "~backend/db";
import { createEnvelope } from "~backend/services/storage/dataFormat";
import type { SyncEntityType } from "~backend/services/storage/types";

export async function GET(request: Request) {
  const userId = await getUserIdFromRequest(request);
  if (!userId) return NextResponse.json({ error: "Unauthorized", code: "AUTH_UNAUTHORIZED" }, { status: 401 });

  const url = new URL(request.url);
  const entityType = (url.searchParams.get("entityType") as SyncEntityType | null) ?? null;

  const types: SyncEntityType[] = entityType ? [entityType] : ["BOOKMARKS", "USER_PREFERENCES"];
  const envelopes: unknown[] = [];
  for (const et of types) {
    let data: unknown;
    switch (et) {
      case "BOOKMARKS": {
        const rows = await prisma.bookmark.findMany({ where: { userId }, select: { questionId: true } });
        data = { bookmarks: rows.map((r) => r.questionId) };
        break;
      }
      case "USER_PREFERENCES": {
        const u = await prisma.user.findUnique({ where: { id: userId }, select: { handle: true, examTarget: true } });
        data = { prefs: u };
        break;
      }
      default: data = { note: "Export not supported for this entity" };
    }
    const env = createEnvelope({ entityType: et, id: `${userId}:${et}`, userId, data });
    envelopes.push(env);
  }

  return NextResponse.json({ exportedAt: new Date().toISOString(), envelopes }, {
    headers: { "Content-Disposition": `attachment; filename="9th-grade-ai-export-${userId.slice(0, 8)}.json"` },
  });
}
