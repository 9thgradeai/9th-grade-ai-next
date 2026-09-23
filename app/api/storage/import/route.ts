import { NextResponse } from "next/server";
import { getUserIdFromRequest } from "~backend/services/user";
import { verifyEnvelope, migrateEnvelope, computeChecksum } from "~backend/services/storage/dataFormat";

export async function POST(request: Request) {
  const userId = await getUserIdFromRequest(request);
  if (!userId) return NextResponse.json({ error: "Unauthorized", code: "AUTH_UNAUTHORIZED" }, { status: 401 });

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Invalid JSON", code: "VALIDATION_ERROR" }, { status: 400 });

  const envelope = body as { schemaVersion?: number; entityType?: string; id?: string; userId?: string; checksum?: string; data?: unknown };
  if (!envelope.schemaVersion || !envelope.entityType || !envelope.checksum) {
    return NextResponse.json({ error: "Missing envelope fields", code: "VALIDATION_ERROR" }, { status: 400 });
  }
  if (envelope.userId && envelope.userId !== userId) {
    return NextResponse.json({ error: "Cannot import another user's data", code: "FORBIDDEN" }, { status: 403 });
  }
  // Verify checksum
  const computed = computeChecksum(envelope.data);
  if (computed !== envelope.checksum) {
    return NextResponse.json({ error: "Checksum mismatch — corrupted file", code: "CHECKSUM_MISMATCH" }, { status: 400 });
  }
  // Migrate
  try {
    const migrated = migrateEnvelope(envelope as never);
    if (!verifyEnvelope(migrated as never)) throw new Error("Verify failed");
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message, code: "MIGRATION_FAILED" }, { status: 400 });
  }

  // For now, import is validated but not automatically applied — user must use /restore for Drive files
  // This endpoint is for manual file upload validation (safe import validation)
  return NextResponse.json({ ok: true, message: "File validated — use /api/storage/restore for Drive restore" });
}
