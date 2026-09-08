"use client";

import { useEffect, useRef, useState } from "react";
import Hls from "hls.js";
import { useMotionCapabilities } from "@/lib/motion/device";

const VIDEO_SRC = "https://stream.mux.com/T6oQJQ02cQ6N01TR6iHwZkKFkbepS34dkkIc9iukgy400g.m3u8";

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

    let hls: Hls | null = null;

    const handleCanPlay = () => setIsLoaded(true);
    video.addEventListener("canplay", handleCanPlay);
    // Fallback for Safari which sometimes triggers loadeddata instead
    video.addEventListener("loadeddata", handleCanPlay);

    if (Hls.isSupported()) {
      hls = new Hls({
        capLevelToPlayerSize: true, // Prevents loading 4K chunks on small mobile screens
        maxBufferLength: 30,        // Caps memory usage to 30s of video
        debug: false,
      });
      hls.loadSource(VIDEO_SRC);
      hls.attachMedia(video);
    } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
      // Native Safari fallback
      video.src = VIDEO_SRC;
    }

    return () => {
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
