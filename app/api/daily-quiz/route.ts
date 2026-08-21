import { NextResponse } from "next/server";
import { getDailyQuiz } from "~backend/services/content";
import { getUserIdFromRequest } from "~backend/services/user";

export async function GET(request: Request) {
  // Optional auth: anonymous callers receive neutral flags; authenticated
  // callers receive their own participation state (Phase 2).
  const userId = await getUserIdFromRequest(request);
  const quiz = await getDailyQuiz(userId);
  return NextResponse.json({ quiz });
}
