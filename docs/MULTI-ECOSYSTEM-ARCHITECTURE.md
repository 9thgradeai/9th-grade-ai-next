# Multi-Exam Ecosystem Architecture

## Purpose

Introduce a first-class **Exam Ecosystem** concept so multiple exam families (BCS, Bangladesh Bank, future Teacher Recruitment, etc.) coexist in one PostgreSQL database with strict content isolation, while all user-facing infrastructure (attempts, bookmarks, flashcards, AI, progress) remains shared.

---

## A. Current Architecture Map

```
Current Model
═════════════

ExamCategory          Subject
  │                     │
  │ (1:N)               │ (1:N)
  ▼                     ▼
Exam                 Topic (recursive tree)
  │                     │
  │ (1:N)               │ (1:N)
  ▼                     ▼
ExamPaper            Question ←──── QuestionBankCategory
                       │
         ┌─────────────┼─────────────┐
         ▼             ▼             ▼
   QuestionAttempt  Bookmark    MockTest/MockTestQuestion
         │
    DailyQuiz/QuizQuestion/DailyQuizParticipation
         │
    Flashcard/FlashcardUserState/FlashcardReview
         │
    StudyPlanDay/StudyTask/StudyTaskCompletion
         │
    AIConversation/AIMessage/AIMemory/AIUsage/AIFeedback
         │
    UserProgress / Badge / UserBadge
```

**Key observations:**
- Subject, Topic, ExamCategory, Exam, ExamPaper, Question all exist in one flat namespace
- No concept of "ecosystem" or "exam family" exists anywhere
- The 10 subjects are BCS-only (hardcoded in `scripts/taxonomy.ts` SUBJECT_META)
- `ExamCategory` has slug `"bcs"` — only one category exists
- All question filtering is by subject/topic/difficulty/year/sourceExam — no ecosystem filter
- All user data (attempts, bookmarks, flashcards, progress) references Question by FK — ecosystem is implicit through the question's subject

---

## B. Proposed Architecture

```
ExamEcosystem                    ← NEW (root boundary)
    │
    ├── Subject                  ← MODIFIED (ecosystemId FK)
    │      │
    │      └── Topic             ← UNCHANGED (inherits via Subject)
    │             │
    │             └── Question   ← MODIFIED (ecosystemId FK, indexed)
    │
    ├── ExamCategory             ← MODIFIED (ecosystemId FK)
    │      │
    │      └── Exam              ← UNCHANGED (inherits via ExamCategory)
    │             │
    │             └── ExamPaper  ← UNCHANGED (inherits via Exam)
    │                    │
    │                    └── Question (paperId FK — already exists)
    │
    └── DailyQuiz                ← MODIFIED (ecosystemId FK)

Shared infrastructure (UNCHANGED):
  User, QuestionAttempt, Bookmark, Flashcard, FlashcardUserState,
  FlashcardReview, MockTest, MockTestResult, StudyPlanDay, StudyTask,
  StudyTaskCompletion, AIConversation, AIMessage, AIMemory, AIUsage,
  AIFeedback, UserProgress, Badge, UserBadge, AppNotification,
  NotificationRead, ExamSchedule, FlashNews, Recommendation, Document
```

**Relationship chain:**

```
ExamEcosystem
   ↓
Subject (ecosystemId)
   ↓
Topic (via Subject)
   ↓
Question (subjectId, ecosystemId)
```

```
ExamEcosystem
   ↓
ExamCategory (ecosystemId)
   ↓
Exam
   ↓
ExamPaper
   ↓
Question (paperId, examId — already exist)
```

---

## C. Exact Schema Changes

### C.1 New Enum: `ExamEcosystemCode`

```prisma
enum ExamEcosystemCode {
  BCS
  BANGLADESH_BANK
}
```

Rationale: Prisma enum for compile-time type safety. New ecosystems are added as enum values; no string parsing needed.

### C.2 New Model: `ExamEcosystem`

```prisma
model ExamEcosystem {
  id              Int                @id @default(autoincrement())
  code            ExamEcosystemCode  @unique
  slug            String             @unique
  name            String             // English display name, e.g. "BCS"
  nameBn          String             // Bengali display name, e.g. "বিসিএস"
  description     String             @default("")
  descriptionBn   String             @default("")
  isActive        Boolean            @default(true)
  sortOrder       Int                @default(0)
  createdAt       DateTime           @default(now())
  updatedAt       DateTime           @updatedAt

  subjects        Subject[]
  examCategories  ExamCategory[]
  dailyQuizzes    DailyQuiz[]

  @@index([sortOrder])
}
```

### C.3 Modified Model: `Subject`

Add `ecosystemId` FK:

```prisma
model Subject {
  id           Int             @id @default(autoincrement())
  ecosystemId  Int
  ecosystem    ExamEcosystem   @relation(fields: [ecosystemId], references: [id], onDelete: Cascade)
  nameBn       String
  nameEn       String
  icon         String          @default("📘")
  color        String?         @default("text-emerald-400")
  bg           String?         @default("bg-emerald-500/10")
  sortOrder    Int             @default(0)
  topics       Topic[]
  questions    Question[]
  flashcards   Flashcard[]
  categories   QuestionBankCategory[]
  attempts     QuestionAttempt[]
  aiConversations AIConversation[]

  @@unique([ecosystemId, nameBn])     // same nameBn allowed in different ecosystems
  @@index([sortOrder])
  @@index([ecosystemId])
}
```

