# Vocab Tab — Audit & Roadmap to an Interactive Dynamic Learning System

> Scope: `frontend/components/dashboard/VocabTab.tsx`, `backend/services/vocab*.ts`,
> `app/api/vocab/*`, `backend/ai/prompts/vocab.ts`, the `VocabWord`/`VocabProgress`
> models, and the existing tests (`tests/VocabAutoRotate.test.tsx`,
> `tests/services/vocab.test.ts`, `tests/api/vocab.test.ts`).
>
> Product vision anchor: a free, open-source exam-prep platform for Bangladeshi
> government-job aspirants (BCS, Bank, Teacher Recruitment, 9th-grade pay scale)
> — bilingual AI tutor, spaced-repetition flashcards, adaptive study planner.
> Vocabulary is the single highest-leverage English skill across all of these.

---

## 1. What the Vocab tab does today (honest inventory)

- **Card-based flashcard review** of one word at a time (word → reveal meaning,
  synonyms/antonyms, example, mnemonic), with swipe + keyboard (1–4) rating.
- **SM-2 spaced repetition** (`reviewVocabWord`) with `again/hard/good/easy`
  driving interval/repetitions/nextReview and a `status` (NEW → LEARNING →
  REVIEW → MASTERED).
- **Server-driven stream** (`vocabStream`, mode mixed/due/daily/all) blending
  due words, word-of-the-day (10-min slot), and fresh words.
- **Stats + daily goal + streak** (`vocabStats`, `vocabDaily`).
- **Quiz mode** (`QuizMode`) and **Idioms tab**.
- **Word-of-the-day card**, **AI mnemonic** button, **text-to-speech** (`speak`).
- **Filters** (all/new/learning/due/mastered) and search.
- **Hands-free auto-rotation** every 10 min with pause + live region.

## 2. Pitfalls & drawbacks (ranked by impact)

### P0 — correctness / data-integrity
1. **Rating is fire-and-forget with no rollback.** `review()` calls
   `api.reviewVocab` then optimistically advances `idx` and re-fetches words.
   If the POST fails, the UI has already moved on and the local `sessionCorrect`
   counter is wrong; the user never sees the failure beyond a toast.
2. **Session counters never reset on filter/search change.** `sessionReviewed`
   and `sessionCorrect` accumulate across filter reloads, so the "Session: x/y
   correct" chip is meaningless after the first filter switch.
3. **`filtered` vs `words` index drift.** `idx` is an index into `filtered`,
   but `review()` advances `idx` against `filtered.length` while `setWords(ws)`
   replaces the underlying list; a re-fetch can shrink/grow the list and leave
   `idx` pointing at the wrong word or out of range (mitigated only by
   `filtered[idx] ?? filtered[0]`).
4. **Auto-rotation clock is global to the tab, not per-session.** `pokeRotationClock`
   restarts on every `current?.id` change, including manual nav, so the 10-min
   timer is constantly reset and effectively never fires during active study.
   Conversely, when the user is idle it auto-advances and **loses the revealed
   answer** (`setRevealed(false)`), destroying in-progress recall.
5. **`dailyGoal` is hardcoded to 20** and never persisted or derived from the
   user's actual due count / exam date.
6. **No offline / no optimistic queue.** Every rating is a network round-trip;
   on flaky mobile (common in BD) a dropped request silently loses a review.

### P1 — learning efficacy
7. **No retrieval schedule visibility.** The user never sees *when* a word comes
   back; SM-2 internals (`interval`, `nextReview`) are shown nowhere in the UI.
   Without "due in 3 days" feedback there is no sense of progress.
8. **Single modality.** Only recognition (flashcard). No production (type the
   word), no listening (audio-first), no collocation/usage-in-context, no
   synonym-matching, no sentence-completion. Competitive exams (BCS Bank English
   vocabulary, synonyms/antonyms, fill-in-the-blank) require all four.
