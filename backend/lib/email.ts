import "server-only";

import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";
import { log } from "~backend/infrastructure/observability/logger";

export type EmailMessage = {
  to: string;
  subject: string;
  html: string;
  /** Optional plain-text fallback. */
  text?: string;
};

export type EmailTransportName = "smtp" | "resend" | "none";

/**
 * Resolve which transactional-email transport is configured, in priority
 * order. SMTP is preferred because it works at $0 with a free account from
 * any provider (Gmail App Password, Zoho, Tutanota, Brevo SMTP relay, …) and
 * needs no custom domain. Resend is supported as an alternative when only
 * `RESEND_API_KEY` is set.
 */
export function getEmailTransportName(): EmailTransportName {
  if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
    return "smtp";
  }
  if (process.env.RESEND_API_KEY) {
    return "resend";
  }
  return "none";
}

/**
 * Whether a transactional email transport is configured.
 *
 * When no transport exists, verification emails cannot be delivered, so flows
 * that depend on confirmation-by-email (registration / resend) complete the
 * verification implicitly instead of locking accounts behind a link that never
 * arrives. See `backend/services/user.ts`.
 */
export function hasEmailTransport(): boolean {
  return getEmailTransportName() !== "none";
}

let cachedTransporter: Transporter | null = null;

function getSmtpTransporter(): Transporter {
  if (!cachedTransporter) {
    cachedTransporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT ?? 587),
      secure: process.env.SMTP_SECURE === "true",
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }
  return cachedTransporter;
}

async function sendViaSmtp(msg: EmailMessage): Promise<boolean> {
  try {
    const from = process.env.EMAIL_FROM ?? process.env.SMTP_USER;
    if (!from) return false;
    await getSmtpTransporter().sendMail({
      from,
      to: msg.to,
      subject: msg.subject,
      html: msg.html,
      text: msg.text,
    });
    return true;
  } catch (err) {
    log.error("email.send.smtp.error", {
      error: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}

async function sendViaResend(msg: EmailMessage): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM ?? "9Th-Grade AI <no-reply@9thgrade.ai>";
  if (!apiKey) return false;
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
    if (res.ok) return true;
    log.error("email.send.resend.failed", { status: res.status, to: msg.to });
  } catch (err) {
    log.error("email.send.resend.error", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
  return false;
}

/**
 * Send a transactional email.
 *
 * Uses the configured transport (SMTP or Resend). When no transport is
 * configured the message is logged instead of sent; callers surface any
 * dev-only links (password reset / email verification) to the client in
 * non-production so the flows stay testable locally. Configure the transport
 * env vars in production (see `docs/EMAIL.md`).
 */
export async function sendEmail(msg: EmailMessage): Promise<{ sent: boolean }> {
  const transport = getEmailTransportName();
  if (transport === "none") {
    log.info("email.send.skipped.no-transport", { to: msg.to, subject: msg.subject });
    return { sent: false };
  }
  const sent = transport === "smtp" ? await sendViaSmtp(msg) : await sendViaResend(msg);
  if (!sent && process.env.NODE_ENV !== "production") {
    log.error("email.send.failed", { transport, to: msg.to, subject: msg.subject });
  }
  return { sent };
}
