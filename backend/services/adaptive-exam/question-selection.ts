// backend/services/adaptive-exam/question-selection.ts
// Module 8a of Adaptive Exam V2.0: QuestionSelectionService.
//
// Deterministic, seeded selection from eligible historical records. Topic
// filters are taxonomy PREFIX matches. Global exclusions from the committed
// blueprint are applied in addition to the candidate's exposure history.
// Shortages are reported transparently; nothing is silently fabricated.

import "server-only";

import type {
  DifficultyBand,
  HistoricalQuestionRepository,
  QuestionSelectionService,
  SelectedQuestion,
  SelectionSpec,
} from "./contracts";
import { pathMatchesPrefix } from "./historical-repository";

export type CreateQuestionSelectionServiceOptions = Readonly<{
  repository: HistoricalQuestionRepository;
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

/** Split a slot count across difficulty bands using the blueprint allocation. */
function splitByDifficulty(
  count: number,
  distribution: Record<DifficultyBand, number>,
): Record<DifficultyBand, number> {
  const bands: DifficultyBand[] = ["EASY", "MEDIUM", "HARD"];
  const totalWeight = bands.reduce((sum, band) => sum + (distribution[band] ?? 0), 0);
  const out: Record<DifficultyBand, number> = { EASY: 0, MEDIUM: 0, HARD: 0 };
  if (count <= 0) return out;
  let assigned = 0;
  for (const band of bands) {
    const weight = distribution[band] ?? 0;
    const exact = totalWeight > 0 ? (weight / totalWeight) * count : band === "MEDIUM" ? count : 0;
    out[band] = Math.floor(exact);
    assigned += out[band];
  }
  // Remainder goes to the largest-weighted band, never a fabricated band.
  const fallback = bands.reduce((best, band) =>
    (distribution[band] ?? 0) > (distribution[best] ?? 0) ? band : best, "MEDIUM");
  out[fallback] += count - assigned;
  return out;
}

export function createQuestionSelectionService(
  options: CreateQuestionSelectionServiceOptions,
): QuestionSelectionService {
  const seedFor = options.seedFor ?? ((spec) => hashString(spec.blueprint.hash + spec.candidate.hash));

  async function selectForTopic(
    spec: SelectionSpec,
    subjectId: string,
    topicPaths: string[],
    subtopicPaths: string[] | undefined,
    language: "bn" | "en",
    difficulty: DifficultyBand,
    count: number,
    usedIds: Set<string>,
  ): Promise<SelectedQuestion[]> {
    if (count <= 0 || topicPaths.length === 0) return [];
    const records = await options.repository.findEligible({
      family: spec.blueprint.family,
      subjectId,
      topicPath: topicPaths[0],
      difficulty,
      excludeIds: [...usedIds, ...spec.blueprint.duplicateExclusions],
      limit: count * 5,
    });
    const eligible = records.filter((record) => {
      const subtopicPath = record.subtopicPath;
      return topicPaths.some((prefix) => pathMatchesPrefix(record.topicPath, prefix)) &&
        (!subtopicPaths || subtopicPaths.length === 0 ||
          !subtopicPath || subtopicPaths.some((prefix) => pathMatchesPrefix(subtopicPath, prefix))) &&
        record.originalLanguage === language &&
        !usedIds.has(record.id);
    });
    const ordered = seededShuffle(eligible, seedFor(spec) + hashString(`${subjectId}|${topicPaths[0]}|${difficulty}`));
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
      const usedIds = new Set([...spec.excludeIds, ...spec.blueprint.duplicateExclusions]);
      const selected: SelectedQuestion[] = [];

      for (const subject of spec.blueprint.allocations) {
        for (const topic of subject.topics) {
          const totalCount = topic.count;
          const difficultySplit = splitByDifficulty(totalCount, topic.difficulty);
          const pyqByDifficulty = splitByDifficulty(topic.sources.PYQ ?? 0, topic.difficulty);
          const requestedGenerated = (topic.sources as Record<string, number>).ORIGINAL ?? 0;
          const generatedByDifficulty = splitByDifficulty(requestedGenerated, topic.difficulty);

          for (const band of ["EASY", "MEDIUM", "HARD"] as const) {
            const picks = await selectForTopic(
              spec,
              subject.subjectId,
              topic.paths,
              topic.subtopicPaths,
              topic.language,
              band,
              pyqByDifficulty[band],
              usedIds,
            );
            selected.push(...picks);
            for (let i = 0; i < generatedByDifficulty[band]; i += 1) {
              selected.push({
                position: 0,
                sourceType: "ORIGINAL",
                subjectId: subject.subjectId,
                topicPath: topic.paths.length > 0 ? topic.paths[0] : topic.topicId,
                ...(topic.subtopicPaths?.[0] ? { subtopicPath: topic.subtopicPaths[0] } : {}),
                language: topic.language,
                difficulty: band,
              });
            }
          }
          void difficultySplit;
        }
      }

      selected.forEach((item, index) => {
        item.position = index + 1;
      });
      return selected;
    },

    async explainShortage(spec) {
      const shortages: string[] = [];
      const usedIds = new Set([...spec.excludeIds, ...spec.blueprint.duplicateExclusions]);
      for (const subject of spec.blueprint.allocations) {
        for (const topic of subject.topics) {
          const pyqCount = topic.sources.PYQ ?? 0;
          if (pyqCount <= 0) continue;
          const records = await options.repository.findEligible({
            family: spec.blueprint.family,
            subjectId: subject.subjectId,
            topicPath: topic.paths[0],
            excludeIds: [...usedIds],
            limit: pyqCount * 5,
          });
          const eligible = records.filter((record) =>
            topic.paths.some((prefix) => pathMatchesPrefix(record.topicPath, prefix)));
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
      return shortages;
    },
  };
}