9. **No exam-targeted curation.** `examRelevance` exists in the schema but the
   stream is `mixed` regardless of the user's selected ecosystem/exam. A BCS
   aspirant and a Bank aspirant see the same stream.
10. **No difficulty adaptation.** `difficulty` is a static seed field; nothing
    adjusts based on the user's error rate. Hard words are not over-sampled.
11. **Mnemonics are static seed strings** of uneven quality (some are nonsense,
    e.g. "a femur is ephemeral"). The AI mnemonic button exists but is
    one-shot and not cached/persisted per word.
12. **No collocations / word families / register.** Only synonyms/antonyms;
    missing phrasal verbs, collocations, and formality — exactly what BCS
    written English and viva test.
13. **No "leech" handling.** Words failed 8+ times are not flagged or retired
    to a special deck; they keep circulating and demoralising the user.
14. **No interleaving / contextual learning.** Words appear in isolation; no
    reading passage that embeds 5–8 target words (the format BCS RC uses).

### P2 — engagement / UX
15. **No mastery celebration / milestones.** Mastering a word gives no feedback
    beyond a colour change; no streak-of-mastered, no weekly review recap.
16. **No "cram mode" / exam-week sprint.** No way to compress all due + high-
    frequency words into a 30-min session before an exam.
17. **Search is client-side over the loaded 50.** Searching a word not in the
    current page returns nothing even though it exists in the DB.
18. **No keyboard hint discoverability.** Shortcuts (1–4, arrows, space) are
    undocumented in the UI.
19. **Accessibility gaps.** `speak()` uses a single voice with no rate/pitch
    controls, no word-level highlight, and `aria-live` only announces auto-
    advances, not ratings.
20. **No dark-mode-aware illustration / phonetics.** `pronunciation` (IPA) is
    not in the DTO at all — only `partOfSpeech`.
21. **Mobile swipe conflicts with scroll.** `useSwipeGesture` on the whole card
    can hijack vertical scroll on small screens.

### P3 — architecture / scalability
22. **Stream is O(n) per request.** `getVocabWords`/`vocabStream` recompute
    due lists and shuffle on every call; no cursor persistence or ETag.
23. **Progress is per-user-per-word but there is no concept of "deck" ownership
    beyond global public decks.** Users cannot create personal decks from a
    reading passage or a wrong-answer notebook.
24. **No analytics loop.** `vocab-analytics` exists but is not surfaced: no
    "your weakest 10 words", no "words you confuse (X vs Y)", no forgetting-
    curve visualisation.
25. **AI mnemonic is not persisted and not exam-aware.** It doesn't reference
    the user's weak spots or the BCS/Bank style.
26. **No content pipeline.** Vocab seed is a hand-maintained TS array; there is
    no importer from the existing BCS/Bank English MCQ corpus (which already
    contains thousands of target words in context).

## 3. Target: interactive dynamic vocab learning system

Goal: move from "flashcard browser" to a **closed-loop learning system** where
every interaction (review, quiz, reading, wrong answer) feeds the scheduler and
the content layer, and the UI makes the schedule visible and motivating.

### 3.1 Closed loop (data flow)
```
Source content (BCS/Bank English MCQs, RC passages, idioms)
   → vocab extraction pipeline (frequency + exam relevance + collocations)
   → VocabWord (with IPA, collocations, word family, register, example in context)
   → user progress (SM-2 + leech + mastery)
   → scheduler (due queue, interleaving, difficulty weighting)
   → session generator (mixed modality: recall, production, listening, context)
   → review events → analytics → adaptive difficulty + next-day plan
```

### 3.2 Feature pillars
**A. Rich word model** — add to `VocabWord`: `ipa`, `audioUrl`, `collocations[]`,
`wordFamily[]`, `register` (formal/neutral/informal), `confusables[]`,
`examTags[]` (BCS-Prelim, BCS-Written, Bank-PO, …), `sourceRefs[]` (question
ids where the word appeared). Backfill via a pipeline over the imported BCS
English corpus.

