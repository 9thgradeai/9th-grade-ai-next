import AuthExperience from "@/components/auth/AuthExperience";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const register = typeof params.register === "string" && params.register === "true";

  return <AuthExperience initialStage={register ? "signup" : null} />;
}