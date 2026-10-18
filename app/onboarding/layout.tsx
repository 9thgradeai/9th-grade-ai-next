import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Getting started | 9Th-Grade AI",
  description:
    "Set up your exam track, targets, and study preferences to personalize your 9Th-Grade AI dashboard.",
  alternates: { canonical: "/onboarding" },
  robots: { index: false, follow: true },
};

export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  return children;
}
