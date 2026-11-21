/** Escape a literal string for safe use inside a RegExp. */
export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Blank the headword (or a common inflected form) in an example sentence.
 * Returns null when there is no honest blank to fill, so callers can fall
 * back to another prompt instead of showing a blankless "fill-in" question.
 */
export function blankWordInSentence(sentence: string, word: string): string | null {
  if (!sentence.trim() || !word.trim()) return null;
  const re = new RegExp(`\\b${escapeRegExp(word.trim())}(?:s|es|d|ed|ing)?\\b`, "i");
  const out = sentence.replace(re, "______");
  return out === sentence ? null : out;
}
