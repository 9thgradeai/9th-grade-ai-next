import type { Metadata } from "next";

export const metadata: Metadata = { robots: { index: false, follow: true } };

import ForgotPasswordClient from "./ForgotPasswordClient"

export default function ForgotPasswordPage() {
  return <ForgotPasswordClient />
}
