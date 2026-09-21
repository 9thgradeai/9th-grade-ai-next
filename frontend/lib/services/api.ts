"use client";

import type { Server } from "@/lib/types";

// ── Constants ──────────────────────────────────────────────

const DEFAULT_TIMEOUT_MS = 15_000;
const MAX_RETRIES = 3;
const RETRY_DELAY_BASE_MS = 500;

const IDEMPOTENT_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

// ── Error class ────────────────────────────────────────────

export class ApiError extends Error {
  message: string;
  code: string;
  status: number;

  constructor(message: string, code = "UNKNOWN_ERROR", status = 500) {
    super(message);
    this.message = message;
    this.code = code;
    this.status = status;
    this.name = "ApiError";
  }
}

// ── Internal helpers ───────────────────────────────────────

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

/**
 * Timeout-aware fetch that covers the ENTIRE request lifecycle — header
 * arrival AND the response body read. Previously the timer was cleared as soon
 * as `fetch()` resolved, leaving `response.json()` (the actual body) with no
 * timeout and no abort signal: a stalled body would hang the caller forever
 * (submitting state stuck, submission lock wedged — "submit button does
 * nothing"). The timer now lives until the body has been consumed, and an
 * abort at any stage surfaces as a retryable TIMEOUT ApiError.
 */
async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<{ response: Response; raw: unknown }> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    let raw: unknown;
    if (response.status !== 204) {
      try {
        raw = await response.json();
      } catch (error) {
        // The only signal in play is our internal one (it overrides any caller
        // signal), so an AbortError mid-read = the timeout fired. A non-JSON
        // body (e.g. an edge error page) degrades to `null`; the caller falls
        // back to statusText for the message.
        if (isAbortError(error)) {
          throw new ApiError("Request timed out.", "TIMEOUT", 408);
        }
        raw = null;
      }
    }
    return { response, raw };
  } catch (error) {
    if (isAbortError(error)) {
      throw new ApiError("Request timed out.", "TIMEOUT", 408);
    }
    if (error instanceof ApiError) throw error;
    throw new ApiError("Network request failed.", "NETWORK_ERROR", 0);
  } finally {
    clearTimeout(timeoutId);
  }
}

function getBackoffDelay(attempt: number): number {
  return RETRY_DELAY_BASE_MS * Math.pow(2, attempt);
}

type RequestOptions = RequestInit & { retries?: number; timeoutMs?: number };

/**
 * Single gateway for every browser → API call. Adds request correlation,
 * timeouts, error normalization, and exponential-backoff retries.
 *
 * Retries apply ONLY to idempotent verbs by default — mutations (POST/PATCH/
 * DELETE) are never retried automatically so a timeout can never double-apply
 * an action (e.g. an SRS review). Pass `retries` explicitly to opt a safe
 * mutation back in. Exam submission opts in because it is idempotent by
 * attemptId: the server resolves re-sends to the same token.
 */
async function request<T>(
  url: string,
  options: RequestOptions = {},
): Promise<T> {
  const method = (options.method ?? "GET").toUpperCase();
  const headers = new Headers(options.headers);

  if (!headers.has("x-request-id")) {
    headers.set("x-request-id", crypto.randomUUID());
  }

  let retries = options.retries ?? MAX_RETRIES;
  if (!IDEMPOTENT_METHODS.has(method)) {
    retries = Math.min(retries, options.retries ?? 0);
  }

  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const fetchOptions: RequestInit = { ...options, headers };
  delete (fetchOptions as RequestOptions).retries;
  delete (fetchOptions as RequestOptions).timeoutMs;

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const { response, raw } = await fetchWithTimeout(url, fetchOptions, timeoutMs);

      if (!response.ok) {
        const body =
          raw && typeof raw === "object"
            ? (raw as { error?: string; code?: string })
            : {};
        const errorMessage = body.error ?? response.statusText;
        const errorCode = body.code ?? `HTTP_${response.status}`;

        const shouldRetry =
          attempt < retries &&
          (response.status >= 500 ||
            response.status === 408 ||
            (typeof body.error === "string" && body.error.includes("Network")));

        if (shouldRetry) {
          const delay = getBackoffDelay(attempt);
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }

        throw new ApiError(errorMessage, errorCode, response.status);
      }

      if (response.status === 204) {
        return undefined as T;
      }

      return raw as T;
    } catch (error) {
      lastError = error as Error;

      if (error instanceof ApiError) {
        const shouldRetry =
          attempt < retries &&
          (error.status >= 500 ||
            error.status === 408 ||
            error.code === "NETWORK_ERROR" ||
            error.code === "TIMEOUT");

        if (shouldRetry) {
          const delay = getBackoffDelay(attempt);
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }
      }

      throw error;
    }
  }

  throw lastError ?? new ApiError("Request failed after retries.", "REQUEST_FAILED", 500);
}

