// backend/services/adaptive-exam/audit.ts
// Phase 13 of Adaptive Exam V2.0: ExamAuditService (in-memory; Prisma adapter
// follows the same port). Append-only decision trail with request/correlation ids
// and redacted metadata.

import "server-only";

import type { AuditEvent, ExamAuditService } from "./contracts";

export function createInMemoryExamAuditService(): ExamAuditService {
  const events: AuditEvent[] = [];
  return {
    async record(event) {
      events.push(event);
    },
    async query(filter) {
      return events.filter((event) => {
        if (filter.entityId && event.entityId !== filter.entityId) return false;
        if (filter.name && event.name !== filter.name) return false;
        if (filter.from && event.occurredAt < filter.from) return false;
        return true;
      });
    },
  };
}
