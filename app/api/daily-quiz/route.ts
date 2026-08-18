import { NextResponse } from "next/server";
import { getDailyQuiz } from "~backend/services/content";

export async function GET() {
  const quiz = await getDailyQuiz();
  return NextResponse.json({ quiz });
}