**Change from current:** Added `ecosystemId` (required, not nullable) + composite unique `(ecosystemId, nameBn)`. Removed the standalone `@unique` on `nameBn`.

### C.4 Modified Model: `ExamCategory`

Add `ecosystemId` FK:

```prisma
model ExamCategory {
  id           Int             @id @default(autoincrement())
  ecosystemId  Int
  ecosystem    ExamEcosystem   @relation(fields: [ecosystemId], references: [id], onDelete: Cascade)
  slug         String          @unique
  nameBn       String
  nameEn       String
  icon         String          @default("📘")
  color        String          @default("text-emerald-400")
  bg           String          @default("bg-emerald-500/10")
  sortOrder    Int             @default(0)
  exams        Exam[]

  @@unique([ecosystemId, slug])       // same slug allowed in different ecosystems
  @@index([sortOrder])
  @@index([ecosystemId])
}
```

**Change from current:** Added `ecosystemId` (required, not nullable) + composite unique `(ecosystemId, slug)`. The standalone `@unique` on `slug` is preserved (slug is already unique globally via `"bcs"`).

### C.5 Modified Model: `Question`

Add denormalized `ecosystemId` FK (indexed, for fast filtering):

```prisma
model Question {
  id             Int             @id @default(autoincrement())
  ecosystemId    Int
  ecosystem      ExamEcosystem   @relation(fields: [ecosystemId], references: [id], onDelete: Cascade)
  subjectId      Int
  subject        Subject         @relation(fields: [subjectId], references: [id], onDelete: Cascade)
  // ... all existing fields unchanged ...

  @@index([ecosystemId])
  @@index([ecosystemId, subjectId])
  @@index([ecosystemId, subjectId, difficulty])
  @@index([ecosystemId, subjectId, path])
  @@index([ecosystemId, subjectId, topic, subtopic])
}
```

**Change from current:** Added `ecosystemId` (required, not nullable) with composite indexes. Existing `[subjectId, ...]` indexes are replaced by `[ecosystemId, subjectId, ...]` since queries will always filter by ecosystem first.

### C.6 Modified Model: `DailyQuiz`

Add `ecosystemId` FK:

```prisma
model DailyQuiz {
  id           Int             @id @default(autoincrement())
  ecosystemId  Int             // nullable initially, backfilled then NOT NULL
  ecosystem    ExamEcosystem   @relation(fields: [ecosystemId], references: [id], onDelete: Cascade)
  date         String          @unique
  // ... rest unchanged ...

  @@index([ecosystemId, date])
}
```

### C.7 Modified Model: `QuestionAttempt`

Add denormalized `ecosystemId` FK (for fast ecosystem-scoped progress queries):

```prisma
model QuestionAttempt {
  id           Int             @id @default(autoincrement())
  ecosystemId  Int
  ecosystem    ExamEcosystem   @relation(fields: [ecosystemId], references: [id], onDelete: Cascade)
  userId       String
  user         User            @relation(fields: [userId], references: [id], onDelete: Cascade)
  // ... rest unchanged ...

  @@index([ecosystemId, userId, createdAt])
  @@index([ecosystemId, userId, subjectId])
  @@index([ecosystemId, userId, subjectName])
  @@index([ecosystemId, userId, topic])
}
```

### C.8 Summary of ALL Schema Changes

| Model | Change | Column/Constraint Added |
|-------|--------|------------------------|
| `ExamEcosystem` | **NEW** | id, code (unique), slug (unique), name, nameBn, description, descriptionBn, isActive, sortOrder, timestamps |
| `Subject` | FK added | `ecosystemId Int NOT NULL` → ExamEcosystem |
| `Subject` | Unique changed | `@@unique([ecosystemId, nameBn])` (replaces standalone `nameBn` unique) |
| `ExamCategory` | FK added | `ecosystemId Int NOT NULL` → ExamEcosystem |
| `ExamCategory` | Unique added | `@@unique([ecosystemId, slug])` (slug stays globally unique too) |
| `Question` | FK added | `ecosystemId Int NOT NULL` → ExamEcosystem |
| `DailyQuiz` | FK added | `ecosystemId Int NOT NULL` → ExamEcosystem |
| `QuestionAttempt` | FK added | `ecosystemId Int NOT NULL` → ExamEcosystem |

**New indexes:**
- `ExamEcosystem.sortOrder`
- `Subject.[ecosystemId]`, `Subject.[ecosystemId, nameBn]`
- `ExamCategory.[ecosystemId]`, `ExamCategory.[ecosystemId, slug]`
- `Question.[ecosystemId]`, `Question.[ecosystemId, subjectId]`, `Question.[ecosystemId, subjectId, difficulty]`, `Question.[ecosystemId, subjectId, path]`, `Question.[ecosystemId, subjectId, topic, subtopic]`
- `DailyQuiz.[ecosystemId, date]`
- `QuestionAttempt.[ecosystemId, userId, createdAt]`, `QuestionAttempt.[ecosystemId, userId, subjectId]`, `QuestionAttempt.[ecosystemId, userId, subjectName]`, `QuestionAttempt.[ecosystemId, userId, topic]`

