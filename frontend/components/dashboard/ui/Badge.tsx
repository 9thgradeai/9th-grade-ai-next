/**
 * Badge Component
 * Versatile badge/tag component with variants, sizes, and states.
 */

import { forwardRef, ReactNode } from 'react';
import { HTMLMotionProps } from 'framer-motion';
import { motion } from 'framer-motion';

export interface BadgeProps extends Omit<HTMLMotionProps<'span'>, 'onDrag' | 'children'> {
  /** Badge content */
  children?: ReactNode;
  /** Badge variant */
  variant?: 'default' | 'primary' | 'success' | 'warning' | 'danger' | 'info' | 'outline' | 'ghost';
  /** Badge size */
  size?: 'xs' | 'sm' | 'md' | 'lg';
  /** Rounded style */
  rounded?: 'md' | 'lg' | 'full';
  /** Icon before text */
  icon?: React.ReactNode;
  /** Icon after text */
  iconAfter?: React.ReactNode;
  /** Dismissible */
  dismissible?: boolean;
  /** Dismiss handler */
  onDismiss?: () => void;
  /** Pulsing animation */
  pulsing?: boolean;
}

const variantStyles: Record<NonNullable<BadgeProps['variant']>, string> = {
  default: 'bg-[var(--surface-muted)] text-[var(--text-secondary)] border border-[var(--border-subtle)]',
  primary: 'bg-[var(--primary-soft)] text-[var(--primary)] border border-[var(--primary)]/20',
  success: 'bg-[var(--success-soft)] text-[var(--success)] border border-[var(--success)]/20',
  warning: 'bg-[var(--warning-soft)] text-[var(--warning)] border border-[var(--warning)]/20',
  danger: 'bg-[var(--danger-soft)] text-[var(--danger)] border border-[var(--danger)]/20',
  info: 'bg-[var(--info-soft)] text-[var(--info)] border border-[var(--info)]/20',
  outline: 'bg-transparent text-[var(--text-primary)] border border-[var(--border-strong)]',
  ghost: 'bg-transparent text-[var(--text-secondary)] border border-transparent',
};

const sizeStyles: Record<NonNullable<BadgeProps['size']>, string> = {
  xs: 'px-1.5 py-0.5 text-[10px] gap-1',
  sm: 'px-2 py-0.5 text-[11px] gap-1.5',
  md: 'px-2.5 py-1 text-[12px] gap-1.5',
  lg: 'px-3 py-1.5 text-sm gap-2',
};

const roundedStyles: Record<NonNullable<BadgeProps['rounded']>, string> = {
  md: 'rounded-md',
  lg: 'rounded-lg',
  full: 'rounded-full',
};

export const Badge = forwardRef<HTMLSpanElement, BadgeProps>(
  (
    {
      variant = 'default',
      size = 'md',
      rounded = 'full',
      icon,
      iconAfter,
      dismissible = false,
      onDismiss,
      pulsing = false,
      className = '',
      children,
      style,
      ...props
    },
    ref
  ) => {
    const combinedClassName = [
      'inline-flex items-center justify-center font-mono font-semibold',
      'whitespace-nowrap',
      'transition-all duration-150 ease-out',
      variantStyles[variant],
      sizeStyles[size],
      roundedStyles[rounded],
      dismissible && 'pr-1',
      className,
    ].filter(Boolean).join(' ');

    return (
      <motion.span
        ref={ref}
        className={combinedClassName}
        style={style}
        animate={pulsing ? { opacity: [1, 0.6, 1] } : undefined}
        transition={pulsing ? { duration: 1.5, repeat: Infinity, ease: 'easeInOut' } : undefined}
        {...props}
      >
        {icon && <span className="flex-shrink-0" aria-hidden="true">{icon}</span>}
        <span className="truncate">{children}</span>
        {iconAfter && <span className="flex-shrink-0" aria-hidden="true">{iconAfter}</span>}
        {dismissible && (
          <motion.button
            type="button"
            onClick={onDismiss}
            className={[
              'ml-1 flex items-center justify-center rounded-full',
              'hover:bg-black/10 hover:text-[var(--text-primary)]',
              'transition-colors duration-150',
              size === 'xs' && 'w-4 h-4',
              size === 'sm' && 'w-5 h-5',
              size === 'md' && 'w-6 h-6',
              size === 'lg' && 'w-7 h-7',
            ].join(' ')}
            aria-label="Dismiss"
            whileTap={{ scale: 0.9 }}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </motion.button>
        )}
      </motion.span>
    );
  }
);

