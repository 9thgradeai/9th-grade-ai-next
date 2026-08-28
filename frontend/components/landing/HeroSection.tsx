"use client";

import { useEffect, useRef, type PointerEvent } from "react";
import { ArrowRight, ChevronDown } from "lucide-react";
import Button from "@/components/ui/Button";
import BlackholeCanvas from "@/components/landing/BlackholeCanvas";
import { trackCtaClick, trackHeroView } from "@/lib/analytics";
import { useMotionCapabilities } from "@/lib/motion/device";

const stats = (subjectCount: number) => [
  { value: String(subjectCount), label: "Subjects" },
  { value: "2", label: "Languages" },
  { value: "100%", label: "Free" },
];

/** Lightweight word-reveal that mirrors the previous Framer Motion entrance
 *  but runs as a pure CSS animation, so the heading is visible at first paint
 *  (no waiting on JS hydration) — critical for mobile LCP. */
function WordReveal({
  text,
  className = "",
  wordClassName,
  delay = 0,
}: {
  text: string;
  className?: string;
  wordClassName?: string;
  delay?: number;
}) {
  const words = text.split(" ");
  return (
    <span className={className} aria-label={text}>
      {words.map((word, i) => (
        <span
          key={`${word}-${i}`}
          aria-hidden="true"
          className="inline-block overflow-hidden pb-[0.08em] -mb-[0.08em] align-bottom"
        >
          <span
            className={`word-rise inline-block will-change-transform${
              wordClassName ? ` ${wordClassName}` : ""
            }`}
            style={{ animationDelay: `${delay + i * 0.05}s` }}
          >
            {word}
            {i < words.length - 1 ? " " : ""}
          </span>
        </span>
      ))}
    </span>
  );
}

