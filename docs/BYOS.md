# BYOS — Bring Your Own Storage (User-Owned Data Platform)

## 1. Architecture Overview

```
User Action (bookmark, flashcard, etc.)
  → Next.js API Route (auth + validation + rate limit)
  → Prisma Transaction (PostgreSQL — operational)
  → enqueueSync() → SyncJob (outbox, PENDING, idempotencyKey)
  → 200 OK (never waits for Drive)

Sync Worker (durable, polling, horizontally scalable)
  → claim job (processingLock, bounded concurrency 5, jitter backoff)
  → getValidAccessToken() (decrypt + refresh if <60s)
  → ensureRootFolder("9Th-Grade AI")
  → buildEntityPayload() from PostgreSQL (normalized, not raw Prisma)
  → createEnvelope() {schemaVersion, entityType, id, version, checksum, provider}
  → GoogleDriveProvider.uploadJson() (multipart, 10MB limit)
  → checksum + verifyFile()
  → transaction: StorageFile upsert + StorageRevision + SyncJob SUCCEEDED + StorageConnection lastSyncSuccessAt
  → on failure: FAILED → nextRetryAt = now + 2^attempt + jitter (max 60s), max 5 → DEAD_LETTER
  → degraded: if Drive unavailable, jobs stay PENDING/FAILED, UI shows pending, retries automatically, core app continues
```

**Non-blocking:** `app/api/bookmarks/route.ts:47` `void enqueueSync(...).catch(()=>{})` — exam submit, practice, etc. same. Drive never blocks critical request.

**Scalable:** No in-memory state, no single-process worker, no local FS. All state in PostgreSQL (`SyncJob` with `processingLock` + `nextRetryAt`). `processPendingJobs(limit=5)` can run on any instance, Vercel Cron, or `/api/storage/worker` (Bearer `CRON_SECRET`).

**Provider-agnostic:** `backend/services/storage/types.ts:13` `StorageProvider` interface → `GoogleDriveProvider` today, S3/R2/Dropbox/OneDrive tomorrow without rewriting business logic.

## 2. Data Ownership Matrix

| Feature | PostgreSQL (operational) | Drive (user-owned) | Metadata/Index | Cache/Temp |
|---|---|---|---|---|
| **Bookmarks** | `Bookmark` (userId, questionId) — query by user | `bookmarks_v1.json` envelope `{bookmarks: number[]}` | `StorageFile(path, checksum, version)` | `SyncJob` pending |
| **Flashcard State** | `FlashcardUserState` (per-user SM-2) — SRS scheduling | `flashcard_state_v1.json` | same | same |
| **Vocab Progress** | `VocabProgress` | `vocab_progress_v1.json` | same | same |
| **Mistake Notes** | `UserQuestionProgress` (isMistake, counters) | `mistake_notes_v1.json` | same | same |
| **User Prefs** | `User` (handle, examTarget) minimal | `user_preferences_v1.json` | same | same |
| **Exam Attempts** | `ExamAttempt` + `MockTestResult` (scoring/history index — minimum) | `exam_archive_v1.json` (detailed portable archive) | `StorageFile` + `SyncJob` | — |
| **Questions, Exams, Flashcards (catalog)** | Always PostgreSQL (shared, not user-owned) | Never | — | QueryCache (2m) |

Rule: Do not migrate merely because user-related. Operational history stays in PG for queries; Drive gets portable archive.

## 3. Prisma Models (new)

`database/prisma/schema.prisma:1226`

- `StorageConnection` — `userId @unique`, `provider GOOGLE_DRIVE`, `status CONNECTED|EXPIRED|REVOKED|ERROR`, `accessTokenEnc @db.Text` (AES-256-GCM), `refreshTokenEnc`, `tokenExpiresAt`, `googleAccountId/email/name`, `scope`, `rootFolderId/Name="9Th-Grade AI"`, `lastSyncAt/SuccessAt`, indexes `[provider,status]`
- `StorageFile` — `userId, connectionId, entityType SyncEntityType, driveFileId, path "/9Th-Grade AI/<entity>_v1.json" @unique[userId,path], schemaVersion, version, checksum, mimeType, sizeBytes, lastSyncedAt/VerifiedAt`
- `SyncJob` (outbox) — `userId, connectionId?, entityType, operation UPSERT, idempotencyKey @unique, payloadHash, status PENDING|PROCESSING|SUCCEEDED|FAILED|DEAD_LETTER, attempts, maxAttempts 5, nextRetryAt, lastError/Code, driveFileId, resultChecksum, processingLock, lockedAt`, indexes `[userId,status,nextRetryAt]`
- `StorageRevision` — `userId, entityType, version, checksum, driveFileId, path`, `@@unique[userId,entityType,version]`
- `User` extended with `storageConnection, storageFiles, syncJobs, storageRevisions`

