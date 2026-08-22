import type { Metadata } from "next";
import PublicShell from "@/components/public/PublicShell";
import PageHero from "@/components/public/PageHero";
import StatusPill from "@/components/ui/StatusPill";

export const metadata: Metadata = {
  alternates: { canonical: "/terms" },
  title: "Terms of Service — 9Th-Grade AI",
  description:
    "The terms governing your use of the 9Th-Grade AI platform. Last updated August 2026.",
};

const sections = [
  {
    title: "1. Acceptance of Terms",
    body: [
      "By accessing or using 9Th-Grade AI (\"the Platform\"), you agree to be bound by these Terms of Service and the Privacy Policy. If you do not agree, please do not use the Platform.",
    ],
  },
  {
    title: "2. The Service",
    body: [
      "The Platform provides exam-preparation tools including a syllabus explorer, question bank, mock tests, flashcards, a study planner, and AI-powered tutoring.",
      "The Platform is provided free of charge and is open source. We may add, change, or remove features over time.",
    ],
  },
  {
    title: "3. Accounts",
    body: [
      "You are responsible for maintaining the confidentiality of your account credentials and for all activity under your account.",
      "You must provide accurate information when creating an account and keep it up to date.",
      "We may suspend or terminate accounts that violate these terms or the law.",
    ],
  },
  {
    title: "4. Acceptable Use",
    body: [
      "Do not misuse the Platform: no scraping at abusive scale, no attempts to break security, no impersonation, and no uploading of content you do not have the right to share.",
      "Do not use AI outputs to commit academic dishonesty in live, supervised examinations. The Platform is a study tool.",
    ],
  },
  {
    title: "5. AI-Generated Content",
    body: [
      "AI-generated answers are provided as-is for study assistance. They may be inaccurate, and they are clearly labelled as AI or mock output when no API key is configured.",
      "AI output is never authoritative for exam answers or official decisions — always cross-check with official syllabi and sources.",
    ],
  },
  {
    title: "6. Intellectual Property",
    body: [
      "The Platform's source code is open source and licensed for community use.",
      "The 9Th-Grade AI brand, logo, and design remain the property of the project and may not be used without permission.",
    ],
  },
  {
    title: "7. Disclaimers & Limitation of Liability",
    body: [
      "The Platform is provided \"as is\" without warranties of any kind, express or implied. We do not guarantee exam outcomes, results, or the accuracy of all content.",
      "To the maximum extent permitted by law, 9Th-Grade AI shall not be liable for indirect or consequential damages arising from use of the Platform.",
    ],
  },
  {
    title: "8. Changes & Contact",
    body: [
      "We may update these terms as the Platform evolves. Continued use after changes constitutes acceptance.",
      "Questions about these terms? Email hello@9thgrade.ai.",
    ],
  },
];

export default function TermsPage() {
  return (
    <PublicShell>
      <PageHero
        eyebrow="TERMS OF SERVICE"
        title="Clear Rules for a"
        highlight="Clean Platform"
        description="Last updated August 2026. The short version: be honest, don't break things, and treat this as the free study tool it is."
      />

      <section className="py-10 md:py-16 px-4 sm:px-6">
        <div className="max-w-3xl mx-auto">
          <div className="mb-8 flex items-center gap-3">
            <StatusPill label="TERMS ACTIVE" />
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
            Questions about these terms? Email{" "}
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