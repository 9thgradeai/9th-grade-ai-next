import { describe, expect, it } from "vitest";

import type {
  AdaptiveExamProfileId,
  ExamProfile,
} from "~backend/services/adaptive-exam/contracts";
import {
  BB_SENIOR_OFFICER_GENERAL_PROFILE,
  BCS_PRELIMINARY_PROFILE,
  SEED_PROFILES,
  STRICT_PYQ_POLICY,
  UNAVAILABLE_PROFILES,
  UNSOURCED_DIFFICULTY_DISTRIBUTION,
  unavailableReason,
} from "~backend/services/adaptive-exam/profile-seeds";
import {
  createInMemoryProfileSnapshotStore,
  createProfileRegistry,
  hashProfile,
  officialSimulationEnabled,
  validateProfile,
} from "~backend/services/adaptive-exam/profile-registry";
import { hashSnapshot } from "~backend/services/adaptive-exam/hash";

const FIXED_NOW = "2026-11-22T12:00:00.000Z";

function makeRegistry() {
  const store = createInMemoryProfileSnapshotStore();
  const clock = { now: () => FIXED_NOW };
  const registry = createProfileRegistry({ store, clock, requestId: "test-request" });
  return { store, clock, registry };
}

function clone(profile: ExamProfile): ExamProfile {
  return JSON.parse(JSON.stringify(profile)) as ExamProfile;
}

