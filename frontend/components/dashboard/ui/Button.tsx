/**
 * Button Component
 * Production-grade button with variants, sizes, states, and accessibility.
 */

import { forwardRef, ButtonHTMLAttributes, Children, cloneElement, isValidElement, ReactNode } from 'react';
import type { ReactElement } from 'react';
import { motion, HTMLMotionProps } from 'framer-motion';

export interface ButtonProps extends Omit<HTMLMotionProps<'button'>, 'children'> {
  /** Button content */
  children?: ReactNode;
  /** Button variant */
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'success' | 'outline';
  /** Button size */
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  /** Full width */
  fullWidth?: boolean;
  /** Loading state */
  loading?: boolean;
  /** Loading label for screen readers */
  loadingLabel?: string;
  /** Left icon */
  leftIcon?: ReactNode;
  /** Right icon */
  rightIcon?: ReactNode;
  /** Icon only (no text) */
  iconOnly?: boolean;
  /** Disable tap animation */
  disableTap?: boolean;
}

const baseStyles = `
  inline-flex items-center justify-center gap-2
  font-mono font-semibold
  rounded-xl
  transition-colors duration-150 ease-out
  focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface-base)]
  disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none
  min-h-[44px]
  select-none
`;

const variantStyles: Record<NonNullable<ButtonProps['variant']>, string> = {
  primary: `
    bg-[var(--primary)] text-[var(--text-inverse)]
    border border-transparent
    hover:bg-[var(--primary-hover)] active:bg-[var(--primary-active)]
    shadow-sm
  `,
  secondary: `
    bg-[var(--surface-muted)] text-[var(--text-primary)]
    border border-[var(--border-default)]
    hover:bg-[var(--surface-hover)] hover:border-[var(--border-strong)]
    active:bg-[var(--surface-active)]
  `,
  ghost: `
    bg-transparent text-[var(--text-secondary)]
    border border-transparent
    hover:bg-[var(--surface-muted)] hover:text-[var(--text-primary)]
    active:bg-[var(--surface-hover)]
  `,
  danger: `
    bg-[var(--danger)] text-[var(--text-inverse)]
    border border-transparent
    hover:bg-[var(--danger)]/90 active:bg-[var(--danger)]
    shadow-sm
  `,
  success: `
    bg-[var(--success)] text-[var(--text-inverse)]
    border border-transparent
    hover:bg-[var(--success)]/90 active:bg-[var(--success)]
    shadow-sm
  `,
  outline: `
    bg-transparent text-[var(--text-primary)]
    border border-[var(--border-strong)]
    hover:bg-[var(--surface-muted)] hover:border-[var(--primary)]
    active:bg-[var(--surface-hover)]
  `,
};

const sizeStyles: Record<NonNullable<ButtonProps['size']>, string> = {
  xs: 'px-2.5 py-1.5 text-[11px] gap-1.5 min-h-[36px]',
  sm: 'px-3 py-2 text-[12px] gap-2 min-h-[40px]',
  md: 'px-4 py-2.5 text-[13px] gap-2 min-h-[44px]',
  lg: 'px-5 py-3 text-[14px] gap-2.5 min-h-[48px]',
  xl: 'px-6 py-4 text-[15px] gap-3 min-h-[56px]',
};

const iconOnlySizeStyles: Record<NonNullable<ButtonProps['size']>, string> = {
  xs: 'w-[36px] h-[36px] p-0',
  sm: 'w-[40px] h-[40px] p-0',
  md: 'w-[44px] h-[44px] p-0',
  lg: 'w-[48px] h-[48px] p-0',
  xl: 'w-[56px] h-[56px] p-0',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'primary',
      size = 'md',
      fullWidth = false,
      loading = false,
      loadingLabel = 'Loading',
      leftIcon,
      rightIcon,
      iconOnly = false,
      disableTap = false,
      className = '',
      style,
      children,
      disabled,
      'aria-label': ariaLabel,
      'aria-describedby': ariaDescribedBy,
      ...props
    },
    ref
  ) => {
    const isDisabled = disabled || loading;
    const showIconOnly = iconOnly && (leftIcon || rightIcon);

    const combinedStyles = [
      baseStyles,
      variantStyles[variant],
      showIconOnly ? iconOnlySizeStyles[size] : sizeStyles[size],
      fullWidth ? 'w-full' : '',
      className,
    ]
      .filter(Boolean)
      .join(' ');

    return (
      <motion.button
        ref={ref}
        className={combinedStyles}
        style={style}
        disabled={isDisabled}
        aria-label={ariaLabel || (loading ? loadingLabel : undefined)}
        aria-describedby={ariaDescribedBy}
        aria-busy={loading}
        whileTap={disableTap || loading ? undefined : { scale: 0.98, transition: { duration: 0.08 } }}
        {...props}
      >
        {loading && (
          <svg
            className="animate-spin h-4 w-4"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
        )}
        {!loading && leftIcon && <span className="flex-shrink-0" aria-hidden="true">{leftIcon}</span>}
        {!showIconOnly && children && <span className="truncate">{children}</span>}
        {!loading && rightIcon && !showIconOnly && <span className="flex-shrink-0" aria-hidden="true">{rightIcon}</span>}
      </motion.button>
    );
  }
);

