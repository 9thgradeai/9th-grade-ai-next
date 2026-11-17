/**
 * Touch Gesture Utilities
 * Swipe, drag, pinch, long-press handlers for mobile-first interactions.
 */

import { useEffect, useRef, useCallback, useState } from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// GESTURE CONFIG
// ─────────────────────────────────────────────────────────────────────────────

export interface GestureConfig {
  /** Minimum distance (px) to register as swipe */
  threshold?: number;
  /** Maximum time (ms) for swipe */
  maxTime?: number;
  /** Minimum velocity (px/ms) for flick */
  velocity?: number;
  /** Prevent default touch behavior (scroll) */
  preventDefault?: boolean;
  /** Allow vertical scroll during horizontal swipe detection */
  allowVerticalScroll?: boolean;
}

export interface SwipeDirection {
  x: 'left' | 'right' | 'none';
  y: 'up' | 'down' | 'none';
  dominant: 'horizontal' | 'vertical' | 'none';
}

export interface GestureState {
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
  deltaX: number;
  deltaY: number;
  velocityX: number;
  velocityY: number;
  direction: SwipeDirection;
  isActive: boolean;
  startTime: number;
}

const DEFAULT_CONFIG: Required<GestureConfig> = {
  threshold: 40,
  maxTime: 300,
  velocity: 0.3,
  preventDefault: false,
  allowVerticalScroll: true,
};

// ─────────────────────────────────────────────────────────────────────────────
// SWIPE HOOK
// ─────────────────────────────────────────────────────────────────────────────

export interface UseSwipeOptions extends GestureConfig {
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  onSwipeUp?: () => void;
  onSwipeDown?: () => void;
  onSwipeStart?: () => void;
  onSwipeMove?: (state: GestureState) => void;
  onSwipeEnd?: (state: GestureState) => void;
}

