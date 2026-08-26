"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { motion, useScroll, useMotionValueEvent, useReducedMotion } from "framer-motion";
import StatusPill from "./ui/StatusPill";
import BrandMark from "./ui/BrandMark";

const navLinks = [
  { href: "/#features", label: "Features", anchor: "#features" },
  { href: "/#syllabus", label: "Syllabus", anchor: "#syllabus" },
  { href: "/tracks", label: "Tracks" },
];

export default function TerminalHeader() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [activeLink, setActiveLink] = useState<string | null>(null);
  const [spySection, setSpySection] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const { scrollY } = useScroll();
  const shouldReduceMotion = useReducedMotion();

  useMotionValueEvent(scrollY, "change", (v) => setScrolled(v > 24));

  // Scrollspy — highlight the nav link for the section in view. Only
  // same-page anchors are observed; full-page links (e.g. /tracks) skip it.
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const sections = navLinks
      .map((l) => (l.anchor ? document.querySelector<HTMLElement>(l.anchor) : null))
      .filter((s): s is HTMLElement => Boolean(s));
    if (sections.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        setSpySection(visible ? `#${visible.target.id}` : null);
      },
      { rootMargin: "-40% 0px -55% 0px", threshold: [0, 0.25, 0.5] },
    );
    sections.forEach((s) => observer.observe(s));
    return () => observer.disconnect();
  }, []);

  // Close the mobile menu on Escape and trap focus while open.
  useEffect(() => {
    if (!isMobileMenuOpen) return;
    // Lock background scrolling so menu interaction stays predictable.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape" && e.key !== "Tab") return;
      const menu = menuRef.current;
      if (!menu) return;
      const nodes = Array.from(
        menu.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      );
      if (nodes.length === 0) return;
      if (e.key === "Escape") {
        setIsMobileMenuOpen(false);
        return;
      }
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    menuRef.current?.querySelector<HTMLElement>("a[href]")?.focus();
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [isMobileMenuOpen]);

  const isLinkActive = (href: string) =>
    activeLink === href || spySection === href;

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 pt-safe transition-[background-color,border-color,backdrop-filter,box-shadow] duration-300 ${
        scrolled || isMobileMenuOpen
          ? "glass border-b border-white/10 shadow-[0_8px_32px_rgba(2,6,12,0.35)]"
          : "bg-transparent border-b border-transparent"
      }`}
    >
      <nav className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8" aria-label="Main navigation">
        <div className="flex items-center justify-between h-16">
          {/* Logo & Status */}
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="flex items-center gap-2.5 font-display text-lg font-semibold text-white tracking-tight hover:opacity-90 transition-opacity"
              aria-label="9th-grade-ai home"
            >
              <motion.span
                className="inline-flex"
                animate={shouldReduceMotion ? undefined : { scale: [1, 1.06, 1] }}
                transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
              >
                <BrandMark className="h-8 w-8 rounded-lg shadow-glow-sm" />
              </motion.span>
              <span>9th-grade-ai</span>
            </Link>

            <StatusPill label="SYSTEM: ONLINE" className="hidden sm:inline-flex" />
          </div>

          {/* Desktop Nav */}
          <div className="hidden md:flex items-center gap-7">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onMouseEnter={() => setActiveLink(link.href)}
                onMouseLeave={() => setActiveLink(null)}
                aria-current={spySection === link.href ? "location" : undefined}
                className={`relative py-1 text-sm font-medium transition-colors ${
                  isLinkActive(link.href)
                    ? "text-emerald-400"
                    : "text-zinc-300 hover:text-emerald-400"
                }`}
              >
                {link.label}
                {isLinkActive(link.href) && (
                  <span
                    className="absolute -bottom-0.5 left-0 right-0 h-px bg-gradient-to-r from-transparent via-emerald-400 to-transparent"
                    aria-hidden="true"
                  />
                )}
              </Link>
            ))}

            <div className="flex items-center gap-3 ml-2">
              <Link
                href="/login"
                className="px-4 py-1.5 text-sm font-medium text-zinc-100 border border-white/15 rounded-full hover:border-emerald-400/50 hover:bg-white/5 transition-colors hover:scale-[1.03] active:scale-[0.97]"
              >
                Login
              </Link>
              <Link
                href="/login?register=true"
                className="px-4 py-1.5 text-sm font-semibold text-zinc-950 bg-emerald-500 rounded-full hover:bg-emerald-400 transition-colors shadow-glow-sm hover:scale-[1.03] active:scale-[0.97]"
              >
                Get Started
              </Link>
            </div>
          </div>

          {/* Mobile Menu Button */}
          <button
            className="md:hidden p-2.5 rounded-lg hover:bg-white/5 transition-colors"
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            aria-label={isMobileMenuOpen ? "Close menu" : "Open menu"}
            aria-expanded={isMobileMenuOpen}
            aria-controls="mobile-menu"
          >
            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              {isMobileMenuOpen ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              )}
            </svg>
          </button>
        </div>

        {/* Mobile Menu */}
        <motion.div
          id="mobile-menu"
          ref={menuRef}
          initial={false}
          animate={{ opacity: isMobileMenuOpen ? 1 : 0, height: isMobileMenuOpen ? "auto" : 0 }}
          transition={{ duration: 0.2 }}
          className="md:hidden overflow-hidden"
          aria-label="Mobile navigation"
          hidden={!isMobileMenuOpen}
        >
          <div className="py-4 space-y-1 border-t border-white/10">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setIsMobileMenuOpen(false)}
                aria-current={spySection === link.href ? "location" : undefined}
                className="block px-3 py-3 min-h-[44px] flex items-center text-base font-medium text-zinc-300 hover:text-emerald-400"
              >
                {link.label}
              </Link>
            ))}
            <div className="flex flex-col gap-2 pt-4 border-t border-white/10">
              <Link
                href="/login"
                onClick={() => setIsMobileMenuOpen(false)}
                className="px-4 py-3 min-h-[44px] flex items-center justify-center text-center text-sm font-medium text-zinc-100 border border-white/15 rounded-full hover:bg-white/5 transition-colors active:scale-[0.98]"
              >
                Login
              </Link>
              <Link
                href="/login?register=true"
                onClick={() => setIsMobileMenuOpen(false)}
                className="px-4 py-3 min-h-[44px] flex items-center justify-center text-center text-sm font-semibold text-zinc-950 bg-emerald-500 rounded-full hover:bg-emerald-400 transition-colors shadow-glow-sm active:scale-[0.98]"
              >
                Get Started
              </Link>
            </div>
          </div>
        </motion.div>
      </nav>
    </header>
  );
}