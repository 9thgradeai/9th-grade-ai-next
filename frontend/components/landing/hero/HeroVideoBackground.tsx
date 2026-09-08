"use client";

import { useEffect, useRef, useState } from "react";
import type HlsType from "hls.js";
import { useMotionCapabilities } from "@/lib/motion/device";

const VIDEO_SRC = "https://stream.mux.com/T6oQJQ02cQ6N01TR6iHwZkKFkbepS34dkkIc9iukgy400g.m3u8";

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

  // 2. HLS Setup and Resource Tuning
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    let hls: HlsType | null = null;
    let destroyed = false;

    const handleCanPlay = () => setIsLoaded(true);
    video.addEventListener("canplay", handleCanPlay);
    video.addEventListener("loadeddata", handleCanPlay);

    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      // Native HLS support (Safari / iOS)
      video.src = VIDEO_SRC;
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
            hls.loadSource(VIDEO_SRC);
            hls.attachMedia(video);
          }
        })
        .catch(() => {
          // Graceful fallback
        });
    }

    return () => {
      destroyed = true;
      video.removeEventListener("canplay", handleCanPlay);
      video.removeEventListener("loadeddata", handleCanPlay);
      if (hls) {
        hls.destroy();
      }
    };
  }, []);

  // 3. Playback control: Reacts to visibility and reduced motion
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (isVisible && continuousEffects) {
      video.play().catch(() => {});
    } else {
      video.pause();
    }
  }, [isVisible, continuousEffects]);

  return (
    <div
      ref={containerRef}
      className="pointer-events-none absolute inset-0 z-0 overflow-hidden bg-black"
    >
      <video
        ref={videoRef}
        muted
        loop
        playsInline
        className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-[2000ms] ease-out ${
          isLoaded ? "opacity-100" : "opacity-0"
        }`}
        aria-hidden="true"
      />
    </div>
  );
}
