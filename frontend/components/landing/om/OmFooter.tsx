import Link from "next/link";
import BrandMark from "@/components/ui/BrandMark";

const COLUMNS = [
  {
    title: "Study",
    links: [
      { href: "/dashboard/question-bank", label: "Question bank" },
      { href: "/dashboard/mock-tests", label: "Mock tests" },
      { href: "/dashboard/flashcards", label: "Flashcards" },
      { href: "/dashboard/study-plan", label: "Study planner" },
    ],
  },
  {
    title: "Explore",
    links: [
      { href: "/current-affairs", label: "Current affairs" },
      { href: "/guides", label: "Guides" },
      { href: "/blog", label: "Blog" },
      { href: "/docs", label: "Docs" },
    ],
  },
  {
    title: "Product",
    links: [
      { href: "/about", label: "About" },
      { href: "/press", label: "Press" },
      { href: "/careers", label: "Careers" },
      { href: "/partners", label: "Partners" },
    ],
  },
  {
    title: "Legal",
    links: [
      { href: "/privacy", label: "Privacy" },
      { href: "/terms", label: "Terms" },
      { href: "/login", label: "Log in" },
      { href: "/register", label: "Create account" },
    ],
  },
];

export default function OmFooter() {
  return (
    <footer className="om-footer">
      <div className="om-shell">
        <div className="om-footer-top">
          <div className="om-footer-brand">
            <Link href="/" className="om-brand">
              <BrandMark className="h-9 w-9 rounded-[11px]" />
              <span>
                9Th-Grade<span className="om-brand-thin"> AI</span>
              </span>
            </Link>
            <p>
              Free, bilingual exam preparation for Bangladeshi government job
              aspirants. Built in the open, owned by the people who study here.
            </p>
            <p className="om-footer-note">
              BCS · Bank · Teacher recruitment · 9th-grade posts
            </p>
          </div>

          <div className="om-footer-grid">
            {COLUMNS.map((col) => (
              <div key={col.title}>
                <h3>{col.title}</h3>
                <ul>
                  {col.links.map((link) => (
                    <li key={link.href}>
                      <Link href={link.href}>{link.label}</Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        <div className="om-footer-bottom">
          <p>© {new Date().getFullYear()} 9Th-Grade AI · Free and open source.</p>
          <p className="om-footer-mono">Made for Bangladesh, in English and বাংলা.</p>
        </div>
      </div>
    </footer>
  );
}
