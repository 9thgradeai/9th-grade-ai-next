# Product Opportunity Register — 9Th-Grade AI

Format: Opportunity / User Problem / Current Limitation / Proposed Experience / Required Data /
Required Backend / Required Frontend / AI Requirement / Learning Impact / User Value / Complexity / Risk / Priority.

---

**O1 — One-click diagnostic mission (new-user activation).**
Problem: new users see honest zeros with no propulsion. Limitation: onboarding data unused; mission
CTA disabled. Experience: "Start 10-question diagnostic" → quick intent → first mission built from
results. Data: `examTarget/prepLevel` (exists). Backend: new-user rule in `buildRecommendations`.
Frontend: mission CTA deep-link. AI: none (deterministic). Impact: High. Value: High. Complexity:
Small. Risk: Low. Priority: **P0.**

**O2 — Unbroken recommendation intents.**
Problem: tapping a rec lands on generic config (P-U1). Experience: every rec opens exactly the
promised surface. Data: exists. Backend: none. Frontend: carry `{mode, subject}` intent. AI: none.
Impact: High. Value: High. Complexity: Small. Risk: Low. Priority: **P0.**

**O3 — Post-result mistake loop.**
Problem: results dead-end (P-U2). Experience: `[Review N mistakes]` → mistakes tab pre-filtered;
`[Retry weak topics]` → quick intent. Data: exists (answers + weak topics). Backend: none.
Frontend: result CTAs. AI: optional "why wrong" (exists via explain). Impact: High. Value: High.
Complexity: Small. Risk: Low. Priority: **P0.**

**O4 — "Revise tonight" strip.**
Problem: revision-due invisible on Home (B3). Experience: "Due today: N cards · 5 min" strip →
flashcards. Data: `FlashcardUserState.nextReview` (exists). Backend: expose count in pulse scope.
Frontend: strip component. AI: none. Impact: Medium. Value: High. Complexity: Small. Risk: Low.
Priority: **P1.**

**O5 — Difficulty-matched practice.**
Problem: no level control (P-U3). Experience: সহজ/মাধ্যম/কঠিন chips in setup; recs suggest level
from accuracy. Data: accuracy by difficulty (exists via attempts). Backend: pass-through (exists).
Frontend: picker. AI: none. Impact: High. Value: High. Complexity: Small. Risk: Low. Priority: **P1.**

**O6 — AI Study Brief (proactive).**
Problem: AI only answers when asked (AI1). Experience: morning brief — biggest opportunity + why +
one-tap session. Data: aggregates + memory (exist). Backend: brief builder (deterministic numbers,
LLM narration only). Frontend: hero card. AI: fast-tier narration with acceptance logging. Impact:
High. Value: High. Complexity: Medium. Risk: Medium (hallucinated numbers — mitigate: numbers
rendered from API payload, never from tokens). Priority: **P1.**

**O7 — Mistake-to-drill generation.**
Problem: mistake review is static repetition. Experience: "Turn 12 mistakes into a 15-min drill"
(mixed + 2 new similar per weak topic). Data: mistake set (exists). Backend: drill builder endpoint.
Frontend: CTA + session reuse. AI: generator (mock-test prompt family). Impact: High. Value: High.
Complexity: Medium. Risk: Medium. Priority: **P2.**

**O8 — Exam readiness model.**
Problem: no "am I ready" answer. Experience: readiness % with drivers (coverage × accuracy ×
consistency × recency) + what moves it most. Data: mostly exists; needs syllabus-coverage denominator
+ exam-date proximity. Backend: readiness service. Frontend: indicator + driver list. AI: narration
only. Impact: High. Value: High. Complexity: Medium. Risk: Medium. Priority: **P2.**

**O9 — Weakness map + forgetting-risk surfacing.**
Problem: weaknesses are lists, not a landscape. Experience: subject×topic mastery heatmap with
decay flags. Data: `UserQuestionProgress` + attempt recency (exist). Backend: decay scoring.
Frontend: heatmap (reuse `SubjectMasteryMatrix`). AI: none. Impact: Medium. Value: High. Complexity:
Medium. Risk: Low. Priority: **P2.**

**O10 — Acceptance-learning recommendations (decision engine seed).**
Problem: recs can't improve (AI2). Experience: same product, but recs re-rank by acceptance ×
outcome within weeks. Data: NEW — rec-shown/accepted/completed events. Backend: weight table +
re-ranker. Frontend: event emission. AI: later (bandit → model). Impact: High (compounding). Value:
High. Complexity: Medium. Risk: Low. Priority: **P2 (events in P1).**
