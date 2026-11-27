// backend/services/adaptive-exam/profile-registry.ts
// Module 2 of Adaptive Exam V2.0: the ExamProfileRegistry implementation.
//
// Authority model (ADR-075 + Phase 02 assumption):
//   • The reviewed code registry SEEDS profiles; the DB snapshot store becomes
//     authoritative once a version is committed. A committed blueprint pins a
//     version, so a later edit can never rewrite a historical paper.
//   • Four profile ids have no reviewed config. They resolve to null with an
//     explicit reason — never a substituted paper shape.
//   • `reviewed` is not `approved`. officialSimulationEnabled() is false until
//     a profile is approved AND its unsourced duration/difficulty gaps have
//     been explicitly supplied AND the snapshot validates.

import "server-only";

import type { ValidationIssue } from "~backend/services/exam-config/types";
import type {
  AdaptiveExamClock,
  AdaptiveExamLogger,
  AdaptiveExamProfileId,
  AdaptiveValidationResult,
  ExamFamily,
  ExamProfile,
  ExamProfileRegistry,
} from "./contracts";
import { adaptiveError } from "./errors";
import { hashSnapshot } from "./hash";
import {
  SEED_PROFILES,
  SEED_AUTHORED_AT,
  SEED_CHANGED_BY,
  getSeedProfile,
  unavailableReason,
} from "./profile-seeds";

// ─────────────────────────────────────────────────────────────
// Snapshot store port
// ─────────────────────────────────────────────────────────────

export type StoredProfileSnapshot = {
  profile: ExamProfile;
  contentHash: string;
  createdAt: string;
};

/**
 * Persistence port for immutable profile versions. `insert` MUST reject a
 * duplicate (id, version) — the DB enforces this with @@unique([profileId,
 * version]); in-memory test stores must do the same.
 */
export interface ProfileSnapshotStore {
  find(
    id: AdaptiveExamProfileId,
    version: number,
  ): Promise<StoredProfileSnapshot | null>;
  latest(id: AdaptiveExamProfileId): Promise<StoredProfileSnapshot | null>;
  list(family?: ExamFamily): Promise<StoredProfileSnapshot[]>;
  insert(snapshot: StoredProfileSnapshot): Promise<StoredProfileSnapshot>;
}

/**
 * Profile ids are open: the catalog may register new posts and "Others"
 * organisations without a TypeScript release. We validate shape + family
 * consistency here, and catalog membership at resolution/registration time.
 */
function familyForProfileId(id: string): ExamFamily {
  if (id.startsWith("BCS_")) return "BCS";
  if (id.startsWith("BB_") || id.startsWith("BANK_")) return "BANK";
  return "OTHERS";
}

const OVERRIDE_KEYS: ReadonlySet<string> = new Set([
  "questionCount",
  "durationMin",
  "difficulty",
  "language",
  "sourceMix",
  "topics",
]);

const VERIFICATION_STATUSES: ReadonlySet<string> = new Set([
  "draft",
  "reviewed",
  "approved",
  "rejected",
]);

const EPSILON = 1e-9;

const SOURCE_KINDS: ReadonlySet<string> = new Set([
  "official",
  "user-provided",
  "curated",
]);

type LooseRecord = Record<string, unknown>;

function asRecord(value: unknown): LooseRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as LooseRecord)
    : null;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function isDifficultySourced(distribution: LooseRecord | null): boolean {
  if (!distribution) return false;
  const values = [
    finiteNumber(distribution.EASY),
    finiteNumber(distribution.MEDIUM),
    finiteNumber(distribution.HARD),
  ];
  let sourced = false;
  for (const value of values) {
    if (value === null) return false;
    if (value > 0) sourced = true;
  }
  return sourced;
}

// ─────────────────────────────────────────────────────────────
// Pure validation
// ─────────────────────────────────────────────────────────────

/**
 * Validate a profile before it can seed, resolve for a full exam, or be
 * committed as a new revision. Accepts `unknown` deliberately: snapshots come
 * from JSON columns and request bodies, where a `ExamProfile` type assertion
 * proves nothing at runtime. Errors block use; warnings disclose unsourced
 * gaps that gate official simulation but do not invent values.
 */
