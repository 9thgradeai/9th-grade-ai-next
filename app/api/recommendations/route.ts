import { NextResponse } from "next/server";
import { getRecommendations } from "~backend/services/content";

export async function GET() {
  const recommendations = await getRecommendations();
  return NextResponse.json({ recommendations });
}
