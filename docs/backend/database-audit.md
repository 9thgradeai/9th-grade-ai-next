# Database Audit — 9Th-Grade AI (Phase 0)

> Scope: `database/prisma/schema.prisma` (600 lines, 33 models, 12 enums) mapped to
> owner/domain, relationships, growth, read/write patterns, indexes, constraints,
> cascade behavior. Evidence-based; no recommendations here (see migration-plan.md).

## 1. Model Inventory & Classification

### Domain: Identity & Progress
| Model | Owner | Growth | Write pattern | Read pattern | Risk notes |
|---|---|---|---|---|---|
| `User` | auth/users | slow (+signups) | insert on register; update profile/password | by email (unique), by id | `handle` unique, indexed; emailVerified unused |
| `UserProgress` | progress | 1:1 user | upsert + increment points/exams; **count-then-update accuracy** (race-prone) | by userId unique | rank computed by full scan elsewhere |
| `QuestionAttempt` | analytics/practice | **highest** (every answered Q, all sources) | bulk createMany | per-user ranges, per-topic agg, dashboard activity | good indexes; see §4 race note |
| `MockTestResult` | exams | medium | insert per submission | last 10 per user | indexed (userId, createdAt) |
| `FlashcardReview` | flashcards | potentially high | **nothing writes it today** | none | orphaned write-path (Phase-10-class issue) |
| `Bookmark` | bookmarks | medium | toggle | set of ids per user | unique(userId,questionId); Cascade on question delete ⚠ |
| `NotificationRead` | notifications | medium | upsert marker | exists-check join | unique(userId,notificationId) |

### Domain: Content (seed-owned, deploy-wiped)
| Model | Growth | Notes |
|---|---|---|
| `Subject` | static (10) | sortOrder index; display tokens (icon/color/bg) in DB |
| `Topic` | static-ish (taxonomy tree) | self-relation `TopicTree`; unique(subjectId,path); `questionCount String` (odd type); recursive cascade delete |
| `Question` | grows with content commits | path-based subtree filtering via `startsWith`; options Json untyped |
| `QuestionBankCategory`, `ExamArchive`, `ExamSchedule`, `FlashNews`, `Recommendation`, `Badge`, `OfflinePack`, `Document` | small catalogs | read-mostly; several carry UI styling or demo state (see §3 global-state list) |

### Domain: Practice artifacts (snapshot-style)
`DailyQuiz`/`QuizQuestion`, `MockTest`/`MockTestQuestion`, `StudyPlanDay`/`StudyTask` —
duplicate the Question shape without FK linkage to `Question` (deliberate snapshots),
plus **accidental global state** detailed in §3.

### Domain: AI
| Model | Growth | Indexes | Notes |
|---|---|---|---|
| `AIConversation` | per-user sessions | (userId,updatedAt), (userId,kind,updatedAt) | topic-scoped optional |
| `AIMessage` | high | (conversationId,createdAt) | metadata Json: subject/topic/intent/webResults only |
| `AIMemory` | small per user | unique(userId,type,key), (userId,type) | deliberate writes only; confidence Int 0–100 unvalidated |
| `AIUsage` | highest-frequency AI row | (userId,createdAt),(task,createdAt),(model,createdAt) | no prompt content; cost estimate only |
| `AIFeedback` | low | (userId,createdAt),(messageId) | eval-set seed |

## 2. Index Audit vs Actual Queries

