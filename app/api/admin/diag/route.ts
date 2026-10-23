import "server-only";
import { NextResponse } from "next/server";
import { prisma } from "~backend/db";
export async function GET() {
  const rows = await prisma.question.groupBy({ by: ["subjectId"], _count: { _all: true } });
  return NextResponse.json(rows);
}
