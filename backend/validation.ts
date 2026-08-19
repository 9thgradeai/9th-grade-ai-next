export interface LoginInput {
  email: string;
  password: string;
}

export interface RegisterInput {
  name: string;
  email: string;
  password: string;
}

export interface QuestionSearchFilters {
  subject?: string;
  topic?: string;
  difficulty?: string;
  q?: string;
  paths?: string[];
  limit?: number;
  id?: number;
}

export interface PaginationParams {
  page: number;
  limit: number;
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

export function validateLoginInput(body: unknown): LoginInput {
  if (!body || typeof body !== "object") {
    throw new Error("Request body must be an object");
  }

  const record = body as Record<string, unknown>;
  const email = record.email;
  const password = record.password;

  if (!isString(email) || !email.includes("@")) {
    throw new Error("Valid email is required");
  }
  if (!isString(password) || password.length < 1) {
    throw new Error("Password is required");
  }

  return { email: email.toLowerCase().trim(), password };
}

export function validateRegisterInput(body: unknown): RegisterInput {
  if (!body || typeof body !== "object") {
    throw new Error("Request body must be an object");
  }

  const record = body as Record<string, unknown>;
  const name = record.name;
  const email = record.email;
  const password = record.password;

  if (!isString(name) || name.trim().length < 1) {
    throw new Error("Name is required");
  }
  if (!isString(email) || !email.includes("@")) {
    throw new Error("Valid email is required");
  }
  if (!isString(password) || password.length < 6) {
    throw new Error("Password must be at least 6 characters");
  }

  return { name: name.trim(), email: email.toLowerCase().trim(), password };
}

export function validateQuestionSearchParams(params: URLSearchParams): QuestionSearchFilters {
  const filters: QuestionSearchFilters = {};

  const subject = params.get("subject");
  const topic = params.get("topic");
  const difficulty = params.get("difficulty");
  const q = params.get("q");
  const limit = params.get("limit");
  const id = params.get("id");
  const paths = params.get("paths");

  if (isString(subject) && subject.length > 0) filters.subject = subject;
  if (isString(topic) && topic.length > 0) filters.topic = topic;
  if (isString(difficulty) && difficulty.length > 0) filters.difficulty = difficulty;
  if (isString(q) && q.length > 0) filters.q = q;
  if (isString(paths) && paths.length > 0) {
    filters.paths = paths
      .split(",")
      .map((p) => p.trim())
      .filter((p) => p.length > 0);
  }

  if (isString(limit)) {
    const parsed = Number(limit);
    if (!Number.isNaN(parsed) && parsed > 0) {
      filters.limit = Math.min(Math.floor(parsed), 200);
    }
  }

  if (isString(id)) {
    const parsed = Number(id);
    if (!Number.isNaN(parsed) && parsed > 0) {
      filters.id = parsed;
    }
  }

  return filters;
}

export function validatePagination(params: URLSearchParams): PaginationParams {
  const pageParam = params.get("page");
  const limitParam = params.get("limit");

  let page = 1;
  let limit = 20;

  if (isString(pageParam)) {
    const parsed = Number(pageParam);
    if (!Number.isNaN(parsed) && parsed > 0) {
      page = Math.floor(parsed);
    }
  }

  if (isString(limitParam)) {
    const parsed = Number(limitParam);
    if (!Number.isNaN(parsed) && parsed > 0) {
      limit = Math.min(Math.floor(parsed), 100);
    }
  }

  return { page, limit };
}

export function validatePositiveInteger(value: unknown, fieldName: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    throw new Error(fieldName + " must be a positive integer.");
  }
  return value;
}
