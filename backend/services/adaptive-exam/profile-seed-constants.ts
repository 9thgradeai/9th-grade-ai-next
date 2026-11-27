// Shared, dependency-free constants for code-registry profile seeds.
// Kept in a leaf module so profile-seeds.ts and provisional-profiles.ts can
// import them without a circular initialisation.

export const SEED_AUTHORED_AT = "2026-11-22T00:00:00.000Z";
export const SEED_CHANGED_BY = "profile-seeds";

/** Explicit sentinel: no verified difficulty distribution exists in the repo. */
export const UNSOURCED_DIFFICULTY_DISTRIBUTION = Object.freeze({
  EASY: 0,
  MEDIUM: 0,
  HARD: 0,
});

/** Verified answers only — source claims and unverified answers are excluded. */
export const STRICT_PYQ_POLICY = Object.freeze({
  allowSourceClaimedAnswers: false,
  allowUnverifiedAnswers: false,
  minVerifiedShare: 1,
});