Verified matches (index ↔ query):
- `QuestionAttempt (userId,createdAt)` ← dashboard activity, context-engine recent-30d ✅
- `QuestionAttempt (userId,subjectId)` ← subject-reports grouping key is `subjectName` though — index not covering that access path ❌ (seq over user's rows instead)
- `Question (subjectId,difficulty/topic/path[,subtopic])` ← getQuestions filters ✅ ; text search `contains` = LIKE %..% → seq scan, fine at current size, needs pg_trgm later
- `AIConversation/AIMessage/AIUsage/AIMemory/Bookmark/NotificationRead/FlashcardReview/MockTestResult` ✅ match their access paths
- `StudyTask (dayId,userId)` ← toggle lookup `findFirst({id,userId})` uses PK actually; composite helps plan scans ✅

Missing / questionable:
1. No index on `Question(path)` alone (exam build filters `subjectId+path IN` — covered by (subjectId,path) ✅; but seed's groupBy(subjectId,path) reuses it ✅).
2. `AppNotification (timestamp)` ordered desc global feed ✅; per-user read-state via join ✅.
3. `UserProgress.points` scanned for rank (`count where points > X`) — no index; full table scan per dashboard view.
4. No partial index for unread notifications if that becomes a hot path.
5. `Flashcard.nextReview` indexed but never used by any query (dead index candidate).

Constraints:
- Uniques where needed: email, handle, userId_questionId, userId_notificationId, subjectId_path, userId_type_key, session token.
- **No CHECK constraints anywhere** (score 0–100, confidence 0–100, easeFactor≈[1.3,3.0], durationSec ≥0 are app-enforced only).
- NOT NULL coverage generally good; notable nullables: `QuestionAttempt.questionId/subjectId` (SetNull by design), `StudyTask.userId` nullable → ownerless tasks untoggleable, `AppNotification.userId` nullable (global announcements OK).

Cascade map (verified): owned data → Cascade; references into content → SetNull;
⚠ **exception:** `Bookmark.questionId` → Cascade (user data destroyed when content wiped — see §5).
Circular/self: Topic self-cascade requires sequential deletes in scripts (documented deadlock workaround).

Type inconsistencies:
- Dates as String: `DailyQuiz.date`, `FlashNews.date`, `StudyPlanDay.date`, `ExamSchedule.year`.
- `Topic.questionCount` String (was likely BigInt-as-string habit).
- Money/points: plain Int, no ledger.

## 3. Accidental Global State (per-user data living on shared rows)

| # | Location | Problem | Blast radius |
|---|---|---|---|
| G1 | `DailyQuiz.completed/score/claimed` | One user's completion flips shared flags; every user sees "completed" | **Confirmed product bug** |
| G2 | `Flashcard.nextReview/interval/easeFactor/repetitions` | SRS scheduling on the *shared* card row; review log table exists but unwritten | SRS cannot ever be per-user as modeled |
| G3 | `StudyTask.userId?` nullable + `getStudyPlan` joins tasks to days globally | Template vs instance conflation; seeded tasks have userId=null → untoggleable (`findFirst({id,userId})` misses) | Toggle works only for rows created with a userId |
| G4 | `OfflinePack.downloaded` | Global boolean pretending to be per-device state | cosmetic |
| G5 | `Badge.unlockedSeed` | Catalog row doubles as unlock state; no `UserBadge` | gamification not real |
| G6 | `AppNotification.read` legacy boolean alongside NotificationRead join | Two sources of truth; service correctly ignores it | low |

G1 and G2 are the two schema-level blockers named for Phase 2 (participation model / per-user SRS state). G3/G5 follow the same fix shape.

## 4. Transaction Correctness (current)

Multi-write operations and their atomicity today:

| Operation | Statements | Atomic? |
|---|---|---|
| practice submit | createMany(attempts) then recomputeProgress(update) | ❌ two round-trips |
| daily quiz submit | same | ❌ |
| exam submit | createMany + recomputeProgress + increment examsAttempted | ❌ three statements |
| register | createUser + upsert progress | ❌ (orphan-progress possible on failure between) |
| account delete | single cascade delete | ✅ |
| AI tutor turn persist | addMessage ×2 + usage + title rename | ❌ intentionally non-atomic (best-effort design) |

`recomputeProgress` itself is read(count)→write(update) → lost-update window under concurrent submissions.

## 5. The Deploy Pipeline Hazard (critical finding)

`package.json#prebuild`: on Vercel builds (`VERCEL=1`) runs
`db:clean` → **deletes ALL Question and Topic rows** → `db:push` → `db:seed`.

Consequences in production, every deploy:
1. `Bookmark` rows are **cascade-deleted** (Bookmark.questionId onDelete: Cascade). User bookmarks do not survive deploys.
2. `QuestionAttempt.questionId` is SetNull → historical attempts permanently lose question linkage (subjectName denormalization partially preserves reporting).
3. Any `AIConversation.topicId` SetNull similarly detached.
4. Seed re-inserts questions with **new autoincrement ids** → even surviving references point at wrong/no rows.
5. Push-without-migrations means zero migration history exists for Neon prep.

This is the single most urgent data-integrity defect in the system. It also means
"Railway production DB" currently has *no stable long-lived content identity*.

## 6. Dead / Ambiguous Infrastructure

- `UserSession`: fully dead at runtime (JWT-only). Referenced nowhere in code except seed wipe under SEED_RESET_USERS. Phase 10 decision required.
- `FlashcardReview`: written by nothing; read by nothing.
- `UserSession.token` unique + expiry indexes: infrastructure for an unimplemented feature.
- `emailVerified`, `OfflinePack.downloaded`, `AppNotification.read`: unused fields.

## 7. Query Pattern Summary (feeds scalability-audit)

Unbounded SELECTs found in services (full inventory in scalability-audit.md §2):
`getNotifications` (all rows), `getDashboardStats` attempts fetch (all rows for user),
context-engine `loadPerformance` byTopic (all rows for user, per AI turn),
subject-reports (all rows for user), badges/documents/recs/schedule (catalog-sized, bounded-by-data).

*Prepared for Phase 0 gate. Schema changes begin only in Phase 2, after target architecture (Phase 1) is documented.*
