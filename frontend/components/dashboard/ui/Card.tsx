/**
 * Card Component
 * Flexible card system with elevation, interactive states, and variants.
 */

import { forwardRef, HTMLAttributes, ReactNode } from 'react';
import { motion, HTMLMotionProps } from 'framer-motion';

export interface CardProps extends Omit<HTMLMotionProps<'div'>, 'children'> {
  /** Card variant */
  variant?: 'default' | 'elevated' | 'outlined' | 'filled' | 'ghost' | 'hero';
  /** Padding size */
  padding?: 'none' | 'sm' | 'md' | 'lg' | 'xl';
  /** Hover interactive */
  interactive?: boolean;
  /** Click handler (makes it a button semantically) */
  onClick?: () => void;
  /** Child content */
  children: ReactNode;
  /** Border radius override */
  radius?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | 'full';
  /** Custom className */
  className?: string;
}

const variantStyles: Record<NonNullable<CardProps['variant']>, string> = {
  default: `
    bg-[var(--surface-raised)] border border-[var(--border-subtle)]
    shadow-sm
  `,
  elevated: `
    bg-[var(--surface-raised)] border border-[var(--border-subtle)]
    shadow-lg
  `,
  outlined: `
    bg-transparent border border-[var(--border-strong)]
    shadow-none
  `,
  filled: `
    bg-[var(--surface-muted)] border border-transparent
    shadow-none
  `,
  ghost: `
    bg-transparent border border-transparent
    shadow-none
  `,
  hero: `
    bg-[var(--surface-raised)] border border-[var(--border-subtle)]
    shadow-sm
    relative overflow-hidden
  `,
};

const paddingStyles: Record<NonNullable<CardProps['padding']>, string> = {
  none: '',
  sm: 'p-3',
  md: 'p-4 sm:p-5',
  lg: 'p-5 sm:p-6 lg:p-8',
  xl: 'p-6 sm:p-8 lg:p-10',
};

const radiusStyles: Record<NonNullable<CardProps['radius']>, string> = {
  sm: 'rounded-lg',
  md: 'rounded-xl',
  lg: 'rounded-2xl',
  xl: 'rounded-3xl',
  '2xl': 'rounded-4xl',
  full: 'rounded-full',
};

export const Card = forwardRef<HTMLDivElement, CardProps>(
  (
    {
      variant = 'default',
      padding = 'md',
      interactive = false,
      onClick,
      children,
      radius = 'lg',
      className = '',
      style,
      ...props
    },
    ref
  ) => {
    const isButton = typeof onClick === 'function';

    const combinedClassName = [
      'relative',
      variantStyles[variant],
      paddingStyles[padding],
      radiusStyles[radius],
      interactive && 'transition-all duration-200 ease-out-expo',
      interactive && 'hover:shadow-md hover:border-[var(--border-strong)] hover:-translate-y-0.5',
      interactive && 'active:scale-[0.99] active:shadow-sm',
      isButton && 'cursor-pointer',
      className,
    ].filter(Boolean).join(' ');

    const Component = isButton ? 'button' : 'div';

    return (
      <motion.div
        ref={ref}
        role={isButton ? 'button' : undefined}
        className={combinedClassName}
        style={style}
        whileTap={interactive && !isButton ? { scale: 0.99, transition: { duration: 0.08 } } : undefined}
        tabIndex={isButton ? 0 : undefined}
        onClick={onClick}
        onKeyDown={isButton ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } } : undefined}
        {...props}
      >
        {/* Hero card gradient hairline */}
        {variant === 'hero' && (
          <div
            className="absolute inset-x-0 top-0 h-[2px] pointer-events-none"
            style={{
              background: 'linear-gradient(90deg, transparent, var(--primary) 30%, var(--info) 70%, transparent)',
              opacity: 0.8,
            }}
            aria-hidden="true"
          />
        )}
        {children}
      </motion.div>
    );
  }
);

Card.displayName = 'Card';

// ─────────────────────────────────────────────────────────────────────────────
// CARD HEADER / CONTENT / FOOTER
// ─────────────────────────────────────────────────────────────────────────────

