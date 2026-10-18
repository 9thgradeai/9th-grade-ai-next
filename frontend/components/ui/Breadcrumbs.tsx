import Link from "next/link";
import { absoluteUrl } from "@/lib/seo";

export type BreadcrumbItem = {
  label: string;
  href?: string;
};

/** Human labels for the first path segment, used when no items are supplied. */
const SEGMENT_LABELS: Record<string, string> = {
  tracks: "Exam Tracks",
  guides: "Study Guides",
  vocab: "Vocabulary",
  "current-affairs": "Current Affairs",
  archive: "Archive",
  blog: "Blog",
  about: "About",
  careers: "Careers",
  partners: "Partners",
  press: "Press",
  docs: "API Docs",
  privacy: "Privacy Policy",
  terms: "Terms of Service",
  login: "Sign in",
  register: "Create account",
  "forgot-password": "Reset password",
  "reset-password": "Set new password",
  "verify-email": "Verify email",
  onboarding: "Onboarding",
};

/**
 * Renders an accessible breadcrumb trail plus the matching schema.org
 * BreadcrumbList JSON-LD. Pass `items` for dynamic routes (blog posts); when
 * omitted the trail is derived from the current pathname.
 */
export default function Breadcrumbs({
  items,
  className = "",
}: {
  items?: BreadcrumbItem[];
  className?: string;
}) {
  const trail: BreadcrumbItem[] = items ?? deriveItems();

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: trail.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.label,
      ...(item.href ? { item: absoluteUrl(item.href) } : {}),
    })),
  };

  return (
    <nav aria-label="Breadcrumb" className={className}>
      <ol className="flex flex-wrap items-center justify-center gap-1.5 text-xs font-mono text-[var(--text-muted)]">
        {trail.map((item, index) => {
          const isLast = index === trail.length - 1;
          return (
            <li key={`${item.label}-${index}`} className="flex items-center gap-1.5">
              {item.href && !isLast ? (
                <Link href={item.href} className="transition-colors hover:text-[var(--primary)]">
                  {item.label}
                </Link>
              ) : (
                <span aria-current={isLast ? "page" : undefined}>{item.label}</span>
              )}
              {!isLast ? <span aria-hidden="true" className="text-[var(--text-muted)]">/</span> : null}
            </li>
          );
        })}
      </ol>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
    </nav>
  );
}

function deriveItems(): BreadcrumbItem[] {
  if (typeof window === "undefined") {
    return [{ label: "Home", href: "/" }, { label: "Page" }];
  }
  const segments = window.location.pathname.split("/").filter(Boolean);
  const trail: BreadcrumbItem[] = [{ label: "Home", href: "/" }];
  let path = "";
  segments.forEach((segment, index) => {
    path += `/${segment}`;
    const label = SEGMENT_LABELS[segment] ?? titleCase(segment);
    const isLast = index === segments.length - 1;
    trail.push({ label, href: isLast ? undefined : path });
  });
  return trail;
}

function titleCase(value: string): string {
  return value
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}
