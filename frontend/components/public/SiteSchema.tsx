import { SITE_NAME, SITE_URL, absoluteUrl } from "@/lib/seo";

/**
 * Site-wide structured data: Organization + WebSite (the "business schema").
 * Server component rendered once from the root layout so every page —
 * marketing, blog, dashboard shell, emits it in the initial HTML.
 *
 * The home page separately declares WebApplication (app/page.tsx), and
 * Breadcrumbs emits BreadcrumbList per page (frontend/components/ui/
 * Breadcrumbs.tsx); JSON-LD here must not duplicate either.
 */
const ORGANIZATION = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: SITE_NAME,
  url: SITE_URL,
  logo: {
    "@type": "ImageObject",
    url: absoluteUrl("/icons/icon.svg"),
    width: 512,
    height: 512,
  },
  // Public repo is the organization's canonical profile today; extend when
  // dedicated social accounts exist.
  sameAs: ["https://github.com/9thgradeai/9th-grade-ai-next"],
  description:
    "Free, open-source AI-powered exam preparation platform for Bangladeshi government job aspirants (BCS, Bank, Teacher Recruitment).",
};

const WEBSITE = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: SITE_NAME,
  url: SITE_URL,
  publisher: { "@type": "Organization", name: SITE_NAME, url: SITE_URL },
};

export default function SiteSchema() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(ORGANIZATION) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(WEBSITE) }}
      />
    </>
  );
}