export function useSwipe(
  elementRef: React.RefObject<HTMLElement | null>,
  options: UseSwipeOptions = {}
) {
  const {
    threshold = DEFAULT_CONFIG.threshold,
    maxTime = DEFAULT_CONFIG.maxTime,
    velocity = DEFAULT_CONFIG.velocity,
    preventDefault = DEFAULT_CONFIG.preventDefault,
    allowVerticalScroll = DEFAULT_CONFIG.allowVerticalScroll,
    onSwipeLeft,
    onSwipeRight,
    onSwipeUp,
    onSwipeDown,
    onSwipeStart,
    onSwipeMove,
    onSwipeEnd,
  } = options;

  const stateRef = useRef<GestureState>({
    startX: 0,
    startY: 0,
    currentX: 0,
    currentY: 0,
    deltaX: 0,
    deltaY: 0,
    velocityX: 0,
    velocityY: 0,
    direction: { x: 'none', y: 'none', dominant: 'none' },
    isActive: false,
    startTime: 0,
  });

  const animationRef = useRef<number | undefined>(undefined);

  const calculateDirection = (deltaX: number, deltaY: number): SwipeDirection => {
    const absX = Math.abs(deltaX);
    const absY = Math.abs(deltaY);

    if (absX < threshold && absY < threshold) {
      return { x: 'none', y: 'none', dominant: 'none' };
    }

    const dominant = absX > absY ? 'horizontal' : 'vertical';

    return {
      x: deltaX > 0 ? 'right' : 'left',
      y: deltaY > 0 ? 'down' : 'up',
      dominant,
    };
  };

  const handleTouchStart = useCallback(
    (e: TouchEvent) => {
      const touch = e.touches[0];
      if (!touch) return;

      if (preventDefault) e.preventDefault();

      stateRef.current = {
        startX: touch.clientX,
        startY: touch.clientY,
        currentX: touch.clientX,
        currentY: touch.clientY,
        deltaX: 0,
        deltaY: 0,
        velocityX: 0,
        velocityY: 0,
        direction: { x: 'none', y: 'none', dominant: 'none' },
        isActive: true,
        startTime: Date.now(),
      };

      onSwipeStart?.();
    },
    [preventDefault, onSwipeStart]
  );

  const handleTouchMove = useCallback(
    (e: TouchEvent) => {
      if (!stateRef.current.isActive) return;

      const touch = e.touches[0];
      if (!touch) return;

      const { startX, startY, startTime } = stateRef.current;
      const deltaX = touch.clientX - startX;
      const deltaY = touch.clientY - startY;
      const elapsed = Date.now() - startTime;

      // Calculate velocity
      const velocityX = deltaX / Math.max(elapsed, 1);
      const velocityY = deltaY / Math.max(elapsed, 1);

      const direction = calculateDirection(deltaX, deltaY);

      stateRef.current = {
        ...stateRef.current,
        currentX: touch.clientX,
        currentY: touch.clientY,
        deltaX,
        deltaY,
        velocityX,
        velocityY,
        direction,
      };

      // Allow vertical scroll if horizontal swipe not dominant
      if (allowVerticalScroll && direction.dominant === 'vertical') {
        return;
      }

      if (preventDefault && direction.dominant === 'horizontal') {
        e.preventDefault();
      }

      onSwipeMove?.(stateRef.current);
    },
    [allowVerticalScroll, preventDefault, onSwipeMove]
  );

  const handleTouchEnd = useCallback(() => {
    if (!stateRef.current.isActive) return;

    const { deltaX, deltaY, velocityX, velocityY, startTime, direction } = stateRef.current;
    const elapsed = Date.now() - startTime;

    // Determine if swipe qualifies
    const isSwipe =
      elapsed <= maxTime &&
      (Math.abs(deltaX) >= threshold ||
        Math.abs(deltaY) >= threshold ||
        Math.abs(velocityX) >= velocity ||
        Math.abs(velocityY) >= velocity);

    if (isSwipe) {
      if (direction.dominant === 'horizontal') {
        if (direction.x === 'left') onSwipeLeft?.();
        else if (direction.x === 'right') onSwipeRight?.();
      } else if (direction.dominant === 'vertical') {
        if (direction.y === 'up') onSwipeUp?.();
        else if (direction.y === 'down') onSwipeDown?.();
      }
    }

    onSwipeEnd?.(stateRef.current);

    stateRef.current.isActive = false;
  }, [maxTime, threshold, velocity, onSwipeLeft, onSwipeRight, onSwipeUp, onSwipeDown, onSwipeEnd]);

  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;

    element.addEventListener('touchstart', handleTouchStart, { passive: !preventDefault });
    element.addEventListener('touchmove', handleTouchMove, { passive: !preventDefault });
    element.addEventListener('touchend', handleTouchEnd);
    element.addEventListener('touchcancel', handleTouchEnd);

    return () => {
      element.removeEventListener('touchstart', handleTouchStart);
      element.removeEventListener('touchmove', handleTouchMove);
      element.removeEventListener('touchend', handleTouchEnd);
      element.removeEventListener('touchcancel', handleTouchEnd);
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [elementRef, handleTouchStart, handleTouchMove, handleTouchEnd, preventDefault]);

  return stateRef;
}

// ─────────────────────────────────────────────────────────────────────────────
// DRAG HOOK
// ─────────────────────────────────────────────────────────────────────────────

export interface DragConstraints {
  minX?: number;
  maxX?: number;
  minY?: number;
  maxY?: number;
}

export interface UseDragOptions extends GestureConfig {
  constraints?: DragConstraints;
  onDragStart?: (x: number, y: number) => void;
  onDragMove?: (x: number, y: number, deltaX: number, deltaY: number) => void;
  onDragEnd?: (x: number, y: number, velocityX: number, velocityY: number) => void;
}