// ── Read cache (stale-while-revalidate) ─────────────────────
// GETs are cached in-memory for a short TTL. Within the TTL the cached value is
// returned instantly (no refetch on every dashboard remount / tab switch); past
// it we refetch and update the cache. On a network failure we fall back to the
// last cached value instead of throwing, so the dashboard still renders offline
// or during blips. Mutations never touch this cache.

const CACHE_TTL_MS = 15_000;
const cache = new Map<string, { ts: number; data: unknown }>();

async function cachedGet<T>(
  url: string,
  options: RequestOptions = {},
): Promise<T> {
  const cached = cache.get(url);
  const fresh = cached && Date.now() - cached.ts < CACHE_TTL_MS;

  if (fresh) {
    return cached.data as T;
  }

  try {
    const data = await request<T>(url, options);
    cache.set(url, { ts: Date.now(), data });
    return data;
  } catch (error) {
    if (cached) {
      return cached.data as T;
    }
    throw error;
  }
}

/** JSON mutation helper — sets Content-Type, serializes the body, never retried. */
function mutate<T>(
  url: string,
  method: string,
  body?: unknown,
): Promise<T> {
  return request<T>(url, {
    method,
    retries: 0,
    ...(body !== undefined
      ? { body: JSON.stringify(body), headers: { "Content-Type": "application/json" } }
      : {}),
  });
}

/** File download helper — returns a Blob for binary responses (PDF, etc.). */
async function downloadFile(
  url: string,
  options: RequestInit = {},
): Promise<Blob> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60_000);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });

    if (!response.ok) {
      // Try to parse structured JSON error from the server (e.g. PDF_EXPORT_* codes)
      let errorBody: { error?: string; code?: string; requestId?: string } | null = null;
      try {
        errorBody = await response.json();
      } catch {
        // Not JSON — fall back to status text
      }
      const message = errorBody?.error || response.statusText;
      const code = errorBody?.code || `HTTP_${response.status}`;
      throw new ApiError(message, code, response.status);
    }

    return await response.blob();
  } catch (error) {
    if (isAbortError(error)) {
      throw new ApiError("Download timed out.", "TIMEOUT", 408);
    }
    if (error instanceof ApiError) throw error;
    throw new ApiError("Network request failed.", "NETWORK_ERROR", 0);
  } finally {
    clearTimeout(timeoutId);
  }
}

const AUTH_FETCH_INIT = { credentials: "include", cache: "no-store" } as const;

// ── Typed API methods ──────────────────────────────────────

