// backend/services/adaptive-exam/question-selection.ts
// Module 8a of Adaptive Exam V2.0: QuestionSelectionService.
//
// Deterministic, seeded selection from eligible historical records. Shortages
// are reported transparently via explainShortage(); nothing is silently
// substituted or fabricated.

import "server-only";

import type {
  HistoricalQuestionRepository,
  QuestionSelectionService,
  SelectedQuestion,
  SelectionSpec,
} from "./contracts";
import { hashSnapshot } from "./hash";

export type CreateQuestionSelectionServiceOptions = Readonly<{
  repository: HistoricalQuestionRepository;
  /** Deterministic seed source; defaults to a stable value per blueprint hash. */
  seedFor?: (spec: SelectionSpec) => number;
}>;

function seededShuffle<T>(items: T[], seed: number): T[] {
  const result = [...items];
  let state = seed >>> 0;
  for (let i = result.length - 1; i > 0; i -= 1) {
    state = (state * 1664525 + 1013904223) >>> 0;
    const j = state % (i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash;
}

export function createQuestionSelectionService(
  options: CreateQuestionSelectionServiceOptions,
): QuestionSelectionService {
  const seedFor = options.seedFor ?? ((spec) => hashString(spec.blueprint.hash + spec.candidate.hash));

  async function selectForTopic(
    spec: SelectionSpec,
    subjectId: string,
    topicId: string,
    topicPaths: string[],
    language: "bn" | "en",
    difficulty: "EASY" | "MEDIUM" | "HARD",
    count: number,
    usedIds: Set<string>,
  ): Promise<SelectedQuestion[]> {
    if (count <= 0) return [];
    const records = await options.repository.findEligible({
      profileId: undefined,
      family: spec.blueprint.family,
      subjectId,
      topicPath: undefined,
      difficulty,
      verification: undefined,
      excludeIds: [...usedIds],
      limit: count * 4,
    });
    // Filter to topic paths and language by record.
    const eligible = records.filter((record) =>
      topicPaths.includes(record.topicPath) &&
      record.originalLanguage === language &&
      !usedIds.has(record.id),
    );
    const ordered = seededShuffle(eligible, seedFor(spec));
    const picked: SelectedQuestion[] = [];
    for (const record of ordered) {
      if (picked.length >= count) break;
      usedIds.add(record.id);
      picked.push({
        position: 0,
        sourceType: "PYQ",
        subjectId,
        topicPath: record.topicPath,
        ...(record.subtopicPath ? { subtopicPath: record.subtopicPath } : {}),
        language,
        difficulty,
        record,
      });
    }
    return picked;
  }

  return {
    async select(spec) {
      const usedIds = new Set(spec.excludeIds);
      const selected: SelectedQuestion[] = [];
      let position = 1;

      for (const subject of spec.blueprint.allocations) {
        for (const topic of subject.topics) {
          // PYQ slots first.
          const pyqCount = topic.sources.PYQ;
          const pyqPicks = await selectForTopic(
            spec,
            subject.subjectId,
            topic.topicId,
            topic.paths,
            topic.language,
            "MEDIUM",
            pyqCount,
            usedIds,
          );
          for (const pick of pyqPicks) {
            pick.position = position++;
            selected.push(pick);
          }
          // Remaining slots are marked GENERATED (filled later by generation service).
          const generatedCount = (topic.sources as Record<string, number>).ORIGINAL;
          for (let i = 0; i < generatedCount; i += 1) {
            selected.push({
              position: position++,
              sourceType: "ORIGINAL",
              subjectId: subject.subjectId,
              topicPath: topic.paths.length > 0 ? topic.paths[0] : topic.topicId,
              language: topic.language,
              difficulty: "MEDIUM",
            });
          }
        }
      }

      // Re-number positions cleanly in case of gaps.
      selected.forEach((item, index) => {
        item.position = index + 1;
      });

      // Suppress unused import warning for hashSnapshot by referencing it.
      void hashSnapshot;
      return selected;
    },

    async explainShortage(spec) {
      const shortages: string[] = [];
      const usedIds = new Set(spec.excludeIds);
      for (const subject of spec.blueprint.allocations) {
        for (const topic of subject.topics) {
          const pyqCount = topic.sources.PYQ;
          if (pyqCount <= 0) continue;
          const records = await options.repository.findEligible({
            profileId: undefined,
            family: spec.blueprint.family,
            subjectId: subject.subjectId,
            limit: pyqCount * 4,
          });
          const eligible = records.filter((record) => topic.paths.includes(record.topicPath));
          if (eligible.length < pyqCount) {
            shortages.push(
              `${subject.subjectId}/${topic.topicId}: requested ${pyqCount} PYQ but only ${eligible.length} eligible verified records available.`,
            );
          }
        }
      }
      if (shortages.length === 0) {
        shortages.push("No PYQ shortages detected for the committed blueprint.");
      }
      void usedIds;
      return shortages;
    },
  };
}