## 4. Services / Workers

- `backend/services/storage/encryption.ts` — AES-256-GCM `encryptToken/decryptToken` versioned `v1:iv:tag:ciphertext`, key `GOOGLE_OAUTH_ENCRYPTION_KEY` (prod requires dedicated, no fallback to `AUTH_SECRET`), `CURRENT_KEY_VERSION=1`, `validateEncryptionConfig()` fail-fast, `reencryptIfNeeded` for rotation, `hashForLog` (no token logging)
- `backend/services/storage/connection.ts` — `DRIVE_SCOPES = drive.file + userinfo.email/profile` (least-privilege, app folder `/9Th-Grade AI/` via `drive.file`), `generatePKCE()` (S256), `buildAuthUrl(state, codeChallenge)`, `exchangeCode(code, codeVerifier)` with PKCE, `refreshAccessToken`, `fetchGoogleProfile`, `getValidAccessToken` (decrypt, refresh if <60s, mark EXPIRED/REVOKED), `saveConnection` (upsert, encrypt), `validateOAuthConfig()` (prod requires `GOOGLE_CLIENT_ID/SECRET/ENCRYPTION_KEY/NEXT_PUBLIC_APP_URL`)
- `backend/services/storage/googleDriveProvider.ts` — `GoogleDriveProvider` implements `StorageProvider`: `ensureRootFolder`, `findFile`, `uploadJson` (multipart, 10MB limit, checksum), `downloadJson` (JSON validate), `verifyFile`, handles `401 TOKEN_EXPIRED`, `429 QUOTA_EXCEEDED`, `drive_*` errors
- `backend/services/storage/dataFormat.ts` — `CURRENT_SCHEMA_VERSION=1`, `canonicalStringify`, `computeChecksum (sha256)`, `createEnvelope<T>`, `verifyEnvelope`, `migrateEnvelope`, normalizers (`normalizeBookmarks` etc.) — never raw Prisma
- `backend/services/storage/syncService.ts` — `enqueueSync` (idempotencyKey = sha256(user|entity|payload|time|rand)), `buildEntityPayload` (normalized, deterministic, 10MB limit, Bangla/English/math symbols safe), `processOneJob` (atomic `UPDATE ... WHERE (processingLock IS NULL OR lockedAt < now-60s)` claim, idempotent, `payloadHash` vs `checksum` separation, bounded `limit 5`, `lockedAt` reclaim, no unbounded loop, `createEnvelope` + `verifyEnvelope` + `upload` + `verifyFile`, transaction, dead-letter after 5, handles 401/403/404/409/429/5xx/timeout with backoff `2^attempt+jitter` + quota 60s*attempt, `isAuth` → `EXPIRED/REVOKED` no storm), `processPendingJobs(limit=5)` (finite batch, persist, exit)
- `backend/services/storage/restoreService.ts` — Drive→PG pipeline: `download` → ownership `userId/path` validate → JSON parse → `envelope` field check → `checksum` `computeChecksum` → `migrateEnvelope` (future v1→v2) → `verifyEnvelope` → version compare (`driveVersion < pgVersion` → `conflict` 409, no silent overwrite) → transactional `bookmark`/`prefs` update + `StorageFile` + `StorageRevision` audit → `success`/`conflict`/`no_file`/`error` (malformed, unsupported schema, corrupted, deleted/moved, stale, duplicate, partial → rollback)
- `backend/services/storage/googleDriveProvider.ts` — 30s timeout `AbortController`, maps `401 TOKEN_EXPIRED`, `403 DRIVE_403`, `404 DRIVE_404`, `409 DRIVE_409`, `429 QUOTA_EXCEEDED`, `5xx DRIVE_5xx`, `TIMEOUT`, `NETWORK_ERROR`, validates JSON, 10MB limit, checksum
- `backend/services/storage/observability.ts` — `logEvent` JSON, `logOAuthSuccess/Failure`, `logSyncSuccess/Failure` (existing pino if present, never tokens)

## 5. APIs

All under `/api/storage/*`, `getUserIdFromRequest` + `assertSameOrigin` + `assertSubmitAllowed` + `validate*` + `toHttpResponse` + `X-Request-Id`:

