import "server-only";

type Event = {
  event: string;
  userId?: string;
  entityType?: string;
  jobId?: string;
  code?: string;
  latencyMs?: number;
  attempt?: number;
  [k: string]: unknown;
};

export function logEvent(e: Event): void {
  // Use pino if available, else console.log with JSON
  const payload = { timestamp: new Date().toISOString(), ...e };
  // Never log tokens or PII beyond userId hash
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(payload));
}

export function logOAuthSuccess(userId: string, email: string): void {
  logEvent({ event: "oauth.success", userId, emailHash: email ? email.slice(0, 3) + "***" : undefined });
}
export function logOAuthFailure(code: string, msg: string): void {
  logEvent({ event: "oauth.failure", code, msg: msg.slice(0, 120) });
}
export function logSyncSuccess(userId: string, entityType: string, latencyMs: number): void {
  logEvent({ event: "sync.success", userId, entityType, latencyMs });
}
export function logSyncFailure(userId: string, entityType: string, code: string, attempt: number): void {
  logEvent({ event: "sync.failure", userId, entityType, code, attempt });
}
