import { NextResponse } from "next/server";
import { getUserIdFromRequest } from "~backend/services/user";
import { restoreEntity, restoreAll } from "~backend/services/storage/restoreService";
import type { SyncEntityType } from "~backend/services/storage/types";

const ALLOWED: SyncEntityType[] = ["BOOKMARKS", "FLASHCARD_STATE", "VOCAB_PROGRESS", "MISTAKE_NOTES", "USER_PREFERENCES", "EXAM_ARCHIVE"];

export async function POST(request: Request) {
  const userId = await getUserIdFromRequest(request);
  if (!userId) return NextResponse.json({ error: "Unauthorized", code: "AUTH_UNAUTHORIZED" }, { status: 401 });

  const body = await request.json().catch(() => ({})) as { entityType?: string; all?: boolean };
  if (body.all) {
    const results = await restoreAll(userId);
    return NextResponse.json({ results });
  }
  const et = body.entityType as SyncEntityType | undefined;
  if (!et || !ALLOWED.includes(et)) {
    return NextResponse.json({ error: `entityType must be one of ${ALLOWED.join(", ")}`, code: "VALIDATION_ERROR" }, { status: 400 });
  }
  const result = await restoreEntity(userId, et);
  const status = result.status === "success" ? 200 : result.status === "conflict" ? 409 : result.status === "no_file" ? 404 : 400;
  return NextResponse.json(result, { status });
}
