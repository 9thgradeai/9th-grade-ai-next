/**
 * Tooltip Component
 * Accessible tooltip with positioning, animations, and keyboard support.
 */

import { useState, useRef, useEffect, useCallback, ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { createPortal } from 'react-dom';

type TooltipPosition = 'top' | 'bottom' | 'left' | 'right' | 'top-start' | 'top-end' | 'bottom-start' | 'bottom-end' | 'left-start' | 'left-end' | 'right-start' | 'right-end';

export interface TooltipProps {
  /** Tooltip content */
  content: ReactNode;
  /** Trigger children (must be a single element) */
  children: ReactNode;
  /** Position */
  position?: TooltipPosition;
  /** Delay before showing (ms) */
  openDelay?: number;
  /** Delay before hiding (ms) */
  closeDelay?: number;
  /** Disable tooltip */
  disabled?: boolean;
  /** Custom className */
  className?: string;
  /** Arrow size */
  arrowSize?: number;
  /** Gap from trigger */
  gap?: number;
}

const positionStyles: Record<TooltipPosition, { tooltip: string; arrow: string }> = {
  top: { tooltip: 'bottom-full left-1/2 -translate-x-1/2 mb-2', arrow: 'top-full left-1/2 -translate-x-1/2' },
  bottom: { tooltip: 'top-full left-1/2 -translate-x-1/2 mt-2', arrow: 'bottom-full left-1/2 -translate-x-1/2' },
  left: { tooltip: 'right-full top-1/2 -translate-y-1/2 mr-2', arrow: 'left-full top-1/2 -translate-y-1/2' },
  right: { tooltip: 'left-full top-1/2 -translate-y-1/2 ml-2', arrow: 'right-full top-1/2 -translate-y-1/2' },
  'top-start': { tooltip: 'bottom-full left-0 mb-2', arrow: 'top-full left-4' },
  'top-end': { tooltip: 'bottom-full right-0 mb-2', arrow: 'top-full right-4' },
  'bottom-start': { tooltip: 'top-full left-0 mt-2', arrow: 'bottom-full left-4' },
  'bottom-end': { tooltip: 'top-full right-0 mt-2', arrow: 'bottom-full right-4' },
  'left-start': { tooltip: 'right-full top-0 mr-2', arrow: 'left-full top-4' },
  'left-end': { tooltip: 'right-full bottom-0 mr-2', arrow: 'left-full bottom-4' },
  'right-start': { tooltip: 'left-full top-0 ml-2', arrow: 'right-full top-4' },
  'right-end': { tooltip: 'left-full bottom-0 ml-2', arrow: 'right-full bottom-4' },
};

export function Tooltip({
  content,
  children,
  position = 'top',
  openDelay = 200,
  closeDelay = 100,
  disabled = false,
  className = '',
  arrowSize = 6,
  gap = 8,
}: TooltipProps) {
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef<HTMLElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const openTimeout = useRef<NodeJS.Timeout | undefined>(undefined);
  const closeTimeout = useRef<NodeJS.Timeout | undefined>(undefined);

  const show = useCallback(() => {
    if (disabled) return;
    clearTimeout(closeTimeout.current);
    openTimeout.current = setTimeout(() => setIsOpen(true), openDelay);
  }, [disabled, openDelay]);

  const hide = useCallback(() => {
    clearTimeout(openTimeout.current);
    closeTimeout.current = setTimeout(() => setIsOpen(false), closeDelay);
  }, [closeDelay]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape' || e.key === 'Tab') {
      hide();
    }
  }, [hide]);

  // Clone child and add event listeners
  const child = Array.isArray(children) ? children[0] : children;
  const childWithProps = child && typeof child === 'object' && 'props' in child
    ? {
        ...child,
        props: {
          ...child.props,
          ref: triggerRef,
          onMouseEnter: show,
          onMouseLeave: hide,
          onFocus: show,
          onBlur: hide,
          onKeyDown: handleKeyDown,
          'aria-describedby': isOpen ? 'tooltip-content' : undefined,
        },
      }
    : child;

  if (!isOpen) {
    return <>{childWithProps}</>;
  }

  const tooltipContent = (
    <motion.div
      ref={tooltipRef}
      id="tooltip-content"
      role="tooltip"
      className={[
        'fixed z-[var(--z-tooltip)]',
        'px-3 py-1.5',
        'text-xs font-medium text-[var(--text-inverse)]',
        'bg-[var(--text-primary)]',
        'rounded-lg',
        'shadow-lg',
        'whitespace-nowrap',
        'pointer-events-none',
        className,
      ].join(' ')}
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.12, ease: [0.16, 1, 0.3, 1] }}
      style={{ transformOrigin: getTransformOrigin(position) }}
    >
      {content}
      <motion.div
        className="absolute w-0 h-0 border-solid"
        style={{
          borderWidth: arrowSize,
          borderColor: 'transparent',
          [getArrowBorderSide(position)]: `var(--text-primary)`,
        }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
      />
    </motion.div>
  );

  return (
    <>
      {childWithProps}
      <AnimatePresence>
        {createPortal(tooltipContent, document.body)}
      </AnimatePresence>
    </>
  );
}

