"use client";

import { useSearchParams } from "next/navigation";
import AuthExperience from "./AuthExperience";

/** Reads ?register=true client-side so the /login route can stay static. */
export default function LoginEntry() {
  const searchParams = useSearchParams();
  const register = searchParams.get("register") === "true";
  return <AuthExperience initialStage={register ? "signup" : null} />;
}
