// backend/services/adaptive-exam/global-duplicate-service.ts
// Global duplicate gate. Exact, near and template duplicates are rejected
// across all users/papers. Concept overlap is allowed up to a per-paper cap.
// In explicit revision mode an authentic PYQ may be repeated deliberately.

import "server-only";

import type {
  DuplicateDecision,
  EntityId,
  GlobalDuplicateService,
  IsoTimestamp,
  QuestionExposure,
  QuestionExposureStore,
  QuestionFingerprint,
  QuestionIdentityService,
} from "./contracts";

export type CreateGlobalDuplicateServiceOptions = Readonly<{
  identity: QuestionIdentityService;
  store: QuestionExposureStore;
  maxConceptOverlapPerTopic?: number;
  now?: () => IsoTimestamp;
  idFactory?: () => EntityId;
}>;

export function createInMemoryQuestionExposureStore(): QuestionExposureStore {
  const rows: QuestionExposure[] = [];
  return {
    async findByExactHash(hash) {
      return rows.find((row) => row.exactHash === hash) ?? null;
    },
    async findByNearHash(hash) {
      return rows.find((row) => row.nearHash === hash) ?? null;
    },
    async findByTemplateHash(hash) {
      return rows.find((row) => row.templateHash === hash) ?? null;
    },
    async countConcept(subjectId, topicPath, since) {
      return rows.filter((row) =>
        row.subjectId === subjectId &&
        row.topicPath === topicPath &&
        (!since || row.firstSeenAt >= since)).length;
    },
    async insert(exposure) {
      rows.push(exposure);
      return exposure;
    },
  };
}

export function createGlobalDuplicateService(
  options: CreateGlobalDuplicateServiceOptions,
): GlobalDuplicateService {
  const maxConcept = options.maxConceptOverlapPerTopic ?? 3;
  const now = options.now ?? (() => new Date().toISOString());
  let counter = 0;
  const idFactory = options.idFactory ?? (() => `exposure-${(counter += 1)}`);

  function reject(
    level: DuplicateDecision["level"],
    reason: string,
    matchedExposureId?: EntityId,
  ): DuplicateDecision {
    return { level, accepted: false, reason, ...(matchedExposureId ? { matchedExposureId } : {}) };
  }

  return {
    async check(input) {
      const fp = options.identity.fingerprint(input.questionText, input.options);

      // The current paper is checked first; repetition inside one paper is
      // never allowed, even in revision mode.
      if (input.currentPaperFingerprints.has(fp.exactHash)) {
        return reject("EXACT", "Duplicate question already exists in this paper.");
      }
      if (input.currentPaperFingerprints.has(fp.nearHash)) {
        return reject("NEAR", "Near-duplicate question already exists in this paper.");
      }
      if (input.currentPaperFingerprints.has(fp.templateHash)) {
        return reject("TEMPLATE", "Same question template already exists in this paper.");
      }

      const exact = await options.store.findByExactHash(fp.exactHash);
      if (exact) {
        return input.revisionMode
          ? { level: "REVISION", accepted: true, reason: "Authentic PYQ repetition allowed in revision mode.", matchedExposureId: exact.id }
          : reject("EXACT", "Exact question already appeared in another paper.", exact.id);
      }
      const near = await options.store.findByNearHash(fp.nearHash);
      if (near) {
        return input.revisionMode
          ? { level: "REVISION", accepted: true, reason: "Authentic PYQ repetition allowed in revision mode.", matchedExposureId: near.id }
          : reject("NEAR", "Near-duplicate question already appeared in another paper.", near.id);
      }
      const template = await options.store.findByTemplateHash(fp.templateHash);
      if (template) {
        return input.revisionMode
          ? { level: "REVISION", accepted: true, reason: "Authentic PYQ repetition allowed in revision mode.", matchedExposureId: template.id }
          : reject("TEMPLATE", "Question template already appeared in another paper.", template.id);
      }

      if (input.conceptKey && input.currentPaperConcepts) {
        let used = 0;
        for (const concept of input.currentPaperConcepts) {
          if (concept === input.conceptKey) used += 1;
        }
        if (used >= (input.maxConceptOverlapPerTopic ?? maxConcept)) {
          return reject("CONCEPT", "Per-paper concept overlap cap reached.");
        }
      }

      return { level: "NONE", accepted: true, reason: "No duplicate detected." };
    },

    async record(input) {
      const exposure: QuestionExposure = {
        ...input.fingerprint,
        id: idFactory(),
        profileId: input.profileId,
        subjectId: input.subjectId,
        topicPath: input.topicPath,
        source: input.source,
        visibility: input.visibility,
        ...(input.paperId ? { paperId: input.paperId } : {}),
        ...(input.ownerId ? { ownerId: input.ownerId } : {}),
        firstSeenAt: now(),
      };
      await options.store.insert(exposure);
    },
  };
}
