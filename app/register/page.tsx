import type { Metadata } from "next";
import { pageMeta } from "@/lib/seo";
import AuthExperience from "@/components/auth/AuthExperience";

export const metadata: Metadata = pageMeta({
  path: "/register",
  title: "Create account | 9Th-Grade AI",
  description:
    "Create a free 9Th-Grade AI account and start AI-powered exam preparation for BCS, Bank, and Teacher recruitment exams in Bangladesh.",
  noIndex: true,
});

/**
 * Signup is its own URL so the register flow is shareable, linkable, and
 * indexable-safe (noindex above). It renders the same AuthExperience the
 * /login page uses, pinned to the signup stage.
 */
export default function RegisterPage() {
  return <AuthExperience initialStage="signup" />;
}