export interface CardHeaderProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  /** Title */
  title?: ReactNode;
  /** Subtitle/description */
  description?: ReactNode;
  /** Action element (button, link) */
  action?: ReactNode;
  /** Custom className */
  className?: string;
}

export function CardHeader({
  title,
  description,
  action,
  className = '',
  children,
  ...props
}: CardHeaderProps) {
  return (
    <div className={['flex items-start justify-between gap-4 mb-4', className].filter(Boolean).join(' ')} {...props}>
      <div className="min-w-0 flex-1">
        {title && (
          <h3 className="font-display text-lg font-semibold tracking-tight text-[var(--text-primary)] truncate">
            {title}
          </h3>
        )}
        {description && (
          <p className="mt-1 text-sm text-[var(--text-secondary)]">{description}</p>
        )}
        {children}
      </div>
      {action && <div className="flex-shrink-0">{action}</div>}
    </div>
  );
}

export interface CardContentProps extends HTMLAttributes<HTMLDivElement> {
  className?: string;
}

export function CardContent({ className = '', children, ...props }: CardContentProps) {
  return <div className={['', className].filter(Boolean).join(' ')} {...props}>{children}</div>;
}

export interface CardFooterProps extends HTMLAttributes<HTMLDivElement> {
  className?: string;
}

export function CardFooter({ className = '', children, ...props }: CardFooterProps) {
  return (
    <div
      className={[
        'flex items-center justify-end gap-2 mt-4 pt-4 border-t border-[var(--border-subtle)]',
        className,
      ].filter(Boolean).join(' ')}
      {...props}
    >
      {children}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// STAT CARD (for metrics)
// ─────────────────────────────────────────────────────────────────────────────

export interface StatCardProps extends CardProps {
  /** Metric value */
  value: string | number;
  /** Metric label */
  label: string;
  /** Trend indicator */
  trend?: {
    value: string;
    type: 'up' | 'down' | 'neutral';
    label?: string;
  };
  /** Icon */
  icon?: ReactNode;
  /** Value color variant */
  valueColor?: 'primary' | 'success' | 'warning' | 'danger' | 'info' | 'default';
  /** Compact mode */
  compact?: boolean;
}

const valueColorStyles: Record<NonNullable<StatCardProps['valueColor']>, string> = {
  primary: 'text-[var(--primary)]',
  success: 'text-[var(--success)]',
  warning: 'text-[var(--warning)]',
  danger: 'text-[var(--danger)]',
  info: 'text-[var(--info)]',
  default: 'text-[var(--text-primary)]',
};

export function StatCard({
  value,
  label,
  trend,
  icon,
  valueColor = 'default',
  compact = false,
  variant = 'default',
  padding = compact ? 'sm' : 'md',
  radius = 'lg',
  className = '',
  children,
  ...props
}: StatCardProps) {
  return (
    <Card variant={variant} padding={padding} radius={radius} className={className} {...props}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold uppercase tracking-[0.1em] text-[var(--text-muted)]">
            {label}
          </p>
          <p className={['mt-1 font-display font-extrabold tabular-nums', valueColorStyles[valueColor]].join(' ')}>
            {typeof value === 'number' ? value.toLocaleString() : value}
          </p>
          {trend && (
            <div className="mt-2 flex items-center gap-1.5">
              <span
                className={[
                  'text-xs font-bold font-mono',
                  trend.type === 'up' && 'text-[var(--success)]',
                  trend.type === 'down' && 'text-[var(--danger)]',
                  trend.type === 'neutral' && 'text-[var(--text-muted)]',
                ].filter(Boolean).join(' ')}
              >
                {trend.type === 'up' && '↑'}
                {trend.type === 'down' && '↓'}
                {trend.type === 'neutral' && '→'}
                {trend.value}
              </span>
              {trend.label && <span className="text-xs text-[var(--text-muted)]">{trend.label}</span>}
            </div>
          )}
        </div>
        {icon && (
          <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-[var(--surface-muted)] flex items-center justify-center text-[var(--text-muted)]">
            {icon}
          </div>
        )}
      </div>
      {children}
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// EXPORTS
// ─────────────────────────────────────────────────────────────────────────────

export type {}; // types are exported at their declaration sites above