#!/usr/bin/env bash
# Design-token lint guard (Phase 3C) — keeps the dashboard on semantic tokens.
# Fails on patterns that bypass the token system. Run: npm run lint:tokens
# Exits 0 when clean, 1 with file:line hits otherwise.
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
FAIL=0
tmp="$(mktemp)"
trap 'rm -f "$tmp"' EXIT

hit() { echo "TOKEN-LINT $1" >> "$tmp"; }

# 1. Hardcoded hex colors in dashboard markup (tokens live in globals.css).
grep -rnE 'className="[^"]*#[0-9a-fA-F]{3,8}' "$ROOT/frontend/components/dashboard" \
  --include="*.tsx" | while read -r line; do hit "$line"; done

# 2. Removed glow utility must not return.
grep -rn "shadow-neon-glow" "$ROOT/frontend" "$ROOT/app" \
  --include="*.tsx" | while read -r line; do hit "$line"; done

# 3. Degenerate same-stop gradients (solid color paying gradient cost).
grep -rnE 'from-\[var\(--([a-z-]+)\)\] to-\[var\(--\1\)\]' "$ROOT/frontend/components/dashboard" \
  --include="*.tsx" | while read -r line; do hit "$line"; done

# 4. Raw palette gradient stops that bypass the theme remap.
grep -rn "to-emerald-500\|from-emerald-\|to-indigo-500\|from-indigo-" "$ROOT/frontend/components/dashboard" \
  --include="*.tsx" | while read -r line; do hit "$line"; done

# 5. The green-fork hue must stay dead (accent unification, Phase 3A).
#    Matches declarations only, so documenting comments don't trip the gate.
grep -rnE '\-\-[a-z-]+: *#(236342|7dbf92|2c6041|35754e|4a9663)\b' "$ROOT/frontend/styles" \
  --include="*.css" | while read -r line; do hit "$line"; done

# 6. Grey micro-labels duplicating .command-eyebrow — use the utility.
#    (Colored semantic labels and tracking-wider variants are intentional.)
grep -rnE 'text-\[10px\] font-mono (font-bold )?uppercase tracking-widest text-\[var\(--dashboard-text-muted\)\]' "$ROOT/frontend/components/dashboard" \
  --include="*.tsx" | while read -r line; do hit "$line"; done
grep -rnE 'text-\[10px\] font-mono uppercase tracking-widest mb-' "$ROOT/frontend/components/dashboard" \
  --include="*.tsx" | while read -r line; do hit "$line"; done

if [ ! -s "$tmp" ]; then echo "token lint: clean"; exit 0; fi
cat "$tmp"
exit 1
