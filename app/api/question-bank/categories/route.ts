import { NextResponse } from "next/server";
import { getQuestionBankCategories } from "~backend/services/content";

export async function GET() {
  const categories = await getQuestionBankCategories();
  return NextResponse.json({ categories });
}
