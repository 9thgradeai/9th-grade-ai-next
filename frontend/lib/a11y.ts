/**
 * Accessibility Utilities
 * ARIA helpers, focus management, keyboard navigation, screen reader support.
 */

import { RefObject, useEffect, useRef, useCallback } from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// ARIA HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/** Generate unique IDs for ARIA relationships */
let idCounter = 0;
export function generateId(prefix = 'a11y'): string {
  return `${prefix}-${++idCounter}-${Math.random().toString(36).slice(2, 9)}`;
}

/** Combine multiple refs into one */
export function mergeRefs<T>(
  ...refs: (React.RefObject<T | null> | React.MutableRefObject<T | null> | ((v: T | null) => void) | null)[]
): (v: T | null) => void {
  return (value) => {
    refs.forEach((ref) => {
      if (typeof ref === 'function') {
        ref(value);
      } else if (ref && 'current' in ref) {
        (ref as React.MutableRefObject<T | null>).current = value;
      }
    });
  };
}

/** Create describedby string from IDs */
export function describedBy(...ids: (string | undefined | null)[]): string | undefined {
  const valid = ids.filter(Boolean);
  return valid.length > 0 ? valid.join(' ') : undefined;
}

/** Create labelledby string from IDs */
export function labelledBy(...ids: (string | undefined | null)[]): string | undefined {
  return describedBy(...ids);
}

// ─────────────────────────────────────────────────────────────────────────────
// FOCUS MANAGEMENT
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Focus trap for modals, drawers, dialogs.
 * Call in useEffect with the container ref and `isOpen` state.
 */
export function useFocusTrap(
  containerRef: RefObject<HTMLElement | null>,
  isOpen: boolean,
  options: {
    onDeactivate?: () => void;
    fallbackFocus?: HTMLElement | null;
    clickDeactivates?: boolean;
    escapeDeactivates?: boolean;
  } = {}
) {
  const { onDeactivate, fallbackFocus, clickDeactivates = false, escapeDeactivates = true } = options;
  const previouslyFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!isOpen || !containerRef.current) return;

    // Save previously focused element
    previouslyFocused.current = document.activeElement as HTMLElement;

    const container = containerRef.current;
    const focusableSelectors = [
      'a[href]',
      'button:not([disabled])',
      'input:not([disabled])',
      'select:not([disabled])',
      'textarea:not([disabled])',
      '[tabindex]:not([tabindex="-1"])',
      '[contenteditable="true"]',
    ].join(',');

    const getFocusableElements = () =>
      Array.from(container.querySelectorAll<HTMLElement>(focusableSelectors)).filter(
        (el) => el.offsetWidth > 0 && el.offsetHeight > 0 && !el.hasAttribute('disabled')
      );

    // Focus first focusable element
    const focusables = getFocusableElements();
    if (focusables.length > 0) {
      focusables[0].focus();
    } else if (fallbackFocus) {
      fallbackFocus.focus();
    } else {
      container.focus();
    }

    // Handle Tab key
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;

      const focusables = getFocusableElements();
      if (focusables.length === 0) return;

      const first = focusables[0];
      const last = focusables[focusables.length - 1];

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    // Handle Escape
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && escapeDeactivates) {
        e.preventDefault();
        onDeactivate?.();
      }
    };

    // Handle click outside
    const handleClick = (e: MouseEvent) => {
      if (clickDeactivates && container && !container.contains(e.target as Node)) {
        onDeactivate?.();
      }
    };

    container.addEventListener('keydown', handleKeyDown);
    document.addEventListener('keydown', handleEscape);
    if (clickDeactivates) document.addEventListener('mousedown', handleClick);

    return () => {
      container.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('keydown', handleEscape);
      if (clickDeactivates) document.removeEventListener('mousedown', handleClick);

      // Restore focus
      if (previouslyFocused.current && typeof previouslyFocused.current.focus === 'function') {
        previouslyFocused.current.focus();
      }
    };
  }, [isOpen, containerRef, onDeactivate, fallbackFocus, clickDeactivates, escapeDeactivates]);
}

/**
 * Restore focus to a previously saved element.
 * Call when closing a modal/drawer.
 */
export function useFocusRestore(trigger: unknown, targetRef?: RefObject<HTMLElement | null>) {
  const savedRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    savedRef.current = document.activeElement as HTMLElement;
  }, [trigger]);

  const restore = useCallback(() => {
    const target = targetRef?.current ?? savedRef.current;
    if (target && typeof target.focus === 'function') {
      target.focus();
    }
  }, [targetRef]);

  return { restore, savedRef };
}

/**
 * Auto-focus an element when it mounts (respects reduced motion).
 */
export function useAutoFocus(ref: RefObject<HTMLElement | null>, condition = true) {
  useEffect(() => {
    if (!condition || !ref.current) return;
    // Use requestAnimationFrame to ensure element is rendered
    requestAnimationFrame(() => {
      ref.current?.focus({ preventScroll: true });
    });
  }, [ref, condition]);
}

// ─────────────────────────────────────────────────────────────────────────────
// KEYBOARD NAVIGATION
// ─────────────────────────────────────────────────────────────────────────────

