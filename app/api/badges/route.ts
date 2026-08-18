// src/app/api/badges/route.ts — list achievement badges.
import { NextResponse } from "next/server";
import { prisma } from "~backend/db";

export async function GET() {
  const badges = await prisma.badge.findMany({ orderBy: { id: "asc" } });
  return NextResponse.json({
    badges: badges.map((b) => ({
      id: b.id,
      name: b.name,
      description: b.description,
      icon: b.icon,
      rarity: b.rarity,
      unlocked: b.unlockedSeed,
    })),
  });
}
