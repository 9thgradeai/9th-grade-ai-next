"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Hls from "hls.js";

const VIDEO_SRC =
  "https://stream.mux.com/T6oQJQ02cQ6N01TR6iHwZkKFkbepS34dkkIc9iukgy400g.m3u8";

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

    let hls: Hls | null = null;
    let destroyed = false;

    video.muted = true;
    video.defaultMuted = true;
    video.playsInline = true;
    video.setAttribute("playsinline", "");
    video.setAttribute("webkit-playsinline", "");
    video.setAttribute("muted", "");

    const onReady = () => {
      if (!destroyed) safePlay(video);
    };
    const onLoaded = () => {
      if (destroyed) return;
      setIsLoaded(true);
      safePlay(video);
    };

    video.addEventListener("canplay", onReady);
    video.addEventListener("loadeddata", onLoaded);
    video.addEventListener("loadedmetadata", onReady);
    video.addEventListener("playing", onReady);

    const unlock = () => {
      if (video.paused) safePlay(video);
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

    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = VIDEO_SRC;
      video.load();
      safePlay(video);
    } else if (Hls.isSupported()) {
      hls = new Hls({
        // Perf-tuned for smoothest hero background playback
        maxBufferLength: 30,
        maxMaxBufferLength: 60,
        backBufferLength: 10,
        startLevel: -1,        // auto-quality — fastest initial ramp
        abrEwmaFastLive: 3,
        abrEwmaSlowLive: 9,
        debug: false,
        enableWorker: true,
        lowLatencyMode: false,
        autoStartLoad: true,
        progressive: true,
      });

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        if (!destroyed) safePlay(video);
      });
      hls.on(Hls.Events.FRAG_BUFFERED, () => {
        if (!destroyed) safePlay(video);
      });
      hls.on(Hls.Events.ERROR, (_ev, data) => {
        if (data.fatal && hls) {
          if (data.type === Hls.ErrorTypes.NETWORK_ERROR) hls.startLoad();
          else if (data.type === Hls.ErrorTypes.MEDIA_ERROR)
            hls.recoverMediaError();
        }
      });

      hls.loadSource(VIDEO_SRC);
      hls.attachMedia(video);
    } else {
      video.src = VIDEO_SRC;
      safePlay(video);
    }

    const guard = setInterval(() => {
      if (!destroyed && video.paused) safePlay(video);
    }, 2000);

    return () => {
      destroyed = true;
      clearInterval(guard);
      video.removeEventListener("canplay", onReady);
      video.removeEventListener("loadeddata", onLoaded);
      video.removeEventListener("loadedmetadata", onReady);
      video.removeEventListener("playing", onReady);
      unlockEvents.forEach((ev) => window.removeEventListener(ev, unlock));
      if (hls) hls.destroy();
    };
  }, []);

  // ── Viewport visibility pause / resume ───────────────────────────────────────
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (isVisible) safePlay(video);
    else video.pause();
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
          crossOrigin="anonymous"
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
              ? "hero-video-in duration-[2000ms] opacity-100 [filter:blur(0px)_saturate(1.15)_brightness(0.9)]"
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
            "radial-gradient(ellipse 90% 80% at 50% 50%, transparent 25%, rgba(0,0,0,0.38) 65%, rgba(0,0,0,0.82) 100%)",
        }}
      />

      {/* Top-to-bottom gradient for text contrast */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-[2] bg-gradient-to-b from-black/60 via-transparent to-black/85"
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