**Removed indexes** (superseded by ecosystem-prefixed composites):
- `Subject.sortOrder` → replaced by `Subject.[ecosystemId]` (sortOrder kept via separate index)
- `Question.[subjectId, difficulty]` → replaced by `Question.[ecosystemId, subjectId, difficulty]`
- `Question.[subjectId, path]` → replaced by `Question.[ecosystemId, subjectId, path]`
- `Question.[subjectId, topic, subtopic]` → replaced by `Question.[ecosystemId, subjectId, topic, subtopic]`
- `QuestionAttempt.[userId, createdAt]` → replaced by `QuestionAttempt.[ecosystemId, userId, createdAt]`
- `QuestionAttempt.[userId, subjectId]` → replaced by `QuestionAttempt.[ecosystemId, userId, subjectId]`
- `QuestionAttempt.[userId, subjectName]` → replaced by `QuestionAttempt.[ecosystemId, userId, subjectName]`
- `QuestionAttempt.[userId, topic]` → replaced by `QuestionAttempt.[ecosystemId, userId, topic]`

**NOT changed (shared infrastructure):**
- `Bookmark`, `Flashcard`, `FlashcardUserState`, `FlashcardReview`, `MockTest`, `MockTestResult`, `StudyPlanDay`, `StudyTask`, `StudyTaskCompletion`, `AIConversation`, `AIMessage`, `AIMemory`, `AIUsage`, `AIFeedback`, `UserProgress`, `Badge`, `UserBadge`, `AppNotification`, `NotificationRead`, `ExamSchedule`, `FlashNews`, `Recommendation`, `Document`, `OfflinePack`, `ExamArchive`, `QuestionBankCategory`

---

## D. Migration Plan

### D.1 Prisma Migration (NOT db:push)

This is a production structural migration. Use `prisma migrate` for durability:

```bash
npx prisma migrate dev --schema database/prisma/schema.prisma --name add-exam-ecosystem
```

### D.2 Phase-by-Phase Sequence

#### Phase 1 — Add ExamEcosystem model + enum (safe, no data impact)

```sql
CREATE TYPE "ExamEcosystemCode" AS ENUM ('BCS', 'BANGLADESH_BANK');
CREATE TABLE "ExamEcosystem" ( ... );
-- Seed: INSERT BCS + BANGLADESH_BANK rows
```

#### Phase 2 — Add nullable ecosystemId columns (safe, no data impact)

```sql
ALTER TABLE "Subject" ADD COLUMN "ecosystemId" INTEGER;
ALTER TABLE "ExamCategory" ADD COLUMN "ecosystemId" INTEGER;
ALTER TABLE "Question" ADD COLUMN "ecosystemId" INTEGER;
ALTER TABLE "DailyQuiz" ADD COLUMN "ecosystemId" INTEGER;
ALTER TABLE "QuestionAttempt" ADD COLUMN "ecosystemId" INTEGER;
```

#### Phase 3 — Backfill BCS ecosystem (data-only, no constraint changes)

```sql
-- All existing content is BCS
UPDATE "Subject" SET "ecosystemId" = (SELECT id FROM "ExamEcosystem" WHERE code = 'BCS');
UPDATE "ExamCategory" SET "ecosystemId" = (SELECT id FROM "ExamEcosystem" WHERE code = 'BCS');
UPDATE "Question" SET "ecosystemId" = (SELECT id FROM "ExamEcosystem" WHERE code = 'BCS');
UPDATE "DailyQuiz" SET "ecosystemId" = (SELECT id FROM "ExamEcosystem" WHERE code = 'BCS');
UPDATE "QuestionAttempt" SET "ecosystemId" = (SELECT id FROM "ExamEcosystem" WHERE code = 'BCS');
```

**Verify:** Every row must have ecosystemId set. Zero NULLs expected.

```sql
SELECT COUNT(*) FROM "Subject" WHERE "ecosystemId" IS NULL;   -- must be 0
SELECT COUNT(*) FROM "ExamCategory" WHERE "ecosystemId" IS NULL; -- must be 0
SELECT COUNT(*) FROM "Question" WHERE "ecosystemId" IS NULL;   -- must be 0
SELECT COUNT(*) FROM "DailyQuiz" WHERE "ecosystemId" IS NULL;  -- must be 0
SELECT COUNT(*) FROM "QuestionAttempt" WHERE "ecosystemId" IS NULL; -- must be 0
```

#### Phase 4 — Add NOT NULL constraints (safe after backfill)

```sql
ALTER TABLE "Subject" ALTER COLUMN "ecosystemId" SET NOT NULL;
ALTER TABLE "ExamCategory" ALTER COLUMN "ecosystemId" SET NOT NULL;
ALTER TABLE "Question" ALTER COLUMN "ecosystemId" SET NOT NULL;
ALTER TABLE "DailyQuiz" ALTER COLUMN "ecosystemId" SET NOT NULL;
ALTER TABLE "QuestionAttempt" ALTER COLUMN "ecosystemId" SET NOT NULL;
```

#### Phase 5 — Add FK constraints + indexes

