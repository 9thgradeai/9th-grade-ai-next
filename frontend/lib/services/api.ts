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

async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } catch (error) {
    if ((error as Error).name === "AbortError") {
      throw new ApiError("Request timed out.", "TIMEOUT", 408);
    }
    throw new ApiError(
      "Network request failed.",
      "NETWORK_ERROR",
      0,
    );
  } finally {
    clearTimeout(timeoutId);
  }
}

function getBackoffDelay(attempt: number): number {
  return RETRY_DELAY_BASE_MS * Math.pow(2, attempt);
}

type RequestOptions = RequestInit & { retries?: number };

/**
 * Single gateway for every browser → API call. Adds request correlation,
 * timeouts, error normalization, and exponential-backoff retries.
 *
 * Retries apply ONLY to idempotent verbs by default — mutations (POST/PATCH/
 * DELETE) are never retried automatically so a timeout can never double-apply
 * an action (e.g. an SRS review or exam submission). Pass `retries` explicitly
 * to opt a safe mutation back in.
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

  const fetchOptions: RequestInit = { ...options, headers };
  delete (fetchOptions as RequestOptions).retries;

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetchWithTimeout(url, fetchOptions);

      if (!response.ok) {
        let body: { error?: string; code?: string };
        try {
          body = await response.json();
        } catch {
          body = { error: response.statusText };
        }

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

      const data = (await response.json()) as T;
      return data;
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

const AUTH_FETCH_INIT = { credentials: "include", cache: "no-store" } as const;

// ── Typed API methods ──────────────────────────────────────

export const api = {
  questions: (params?: {
    subject?: string;
    topic?: string;
    difficulty?: string;
    q?: string;
    paths?: string[];
    limit?: number;
    page?: number;
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
    return request<{ questions: Server.QuestionDTO[] }>(`/api/questions${suffix}`).then((d) => d.questions);
  },

  questionBankCategories: (): Promise<Server.QuestionBankCategoryDTO[]> =>
    request<{ categories: Server.QuestionBankCategoryDTO[] }>("/api/question-bank/categories").then((d) => d.categories),

  flashcards: (subject?: string): Promise<Server.FlashcardDTO[]> => {
    const qs = subject ? `?subject=${encodeURIComponent(subject)}` : "";
    return request<{ flashcards: Server.FlashcardDTO[] }>(`/api/flashcards${qs}`).then((d) => d.flashcards);
  },

  reviewFlashcard: (flashcardId: number, rating: 0 | 1 | 2 | 3): Promise<unknown> =>
    request<{ state: unknown }>("/api/flashcards/review", {
      method: "POST",
      ...AUTH_FETCH_INIT,
      body: JSON.stringify({ flashcardId, rating }),
      headers: { "Content-Type": "application/json" },
    }).then((d) => d.state),

  studyPlan: (): Promise<Server.StudyTaskDTO[]> =>
    request<{ tasks: Server.StudyTaskDTO[] }>("/api/study-plan").then((d) => d.tasks),

  dailyQuiz: (): Promise<Server.DailyQuizDTO | null> =>
    request<{ quiz: Server.DailyQuizDTO | null }>("/api/daily-quiz").then((d) => d.quiz),

  news: (): Promise<Server.FlashNewsDTO[]> =>
    request<{ news: Server.FlashNewsDTO[] }>("/api/flash-news").then((d) => d.news),

  recommendations: (): Promise<Server.RecommendationDTO[]> =>
    request<{ recommendations: Server.RecommendationDTO[] }>("/api/recommendations").then((d) => d.recommendations),

  notifications: (): Promise<Server.NotificationDTO[]> =>
    request<{ notifications: Server.NotificationDTO[] }>("/api/notifications").then((d) => d.notifications),

  markNotificationRead: (id: number): Promise<{ read: boolean }> =>
    mutate(`/api/notifications/${id}/read`, "POST"),

  badges: (): Promise<Server.BadgeDTO[]> =>
    request<{ badges: Server.BadgeDTO[] }>("/api/badges").then((d) => d.badges),

  subjectReports: (): Promise<Array<{ name: string; score: number; attempted: number; correct: number }>> =>
    request<{ reports: Array<{ name: string; score: number; attempted: number; correct: number }> }>("/api/subject-reports").then((d) => d.reports),

  dashboardStats: (): Promise<Server.DashboardStatsDTO> =>
    request<{ stats: Server.DashboardStatsDTO }>("/api/dashboard-stats").then((d) => d.stats),

  examSchedule: (): Promise<Server.ExamScheduleDTO[]> =>
    request<{ exams: Server.ExamScheduleDTO[] }>("/api/exam-schedule").then((d) => d.exams),

  mockTestResults: (): Promise<Server.MockTestResultDTO[]> =>
    request<{ results: Server.MockTestResultDTO[] }>("/api/mock-test/results").then((d) => d.results),

  examConfig: (): Promise<Server.ExamSubjectDTO[]> =>
    request<{ subjects: Server.ExamSubjectDTO[] }>("/api/exam/config").then((d) => d.subjects),

  buildExam: async (config: Server.ExamSelectionRequest): Promise<Server.ExamBuildResultDTO> => {
    const data = await request<{ exam: Server.ExamBuildResultDTO }>("/api/exam/build", {
      method: "POST",
      ...AUTH_FETCH_INIT,
      body: JSON.stringify(config),
      headers: { "Content-Type": "application/json" },
    });
    return data.exam;
  },

  submitExam: async (
    answers: { questionId: number; selected: string }[],
  ): Promise<Server.ExamResultDTO> => {
    const data = await request<{ result: Server.ExamResultDTO }>("/api/exam/submit", {
      method: "POST",
      ...AUTH_FETCH_INIT,
      body: JSON.stringify({ answers }),
      headers: { "Content-Type": "application/json" },
    });
    return data.result;
  },

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
    answers: { questionId: number; selected: string }[],
  ): Promise<{ correct: number; total: number; score: number; pointsEarned: number }> => {
    const data = await request<{ summary: { correct: number; total: number; score: number; pointsEarned: number } }>(
      "/api/practice/submit",
      {
        method: "POST",
        ...AUTH_FETCH_INIT,
        body: JSON.stringify({ answers }),
        headers: { "Content-Type": "application/json" },
      },
    );
    return data.summary;
  },

  documents: (): Promise<Server.DocumentDTO[]> =>
    request<{ documents: Server.DocumentDTO[] }>("/api/documents").then((d) => d.documents),

  bookmarks: (): Promise<number[]> =>
    request<{ bookmarked: number[] }>("/api/bookmarks").then((d) => d.bookmarked),

  toggleBookmark: (questionId: number): Promise<{ bookmarked: boolean }> =>
    mutate("/api/bookmarks", "POST", { questionId }),

  toggleStudyTask: (taskId: number): Promise<{ completed: boolean }> =>
    mutate(`/api/study-plan/tasks/${taskId}/toggle`, "POST"),
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
};