export function validateProfile(input: unknown): AdaptiveValidationResult {
  const issues: ValidationIssue[] = [];
  const add = (
    severity: ValidationIssue["severity"],
    code: string,
    message: string,
    path?: string,
  ): void => {
    issues.push({ severity, code, message, path });
  };

  const profile = asRecord(input);
  if (!profile) {
    return {
      valid: false,
      issues: [{ severity: "error", code: "PROFILE_INVALID", message: "Profile is not an object." }],
    };
  }

  const id = profile.id;
  if (typeof id !== "string" || id.trim() === "") {
    add("error", "PROFILE_ID_UNKNOWN", "Profile id must be a non-empty string.", "id");
  }
  const version = finiteNumber(profile.version);
  if (version === null || !Number.isInteger(version) || version < 1) {
    add("error", "VERSION_INVALID", "Profile version must be a positive integer.", "version");
  }

  const expectedFamily: ExamFamily = typeof id === "string" ? familyForProfileId(id) : "OTHERS";
  if (profile.family !== expectedFamily) {
    add(
      "error",
      "FAMILY_MISMATCH",
      `Family "${String(profile.family)}" does not match profile id "${String(id)}".`,
      "family",
    );
  }
  const expectedEcosystem = expectedFamily === "BCS" ? "BCS" : expectedFamily === "BANK" ? "BANGLADESH_BANK" : "OTHERS";
  if (profile.ecosystemCode !== expectedEcosystem) {
    add(
      "error",
      "ECOSYSTEM_MISMATCH",
      `ecosystemCode "${String(profile.ecosystemCode)}" must be "${expectedEcosystem}" for this family.`,
      "ecosystemCode",
    );
  }

  for (const field of [
    "organization",
    "recruitmentPost",
    "stage",
    "labelBn",
    "labelEn",
  ] as const) {
    if (!isNonEmptyString(profile[field])) {
      add("error", "FIELD_REQUIRED", `${field} must be a non-empty string.`, field);
    }
  }

  // Subjects and counts.
  const rawSubjects = profile.subjects;
  if (!Array.isArray(rawSubjects) || rawSubjects.length === 0) {
    add("error", "SUBJECTS_EMPTY", "Profile must declare at least one subject.", "subjects");
  } else {
    const seenSubjects = new Set<string>();
    let countSum = 0;
    for (const rawSubject of rawSubjects) {
      const subject = asRecord(rawSubject);
      const subjectId = subject?.subjectId;
      const path = `subjects.${String(subjectId)}`;
      if (!isNonEmptyString(subjectId)) {
        add("error", "SUBJECT_ID_INVALID", "Subject id must be a non-empty string.", path);
      } else {
        if (seenSubjects.has(subjectId)) {
          add("error", "SUBJECT_ID_DUPLICATE", `Duplicate subject id "${subjectId}".`, path);
        }
        seenSubjects.add(subjectId);
      }
      const count = finiteNumber(subject?.count);
      if (count === null || !Number.isInteger(count) || count <= 0) {
        add("error", "SUBJECT_COUNT_INVALID", `Subject "${String(subjectId)}" has an invalid count.`, path);
      } else {
        countSum += count;
      }
      if (subject?.language !== "bn" && subject?.language !== "en") {
        add("error", "SUBJECT_LANGUAGE_INVALID", `Subject "${String(subjectId)}" has an invalid language.`, path);
      }
      const topics = subject?.topics;
      if (!Array.isArray(topics)) {
        add("error", "TOPICS_INVALID", `Subject "${String(subjectId)}" topics must be an array.`, path);
      } else {
        const seenTopics = new Set<string>();
        for (const rawTopic of topics) {
          const topic = asRecord(rawTopic);
          const topicId = topic?.topicId;
          const topicPath = `${path}.${String(topicId)}`;
          if (!isNonEmptyString(topicId)) {
            add("error", "TOPIC_ID_INVALID", "Topic id must be a non-empty string.", topicPath);
          } else {
            if (seenTopics.has(topicId)) {
              add("error", "TOPIC_ID_DUPLICATE", `Duplicate topic id "${topicId}".`, topicPath);
            }
            seenTopics.add(topicId);
          }
          if (!Array.isArray(topic?.paths)) {
            add("error", "TOPIC_PATHS_INVALID", `Topic "${String(topicId)}" paths must be an array.`, topicPath);
          }
          if (topic?.count !== undefined) {
            const topicCount = finiteNumber(topic.count);
            if (topicCount === null || topicCount <= 0) {
              add("error", "TOPIC_COUNT_INVALID", `Topic "${String(topicId)}" has an invalid count.`, topicPath);
            }
          }
        }
      }
    }
    const totalQuestions = finiteNumber(profile.totalQuestions);
    if (totalQuestions !== null && countSum !== totalQuestions) {
      add(
        "error",
        "SUBJECT_COUNT_TOTAL_MISMATCH",
        `Subject counts sum to ${countSum} but totalQuestions is ${totalQuestions}.`,
        "subjects",
      );
    }
  }

  // Scoring and totals.
  const scoring = asRecord(profile.scoring);
  const marksPerQuestion = finiteNumber(scoring?.marksPerQuestion);
  const penaltyPerWrong = finiteNumber(scoring?.penaltyPerWrong);
  const marksForUnanswered = finiteNumber(scoring?.marksForUnanswered);
  if (marksPerQuestion === null || marksPerQuestion <= 0) {
    add("error", "SCORING_INVALID", "marksPerQuestion must be a positive number.", "scoring");
  }
  if (penaltyPerWrong === null || penaltyPerWrong < 0) {
    add("error", "SCORING_INVALID", "penaltyPerWrong must be a non-negative number.", "scoring");
  }
  if (marksForUnanswered === null) {
    add("error", "SCORING_INVALID", "marksForUnanswered must be a finite number.", "scoring");
  }
  const totalQuestions = finiteNumber(profile.totalQuestions);
  const totalMarks = finiteNumber(profile.totalMarks);
  if (
    totalQuestions !== null &&
    totalMarks !== null &&
    marksPerQuestion !== null &&
    Math.abs(totalQuestions * marksPerQuestion - totalMarks) > EPSILON
  ) {
    add(
      "error",
      "TOTAL_MARKS_MISMATCH",
      `totalMarks (${totalMarks}) must equal totalQuestions × marksPerQuestion.`,
      "totalMarks",
    );
  }

  // Duration: zero is an explicit, disclosed sentinel — not a fabricated value.
  const duration = finiteNumber(profile.durationMin);
  if (duration === null || duration < 0) {
    add("error", "DURATION_INVALID", "durationMin must be a non-negative number.", "durationMin");
  } else if (duration === 0) {
    add(
      "warning",
      "DURATION_UNSOURCED",
      "durationMin=0 is an unsourced sentinel; supply a verified duration before official simulation.",
      "durationMin",
    );
  }

  // Difficulty distribution: all-zero sentinel or an explicit 100% split.
  const difficulty = asRecord(profile.difficultyDistribution);
  const difficultyValues = [
    finiteNumber(difficulty?.EASY),
    finiteNumber(difficulty?.MEDIUM),
    finiteNumber(difficulty?.HARD),
  ];
  if (difficultyValues.some((value) => value === null || value < 0)) {
    add("error", "DIFFICULTY_INVALID", "Difficulty values must be non-negative numbers.", "difficultyDistribution");
  } else if (!isDifficultySourced(difficulty)) {
    add(
      "warning",
      "DIFFICULTY_UNSOURCED",
      "Difficulty distribution is an all-zero sentinel: no verified distribution exists.",
      "difficultyDistribution",
    );
  } else {
    const sum = difficultyValues.reduce<number>((acc, value) => acc + (value ?? 0), 0);
    if (Math.abs(sum - 100) > EPSILON) {
      add(
        "error",
        "DIFFICULTY_SUM_INVALID",
        "A sourced difficulty distribution must sum to 100.",
        "difficultyDistribution",
      );
    }
  }

  // PYQ policy: verified answers only is the platform rule.
  const pyq = asRecord(profile.pyqPolicy);
  const allowSourceClaimedAnswers = pyq?.allowSourceClaimedAnswers;
  const allowUnverifiedAnswers = pyq?.allowUnverifiedAnswers;
  if (typeof allowSourceClaimedAnswers !== "boolean" || typeof allowUnverifiedAnswers !== "boolean") {
    add("error", "PYQ_POLICY_INVALID", "pyqPolicy booleans are required.", "pyqPolicy");
  } else if (allowSourceClaimedAnswers || allowUnverifiedAnswers) {
    add(
      "warning",
      "PYQ_POLICY_RELAXED",
      "pyqPolicy permits unverified/source-claimed answers; official simulation requires verified answers only.",
      "pyqPolicy",
    );
  }
  const minVerifiedShare = finiteNumber(pyq?.minVerifiedShare);
  if (minVerifiedShare === null || minVerifiedShare < 0 || minVerifiedShare > 1) {
    add("error", "PYQ_SHARE_INVALID", "minVerifiedShare must be between 0 and 1.", "pyqPolicy.minVerifiedShare");
  }

  const overrides = profile.allowedOverrides;
  if (!Array.isArray(overrides)) {
    add("error", "OVERRIDES_INVALID", "allowedOverrides must be an array.", "allowedOverrides");
  } else {
    for (const key of overrides) {
      if (typeof key !== "string" || !OVERRIDE_KEYS.has(key)) {
        add("error", "OVERRIDE_NOT_ALLOWED", `Unknown override key "${String(key)}".`, "allowedOverrides");
      }
    }
  }

  const source = asRecord(profile.source);
  const sourceKind = source?.kind;
  if (typeof sourceKind !== "string" || !SOURCE_KINDS.has(sourceKind)) {
    add("error", "SOURCE_INVALID", "source.kind must be official, user-provided or curated.", "source");
  } else if (sourceKind === "official" && !isNonEmptyString(source?.reference)) {
    add("warning", "SOURCE_REFERENCE_MISSING", "An official source should carry a reference.", "source.reference");
  }

  const status = profile.verificationStatus;
  if (typeof status !== "string" || !VERIFICATION_STATUSES.has(status)) {
    add("error", "VERIFICATION_STATUS_INVALID", "Unknown verificationStatus.", "verificationStatus");
  }

  const rawHistory = profile.revisionHistory;
  if (!Array.isArray(rawHistory) || rawHistory.length === 0) {
    add("error", "REVISION_HISTORY_INVALID", "A profile must record at least one revision.", "revisionHistory");
  } else {
    let previous = 0;
    for (const rawRevision of rawHistory) {
      const revision = asRecord(rawRevision);
      const revisionVersion = finiteNumber(revision?.version);
      if (
        revisionVersion === null ||
        !Number.isInteger(revisionVersion) ||
        revisionVersion <= previous ||
        !isNonEmptyString(revision?.changedAt) ||
        !isNonEmptyString(revision.changedBy) ||
        !isNonEmptyString(revision.summary)
      ) {
        add("error", "REVISION_HISTORY_INVALID", "Revision entries must be increasing, complete and versioned.", "revisionHistory");
        break;
      }
      previous = revisionVersion;
    }
    if (version !== null && previous !== version) {
      add(
        "error",
        "REVISION_HEAD_MISMATCH",
        `Latest revision is v${previous} but profile version is ${version}.`,
        "revisionHistory",
      );
    }
  }

  const notes = profile.notes;
  if (!Array.isArray(notes) || notes.some((note) => typeof note !== "string")) {
    add("error", "NOTES_INVALID", "notes must be an array of strings.", "notes");
  }

  return { valid: !issues.some((issue) => issue.severity === "error"), issues };
}

