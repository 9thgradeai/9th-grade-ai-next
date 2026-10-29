// @vitest-environment node
//
// Meta-test: every route under app/api/admin/** MUST call requireRole with the
// admin role before doing any work. This exists because an earlier debugging
// session committed `app/api/admin/diag/route.ts` — an unauthenticated endpoint
// in the admin namespace. The page-level gate in app/admin/layout.tsx cannot
// protect API routes; each handler has to authorize itself.
//
// Reading source is intentional: the point is to catch a *new* admin route that
// forgot the guard, which a behavioural test for existing routes cannot do.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, it, expect } from "vitest";

const ADMIN_API_ROOT = join(process.cwd(), "app", "api", "admin");

function findRouteFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...findRouteFiles(full));
    else if (entry === "route.ts") out.push(full);
  }
  return out;
}

describe("admin API authorization", () => {
  const routes = findRouteFiles(ADMIN_API_ROOT);

  it("finds the admin routes (guards against a broken test)", () => {
    expect(routes.length).toBeGreaterThan(0);
  });

  it("every admin route calls requireRole(..., [\"admin\"])", () => {
    const offenders = routes.filter((file) => {
      const src = readFileSync(file, "utf8");
      return !/requireRole\s*\(/.test(src) || !/\[\s*["']admin["']\s*\]/.test(src);
    });

    expect(
      offenders.map((f) => relative(process.cwd(), f)),
      "Admin API routes must call requireRole(request, [\"admin\"]):",
    ).toEqual([]);
  });
});