function getTransformOrigin(position: TooltipPosition): string {
  if (position.startsWith('top')) return 'bottom center';
  if (position.startsWith('bottom')) return 'top center';
  if (position.startsWith('left')) return 'center right';
  return 'center left';
}

function getArrowBorderSide(position: TooltipPosition): string {
  if (position.startsWith('top')) return 'borderBottomColor';
  if (position.startsWith('bottom')) return 'borderTopColor';
  if (position.startsWith('left')) return 'borderRightColor';
  return 'borderLeftColor';
}

// ─────────────────────────────────────────────────────────────────────────────
// POPOVER
// ─────────────────────────────────────────────────────────────────────────────

export interface PopoverProps {
  /** Popover content */
  content: ReactNode;
  /** Trigger children */
  children: ReactNode;
  /** Trigger type */
  trigger?: 'click' | 'hover' | 'focus';
  /** Position */
  position?: TooltipPosition;
  /** Close on outside click */
  closeOnOutsideClick?: boolean;
  /** Close on escape */
  closeOnEscape?: boolean;
  /** Custom className */
  className?: string;
  /** Content width */
  width?: string | number;
  /** Show arrow */
  showArrow?: boolean;
}

export function Popover({
  content,
  children,
  trigger = 'click',
  position = 'bottom',
  closeOnOutsideClick = true,
  closeOnEscape = true,
  className = '',
  width = 'max-w-sm',
  showArrow = true,
}: PopoverProps) {
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef<HTMLElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  const toggle = useCallback(() => setIsOpen((prev) => !prev), []);
  const close = useCallback(() => setIsOpen(false), []);

  // Outside click handler
  useEffect(() => {
    if (!isOpen || !closeOnOutsideClick) return;

    const handleClick = (e: MouseEvent) => {
      if (
        triggerRef.current?.contains(e.target as Node) ||
        contentRef.current?.contains(e.target as Node)
      ) {
        return;
      }
      close();
    };

    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [isOpen, closeOnOutsideClick, close]);

  // Escape key handler
  useEffect(() => {
    if (!isOpen || !closeOnEscape) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, closeOnEscape, close]);

  // Focus trap
  useEffect(() => {
    if (!isOpen) return;

    const content = contentRef.current;
    if (!content) return;

    const focusableElements = content.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    firstElement?.focus();

    const handleTab = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;

      if (e.shiftKey && document.activeElement === firstElement) {
        e.preventDefault();
        lastElement?.focus();
      } else if (!e.shiftKey && document.activeElement === lastElement) {
        e.preventDefault();
        firstElement?.focus();
      }
    };

    content.addEventListener('keydown', handleTab);
    return () => content.removeEventListener('keydown', handleTab);
  }, [isOpen]);

  const child = Array.isArray(children) ? children[0] : children;
  const childWithProps = child && typeof child === 'object' && 'props' in child
    ? {
        ...child,
        props: {
          ...child.props,
          ref: triggerRef,
          onClick: trigger === 'click' ? toggle : undefined,
          onMouseEnter: trigger === 'hover' ? () => setIsOpen(true) : undefined,
          onMouseLeave: trigger === 'hover' ? () => setIsOpen(false) : undefined,
          onFocus: trigger === 'focus' ? () => setIsOpen(true) : undefined,
          onBlur: trigger === 'focus' ? () => setIsOpen(false) : undefined,
          'aria-haspopup': 'dialog',
          'aria-expanded': isOpen,
        },
      }
    : child;

  return (
    <>
      {childWithProps}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            ref={contentRef}
            className={[
              'fixed z-[var(--z-modal)]',
              width,
              'bg-[var(--surface-raised)]',
              'border border-[var(--border-subtle)]',
              'rounded-xl',
              'shadow-xl',
              'p-4',
              className,
            ].join(' ')}
            initial={{ opacity: 0, scale: 0.95, y: position && position.startsWith('top') ? 8 : -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: position && position.startsWith('top') ? 8 : -8 }}
            transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
            role="dialog"
            aria-label="Popover content"
          >
            {content}
            {showArrow && (
              <motion.div
                className="absolute w-0 h-0 border-solid"
                style={{
                  borderWidth: 8,
                  borderColor: 'transparent',
                  [getArrowBorderSide(position)]: `var(--surface-raised)`,
                  left: position.startsWith('left') ? 'auto' : position.startsWith('right') ? 'auto' : '20px',
                  right: position.startsWith('right') ? '20px' : 'auto',
                  top: position.startsWith('top') ? 'auto' : position.startsWith('bottom') ? 'auto' : '20px',
                  bottom: position.startsWith('bottom') ? '20px' : 'auto',
                }}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
              />
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// EXPORTS
// ─────────────────────────────────────────────────────────────────────────────

export type {}; // types are exported at their declaration sites above