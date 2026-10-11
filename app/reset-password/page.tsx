import type { Metadata } from "next";
import { Suspense } from "react";
import ResetPasswordClient from "./ResetPasswordClient";

export const metadata: Metadata = { robots: { index: false, follow: true } };

export default function ResetPasswordPage() {
  // useSearchParams in the client requires a Suspense boundary for prerendering.
  return (
    <Suspense>
      <ResetPasswordClient />
    </Suspense>
  );
}
