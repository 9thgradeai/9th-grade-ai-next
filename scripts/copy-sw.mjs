// scripts/copy-sw.mjs — copies the tracked SW source to the served path.
// public/sw.js is git-ignored (build artifact); Vercel only deploys tracked
// files, so the copy must happen during `npm run build`, before deploy.
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
mkdirSync(join(root, "public"), { recursive: true });
copyFileSync(join(root, "assets", "pwa", "sw.js"), join(root, "public", "sw.js"));
console.log("[copy-sw] assets/pwa/sw.js -> public/sw.js");
