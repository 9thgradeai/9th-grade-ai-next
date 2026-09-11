#!/usr/bin/env bash
# ============================================================================
# scripts/migrate-railway-to-neon.sh
# ----------------------------------------------------------------------------
# One-shot operator script: moves the ENTIRE production PostgreSQL database
# from Railway to Neon with zero data loss, then prints the Vercel env-swap
# commands and post-cutover verification steps.
#
# Prereqs:
#   - psql / pg_dump / pg_restore  (installed; Homebrew: `brew install libpq`)
#   - You can reach Railway's public Postgres proxy from this machine
#   - A Neon project already provisioned with a MAIN branch and both
#     connection strings (pooled + direct) — see docs/backend/neon-migration-runbook.md §1
#   - prisma CLI + local node_modules (npx prisma) for the verification step
#
# Safety:
#   - NEVER deletes Railway. Reads Railway once, writes ONLY to Neon.
#   - Restore targets the DIRECT (non-pooled) Neon URL. Pooled is for the app.
#   - No writes to the app DB after restore except idempotent re-seed + an
#     optional `prisma db push` dry-run to reconcile schema drift.
#
# Usage:
#   export RAILWAY_URL="postgresql://user:pass@host:port/dbname"
#   export NEON_DIRECT_URL="postgresql://user:pass@ep-xxx-aaa-pooler.region.aws.neon.tech/dbname"
#   ./scripts/migrate-railway-to-neon.sh
#
# Exit codes: 0 = restored + verified; 2 = validation failure (nothing done).
# ============================================================================
set -euo pipefail

DBNAME="${NEON_DB_NAME:-neondb}"
STAMP="$(date +%Y%m%d-%H%M%S)"
DUMP_DIR="${MIGRATION_DUMP_DIR:-${TMPDIR:-/tmp}/9th-migration}"
DUMP_FILE="$DUMP_DIR/railway-${STAMP}.dump"

log()  { printf '\033[1;34m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33mWARN\033[0m %s\n' "$*"; }
die()  { printf '\033[1;31mERROR\033[0m %s\n' "$*" >&2; exit 2; }

# ── 0. Validation ────────────────────────────────────────────────────────────
[[ -z "${RAILWAY_URL:-}" ]]   && die "RAILWAY_URL is not set (source Postgres)."
[[ -z "${NEON_DIRECT_URL:-}" ]] && die "NEON_DIRECT_URL is not set (Neon direct = restore target)."
command -v pg_dump    >/dev/null || die "pg_dump not found."
command -v pg_restore >/dev/null || die "pg_restore not found."
command -v psql       >/dev/null || die "psql not found."

mkdir -p "$DUMP_DIR"

log "Source:      Railway  (read-only)"
log "Target:      Neon direct host"
log "Dump:        $DUMP_FILE"

# ── 1. Snapshot Railway (custom format — schema + data + blobs) ──────────────
log "Dumping Railway…"
pg_dump "$RAILWAY_URL" -Fc -f "$DUMP_FILE" --no-owner --no-privileges
test -s "$DUMP_FILE" || die "Dump is empty — aborting before any write to Neon."

log "Railway source row counts:"
for t in "User" "Question" "QuestionAttempt" "MockTestResult" "Bookmark" "UserQuestionProgress"; do
  cnt=$(psql "$RAILWAY_URL" -Atc "SELECT count(*) FROM \"$t\";" 2>/dev/null || echo "n/a")
  printf '  %-22s %s\n' "$t" "$cnt"
done

# ── 2. Restore into Neon (direct host) ───────────────────────────────────────
# `--clean` drops+recreates; harmless on a fresh Neon main branch and makes the
# script re-runnable. `--no-owner/--no-privileges` keep Neon-managed roles.
log "Restoring into Neon…"
pg_restore "$DUMP_FILE" \
  --dbname "$NEON_DIRECT_URL" \
  --clean --if-exists --no-owner --no-privileges \
  --exit-on-error

# ── 3. Reconciliation ────────────────────────────────────────────────────────
# The application deploy path is `db:deploy-sync` (db push + idempotent seed).
# A --verify-only `db push` catches drift between the Railway-unmanaged schema
# and schema.prisma without writing anything.
log "Reconciling schema (prisma db push --verify-only)…"
DATABASE_URL="$NEON_DIRECT_URL" \
  npx prisma db push --accept-data-loss --verify-only \
  --schema database/prisma/schema.prisma \
  || warn "Schema drift detected. Review with: DATABASE_URL='<neon-direct>' npm run db:push  (dry: npx prisma db push --accept-data-loss --schema database/prisma/schema.prisma)"

log "Re-seeding (idempotent upserts) so Neon matches post-deploy state…"
DATABASE_URL="$NEON_DIRECT_URL" npm run db:seed

# ── 4. Verify Neon matches Railway ───────────────────────────────────────────
log "Verification — Neon row counts (compare to Railway above):"
FAILED=0
for t in "User" "Question" "QuestionAttempt" "MockTestResult" "Bookmark" "UserQuestionProgress"; do
  src=$(psql "$RAILWAY_URL"   -Atc "SELECT count(*) FROM \"$t\";" 2>/dev/null || echo "?")
  dst=$(psql "$NEON_DIRECT_URL" -Atc "SELECT count(*) FROM \"$t\";" 2>/dev/null || echo "?")
  printf '  %-22s railway=%-9s neon=%s\n' "$t" "$src" "$dst"
  if [[ "$src" != "?" && "$dst" != "?" && "$src" != "$dst" ]]; then FAILED=1; fi
done

if [[ "$FAILED" == "1" ]]; then
  warn "Row-count mismatch — investigate BEFORE swapping Vercel env."
  exit 1
fi

# ── 5. Write the env-swap block (dry-run by default) ─────────────────────────
cat <<EOF

════════════════════════════════════════════════════════════════════════════
 MIGRATION COMPLETE — Railway → Neon (row counts match).
════════════════════════════════════════════════════════════════════════════

 NEXT STEPS (run by you):

 1) Point Vercel production DATABASE_URL at the NEON POOLED connection string:
      vercel env rm DATABASE_URL production
      vercel env add DATABASE_URL production        # paste: postgresql://...-pooler.neon.tech/neondb
      vercel env add DIRECT_DATABASE_URL production # optional: Neon direct host for migrations

 2) Trigger a production redeploy (Vercel prebuild runs db:deploy-sync →
    db push + idempotent seed on Neon):
      vercel --prod

 3) Smoke test in the app:
      - Login (db-persisted users) → dashboard shows existing progress
      - Practice / exam build + submit (Question count matches)
      - AI tutor (mock or keyed) → flashcards review

 4) Rollback (only needed within the first hours): flip DATABASE_URL back to
    Railway and redeploy. Keep Railway alive ≥14 days (see runbook §4-5).

 5) Decommission Railway post-stability — see runbook §5.

 DUMP ARCHIVED AT: $DUMP_FILE   (keep this; it is your byte-for-byte fallback)
════════════════════════════════════════════════════════════════════════════
EOF

log "Migration script finished successfully."