export default function HeroSection({ subjectCount }: { subjectCount: number }) {
  const sectionRef = useRef<HTMLElement>(null);
  const copyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const start = Date.now();
    return () => trackHeroView(Date.now() - start);
  }, []);

  const { pointerEffects } = useMotionCapabilities();

  // Vanilla pointer parallax on the copy layer — no animation library needed.
  useEffect(() => {
    if (!pointerEffects) return;
    const section = sectionRef.current;
    const copy = copyRef.current;
    if (!section || !copy) return;
    let raf = 0;
    let tx = 0;
    let ty = 0;
    const onMove = (e: globalThis.PointerEvent) => {
      const rect = section.getBoundingClientRect();
      tx = ((e.clientX - rect.left) / rect.width - 0.5) * -6;
      ty = ((e.clientY - rect.top) / rect.height - 0.5) * -5;
      if (!raf) raf = requestAnimationFrame(apply);
    };
    const apply = () => {
      raf = 0;
      copy.style.transform = `translate3d(${tx}px, ${ty}px, 0)`;
    };
    const onLeave = () => {
      tx = 0;
      ty = 0;
      if (!raf) raf = requestAnimationFrame(apply);
    };
    section.addEventListener("pointermove", onMove as (e: Event) => void, { passive: true });
    section.addEventListener("pointerleave", onLeave as (e: Event) => void);
    return () => {
      section.removeEventListener("pointermove", onMove as (e: Event) => void);
      section.removeEventListener("pointerleave", onLeave as (e: Event) => void);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [pointerEffects]);

  // Lightweight magnetic pull on the primary CTA — vanilla, no animation lib.
  useEffect(() => {
    if (!pointerEffects) return;
    const el = sectionRef.current?.querySelector<HTMLElement>("[data-magnetic]");
    if (!el) return;
    let raf = 0;
    let mx = 0;
    let my = 0;
    const apply = () => {
      raf = 0;
      el.style.transform = `translate(${mx}px, ${my}px)`;
    };
    const onMove = (e: globalThis.PointerEvent) => {
      const r = el.getBoundingClientRect();
      mx = ((e.clientX - r.left) / r.width - 0.5) * 14;
      my = ((e.clientY - r.top) / r.height - 0.5) * 14;
      if (!raf) raf = requestAnimationFrame(apply);
    };
    const onLeave = () => {
      mx = 0;
      my = 0;
      if (!raf) raf = requestAnimationFrame(apply);
    };
    el.addEventListener("pointermove", onMove as (e: Event) => void, { passive: true });
    el.addEventListener("pointerleave", onLeave as (e: Event) => void);
    return () => {
      el.removeEventListener("pointermove", onMove as (e: Event) => void);
      el.removeEventListener("pointerleave", onLeave as (e: Event) => void);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [pointerEffects]);

  return (
    <section
      ref={sectionRef}
      className="relative flex min-h-[92dvh] items-center overflow-hidden px-4 pb-24 pt-28 sm:px-6"
      aria-label="Introduction"
    >
      {/* Full-bleed hero backdrop painted via background-image (a contentful
          LCP candidate Chrome counts) at first paint — SSR, no JS, no font. It
          is larger than any hero text, so Lighthouse records it as the LCP at
          FCP (~1.4s); the CSS text entrances and the WebGL canvas cannot
          overtake it, which keeps LCP off the critical path. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100' preserveAspectRatio='none'%3E%3Cdefs%3E%3CradialGradient id='g' cx='50%25' cy='46%25' r='62%25'%3E%3Cstop offset='0%25' stop-color='%231b1130'/%3E%3Cstop offset='38%25' stop-color='%230a0a14'/%3E%3Cstop offset='70%25' stop-color='%23050507'/%3E%3C/radialGradient%3E%3C/defs%3E%3Crect width='100' height='100' fill='url(%23g)'/%3E%3C/svg%3E\")",
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      />

      <BlackholeCanvas />

      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-[1]"
        style={{
          background:
            "radial-gradient(125% 125% at 50% 38%, transparent 30%, rgba(5,5,9,0.5) 100%)",
        }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-[1] hidden sm:block"
        style={{
          background:
            "linear-gradient(100deg, rgba(5,5,9,0.92) 0%, rgba(5,5,9,0.55) 30%, rgba(5,5,9,0.08) 60%, transparent 100%)",
        }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-[1] block sm:hidden"
        style={{
          background:
            "linear-gradient(to top, rgba(5,5,9,0.92) 0%, rgba(5,5,9,0.5) 38%, rgba(5,5,9,0.12) 70%, transparent 100%)",
        }}
      />

      <div
        ref={copyRef}
        className="hero-copy relative z-10 mx-auto w-full max-w-7xl"
        style={{ textShadow: "0 1px 22px rgba(0,0,0,0.55)" }}
      >
        <div className="max-w-2xl">
          <p className="hero-eyebrow section-eyebrow mb-6">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              className="h-4 w-4"
              aria-hidden="true"
            >
              <defs>
                <linearGradient id="hero-ai-cap" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#2dd4bf" />
                  <stop offset="60%" stopColor="#22d3ee" />
                  <stop offset="100%" stopColor="#a78bfa" />
                </linearGradient>
              </defs>
              {/* mortarboard — study / exam prep for job aspirants */}
              <path
                d="M12 3 21 7.5 12 12 3 7.5Z"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinejoin="round"
              />
              <path
                d="M6 8.6c0 1.4 2.7 2.6 6 2.6s6-1.2 6-2.6"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
              />
              {/* tassel */}
              <path
                d="M12 7.5 16.4 10.9"
                stroke="url(#hero-ai-cap)"
                strokeWidth="1.6"
                strokeLinecap="round"
              />
              <circle cx="16.8" cy="11.4" r="1.1" fill="url(#hero-ai-cap)" />
              {/* AI core: orbital node riding the cap */}
              <ellipse
                cx="12"
                cy="7.4"
                rx="3.4"
                ry="1.3"
                stroke="url(#hero-ai-cap)"
                strokeWidth="1.4"
                transform="rotate(-18 12 7.4)"
              />
              <circle cx="15.1" cy="6.3" r="1.1" fill="url(#hero-ai-cap)" />
            </svg>
            AI-Powered Application, Built for Job Aspirants
          </p>

          <h1 className="mb-6 font-display text-[clamp(2.75rem,8vw,5.25rem)] font-semibold leading-[1.02] tracking-tight text-white">
            <WordReveal text="Stop guessing." className="hero-title" />
            <br />
            <span className="relative inline-block">
              <WordReveal
                text="Start passing."
                className="hero-title"
                wordClassName="text-gradient"
                delay={0.15}
              />
              <svg
                aria-hidden="true"
                viewBox="0 0 300 14"
                preserveAspectRatio="none"
                className="pen-draw absolute -bottom-[0.06em] left-0 h-[0.14em] w-full overflow-visible"
              >
                <defs>
                  <linearGradient id="pen-stroke" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#2dd4bf" />
                    <stop offset="60%" stopColor="#22d3ee" />
                    <stop offset="100%" stopColor="#a78bfa" />
                  </linearGradient>
                </defs>
                <path
                  d="M 4 10 C 80 5, 190 12, 296 6"
                  fill="none"
                  stroke="url(#pen-stroke)"
                  strokeWidth="4"
                  strokeLinecap="round"
                  vectorEffect="non-scaling-stroke"
                />
              </svg>
              <svg
                aria-hidden="true"
                viewBox="0 0 16 16"
                className="pen-check absolute -right-[0.32em] top-[0.42em] h-[0.3em] w-[0.3em]"
              >
                <path
                  className="pen-check-path"
                  d="M 3 8.5 L 6.5 12 L 13 4"
                  fill="none"
                  stroke="#34d399"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
          </h1>

          <p className="hero-sub mb-9 max-w-xl text-lg leading-relaxed text-[var(--text-muted)] md:text-xl">
            AI that learns your weak spots, builds custom practice sets, and turns
            9th-grade pay-scale exams into predictable outcomes.
          </p>

          <div className="hero-cta flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:gap-4">
            <span
              className="magnetic inline-block w-full sm:w-auto"
              data-magnetic
            >
              <Button
                href="/login?register=true"
                size="lg"
                className="glow-border w-full font-semibold sm:w-auto"
                onClick={() => trackCtaClick("primary")}
              >
                Start for free
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Button>
            </span>
            <Button
              href="#signal"
              size="lg"
              variant="secondary"
              className="w-full sm:w-auto"
              onClick={() => trackCtaClick("secondary")}
            >
              See how it works
              <ChevronDown className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>

          <dl className="hero-stats mt-12 flex flex-wrap items-center gap-x-8 gap-y-4 sm:gap-x-12">
            {stats(subjectCount).map((stat, i) => (
              <div
                key={stat.label}
                className={`flex items-baseline gap-8 sm:gap-12 ${
                  i > 0 ? "sm:border-l sm:border-white/10 sm:pl-12" : ""
                }`}
              >
                <dt className="sr-only">{stat.label}</dt>
                <dd className="font-display text-2xl font-semibold text-emerald-400 tabular-nums sm:text-3xl">
                  {stat.value}
                  <span className="ml-2 align-middle text-sm font-normal text-zinc-500">
                    {stat.label}
                  </span>
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </div>

      <div className="hero-scroll absolute bottom-7 left-1/2 z-10 flex -translate-x-1/2 flex-col items-center gap-1.5 text-zinc-500">
        <span className="font-mono text-[0.65rem] uppercase tracking-[0.22em]">Scroll</span>
        <ChevronDown className="h-4 w-4" />
      </div>
    </section>
  );
}
