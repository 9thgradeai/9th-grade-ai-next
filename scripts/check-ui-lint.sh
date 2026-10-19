#!/usr/bin/env bash
# UI lint ratchet (P0 guardrail, docs/DASHBOARD_UI_UX_FIX_PLAN.md Phase 0).
# Fails only on NEW violations vs scripts/ui-lint-baseline.txt, so the suite
# is green at every phase while the inventory burns down. Run with
# --update-baseline to shrink the baseline after fixing violations.
# Usage: npm run lint:ui [-- --update-baseline]
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SCAN="$ROOT/frontend/components/dashboard"
BASELINE="$ROOT/scripts/ui-lint-baseline.txt"
UPDATE=0
[ "${1:-}" = "--update-baseline" ] && UPDATE=1

tmp="$(mktemp)"
cur="$(mktemp)"
trap 'rm -f "$tmp" "$cur"' EXIT

# hit RULE FILE MATCH — line-number-free tuple so churn doesn't trip the gate.
hit() { printf '%s\t%s\t%s\n' "$1" "${2#"$ROOT"/}" "$(printf '%s' "$3" | tr '\t' ' ' | cut -c1-160)" >> "$tmp"; }

# 1. Text below the 11px --text-xs floor (8px forbidden outright, 9/10px grandfathered).
grep -rno 'text-\[8px\]' "$SCAN" --include='*.tsx' | while IFS=: read -r f _ m; do hit text-below-floor "$f" "$m"; done
grep -rno 'text-\[9px\]' "$SCAN" --include='*.tsx' | while IFS=: read -r f _ m; do hit text-below-floor "$f" "$m"; done
grep -rno 'text-\[10px\]' "$SCAN" --include='*.tsx' | while IFS=: read -r f _ m; do hit text-below-floor "$f" "$m"; done

# 2. Unprefixed responsive grid columns: 3+ columns with no breakpoint
#    escalation squeezes below ~100px at 320–400px. grid-cols-2 is exempt
#    (cells stay ≥140px at 320px).
grep -rn 'grid-cols-[3-9]' "$SCAN" --include='*.tsx' \
  | grep -vE '(sm|md|lg|xl|2xl):grid-cols' \
  | grep -E 'grid(-)? ?cols|className' \
  | while IFS= read -r line; do
      f="${line%%:*}"; m="${line#*:}"; hit grid-unprefixed "$f" "${m#*:}"
    done

# 3. Sticky elements anchored to bottom-0 inside the shell (hidden behind BottomNav).
#    Match the "sticky" class token only (not z-[var(--z-sticky)] on a fixed bar).
grep -rn 'className' "$SCAN" --include='*.tsx' | grep -E '(^|[ "])sticky([ "]|$)' | grep 'bottom-0' | while IFS= read -r line; do
  f="${line%%:*}"; m="${line#*:}"; hit sticky-bottom0 "$f" "${m#*:}"
done

# 4. Number inputs must declare inputMode (iOS zoom + wrong keyboard). File-level.
for f in $(grep -rl 'type="number"' "$SCAN" --include='*.tsx'); do
  grep -q 'inputMode' "$f" || hit number-input-no-inputmode "$f" 'type="number" without inputMode in file'
done

# 5. Cyrillic strings (broken t() source, e.g. "прогресс" as the Bengali variant).
grep -rn '[А-Яа-яЁё]' "$ROOT/frontend" "$ROOT/app" --include='*.ts' --include='*.tsx' \
  | while IFS= read -r line; do
      f="${line%%:*}"; m="${line#*:}"; hit cyrillic-string "$f" "${m#*:}"
    done

# 6. Fullwidth CJK punctuation leaking into bn/en copy.
grep -rn '[。！？（）：；]' "$SCAN" --include='*.tsx' \
  | while IFS= read -r line; do
      f="${line%%:*}"; m="${line#*:}"; hit fullwidth-punctuation "$f" "${m#*:}"
    done

# 7. <div>/<span> with onClick but no role on the same line (unreachable by keyboard).
grep -rnE '<(div|span)[^>]*onClick=' "$SCAN" --include='*.tsx' | grep -v 'role=' \
  | while IFS= read -r line; do
      f="${line%%:*}"; m="${line#*:}"; hit div-onclick "$f" "${m#*:}"
    done

sort -u "$tmp" -o "$cur"

if [ "$UPDATE" = "1" ]; then
  cp "$cur" "$BASELINE"
  echo "ui lint: baseline updated ($(wc -l < "$BASELINE" | tr -d ' ') entries)"
  exit 0
fi

if [ ! -f "$BASELINE" ]; then
  echo "ui lint: no baseline — $(wc -l < "$cur" | tr -d ' ') current violations."
  echo "Run: npm run lint:ui -- --update-baseline"
  cat "$cur"; exit 1
fi

new="$(comm -23 "$cur" <(sort -u "$BASELINE"))"
resolved="$(comm -13 "$cur" <(sort -u "$BASELINE"))"

if [ -n "$resolved" ]; then
  count="$(printf '%s\n' "$resolved" | wc -l | tr -d ' ')"
  echo "ui lint: $count baseline violation(s) FIXED — run 'npm run lint:ui -- --update-baseline' to shrink the baseline."
fi

if [ -n "$new" ]; then
  echo "ui lint: NEW violations (not in baseline):"
  printf '%s\n' "$new"
  exit 1
fi

echo "ui lint: clean (no regressions vs baseline)"
exit 0