/** True only for an approved, fully sourced, strictly verified snapshot. */
export function officialSimulationEnabled(profile: ExamProfile): boolean {
  if (profile.verificationStatus !== "approved") return false;
  const duration = finiteNumber(profile.durationMin);
  if (duration === null || duration <= 0) return false;
  if (!isDifficultySourced(profile.difficultyDistribution)) return false;
  const pyq = profile.pyqPolicy;
  if (pyq.allowSourceClaimedAnswers || pyq.allowUnverifiedAnswers || pyq.minVerifiedShare !== 1) return false;
  return validateProfile(profile).valid;
}

/** Content hash of the canonical profile snapshot (volatile store fields excluded). */
export function hashProfile(profile: ExamProfile): string {
  return hashSnapshot(profile);
}

// ─────────────────────────────────────────────────────────────
// Registry factory
// ─────────────────────────────────────────────────────────────

export type ProfileRegistry = ExamProfileRegistry & {
  /** Idempotent: inserts only missing seed versions; detects hash drift. */
  ensureSeeded(): Promise<{
    inserted: string[];
    unchanged: string[];
    hashes: Record<string, string>;
  }>;
  /** Honest explanation for an unseedable profile id. */
  unavailabilityReason(id: AdaptiveExamProfileId): string | null;
  /** Canonical hash for a profile version, for blueprint pinning. */
  hash(profile: ExamProfile): string;
};

