"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { motion, useScroll, useMotionValueEvent } from "framer-motion";

export default function TerminalHeader() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [activeLink, setActiveLink] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const { scrollY } = useScroll();

  const navLinks = [
    { href: "#features", label: "Features" },
    { href: "#syllabus", label: "Syllabus" },
    { href: "#tracks", label: "Tracks" },
  ];

  useMotionValueEvent(scrollY, "change", (v) => setScrolled(v > 24));

  // Close the mobile menu on Escape and trap focus while open.
  useEffect(() => {
    if (!isMobileMenuOpen) return;
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
    // Move focus into the menu when it opens.
    menuRef.current?.querySelector<HTMLElement>("a[href]")?.focus();
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [isMobileMenuOpen]);

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 pt-safe transition-[border-color,box-shadow] duration-300 ${
        scrolled
          ? "glass border-b border-emerald-500/25 shadow-neon-glow"
          : "bg-transparent border-b border-transparent"
      }`}
    >
      <nav className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8" aria-label="Main navigation">
        <div className="flex items-center justify-between h-16">
          {/* Logo & Status */}
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="flex items-center gap-2 text-xl font-bold text-white tracking-tight font-mono hover:opacity-90 transition-opacity"
              aria-label="9th-grade-ai home"
            >
              <motion.span
                className="text-gradient"
                animate={{ opacity: [0.6, 1, 0.6] }}
                transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
              >
                {'>'}
              </motion.span>
              <span>9th-grade-ai</span>
            </Link>

            {/* System status indicator */}
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.3 }}
              className="hidden sm:flex items-center gap-1.5 px-2 py-0.5 bg-emerald-500/10 border border-emerald-500/20 rounded-full"
            >
              <motion.span
                className="w-2 h-2 rounded-full bg-emerald-500"
                animate={{ boxShadow: ["0 0 0 0 rgba(16,185,129,0.6)", "0 0 0 8px rgba(16,185,129,0)", "0 0 0 0 rgba(16,185,129,0.6)"] }}
                transition={{ duration: 2, repeat: Infinity }}
                aria-hidden="true"
              />
              <span className="text-xs font-mono text-emerald-400 uppercase tracking-wider">SYSTEM: ONLINE</span>
            </motion.div>
          </div>

          {/* Desktop Nav */}
          <div className="hidden md:flex items-center gap-8">
            {navLinks.map((link, i) => (
              <motion.a
                key={link.href}
                href={link.href}
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 * (i + 1) }}
                onHoverStart={() => setActiveLink(link.href)}
                onHoverEnd={() => setActiveLink(null)}
                className={`relative py-1 text-sm font-medium transition-colors font-mono ${
                  activeLink === link.href ? "text-emerald-400" : "text-zinc-300 hover:text-emerald-400"
                }`}
              >
                {link.label}
                {activeLink === link.href && (
                  <motion.span
                    layoutId="nav-underline"
                    className="absolute -bottom-0.5 left-0 right-0 h-px bg-gradient-to-r from-transparent via-emerald-400 to-transparent"
                    transition={{ type: "spring", stiffness: 500, damping: 35 }}
                  />
                )}
              </motion.a>
            ))}

            <div className="flex items-center gap-3 ml-4 border-l border-emerald-500/20 pl-4">
              <Link
                href="/login"
                className="px-4 py-1.5 text-sm font-medium text-zinc-100 border border-emerald-500/30 rounded hover:bg-emerald-500/10 transition-colors font-mono hover:scale-[1.03] active:scale-[0.97] transition-transform"
              >
                [ Login ]
              </Link>
              <Link
                href="/login?register=true"
                className="px-4 py-1.5 text-sm font-medium text-zinc-950 bg-emerald-500 rounded hover:bg-emerald-400 transition-colors font-mono shadow-neon-glow hover:scale-[1.03] active:scale-[0.97] transition-transform"
              >
                [ Get Started ]
              </Link>
            </div>
          </div>

          {/* Mobile Menu Button */}
          <button
            className="md:hidden p-2.5 rounded-lg hover:bg-zinc-800 transition-colors"
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            aria-label="Toggle menu"
            aria-expanded={isMobileMenuOpen}
            aria-controls="mobile-menu"
            aria-haspopup="menu"
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
          role="menu"
          aria-label="Mobile navigation"
          hidden={!isMobileMenuOpen}
        >
          <div className="py-4 space-y-1 border-t border-emerald-500/10">
            {navLinks.map((link, i) => (
              <motion.a
                key={link.href}
                href={link.href}
                role="menuitem"
                onClick={() => setIsMobileMenuOpen(false)}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.05 * (i + 1) }}
                className="block px-3 py-3 min-h-[44px] flex items-center text-base font-medium text-zinc-300 hover:text-emerald-400 font-mono"
              >
                {link.label}
              </motion.a>
            ))}
            <div className="flex flex-col gap-2 pt-4 border-t border-emerald-500/10">
              <Link
                href="/login"
                role="menuitem"
                onClick={() => setIsMobileMenuOpen(false)}
                className="px-4 py-3 min-h-[44px] flex items-center justify-center text-center text-sm font-medium text-zinc-100 border border-emerald-500/30 rounded hover:bg-emerald-500/10 transition-colors font-mono active:scale-[0.98] transition-transform"
              >
                [ Login ]
              </Link>
              <Link
                href="/login?register=true"
                role="menuitem"
                onClick={() => setIsMobileMenuOpen(false)}
                className="px-4 py-3 min-h-[44px] flex items-center justify-center text-center text-sm font-medium text-zinc-950 bg-emerald-500 rounded hover:bg-emerald-400 transition-colors font-mono shadow-neon-glow active:scale-[0.98] transition-transform"
              >
                [ Get Started ]
              </Link>
            </div>
          </div>
        </motion.div>
      </nav>
    </header>
  );
}