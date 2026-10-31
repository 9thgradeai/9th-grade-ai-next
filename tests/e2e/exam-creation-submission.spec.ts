// tests/e2e/exam-creation-submission.spec.ts
// Critical E2E: authenticated session + exam start/submit + AI tutor.
//
// Contracts asserted here, straight from the route handlers:
//   POST /api/exam/start   → { attemptId, status: "IN_PROGRESS" }
//                            attemptId MUST be a UUID; questionIds 1–200 ints.
//   POST /api/exam/submit  → { success, status: "SUBMITTED", score, result }
//                            result.outcome is lowercase "submitted" | "resumed".
//   POST /api/ai/tutor     → text/plain stream + X-AI-Source header (not JSON).
//
// All API calls go through `page.request`, which shares the browser context's
// cookie jar. The standalone `request` fixture has its own jar and would 401.

import { test, expect, type Page } from '@playwright/test';
import { registerViaApi } from './auth-helpers';

type SeedQuestion = { id: number; options: string[] };

/** Pull real seeded question ids so start/submit grade actual rows. */
async function seedQuestions(page: Page, count: number): Promise<SeedQuestion[]> {
  const res = await page.request.get(`/api/questions?limit=${count}`);
  expect(res.status(), 'question bank should be readable').toBe(200);
  const { questions } = (await res.json()) as { questions: SeedQuestion[] };
  expect(questions.length, 'seeded question bank should have questions').toBeGreaterThanOrEqual(count);
  return questions.slice(0, count).map((q) => ({ id: q.id, options: q.options ?? [] }));
}

test.describe('Exam Creation & Submission Flow (P0 Critical)', () => {
  test('P0: Register via API and verify authenticated session', async ({ page }) => {
    const { email } = await registerViaApi(page, 'session-verification');

    // The session cookie must resolve to the registered account.
    const me = await page.request.get('/api/auth/me');
    expect(me.status(), '/api/auth/me with the register cookie').toBe(200);
    const meBody = await me.json();
    expect(meBody.user.email).toBe(email);

    // Protected route must render the dashboard shell instead of bouncing to
    // /login. (The home tab's heading is localised, so anchor on the shell.)
    await page.goto('/dashboard/home');
    await page.waitForURL(/\/dashboard\/home/, { timeout: 30_000 });
    await expect(page.locator('header').first()).toBeVisible({ timeout: 15_000 });
  });

  test('P0: Exam start API works with authenticated user', async ({ page }) => {
    await registerViaApi(page, 'exam-start-test');
    const questions = await seedQuestions(page, 5);
    const attemptId = crypto.randomUUID();

    const startResponse = await page.request.post('/api/exam/start', {
      data: {
        attemptId,
        questionIds: questions.map((q) => q.id),
        durationSec: 300,
      },
    });

    expect(startResponse.status(), 'start should register the attempt').toBe(200);
    const startData = await startResponse.json();
    expect(startData.attemptId).toBe(attemptId);
    expect(startData.status).toBe('IN_PROGRESS');
  });

  test('P0: Exam submit API returns authoritative score', async ({ page }) => {
    await registerViaApi(page, 'exam-submit-test');
    const questions = await seedQuestions(page, 3);
    const questionIds = questions.map((q) => q.id);
    const attemptId = crypto.randomUUID();

    const startResponse = await page.request.post('/api/exam/start', {
      data: { attemptId, questionIds, durationSec: 600 },
    });
    expect(startResponse.status(), 'start must precede submit').toBe(200);

    const submitResponse = await page.request.post('/api/exam/submit', {
      data: {
        attemptId,
        questionIds,
        durationSec: 120,
        answers: questions.map((q) => ({ questionId: q.id, selected: q.options[0] ?? '' })),
      },
    });

    expect(submitResponse.status(), 'submit should succeed').toBe(200);
    const submitData = await submitResponse.json();

    expect(submitData.success).toBe(true);
    expect(submitData.status).toBe('SUBMITTED');
    expect(typeof submitData.score).toBe('number');
    expect(submitData.result.summary.total).toBe(3);
    // Idempotent outcome, never double-counted.
    expect(['submitted', 'resumed']).toContain(submitData.result.outcome);
  });

  test('P0: AI tutor endpoint with mock fallback', async ({ page }) => {
    await registerViaApi(page, 'ai-tutor-test');

    const tutorResponse = await page.request.post('/api/ai/tutor', {
      data: { messages: [{ role: 'user', content: 'Solve: If 2x + 5 = 15, what is x?' }] },
    });

    // Should return either a real provider response or a labelled mock fallback.
    expect(tutorResponse.status(), 'tutor should not error').toBe(200);
    const source = tutorResponse.headers()['x-ai-source'];
    expect(source, 'provider/source must be labelled on the response').toBeTruthy();
    expect(['mock', 'groq', 'anthropic']).toContain(source);

    // The stream must contain a non-empty answer (mock included).
    const body = await tutorResponse.text();
    expect(body.trim().length).toBeGreaterThan(0);
    expect(body).not.toMatch(/stack trace/i);
  });
});