describe("adaptive profile seeds — honesty", () => {
  it("seeds only the two source-backed configs", () => {
    expect(SEED_PROFILES.map((profile) => profile.id)).toEqual([
      "BCS_PRELIMINARY",
      "BB_SENIOR_OFFICER_GENERAL",
    ]);
    expect(unavailableReason("BCS_PRELIMINARY")).toBeNull();
    expect(unavailableReason("BB_SENIOR_OFFICER_GENERAL")).toBeNull();
  });

  it("declares all four other profile ids as unavailable with a reason", () => {
    expect(UNAVAILABLE_PROFILES.map((entry) => entry.id)).toEqual([
      "BB_ASSISTANT_DIRECTOR_GENERAL",
      "BANK_OFFICER_GENERAL",
      "BANK_OFFICER_CASH",
      "BANK_OFFICER_IT",
    ]);
    for (const entry of UNAVAILABLE_PROFILES) {
      expect(entry.reason).toMatch(/No reviewed or approved/);
      expect(entry.reason).toMatch(/Not seeded/);
    }
  });

  it("preserves the official BCS subject marks and a 200-question total", () => {
    expect(BCS_PRELIMINARY_PROFILE.subjects.map((subject) => subject.count)).toEqual([
      30, 30, 25, 25, 10, 15, 15, 20, 15, 15,
    ]);
    expect(
      BCS_PRELIMINARY_PROFILE.subjects.reduce((sum, subject) => sum + subject.count, 0),
    ).toBe(200);
    expect(BCS_PRELIMINARY_PROFILE.totalQuestions).toBe(200);
    expect(BCS_PRELIMINARY_PROFILE.totalMarks).toBe(200);
    expect(BCS_PRELIMINARY_PROFILE.durationMin).toBe(120);
    expect(BCS_PRELIMINARY_PROFILE.ecosystemCode).toBe("BCS");
  });

  it("preserves the Bank 20/20/20/10/20/10 shape and a 100-question total", () => {
    expect(
      BB_SENIOR_OFFICER_GENERAL_PROFILE.subjects.map((subject) => subject.count),
    ).toEqual([20, 20, 20, 10, 20, 10]);
    expect(
      BB_SENIOR_OFFICER_GENERAL_PROFILE.subjects.reduce(
        (sum, subject) => sum + subject.count,
        0,
      ),
    ).toBe(100);
    expect(BB_SENIOR_OFFICER_GENERAL_PROFILE.totalQuestions).toBe(100);
    expect(BB_SENIOR_OFFICER_GENERAL_PROFILE.totalMarks).toBe(100);
    expect(BB_SENIOR_OFFICER_GENERAL_PROFILE.ecosystemCode).toBe("BANGLADESH_BANK");
    expect(BB_SENIOR_OFFICER_GENERAL_PROFILE.recruitmentPost).toBe(
      "Senior Officer (General)",
    );
  });

  it("mirrors the two source scoring policies exactly", () => {
    expect(BCS_PRELIMINARY_PROFILE.scoring).toEqual({
      marksPerQuestion: 1,
      penaltyPerWrong: 0.5,
      marksForUnanswered: 0,
    });
    expect(BB_SENIOR_OFFICER_GENERAL_PROFILE.scoring).toEqual({
      marksPerQuestion: 1,
      penaltyPerWrong: 0.25,
      marksForUnanswered: 0,
    });
  });

  it("enforces verified-answers-only PYQ policy", () => {
    expect(STRICT_PYQ_POLICY).toEqual({
      allowSourceClaimedAnswers: false,
      allowUnverifiedAnswers: false,
      minVerifiedShare: 1,
    });
    for (const profile of SEED_PROFILES) {
      expect(profile.pyqPolicy).toEqual(STRICT_PYQ_POLICY);
    }
  });

  it("records unsourced gaps as sentinels and warnings, never as official figures", () => {
    for (const profile of SEED_PROFILES) {
      expect(profile.difficultyDistribution).toEqual(UNSOURCED_DIFFICULTY_DISTRIBUTION);
      expect(profile.verificationStatus).toBe("reviewed");
      expect(profile.historicalDataEligible).toBe(false);
      expect(profile.allowedOverrides).toEqual([]);
      expect(profile.notes.join(" ")).toMatch(/all-zero sentinel/);
      expect(profile.notes.join(" ")).toMatch(/not approved/);
      const result = validateProfile(profile);
      expect(result.valid).toBe(true);
      expect(result.issues.map((issue) => issue.code)).toContain("DIFFICULTY_UNSOURCED");
    }
    // Bank has no sourced duration; BCS has one.
    expect(BB_SENIOR_OFFICER_GENERAL_PROFILE.durationMin).toBe(0);
    expect(
      validateProfile(BB_SENIOR_OFFICER_GENERAL_PROFILE).issues.map((issue) => issue.code),
    ).toContain("DURATION_UNSOURCED");
    expect(
      validateProfile(BCS_PRELIMINARY_PROFILE).issues.map((issue) => issue.code),
    ).not.toContain("DURATION_UNSOURCED");
  });

  it("does not embed answer material in any seed", () => {
    // Structural key check: a substring search would false-positive on
    // `allowUnverifiedAnswers`, which is policy metadata, not an answer.
    const keys = new Set<string>();
    const walk = (value: unknown): void => {
      if (Array.isArray(value)) {
        value.forEach(walk);
      } else if (value && typeof value === "object") {
        for (const [key, nested] of Object.entries(value)) {
          keys.add(key);
          walk(nested);
        }
      }
    };
    walk(SEED_PROFILES);
    for (const forbidden of [
      "correctOption",
      "correctAnswer",
      "claimedAnswer",
      "verifiedAnswer",
      "explanation",
      "options",
    ]) {
      expect(keys.has(forbidden)).toBe(false);
    }
  });

  it("keeps topic counts non-double-counting for grouping nodes", () => {
    // Bangla literature is a 15-mark grouping node with 5 + 10 official
    // children: only the children carry counts.
    const bangla = BCS_PRELIMINARY_PROFILE.subjects.find(
      (subject) => subject.subjectId === "bcs.bangla",
    );
    expect(bangla).toBeDefined();
    const literature = bangla!.topics.find((topic) => topic.topicId === "bcs.bangla.literature");
    expect(literature?.count).toBeUndefined();
    expect(
      bangla!.topics
        .filter((topic) => topic.topicId.startsWith("bcs.bangla.literature."))
        .map((topic) => topic.count),
    ).toEqual([5, 10]);

    // BCS PART-I has 15 official marks but inferred children: the parent keeps
    // the count so the quota is not lost.
    const english = BCS_PRELIMINARY_PROFILE.subjects.find(
      (subject) => subject.subjectId === "bcs.english",
    );
    expect(english!.topics.find((topic) => topic.topicId === "bcs.english.language")?.count).toBe(
      15,
    );
  });
});