export const api = {
  questions: (params?: {
    subject?: string;
    topic?: string;
    difficulty?: string;
    q?: string;
    paths?: string[];
    ids?: number[];
    year?: number;
    sourceExam?: string;
    bcsTerm?: string;
    paperId?: number;
    limit?: number;
    page?: number;
    ecosystem?: string;
  }): Promise<Server.QuestionDTO[]> => {
    const qs = new URLSearchParams();
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        if (v === undefined) continue;
        if (Array.isArray(v)) {
          if (v.length > 0) qs.set(k, v.join(","));
        } else if (String(v).length > 0) {
          qs.set(k, String(v));
        }
      }
    }
    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    return cachedGet<{ questions: Server.QuestionDTO[] }>(`/api/questions${suffix}`).then((d) => d.questions);
  },

  /** Wrong-Answer Notebook (ভুলের নোটবুক): questions whose latest attempt was wrong. */
  wrongAnswers: (params?: { page?: number; limit?: number }): Promise<{
    questions: Server.QuestionDTO[];
    total: number;
    page: number;
    limit: number;
  }> => {
    const qs = new URLSearchParams();
    if (params?.page) qs.set("page", String(params.page));
    if (params?.limit) qs.set("limit", String(params.limit));
    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    return cachedGet<{
      questions: Server.QuestionDTO[];
      total: number;
      page: number;
      limit: number;
    }>(`/api/wrong-answers${suffix}`);
  },

  /** Weak topics (lowest accuracy) for the signed-in user. */
  weakTopics: (): Promise<Server.WeakTopicDTO[]> =>
    cachedGet<{ topics: Server.WeakTopicDTO[] }>("/api/weak-topics").then((d) => d.topics),

  /** Points leaderboard; `me` is null for users with no progress row. */
  leaderboard: (limit?: number): Promise<{
    entries: Server.LeaderboardEntryDTO[];
    me: { rank: number; points: number } | null;
  }> => {
    const suffix = limit ? `?limit=${limit}` : "";
    return cachedGet<{
      entries: Server.LeaderboardEntryDTO[];
      me: { rank: number; points: number } | null;
    }>(`/api/leaderboard${suffix}`);
  },

  /** Recent completed daily quizzes for the signed-in user. */
  dailyQuizHistory: (limit?: number): Promise<Server.DailyQuizHistoryItemDTO[]> => {
    const suffix = limit ? `?limit=${limit}` : "";
    return cachedGet<{ history: Server.DailyQuizHistoryItemDTO[] }>(
      `/api/daily-quiz/history${suffix}`,
    ).then((d) => d.history);
  },

  questionBankCategories: (ecosystem?: string): Promise<Server.QuestionBankCategoryDTO[]> => {
    const qs = ecosystem ? `?ecosystem=${encodeURIComponent(ecosystem)}` : "";
    return cachedGet<{ categories: Server.QuestionBankCategoryDTO[] }>(`/api/question-bank/categories${qs}`).then((d) => d.categories);
  },

  /** Exam-library hierarchy: ExamCategory → Exam → ExamPaper (BCS → Preliminary → specific paper). */
  examLibrary: (ecosystem?: string): Promise<Server.ExamCategoryDTO[]> => {
    const qs = ecosystem ? `?ecosystem=${encodeURIComponent(ecosystem)}` : "";
    return cachedGet<{ exams: Server.ExamCategoryDTO[] }>(`/api/question-bank/exams${qs}`).then((d) => d.exams);
  },

  flashcards: (subject?: string): Promise<Server.FlashcardDTO[]> => {
    const qs = subject ? `?subject=${encodeURIComponent(subject)}` : "";
    return cachedGet<{ flashcards: Server.FlashcardDTO[] }>(`/api/flashcards${qs}`).then((d) => d.flashcards);
  },

  reviewFlashcard: (flashcardId: number, rating: 0 | 1 | 2 | 3): Promise<unknown> =>
    request<{ state: unknown }>("/api/flashcards/review", {
      method: "POST",
      ...AUTH_FETCH_INIT,
      body: JSON.stringify({ flashcardId, rating }),
      headers: { "Content-Type": "application/json" },
    }).then((d) => d.state),

  studyPlan: (): Promise<Server.StudyTaskDTO[]> =>
    cachedGet<{ tasks: Server.StudyTaskDTO[] }>("/api/study-plan").then((d) => d.tasks),

  dailyQuiz: (ecosystem?: string): Promise<Server.DailyQuizDTO | null> => {
    const qs = ecosystem ? `?ecosystem=${encodeURIComponent(ecosystem)}` : "";
    return cachedGet<{ quiz: Server.DailyQuizDTO | null }>(`/api/daily-quiz${qs}`).then((d) => d.quiz);
  },

  news: (): Promise<Server.FlashNewsDTO[]> =>
    cachedGet<{ news: Server.FlashNewsDTO[] }>("/api/flash-news").then((d) => d.news),

  notifications: (opts?: { limit?: number; cursor?: number; type?: string }): Promise<{ notifications: Server.NotificationDTO[]; total: number; nextCursor: number | null; unreadCount: number }> => {
    const params = new URLSearchParams();
    if (opts?.limit) params.set("limit", String(opts.limit));
    if (opts?.cursor) params.set("cursor", String(opts.cursor));
    if (opts?.type) params.set("type", opts.type);
    const qs = params.toString();
    return request(`/api/notifications${qs ? `?${qs}` : ""}`);
  },

  markNotificationRead: (id: number): Promise<{ read: boolean }> =>
    mutate(`/api/notifications/${id}/read`, "POST"),

  markAllNotificationsRead: (): Promise<{ count: number }> =>
    mutate("/api/notifications/read-all", "POST"),

  deleteNotification: (id: number): Promise<{ deleted: boolean }> =>
    mutate(`/api/notifications/${id}`, "DELETE"),

  notificationPreferences: (): Promise<{ preferences: { info: boolean; success: boolean; warning: boolean; reminder: boolean } }> =>
    request("/api/notifications/preferences"),

  updateNotificationPreferences: (prefs: { info?: boolean; success?: boolean; warning?: boolean; reminder?: boolean }): Promise<{ preferences: { info: boolean; success: boolean; warning: boolean; reminder: boolean } }> =>
    mutate("/api/notifications/preferences", "PATCH", prefs),

  badges: (): Promise<Server.BadgeDTO[]> =>
    cachedGet<{ badges: Server.BadgeDTO[] }>("/api/badges").then((d) => d.badges),

  subjectReports: (): Promise<Array<{ name: string; score: number; attempted: number; correct: number }>> =>
    cachedGet<{ reports: Array<{ name: string; score: number; attempted: number; correct: number }> }>("/api/subject-reports").then((d) => d.reports),

  dashboardStats: (days?: number): Promise<Server.DashboardStatsDTO> => {
    const suffix = days && days > 7 ? `?days=${days}` : "";
    return cachedGet<{ stats: Server.DashboardStatsDTO }>(`/api/dashboard-stats${suffix}`).then((d) => d.stats);
  },

  preparationIntelligence: (): Promise<Server.PreparationIntelligenceDTO> =>
    request<{ intelligence: Server.PreparationIntelligenceDTO }>("/api/preparation-intelligence").then(
      (d) => d.intelligence,
    ),

  examSchedule: (): Promise<Server.ExamScheduleDTO[]> =>
    cachedGet<{ exams: Server.ExamScheduleDTO[] }>("/api/exam-schedule").then((d) => d.exams),

  mockTestResults: (): Promise<Server.MockTestResultDTO[]> =>
    cachedGet<{ results: Server.MockTestResultDTO[] }>("/api/mock-test/results").then((d) => d.results),

  examConfig: (ecosystem?: string): Promise<Server.ExamSubjectDTO[]> => {
    const qs = ecosystem ? `?v=2&ecosystem=${encodeURIComponent(ecosystem)}` : "?v=2";
    return cachedGet<{ subjects: Server.ExamSubjectDTO[] }>(`/api/exam/config${qs}`).then((d) => d.subjects);
  },

  // ── Exam History & Real Exam ────────────────────────────────

  /** Fetch user's exam history (past attempts + upcoming exams). */
  examHistory: (): Promise<Server.ExamHistoryDTO> =>
    cachedGet<{ history: Server.ExamHistoryDTO }>("/api/exam-history").then((d) => d.history),

  /** Fetch available exam papers for real exam (offline PDF). */
  examPapers: (): Promise<Array<{
    id: number;
    titleBn: string;
    titleEn: string;
    examId: number;
    examNameBn: string;
    examNameEn: string;
    examType: string;
    year: number | null;
    heldOn: string | null;
    durationMin: number | null;
    totalQuestions: number | null;
    availableQuestions: number;
    provenance: string;
    subjectId: number | null;
    subjectNameBn: string | null;
  }>> =>
    cachedGet<{ papers: Array<{
      id: number;
      titleBn: string;
      titleEn: string;
      examId: number;
      examNameBn: string;
      examNameEn: string;
      examType: string;
      year: number | null;
      heldOn: string | null;
      durationMin: number | null;
      totalQuestions: number | null;
      availableQuestions: number;
      provenance: string;
      subjectId: number | null;
      subjectNameBn: string | null;
    }> }>("/api/exam-papers").then((d) => d.papers),

  /** Fetch questions for a specific exam paper. */
  examPaperQuestions: (paperId: number): Promise<Server.RealExamQuestionDTO[]> =>
    cachedGet<{ questions: Server.RealExamQuestionDTO[] }>(`/api/exam-papers/${paperId}`).then((d) => d.questions),

  /** Export real exam to PDF.
   *
   * Two protocols (server decides by payload):
   * - `{ paperId }` for official papers — the server loads the questions
   *   itself, so the client uploads ~200 bytes instead of the full JSON.
   * - `{ questions }` for custom-built papers that only exist client-side.
   */
  exportRealExam: async (params: {
    questions?: Server.RealExamQuestionDTO[];
    paperId?: number;
    title: string;
    examName: string;
    exportOptions: Server.RealExamExportOptions;
    durationMin: number;
  }): Promise<Blob> => {
    return downloadFile("/api/real-exam/export", {
      method: "POST",
      ...AUTH_FETCH_INIT,
      body: JSON.stringify(params),
      headers: { "Content-Type": "application/json" },
    });
  },

  buildExam: async (config: Server.ExamSelectionRequest): Promise<Server.ExamBuildResultDTO> => {
    const data = await request<{ exam: Server.ExamBuildResultDTO }>("/api/exam/build", {
      method: "POST",
      ...AUTH_FETCH_INIT,
      body: JSON.stringify(config),
      headers: { "Content-Type": "application/json" },
    });
    return data.exam;
  },

  submitExam: async (params: {
    attemptId: string;
    questionIds: number[];
    durationSec: number;
    answers: { questionId: number; selected: string }[];
  }): Promise<Server.ExamResultDTO> => {
    const data = await request<{ result: Server.ExamResultDTO }>(`/api/exams/${params.attemptId}/submit`, {
      method: "POST",
      ...AUTH_FETCH_INIT,
      body: JSON.stringify({ questionIds: params.questionIds, durationSec: params.durationSec, answers: params.answers }),
      headers: { "Content-Type": "application/json", "Idempotency-Key": params.attemptId },
      // Safe to retry: the server is idempotent by Idempotency-Key and resolves
      // re-sends to the original result. Mobile blips become invisible
      // recoveries instead of hard failures.
      retries: 2,
      // Grading is a heavy transaction — give slow networks / cold starts a
      // fair window before giving up.
      timeoutMs: 45_000,
    });
    return data.result;
  },

  /** Reconciliation check after a timeout/drop — must be called before retrying. */
  getExamSubmissionStatus: (attemptId: string): Promise<{ attemptId: string; status: string; result?: Server.ExamResultDTO }> =>
    request<{ attemptId: string; status: string; result?: Server.ExamResultDTO }>(`/api/exams/${attemptId}/submission-status`, {
      method: "GET",
      ...AUTH_FETCH_INIT,
    }),

  startExam: async (params: {
    attemptId: string;
    questionIds: number[];
    durationSec?: number;
  }): Promise<{ attemptId: string; status: "IN_PROGRESS" }> =>
    request<{ attemptId: string; status: "IN_PROGRESS" }>("/api/exam/start", {
      method: "POST",
      ...AUTH_FETCH_INIT,
      body: JSON.stringify(params),
      headers: { "Content-Type": "application/json" },
    }),

  submitDailyQuiz: async (
    quizId: number,
    answers: { questionId: number; selected: string }[],
  ): Promise<{ correct: number; total: number; score: number; pointsEarned: number }> => {
    const data = await request<{ summary: { correct: number; total: number; score: number; pointsEarned: number } }>(
      "/api/daily-quiz/submit",
      {
        method: "POST",
        ...AUTH_FETCH_INIT,
        body: JSON.stringify({ quizId, answers }),
        headers: { "Content-Type": "application/json" },
      },
    );
    return data.summary;
  },

  submitPractice: async (
    answers: { questionId: number; selected: string; durationSec?: number; confidence?: number }[],
  ): Promise<{
    correct: number;
    total: number;
    score: number;
    pointsEarned: number;
    feedback?: Record<number, { masteryStatus: string; isMistake: boolean; justMastered: boolean }>;
  }> => {
    const data = await request<{
      summary: {
        correct: number;
        total: number;
        score: number;
        pointsEarned: number;
        feedback?: Record<number, { masteryStatus: string; isMistake: boolean; justMastered: boolean }>;
      };
    }>(
      "/api/practice/submit",
      {
        method: "POST",
        ...AUTH_FETCH_INIT,
        body: JSON.stringify({ answers }),
        headers: { "Content-Type": "application/json" },
        // No auto-retry: practice writes attempts without an idempotency key;
        // a retry could double-count points. The caller surfaces the error and
        // the user can tap again (joined via in-flight guard, never wedged).
        timeoutMs: 30_000,
      },
    );
    return data.summary;
  },

  documents: (): Promise<Server.DocumentDTO[]> =>
    cachedGet<{ documents: Server.DocumentDTO[] }>("/api/documents").then((d) => d.documents),

  bookmarks: (): Promise<number[]> =>
    cachedGet<{ bookmarked: number[] }>("/api/bookmarks").then((d) => d.bookmarked),

  toggleBookmark: (questionId: number): Promise<{ bookmarked: boolean }> =>
    mutate("/api/bookmarks", "POST", { questionId }),

  toggleStudyTask: (taskId: number): Promise<{ completed: boolean }> =>
    mutate(`/api/study-plan/tasks/${taskId}/toggle`, "POST"),

  createStudyTask: (task: { title: string; subject: string; day: string; duration?: number; priority?: string }): Promise<{ task: Server.StudyTaskDTO }> =>
    mutate<{ task: Server.StudyTaskDTO }>("/api/study-plan", "POST", task),

  // ── Mistake / Mastery system ─────────────────────────────

  /** Paginated mistake list with filters. */
  mistakes: (params?: {
    page?: number;
    limit?: number;
    subject?: string;
    status?: string;
    difficulty?: string;
    topic?: string;
    errorType?: string;
    sort?: string;
  }): Promise<{
    data: Server.MistakeItemDTO[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> => {
    const qs = new URLSearchParams();
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        if (v !== undefined && String(v).length > 0) qs.set(k, String(v));
      }
    }
    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    return cachedGet(`/api/mistakes${suffix}`);
  },

  /** Mistake statistics for the signed-in user. */
  mistakeStats: (): Promise<Server.MistakeStatsDTO> =>
    cachedGet<Server.MistakeStatsDTO>("/api/mistakes/stats"),

  /** Overall answer-history accuracy stats for the signed-in user. */
  mistakeOverallStats: (): Promise<Server.OverallStatsDTO> =>
    cachedGet<Server.OverallStatsDTO>("/api/mistakes/stats/overall"),

  /** Subject → topic → subtopic selection tree over the user's own mistakes. */
  mistakeExamSelection: (): Promise<Server.MistakeSelectionSubjectDTO[]> =>
    cachedGet<{ subjects: Server.MistakeSelectionSubjectDTO[] }>("/api/mistakes/exam/config").then(
      (d) => d.subjects,
    ),

  /** Mistake counts per subject. */
  mistakeSubjects: (): Promise<Server.SubjectMistakeCountDTO[]> =>
    cachedGet<{ subjects: Server.SubjectMistakeCountDTO[] }>("/api/mistakes/subjects").then(
      (d) => d.subjects,
    ),

  /** Build a mistake practice exam. */
  buildMistakeExam: async (
    config: Server.MistakeExamConfigDTO,
  ): Promise<Server.ExamBuildResultDTO> => {
    const data = await request<{ result: Server.ExamBuildResultDTO }>("/api/mistakes/exam", {
      method: "POST",
      ...AUTH_FETCH_INIT,
      body: JSON.stringify(config),
      headers: { "Content-Type": "application/json" },
    });
    return data.result;
  },

  // ── Vocab — AI-Powered Vocabulary Mastery ──────────
  vocabWords: (params?: { limit?: number; exam?: string; difficulty?: string; search?: string; due?: string; status?: string }): Promise<Server.VocabWordDTO[]> => {
    const qs = new URLSearchParams();
    if (params?.limit) qs.set("limit", String(params.limit));
    if (params?.exam) qs.set("exam", params.exam);
    if (params?.difficulty) qs.set("difficulty", params.difficulty);
    if (params?.search) qs.set("search", params.search);
    if (params?.due) qs.set("due", params.due);
    if (params?.status) qs.set("status", params.status);
    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    return cachedGet<{ words: Server.VocabWordDTO[] }>(`/api/vocab/words${suffix}`).then((d) => d.words);
  },
  vocabStats: (): Promise<{ total: number; mastered: number; learning: number; due: number; reviewed: number }> =>
    cachedGet<{ total: number; mastered: number; learning: number; due: number; reviewed: number }>("/api/vocab/stats").then((d) => d),
  reviewVocab: (wordId: number, rating: number): Promise<unknown> =>
    request("/api/vocab/review", { method: "POST", ...AUTH_FETCH_INIT, body: JSON.stringify({ wordId, rating }), headers: { "Content-Type": "application/json" } }),
  vocabDaily: (): Promise<{ wordsReviewed: number; totalReviewsToday: number; correctToday: number; streak: number }> =>
    cachedGet<{ wordsReviewed: number; totalReviewsToday: number; correctToday: number; streak: number }>("/api/vocab/daily").then((d) => d),
  vocabQuiz: (params?: { count?: number; difficulty?: string }): Promise<Server.VocabQuizWordDTO[]> => {
    const qs = new URLSearchParams();
    if (params?.count) qs.set("count", String(params.count));
    if (params?.difficulty) qs.set("difficulty", params.difficulty);
    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    return cachedGet<{ words: Server.VocabQuizWordDTO[] }>(`/api/vocab/quiz${suffix}`).then((d) => d.words);
  },
  vocabWordOfDay: (): Promise<Server.WordOfDayDTO> =>
    cachedGet<{ word: Server.WordOfDayDTO }>("/api/vocab/word-of-the-day").then((d) => d.word),
  vocabWeeklyWords: (): Promise<Server.WordOfDayDTO[]> =>
    cachedGet<{ words: Server.WordOfDayDTO[] }>("/api/vocab/word-of-the-day?weekly=true").then((d) => d.words),
  vocabAiMnemonic: (word: string, bengaliMeaning: string, context?: string): Promise<{ mnemonic: string; source: string }> =>
    request("/api/ai/vocab", { method: "POST", ...AUTH_FETCH_INIT, body: JSON.stringify({ action: "mnemonic", word, bengaliMeaning, context }), headers: { "Content-Type": "application/json" } }),
  vocabAiExamples: (word: string, partOfSpeech: string, difficulty?: string): Promise<{ examples: string[]; source: string }> =>
    request("/api/ai/vocab", { method: "POST", ...AUTH_FETCH_INIT, body: JSON.stringify({ action: "examples", word, partOfSpeech, difficulty }), headers: { "Content-Type": "application/json" } }),
  vocabAnalytics: (): Promise<Server.VocabAnalyticsDTO> =>
    cachedGet<{ analytics: Server.VocabAnalyticsDTO }>("/api/vocab/analytics").then((d) => d.analytics),
  vocabDecks: (): Promise<Server.VocabDeckDTO[]> =>
    cachedGet<{ decks: Server.VocabDeckDTO[] }>("/api/vocab/decks").then((d) => d.decks),
};

