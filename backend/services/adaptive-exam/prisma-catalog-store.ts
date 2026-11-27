// backend/services/adaptive-exam/prisma-catalog-store.ts
// Read seam for the extensible exam hierarchy. Code seeds remain the fallback
// so the tab works before catalog rows are registered.

import "server-only";

import type { PrismaClient } from "@prisma/client";
import type { AdaptiveCatalogStore, ExamCatalog, ExamFamily } from "./contracts";

export function createPrismaAdaptiveCatalogStore(client: PrismaClient): AdaptiveCatalogStore {
  return {
    async organizations() {
      const rows = await client.adaptiveExamOrganization.findMany({
        where: { active: true },
        orderBy: { code: "asc" },
      });
      return rows.map(
        (row): ExamCatalog["organizations"][number] => ({
          id: row.id,
          code: row.code,
          family: row.family as ExamFamily,
          nameBn: row.nameBn,
          nameEn: row.nameEn,
          active: row.active,
        }),
      ) as ExamCatalog["organizations"];
    },
    async posts() {
      const rows = await client.adaptiveExamPost.findMany({
        where: { active: true },
        orderBy: { code: "asc" },
        include: { organization: { select: { code: true } } },
      });
      return rows.map((row) => ({
        id: row.id,
        code: row.code,
        nameBn: row.nameBn,
        nameEn: row.nameEn,
        active: row.active,
        organizationId: row.organization.code,
      }));
    },
    async types() {
      const rows = await client.adaptiveExamType.findMany({
        where: { active: true },
        orderBy: { code: "asc" },
        include: { post: { select: { id: true } } },
      });
      return rows.map((row) => ({
        id: row.id,
        code: row.code,
        nameBn: row.nameBn,
        nameEn: row.nameEn,
        active: row.active,
        postId: row.post.id,
        ...(row.profileId ? { profileId: row.profileId } : {}),
      }));
    },
  };
}