describe("adaptive profile validation", () => {
  it("accepts an approved, fully sourced profile and enables official simulation", () => {
    const approved: ExamProfile = {
      ...clone(BCS_PRELIMINARY_PROFILE),
      verificationStatus: "approved",
      difficultyDistribution: { EASY: 30, MEDIUM: 50, HARD: 20 },
    };
    expect(validateProfile(approved).valid).toBe(true);
    expect(officialSimulationEnabled(approved)).toBe(true);
  });

  it("disables official simulation while any gate is unmet", () => {
    const sourced: ExamProfile = {
      ...clone(BCS_PRELIMINARY_PROFILE),
      verificationStatus: "approved",
      difficultyDistribution: { EASY: 30, MEDIUM: 50, HARD: 20 },
    };
    expect(officialSimulationEnabled({ ...sourced, verificationStatus: "reviewed" })).toBe(false);
    expect(officialSimulationEnabled({ ...sourced, durationMin: 0 })).toBe(false);
    expect(
      officialSimulationEnabled({
        ...sourced,
        difficultyDistribution: { EASY: 0, MEDIUM: 0, HARD: 0 },
      }),
    ).toBe(false);
    expect(
      officialSimulationEnabled({
        ...sourced,
        pyqPolicy: { ...STRICT_PYQ_POLICY, allowUnverifiedAnswers: true },
      }),
    ).toBe(false);
    expect(officialSimulationEnabled(BCS_PRELIMINARY_PROFILE)).toBe(false);
    expect(officialSimulationEnabled(BB_SENIOR_OFFICER_GENERAL_PROFILE)).toBe(false);
  });

  it("rejects total, scoring, version and difficulty corruption", () => {
    expect(
      validateProfile({
        ...clone(BCS_PRELIMINARY_PROFILE),
        subjects: BCS_PRELIMINARY_PROFILE.subjects.slice(0, 1),
      }).issues.map((issue) => issue.code),
    ).toContain("SUBJECT_COUNT_TOTAL_MISMATCH");

    expect(
      validateProfile({
        ...clone(BCS_PRELIMINARY_PROFILE),
        scoring: { marksPerQuestion: 1, penaltyPerWrong: -1, marksForUnanswered: 0 },
      }).issues,
    ).toEqual(expect.arrayContaining([expect.objectContaining({ code: "SCORING_INVALID" })]));

    expect(
      validateProfile({ ...clone(BCS_PRELIMINARY_PROFILE), version: 0 }).issues.map(
        (issue) => issue.code,
      ),
    ).toContain("VERSION_INVALID");

    expect(
      validateProfile({
        ...clone(BCS_PRELIMINARY_PROFILE),
        difficultyDistribution: { EASY: 30, MEDIUM: 50, HARD: 10 },
      }).issues.map((issue) => issue.code),
    ).toContain("DIFFICULTY_SUM_INVALID");
  });

  it("rejects unknown profiles, family drift and unknown overrides", () => {
    expect(validateProfile({ ...clone(BCS_PRELIMINARY_PROFILE), family: "BANK" }).issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "FAMILY_MISMATCH" })]),
    );
    expect(
      validateProfile({
        ...clone(BCS_PRELIMINARY_PROFILE),
        allowedOverrides: ["topics", "not-a-real-override" as never],
      }).issues.map((issue) => issue.code),
    ).toContain("OVERRIDE_NOT_ALLOWED");
  });
});

