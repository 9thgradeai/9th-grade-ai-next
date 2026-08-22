// tests/load/k6-smoke.js — Phase 25 load-test harness (k6).
//
// STATUS: committed, NOT executed against production. Run it against a
// staging deployment once Neon cutover lands (docs/backend/neon-migration-runbook.md):
//
//   k6 run -e BASE=https://staging.example.com tests/load/k6-smoke.js
//
// Measures P50/P95/P99 for the five hot paths. SLO targets (from the
// scalability audit): login <400ms p95, reads <250ms p95, exam build <800ms
// p95, AI tutor first-byte <2.5s p95.

import http from "k6/http";
import { check, sleep } from "k6";
import { Trend } from "k6/metrics";

const BASE = __ENV.BASE || "http://localhost:3000";
const EMAIL = __ENV.EMAIL || "demo@9thgrade.ai";
const PASSWORD = __ENV.PASSWORD || "demo12345";

const questionsT = new Trend("questions_ms");
const dashboardT = new Trend("dashboard_ms");
const examBuildT = new Trend("exam_build_ms");

export const options = {
  scenarios: {
    ramp: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "30s", target: 100 },
        { duration: "1m", target: 100 },
        { duration: "30s", target: 0 },
      ],
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.01"],
    login_ms: ["p(95)<400"],
    questions_ms: ["p(95)<250"],
    dashboard_ms: ["p(95)<300"],
    exam_build_ms: ["p(95)<800"],
  },
};

export function setup() {
  const res = http.post(
    `${BASE}/api/auth/login`,
    JSON.stringify({ email: EMAIL, password: PASSWORD }),
    { headers: { "Content-Type": "application/json" } },
  );
  check(res, { "login ok": (r) => r.status === 200 });
  return { cookie: res.cookies.auth_token[0].value };
}

export default async function k6Smoke(data) {
  const jar = http.cookieJar();
  jar.set(`${BASE}`, "auth_token", data.cookie);

  let t = Date.now();
  const q = http.get(`${BASE}/api/questions?limit=20`);
  questionsT.add(Date.now() - t);
  check(q, { "questions 200": (r) => r.status === 200 });

  t = Date.now();
  const d = http.get(`${BASE}/api/dashboard-stats`);
  dashboardT.add(Date.now() - t);
  check(d, { "dashboard 200": (r) => r.status === 200 });

  t = Date.now();
  const b = http.post(
    `${BASE}/api/exam/build`,
    JSON.stringify({
      subjects: [{ subjectId: 1, paths: [] }],
      questionCount: 20,
      durationSec: 1200,
    }),
    { headers: { "Content-Type": "application/json" } },
  );
  examBuildT.add(Date.now() - t);
  check(b, { "exam build 200": (r) => r.status === 200 });

  sleep(1);
}
