#!/usr/bin/env bash
# scripts/secret-scan.sh — full secret scan of tracked files + git history.
#
# Usage:  npm run secret-scan
# Scans everything git has ever committed (all refs) using the project
# .gitleaks.toml (vendored gitleaks default rules + project allowlist) and
# .gitleaksignore (documented false positives).
#
# This is the same scan CI runs. It intentionally scans GIT CONTENT only —
# local, untracked files such as .env.local are never read, so it is safe
# to run on a machine that holds live credentials.
# For an on-disk sweep (flags .env* files too):  gitleaks dir .

set -euo pipefail

if ! command -v gitleaks >/dev/null 2>&1; then
  echo "secret-scan: gitleaks is not installed." >&2
  echo "  macOS:   brew install gitleaks" >&2
  echo "  others:  https://github.com/gitleaks/gitleaks#installation" >&2
  exit 2
fi

cd "$(dirname "$0")/.."

echo "secret-scan: gitleaks $(gitleaks version 2>/dev/null || true)"
echo "secret-scan: scanning tracked files + git history (--redact, secrets never printed)..."
exec gitleaks git . --no-banner --redact