```sql
ALTER TABLE "Subject" ADD FOREIGN KEY ("ecosystemId") REFERENCES "ExamEcosystem"("id") ON DELETE CASCADE;
ALTER TABLE "ExamCategory" ADD FOREIGN KEY ("ecosystemId") REFERENCES "ExamEcosystem"("id") ON DELETE CASCADE;
ALTER TABLE "Question" ADD FOREIGN KEY ("ecosystemId") REFERENCES "ExamEcosystem"("id") ON DELETE CASCADE;
ALTER TABLE "DailyQuiz" ADD FOREIGN KEY ("ecosystemId") REFERENCES "ExamEcosystem"("id") ON DELETE CASCADE;
ALTER TABLE "QuestionAttempt" ADD FOREIGN KEY ("ecosystemId") REFERENCES "ExamEcosystem"("id") ON DELETE CASCADE;

-- All new indexes (see C.8)
CREATE INDEX "Subject_ecosystemId_idx" ON "Subject"("ecosystemId");
CREATE INDEX "Subject_ecosystemId_nameBn_idx" ON "Subject"("ecosystemId", "nameBn");
-- ... (all indexes from C.8)
```

#### Phase 6 — Add unique constraints

```sql
ALTER TABLE "Subject" DROP CONSTRAINT "Subject_nameBn_key";  -- remove old standalone unique
ALTER TABLE "Subject" ADD CONSTRAINT "Subject_ecosystemId_nameBn_key" UNIQUE ("ecosystemId", "nameBn");
-- ExamCategory slug stays globally unique (no change needed)
```

#### Phase 7 — Seed Bangladesh Bank ecosystem + 8 subjects

Run the seed script (not raw SQL) to create:
- ExamEcosystem: `BANGLADESH_BANK` (already in Phase 1)
- 8 Subject records with `ecosystemId` pointing to BANGLADESH_BANK
- Topic trees for each subject (empty initially, populated by future imports)

### D.3 Backward Compatibility