**B. Multi-modal sessions** — replace the single flashcard with a session
composer that mixes:
- Recall (current card)
- Production (type the word from meaning)
- Listening (audio-first reveal)
- Context (fill-in-the-blank from a real exam sentence)
- Synonym/antonym sprint (4-option, exam-style)
- Collocation (choose the right partner word)
Each session ends with a summary: accuracy, time, words to revisit tomorrow.

**C. Visible schedule & motivation**
- "Due today / tomorrow / this week" chips with counts.
- Per-word next-review date + interval; "mastered" requires 3 consecutive
  `good/easy` at interval ≥ 21 days (not just a counter).
- Streaks, milestones, weekly recap, "leech" rescue deck.
- Daily goal derived from due count + days-to-exam (adaptive).

**D. Exam-targeted & adaptive**
- Filter stream by `examTag` (BCS Prelim English, Bank PO, …).
- Weight words by `frequency` and by the user's wrong-answer notebook (words
  appearing in questions they got wrong get +priority).
- Difficulty re-estimation from rolling accuracy per word.

**E. Content pipeline (the multiplier)**
- `scripts/import-vocab-from-bcs-english.ts`: extract candidate words from the
  imported BCS English questions/passages, rank by frequency + exam relevance,
  dedupe against `VocabWord`, propose new entries for admin review.
- AI-assisted enrichment (mnemonic, collocations, IPA) cached per word and
  editable by admins; never auto-published without review.

**F. Analytics surfaced**
- "Weakest 10", "confusable pairs", "forgetting curve", "time-of-day
  performance", "exam-readiness score" (predicted vocab score on a BCS English
  paper).
- Feed the adaptive study planner (`AdvisorTab`) with a "vocab focus" task.

**G. Offline & resilience**
- IndexedDB queue for reviews; sync on reconnect; optimistic UI with rollback
  on failure; ETag/cursor for stream pagination.

## 4. Concrete next steps (ordered, each independently shippable)

1. **Fix P0 defects** (1–6): rollback on review failure, reset session counters
   on filter change, clamp `idx`, persist `dailyGoal`, add offline queue. Add
   tests in `tests/VocabAutoRotate.test.tsx` style.
2. **Surface the schedule**: show `nextReview`/`interval` on the card; add
   "Due today/tomorrow/week" chips; make mastery require 3 consecutive
   successes at ≥21d.
3. **Multi-modal session composer** (`VocabSessionRunner`) mixing the 6 modes
   above, ending in a summary screen.
4. **Exam targeting**: thread `ecosystem`/`examTag` through `vocabStream` and
   the UI filter; add a "BCS Prelim English" preset.
5. **Word model enrichment** (IPA, collocations, word family, confusables) +
   migration; backfill IPA via a one-time script.
6. **Content pipeline** from the imported BCS English corpus; admin review queue.
7. **Analytics dashboard** (weakest 10, confusable pairs, readiness score) and
   integration with the study planner.
8. **Accessibility & mobile**: document shortcuts in-UI, voice controls, fix
   swipe/scroll conflict, `aria-live` for ratings.

## 5. Success metrics
- % of due words reviewed daily (target ≥ 80%).
- Retention at 7/30 days (target ≥ 70% / 50%).
- Median time-to-master per word (target ≤ 4 reviews).
- Exam-readiness vocab score correlation with real BCS English mock scores.
- Leech rate < 5% of the corpus.

## 6. What I would NOT change
- SM-2 as the core scheduler (it works); only add leech handling and
  difficulty weighting on top.
- The existing `VocabWordDTO` shape for backward compat — extend, don't
  replace.
- The auto-rotation feature itself — fix the reset-on-nav bug and the
  revealed-answer loss, keep the hands-free tour.

---

*This audit is a planning document. No code was changed for this analysis.*
