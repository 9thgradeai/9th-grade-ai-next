import type { Metadata } from "next";
import { Suspense } from "react";
import VerifyEmailClient from "./VerifyEmailClient";

export const metadata: Metadata = { robots: { index: false, follow: true } };

export default function VerifyEmailPage() {
  // useSearchParams in the client requires a Suspense boundary for prerendering.
  return (
    <Suspense>
      <VerifyEmailClient />
    </Suspense>
  );
}
