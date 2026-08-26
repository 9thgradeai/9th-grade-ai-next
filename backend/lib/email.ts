import "server-only";

import { log } from "~backend/infrastructure/observability/logger";

export type EmailMessage = {
  to: string;
  subject: string;
  html: string;
  /** Optional plain-text fallback. */
  text?: string;
};

/**
 * Send a transactional email.
 *
 * Transport is Resend when `RESEND_API_KEY` is set (a single `fetch` call —
 * no SDK dependency). When no transport is configured the message is logged
 * instead of sent; callers surface any dev-only links (password reset /
 * email verification) to the client in non-production so the flows stay
 * testable locally. Configure `RESEND_API_KEY` + `EMAIL_FROM` in production.
 */
export async function sendEmail(msg: EmailMessage): Promise<{ sent: boolean }> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM ?? "9Th-Grade AI <no-reply@9thgrade.ai>";

  if (!apiKey) {
    log.info("email.send.skipped.no-transport", { to: msg.to, subject: msg.subject });
    return { sent: false };
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: msg.to,
        subject: msg.subject,
        html: msg.html,
        text: msg.text,
      }),
    });
    if (res.ok) return { sent: true };
    log.error("email.send.failed", { status: res.status, to: msg.to });
    } catch (err) {
      log.error("email.send.error", {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  return { sent: false };
}
