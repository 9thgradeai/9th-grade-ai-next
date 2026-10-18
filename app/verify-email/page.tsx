import type { Metadata } from "next";
import { pageMeta } from "@/lib/seo";
import { Suspense } from "react";
import VerifyEmailClient from "./VerifyEmailClient";

export const metadata: Metadata = pageMeta({
  path: "/verify-email",
  title: "Verify your email | 9Th-Grade AI",
  description:
    "Confirm your email address to unlock your 9Th-Grade AI account.",
  noIndex: true,
});

export default function VerifyEmailPage() {
  // useSearchParams in the client requires a Suspense boundary for prerendering.
  return (
    <Suspense>
      <VerifyEmailClient />
    </Suspense>
  );
}