export type CreateProfileRegistryOptions = {
  store: ProfileSnapshotStore;
  clock: AdaptiveExamClock;
  requestId: string;
  logger?: AdaptiveExamLogger;
};

const NOOP_LOGGER: AdaptiveExamLogger = {
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
  debug: () => undefined,
  child: () => NOOP_LOGGER,
};

export function createProfileRegistry(
  options: CreateProfileRegistryOptions,
): ProfileRegistry {
  const { store, clock, requestId } = options;
  const logger = options.logger ?? NOOP_LOGGER;

  function fail(
    code: Parameters<typeof adaptiveError>[0],
    message: string,
    metadata: Record<string, unknown> = {},
  ): never {
    throw adaptiveError(code, message, {
      stage: "configuration",
      requestId,
      metadata,
    });
  }

  function requireValid(profile: ExamProfile, context: string): void {
    const result = validateProfile(profile);
    if (!result.valid) {
      const record = asRecord(profile);
      fail("ADAPTIVE_PROFILE_INVALID", `${context}: profile failed validation.`, {
        profileId: record?.id,
        version: record?.version,
        codes: result.issues.filter((issue) => issue.severity === "error").map((issue) => issue.code),
      });
    }
  }

  return {
    validate: validateProfile,

    officialSimulationEnabled,

    hash: hashProfile,

    unavailabilityReason: unavailableReason,

    async list(family?: ExamFamily): Promise<ExamProfile[]> {
      const byKey = new Map<string, ExamProfile>();
      // Seeds first; committed DB snapshots win on the same (id, version).
      for (const profile of SEED_PROFILES) {
        if (!family || profile.family === family) {
          byKey.set(`${profile.id}:${profile.version}`, profile);
        }
      }
      const stored = await store.list(family);
      for (const snapshot of stored) {
        if (!family || snapshot.profile.family === family) {
          byKey.set(`${snapshot.profile.id}:${snapshot.profile.version}`, snapshot.profile);
        }
      }
      return [...byKey.values()].sort(
        (a, b) => a.id.localeCompare(b.id) || a.version - b.version,
      );
    },

    async resolve(
      id: AdaptiveExamProfileId,
      version?: number,
    ): Promise<ExamProfile | null> {
      const reason = unavailableReason(id);
      if (reason) {
        logger.info("adaptive.profile.unavailable", { profileId: id, reason });
        return null;
      }

      if (version !== undefined) {
        if (!Number.isInteger(version) || version < 1) {
          fail("ADAPTIVE_PROFILE_INVALID", "Profile version must be a positive integer.", { profileId: id, version });
        }
        const stored = await store.find(id, version);
        if (stored) return stored.profile;
        return getSeedProfile(id)?.version === version ? getSeedProfile(id) : null;
      }

      const latestStored = await store.latest(id);
      const seed = getSeedProfile(id);
      if (!latestStored) return seed;
      if (!seed || latestStored.profile.version >= seed.version) return latestStored.profile;
      return seed;
    },

    async addRevision(profile: ExamProfile, next: ExamProfile): Promise<ExamProfile> {
      requireValid(profile, "Existing profile");
      const nextRecord = asRecord(next);
      if (!nextRecord || next.id !== profile.id) {
        fail("ADAPTIVE_PROFILE_INVALID", "A revision must keep the same profile id.", {
          from: profile.id,
          to: nextRecord?.id,
        });
      }
      if (next.version !== profile.version + 1) {
        fail("ADAPTIVE_PROFILE_INVALID", "A revision must be exactly one version ahead.", {
          profileId: next.id,
          expected: profile.version + 1,
          actual: next.version,
        });
      }

      // Normalise the revision head BEFORE validation: a caller may omit the
      // actor entry, in which case an explicit system marker is recorded.
      const history = Array.isArray(next.revisionHistory) ? next.revisionHistory : [];
      const hasHead = history.some((entry) => entry.version === next.version);
      const candidate: ExamProfile = hasHead
        ? next
        : {
            ...next,
            revisionHistory: [
              ...history,
              {
                version: next.version,
                changedAt: clock.now(),
                changedBy: "registry",
                summary: "Revision committed without an explicit actor entry.",
              },
            ],
          };
      requireValid(candidate, "Next profile");

      const existing = await store.find(next.id, next.version);
      if (existing) {
        fail("ADAPTIVE_PROFILE_INVALID", "That profile version already exists.", {
          profileId: next.id,
          version: next.version,
        });
      }
      const latest = await store.latest(next.id);
      if (latest && latest.profile.version >= next.version) {
        fail("ADAPTIVE_PROFILE_INVALID", "A newer profile version is already committed.", {
          profileId: next.id,
          committedVersion: latest.profile.version,
          attemptedVersion: next.version,
        });
      }

      const createdAt = clock.now();
      const contentHash = hashProfile(candidate);
      await store.insert({ profile: candidate, contentHash, createdAt });
      logger.info("adaptive.profile.revision", {
        profileId: candidate.id,
        version: candidate.version,
        contentHash,
      });
      return candidate;
    },

    async ensureSeeded() {
      const inserted: string[] = [];
      const unchanged: string[] = [];
      const hashes: Record<string, string> = {};

      for (const profile of SEED_PROFILES) {
        requireValid(profile, "Seed profile");
        // Seed timestamps are fixed so the hash is stable across deploys.
        if (
          profile.revisionHistory[0]?.changedAt !== SEED_AUTHORED_AT ||
          profile.revisionHistory[0]?.changedBy !== SEED_CHANGED_BY
        ) {
          fail("ADAPTIVE_PROFILE_INVALID", "Seed revision metadata drifted.", {
            profileId: profile.id,
          });
        }
        const contentHash = hashProfile(profile);
        hashes[`${profile.id}:${profile.version}`] = contentHash;
        const existing = await store.find(profile.id, profile.version);
        if (existing) {
          if (existing.contentHash !== contentHash) {
            fail("ADAPTIVE_PROFILE_INVALID", "Committed snapshot hash disagrees with the code seed.", {
              profileId: profile.id,
              version: profile.version,
            });
          }
          unchanged.push(`${profile.id}:${profile.version}`);
          continue;
        }
        await store.insert({ profile, contentHash, createdAt: SEED_AUTHORED_AT });
        inserted.push(`${profile.id}:${profile.version}`);
      }

      logger.info("adaptive.profile.seeded", { inserted, unchanged });
      return { inserted, unchanged, hashes };
    },
  };
}

// ─────────────────────────────────────────────────────────────
// In-memory store (tests / development only — not a production backing store)
// ─────────────────────────────────────────────────────────────

export function createInMemoryProfileSnapshotStore(): ProfileSnapshotStore {
  const rows = new Map<string, StoredProfileSnapshot>();
  const key = (id: AdaptiveExamProfileId, version: number): string => `${id}:${version}`;

  return {
    async find(id, version) {
      return rows.get(key(id, version)) ?? null;
    },
    async latest(id) {
      let best: StoredProfileSnapshot | null = null;
      for (const [k, row] of rows) {
        if (!k.startsWith(`${id}:`)) continue;
        if (!best || row.profile.version > best.profile.version) best = row;
      }
      return best;
    },
    async list(family) {
      return [...rows.values()]
        .filter((row) => !family || row.profile.family === family)
        .sort((a, b) => a.profile.id.localeCompare(b.profile.id) || a.profile.version - b.profile.version);
    },
    async insert(snapshot) {
      const k = key(snapshot.profile.id, snapshot.profile.version);
      if (rows.has(k)) {
        throw new Error(`Duplicate profile snapshot ${k}`);
      }
      rows.set(k, snapshot);
      return snapshot;
    },
  };
}