Badge.displayName = 'Badge';

// ─────────────────────────────────────────────────────────────────────────────
// STATUS BADGE (specific for status indicators)
// ─────────────────────────────────────────────────────────────────────────────

export type StatusType = 'idle' | 'pending' | 'active' | 'success' | 'error' | 'warning';

export interface StatusBadgeProps extends Omit<BadgeProps, 'variant'> {
  status: StatusType;
  label?: string;
  showDot?: boolean;
}

const statusVariants: Record<StatusType, BadgeProps['variant']> = {
  idle: 'ghost',
  pending: 'warning',
  active: 'primary',
  success: 'success',
  error: 'danger',
  warning: 'warning',
};

const statusLabels: Record<StatusType, string> = {
  idle: 'Idle',
  pending: 'Pending',
  active: 'Active',
  success: 'Success',
  error: 'Error',
  warning: 'Warning',
};

const statusDotColors: Record<StatusType, string> = {
  idle: 'var(--text-muted)',
  pending: 'var(--warning)',
  active: 'var(--primary)',
  success: 'var(--success)',
  error: 'var(--danger)',
  warning: 'var(--warning)',
};

export function StatusBadge({
  status,
  label,
  showDot = true,
  size = 'sm',
  className = '',
  ...props
}: StatusBadgeProps) {
  return (
    <Badge
      variant={statusVariants[status]}
      size={size}
      className={className}
      {...props}
    >
      {showDot && (
        <motion.span
          className="w-1.5 h-1.5 rounded-full flex-shrink-0"
          style={{ backgroundColor: statusDotColors[status] }}
          animate={status === 'pending' || status === 'active' ? { opacity: [1, 0.4, 1] } : undefined}
          transition={{ duration: 1, repeat: Infinity }}
          aria-hidden="true"
        />
      )}
      {label ?? statusLabels[status]}
    </Badge>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// DOT INDICATOR (minimal status dot)
// ─────────────────────────────────────────────────────────────────────────────

export interface DotIndicatorProps {
  status: StatusType;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  label?: string;
  pulsing?: boolean;
  className?: string;
}

const dotSizes: Record<NonNullable<DotIndicatorProps['size']>, string> = {
  xs: 'w-1.5 h-1.5',
  sm: 'w-2 h-2',
  md: 'w-2.5 h-2.5',
  lg: 'w-3 h-3',
};

export function DotIndicator({
  status,
  size = 'sm',
  label,
  pulsing = status === 'pending' || status === 'active',
  className = '',
}: DotIndicatorProps) {
  return (
    <span
      className={[
        'inline-flex items-center gap-1.5',
        className,
      ].join(' ')}
    >
      <motion.span
        className={[
          'rounded-full flex-shrink-0',
          dotSizes[size],
        ].join(' ')}
        style={{ backgroundColor: statusDotColors[status] }}
        animate={pulsing ? { opacity: [1, 0.4, 1], scale: [1, 1.2, 1] } : undefined}
        transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
        aria-hidden="true"
      />
      {label && <span className="text-xs font-medium text-[var(--text-secondary)]">{label}</span>}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// EXPORTS
// ─────────────────────────────────────────────────────────────────────────────

export type {}; // types are exported at their declaration sites above