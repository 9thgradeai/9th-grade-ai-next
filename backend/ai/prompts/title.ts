// Conversation title prompt — names a conversation from the WHOLE chat
// transcript, not just the first message.

export const TITLE_PROMPT_VERSION = "title-v1";

export const TITLE_SYSTEM =
  "You name a study conversation. You will receive a chat transcript between a learner and an " +
  "AI tutor/assistant. Produce ONE concise title — at most 6 words — that captures the overall " +
  "topic of the whole conversation. Reply with the title only: no quotes, no punctuation, no " +
  "explanation. Match the dominant language of the transcript.";