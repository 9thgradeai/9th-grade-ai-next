# 20× Product Vision — 9Th-Grade AI

Target: **an AI-powered personal exam operating system that continuously understands the
learner, diagnoses weaknesses, decides what matters next, creates the right practice, evaluates
performance, manages revision, and adapts the path over time** — calm, focused, trustworthy.

## Layer 1 — Experience (what the learner sees)

One Home that answers in seconds: where am I, how am I doing, what next, why, what improves.
Deeper: Practice hub (one setup, regime-labelled sessions), Past-papers library, Mistakes (review →
drill), Readiness (drivers, not just %), Revision due strip, AI brief (one card, one action).
Fewer tabs, each owning a job. No decorative widgets; every card ends in an executable action.

```text
┌──────────────────────────────────────────────┐
│ সন্ধ্যা, ফারহান · 51st BCS                   │
│ প্রস্তুতি 67% ▲4 · পরীক্ষা 42 দিন বাকি        │
│ ┌──────────────────────────────────────────┐ │
│ │ AI Study Brief                           │ │
│ │ আজকের সুযোগ: বাংলাদেশ বিষয়াবলি → মুক্তিযুদ্ধ│
│ │ কারণ: নির্ভুলতা 18% কমেছে (12টি উত্তর)     │ │
│ │ [20 মিনিটের সেশন শুরু]                     │ │
│ └──────────────────────────────────────────┘ │
│ Due today: 14 cards · 5 min [রিভিশন]         │
│ Weakness map · Recent trend · Mission log    │
└──────────────────────────────────────────────┘
```

## Layer 2 — Intelligence (how the system reasons)

Deterministic diagnosis first (aggregates, mastery, decay, coverage), LLM narration second.
Decision engine ranks candidate actions by expected value:
`value = topic_weight × gap × forgetting_risk × exam_proximity × acceptance_history`.
Every recommendation logs shown/accepted/completed → weights adapt (O10). Numbers never generated.

## Layer 3 — Learning Engine

Mastery per (user, question) exists — extend to per-topic decay curves; SRS for cards + vocab
exists — extend to mistake revisits; add difficulty calibration (performance by level), interleaving
in drill builder, and readiness drivers (coverage × accuracy × consistency × recency).

## Layer 4 — AI (contextual, executable)

Tutor/solver stay reactive but gain episodic context (your history with this topic). New surfaces
are all verbs, not chats: explain-my-error, 2-minute lesson, mistake-drill, tonight's revision,
attempt comparison, weakness-built mock. Agent blocks become one-click actions with cancel.
Eval loop: `AIFeedback` aggregated into prompt/version decisions.

## Layer 5 — Data

Existing: attempts, mastery, SRS states, memories, usage ledger, learning events. Missing (add):
rec funnel events, drill outcomes, revision effectiveness, confidence signals, syllabus-coverage
denominator, study-time availability. Principle: collect only what changes a decision.

## Layer 6 — Infrastructure

Keep the thin-route/service/repository seam and idempotent exam core. Add: decision-engine service
beside `preparation-intelligence` (not inside it), event bus consumers for acceptance learning,
batch mastery writes (fix P-F2), FTS when content 10×es, React Query only when cache pain is proven.
Multi-ecosystem stays a scope column, never a fork.
