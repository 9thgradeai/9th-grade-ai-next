import { NextResponse } from "next/server";
import { getMockTests } from "~backend/services/content";

export async function GET() {
  const tests = await getMockTests();
  return NextResponse.json({ tests });
}
