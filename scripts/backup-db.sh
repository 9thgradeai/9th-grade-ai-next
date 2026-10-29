#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# scripts/backup-db.sh — logical PostgreSQL backup (nightly, operator-run)
#
# Produces a compressed custom-format dump that `pg_restore` can restore
# selectively. This is the SECOND line of defence: Neon keeps continuous WAL
# history, so point-in-time restore (PITR) is the PRIMARY recovery path. See
# docs/RUNBOOK.md § Backup & Recovery.
#
# Usage:
#   npm run db:backup                      # uses DIRECT_DATABASE_URL || DATABASE_URL
#   BACKUP_DIR=/mnt/private/db npm run db:backup
#   BACKUP_RETENTION_DAYS=30 npm run db:backup
#
# Restore (to a scratch database first — NEVER straight onto production):
#   pg_restore --dbname="$DIRECT_DATABASE_URL" --no-owner --clean --if-exists \
#     backups/db/9thgradeai-<timestamp>.dump
#
# ⚠️  A dump contains password hashes, emails and user content. Treat it as a
#     secret: keep it on private storage, never commit it, and never upload it
#     as a GitHub Actions artifact (this repository is PUBLIC — artifacts are
#     downloadable by anyone with a GitHub account).
# ---------------------------------------------------------------------------

set -euo pipefail

DB_URL="${DIRECT_DATABASE_URL:-${DATABASE_URL:-}}"

# Convenience: when run from the repo root without exported env vars, read the
# two connection strings from .env.local WITHOUT sourcing it (no code execution,
# no shell-parse surprises). Real deployments should export the env themselves.
if [[ -z "${DB_URL}" ]]; then
  ENV_FILE="${BACKUP_ENV_FILE:-.env.local}"
  if [[ -f "${ENV_FILE}" ]]; then
    read_env_var() {
      local key="$1" line
      line="$(grep -E "^[[:space:]]*${key}=" "${ENV_FILE}" | tail -n 1 || true)"
      [[ -z "${line}" ]] && return 0
      printf '%s' "${line#*=}" | sed -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'$//"
    }
    DB_URL="$(read_env_var DIRECT_DATABASE_URL)"
    [[ -z "${DB_URL}" ]] && DB_URL="$(read_env_var DATABASE_URL)"
  fi
fi

if [[ -z "${DB_URL}" ]]; then
  echo "ERROR: DIRECT_DATABASE_URL or DATABASE_URL must be set." >&2
  exit 1
fi

if ! command -v pg_dump >/dev/null 2>&1; then
  echo "ERROR: pg_dump not found. Install the PostgreSQL client tools." >&2
  exit 1
fi

BACKUP_DIR="${BACKUP_DIR:-$(pwd)/backups/db}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"

if ! [[ "${RETENTION_DAYS}" =~ ^[0-9]+$ ]] || [[ "${RETENTION_DAYS}" -lt 1 ]]; then
  echo "ERROR: BACKUP_RETENTION_DAYS must be a positive integer." >&2
  exit 1
fi

mkdir -p "${BACKUP_DIR}"
# Dumps are sensitive: owner-only directory and files.
chmod 700 "${BACKUP_DIR}" 2>/dev/null || true

TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT="${BACKUP_DIR}/9thgradeai-${TIMESTAMP}.dump"

if [[ -e "${OUT}" ]]; then
  echo "ERROR: ${OUT} already exists; refusing to overwrite." >&2
  exit 1
fi

# -Fc  custom format: compressed + restorable table-by-table with pg_restore
# --no-owner/--no-privileges: portable across roles (Neon reassigns owners)
# --no-password: never prompt / hang in a cron or CI context
# The URL is passed as an argv value, never echoed in this script's output.
pg_dump \
  --dbname="${DB_URL}" \
  --format=custom \
  --no-owner \
  --no-privileges \
  --no-password \
  --file="${OUT}"

chmod 600 "${OUT}"

# Integrity sidecar so a truncated/corrupt copy is detectable before restore.
if command -v shasum >/dev/null 2>&1; then
  shasum -a 256 "${OUT}" > "${OUT}.sha256"
  chmod 600 "${OUT}.sha256"
fi

BYTES="$(wc -c < "${OUT}" | tr -d ' ')"
echo "Backup written: ${OUT} (${BYTES} bytes)"

# Prune old dumps (and their checksum sidecars). Only files this script
# created are matched — never a blanket directory wipe.
if find "${BACKUP_DIR}" -type f -name '9thgradeai-*.dump*' -mtime "+${RETENTION_DAYS}" -print -delete | grep -q .; then
  echo "Pruned backups older than ${RETENTION_DAYS} days."
fi
