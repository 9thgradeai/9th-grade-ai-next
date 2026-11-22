# Adaptive Exam V2.0 — Phase 12/13 Answer-Key Entitlement & Audit

**Status:** Phase 12/13 deliverable.
**Scope:** Answer-key release entitlement and append-only audit service.

## 1. Answer-key entitlement

`createAnswerKeyEntitlementService(...)` releases a `SecureAnswerKey` only when:
- the attempt is submitted,
- the caller is the attempt owner or an admin,
- release is audited via `ExamAuditService`.

Keys are never exposed through the question paper (`PaperSnapshot` has no answer field).
The API route `/api/adaptive-exam/answer-key/[attemptId]` is a seam returning 404
until a real attempt lookup is wired.

## 2. Audit

`createInMemoryExamAuditService()` implements `ExamAuditService` (append-only,
queryable by entityId/name/from). Metadata is redacted per Phase 02 rules.

## 3. Files

| File | Purpose |
|------|---------|
| `backend/services/adaptive-exam/answer-key-entitlement.ts` | Entitlement service |
| `backend/services/adaptive-exam/answer-key-store.ts` | In-memory AnswerKeyStore |
| `backend/services/adaptive-exam/audit.ts` | In-memory ExamAuditService |
| `app/api/adaptive-exam/answer-key/[attemptId]/route.ts` | Release route seam |
| `docs/adaptive-exam/12-ANSWER-KEY-AND-AUDIT.md` | This document |