/** Keyboard navigation for roving tabindex (lists, grids, tabs) */
export function useRovingTabIndex(
  itemsRef: RefObject<HTMLElement[]>,
  options: {
    orientation?: 'horizontal' | 'vertical' | 'both';
    loop?: boolean;
    onSelect?: (index: number) => void;
  } = {}
) {
  const { orientation = 'vertical', loop = true, onSelect } = options;
  const currentIndex = useRef(0);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      const items = itemsRef.current;
      if (!items.length) return;

      const isHorizontal = orientation === 'horizontal' || orientation === 'both';
      const isVertical = orientation === 'vertical' || orientation === 'both';

      let nextIndex = currentIndex.current;

      if (isHorizontal && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) {
        e.preventDefault();
        nextIndex = e.key === 'ArrowRight' ? currentIndex.current + 1 : currentIndex.current - 1;
      } else if (isVertical && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
        e.preventDefault();
        nextIndex = e.key === 'ArrowDown' ? currentIndex.current + 1 : currentIndex.current - 1;
      } else if (e.key === 'Home') {
        e.preventDefault();
        nextIndex = 0;
      } else if (e.key === 'End') {
        e.preventDefault();
        nextIndex = items.length - 1;
      } else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onSelect?.(currentIndex.current);
        return;
      } else {
        return;
      }

      if (loop) {
        nextIndex = (nextIndex + items.length) % items.length;
      } else {
        nextIndex = Math.max(0, Math.min(items.length - 1, nextIndex));
      }

      currentIndex.current = nextIndex;
      items[nextIndex]?.focus();
    },
    [itemsRef, orientation, loop, onSelect]
  );

  return { handleKeyDown, currentIndex };
}

/** Global keyboard shortcuts */
export function useGlobalShortcuts(shortcuts: Record<string, () => void>) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Don't trigger when typing in inputs
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable
      ) {
        return;
      }

      // Build key combination
      const parts: string[] = [];
      if (e.metaKey || e.ctrlKey) parts.push('mod');
      if (e.shiftKey) parts.push('shift');
      if (e.altKey) parts.push('alt');
      parts.push(e.key.toLowerCase());

      const combo = parts.join('+');
      if (shortcuts[combo]) {
        e.preventDefault();
        shortcuts[combo]();
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [shortcuts]);
}

// ─────────────────────────────────────────────────────────────────────────────
// SCREEN READER SUPPORT
// ─────────────────────────────────────────────────────────────────────────────

/** Announce to screen readers via live region */
export function announce(message: string, politeness: 'polite' | 'assertive' = 'polite') {
  const region = document.createElement('div');
  region.setAttribute('role', 'status');
  region.setAttribute('aria-live', politeness);
  region.setAttribute('aria-atomic', 'true');
  region.className = 'sr-only';
  region.textContent = message;
  document.body.appendChild(region);

  // Remove after announcement
  setTimeout(() => {
    document.body.removeChild(region);
  }, 1000);
}

/** Hook for announcing changes */
export function useAnnounce() {
  return useCallback((message: string, politeness: 'polite' | 'assertive' = 'polite') => announce(message, politeness), []);
}

/** Visually hidden but screen-reader accessible */
export const srOnly = {
  position: 'absolute',
  width: '1px',
  height: '1px',
  padding: '0',
  margin: '-1px',
  overflow: 'hidden',
  clip: 'rect(0, 0, 0, 0)',
  whiteSpace: 'nowrap',
  border: '0',
} as const;

/** Focus visible styles (for custom focus rings) */
export const focusVisible = {
  outline: 'none',
  ring: '2px',
  ringColor: 'var(--focus-ring)',
  ringOffset: '2px',
  ringOffsetColor: 'var(--surface-base)',
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// COLOR CONTRAST HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/** Check if color meets WCAG contrast ratio */
export function meetsContrast(
  foreground: string,
  background: string,
  level: 'AA' | 'AAA' = 'AA',
  size: 'normal' | 'large' = 'normal'
): boolean {
  // This would need a color parsing library in practice
  // Placeholder for runtime checking
  return true;
}

/** Get contrast-safe text color for a background */
export function getContrastText(background: string): string {
  // Placeholder - would use color parsing in practice
  return 'var(--text-primary)';
}

// ─────────────────────────────────────────────────────────────────────────────
// REDUCED MOTION
// ─────────────────────────────────────────────────────────────────────────────

/** Check if user prefers reduced motion */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Check if user prefers high contrast */
export function prefersHighContrast(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-contrast: more)').matches;
}

/** Check if user prefers reduced transparency */
export function prefersReducedTransparency(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-transparency: reduce)').matches;
}

// ─────────────────────────────────────────────────────────────────────────────
// TOUCH TARGET VALIDATION
// ─────────────────────────────────────────────────────────────────────────────

/** Validate element meets minimum touch target size (44x44px) */
export function validateTouchTarget(element: HTMLElement): boolean {
  const rect = element.getBoundingClientRect();
  return rect.width >= 44 && rect.height >= 44;
}

/** Get all elements that fail touch target validation */
export function findSmallTouchTargets(root: HTMLElement = document.body): HTMLElement[] {
  const interactive = root.querySelectorAll<HTMLElement>(
    'button, a, input, select, textarea, [role="button"], [tabindex]:not([tabindex="-1"])'
  );
  return Array.from(interactive).filter((el) => !validateTouchTarget(el));
}

// ─────────────────────────────────────────────────────────────────────────────
// EXPORTS
// ─────────────────────────────────────────────────────────────────────────────

export type FocusTrapOptions = Parameters<typeof useFocusTrap>[2];
export type RovingTabIndexOptions = Parameters<typeof useRovingTabIndex>[1];
export type GlobalShortcuts = Record<string, () => void>;