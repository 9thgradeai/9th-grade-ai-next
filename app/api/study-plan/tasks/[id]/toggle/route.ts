import { NextResponse } from "next/server";
import { toggleStudyTask, getUserIdFromRequest } from "~backend/services/user";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = await getUserIdFromRequest(request);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const taskId = Number(id);
  try {
    const result = await toggleStudyTask(userId, taskId);
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }
}
