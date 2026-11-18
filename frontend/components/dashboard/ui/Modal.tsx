/**
 * Modal & Drawer Components
 * Accessible dialog components with focus trap, animations, and portals.
 */

import { useEffect, useRef, useCallback, useId, ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { createPortal } from 'react-dom';
import { X } from '@phosphor-icons/react';
import { useFocusTrap } from '@/lib/a11y';
import { useState } from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// MODAL
// ─────────────────────────────────────────────────────────────────────────────

type ModalSize = 'sm' | 'md' | 'lg' | 'xl' | 'full';

export interface ModalProps {
  /** Modal open state */
  isOpen: boolean;
  /** Close handler */
  onClose: () => void;
  /** Modal title */
  title?: string;
  /** Modal description */
  description?: string;
  /** Modal content */
  children: ReactNode;
  /** Size */
  size?: ModalSize;
  /** Show close button */
  showCloseButton?: boolean;
  /** Close on overlay click */
  closeOnOverlayClick?: boolean;
  /** Close on escape */
  closeOnEscape?: boolean;
  /** Disable scroll lock */
  disableScrollLock?: boolean;
  /** Custom className */
  className?: string;
  /** Hide header */
  hideHeader?: boolean;
  /** Footer content */
  footer?: ReactNode;
}

const sizeStyles: Record<string, string> = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
  full: 'max-w-4xl',
};

