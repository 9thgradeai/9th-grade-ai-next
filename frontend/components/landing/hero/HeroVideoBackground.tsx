"use client";

import { useEffect, useRef, useState, useCallback } from "react";

const VIDEO_SRC =
  "https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260603_132049_036591b8-6e92-4760-b94c-a7ea6eef315c.mp4";

// Direct MP4 (progressive). If the source is ever swapped back to an HLS
// playlist, hls.js is code-split and only loaded in that case — the landing
// page never pays ~100 kB gz for the player on the hero MP4 path.
const IS_HLS = /\.m3u8(?:\?.*)?$/i.test(VIDEO_SRC);

function safePlay(video: HTMLVideoElement | null) {
  if (!video) return;
  video.muted = true;
  video.defaultMuted = true;
  try {
    video.play().catch(() => {
      video.muted = true;
      void video.play().catch(() => {});
    });
  } catch {
    // Ignore DOM exceptions
  }
}

// Reduced-motion: the hero collapses to a static cinematic still — the loaded
// first frame stays visible but nothing autoplays, pans or parallaxes.
function prefersReducedMotion() {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}


export default function HeroVideoBackground() {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(true);
  const [isLoaded, setIsLoaded] = useState(false);

  // Lerp parallax state — kept in refs to avoid re-render churn
  const rafRef = useRef<number>(0);
  const parallaxTarget = useRef({ x: 0, y: 0 });
  const parallaxCurrent = useRef({ x: 0, y: 0 });
  const startTimeRef = useRef<number>(0);

  // ── Smooth lerp parallax loop ────────────────────────────────────────────────
  const startParallaxLoop = useCallback(() => {
    startTimeRef.current = performance.now();
    const tick = (now: number) => {
      const wrapper = wrapperRef.current;
      if (wrapper) {
        // 6% lerp per frame → buttery at 60 fps
        parallaxCurrent.current.x +=
          (parallaxTarget.current.x - parallaxCurrent.current.x) * 0.06;
        parallaxCurrent.current.y +=
          (parallaxTarget.current.y - parallaxCurrent.current.y) * 0.06;

        const x = parallaxCurrent.current.x;
        const y = parallaxCurrent.current.y;

        // Ken Burns: gentle sine oscillation ±2% over ~28s period
        const elapsed = (now - startTimeRef.current) / 1000;
        const kb = 1.08 + Math.sin((elapsed * Math.PI * 2) / 28) * 0.02;

        wrapper.style.transform = `translate3d(${x}px,${y}px,0) scale(${kb})`;
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }, []);

  // ── Pointer parallax (counter-direction = depth perception) ─────────────────
  useEffect(() => {
    const section = containerRef.current?.closest("section");
    if (!section) return;
    // Reduced motion: static still, no Ken Burns drift or pointer parallax.
    if (prefersReducedMotion()) return;

    const onMove = (e: PointerEvent) => {
      const r = section.getBoundingClientRect();
      // Video slides opposite to copy → apparent depth
      parallaxTarget.current.x = ((e.clientX - r.left) / r.width - 0.5) * 14;
      parallaxTarget.current.y = ((e.clientY - r.top) / r.height - 0.5) * 9;
    };
    const onLeave = () => {
      parallaxTarget.current.x = 0;
      parallaxTarget.current.y = 0;
    };

    section.addEventListener("pointermove", onMove as (e: Event) => void, {
      passive: true,
    });
    section.addEventListener("pointerleave", onLeave as (e: Event) => void);
    startParallaxLoop();

    return () => {
      section.removeEventListener("pointermove", onMove as (e: Event) => void);
      section.removeEventListener(
        "pointerleave",
        onLeave as (e: Event) => void
      );
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [startParallaxLoop]);

  // ── Intersection Observer ────────────────────────────────────────────────────
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]) setIsVisible(entries[0].isIntersecting);
      },
      { threshold: 0 }
    );
    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // ── HLS + Video Setup ────────────────────────────────────────────────────────
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    let destroyed = false;
    let hlsCleanup: (() => void) | null = null;

    video.muted = true;
    video.defaultMuted = true;
    video.playsInline = true;
    // Background media must never starve LCP-critical assets (fonts, JS).
    video.setAttribute("fetchpriority", "low");
    video.setAttribute("playsinline", "");
    video.setAttribute("webkit-playsinline", "");
    video.setAttribute("muted", "");

    // Reduced motion collapses autoplay: load the still, never run the media.
    const play = () => {
      if (!prefersReducedMotion()) safePlay(video);
    };

    const onReady = () => {
      if (!destroyed) play();
    };
    const onLoaded = () => {
      if (destroyed) return;
      setIsLoaded(true);
      play();
    };

    video.addEventListener("canplay", onReady);
    video.addEventListener("loadeddata", onLoaded);
    video.addEventListener("loadedmetadata", onReady);
    video.addEventListener("playing", onReady);

const unlock = () => {
      if (video.paused) play();
    };
    const unlockEvents = [
      "pointerdown",
      "touchstart",
      "keydown",
      "scroll",
      "mousemove",
    ] as const;
    unlockEvents.forEach((ev) =>
      window.addEventListener(ev, unlock, { once: true, passive: true })
    );

    const setDirectSource = () => {
      try {
        video.src = VIDEO_SRC;
        video.load();
      } catch {
        // jsdom / headless environments without media support
      }
      play();
    };

    if (IS_HLS) {
      // Streamed source (e.g. .m3u8) — load hls.js only on demand so the MP4
      // path never ships the player in the client bundle.
      void import("hls.js").then(({ default: Hls }) => {
        if (destroyed) return;

        if (video.canPlayType("application/vnd.apple.mpegurl")) {
          setDirectSource();
          return;
        }
        if (!Hls.isSupported()) {
          setDirectSource();
          return;
        }

        const hls = new Hls({
          // Perf-tuned for smoothest hero background playback
          maxBufferLength: 30,
          maxMaxBufferLength: 60,
          backBufferLength: 10,
          startLevel: -1, // auto-quality — fastest initial ramp
          abrEwmaFastLive: 3,
          abrEwmaSlowLive: 9,
          debug: false,
          enableWorker: true,
          lowLatencyMode: false,
          autoStartLoad: true,
          progressive: true,
        });

        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          if (!destroyed) play();
        });
        hls.on(Hls.Events.FRAG_BUFFERED, () => {
          if (!destroyed) play();
        });
        hls.on(Hls.Events.ERROR, (_ev, data) => {
          if (destroyed || !data.fatal) return;
          if (data.type === Hls.ErrorTypes.NETWORK_ERROR) hls.startLoad();
          else if (data.type === Hls.ErrorTypes.MEDIA_ERROR)
            hls.recoverMediaError();
        });

        hls.loadSource(VIDEO_SRC);
        hls.attachMedia(video);
        hlsCleanup = () => hls.destroy();
      });
    } else {
      // Direct MP4 — no manifest loader. The CDN serves byte ranges, so the
      // browser streams from the first chunk and keeps the buffer small —
      // smooth autoplay with zero pipeline overhead.
      setDirectSource();
    }

    const guard = setInterval(() => {
      if (!destroyed && video.paused) play();
    }, 2000);

    return () => {
      destroyed = true;
      clearInterval(guard);
      hlsCleanup?.();
      video.removeEventListener("canplay", onReady);
      video.removeEventListener("loadeddata", onLoaded);
      video.removeEventListener("loadedmetadata", onReady);
      video.removeEventListener("playing", onReady);
      unlockEvents.forEach((ev) => window.removeEventListener(ev, unlock));
    };
  }, []);

  // ── Viewport visibility pause / resume ───────────────────────────────────────
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (!isVisible) {
      video.pause();
      return;
    }
    if (prefersReducedMotion()) return; // static still — never autoplay
    safePlay(video);
  }, [isVisible]);

  // ── Tab-hidden pause (battery + data saver) ─────────────────────────────────
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const onVisibility = () => {
      if (document.hidden) video.pause();
      else if (isVisible && !prefersReducedMotion()) safePlay(video);
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [isVisible]);

  return (
    <div
      ref={containerRef}
      className="hero-video-bg pointer-events-none absolute inset-0 z-0 overflow-hidden bg-black"
    >
      {/* Ken Burns + parallax wrapper — scale(1.08) absorbs parallax travel */}
      <div
        ref={wrapperRef}
        className="absolute inset-[-4%]"
        style={{ willChange: "transform", transform: "scale(1.08)" }}
      >
        <video
          ref={videoRef}
          autoPlay
          muted
          loop
          playsInline
          preload="auto"
          style={{
            transform: "translateZ(0)",
            backfaceVisibility: "hidden",
            WebkitBackfaceVisibility: "hidden",
          }}
          className={[
            "absolute inset-0 h-full w-full object-cover will-change-transform",
            "transition-[opacity,filter] ease-out",
            isLoaded
              ? "hero-video-in duration-[2000ms] opacity-100 [filter:saturate(1.15)_brightness(0.9)]"
              : "duration-300 opacity-0 [filter:blur(8px)]",
          ].join(" ")}
          aria-hidden="true"
        />
      </div>

      {/* Radial vignette — cinematic dark frame */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-[1]"
        style={{
          background:
            "radial-gradient(ellipse 90% 80% at 50% 50%, transparent 22%, rgba(0,0,0,0.42) 65%, rgba(0,0,0,0.85) 100%)",
        }}
      />

      {/* Top-to-bottom gradient — nav seam + scroll hint + next-section blend */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-[2] bg-gradient-to-b from-black/70 via-black/20 to-black/90"
      />

      {/* Left-weighted readability scrim — guarantees copy contrast over the
          brightest parts of the footage (copy is left-aligned, max-w-2xl) */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-[2] bg-gradient-to-r from-black/60 via-black/25 to-transparent"
      />

      {/* Ambient brand-depth glow — faint indigo bloom away from the copy */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-[2]"
        style={{
          background:
            "radial-gradient(55% 48% at 74% 18%, rgba(129,140,248,0.10), transparent 70%)",
        }}
      />

      {/* Film grain — animated noise for cinematic texture */}
      <div
        aria-hidden="true"
        className="hero-film-grain pointer-events-none absolute inset-0 z-[3]"
      />

      {/* Chromatic edge shimmer — diagonal light sweep */}
      <div
        aria-hidden="true"
        className="hero-shimmer pointer-events-none absolute inset-0 z-[4]"
      />

      {/* Loading breathe pulse — subtle while buffering */}
      {!isLoaded && (
        <div
          aria-hidden="true"
          className="hero-loading-pulse pointer-events-none absolute inset-0 z-[5]"
        />
      )}
    </div>
  );
}
