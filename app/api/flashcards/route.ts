import { NextResponse } from "next/server";
import { getFlashcards } from "~backend/services/content";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const subject = searchParams.get("subject") ?? undefined;
  const flashcards = await getFlashcards(subject);
  return NextResponse.json({ flashcards });
}
