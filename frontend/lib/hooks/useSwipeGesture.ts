// frontend/lib/hooks/useSwipeGesture.ts
// Touch swipe gesture hook for vocabulary flashcards.
// Swipe left = "Again", right = "Good", up = "Reveal".

"use client";

import { useState, useRef, useCallback } from "react";

type SwipeDirection = "left" | "right" | "up" | "down";

interface UseSwipeGestureOptions {
  onSwipe: (direction: SwipeDirection) => void;
  threshold?: number;
  enabled?: boolean;
}

interface SwipeIndicator {
  action: "again" | "good" | "reveal" | null;
  color: string;
}

interface UseSwipeGestureReturn {
  swipeHandlers: {
    onTouchStart: (e: React.TouchEvent) => void;
    onTouchMove: (e: React.TouchEvent) => void;
    onTouchEnd: () => void;
  };
  swipeOffset: { x: number; y: number };
  isSwiping: boolean;
  swipeIndicator: SwipeIndicator;
}

const INDICATOR_COLORS: Record<string, string> = {
  again: "#ef4444",
  good: "#22c55e",
  reveal: "#3b82f6",
};

export function useSwipeGesture({
  onSwipe,
  threshold = 50,
  enabled = true,
}: UseSwipeGestureOptions): UseSwipeGestureReturn {
  const [swipeOffset, setSwipeOffset] = useState({ x: 0, y: 0 });
  const [isSwiping, setIsSwiping] = useState(false);

  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const swipeCalled = useRef(false);

  const onTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (!enabled) return;
      const touch = e.touches[0];
      if (!touch) return;
      touchStart.current = { x: touch.clientX, y: touch.clientY };
      swipeCalled.current = false;
      setIsSwiping(true);
    },
    [enabled],
  );

  const onTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (!enabled || !touchStart.current) return;
      const touch = e.touches[0];
      if (!touch) return;

      e.preventDefault();

      const dx = touch.clientX - touchStart.current.x;
      const dy = touch.clientY - touchStart.current.y;

      const isHorizontal = Math.abs(dx) > Math.abs(dy);

      if (isHorizontal) {
        setSwipeOffset({ x: dx, y: 0 });
      } else {
        setSwipeOffset({ x: 0, y: dy });
      }
    },
    [enabled],
  );

  const onTouchEnd = useCallback(() => {
    if (!enabled || !touchStart.current) {
      touchStart.current = null;
      setIsSwiping(false);
      return;
    }

    const { x, y } = swipeOffset;

    if (!swipeCalled.current) {
      const isHorizontal = Math.abs(x) > Math.abs(y);

      if (isHorizontal && Math.abs(x) > threshold) {
        onSwipe(x < 0 ? "left" : "right");
        swipeCalled.current = true;
      } else if (!isHorizontal && Math.abs(y) > threshold) {
        if (y < 0) {
          onSwipe("up");
          swipeCalled.current = true;
        } else {
          onSwipe("down");
          swipeCalled.current = true;
        }
      }
    }

    touchStart.current = null;
    setSwipeOffset({ x: 0, y: 0 });
    setIsSwiping(false);
  }, [enabled, swipeOffset, threshold, onSwipe]);

  const swipeIndicator = getSwipeIndicator(swipeOffset, threshold);

  return {
    swipeHandlers: { onTouchStart, onTouchMove, onTouchEnd },
    swipeOffset,
    isSwiping,
    swipeIndicator,
  };
}

function getSwipeIndicator(
  offset: { x: number; y: number },
  threshold: number,
): SwipeIndicator {
  if (offset.x < -threshold) {
    return { action: "again", color: INDICATOR_COLORS.again };
  }
  if (offset.x > threshold) {
    return { action: "good", color: INDICATOR_COLORS.good };
  }
  if (offset.y < -threshold) {
    return { action: "reveal", color: INDICATOR_COLORS.reveal };
  }
  return { action: null, color: "transparent" };
}
