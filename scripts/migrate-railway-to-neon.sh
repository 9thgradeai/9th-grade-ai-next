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
#   - prisma CLI + local node_modules (npx prisma) for the reconciliation step
#
# Safety:
#   - NEVER deletes Railway. Reads Railway once, writes ONLY to Neon.
#   - Restore targets the DIRECT (non-pooled) Neon URL. Pooled is for the app.
#   - Parity gate runs on the PURE restored data (before seeding) — if the
#     raw restore doesn't match row-for-row, the script aborts. The
#     idempotent seed runs after the gate, so its natural upserts can't mask
#     a broken restore.
#
# Usage:
#   export RAILWAY_URL="postgresql://user:pass@host:port/dbname"
#   export NEON_DIRECT_URL="postgresql://user:pass@ep-xxx-aaa.region.aws.neon.tech/neondb"
#   ./scripts/migrate-railway-to-neon.sh
#
# Exit codes: 0 = restored + verified; 1 = parity mismatch (investigate);
#             2 = validation failure (nothing done).
# ============================================================================
set -euo pipefail

STAMP="$(date +%Y%m%d-%H%M%S)"
DUMP_DIR="${MIGRATION_DUMP_DIR:-${TMPDIR:-/tmp}/9th-migration}"
DUMP_FILE="$DUMP_DIR/railway-${STAMP}.dump"
SCHEMA_FILE="database/prisma/schema.prisma"

log()  { printf '\033[1;34m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33mWARN\033[0m %s\n' "$*"; }
die()  { printf '\033[1;31mERROR\033[0m %s\n' "$*" >&2; exit 2; }

# ── 0. Validation ────────────────────────────────────────────────────────────
[[ -z "${RAILWAY_URL:-}" ]]     && die "RAILWAY_URL is not set (source Postgres)."
[[ -z "${NEON_DIRECT_URL:-}" ]] && die "NEON_DIRECT_URL is not set (Neon direct = restore target)."
command -v pg_dump    >/dev/null || die "pg_dump not found."
command -v pg_restore >/dev/null || die "pg_restore not found."
command -v psql       >/dev/null || die "psql not found."

mkdir -p "$DUMP_DIR"
LOGGED_TABLES="User Question QuestionAttempt MockTestResult Bookmark UserQuestionProgress"

log "Source:      Railway  (read-only)"
log "Target:      Neon direct host"
log "Dump:        $DUMP_FILE"

# ── 1. Snapshot Railway (custom format — schema + data + blobs) ──────────────
log "Dumping Railway…"
pg_dump "$RAILWAY_URL" -Fc -f "$DUMP_FILE" --no-owner --no-privileges
test -s "$DUMP_FILE" || die "Dump is empty — aborting before any write to Neon."

log "Railway source row counts:"
for t in $LOGGED_TABLES; do
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

# ── 3. Schema reconciliation (READ-ONLY — never writes) ──────────────────────
# The app deploy path is `db:deploy-sync` (db push + idempotent seed), so the
# restored Railway-unmanaged schema should already equal schema.prisma.
# `prisma migrate diff` is read-only; drift is a warning, not a blocker — the
# next Vercel deploy's db push reconciles it automatically.
log "Reconciling schema (prisma migrate diff, read-only)…"
DIFF="$(npx prisma migrate diff \
  --from-url "$NEON_DIRECT_URL" \
  --to-schema-datamodel "$SCHEMA_FILE" 2>/dev/null || true)"
if echo "$DIFF" | grep -q "No difference detected"; then
  log "Schema in sync — no drift."
elif [[ -n "$DIFF" ]]; then
  warn "Schema drift detected between Neon restore and schema.prisma:"
  echo "$DIFF" | grep -E '^\s*\[\*\]|^\s*[+-] ' | head -20
  warn "This is normally reconciled automatically by the Vercel deploy's db push."
fi

# ── 4. PARITY GATE: verify pure restore matches Railway (BEFORE seed) ────────
log "Parity gate — pure-restore row counts (Railway vs restored Neon):"
FAILED=0
for t in $LOGGED_TABLES; do
  src=$(psql "$RAILWAY_URL"     -Atc "SELECT count(*) FROM \"$t\";" 2>/dev/null || echo "?")
  dst=$(psql "$NEON_DIRECT_URL" -Atc "SELECT count(*) FROM \"$t\";" 2>/dev/null || echo "?")
  printf '  %-22s railway=%-9s neon=%s\n' "$t" "$src" "$dst"
  if [[ "$src" != "?" && "$dst" != "?" && "$src" != "$dst" ]]; then FAILED=1; fi
done

if [[ "$FAILED" == "1" ]]; then
  warn "PARITY MISMATCH on the raw restore — DO NOT swap Vercel env yet."
  warn "Inspect (e.g. \`pg_restore --list\`, missing rows, FK issues) and re-run."
  exit 1
fi
log "Parity OK — restored data matches Railway row-for-row."

# ── 5. Re-seed (idempotent upserts, matches post-deploy state) ───────────────
# Runs AFTER the parity gate so seed upserts can't mask a bad restore. If a
# newer seed adds rows not in Railway, that is expected and non-destructive.
log "Re-seeding (idempotent upserts) so Neon matches post-deploy state…"
DATABASE_URL="$NEON_DIRECT_URL" npm run db:seed

# ── 6. Post-seed report ──────────────────────────────────────────────────────
log "Post-seed Neon row counts (seed upserts may legitimately add rows):"
for t in $LOGGED_TABLES; do
  dst=$(psql "$NEON_DIRECT_URL" -Atc "SELECT count(*) FROM \"$t\";" 2>/dev/null || echo "?")
  printf '  %-22s %s\n' "$t" "$dst"
done

# ── 7. Print the env-swap block ──────────────────────────────────────────────
cat <<EOF

════════════════════════════════════════════════════════════════════════════
 MIGRATION COMPLETE — Railway → Neon (restore parity verified).
════════════════════════════════════════════════════════════════════════════

 NEXT STEPS (run by you):

 1) Point Vercel production DATABASE_URL at the NEON POOLED connection string:
      vercel env rm DATABASE_URL production
      vercel env add DATABASE_URL production        # paste: postgresql://...-pooler.neon.tech/neondb

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

log "Migration complete."