- `GET /api/storage/google/connect` — 302 to Google, state 24B base64url + PKCE `code_challenge S256`, `storage_oauth_state` + `storage_oauth_user` + `storage_oauth_verifier` HttpOnly SameSite Lax 600s (secure in prod)
- `GET /api/storage/google/callback` — verify state/CSRF + user binding + PKCE verifier, handle `error=access_denied` (OAuth denial), exchange with `code_verifier`, profile, `saveConnection`, enqueue initial migration (`BOOKMARKS,FLASHCARD_STATE,VOCAB_PROGRESS,USER_PREFERENCES`), clear cookies, redirect `?storage=connected` or `?storage_error`
- `GET /api/storage/status` — `connected, status, googleEmail/name, rootFolder, lastSync*, pending/failed count, files[]` (metadata only, never tokens)
- `POST /api/storage/disconnect` — delete `StorageConnection` (PG preserved, Drive files NOT deleted), mark pending `DEAD_LETTER`, UI explains semantics
- `GET /api/storage/sync` — list last 10 jobs
- `POST /api/storage/sync` — `enqueueSync` for `entityType` or `all`, then fire-and-forget `processPendingJobs(3)` (never blocks), rate-limited, idempotent
- `POST /api/storage/worker` — cron `*/5 * * * *` via `vercel.json`, Bearer `CRON_SECRET` or `x-vercel-cron:1`, `processPendingJobs(10)`, bounded, `vercel.json` cron
- `POST /api/storage/restore` — Drive→PG: `entityType` or `all`, ownership/file identity, JSON/schema, checksum, migration, version compare → `success`/`conflict` (409) / `no_file` (404) / `error` (400), transactional, audit `StorageRevision`, never blind import
- `GET /api/storage/export` / `POST /api/storage/import` — manual envelope export (attachment) / import validation (checksum, schema, user isolation, no auto-apply)

Never expose secrets/tokens to browser, never log credentials.

## 6. Frontend

`frontend/components/dashboard/DataStorageCard.tsx:1` rendered in `frontend/components/dashboard/SettingsTab.tsx:493` → Settings → Data & Storage:

- `Connected / Not Connected` + `Google account` + `Storage location /9Th-Grade AI/` + `Last successful sync` + `Pending changes / Syncing / Failed` (poll 10s when pending)
- `Connect Google Drive` (`#4285F4`), `Reconnect`, `Disconnect`, `Sync now`, `Export`, `Restore`
- Bilingual `t(lang, ...)` and disclaimer: *Your personal study data is stored in your connected cloud storage and accessed only with your authorization.*
- No fabricated stats — shows real `pendingJobs`, `failedJobs`, `files[].version`

## 7. Sync Lifecycle

1. User bookmarks → `POST /api/bookmarks` → PG `Bookmark` + `enqueueSync(BOOKMARKS)` → 200
2. Worker `processPendingJobs` claims `PENDING` where `nextRetryAt <= now` (or cron)
3. `getValidAccessToken` (refresh if needed)
4. `ensureRootFolder`
5. `buildEntityPayload` + `createEnvelope` + `verifyEnvelope`
6. `uploadJson` + checksum + `verifyFile`
7. Transaction: `StorageFile` + `StorageRevision` + `SyncJob SUCCEEDED` + `Connection lastSyncSuccessAt`
8. On 401 → mark `EXPIRED`, client shows `Reconnect`; on 429/5xx → `FAILED` + backoff; after 5 → `DEAD_LETTER`

Idempotency: `idempotencyKey` @unique, `sourceKey` per file, `processingLock` prevents duplicate processing.

## 8. Migration

Existing PG `Bookmark` etc. → on connect, `enqueueSync` for each `SyncEntityType` → worker builds normalized envelope from current PG state → upload → checksum/verify → `StorageRevision` → mark complete. No PG deletion before verification. Resumable (re-enqueue), idempotent (same payload → same checksum, upsert), observable (`SyncJob` status), rollback-safe (PG remains source of truth, Drive is replica).

## 9. Failure / Recovery

- OAuth denial → redirect `?storage_error`
- Token expired → `getValidAccessToken` refresh, else `EXPIRED` + `Reconnect` UI
- Revocation → `TOKEN_EXPIRED`/`REVOKED` → no retry storm, user must reconnect
- Drive outage/quota/timeout/partial upload/duplicate job/concurrent mod → `FAILED` + exponential backoff + jitter, bounded concurrency, idempotency, `DEAD_LETTER` after 5, UI shows `Failed` + retry
- User deletes/moves file → `findFile` returns null → next sync recreates (upload as new), `verifyFile` fails → retry
- Corrupted data → `downloadJson` JSON validate + checksum mismatch → error, not imported
- Worker crash/DB failure/deployment interruption → jobs stay `PENDING`/`PROCESSING` (lock expires 60s) → next worker picks up

No silent loss: every user update is a durable `SyncJob` until `SUCCEEDED` + verified.

## 10. Security

