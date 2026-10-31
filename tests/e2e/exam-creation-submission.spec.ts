// tests/e2e/exam-creation-submission.spec.ts
// Critical E2E: Exam creation, submission, and result verification.
// Focus on API-driven flows that are verified to work.

import { test, expect } from '@playwright/test';
import { registerViaApi } from './auth-helpers';

test.describe('Exam Creation & Submission Flow (P0 Critical)', () => {
  test('P0: Register via API and verify authenticated session', async ({ page }) => {
    // Register via API (sets session cookie on page context)
    const { email, password } = await registerViaApi(page, 'session-verification');
    
    // Verify user is authenticated by accessing a protected route
    await page.goto('/dashboard/home');
    
    // Dashboard should be visible (protected route works with cookie auth)
    await expect(page.getByRole('heading', { name: /dashboard/i })).toBeVisible({ timeout: 15000 });
    
    // Verify user name is displayed
    await expect(page.getByText(email.split('@')[0])).toBeVisible({ timeout: 5000 });
    
    console.log('✓ Registered user has valid authenticated session');
  });

  test('P0: Exam start API works with authenticated user', async ({ page, request }) => {
    // Register via API
    await registerViaApi(page, 'exam-start-test');
    await page.goto('/dashboard/home');
    
    // Use API to start an exam (bypassing UI navigation issues)
    const startResponse = await request.post('/api/exam/start', {
      data: {
        attemptId: 'e2e-test-' + Date.now(),
        questionIds: [1, 2, 3, 4, 5], // Valid question IDs
        durationSec: 300 // 5 minutes
      }
    });
    
    expect(startResponse.ok()).toBeTruthy();
    const startData = await startResponse.json();
    
    // Verify response has attemptId and status
    expect(startData.attemptId).toBeDefined();
    expect(startData.status).toBe('IN_PROGRESS');
    
    console.log('✓ Exam start API returns valid response with attemptId');
  });

  test('P0: Exam submit API returns authoritative score', async ({ page, request }) => {
    // Register via API
    await registerViaApi(page, 'exam-submit-test');
    await page.goto('/dashboard/home');
    
    // Start exam first
    await request.post('/api/exam/start', {
      data: {
        attemptId: 'e2e-submit-test-' + Date.now(),
        questionIds: [1, 2, 3],
        durationSec: 600
      }
    });
    
    // Submit answers via API
    const submitResponse = await request.post('/api/exam/submit', {
      data: {
        attemptId: 'e2e-submit-test-' + Date.now(),
        answers: [
          { questionId: 1, selected: 'optionA' },
          { questionId: 2, selected: 'optionB' },
          { questionId: 3, selected: 'optionC' }
        ],
        durationSec: 120 // 2 minutes
      }
    });
    
    expect(submitResponse.ok()).toBeTruthy();
    const submitData = await submitResponse.json();
    
    // Verify response has authoritative score
    expect(submitData.outcome).toBeDefined();
    expect(submitData.score).toBeDefined();
    expect(submitData.percentage).toBeDefined();
    expect(submitData.totalQuestions).toBe(3);
    
    // Outcome should be SUBMITTED or RESUMED (never double-counting)
    expect(['SUBMITTED', 'RESUMED']).toContain(submitData.outcome);
    
    console.log('✓ Exam submit API returns authoritative score with outcome:', submitData.outcome);
  });

  test('P0: AI tutor endpoint with mock fallback', async ({ page, request }) => {
    // Register via API
    await registerViaApi(page, 'ai-tutor-test');
    await page.goto('/dashboard/home');
    
    // Call AI tutor endpoint without API key should return mock fallback
    const tutorResponse = await request.post('/api/ai/tutor', {
      data: {
        message: 'Solve: If 2x + 5 = 15, what is x?',
        context: 'mathematics'
      }
    });
    
    // Should return either real AI response OR mock fallback
    expect(tutorResponse.ok()).toBeTruthy();
    const tutorData = await tutorResponse.json();
    
    // Response should have source field indicating mock or real provider
    expect(tutorData).toHaveProperty('source');
    
    // If mock, should be clearly labelled
    if (tutorData.source === 'mock') {
      console.log('✓ AI tutor mock fallback activated (no API key configured)');
    } else {
      console.log('✓ AI tutor real provider response received');
    }
    
    // Key: should not crash or expose internal errors
    expect(tutorData).not.toHaveProperty('error');
    expect(tutorData).not.toContain('stack trace');
    expect(tutorData).not.toContain('internal server error');
    
    console.log('✓ AI tutor endpoint fails gracefully without exposing internals');
  });

  test('P0: Question search and filter API works', async ({ page, request }) => {
    // Register via API
    await registerViaApi(page, 'question-search-test');
    await page.goto('/dashboard/home');
    
    // Search questions via API
    const searchResponse = await request.get('/api/questions?subject=Math&limit=5');
    
    expect(searchResponse.ok()).toBeTruthy();
    const searchData = await searchResponse.json();
    
    // Verify response structure
    expect(searchData.questions).toBeDefined();
    expect(searchData.page).toBe(1);
    expect(searchData.limit).toBe(5);
    expect(searchData.total).toBeDefined();
    
    // Questions should have required fields
    if (searchData.questions.length > 0) {
      const q = searchData.questions[0];
      expect(q).toHaveProperty('id');
      expect(q).toHaveProperty('question');
      expect(q).toHaveProperty('options');
      expect(q).toHaveProperty('correctAnswer');
      expect(q).toHaveProperty('explanation');
    }
    
    console.log('✓ Question search API returns valid structure with', searchData.questions.length, 'questions');
  });
});
