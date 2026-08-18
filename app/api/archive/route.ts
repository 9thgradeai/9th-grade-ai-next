import { NextResponse } from "next/server";
import { getExamArchives } from "~backend/services/content";

export async function GET() {
  const archives = await getExamArchives();
  return NextResponse.json({ archives });
}
