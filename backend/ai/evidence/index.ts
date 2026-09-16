// Evidence package public API.

export {
  citeQuestionBank,
  citeSyllabus,
  citeWebSearch,
  citeNewsFeed,
  citeLLMKnowledge,
  buildEvidenceBlock,
  toCitationBlock,
  enforceCitationRequirements,
} from "./citations";
export type {
  Citation,
  CitationSource,
  CitationBlock,
  EvidenceBlock,
} from "./citations";
