/**
 * Avatar Component
 * User avatar with fallback, status indicator, and group support.
 */

import { forwardRef, ReactNode } from 'react';
import { HTMLMotionProps } from 'framer-motion';
import { motion } from 'framer-motion';

export interface AvatarProps extends Omit<HTMLMotionProps<'div'>, 'onDrag' | 'children'> {
  /** Avatar content */
  children?: ReactNode;
  /** Image source */
  src?: string;
  /** Alt text for image */
  alt?: string;
  /** Fallback text (initials) */
  fallback?: string;
  /** Avatar size */
  size?: AvatarSize;
  /** Shape */
  shape?: AvatarShape;
  /** Status indicator */
  status?: 'online' | 'offline' | 'busy' | 'away' | null;
  /** Status position */
  statusPosition?: AvatarStatusPosition;
  /** Border */
  bordered?: boolean;
  /** Click handler */
  onClick?: () => void;
}

type AvatarSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';
type AvatarShape = 'circle' | 'square' | 'rounded';
type AvatarStatusPosition = 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';

const sizeStyles: Record<AvatarSize, { container: string; text: string }> = {
  xs: { container: 'w-6 h-6', text: 'text-[10px]' },
  sm: { container: 'w-8 h-8', text: 'text-[11px]' },
  md: { container: 'w-10 h-10', text: 'text-sm' },
  lg: { container: 'w-12 h-12', text: 'text-base' },
  xl: { container: 'w-16 h-16', text: 'text-lg' },
  '2xl': { container: 'w-20 h-20', text: 'text-xl' },
};

const shapeStyles: Record<AvatarShape, string> = {
  circle: 'rounded-full',
  square: 'rounded-none',
  rounded: 'rounded-xl',
};

const statusStyles: Record<NonNullable<AvatarProps['status']>, string> = {
  online: 'bg-[var(--success)]',
  offline: 'bg-[var(--text-muted)]',
  busy: 'bg-[var(--danger)]',
  away: 'bg-[var(--warning)]',
};

const statusPositions: Record<AvatarStatusPosition, string> = {
  'bottom-right': 'bottom-0 right-0',
  'bottom-left': 'bottom-0 left-0',
  'top-right': 'top-0 right-0',
  'top-left': 'top-0 left-0',
};

const statusSizes: Record<AvatarSize, string> = {
  xs: 'w-1.5 h-1.5',
  sm: 'w-2 h-2',
  md: 'w-2.5 h-2.5',
  lg: 'w-3 h-3',
  xl: 'w-3.5 h-3.5',
  '2xl': 'w-4 h-4',
};

export const Avatar = forwardRef<HTMLDivElement, AvatarProps>(
  (
    {
      src,
      alt,
      fallback,
      size = 'md',
      shape = 'circle',
      status = null,
      statusPosition = 'bottom-right',
      bordered = false,
      onClick,
      className = '',
      style,
      children,
      ...props
    },
    ref
  ) => {
    const { container, text } = sizeStyles[size];
    const hasImage = Boolean(src);
    const displayName = fallback || alt || '?';
    const initials = displayName
      .split(' ')
      .map((n) => n[0])
      .slice(0, 2)
      .join('')
      .toUpperCase();

    const bgColor = `hsl(${initials.charCodeAt(0) * 13 % 360} 65% 55%)`;

    return (
      <motion.div
        ref={ref}
        className={[
          'relative inline-flex items-center justify-center flex-shrink-0',
          'overflow-hidden',
          container,
          shapeStyles[shape],
          bordered && 'ring-2 ring-[var(--surface-base)]',
          onClick && 'cursor-pointer',
          className,
        ].filter(Boolean).join(' ')}
        style={style}
        whileTap={onClick ? { scale: 0.96 } : undefined}
        onClick={onClick}
        {...props}
      >
        {hasImage ? (
          <img
            src={src}
            alt={alt || displayName}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : children ? (
          <div className="w-full h-full flex items-center justify-center">{children}</div>
        ) : (
          <div
            className="w-full h-full flex items-center justify-center font-semibold select-none"
            style={{ backgroundColor: bgColor, color: 'white' }}
          >
            {initials}
          </div>
        )}

        {status && (
          <motion.span
            className={[
              'absolute rounded-full ring-2 ring-[var(--surface-base)]',
              statusStyles[status],
              statusPositions[statusPosition],
              statusSizes[size],
            ].join(' ')}
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 400, damping: 20 }}
            aria-label={`Status: ${status}`}
          />
        )}
      </motion.div>
    );
  }
);

Avatar.displayName = 'Avatar';

// ─────────────────────────────────────────────────────────────────────────────
// AVATAR GROUP
// ─────────────────────────────────────────────────────────────────────────────

export interface AvatarGroupProps {
  /** Array of avatar sources/fallbacks */
  avatars: { src?: string; fallback?: string; alt?: string; href?: string }[];
  /** Maximum visible avatars */
  max?: number;
  /** Size */
  size?: AvatarProps['size'];
  /** Shape */
  shape?: AvatarProps['shape'];
  /** Overlap spacing */
  overlap?: number;
  /** Total count label (when exceeding max) */
  totalCount?: number;
  className?: string;
}

export function AvatarGroup({
  avatars,
  max = 5,
  size = 'md',
  shape = 'circle',
  overlap = 8,
  totalCount,
  className = '',
}: AvatarGroupProps) {
  const visible = avatars.slice(0, max);
  const remaining = avatars.length - max;

  return (
    <div className={['flex items-center', className].join(' ')} role="group" aria-label="User avatars">
      {visible.map((avatar, index) => (
        <motion.div
          key={avatar.src || avatar.fallback || index}
          style={{ zIndex: max - index }}
          className="relative"
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: index * 0.05, duration: 0.2 }}
        >
          <Avatar
            src={avatar.src}
            alt={avatar.alt}
            fallback={avatar.fallback}
            size={size}
            shape={shape}
            bordered={true}
            className={index > 0 ? `-ml-${overlap}` : ''}
          />
        </motion.div>
      ))}
      {remaining > 0 && (
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          className={['relative -ml-8', `ring-2 ring-[var(--surface-base)]`].join(' ')}
        >
          <Avatar
            size={size}
            shape={shape}
            fallback={totalCount ? `+${totalCount}` : `+${remaining}`}
            className="bg-[var(--surface-muted)] text-[var(--text-secondary)]"
          />
        </motion.div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// USER AVATAR (with menu trigger)
// ─────────────────────────────────────────────────────────────────────────────

export interface UserAvatarProps extends AvatarProps {
  /** User name */
  name?: string;
  /** User handle/username */
  handle?: string;
  /** Email */
  email?: string;
  /** Menu content */
  menu?: ReactNode;
  /** Menu trigger */
  trigger?: 'click' | 'hover';
}

export function UserAvatar({
  name,
  handle,
  email,
  menu,
  trigger = 'click',
  size = 'md',
  ...avatarProps
}: UserAvatarProps) {
  // This would typically integrate with a dropdown/menu component
  // For now, just render the avatar with click handler placeholder
  return (
    <div className="relative inline-flex">
      <Avatar
        size={size}
        fallback={name?.charAt(0)}
        alt={name}
        {...avatarProps}
      />
      {menu && (
        <div className="absolute right-0 top-full mt-2 z-[var(--z-dropdown)]">
          {/* Dropdown would go here - requires Popover component */}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// EXPORTS
// ─────────────────────────────────────────────────────────────────────────────

export type {}; // types are exported at their declaration sites above