"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import BrandMark from "@/components/ui/BrandMark";

const NAV = [
  { href: "/", label: "Home" },
  { href: "/dashboard/question-bank", label: "Question bank" },
  { href: "/current-affairs", label: "Current affairs" },
  { href: "/guides", label: "Guides" },
];

export default function OmHeader() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`om-header ${scrolled ? "is-scrolled" : ""}`}
      data-om-header
    >
      <a href="#main" className="om-skip">
        Skip to content
      </a>
      <div className="om-header-inner">
        <Link href="/" className="om-brand" aria-label="9Th-Grade AI home">
          <BrandMark className="h-8 w-8 rounded-[10px]" />
          <span>
            9Th-Grade<span className="om-brand-thin"> AI</span>
          </span>
        </Link>

        <nav className="om-nav" aria-label="Primary">
          {NAV.map((item) => (
            <Link key={item.href} href={item.href} className="om-nav-link">
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="om-header-actions">
          <Link href="/login" className="om-link-quiet">
            Log in
          </Link>
          <Link href="/register" className="om-btn om-btn-sm">
            Start free
          </Link>
          <button
            type="button"
            className="om-menu-toggle"
            aria-expanded={open}
            aria-controls="om-mobile-nav"
            onClick={() => setOpen((v) => !v)}
          >
            {open ? "Close" : "Menu"}
          </button>
        </div>
      </div>

      {open ? (
        <div id="om-mobile-nav" className="om-mobile-nav">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="om-nav-link"
              onClick={() => setOpen(false)}
            >
              {item.label}
            </Link>
          ))}
          <Link href="/login" className="om-nav-link" onClick={() => setOpen(false)}>
            Log in
          </Link>
          <Link href="/register" className="om-btn om-btn-sm" onClick={() => setOpen(false)}>
            Start free
          </Link>
        </div>
      ) : null}
    </header>
  );
}
