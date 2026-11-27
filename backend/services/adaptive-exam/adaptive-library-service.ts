// backend/services/adaptive-exam/adaptive-library-service.ts
// Shared published-mock library with privacy separation.
//
// UPCOMING rows expose metadata only; papers appear at availableFrom; DRAFT and
// PRIVATE rows never reach another candidate. Answer keys are never returned.

import "server-only";

import { randomUUID } from "node:crypto";
import type {
  AdaptiveLibraryService,
  EntityId,
  ExamFamily,
  MockPublication,
  MockPublicationStore,
  PaperSnapshot,
  PaperStore,
} from "./contracts";
import { adaptiveError } from "./errors";

export type LibraryEntry = MockPublication & { paper?: PaperSnapshot };

export type CreateAdaptiveLibraryServiceOptions = Readonly<{
  publications: MockPublicationStore;
  papers: PaperStore;
  clock: { now(): string };
  /** Optional resolver used by family/profile filters; never exposes answers. */
  resolvePaperProfile?: (paperId: EntityId) => Promise<{ family: ExamFamily; profileId: string } | null>;
}>;

function windowOpen(publication: MockPublication, now: string): boolean {
  if (publication.availableFrom && now < publication.availableFrom) return false;
  if (publication.availableTo && now > publication.availableTo) return false;
  return true;
}

export function createAdaptiveLibraryService(
  options: CreateAdaptiveLibraryServiceOptions,
): AdaptiveLibraryService {
  const { publications, papers, clock } = options;

  async function withPaper(publication: MockPublication, includePaper: boolean): Promise<LibraryEntry> {
    if (!includePaper) return publication;
    const paper = await papers.get(publication.paperId);
    return paper ? { ...publication, paper } : publication;
  }

  return {
    async list(filter) {
      const now = clock.now();
      const rows = await publications.list();
      const entries: LibraryEntry[] = [];
      for (const publication of rows) {
        if (publication.visibility !== "PUBLIC") continue;
        if (publication.status === "DRAFT") continue;
        if (publication.status === "UPCOMING") {
          entries.push(await withPaper(publication, false));
          continue;
        }
        if (!windowOpen(publication, now)) continue;
        entries.push(await withPaper(publication, true));
      }

      const filtered: LibraryEntry[] = [];
      for (const entry of entries) {
        if (filter?.status && entry.status !== filter.status) continue;
        if (filter?.subjectId) {
          const hasSubject = entry.paper?.questions.some(
            (question) => question.subjectId === filter.subjectId,
          );
          if (!hasSubject) continue;
        }
        if (filter?.family || filter?.profileId) {
          const resolved = options.resolvePaperProfile
            ? await options.resolvePaperProfile(entry.paperId)
            : null;
          if (filter.family && resolved?.family !== filter.family) continue;
          if (filter.profileId && resolved?.profileId !== filter.profileId) continue;
        }
        filtered.push(entry);
      }
      return filtered;
    },

    async get(paperId, viewerId) {
      const publication = await publications.get(paperId);
      if (!publication || publication.status === "DRAFT") return null;
      if (publication.visibility === "PRIVATE" && publication.createdBy !== viewerId) return null;
      if (publication.status === "UPCOMING") return withPaper(publication, false);
      if (!windowOpen(publication, clock.now())) return null;
      return withPaper(publication, true);
    },

    async publish(input) {
      const paper = await papers.get(input.paperId);
      if (!paper) {
        throw adaptiveError("ADAPTIVE_PAPER_NOT_FOUND", "Cannot publish a missing paper.", {
          stage: "integration",
          requestId: "library",
          metadata: { paperId: input.paperId },
        });
      }
      const existing = await publications.get(input.paperId);
      if (existing) {
        return publications.updateStatus(existing.id, {
          status: input.status,
          ...(input.availableFrom !== undefined ? { availableFrom: input.availableFrom } : {}),
          ...(input.availableTo !== undefined ? { availableTo: input.availableTo } : {}),
        });
      }
      return publications.put({
        id: randomUUID(),
        paperId: input.paperId,
        status: input.status,
        titleBn: input.titleBn,
        titleEn: input.titleEn,
        ...(input.availableFrom ? { availableFrom: input.availableFrom } : {}),
        ...(input.availableTo ? { availableTo: input.availableTo } : {}),
        visibility: "PUBLIC",
        contentHash: paper.contentHash,
        immutable: true,
        createdBy: input.actorId,
        createdAt: clock.now(),
      });
    },
  };
}
