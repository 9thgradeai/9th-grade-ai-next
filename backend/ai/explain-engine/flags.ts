// Server-side feature flag for the verified-explanation path.
//
// Default ON: the route is additive and the client falls back to the legacy
// explanation when it fails or is disabled. Set AI_EXPLAIN_V2_ENABLED=off to
// roll back without a deploy.

import "server-only";

const FALSEY = new Set(["0", "false", "off", "no", "disabled"]);

export function isExplainV2Enabled(): boolean {
  const raw = process.env.AI_EXPLAIN_V2_ENABLED;
  if (raw === undefined || raw === "") return true;
  return !FALSEY.has(raw.trim().toLowerCase());
}