// ── Account / settings methods (auth endpoints) ─────────────

export const account = {
  updateProfile: (name: string): Promise<{ user: Server.UserDTO }> =>
    mutate<{ user: Server.UserDTO }>("/api/auth/profile", "PATCH", { name }),

  changePassword: (currentPassword: string, newPassword: string, confirmPassword: string) =>
    mutate<{ success: boolean }>("/api/auth/change-password", "POST", {
      currentPassword,
      newPassword,
      confirmPassword,
    }),

  deleteAccount: (): Promise<{ success: boolean }> =>
    request<{ success: boolean }>("/api/auth/account", {
      method: "DELETE",
      ...AUTH_FETCH_INIT,
    }),

  // Invalidates every session (all devices) and clears this device's cookie.
  revokeAllSessions: (): Promise<{ success: boolean }> =>
    mutate<{ success: boolean }>("/api/auth/sessions/revoke-all", "POST"),

  forgotPassword: (email: string): Promise<{ ok: boolean; devLink?: string }> =>
    mutate<{ ok: boolean; devLink?: string }>("/api/auth/forgot-password", "POST", { email }),

  resetPassword: (token: string, password: string): Promise<{ ok: boolean }> =>
    mutate<{ ok: boolean }>("/api/auth/reset-password", "POST", { token, password }),

  verifyEmail: (token: string): Promise<{ ok: boolean }> =>
    mutate<{ ok: boolean }>("/api/auth/verify-email", "POST", { token }),

  resendVerification: (email: string): Promise<{ ok: boolean; devLink?: string; autoVerified?: boolean }> =>
    mutate<{ ok: boolean; devLink?: string; autoVerified?: boolean }>("/api/auth/resend-verification", "POST", { email }),

  completeOnboarding: (data: {
    examTarget?: string;
    examDate?: string;
    prepLevel?: "BEGINNER" | "INTERMEDIATE" | "ADVANCED";
    studyHoursPerDay?: number;
    goal?: string;
  }): Promise<{ ok: boolean; user: Server.UserDTO }> =>
    mutate<{ ok: boolean; user: Server.UserDTO }>("/api/onboarding", "POST", data),
};