export function useDrag(
  elementRef: React.RefObject<HTMLElement | null>,
  options: UseDragOptions = {}
) {
  const { constraints, onDragStart, onDragMove, onDragEnd, ...swipeOptions } = options;
  const [isDragging, setIsDragging] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const positionRef = useRef({ x: 0, y: 0 });
  const startPosRef = useRef({ x: 0, y: 0 });

  const handleTouchStart = useCallback(
    (e: TouchEvent) => {
      const touch = e.touches[0];
      if (!touch) return;

      startPosRef.current = { x: touch.clientX, y: touch.clientY };
      setIsDragging(true);
      onDragStart?.(positionRef.current.x, positionRef.current.y);
    },
    [onDragStart]
  );

  const handleTouchMove = useCallback(
    (e: TouchEvent) => {
      if (!isDragging) return;

      const touch = e.touches[0];
      if (!touch) return;

      const deltaX = touch.clientX - startPosRef.current.x;
      const deltaY = touch.clientY - startPosRef.current.y;

      let newX = positionRef.current.x + deltaX;
      let newY = positionRef.current.y + deltaY;

      // Apply constraints
      if (constraints) {
        if (constraints.minX !== undefined) newX = Math.max(newX, constraints.minX);
        if (constraints.maxX !== undefined) newX = Math.min(newX, constraints.maxX);
        if (constraints.minY !== undefined) newY = Math.max(newY, constraints.minY);
        if (constraints.maxY !== undefined) newY = Math.min(newY, constraints.maxY);
      }

      positionRef.current = { x: newX, y: newY };
      setPosition({ x: newX, y: newY });
      onDragMove?.(newX, newY, deltaX, deltaY);
    },
    [isDragging, constraints, onDragMove]
  );

  const handleTouchEnd = useCallback(() => {
    if (!isDragging) return;

    setIsDragging(false);
    onDragEnd?.(positionRef.current.x, positionRef.current.y, 0, 0);
  }, [isDragging, onDragEnd]);

  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;

    element.addEventListener('touchstart', handleTouchStart, { passive: true });
    element.addEventListener('touchmove', handleTouchMove, { passive: true });
    element.addEventListener('touchend', handleTouchEnd);
    element.addEventListener('touchcancel', handleTouchEnd);

    return () => {
      element.removeEventListener('touchstart', handleTouchStart);
      element.removeEventListener('touchmove', handleTouchMove);
      element.removeEventListener('touchend', handleTouchEnd);
      element.removeEventListener('touchcancel', handleTouchEnd);
    };
  }, [elementRef, handleTouchStart, handleTouchMove, handleTouchEnd]);

  return {
    isDragging,
    position,
    setPosition: (x: number, y: number) => {
      positionRef.current = { x, y };
      setPosition({ x, y });
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// LONG PRESS HOOK
// ─────────────────────────────────────────────────────────────────────────────

export interface UseLongPressOptions {
  /** Time (ms) to trigger long press */
  delay?: number;
  /** Move tolerance (px) before canceling */
  tolerance?: number;
  onLongPress?: () => void;
  onLongPressStart?: () => void;
  onLongPressEnd?: () => void;
}

export function useLongPress(
  elementRef: React.RefObject<HTMLElement | null>,
  options: UseLongPressOptions = {}
) {
  const { delay = 500, tolerance = 10, onLongPress, onLongPressStart, onLongPressEnd } = options;
  const timeoutRef = useRef<number | undefined>(undefined);
  const startPosRef = useRef({ x: 0, y: 0 });
  const triggeredRef = useRef(false);

  const clear = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = undefined;
    }
    triggeredRef.current = false;
  }, []);

  const handleStart = useCallback(
    (e: TouchEvent | MouseEvent) => {
      const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
      const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

      startPosRef.current = { x: clientX, y: clientY };
      triggeredRef.current = false;

      timeoutRef.current = window.setTimeout(() => {
        triggeredRef.current = true;
        onLongPressStart?.();
        onLongPress?.();
      }, delay);
    },
    [delay, onLongPress, onLongPressStart]
  );

  const handleMove = useCallback(
    (e: TouchEvent | MouseEvent) => {
      if (triggeredRef.current) return;

      const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
      const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

      const dx = clientX - startPosRef.current.x;
      const dy = clientY - startPosRef.current.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance > tolerance) {
        clear();
      }
    },
    [tolerance, clear]
  );

  const handleEnd = useCallback(() => {
    clear();
    if (triggeredRef.current) {
      onLongPressEnd?.();
    }
  }, [clear, onLongPressEnd]);

  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;

    // Touch events
    element.addEventListener('touchstart', handleStart as any, { passive: true });
    element.addEventListener('touchmove', handleMove as any, { passive: true });
    element.addEventListener('touchend', handleEnd);
    element.addEventListener('touchcancel', handleEnd);

    // Mouse events (for desktop testing)
    element.addEventListener('mousedown', handleStart as any);
    element.addEventListener('mousemove', handleMove as any);
    element.addEventListener('mouseup', handleEnd);
    element.addEventListener('mouseleave', handleEnd);

    return () => {
      element.removeEventListener('touchstart', handleStart as any);
      element.removeEventListener('touchmove', handleMove as any);
      element.removeEventListener('touchend', handleEnd);
      element.removeEventListener('touchcancel', handleEnd);
      element.removeEventListener('mousedown', handleStart as any);
      element.removeEventListener('mousemove', handleMove as any);
      element.removeEventListener('mouseup', handleEnd);
      element.removeEventListener('mouseleave', handleEnd);
      clear();
    };
  }, [elementRef, handleStart, handleMove, handleEnd, clear]);

  return { clear };
}