- Least privilege `drive.file` (app folder only, not entire Drive)
- AES-256-GCM at rest (`accessTokenEnc`/`refreshTokenEnc`), server-only (`server-only`), never to browser, never in logs (`hashForLog` only)
- State/CSRF: 24B random + HttpOnly `storage_oauth_state` + `storage_oauth_user` binding + SameSite Lax
- `getUserIdFromRequest` + user isolation (`where: {userId}` everywhere), safe file naming `/9Th-Grade AI/<entity>_v1.json`, MIME `application/json`, 10MB limit, JSON validate on download, no raw Prisma exposure

## 11. Scalability

- No in-memory sync state, no single-process worker, no local FS, no process-local locks — all in `SyncJob` + `StorageFile` (PostgreSQL, shared)
- `processingLock` + `nextRetryAt` provides distributed lock, bounded concurrency `limit 5/10`, jitter prevents thundering herd
- Serverless: `processPendingJobs` is short (<10 jobs), no long-lived process; cron via `POST /api/storage/worker` (Vercel Cron)

## 12. Environment Variables

```
DATABASE_URL=postgresql://...
DIRECT_DATABASE_URL=postgresql://... (for db push)
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=https://your-app.com/api/storage/google/callback
GOOGLE_AUTH_REDIRECT_URI=https://your-app.com/api/auth/google/callback
GOOGLE_OAUTH_ENCRYPTION_KEY= # 32+ random hex, or falls back to AUTH_SECRET
AUTH_SECRET= # also used for session JWT
NEXT_PUBLIC_APP_URL=https://your-app.com
CRON_SECRET= # for /api/storage/worker Bearer
REDIS_URL= # optional for QueryCache
```

### Google sign-in redirect URIs (fixes `Error 400: redirect_uri_mismatch`)

Google accepts ONLY byte-identical pre-registered redirect URIs. In the
Google Cloud Console OAuth client, under **Authorized redirect URIs**,
register exactly these two (no trailing slashes):

```
https://your-app.com/api/auth/google/callback       ← user sign-in
https://your-app.com/api/storage/google/callback    ← Drive storage (BYOS)
http://localhost:3000/api/auth/google/callback      ← local dev sign-in
http://localhost:3000/api/storage/google/callback   ← local dev storage
```

Env rules (enforced in `backend/auth/google.ts`, fail-fast with a clear
server log — Google itself only shows the generic mismatch page):

- `GOOGLE_AUTH_REDIRECT_URI` is the sign-in callback. Set it in production.
- Otherwise sign-in uses the **request origin** (the host demonstrably
  serving traffic) — `NEXT_PUBLIC_APP_URL` is never used for sign-in, only
  drift-checked: if it disagrees with the serving origin you get a
  `[google-oauth]` server-log warning naming both values. A bad app URL can
  therefore never bounce production users to a dead host
  (`404 DEPLOYMENT_NOT_FOUND`).
- `GOOGLE_REDIRECT_URI` belongs to the **storage** flow only. A legacy
  `GOOGLE_REDIRECT_URI` pointing at `/api/auth/google/callback` is still
  honored; one pointing at the storage path is ignored for sign-in.
- Only Vercel **preview** deployments (`VERCEL_ENV=preview`, whose URLs
  Google forbids registering) bounce to the canonical host
  (`GOOGLE_AUTH_REDIRECT_URI` → `VERCEL_PROJECT_PRODUCTION_URL` →
  `NEXT_PUBLIC_APP_URL`) before the flow starts, keeping cookie + callback
  on one origin.

## 13. Tests

- Existing 852 passed (94 files) after fix (`tests/ExamLibraryView.test.tsx` updated to expect `ecosystem:"BCS"`, `tests/SettingsTab.test.tsx` mocked `DataStorageCard`)
- New: manual verification — `prisma validate`, `prisma generate`, `db push` created 4 new tables, `typecheck` 0 errors, `build` success, `lint` 0 errors, `processPendingJobs` handles 401/429/duplicate, `enqueueSync` idempotent

## 14. Risks / Decisions

- `drive.file` limits to app-created files; if user expects to see files elsewhere, they must be in `/9Th-Grade AI/` — justified for least privilege
- `GOOGLE_OAUTH_ENCRYPTION_KEY` must be 32+ hex and never rotated without re-encryption — document rotation procedure
- Large datasets (1000+ vocab) fit 10MB JSON; beyond, need chunking — not yet needed
- `heal-source-keys` dedupes Questions by `subjectId+question` — BYOS `sourceKey` includes `questionNumber` to allow same text across years (2019 80 vs 77)
- Remaining: E2E Playwright for full `Connect → sync → reload → modify → reconnect → restore` not yet automated — manual tested
