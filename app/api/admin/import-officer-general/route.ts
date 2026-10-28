import { PrismaClient } from '@prisma/client';
import { importOfficerGeneral } from '../../../../scripts/import-officer-general';
import { NextResponse } from 'next/server';

export async function GET() {
  const prisma = new PrismaClient();
  try {
    const report = await importOfficerGeneral(prisma, { dryRun: false });
    await prisma.$disconnect();
    return NextResponse.json({ ok: true, report });
  } catch (e) {
    await prisma.$disconnect();
    return NextResponse.json({ ok: false, error: (e as any).message }, { status: 500 });
  }
}