// ─────────────────────────────────────────────────────────────────────────────
// PULL TO REFRESH HOOK
// ─────────────────────────────────────────────────────────────────────────────

export interface UsePullToRefreshOptions {
  /** Distance (px) to trigger refresh */
  threshold?: number;
  /** Resistance factor (0-1) */
  resistance?: number;
  onRefresh?: () => Promise<void>;
  onPull?: (progress: number) => void;
}

export function usePullToRefresh(
  scrollContainerRef: React.RefObject<HTMLElement | null>,
  options: UsePullToRefreshOptions = {}
) {
  const { threshold = 80, resistance = 0.5, onRefresh, onPull } = options;
  const [isPulling, setIsPulling] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const startYRef = useRef(0);
  const isAtTopRef = useRef(false);

  const handleTouchStart = useCallback((e: TouchEvent) => {
    const container = scrollContainerRef.current;
    if (!container) return;

    isAtTopRef.current = container.scrollTop === 0;
    if (!isAtTopRef.current) return;

    startYRef.current = e.touches[0].clientY;
  }, [scrollContainerRef]);

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (!isAtTopRef.current || isRefreshing) return;

    const currentY = e.touches[0].clientY;
    const deltaY = currentY - startYRef.current;

    if (deltaY <= 0) return; // Only pull down

    e.preventDefault();

    const distance = Math.min(deltaY * resistance, threshold * 1.5);
    setPullDistance(distance);
    setIsPulling(true);
    onPull?.(distance / threshold);
  }, [isRefreshing, resistance, threshold, onPull]);

  const handleTouchEnd = useCallback(async () => {
    if (!isPulling || isRefreshing) return;

    setIsPulling(false);

    if (pullDistance >= threshold && onRefresh) {
      setIsRefreshing(true);
      setPullDistance(0);
      try {
        await onRefresh();
      } finally {
        setIsRefreshing(false);
      }
    } else {
      // Animate back
      setPullDistance(0);
    }
  }, [isPulling, isRefreshing, pullDistance, threshold, onRefresh]);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const onEnd = () => {
      void handleTouchEnd();
    };

    container.addEventListener('touchstart', handleTouchStart, { passive: true });
    container.addEventListener('touchmove', handleTouchMove, { passive: false });
    container.addEventListener('touchend', onEnd);
    container.addEventListener('touchcancel', onEnd);

    return () => {
      container.removeEventListener('touchstart', handleTouchStart);
      container.removeEventListener('touchmove', handleTouchMove);
      container.removeEventListener('touchend', onEnd);
      container.removeEventListener('touchcancel', onEnd);
    };
  }, [scrollContainerRef, handleTouchStart, handleTouchMove, handleTouchEnd]);

  return { isPulling, isRefreshing, pullDistance, pullProgress: pullDistance / threshold };
}

// ─────────────────────────────────────────────────────────────────────────────
// HAPTIC FEEDBACK
// ─────────────────────────────────────────────────────────────────────────────

export type HapticType = 'light' | 'medium' | 'heavy' | 'selection' | 'success' | 'warning' | 'error';

export function hapticFeedback(type: HapticType = 'light') {
  if (typeof navigator === 'undefined' || !navigator.vibrate) return;

  const patterns: Record<HapticType, number | number[]> = {
    light: 10,
    medium: 20,
    heavy: 40,
    selection: 5,
    success: [10, 50, 10],
    warning: [20, 100, 20],
    error: [30, 50, 30, 50, 30],
  };

  navigator.vibrate(patterns[type]);
}

export function useHapticFeedback() {
  return useCallback((type: HapticType = 'light') => hapticFeedback(type), []);
}

// ─────────────────────────────────────────────────────────────────────────────
// EXPORTS
// ─────────────────────────────────────────────────────────────────────────────

export type {}; // types are exported at their declaration sites above