"use client";

import { useEffect, useRef, useState } from "react";
import Hls from "hls.js";

const VIDEO_SRC = "https://stream.mux.com/T6oQJQ02cQ6N01TR6iHwZkKFkbepS34dkkIc9iukgy400g.m3u8";

function safePlay(video: HTMLVideoElement | null) {
  if (!video) return;
  video.muted = true;
  video.defaultMuted = true;
  try {
    const playPromise = video.play();
    if (playPromise !== undefined) {
      playPromise.catch(() => {
        video.muted = true;
        void video.play().catch(() => {});
      });
    }
  } catch {
    // Ignore DOM exceptions
  }
}

export default function HeroVideoBackground() {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isVisible, setIsVisible] = useState(true);

  // 1. Intersection Observer for viewport visibility
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]) {
          setIsVisible(entries[0].isIntersecting);
        }
      },
      { threshold: 0 }
    );

    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    return () => observer.disconnect();
  }, []);

  // 2. Video & HLS Setup
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    let hls: Hls | null = null;
    let destroyed = false;

    // Ensure muted & playsInline attributes/properties
    video.muted = true;
    video.defaultMuted = true;
    video.playsInline = true;
    video.setAttribute("playsinline", "");
    video.setAttribute("webkit-playsinline", "");
    video.setAttribute("muted", "");

    const onPlaybackReady = () => {
      if (destroyed) return;
      safePlay(video);
    };

    video.addEventListener("canplay", onPlaybackReady);
    video.addEventListener("loadeddata", onPlaybackReady);
    video.addEventListener("loadedmetadata", onPlaybackReady);
    video.addEventListener("playing", onPlaybackReady);
    video.addEventListener("timeupdate", onPlaybackReady);

    // Interaction fallback for strict autoplay policy bypass
    const unlockOnInteraction = () => {
      if (video && video.paused) {
        safePlay(video);
      }
    };
    window.addEventListener("pointerdown", unlockOnInteraction, { once: true, passive: true });
    window.addEventListener("touchstart", unlockOnInteraction, { once: true, passive: true });
    window.addEventListener("keydown", unlockOnInteraction, { once: true, passive: true });
    window.addEventListener("scroll", unlockOnInteraction, { once: true, passive: true });
    window.addEventListener("mousemove", unlockOnInteraction, { once: true, passive: true });

    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      // Native HLS for Safari & iOS
      video.src = VIDEO_SRC;
      video.load();
      safePlay(video);
    } else if (Hls.isSupported()) {
      hls = new Hls({
        maxBufferLength: 30,
        maxMaxBufferLength: 60,
        backBufferLength: 15,
        debug: false,
        enableWorker: true,
        lowLatencyMode: false,
        autoStartLoad: true,
      });

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        if (destroyed) return;
        safePlay(video);
      });

      hls.on(Hls.Events.FRAG_BUFFERED, () => {
        if (destroyed) return;
        safePlay(video);
      });

      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal && hls) {
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              hls.startLoad();
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              hls.recoverMediaError();
              break;
            default:
              break;
          }
        }
      });

      hls.loadSource(VIDEO_SRC);
      hls.attachMedia(video);
    } else {
      video.src = VIDEO_SRC;
      safePlay(video);
    }

    // Interval check to ensure video plays continuously
    const playCheckInterval = setInterval(() => {
      if (!destroyed && video && video.paused) {
        safePlay(video);
      }
    }, 1000);

    return () => {
      destroyed = true;
      clearInterval(playCheckInterval);
      video.removeEventListener("canplay", onPlaybackReady);
      video.removeEventListener("loadeddata", onPlaybackReady);
      video.removeEventListener("loadedmetadata", onPlaybackReady);
      video.removeEventListener("playing", onPlaybackReady);
      video.removeEventListener("timeupdate", onPlaybackReady);
      window.removeEventListener("pointerdown", unlockOnInteraction);
      window.removeEventListener("touchstart", unlockOnInteraction);
      window.removeEventListener("keydown", unlockOnInteraction);
      window.removeEventListener("scroll", unlockOnInteraction);
      window.removeEventListener("mousemove", unlockOnInteraction);
      if (hls) {
        hls.destroy();
      }
    };
  }, []);

  // 3. Viewport visibility pause/resume
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (isVisible) {
      safePlay(video);
    } else {
      video.pause();
    }
  }, [isVisible]);

  return (
    <div
      ref={containerRef}
      className="pointer-events-none absolute inset-0 z-0 overflow-hidden bg-black"
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
          className="absolute inset-0 h-full w-full object-cover will-change-transform"
          aria-hidden="true"
        />

      {/* Cinematic vignette & text contrast overlay */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-[1] bg-gradient-to-b from-black/60 via-transparent to-black/80"
      />
    </div>
  );
}
