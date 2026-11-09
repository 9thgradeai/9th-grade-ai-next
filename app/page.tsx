import { prisma } from "~backend/db";
import OmLanding from "@/components/landing/om/OmLanding";

export const revalidate = 3600;

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: "9Th-Grade AI",
  applicationCategory: "EducationalApplication",
  operatingSystem: "Web",
  description:
    "Free AI-powered exam preparation for Bangladeshi government job aspirants, BCS, Bank, and Teacher recruitment. Full-length mock tests, spaced-repetition flashcards, study planner, and a bilingual AI tutor.",
  url: process.env.NEXT_PUBLIC_SITE_URL ?? "https://9thgrade.ai",
  offers: { "@type": "Offer", price: "0", priceCurrency: "BDT" },
};

export default async function Home() {
  // Degrade gracefully when the DB is unreachable (offline dev, cold Neon
  // branch): the landing page must never hard-crash on a single count query.
  // Bounded with a 400ms race so a cold database never inflates TTFB/LCP —
  // the hero paints instantly with a fallback count instead of awaiting Neon.
  const withTimeout = <T,>(p: Promise<T>, ms: number, fallback: T): Promise<T> =>
    Promise.race([p, new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms))]);
  // Live proof for the hero strip: real question count, not vanity stats.
  let questionCount = 0;
  try {
    questionCount = await withTimeout(prisma.question.count(), 400, 0);
  } catch (error) {
    console.error("[home] question.count failed, rendering with fallback 0:", error);
  }
  return (
    <>
      <script
        id="jsonld-home"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <OmLanding questionCount={questionCount} />
    </>
  );
}
