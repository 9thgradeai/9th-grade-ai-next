// backend/services/adaptive-exam/prisma-audit-service.ts
// Append-only decision trail. Metadata is redacted again at the persistence
// boundary so a direct caller cannot bypass the no-answers/no-secrets rule.

import "server-only";

import type { Prisma, PrismaClient } from "@prisma/client";
import type { AdaptiveAuditEventName, AuditEvent, ExamAuditService } from "./contracts";
import { sanitizeAdaptiveMetadata } from "./errors";

export function createPrismaExamAuditService(client: PrismaClient): ExamAuditService {
  return {
    async record(event) {
      await client.adaptiveAuditEvent.create({
        data: {
          name: event.name,
          occurredAt: new Date(event.occurredAt),
          requestId: event.requestId,
          correlationId: event.correlationId ?? null,
          actorId: event.actorId ?? null,
          entityType: event.entityType,
          entityId: event.entityId,
          metadata: sanitizeAdaptiveMetadata(event.metadata) as Prisma.InputJsonValue,
        },
      });
    },
    async query(filter) {
      const rows = await client.adaptiveAuditEvent.findMany({
        where: {
          ...(filter.entityId ? { entityId: filter.entityId } : {}),
          ...(filter.name ? { name: filter.name } : {}),
          ...(filter.from ? { occurredAt: { gte: new Date(filter.from) } } : {}),
        },
        orderBy: { occurredAt: "asc" },
      });
      return rows.map(
        (row): AuditEvent => ({
          name: row.name as AdaptiveAuditEventName,
          occurredAt: row.occurredAt.toISOString(),
          requestId: row.requestId,
          ...(row.correlationId ? { correlationId: row.correlationId } : {}),
          ...(row.actorId ? { actorId: row.actorId } : {}),
          entityType: row.entityType,
          entityId: row.entityId,
          metadata: row.metadata as Record<string, unknown>,
        }),
      );
    },
  };
}
