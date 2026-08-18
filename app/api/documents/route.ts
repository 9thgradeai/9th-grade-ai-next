import { NextResponse } from "next/server";
import { getDocuments } from "~backend/services/content";

export async function GET() {
  const documents = await getDocuments();
  return NextResponse.json({ documents });
}
