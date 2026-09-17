"use client";

import { useEffect, useMemo, useRef, useState } from "react";

/**
 * Reflect-inspired atmospheric hero background.
 *
 * Layer stack (video is the PRIMARY motion source):
 *   z-0  AtmosphericVideo — /asset/hero/9th-grade.webm, native playback only
 *   z-1  StarField       — oversized CSS-rotated field (70s) + per-star twinkle (8–10s)
 *   z-2  Vignette        — restrained readability/integration overlay
 *   z-10 Existing hero content (untouched, always dominant)
 *
 * No canvas, no WebGL, no requestAnimationFrame, no per-frame React state.
 * All motion is CSS keyframes (transform/opacity) + the browser's video
 * pipeline. Reduced motion disables rotation/twinkle and pauses the video.
 */

export const HERO_VIDEO_SRC = "/asset/hero/9th-grade.webm";

/** Rendered star budget: mobile 36 / tablet 72 / desktop 110 (CSS-gated, same DOM). */
const TOTAL_STARS = 110;
const MOBILE_STARS = 36;
const TABLET_STARS = 72;

type Star = {
  size: number; // px
  twinkleDuration: number; // s, 8–10
  twinkleDelay: number; // s, distributed
  color: string; // "r, g, b" triplet
  /** Offset from the field center, consumed by the twinkle keyframes —
      mirrors Reflect's per-star --transform (e.g. translate(310px, 174px)).
      Stars streak outward from the core along this vector. */
  offsetX: number; // px
  offsetY: number; // px
};

function seeded01(seed: number): number {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

function buildStars(count: number): Star[] {
  // Mostly white-hot, with a few brand-tinted strays (indigo/cyan family).
  const palette = ["255, 255, 255", "255, 255, 255", "255, 255, 255", "165, 180, 252", "103, 232, 249"];
  return Array.from({ length: count }, (_, i) => {
    const a = seeded01(i + 1);
    const b = seeded01(i * 3 + 7);
    const c = seeded01(i * 7 + 13);
    const e = seeded01(i * 29 + 3);
    const f = seeded01(i * 53 + 11);
    // Radial streak: 200–640px from the core in a deterministic direction,
    // so every star travels through the mask's visible band.
    const angle = a * Math.PI * 2;
    const distance = 200 + Math.pow(b, 0.85) * 440;
    return {
      size: 2 + (c > 0.72 ? 1 : 0),
      twinkleDuration: 8 + e * 2,
      twinkleDelay: f * 10,
      color: palette[Math.floor(c * palette.length) % palette.length],
      offsetX: Math.cos(angle) * distance,
      offsetY: Math.sin(angle) * distance,
    };
  });
}

function starVisibilityClass(index: number): string {
  if (index >= TABLET_STARS) return "hidden lg:block";
  if (index >= MOBILE_STARS) return "hidden sm:block";
  return "";
}

export default function HeroBackground() {
  const rootRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoReady, setVideoReady] = useState(false);
  const stars = useMemo(() => buildStars(TOTAL_STARS), []);

  // Event-driven playback management only: pause offscreen, pause under
  // reduced motion. No timers, no per-frame work.
  useEffect(() => {
    const root = rootRef.current;
    const video = videoRef.current;
    if (!root || !video) return;

    // The load event can fire before hydration attaches onLoadedData —
    // check readiness on mount so the fade-in is never stuck.
    if (video.readyState >= 2) setVideoReady(true);

    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const syncPlayback = (visible: boolean) => {
      if (!visible || media.matches) {
        video.pause();
      } else {
        void video.play().catch(() => {});
      }
    };

    // Reduced-motion users get the static first frame as the backdrop.
    if (media.matches) video.pause();

    const onChange = () => syncPlayback(root.getBoundingClientRect().top < window.innerHeight);
    media.addEventListener("change", onChange);

    const io = new IntersectionObserver(
      (entries) => syncPlayback(entries.some((e) => e.isIntersecting)),
      { threshold: 0 },
    );
    io.observe(root);
    return () => {
      io.disconnect();
      media.removeEventListener("change", onChange);
    };
  }, []);

  return (
    <div
      ref={rootRef}
      aria-hidden="true"
      data-layer="hero-background"
      className="pointer-events-none absolute inset-0 z-0 overflow-hidden bg-black"
    >
      {/* Static brand-tinted fallback — visible while the video buffers. */}
      <div
        data-layer="video-fallback"
        className="absolute inset-0"
        style={{
          background: `radial-gradient(ellipse 70% 55% at 50% 46%, rgba(45, 212, 191, 0.1) 0%, rgba(129, 140, 248, 0.07) 38%, #000000 78%)`,
        }}
      />

      {/* z-0 — AtmosphericVideo: native playback, fades in once frames flow. */}
      <video
        ref={videoRef}
        data-layer="atmospheric-video"
        className={`absolute inset-0 z-0 h-full w-full object-cover object-center transition-opacity duration-1000 ${
          videoReady ? "opacity-100" : "opacity-0"
        }`}
        src={HERO_VIDEO_SRC}
        autoPlay
        muted
        loop
        playsInline
        preload="metadata"
        disablePictureInPicture
        aria-hidden="true"
        tabIndex={-1}
        onLoadedData={() => setVideoReady(true)}
      />

      {/* z-1 — StarField: oversized disc centered on the visual focal point.
          Stars sit at the center and streak outward along --transform;
          the ring mask keeps the core and the edges clean. */}
      <div data-layer="star-field" className="absolute inset-0 z-[1] overflow-hidden">
        <div className="hero-stars-rotate absolute left-1/2 top-1/2 h-[130vmax] w-[130vmax]">
          {stars.map((star, i) => (
            <span
              key={i}
              data-star={i}
              className={`hero-star absolute left-1/2 top-1/2 rounded-full ${starVisibilityClass(i)}`}
              style={
                {
                  width: star.size,
                  height: star.size,
                  backgroundColor: `rgba(${star.color}, 0)`,
                  animationDuration: `${star.twinkleDuration}s`,
                  animationDelay: `${star.twinkleDelay}s`,
                  "--transform": `translate(${star.offsetX.toFixed(1)}px, ${star.offsetY.toFixed(1)}px)`,
                  "--star-color": star.color,
                } as React.CSSProperties
              }
            />
          ))}
        </div>
      </div>

      {/* z-2 — Vignette: restrained integration + readability, video stays visible. */}
      <div data-layer="vignette" className="absolute inset-0 z-[2]">
        <div
          className="absolute inset-0"
          style={{
            background: `radial-gradient(ellipse 90% 75% at 50% 44%, transparent 52%, rgba(0, 0, 0, 0.42) 100%)`,
          }}
        />
        <div
          className="absolute inset-x-0 bottom-0 h-[38%]"
          style={{
            background: `linear-gradient(180deg, transparent 0%, rgba(0, 0, 0, 0.5) 100%)`,
          }}
        />
        <div
          className="absolute inset-y-0 left-0 w-[min(60vw,560px)]"
          style={{
            background: `linear-gradient(90deg, rgba(0, 0, 0, 0.34) 0%, transparent 100%)`,
          }}
        />
      </div>
    </div>
  );
}
