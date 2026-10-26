// Server-side entry point for the independent MCQ verification engine.
//
// Import from `app/api/*` or server-only services only. The client imports the
// response TYPES via `@/lib/types/verified-explanation` (type-only), never this
// module, so no answer-key or provider code reaches the browser bundle.

export { generateIndependentExplanation, type ExplainDeps } from "./orchestrator";
export { isExplainV2Enabled } from "./flags";
export {
  buildCanonicalSnapshot,
  loadCanonicalSnapshot,
  loadCanonicalAnswerKey,
  verifyDisplayOptions,
  type CanonicalSnapshot,
} from "./canonical-snapshot";
export {
  EXPLAIN_POLICY_VERSION,
  EXPLAIN_SCHEMA_VERSION,
  MCQExplanationSchema,
  VerificationFindingSchema,
  type MCQExplanation,
  type VerificationFinding,
} from "./schema/types";
export { ExplainV2RequestSchema, type ExplainV2Request } from "./schema/input";
