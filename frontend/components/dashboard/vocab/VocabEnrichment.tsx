"use client";

import { SpeakerSimpleHigh } from "@phosphor-icons/react";
import { useLanguage, t } from "@/lib/lang-ctx";

/** Play the recorded pronunciation when available, otherwise use browser TTS. */
export function speakVocab(word: string, audioUrl?: string | null) {
  if (typeof window === "undefined" || !word) return;
  if (audioUrl) {
    try {
      const audio = new Audio(audioUrl);
      // play() returns a Promise in modern browsers; Promise.resolve also
      // tolerates the undefined returned by older implementations.
      void Promise.resolve(audio.play()).catch(() => speakWord(word));
      return;
    } catch {
      /* fall through to TTS */
    }
  }
  speakWord(word);
}

function speakWord(word: string) {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  const u = new SpeechSynthesisUtterance(word);
  u.lang = "en-US";
  u.rate = 0.85;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(u);
}

type EnrichmentProps = {
  word: string;
  ipa?: string | null;
  audioUrl?: string | null;
  register?: string | null;
  collocations?: string[] | null;
  wordFamily?: string[] | null;
  confusables?: string[] | null;
};

/** Renders the enriched VocabWord fields that were previously fetched but
 * never displayed (IPA, register, collocations, word family, confusables). */
export default function VocabEnrichment({
  word,
  ipa,
  audioUrl,
  register,
  collocations,
  wordFamily,
  confusables,
}: EnrichmentProps) {
  const { lang } = useLanguage();
  const groups = [
    { label: t(lang, "কলোকেশন", "Collocations"), items: collocations, tone: "text-sky-600 bg-sky-500/10 border-sky-500/20" },
    { label: t(lang, "শব্দপরিবার", "Word family"), items: wordFamily, tone: "text-violet-600 bg-violet-500/10 border-violet-500/20" },
    { label: t(lang, "বিভ্রান্তিকর", "Confusables"), items: confusables, tone: "text-amber-600 bg-amber-500/10 border-amber-500/20" },
  ].filter((g) => Array.isArray(g.items) && g.items.length > 0);

  const hasInline = Boolean(ipa || register || audioUrl);
  if (!hasInline && groups.length === 0) return null;

  return (
    <div className="rounded-xl border border-terminal-border bg-[var(--surface-raised)] p-3 space-y-2">
      {hasInline && (
        <div className="flex items-center gap-2 flex-wrap">
          {ipa && (
            <span className="text-xs font-mono text-[var(--dashboard-text-secondary)]" title={t(lang, "উচ্চারণ", "IPA pronunciation")}>
              /{ipa}/
            </span>
          )}
          {register && (
            <span className="text-[11px] font-mono uppercase tracking-wider px-2 py-0.5 rounded-full border border-terminal-border text-[var(--dashboard-text-muted)]">
              {register}
            </span>
          )}
          {audioUrl && (
            <button
              type="button"
              onClick={() => speakVocab(word, audioUrl)}
              className="min-w-11 min-h-11 flex items-center justify-center p-1 rounded-lg text-[var(--dashboard-text-muted)] hover:text-[var(--accent)]"
              aria-label={`Play pronunciation of ${word}`}
            >
              <SpeakerSimpleHigh className="w-4 h-4" />
            </button>
          )}
        </div>
      )}
      {groups.map((g) => (
        <div key={g.label}>
          <p className="text-[11px] font-mono uppercase tracking-wider text-[var(--dashboard-text-muted)] mb-1">{g.label}</p>
          <div className="flex flex-wrap gap-1">
            {g.items!.map((item) => (
              <span key={item} className={`text-[11px] font-mono px-2 py-0.5 rounded-full border ${g.tone}`}>{item}</span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
