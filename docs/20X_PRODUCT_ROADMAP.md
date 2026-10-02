# 20× Product Roadmap — 9Th-Grade AI

## Phase 0 — Critical fixes

- [x] `DELETE notifications/[id]` → `deleteUserNotification(userId, id)` (P-S1).
- [x] `POST ai/vocab` quota guard (P-S2).
- [x] Unify dual exam-submit validators on strict (P-B1).
- [x] Delete legacy `submitCustomExam` after unrouted proof (P-B2).
- [x] Leaderboard streak cache read (P-F1).
- [ ] Dhaka-tz `studiedToday` (P-C2) — needs timezone-coherent SQL rework, not a one-line patch.
- [x] Remove dead route block (P-C3).

## Phase 1 — UX foundation

- [x] Unbroken rec intents (O2, P-U1) — quiz/resume intents carried.
- [x] Post-result mistake loop (O3, P-U2).
- [x] New-user diagnostic mission (O1, P-U5).
- [x] Difficulty picker in quick practice (O5, P-U3).
- [x] Revision-due strip on Home (O4).
- [x] Dialog-trap adoption (Practice/Custom confirms, NotificationCenter) + 44px targets
  (steppers, modal closes, segmented controls).
- Tokenize marketing/command surfaces (P-D3); timer regime labels (P-U4).
- Tab consolidation design (IA1): Practice hub + Past papers + Exams.

## Phase 2 — Intelligence foundation

- [x] Rec funnel events (REC_ACCEPTED via POST /api/learning-events; emitted on rec + mission
  acceptance) (P-N1) — prerequisite for all learning. REC_COMPLETED still open (needs
  session-intent correlation).
- Readiness drivers v1 (deterministic; O8 without LLM).
- Revision-due strip (O4); ContinueLearning resume coverage (B4).
- Difficulty picker + accuracy-by-level (O5, P-U3).
- Weakness heatmap from existing mastery (O9).

## Phase 3 — AI transformation

- AI Study Brief, numbers-deterministic (O6).
- "Why wrong" with episodic context (AI3 fix).
- Executable agent blocks + cancel (P-A2).
- Mistake-to-drill generation (O7); weakness-built mocks (AI5 fix).
- Feedback aggregation → prompt decisions (AI6 fix).

## Phase 4 — Adaptive learning

- Acceptance-weighted re-ranker (O10) — bandit over rec ids.
- Forgetting curves per topic; interleaved drills; confidence calibration.
- Dynamic study plan from readiness gaps.

## Phase 5 — Advanced intelligence

- Predictive readiness trajectories; pattern detection (time-of-day, fatigue);
  adaptive exam simulation; long-term learner modeling. Only with Phase-2 data density.