describe("adaptive profile registry", () => {
  it("resolves available profiles and refuses unavailable ones", async () => {
    const { registry } = makeRegistry();
    await expect(registry.resolve("BCS_PRELIMINARY")).resolves.toEqual(
      BCS_PRELIMINARY_PROFILE,
    );
    for (const id of UNAVAILABLE_PROFILES.map((entry) => entry.id)) {
      await expect(registry.resolve(id)).resolves.toBeNull();
      expect(registry.unavailabilityReason(id)).toMatch(/No reviewed or approved/);
    }
  });

  it("returns null for an absent version and rejects an invalid version argument", async () => {
    const { registry } = makeRegistry();
    await expect(registry.resolve("BCS_PRELIMINARY", 99)).resolves.toBeNull();
    await expect(registry.resolve("BCS_PRELIMINARY", 0)).rejects.toMatchObject({
      adaptiveCode: "ADAPTIVE_PROFILE_INVALID",
      stage: "configuration",
    });
  });

  it("lists profiles by family", async () => {
    const { registry } = makeRegistry();
    expect((await registry.list()).map((profile) => profile.id)).toEqual([
      "BB_SENIOR_OFFICER_GENERAL",
      "BCS_PRELIMINARY",
    ]);
    expect((await registry.list("BCS")).map((profile) => profile.id)).toEqual([
      "BCS_PRELIMINARY",
    ]);
    expect((await registry.list("BANK")).map((profile) => profile.id)).toEqual([
      "BB_SENIOR_OFFICER_GENERAL",
    ]);
  });

  it("seeds idempotently with stable hashes and drift detection", async () => {
    const { registry } = makeRegistry();
    const first = await registry.ensureSeeded();
    expect(first.inserted).toHaveLength(2);
    expect(first.unchanged).toHaveLength(0);

    const second = await registry.ensureSeeded();
    expect(second.inserted).toHaveLength(0);
    expect(second.unchanged).toHaveLength(2);
    expect(second.hashes).toEqual(first.hashes);
    expect(first.hashes["BCS_PRELIMINARY:1"]).toBe(hashProfile(BCS_PRELIMINARY_PROFILE));

    // A fresh registry/store produces exactly the same hashes.
    const fresh = makeRegistry();
    const third = await fresh.registry.ensureSeeded();
    expect(third.hashes).toEqual(first.hashes);
  });

  it("hashes canonical snapshots independent of key order", () => {
    expect(hashSnapshot({ a: 1, b: 2 })).toBe(hashSnapshot({ b: 2, a: 1 }));
    expect(hashProfile(clone(BCS_PRELIMINARY_PROFILE))).toBe(
      hashProfile(BCS_PRELIMINARY_PROFILE),
    );
    expect(hashProfile({ ...clone(BCS_PRELIMINARY_PROFILE), durationMin: 130 })).not.toBe(
      hashProfile(BCS_PRELIMINARY_PROFILE),
    );
  });

  it("commits a valid next version and resolves it as latest", async () => {
    const { registry } = makeRegistry();
    const next: ExamProfile = {
      ...clone(BCS_PRELIMINARY_PROFILE),
      version: 2,
      revisionHistory: [
        ...BCS_PRELIMINARY_PROFILE.revisionHistory,
        {
          version: 2,
          changedAt: FIXED_NOW,
          changedBy: "admin-1",
          summary: "Reviewed duration and difficulty supplied.",
        },
      ],
    };
    const committed = await registry.addRevision(BCS_PRELIMINARY_PROFILE, next);
    expect(committed.version).toBe(2);
    await expect(registry.resolve("BCS_PRELIMINARY")).resolves.toEqual(committed);
    await expect(registry.resolve("BCS_PRELIMINARY", 2)).resolves.toEqual(committed);
    await expect(registry.resolve("BCS_PRELIMINARY", 1)).resolves.toEqual(
      BCS_PRELIMINARY_PROFILE,
    );
  });

  it("records an explicit system marker when the caller omits the revision head", async () => {
    const { registry } = makeRegistry();
    const next = { ...clone(BCS_PRELIMINARY_PROFILE), version: 2 };
    const committed = await registry.addRevision(BCS_PRELIMINARY_PROFILE, next);
    expect(committed.revisionHistory[1]).toEqual({
      version: 2,
      changedAt: FIXED_NOW,
      changedBy: "registry",
      summary: "Revision committed without an explicit actor entry.",
    });
  });

  it("rejects skipped versions, id changes, duplicate commits and invalid revisions", async () => {
    const { registry } = makeRegistry();
    const invalidCode = { adaptiveCode: "ADAPTIVE_PROFILE_INVALID" };

    await expect(
      registry.addRevision(BCS_PRELIMINARY_PROFILE, {
        ...clone(BCS_PRELIMINARY_PROFILE),
        version: 3,
      }),
    ).rejects.toMatchObject(invalidCode);

    await expect(
      registry.addRevision(BCS_PRELIMINARY_PROFILE, {
        ...clone(BCS_PRELIMINARY_PROFILE),
        id: "BB_SENIOR_OFFICER_GENERAL" as AdaptiveExamProfileId,
        version: 2,
      }),
    ).rejects.toMatchObject(invalidCode);

    await expect(
      registry.addRevision(BCS_PRELIMINARY_PROFILE, {
        ...clone(BCS_PRELIMINARY_PROFILE),
        version: 2,
        totalQuestions: 199,
      }),
    ).rejects.toMatchObject(invalidCode);

    // Two sequential commits cannot both claim version 2.
    const next = { ...clone(BCS_PRELIMINARY_PROFILE), version: 2 };
    await registry.addRevision(BCS_PRELIMINARY_PROFILE, next);
    await expect(
      registry.addRevision(BCS_PRELIMINARY_PROFILE, next),
    ).rejects.toMatchObject(invalidCode);
  });

  it("surfaces seeded snapshots in list once committed", async () => {
    const { registry } = makeRegistry();
    await registry.ensureSeeded();
    expect(await registry.list()).toHaveLength(2);
    const stored = await registry.resolve("BANK_OFFICER_GENERAL");
    expect(stored).toBeNull();
  });
});
