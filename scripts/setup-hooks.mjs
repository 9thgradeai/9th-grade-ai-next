// scripts/setup-hooks.mjs
// Points git at the repo-local hooks in .githooks/ so the pre-commit
// secret scan (gitleaks) runs automatically. Wired into `npm prepare`,
// so it runs on `npm install` / `npm ci` for every contributor.
//
// Never fails an install: any git error here exits 0 with a notice.

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";

try {
  if (!existsSync(".git")) process.exit(0); // tarball / CI checkout without repo metadata

  let current = "";
  try {
    current = execFileSync("git", ["config", "--local", "--get", "core.hooksPath"], {
      encoding: "utf8",
    }).trim();
  } catch {
    // unset — fine, we set it below
  }

  if (current === ".githooks") process.exit(0); // already configured
  if (current) {
    // Respect a contributor's own hooks path instead of overriding it.
    console.warn(
      `[hooks] core.hooksPath is "${current}" — not overriding with .githooks ` +
        `(pre-commit secret scan NOT enabled; run \`npm run secret-scan\` manually).`,
    );
    process.exit(0);
  }

  execFileSync("git", ["config", "--local", "core.hooksPath", ".githooks"]);
  console.log("[hooks] core.hooksPath -> .githooks (pre-commit secret scan enabled)");
} catch (err) {
  console.warn(`[hooks] could not configure core.hooksPath: ${err?.message ?? err}`);
}
