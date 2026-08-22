"use client";

import type { Server } from "@/lib/types";

// ── Constants ──────────────────────────────────────────────

const DEFAULT_TIMEOUT_MS = 15_000;
const MAX_RETRIES = 3;
const RETRY_DELAY_BASE_MS = 500;

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

async function request<T>(
  url: string,
  options: RequestInit = {},
  retries = MAX_RETRIES,
): Promise<T> {
  const method = (options.method ?? "GET").toUpperCase();
  const headers = new Headers(options.headers);

  if (!headers.has("x-request-id")) {
    headers.set("x-request-id", crypto.randomUUID());
  }

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetchWithTimeout(url, { ...options, headers });

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

      if (method === "NO_CONTENT" || response.status === 204) {
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
      body: JSON.stringify({ flashcardId, rating }),
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

  markNotificationRead: async (id: number): Promise<{ read: boolean }> => {
    const response = await fetch(`/api/notifications/${id}/read`, {
      method: "POST",
      credentials: "include",
      headers: {
        "x-request-id": crypto.randomUUID(),
      },
      cache: "no-store",
    });

    if (!response.ok) {
      const body = await response.json().catch(() => ({ error: response.statusText }));
      throw new ApiError(
        typeof body.error === "string" ? body.error : response.statusText,
        body.code ?? `HTTP_${response.status}`,
        response.status,
      );
    }

    return response.json();
  },

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
    const response = await fetch("/api/exam/build", {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        "x-request-id": crypto.randomUUID(),
      },
      body: JSON.stringify(config),
      cache: "no-store",
    });

    if (!response.ok) {
      const body = await response.json().catch(() => ({ error: response.statusText }));
      throw new ApiError(
        typeof body.error === "string" ? body.error : response.statusText,
        body.code ?? `HTTP_${response.status}`,
        response.status,
      );
    }

    const data = (await response.json()) as { exam: Server.ExamBuildResultDTO };
    return data.exam;
  },

  submitExam: async (
    answers: { questionId: number; selected: string }[],
  ): Promise<Server.ExamResultDTO> => {
    const response = await fetch("/api/exam/submit", {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        "x-request-id": crypto.randomUUID(),
      },
      body: JSON.stringify({ answers }),
      cache: "no-store",
    });

    if (!response.ok) {
      const body = await response.json().catch(() => ({ error: response.statusText }));
      throw new ApiError(
        typeof body.error === "string" ? body.error : response.statusText,
        body.code ?? `HTTP_${response.status}`,
        response.status,
      );
    }

    const data = (await response.json()) as { result: Server.ExamResultDTO };
    return data.result;
  },

  submitDailyQuiz: async (
    quizId: number,
    answers: { questionId: number; selected: string }[],
  ): Promise<{ correct: number; total: number; score: number; pointsEarned: number }> => {
    const response = await fetch("/api/daily-quiz/submit", {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        "x-request-id": crypto.randomUUID(),
      },
      body: JSON.stringify({ quizId, answers }),
      cache: "no-store",
    });

    if (!response.ok) {
      const body = await response.json().catch(() => ({ error: response.statusText }));
      throw new ApiError(
        typeof body.error === "string" ? body.error : response.statusText,
        body.code ?? `HTTP_${response.status}`,
        response.status,
      );
    }

    const data = (await response.json()) as { summary: { correct: number; total: number; score: number; pointsEarned: number } };
    return data.summary;
  },

  submitPractice: async (
    answers: { questionId: number; selected: string }[],
  ): Promise<{ correct: number; total: number; score: number; pointsEarned: number }> => {
    const response = await fetch("/api/practice/submit", {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        "x-request-id": crypto.randomUUID(),
      },
      body: JSON.stringify({ answers }),
      cache: "no-store",
    });

    if (!response.ok) {
      const body = await response.json().catch(() => ({ error: response.statusText }));
      throw new ApiError(
        typeof body.error === "string" ? body.error : response.statusText,
        body.code ?? `HTTP_${response.status}`,
        response.status,
      );
    }

    const data = (await response.json()) as { summary: { correct: number; total: number; score: number; pointsEarned: number } };
    return data.summary;
  },

  documents: (): Promise<Server.DocumentDTO[]> =>
    request<{ documents: Server.DocumentDTO[] }>("/api/documents").then((d) => d.documents),

  bookmarks: (): Promise<number[]> =>
    request<{ bookmarked: number[] }>("/api/bookmarks").then((d) => d.bookmarked),

  toggleBookmark: async (questionId: number): Promise<{ bookmarked: boolean }> => {
    const response = await fetch("/api/bookmarks", {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        "x-request-id": crypto.randomUUID(),
      },
      body: JSON.stringify({ questionId }),
      cache: "no-store",
    });

    if (!response.ok) {
      const body = await response.json().catch(() => ({ error: response.statusText }));
      throw new ApiError(
        typeof body.error === "string" ? body.error : response.statusText,
        body.code ?? `HTTP_${response.status}`,
        response.status,
      );
    }

    return response.json();
  },

  toggleStudyTask: async (taskId: number): Promise<{ completed: boolean }> => {
    const response = await fetch(`/api/study-plan/tasks/${taskId}/toggle`, {
      method: "POST",
      credentials: "include",
      headers: {
        "x-request-id": crypto.randomUUID(),
      },
      cache: "no-store",
    });

    if (!response.ok) {
      const body = await response.json().catch(() => ({ error: response.statusText }));
      throw new ApiError(
        typeof body.error === "string" ? body.error : response.statusText,
        body.code ?? `HTTP_${response.status}`,
        response.status,
      );
    }

    return response.json();
  },
};

// ── Account / settings methods (auth endpoints) ─────────────

async function authRequest<T>(
  url: string,
  method: string,
  body?: unknown,
): Promise<T> {
  const response = await fetch(url, {
    method,
    credentials: "include",
    headers: {
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      "x-request-id": crypto.randomUUID(),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({ error: response.statusText }));
    throw new ApiError(
      typeof payload.error === "string" ? payload.error : response.statusText,
      payload.code ?? `HTTP_${response.status}`,
      response.status,
    );
  }

  if (response.status === 204) {
    return undefined as T;
  }
  return response.json() as Promise<T>;
}

export const account = {
  updateProfile: (name: string): Promise<{ user: Server.UserDTO }> =>
    authRequest("/api/auth/profile", "PATCH", { name }),

  changePassword: (currentPassword: string, newPassword: string, confirmPassword: string) =>
    authRequest<{ success: boolean }>("/api/auth/change-password", "POST", {
      currentPassword,
      newPassword,
      confirmPassword,
    }),

  deleteAccount: (): Promise<{ success: boolean }> =>
    authRequest("/api/auth/account", "DELETE"),
};
