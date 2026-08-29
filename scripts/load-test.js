// scripts/load-test.js
// k6 load test for critical API endpoints
// Run with: npm run test:load (requires k6 installed)
// Install: brew install k6

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';

// Custom metrics
const errorRate = new Rate('errors');

// Test configuration
export const options = {
  stages: [
    { duration: '30s', target: 10 },   // Ramp up to 10 users
    { duration: '1m', target: 50 },    // Ramp up to 50 users
    { duration: '2m', target: 100 },   // Ramp up to 100 users (target)
    { duration: '1m', target: 100 },   // Stay at 100 users
    { duration: '30s', target: 0 },    // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<2000'], // 95th percentile < 2s
    http_req_failed: ['rate<0.01'],    // Error rate < 1%
    errors: ['rate<0.05'],             // Custom error rate < 5%
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

export default function () {
  // Simulate a user session
  const userSession = simulateUserSession();
  
  // Random think time between actions
  sleep(Math.random() * 2 + 1);
}

function simulateUserSession() {
  // 1. Health check (public endpoint)
  let res = http.get(`${BASE_URL}/api/health`);
  check(res, {
    'health check status 200': (r) => r.status === 200,
    'health check < 500ms': (r) => r.timings.duration < 500,
  }) || errorRate.add(1);

  // 2. Get exam config (public data)
  res = http.get(`${BASE_URL}/api/exam/config`);
  check(res, {
    'exam config status 200': (r) => r.status === 200,
    'exam config < 1000ms': (r) => r.timings.duration < 1000,
  }) || errorRate.add(1);

  // 3. Get questions (public data)
  res = http.get(`${BASE_URL}/api/questions?limit=20`);
  check(res, {
    'questions status 200': (r) => r.status === 200,
    'questions < 1500ms': (r) => r.timings.duration < 1500,
  }) || errorRate.add(1);

  // 4. Get flash news (public data)
  res = http.get(`${BASE_URL}/api/flash-news`);
  check(res, {
    'flash news status 200': (r) => r.status === 200,
  }) || errorRate.add(1);

  // 5. Simulate authenticated user flow (if we had auth token)
  // In real test, you'd login first and use the cookie
  // For now, test public endpoints that don't require auth
}

// Authenticated flow (run separately with pre-authenticated cookies)
export function authenticatedFlow() {
  // This would be run with a pre-authenticated session
  // Example: k6 run --env AUTH_COOKIE="auth_token=..." scripts/load-test.js
  
  const authCookie = __ENV.AUTH_COOKIE;
  if (!authCookie) {
    console.log('No AUTH_COOKIE provided, skipping authenticated flow');
    return;
  }

  const headers = {
    Cookie: authCookie,
    'Content-Type': 'application/json',
  };

  // Dashboard stats
  let res = http.get(`${BASE_URL}/api/dashboard-stats`, { headers });
  check(res, {
    'dashboard stats 200': (r) => r.status === 200,
    'dashboard stats < 1000ms': (r) => r.timings.duration < 1000,
  }) || errorRate.add(1);

  // Build exam
  const examConfig = {
    subjects: [{ subjectId: 1, paths: [], count: 10 }],
    questionCount: 10,
    durationSec: 600,
    shuffleQuestions: true,
  };
  
  res = http.post(`${BASE_URL}/api/exam/build`, JSON.stringify(examConfig), { headers });
  check(res, {
    'exam build 200': (r) => r.status === 200,
    'exam build < 3000ms': (r) => r.timings.duration < 3000,
  }) || errorRate.add(1);

  // AI Tutor (streaming - test with non-streaming endpoint)
  res = http.post(`${BASE_URL}/api/ai/solver`, JSON.stringify({
    text: 'Solve: 2+2=',
    subjectId: 1,
  }), { headers });
  check(res, {
    'ai solver 200': (r) => r.status === 200,
    'ai solver < 10000ms': (r) => r.timings.duration < 10000,
  }) || errorRate.add(1);
}