export function Modal({
  isOpen,
  onClose,
  title,
  description,
  children,
  size = 'md',
  showCloseButton = true,
  closeOnOverlayClick = true,
  closeOnEscape = true,
  disableScrollLock = false,
  className = '',
  hideHeader = false,
  footer,
}: ModalProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  const uid = useId();
  const titleId = title ? `modal-title-${uid}` : undefined;
  const descriptionId = description ? `modal-desc-${uid}` : undefined;
  
  // Generate fallback IDs if they would be undefined (for TypeScript)
  const safeTitleId = titleId || 'modal-title-fallback';
  const safeDescriptionId = descriptionId || 'modal-desc-fallback';

  // Focus trap
  useFocusTrap(contentRef, isOpen, {
    onDeactivate: onClose,
    escapeDeactivates: closeOnEscape,
    clickDeactivates: false, // Handled by overlay
  });

  // Scroll lock
  useEffect(() => {
    if (!isOpen || disableScrollLock) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [isOpen, disableScrollLock]);

  if (!isOpen) return null;

  return createPortal(
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center p-4"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
        role="presentation"
      >
        {/* Overlay */}
        <motion.div
          className="absolute inset-0 bg-[var(--overlay)] backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={closeOnOverlayClick ? onClose : undefined}
          aria-hidden="true"
        />

        {/* Modal */}
        <motion.div
          ref={contentRef}
          className={[
            'relative w-full',
            'bg-[var(--surface-raised)]',
            'border border-[var(--border-subtle)]',
            'rounded-2xl',
            'shadow-2xl',
            'overflow-hidden',
            sizeStyles[size],
            className,
          ].join(' ')}
          initial={{ opacity: 0, scale: 0.95, y: 16 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 16 }}
          transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          aria-describedby={descriptionId}
          tabIndex={-1}
        >
          {/* Header */}
          {!hideHeader && (title || showCloseButton) && (
            <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border-subtle)]">
              <div className="flex-1 min-w-0">
                {title && (
                  <h2
                    id={titleId}
                    className="font-display text-lg font-semibold text-[var(--text-primary)] truncate"
                  >
                    {title}
                  </h2>
                )}
                {description && (
                  <p
                    id={descriptionId}
                    className="mt-1 text-sm text-[var(--text-secondary)]"
                  >
                    {description}
                  </p>
                )}
              </div>
              {showCloseButton && (
                <button
                  type="button"
                  onClick={onClose}
                  className={[
                    'ml-4 flex-shrink-0 p-3 rounded-xl',
                    'min-h-[44px] min-w-[44px]',
                    'text-[var(--text-muted)]',
                    'hover:bg-[var(--surface-muted)] hover:text-[var(--text-primary)]',
                    'transition-colors duration-150',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]',
                  ].join(' ')}
                  aria-label="Close modal"
                >
                  <X className="w-5 h-5" aria-hidden="true" />
                </button>
              )}
            </div>
          )}

          {/* Content */}
          <div className="p-5 max-h-[70vh] overflow-y-auto overscroll-contain">
            {children}
          </div>

          {/* Footer */}
          {footer && (
            <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-[var(--border-subtle)]">
              {footer}
            </div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// DRAWER (Bottom Sheet / Side Sheet)
// ─────────────────────────────────────────────────────────────────────────────

export type DrawerPosition = 'bottom' | 'left' | 'right' | 'top';
type DrawerSize = 'sm' | 'md' | 'lg' | 'xl' | 'full';

export interface DrawerProps {
  /** Drawer open state */
  isOpen: boolean;
  /** Close handler */
  onClose: () => void;
  /** Drawer position */
  position?: DrawerPosition;
  /** Drawer title */
  title?: string;
  /** Drawer description */
  description?: string;
  /** Drawer content */
  children: ReactNode;
  /** Size (width for left/right, height for top/bottom) */
  size?: DrawerSize;
  /** Show drag handle */
  showDragHandle?: boolean;
  /** Close on overlay click */
  closeOnOverlayClick?: boolean;
  /** Close on escape */
  closeOnEscape?: boolean;
  /** Disable scroll lock */
  disableScrollLock?: boolean;
  /** Custom className */
  className?: string;
  /** Hide header */
  hideHeader?: boolean;
  /** Snap points for bottom drawer (fractions of viewport) */
  snapPoints?: number[];
  /** Default snap point index */
  defaultSnap?: number;
}

const drawerSizeStyles: Record<string, { bottom: string; left: string; right: string; top: string }> = {
  sm: { bottom: 'h-[30vh]', left: 'w-[30vw]', right: 'w-[30vw]', top: 'h-[30vh]' },
  md: { bottom: 'h-[50vh]', left: 'w-[50vw]', right: 'w-[50vw]', top: 'h-[50vh]' },
  lg: { bottom: 'h-[70vh]', left: 'w-[70vw]', right: 'w-[70vw]', top: 'h-[70vh]' },
  xl: { bottom: 'h-[85vh]', left: 'w-[85vw]', right: 'w-[85vw]', top: 'h-[85vh]' },
  full: { bottom: 'h-full', left: 'w-full', right: 'w-full', top: 'h-full' },
};

const positionStyles: Record<DrawerPosition, string> = {
  bottom: 'bottom-0 left-0 right-0',
  top: 'top-0 left-0 right-0',
  left: 'left-0 top-0 bottom-0',
  right: 'right-0 top-0 bottom-0',
};

const animateStyles: Record<DrawerPosition, any> = {
  bottom: {
    initial: { y: '100%' },
    animate: { y: 0 },
    exit: { y: '100%' },
  },
  top: {
    initial: { y: '-100%' },
    animate: { y: 0 },
    exit: { y: '-100%' },
  },
  left: {
    initial: { x: '-100%' },
    animate: { x: 0 },
    exit: { x: '-100%' },
  },
  right: {
    initial: { x: '100%' },
    animate: { x: 0 },
    exit: { x: '100%' },
  },
};

export function Drawer({
  isOpen,
  onClose,
  position = 'bottom',
  title,
  description,
  children,
  size = 'md',
  showDragHandle = position === 'bottom',
  closeOnOverlayClick = true,
  closeOnEscape = true,
  disableScrollLock = false,
  className = '',
  hideHeader = false,
}: DrawerProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  const uid = useId();
  const titleId = title ? `drawer-title-${uid}` : undefined;
  const descriptionId = description ? `drawer-desc-${uid}` : undefined;
  const dragHandleRef = useRef<HTMLDivElement>(null);

  // Focus trap
  useFocusTrap(contentRef, isOpen, {
    onDeactivate: onClose,
    escapeDeactivates: closeOnEscape,
    clickDeactivates: false,
  });

  // Scroll lock
  useEffect(() => {
    if (!isOpen || disableScrollLock) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [isOpen, disableScrollLock]);

  // Drag to dismiss (for bottom drawer)
  const [dragY, setDragY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  const handleDragStart = () => {
    if (position !== 'bottom') return;
    setIsDragging(true);
  };

  const handleDragMove = (e: React.TouchEvent | React.MouseEvent) => {
    if (!isDragging || position !== 'bottom') return;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    const startY = dragHandleRef.current?.getBoundingClientRect().top || 0;
    const delta = clientY - startY;
    if (delta > 0) setDragY(delta);
  };

  const handleDragEnd = () => {
    if (!isDragging) return;
    setIsDragging(false);
    if (dragY > 100) {
      onClose();
    }
    setDragY(0);
  };

  if (!isOpen) return null;

  const sizeStyle = drawerSizeStyles[size][position];
  const posStyle = positionStyles[position];
  const anim = animateStyles[position];

  return createPortal(
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-[var(--z-modal)] flex"
        style={{
          justifyContent: position === 'left' || position === 'right' ? 'flex-start' : 'center',
          alignItems: position === 'top' || position === 'bottom' ? 'flex-start' : 'center',
        }}
        initial={false}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        role="presentation"
      >
        {/* Overlay */}
        <motion.div
          className="absolute inset-0 bg-[var(--overlay)] backdrop-blur-sm flex-1"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={closeOnOverlayClick ? onClose : undefined}
          aria-hidden="true"
        />

        {/* Drawer */}
        <motion.div
          ref={contentRef}
          className={[
            'relative flex flex-col',
            'bg-[var(--surface-raised)]',
            'border border-[var(--border-subtle)]',
            'shadow-2xl',
            'overflow-hidden',
            posStyle,
            sizeStyle,
            className,
          ].join(' ')}
          style={{ transform: isDragging ? `translateY(${dragY}px)` : undefined }}
          initial={anim.initial}
          animate={isDragging ? { y: dragY } : anim.animate}
          exit={anim.exit}
          transition={{ type: 'spring', stiffness: 340, damping: 32 }}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          aria-describedby={descriptionId}
          tabIndex={-1}
          onTouchStart={handleDragStart}
          onTouchMove={handleDragMove}
          onTouchEnd={handleDragEnd}
          onMouseDown={handleDragStart}
          onMouseMove={handleDragMove}
          onMouseUp={handleDragEnd}
          onMouseLeave={handleDragEnd}
        >
          {/* Drag Handle */}
          {showDragHandle && position === 'bottom' && (
            <motion.div
              ref={dragHandleRef}
              className="flex items-center justify-center px-4 py-3 cursor-grab active:cursor-grabbing touch-none"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              <span className="w-9 h-1 rounded-full bg-[var(--border-subtle)]" aria-hidden="true" />
            </motion.div>
          )}

          {/* Header */}
          {!hideHeader && (title || showDragHandle) && (
            <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border-subtle)]">
              <div className="flex-1 min-w-0">
                {title && (
                  <h2
                    id={titleId}
                    className="font-display text-lg font-semibold text-[var(--text-primary)] truncate"
                  >
                    {title}
                  </h2>
                )}
                {description && (
                  <p
                    id={descriptionId}
                    className="mt-1 text-sm text-[var(--text-secondary)]"
                  >
                    {description}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={onClose}
                className={[
                  'ml-4 flex-shrink-0 p-2 rounded-xl',
                  'text-[var(--text-muted)]',
                  'hover:bg-[var(--surface-muted)] hover:text-[var(--text-primary)]',
                  'transition-colors duration-150',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]',
                ].join(' ')}
                aria-label="Close drawer"
              >
                <X className="w-5 h-5" aria-hidden="true" />
              </button>
            </div>
          )}

          {/* Content */}
          <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-5">
            {children}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ALERT DIALOG (Confirm dialog)
// ─────────────────────────────────────────────────────────────────────────────

export interface AlertDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description?: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'default' | 'danger';
  loading?: boolean;
}

export function AlertDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  variant = 'default',
  loading = false,
}: AlertDialogProps) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      description={description}
      size="sm"
      showCloseButton={false}
      closeOnOverlayClick={!loading}
      closeOnEscape={!loading}
    >
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2 text-sm font-mono font-semibold rounded-lg border border-[var(--border-default)] text-[var(--text-secondary)] hover:bg-[var(--surface-muted)] transition-colors disabled:opacity-50"
          >
            {cancelText}
          </button>
          <button
            type="button"
            onClick={() => { onConfirm(); onClose(); }}
            disabled={loading}
            className={[
              'px-4 py-2 text-sm font-mono font-semibold rounded-lg',
              'text-[var(--text-inverse)]',
              'transition-colors disabled:opacity-50',
              variant === 'danger'
                ? 'bg-[var(--danger)] hover:bg-[var(--danger)]/90'
                : 'bg-[var(--primary)] hover:bg-[var(--primary-hover)]',
            ].join(' ')}
          >
            {loading ? 'Processing...' : confirmText}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// EXPORTS
// ─────────────────────────────────────────────────────────────────────────────

export type {}; // types are exported at their declaration sites above