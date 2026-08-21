# Target Architecture — 9Th-Grade AI Backend (Phase 1)

> This document is the contract that Phases 2–27 implement against. It defines module
> boundaries, the mandatory request flow, dependency rules, and the explicitly
> documented **temporary exceptions**. Nothing here rewrites working behavior — it
> relocates responsibility behind stable seams.

## 1. Logical Structure (target)

```
app/api/                      route handlers ONLY (auth → limit → validate → delegate)
backend/
    modules/                  one folder per bounded context (vertical slices)
        auth/                 session issuance/verification, password policy
        users/                profile, account lifecycle
        exams/                config tree, build, submit/scoring
        questions/            question search/read
        practice/             practice submission flows
        progress/             UserProgress + aggregates
        analytics/            event processing + read models
        notifications/
        bookmarks/
        study-plan/
        flashcards/           SRS state machine (per-user)
        ai/                   thin facade over backend/ai domain (below)
    services/                 application services (use-cases) — orchestrators only
    repositories/             THE ONLY code allowed to call Prisma (besides db.ts)
    validation/               single source of truth for all input schemas
    infrastructure/
        database/             client factory, tx helpers
        cache/                CacheStore interface (+in-memory dev impl)
        queue/                Queue/Worker interfaces (+in-proc driver)
        storage/              ObjectStorage interface
        observability/        structured logger, metrics
    ai/                       existing AI domain, regrouped:
        orchestration/        turn services (today's application/services.ts)
        providers/            unchanged (ModelRouter stays)
        retrieval/            search tool today; pgvector later (Phase 15)
        memory/               AIMemory store (unchanged)
        prompts/              unchanged
        evaluation/           feedback + future eval jobs
```

Rules of engagement:
- Existing `backend/services/*` become the first application services; they migrate into
  `modules/<ctx>/` incrementally — barrel imports (`~backend/services/x`) keep working
  during transition via re-export shims so no call-site breaks mid-phase.
- Route handlers may import: modules/services barrels, `~backend/errors`, `~backend/validation`,
  infra interfaces. They must NOT import `@prisma/client` or `~backend/db`.

## 2. Request Flow Contract

```
HTTP
 ↓ Route Handler          app/api/** (thin)
 ↓ Authentication         getUserIdFromRequest / getSessionUser
 ↓ Authorization          ownership scope + role check (when roles ship)
 ↓ Rate Limit             RateLimitStore interface (Phase 8)
 ↓ Validation             backend/validation (single authority, Phase 7)
 ↓ Application Service    use-case orchestration, transactions, events
 ↓ Repository             per-context data access
 ↓ Prisma
 ↓ PostgreSQL             authoritative state
```

**Hard rules**
1. Routes contain no business logic.
2. Routes never query Prisma directly.
3. Every multi-write mutation runs in a Prisma transaction.
4. Every list endpoint has bounded resource usage (DB-side pagination/cursor).
5. AI/provider calls never sit inside open DB transactions.
6. Events emitted by services may be handled synchronously initially; the emit site is
   the only thing that changes when the queue arrives (Phase 11/16).

## 3. Data Ownership Map (which module owns which tables)

| Module | Owns (writes) | Reads |
|---|---|---|
| auth/users | User, UserSession† | — |
| progress | UserProgress | QuestionAttempt (aggregates via analytics read models) |
| practice/exams | QuestionAttempt (via shared attempt repo), MockTestResult, ExamSession‡ | Question |
| questions | (seed-owned; runtime read-only) | Subject, Topic, Question, categories |
| notifications | NotificationRead | AppNotification |
| study-plan | StudyTask ownership columns | StudyPlanDay |
| flashcards | FlashcardUserState‡, FlashcardReview | Flashcard |
| ai | AIConversation, AIMessage, AIMemory, AIUsage, AIFeedback | Subject/Topic/Question (context), attempts (perf agg) |

† Phase 10 decision. ‡ introduced by Phase 2.

## 4. Temporary Exceptions (documented, to be eliminated)

| Exception | Location | Removal plan |
|---|---|---|
| ~~Direct Prisma in handler~~ | ~~`/api/subject-reports`~~ | ✅ RESOLVED (Phase 4) → `services/analytics.ts` + `repositories/analytics.repository.ts` |
| ~~Direct Prisma in handler~~ | ~~`/api/badges`~~ | ✅ RESOLVED (Phase 4) → `services/content.getBadgeCatalog()` |
| Legacy global quiz flags on DailyQuiz | schema | Phase 2 dual-read shim → drop after one seed cycle |
| Shared Flashcard SRS fields / StudyTask.completed / Badge.unlockedSeed | schema | Deprecated in Phase 2B2; drop after one seed cycle |
| Memory rate-limit store | rate-limit.ts | Phase 8 interface swap |
| chars/4 token estimate | ai usage | Phase 14 provider-reported usage |
| In-memory events | Phase 11 emitter default driver | Phase 16/24 queue driver |
| Services still calling Prisma directly (pre-repo era: content, user, exam, ai/*) | backend/services/*, backend/ai/* | Relocate behind repositories incrementally as modules move (Phases 11–13); new code MUST use the repository seam |

## 5. Non-Goals (explicit)

- No rewrite of working handlers whose behavior is correct (login/tutor/etc. relocate gradually).
- No Kafka, no separate vector DB, no microservices split.
- No API contract changes unless a phase document says so (contract diffs get their own section).
