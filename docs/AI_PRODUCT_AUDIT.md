# AI Product Audit — 9Th-Grade AI

## Current state (what exists — and it is substantial)

14 endpoints under `app/api/ai/*` (tutor/solver/explain/assistant/agent/advisor/evaluate/mock-test/
vocab/conversations/feedback/usage/opening/student-model). Versioned system prompts
(`tutor-v2`, `solver-v1`…), provider router (Groq/Anthropic/mock with tiering, vision routing,
circuit breakers, 3-attempt retry, 30s stream timeouts), hybrid BM25+embedding retrieval over the
question bank, `AIMemory` (8 types, app-written, expiring), structured-output validation, token
budgets, 24h response cache, per-user quotas (10/min, 60/day, $0.50/day ledger), zero-LLM `opening`
endpoint, mock fallback labelled `source:"mock"`. Failure modes are handled, not hidden.

Verdict on the core question: **the AI is a competent, well-engineered set of reactive assistants —
not yet a learning intelligence.** Every surface waits to be asked. None of them decide anything.

## Where AI is shallow / disconnected

- **AI1 (High):** no proactive layer. `opening` is deterministic greeting+stats; nothing detects
  mistake patterns, forgetting risk, or readiness drift unprompted.
- **AI2 (High):** recommendations are rule-based (`buildRecommendations`, 9 rules) with no LLM
  involvement and no memory of acceptance — the system cannot learn which advice works.
- **AI3 (High):** tutor/solver/explain receive question + slices but not the learner's *history with
  that topic* (attempts, misconception tags, prior explanations) — personalization is a 6-line
  `MEMORY_CONTEXT`, not episodic.
- **AI4 (Medium):** agent (max 8 steps, read-only tools, SSE) has no cancellation UI and its blocks
  (`practice_action`, `revision_action`) are not one-click executable — advice without action.
- **AI5 (Medium):** mock-test generation is ungrounded by weakness data (count + topic knobs only).
- **AI6 (Medium):** no eval loop on live traffic — `AIFeedback` is collected but nothing aggregates it
  into prompt/model decisions.
- **AI7 (Low):** vocab AI (mnemonics/examples) is the most "delightful" surface and the least
  protected (no quota — see S2).

## Contextual-AI opportunities (ranked)

1. "Why did I get this wrong?" — explain endpoint + attempt history + misconception memory. (Low cost.)
2. "Turn my mistakes into a 15-min drill" — mistake set → generated micro-session. (Medium.)
3. "Teach this topic in 2 minutes" — retrieval-grounded micro-lesson from weak-topic card. (Low.)
4. "What should I revise tonight?" — due-SRS + forgetting-risk ranking. (Low — data exists.)
5. "Compare my last 3 attempts" — period-comparison data already computed; needs narration. (Low.)
6. "Build my mock from my weaknesses" — wire mastery distribution into mock-test gen. (Medium.)

## AI Orchestration Layer (target — build incrementally, not speculatively)

```text
User Intent (explicit click or detected moment: result viewed, mistake repeated, revision due)
  → Intent Detection (deterministic router over existing rec ids + event triggers)
  → Context Builder (existing buildContext + slices + NEW: topic-episodic history)
  → Learner Profile (AIMemory + student-model + mastery distribution)
  → Tool Selection (read-only: weak-topics, due-cards, mistake-set, past attempts)
  → Model Routing (existing tier router; fast model for narration, primary for planning)
  → Structured Response (existing validators; new block types must be executable)
  → Action (one-click: start drill / open flashcards / schedule revision)
  → Learning Memory (record acceptance + outcome → feeds rec weights)
```

Rule: every AI output that recommends must carry an executable action and log acceptance.
No non-actionable AI text on Home. No generative metrics — numbers stay deterministic.

## Maturity scorecard (intelligence strand)

- AI Integration: strong (routing, resilience, cost controls, eval seed).
- AI Intelligence: reactive — orchestration + episodic context missing.
- Personalization: Level 1–2 (rules + aggregates + memory lines); Level 3+ requires the decision
  engine (roadmap Phase 2–3).
- Learning Science: SRS + mastery scoring exist; forgetting curves, interleaving, confidence
  calibration do not.
