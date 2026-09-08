"use client";

import { useEffect, useRef, useState } from "react";
import type HlsType from "hls.js";
import { useMotionCapabilities } from "@/lib/motion/device";

const VIDEO_SRC = "https://stream.mux.com/T6oQJQ02cQ6N01TR6iHwZkKFkbepS34dkkIc9iukgy400g.m3u8";
const POSTER_SRC = "/hero-poster.webp";

function safePlay(video: HTMLVideoElement) {
  try {
    const playPromise = video.play();
    if (playPromise && typeof playPromise.catch === "function") {
      playPromise.catch(() => {});
    }
  } catch {
    // Ignore autoplay restrictions or DOM exceptions
  }
}

function loadHlsScript(): Promise<typeof HlsType> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Window is undefined"));
  }
  const win = window as unknown as { Hls?: typeof HlsType };
  if (win.Hls) {
    return Promise.resolve(win.Hls);
  }

  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[src="/vendor/hls.light.min.js"]');
    if (existing) {
      existing.addEventListener("load", () => {
        if (win.Hls) resolve(win.Hls);
        else reject(new Error("Hls not found"));
      });
      existing.addEventListener("error", reject);
      return;
    }

    const script = document.createElement("script");
    script.src = "/vendor/hls.light.min.js";
    script.async = true;
    script.onload = () => {
      if (win.Hls) resolve(win.Hls);
      else reject(new Error("Hls not found on window"));
    };
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

export default function HeroVideoBackground() {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const [isLoaded, setIsLoaded] = useState(false);
  const [isVisible, setIsVisible] = useState(true);
  const { continuousEffects } = useMotionCapabilities();

  // 1. Intersection Observer for Off-screen Pausing
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        setIsVisible(entries[0].isIntersecting);
      },
      { threshold: 0 }
    );

    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    return () => observer.disconnect();
  }, []);

  // 2. HLS Setup and Lifecycle Management
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    let hls: HlsType | null = null;
    let destroyed = false;

    const markLoadedAndPlay = () => {
      setIsLoaded(true);
      if (continuousEffects) {
        safePlay(video);
      }
    };

    video.addEventListener("canplay", markLoadedAndPlay);
    video.addEventListener("loadeddata", markLoadedAndPlay);
    video.addEventListener("playing", markLoadedAndPlay);

    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      // Native HLS support (Safari / iOS)
      video.src = VIDEO_SRC;
      if (continuousEffects) {
        safePlay(video);
      }
    } else {
      // Load lightweight HLS dynamically without bundling into Webpack chunks
      loadHlsScript()
        .then((HlsClass) => {
          if (destroyed || !video) return;
          if (HlsClass.isSupported()) {
            hls = new HlsClass({
              capLevelToPlayerSize: true,
              maxBufferLength: 30,
              debug: false,
            });

            hls.attachMedia(video);
            hls.on(HlsClass.Events.MEDIA_ATTACHED, () => {
              if (destroyed || !hls) return;
              hls.loadSource(VIDEO_SRC);
            });

            hls.on(HlsClass.Events.MANIFEST_PARSED, () => {
              if (destroyed) return;
              setIsLoaded(true);
              if (continuousEffects) {
                safePlay(video);
              }
            });

            hls.on(HlsClass.Events.ERROR, (_event, data) => {
              if (data.fatal && hls) {
                switch (data.type) {
                  case HlsClass.ErrorTypes.NETWORK_ERROR:
                    hls.startLoad();
                    break;
                  case HlsClass.ErrorTypes.MEDIA_ERROR:
                    hls.recoverMediaError();
                    break;
                  default:
                    hls.destroy();
                    break;
                }
              }
            });
          }
        })
        .catch(() => {
          // Fallback to static poster
        });
    }

    return () => {
      destroyed = true;
      video.removeEventListener("canplay", markLoadedAndPlay);
      video.removeEventListener("loadeddata", markLoadedAndPlay);
      video.removeEventListener("playing", markLoadedAndPlay);
      if (hls) {
        hls.destroy();
      }
    };
  }, [continuousEffects]);

  // 3. Playback control: Reacts to visibility and continuousEffects
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (isVisible && continuousEffects) {
      safePlay(video);
    } else {
      video.pause();
    }
  }, [isVisible, continuousEffects]);

  return (
    <div
      ref={containerRef}
      className="pointer-events-none absolute inset-0 z-0 overflow-hidden bg-black"
    >
      {/* Immediate backdrop poster: Prevents black screen while video streams / initial load */}
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-cover bg-center transition-opacity duration-1000 ease-out"
        style={{
          backgroundImage: `url(${POSTER_SRC})`,
          opacity: isLoaded ? 0.4 : 1,
        }}
      />

      <video
        ref={videoRef}
        autoPlay
        muted
        loop
        playsInline
        preload="auto"
        poster={POSTER_SRC}
        className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-[1500ms] ease-out ${
          isLoaded ? "opacity-100" : "opacity-0"
        }`}
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
