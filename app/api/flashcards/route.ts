import { NextResponse } from "next/server";
import { getFlashcards } from "~backend/services/content";
import { getUserIdFromRequest } from "~backend/services/user";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const subject = searchParams.get("subject") ?? undefined;
  // Optional auth: authenticated callers additionally receive their own SRS
  // state overlay (`srs` field per card).
  const userId = await getUserIdFromRequest(request);
  const flashcards = await getFlashcards(subject, userId);
  return NextResponse.json({ flashcards });
}