Button.displayName = 'Button';

// ─────────────────────────────────────────────────────────────────────────────
// ICON BUTTON
// ─────────────────────────────────────────────────────────────────────────────

export interface IconButtonProps extends Omit<HTMLMotionProps<'button'>, 'children'> {
  /** Icon to display */
  icon: React.ReactNode;
  /** Button variant */
  variant?: 'ghost' | 'primary' | 'secondary' | 'danger';
  /** Button size */
  size?: 'xs' | 'sm' | 'md' | 'lg';
  /** Loading state */
  loading?: boolean;
  /** Accessible label (required) */
  'aria-label': string;
  /** Disable tap animation */
  disableTap?: boolean;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  (
    {
      icon,
      variant = 'ghost',
      size = 'md',
      loading = false,
      'aria-label': ariaLabel,
      disableTap = false,
      className = '',
      style,
      disabled,
      ...props
    },
    ref
  ) => {
    const isDisabled = disabled || loading;

    const variantStyles = {
      ghost: `
        bg-transparent text-[var(--text-secondary)]
        hover:bg-[var(--surface-muted)] hover:text-[var(--text-primary)]
        active:bg-[var(--surface-hover)]
        border border-transparent
      `,
      primary: `
        bg-[var(--primary)] text-[var(--text-inverse)]
        hover:bg-[var(--primary-hover)] active:bg-[var(--primary-active)]
        border border-transparent
      `,
      secondary: `
        bg-[var(--surface-muted)] text-[var(--text-primary)]
        border border-[var(--border-default)]
        hover:bg-[var(--surface-hover)] hover:border-[var(--border-strong)]
        active:bg-[var(--surface-active)]
      `,
      danger: `
        bg-transparent text-[var(--danger)]
        hover:bg-[var(--danger-soft)] hover:text-[var(--danger)]
        active:bg-[var(--danger-soft)]
        border border-transparent
      `,
    };

    const sizeStyles = {
      xs: 'w-[32px] h-[32px] min-h-[32px]',
      sm: 'w-[36px] h-[36px] min-h-[36px]',
      md: 'w-[40px] h-[40px] min-h-[40px]',
      lg: 'w-[48px] h-[48px] min-h-[48px]',
    };

    return (
      <motion.button
        ref={ref}
        className={[
          'inline-flex items-center justify-center rounded-xl font-mono',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface-base)]',
          'disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none',
          'transition-colors duration-150 ease-out',
          variantStyles[variant],
          sizeStyles[size],
          className,
        ].join(' ')}
        style={style}
        disabled={isDisabled}
        aria-label={ariaLabel}
        aria-busy={loading}
        whileTap={disableTap || loading ? undefined : { scale: 0.95, transition: { duration: 0.08 } }}
        {...props}
      >
        {loading ? (
          <svg
            className="animate-spin h-4 w-4"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
        ) : (
          <span className="flex h-full w-full items-center justify-center" aria-hidden="true">{icon}</span>
        )}
      </motion.button>
    );
  }
);

IconButton.displayName = 'IconButton';

// ─────────────────────────────────────────────────────────────────────────────
// BUTTON GROUP
// ─────────────────────────────────────────────────────────────────────────────

export interface ButtonGroupProps {
  children: React.ReactNode;
  /** Orientation */
  orientation?: 'horizontal' | 'vertical';
  /** Variant applied to all buttons */
  variant?: ButtonProps['variant'];
  /** Size applied to all buttons */
  size?: ButtonProps['size'];
  className?: string;
}

export function ButtonGroup({
  children,
  orientation = 'horizontal',
  variant,
  size,
  className = '',
}: ButtonGroupProps) {
  const childArray = Children.toArray(children);
  const count = childArray.length;

  return (
    <div
      className={[
        'inline-flex',
        orientation === 'horizontal' ? 'flex-row' : 'flex-col',
        'rounded-xl overflow-hidden',
        'border border-[var(--border-default)]',
        className,
      ].join(' ')}
      role="group"
    >
      {Children.map(children, (child, index) => {
        if (!isValidElement(child)) return child;
        const props = child.props as {
          variant?: ButtonProps['variant'];
          size?: ButtonProps['size'];
          className?: string;
        };
        const isFirst = index === 0;
        const isLast = index === count - 1;
        const isOnly = count === 1;

        const radius = isOnly
          ? 'rounded-xl'
          : orientation === 'horizontal'
            ? isFirst
              ? 'rounded-l-xl'
              : isLast
                ? 'rounded-r-xl'
                : 'rounded-none'
            : isFirst
              ? 'rounded-t-xl'
              : isLast
                ? 'rounded-b-xl'
                : 'rounded-none';

        const border = isOnly
          ? ''
          : orientation === 'horizontal'
            ? isLast
              ? ''
              : 'border-r border-[var(--border-default)]'
            : isLast
              ? ''
              : 'border-b border-[var(--border-default)]';

        return cloneElement(child as ReactElement<any>, {
          variant: props.variant ?? variant,
          size: props.size ?? size,
          className: [
            props.className,
            radius,
            border,
          ].filter(Boolean).join(' '),
        });
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// EXPORTS
// ─────────────────────────────────────────────────────────────────────────────

export type {}; // types are exported at their declaration sites above