import { Suspense } from "react";
import { pageMeta } from "@/lib/seo";
import type { Metadata } from "next";
import LoginEntry from "@/components/auth/LoginEntry";

export const metadata: Metadata = pageMeta({
  path: "/login",
  title: "Sign in | 9Th-Grade AI",
  description:
    "Sign in to 9Th-Grade AI to continue your AI-powered exam preparation for BCS, Bank, and Teacher recruitment exams.",
  noIndex: true,
});

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginEntry />
    </Suspense>
  );
}
