import type { Metadata } from "next";
import PublicShell from "@/components/public/PublicShell";
import PageHero from "@/components/public/PageHero";
import StatusPill from "@/components/ui/StatusPill";

export const metadata: Metadata = {
  alternates: { canonical: "/privacy" },
  title: "Privacy Policy — 9Th-Grade AI",
  description:
    "How 9Th-Grade AI collects, uses, and protects your data. Last updated August 2026.",
};

const sections = [
  {
    title: "1. Information We Collect",
    body: [
      "Account data: your name, email address, and a password hashed with bcrypt (cost 10).",
      "Learning data: practice attempts, quiz results, flashcards reviewed, study plans, bookmarks, and progress metrics — stored to power your analytics and recommendations.",
      "Device & usage data: anonymous technical data such as browser type and page interactions, used to keep the platform fast and reliable.",
    ],
  },
  {
    title: "2. How We Use Your Data",
    body: [
      "To operate and personalize the platform: adaptive mock tests, spaced-repetition scheduling, progress analytics, and AI tutoring.",
      "To improve the product through aggregate, de-identified usage analysis.",
      "To communicate with you about account activity and platform updates (you can opt out of non-essential email).",
    ],
  },
  {
    title: "3. AI Processing",
    body: [
      "When you use the AI solver or tutor, your query is sent to the configured AI provider. AI responses are clearly labelled and are never used to authorize, validate, or make security decisions.",
      "If no AI API key is configured, the system returns clearly-labelled mock responses — your query is not sent to any third party.",
    ],
  },
  {
    title: "4. Data Sharing & Retention",
    body: [
      "We do not sell your data. We share data only with the service providers required to operate the platform (hosting and AI inference), and only to the extent necessary.",
      "Your learning data is retained as long as your account is active. You may request account deletion at any time, after which personal data is removed within 30 days.",
    ],
  },
  {
    title: "5. Cookies & Sessions",
    body: [
      "Authentication uses a JWT session stored in an HttpOnly cookie with a 7-day expiry. No session tokens are stored in client-side storage.",
      "Theme preferences are stored locally on your device.",
    ],
  },
  {
    title: "6. Your Rights",
    body: [
      "You may access, correct, export, or delete your personal data by contacting hello@9thgrade.ai. We respond to verified requests within 30 days.",
      "You may also exercise these rights directly through your dashboard where applicable.",
    ],
  },
  {
    title: "7. Security",
    body: [
      "Passwords are hashed with bcryptjs (cost 10). Connections are encrypted (HTTPS). All API inputs are validated, and security headers are applied across the platform.",
      "No security measure is absolute, but we work hard to keep your data safe.",
    ],
  },
  {
    title: "8. Changes to This Policy",
    body: [
      "We may update this policy as the platform evolves. Material changes will be announced on the site, and the 'last updated' date above will be revised.",
    ],
  },
];

export default function PrivacyPage() {
  return (
    <PublicShell>
      <PageHero
        eyebrow="PRIVACY POLICY"
        title="Your Data,"
        highlight="On Your Terms"
        description="Last updated August 2026. This policy explains what we collect, why, and the controls you have over your information."
      />

      <section className="py-10 md:py-16 px-4 sm:px-6">
        <div className="max-w-3xl mx-auto">
          <div className="mb-8 flex items-center gap-3">
            <StatusPill label="POLICY ACTIVE" />
            <span className="text-xs text-zinc-500 font-mono">v2.4 · applies to all users</span>
          </div>

          <div className="space-y-8">
            {sections.map((section) => (
              <section key={section.title} className="glass-card rounded-2xl border border-white/10 p-6 md:p-8">
                <h2 className="font-display text-lg font-semibold text-white mb-3">{section.title}</h2>
                <ul className="space-y-2.5">
                  {section.body.map((item, index) => (
                    <li key={index} className="flex items-start gap-2.5 text-sm text-zinc-400 leading-relaxed">
                      <span className="w-1 h-1 rounded-full bg-emerald-400 mt-2 flex-shrink-0" aria-hidden="true" />
                      {item}
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>

          <p className="mt-10 text-sm text-zinc-500 leading-relaxed">
            Questions about this policy? Email{" "}
            <a href="mailto:hello@9thgrade.ai" className="text-emerald-400 hover:text-emerald-300 transition-colors">
              hello@9thgrade.ai
            </a>
            .
          </p>
        </div>
      </section>
    </PublicShell>
  );
}