- **All existing BCS data** gains `ecosystemId = BCS` — zero data loss
- **All existing Question IDs** stay stable — no FK references break
- **All existing user records** (attempts, bookmarks, flashcards) reference the same Question IDs
- **No DROP TABLE** — purely additive
- **Seed scripts** continue to work (they'll set ecosystemId on new records)
- **`db:push`** still works for dev (but production uses `prisma migrate`)

### D.4 Rollback Strategy

If the migration must be reverted:
1. Drop the new columns and FK constraints
2. Re-create the old unique constraint on `Subject.nameBn`
3. Drop the `ExamEcosystem` table
4. No user data is lost (ecosystemId columns were additive)

---

## E. API Changes

### E.1 New Route: `GET /api/ecosystems`

Returns all active ecosystems with subject counts:

```typescript
// Response shape
{
  ecosystems: [
    { id: 1, code: "BCS", slug: "bcs", name: "BCS", nameBn: "বিসিএস", subjectCount: 10, questionCount: 3000 },
    { id: 2, code: "BANGLADESH_BANK", slug: "bangladesh-bank", name: "Bangladesh Bank", nameBn: "বাংলাদেশ ব্যাংক", subjectCount: 8, questionCount: 0 }
  ]
}
```

### E.2 Modified Routes — Ecosystem Parameter

Every content route gains an `ecosystem` query/body parameter:

| Route | Current Filters | Ecosystem Filter Added |
|-------|----------------|----------------------|
| `GET /api/exam/config` | none (returns all subjects) | `?ecosystem=BCS` or `?ecosystem=BANGLADESH_BANK` |
| `POST /api/exam/build` | subjectId, paths, count | body: `ecosystem: "BCS"` |
| `GET /api/questions` | subject, topic, difficulty, etc. | `?ecosystem=BCS` |
| `GET /api/question-bank/categories` | none (returns all) | `?ecosystem=BCS` |
| `GET /api/question-bank/exams` | none (returns all) | `?ecosystem=BCS` |
| `GET /api/daily-quiz` | none | `?ecosystem=BCS` |
| `POST /api/daily-quiz/submit` | quizId | body includes ecosystem validation |
| `GET /api/flashcards` | subjectName | `?ecosystem=BCS` |
| `GET /api/subject-reports` | userId | `?ecosystem=BCS` |
| `GET /api/weak-topics` | userId | `?ecosystem=BCS` |
| `POST /api/practice/submit` | questionId, selected | server validates ecosystem consistency |
| `POST /api/exam/submit` | answers | server validates all questions belong to same ecosystem |

### E.3 Ecosystem Validation Service

New function in `backend/services/ecosystem.ts`:

```typescript
export async function getEcosystemByCode(code: string): Promise<ExamEcosystem | null>
export async function validateSubjectEcosystem(subjectId: number, ecosystemId: number): Promise<boolean>
export async function validateTopicEcosystem(topicId: number, ecosystemId: number): Promise<boolean>
export async function validateQuestionEcosystem(questionId: number, ecosystemId: number): Promise<boolean>
```

### E.4 Validation Rules

For every API route that accepts `ecosystem`:

1. **Parse**: Validate `ecosystem` is a valid `ExamEcosystemCode` enum value
2. **Lookup**: Resolve to `ExamEcosystem` row (must exist and be active)
3. **Verify relationships**: If `subjectId` is provided, verify `Subject.ecosystemId === ecosystem.id`
4. **Reject mismatches**: Return `400 VALIDATION_ERROR` with clear message if ecosystem/subject mismatch
5. **Never trust client IDs alone**: Always verify the relationship chain server-side

### E.5 Affected Backend Services

| Service File | Changes |
|-------------|---------|
| `backend/services/exam.ts` | `getExamSelectionTree(ecosystemId)`, `buildCustomExam(request, ecosystemId)`, `submitCustomExam()` — all queries filtered by ecosystemId |
| `backend/services/content.ts` | `getQuestions()`, `getQuestionBankCategories()`, `getQuestionBankExams()`, `getDailyQuiz()` — all gain ecosystem filter param |
| `backend/services/activity.ts` | `submitPracticeAnswers()`, `submitDailyQuiz()` — resolve ecosystem from question/quiz, set on QuestionAttempt |
| `backend/services/analytics.ts` | `getSubjectReports()`, `getWeakTopics()` — filter by ecosystemId |
| `backend/repositories/analytics.repository.ts` | All raw SQL queries gain `WHERE "ecosystemId" = $N` |
| `backend/repositories/progress.repository.ts` | `recomputeAndAward()` — optionally filter by ecosystem |
| `backend/ai/context/context-engine.ts` | `buildContext()` — scope to ecosystem when building student model |
| `backend/ai/memory/memory-store.ts` | `noteTopicSignal()` — store ecosystem context in memory key |

### E.6 Affected API Route Files

| Route File | Change |
|-----------|--------|
| `app/api/exam/config/route.ts` | Read `ecosystem` query param, pass to service |
| `app/api/exam/build/route.ts` | Read `ecosystem` from body, validate, pass to service |
| `app/api/exam/submit/route.ts` | Validate all questions belong to same ecosystem |
| `app/api/questions/route.ts` | Read `ecosystem` query param, pass to service |
| `app/api/question-bank/categories/route.ts` | Read `ecosystem` query param, filter subjects |
| `app/api/question-bank/exams/route.ts` | Read `ecosystem` query param, filter exam categories |
| `app/api/daily-quiz/route.ts` | Read `ecosystem` query param |
| `app/api/daily-quiz/submit/route.ts` | Validate quiz belongs to ecosystem |
| `app/api/practice/submit/route.ts` | Validate question belongs to ecosystem |
| `app/api/flashcards/route.ts` | Read `ecosystem` query param |
| `app/api/subject-reports/route.ts` | Read `ecosystem` query param |
| `app/api/weak-topics/route.ts` | Read `ecosystem` query param |
| `app/api/dashboard-stats/route.ts` | Support ecosystem-scoped stats |

---

## F. Frontend Changes

### F.1 New Context: `EcosystemContext`

```typescript
// frontend/lib/ecosystem-ctx/index.tsx
type EcosystemContextValue = {
  ecosystem: ExamEcosystemCode;       // current active ecosystem
  setEcosystem: (code: ExamEcosystemCode) => void;
  ecosystems: ExamEcosystemDTO[];     // all active ecosystems
  isLoading: boolean;
};
```

- Persisted in `localStorage` key `"9th_grade_ai_ecosystem"` with URL sync
- Default: `"BCS"` (backward compatible)
- Wraps the entire dashboard shell

### F.2 URL Strategy

```
/dashboard/practice?tab=practice&ecosystem=bcs
/dashboard/practice?tab=practice&ecosystem=bangladesh-bank
```

The `ecosystem` search param:
- Is read on mount and synced with context
- Changes when user switches ecosystem
- Is preserved across tab switches within practice
- Deep links work: `/dashboard?tab=practice&ecosystem=bangladesh-bank`

### F.3 Practice UI Changes

#### PracticeTab.tsx
- Add ecosystem segmented control at top
- Pass ecosystem to `api.examConfig({ ecosystem })`
- Pass ecosystem to `api.questions({ ecosystem })`
- Show ecosystem-appropriate empty states

#### CustomExamTab.tsx
- Pass ecosystem to `api.examConfig({ ecosystem })`
- Include ecosystem in `api.buildExam({ ...config, ecosystem })`
- Show ecosystem-appropriate subject list
- localStorage key scoped: `"ninth-grade-ai:exam:active:${ecosystem}"`

#### MockTestTab.tsx
- Same changes as CustomExamTab
- localStorage key scoped: `"ninth-grade-ai:mock-test:active:${ecosystem}"`

#### QuestionBankTab.tsx
- Pass ecosystem to `api.questionBankCategories({ ecosystem })`
- Pass ecosystem to `api.questions({ ecosystem })`
- Pass ecosystem to `api.examLibrary({ ecosystem })`
- Filter categories by ecosystem
- Remove BCS-specific `bcsTerm` filter when ecosystem is not BCS

#### ExamLibraryView.tsx
- Pass ecosystem to `api.examLibrary({ ecosystem })`
- Show only exam categories belonging to the ecosystem

#### TopicTreePicker.tsx
- Receives ecosystem-filtered subjects as props (no internal changes needed)

### F.4 API Client Changes

`frontend/lib/services/api.ts` — every method gains optional `ecosystem` parameter:

```typescript
questions: (params: { ecosystem?: string; subject?: string; ... }) => ...
examConfig: (params?: { ecosystem?: string }) => ...
buildExam: (body: { ecosystem?: string; ... }) => ...
questionBankCategories: (params?: { ecosystem?: string }) => ...
examLibrary: (params?: { ecosystem?: string }) => ...
dailyQuiz: (params?: { ecosystem?: string }) => ...
flashcards: (params?: { ecosystem?: string }) => ...
subjectReports: (params?: { ecosystem?: string }) => ...
weakTopics: (params?: { ecosystem?: string }) => ...
```

### F.5 New API Method

```typescript
ecosystems: () => request<ExamEcosystemDTO[]>("/api/ecosystems")
```

### F.6 Type Additions

`frontend/lib/types/index.ts`:

```typescript
// Client namespace
export type ExamEcosystemCode = "BCS" | "BANGLADESH_BANK";

// Server namespace
export type ExamEcosystemDTO = {
  id: number;
  code: ExamEcosystemCode;
  slug: string;
  name: string;
  nameBn: string;
  description: string;
  descriptionBn: string;
  isActive: boolean;
  subjectCount: number;
  questionCount: number;
};
```

### F.7 Component Changes Summary

| Component | File | Change |
|-----------|------|--------|
| `EcosystemContext` | `frontend/lib/ecosystem-ctx/index.tsx` | **NEW** — ecosystem state + provider |
| `PracticeTab` | `frontend/components/dashboard/PracticeTab.tsx` | Add ecosystem switcher, pass ecosystem to all API calls |
| `CustomExamTab` | `frontend/components/dashboard/CustomExamTab.tsx` | Pass ecosystem to API, scope localStorage |
| `MockTestTab` | `frontend/components/dashboard/MockTestTab.tsx` | Pass ecosystem to API, scope localStorage |
| `QuestionBankTab` | `frontend/components/dashboard/QuestionBankTab.tsx` | Pass ecosystem to API, filter categories |
| `ExamLibraryView` | `frontend/components/dashboard/ExamLibraryView.tsx` | Pass ecosystem to API |
| `DailyQuizWidget` | `frontend/components/dashboard/DailyQuizWidget.tsx` | Pass ecosystem to API |
| `ProgressTab` | `frontend/components/dashboard/ProgressTab.tsx` | Pass ecosystem to subject-reports/weak-topics |
| `WrongAnswerNotebookTab` | `frontend/components/dashboard/WrongAnswerNotebookTab.tsx` | Pass ecosystem to wrong-answers |
| `FlashcardsTab` | `frontend/components/dashboard/FlashcardsTab.tsx` | Pass ecosystem to flashcards API |
| `HomeTab` | `frontend/components/dashboard/HomeTab.tsx` | Ecosystem-scoped dashboard stats |
| `api.ts` | `frontend/lib/services/api.ts` | Add ecosystem param to all content methods |
| `types/index.ts` | `frontend/lib/types/index.ts` | Add ExamEcosystemDTO + ExamEcosystemCode |
| `DashboardState` | `frontend/lib/store-ctx/dashboard.tsx` | Add `activeEcosystem` to store (optional, alternative to context) |

---

## G. Test Plan

### G.1 Database Tests

| Test | File | What |
|------|------|------|
| Ecosystem creation | `tests/unit/backend/ecosystem.test.ts` | Create BCS + Bangladesh Bank, verify fields |
| Subject isolation | `tests/unit/backend/ecosystem.test.ts` | Same nameBn in different ecosystems = valid; same nameBn in same ecosystem = rejected |
| Question isolation | `tests/unit/backend/ecosystem.test.ts` | Query BCS ecosystem → only BCS questions |
| Topic isolation | `tests/unit/backend/ecosystem.test.ts` | Topic inherits ecosystem through Subject |
| Unique constraints | `tests/unit/backend/ecosystem.test.ts` | (ecosystemId, nameBn) uniqueness on Subject |
| Migration/backfill | `tests/integration/ecosystem.integration.test.ts` | Real Postgres: all existing rows get BCS ecosystemId |

### G.2 API Tests

| Test | File | What |
|------|------|------|
| GET /api/ecosystems | `tests/api/ecosystems.test.ts` | Returns both ecosystems with counts |
| GET /api/questions?ecosystem=BCS | `tests/api/ecosystem-isolation.test.ts` | Only BCS questions returned |
| GET /api/questions?ecosystem=BANGLADESH_BANK | `tests/api/ecosystem-isolation.test.ts` | Only BB questions returned (initially empty) |
| Mismatched ecosystem + subject | `tests/api/ecosystem-isolation.test.ts` | Returns 400 validation error |
| Exam config with ecosystem | `tests/api/ecosystem-isolation.test.ts` | Returns only ecosystem's subjects |
| Exam build with ecosystem | `tests/api/ecosystem-isolation.test.ts` | All questions belong to ecosystem |
| Missing ecosystem param | `tests/api/ecosystem-isolation.test.ts` | Defaults to BCS or returns 400 (design decision) |
| Invalid ecosystem code | `tests/api/ecosystem-isolation.test.ts` | Returns 400 |

### G.3 Frontend Tests

| Test | File | What |
|------|------|------|
| Ecosystem switcher renders | `tests/unit/frontend/ecosystem-switcher.test.tsx` | Both options visible, keyboard accessible |
| Ecosystem state persists | `tests/unit/frontend/ecosystem-switcher.test.tsx` | Selection survives re-render |
| URL sync | `tests/unit/frontend/ecosystem-switcher.test.tsx` | ?ecosystem= param updates context |
| Practice with ecosystem | `tests/unit/frontend/practice-ecosystem.test.tsx` | API calls include ecosystem param |
| Empty state for BB | `tests/unit/frontend/practice-ecosystem.test.tsx` | Shows "no questions yet" message |

### G.4 E2E Test

```typescript
// tests/e2e/ecosystem-switching.spec.ts
test("ecosystem switching flow", async ({ page }) => {
  // Login
  // Navigate to Practice
  // Verify BCS subjects shown
  // Click Bangladesh Bank tab
  // Verify 8 BB subjects shown
  // Verify BCS subjects hidden
  // Select a BB subject
  // Verify only BB content available
  // Switch back to BCS
  // Verify BCS subjects restored
  // Refresh page
  // Verify ecosystem selection persisted
});
```

### G.5 Data Pipeline Tests

| Test | File | What |
|------|------|------|
| BB seed idempotency | `tests/unit/backend/bb-seed.test.ts` | Re-seed doesn't duplicate |
| sourceKey distinctness | `tests/unit/backend/bb-seed.test.ts` | BB sourceKeys don't collide with BCS |
| Import validation | `tests/unit/backend/bb-import.test.ts` | Rejects invalid MCQs |

---

## H. Import Plan

### H.1 Bangladesh Bank MCQ Import Pipeline

Create `scripts/import-bangladesh-bank.ts` modeled on `scripts/import-bcs-exams.ts`.

**Input format:**
```json
{
  "examType": "SENIOR_OFFICER",
  "examName": "Senior Officer Written",
  "year": 2024,
  "subject": "Financial and Banking Knowledge",
  "topic": "Banking Fundamentals",
  "qnum": 1,
  "question": "...",
  "options": ["...", "...", "...", "..."],
  "correctAnswer": "...",
  "explanation": "...",
  "difficulty": "MEDIUM",
  "language": "bn"
}
```

**Source key formula:**
```typescript
sourceKey(ecosystemId, examType, subjectName, questionText)
// = md5("2" | "SENIOR_OFFICER" | "Financial and Banking Knowledge" | "<question>")
```

Where ecosystemId for BANGLADESH_BANK is the database ID (resolved at runtime).

**Pipeline steps:**
1. Read JSON file from `database/data/question_bank/bangladesh_bank/`
2. Validate each record (structural + content quality)
3. Resolve subject by nameBn + ecosystemId
4. Create or resolve topic tree nodes
5. Upsert Question with `ecosystemId = BANGLADESH_BANK`
6. Create ExamCategory → Exam → ExamPaper hierarchy
7. Generate import report (accepted/rejected/duplicate counts)

### H.2 Validation Rules

**Required fields:**
- `examType` (string, non-empty)
- `subject` (must match a Bangladesh Bank Subject nameBn)
- `question` (>= 5 chars)
- `options` (array, >= 4 items)
- `correctAnswer` (must match an option letter or exact option text)

**Content quality:**
- Unicode NFC normalization
- Bangla rendering check (no corrupted sequences)
- Math symbol preservation
- Whitespace normalization
- Duplicate detection via sourceKey

**Rejected records:**
- Preamble/note text (regex detection)
- OCR garbage (huge qnum, empty options)
- Missing correct answer
- Unknown subject
- Duplicate sourceKey

### H.3 Dry-Run Mode

```bash
npx tsx scripts/import-bangladesh-bank.ts --dry-run
```

Outputs:
- Total records scanned
- Records accepted
- Records rejected (with reasons)
- Records that would update existing rows
- Preview of first 10 accepted records

### H.4 Idempotent Re-Import

The import is safe to run multiple times:
- Upserts by `sourceKey` — existing rows get content updates, IDs stay stable
- User bookmarks/attempts reference the same Question IDs
- New records are inserted, missing records are left untouched (no deletion)

---

## I. Seed Script Changes

### I.1 `database/prisma/seed.ts` Modifications

1. Create ExamEcosystem rows (BCS, BANGLADESH_BANK) if not exist
2. All Subject upserts gain `ecosystemId` lookup
3. All Question upserts gain `ecosystemId` lookup
4. DailyQuiz gains `ecosystemId`

### I.2 `scripts/seed-questions.ts` Modifications

1. Accept `ecosystemCode` parameter (default: `"BCS"`)
2. Resolve `ecosystemId` from code
3. Filter `SUBJECT_META` by ecosystem (BCS subjects for BCS, BB subjects for BB)
4. Set `ecosystemId` on all created Subjects, Topics, Questions

### I.3 `scripts/import-bcs-exams.ts` Modifications

1. Set `ecosystemId` on all created ExamCategory, Exam, ExamPaper, Question records

### I.4 New: `scripts/taxonomy-bb.ts`

Bangladesh Bank subject metadata (analogous to `SUBJECT_META` in `scripts/taxonomy.ts`):

```typescript
export const BB_SUBJECT_META: SubjectMeta[] = [
  { nameBn: "বাংলা ব্যাকরণ", nameEn: "Bangla Grammar", icon: "📝", color: "text-emerald-400", bg: "bg-emerald-500/10" },
  { nameBn: "বাংলা সাহিত্য", nameEn: "Bangla Literature", icon: "📖", color: "text-sky-400", bg: "bg-sky-500/10" },
  { nameBn: "ইংরেজি ব্যাকরণ", nameEn: "English Grammar", icon: "🔤", color: "text-green-400", bg: "bg-green-500/10" },
  { nameBn: "ইংরেজি সাহিত্য", nameEn: "English Literature", icon: "📚", color: "text-cyan-400", bg: "bg-cyan-500/10" },
  { nameBn: "সাধারণ গণিত", nameEn: "General Mathematics", icon: "🧮", color: "text-teal-400", bg: "bg-teal-500/10" },
  { nameBn: "আর্থিক ও ব্যাংকিং জ্ঞান", nameEn: "Financial and Banking Knowledge", icon: "🏦", color: "text-purple-400", bg: "bg-purple-500/10" },
  { nameBn: "বিশ্লেষণাত্মক দক্ষতা", nameEn: "Analytical Skills", icon: "🧩", color: "text-indigo-400", bg: "bg-indigo-500/10" },
  { nameBn: "আইসিটির মৌলিক জ্ঞান", nameEn: "Basic Knowledge on ICT", icon: "💻", color: "text-amber-400", bg: "bg-amber-500/10" },
];
```

---

## J. Performance Considerations

### J.1 Index Strategy

All new composite indexes lead with `ecosystemId` because:
1. Every practice query filters by ecosystem first
2. PostgreSQL composite indexes are leftmost-prefix sensitive
3. The ecosystem filter is high-selectivity (2-5 values) but eliminates 50-90% of rows immediately

### J.2 Query Cache

The existing `QueryCache` (`backend/infrastructure/cache/query-cache.ts`) caches:
- `getExamTree()` — must now be keyed by ecosystem: `getExamTree(ecosystemId)`
- `getQuestions()` — already parameterized; cache key gains ecosystem

### J.3 No N+1 Queries

The `getExamSelectionTree()` function uses `Promise.all` for parallel Subject + Topic + Question loading. Adding ecosystem filter to each query does not change this pattern.

### J.4 Dashboard Stats

The `getDashboardStats()` function currently aggregates all questions. For ecosystem-scoped stats, it gains a `WHERE ecosystemId = $N` clause — no structural change needed.

---

## K. Security Considerations

### K.1 Ecosystem Mismatch Prevention

The server NEVER trusts the client to provide consistent IDs. For every request:

1. Parse `ecosystem` code from request
2. Resolve to `ExamEcosystem` row
3. If `subjectId` is provided, verify `Subject.ecosystemId === ecosystem.id`
4. If `topicId` is provided, verify through Subject chain
5. If `questionId` is provided, verify `Question.ecosystemId === ecosystem.id`
6. Reject with 400 if any mismatch

### K.2 No Ecosystem Escalation

A user cannot:
- Submit a BCS question as part of a Bangladesh Bank exam
- See BCS subjects when switched to Bangladesh Bank
- Access Bangladesh Bank questions via BCS API endpoints without the ecosystem parameter

### K.3 Existing Security Preserved

- JWT auth unchanged
- CSRF protection unchanged
- Rate limiting unchanged
- ownership checks unchanged

---

## L. Documentation Updates

| File | Update |
|------|--------|
| `docs/DATABASE.md` | Add ExamEcosystem model, document new FK columns, updated sourceKey patterns |
| `docs/API.md` | Document `/api/ecosystems` endpoint, ecosystem param on all content routes |
| `docs/DECISIONS.md` | Add ADR for Multi-Exam Ecosystem Architecture |
| `docs/ARCHITECTURE.md` | Update ER diagram, add ecosystem layer |
| `AGENTS.md` | Update repository structure, add ecosystem-ctx |

---

## M. Acceptance Criteria Checklist

- [ ] One PostgreSQL database remains in use
- [ ] One Prisma schema remains in use
- [ ] Existing BCS data remains intact (all ecosystemId = BCS)
- [ ] Existing user data remains intact (bookmarks, attempts, progress)
- [ ] BCS and Bangladesh Bank have explicit ecosystem boundaries
- [ ] Bangladesh Bank has exactly 8 initial subjects
- [ ] Bangladesh Bank subjects have independent topic tree (empty initially)
- [ ] Questions cannot cross ecosystems accidentally (FK + validation)
- [ ] Practice has a clear BCS/Bangladesh Bank switcher
- [ ] APIs filter server-side by ecosystem
- [ ] Question Bank is ecosystem-aware
- [ ] Mock Tests are ecosystem-aware
- [ ] Exam generation is ecosystem-safe
- [ ] Progress can distinguish ecosystems
- [ ] Future AI features can distinguish ecosystems
- [ ] Bangladesh Bank MCQs can be imported idempotently
- [ ] sourceKey remains deterministic
- [ ] Unicode/Bangla/English content is preserved
- [ ] Duplicate imports do not create duplicate questions
- [ ] Invalid imports are rejected safely
- [ ] Existing BCS behavior passes regression tests
- [ ] Bangladesh Bank can initially have zero questions without breaking UI
- [ ] No fake question counts displayed
- [ ] Mobile and desktop Practice experiences work correctly
- [ ] E2E test covers ecosystem switching
- [ ] Production migration is non-destructive
- [ ] No unnecessary new dependency introduced
