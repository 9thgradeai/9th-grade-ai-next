/**
 * 9Th-Grade AI Design Tokens
 * Centralized token definitions for the dashboard design system.
 * All values map to CSS custom properties in globals.css / ai-workspace.css
 */

// ─────────────────────────────────────────────────────────────────────────────
// COLOR SCALES (OKLCH-based, 10 steps each)
// ─────────────────────────────────────────────────────────────────────────────

export const colorScales = {
  // Primary: Ember Coral (dark) / Ember Rust (light)
  primary: {
    50:  'oklch(0.97 0.015 45)',   // Barely tinted
    100: 'oklch(0.93 0.035 45)',
    200: 'oklch(0.85 0.075 45)',
    300: 'oklch(0.75 0.12 45)',
    400: 'oklch(0.65 0.16 45)',
    500: 'oklch(0.58 0.19 45)',   // Main brand
    600: 'oklch(0.50 0.18 40)',
    700: 'oklch(0.42 0.16 35)',
    800: 'oklch(0.34 0.13 30)',
    900: 'oklch(0.26 0.10 25)',
    950: 'oklch(0.18 0.07 20)',
  },

  // Success: Emerald Green
  success: {
    50:  'oklch(0.97 0.015 145)',
    100: 'oklch(0.93 0.035 145)',
    200: 'oklch(0.85 0.075 145)',
    300: 'oklch(0.75 0.12 145)',
    400: 'oklch(0.65 0.15 145)',
    500: 'oklch(0.58 0.18 145)',
    600: 'oklch(0.50 0.16 145)',
    700: 'oklch(0.42 0.13 145)',
    800: 'oklch(0.34 0.10 145)',
    900: 'oklch(0.26 0.07 145)',
  },

  // Warning: Amber/Gold
  warning: {
    50:  'oklch(0.97 0.015 85)',
    100: 'oklch(0.93 0.035 85)',
    200: 'oklch(0.85 0.075 85)',
    300: 'oklch(0.75 0.12 85)',
    400: 'oklch(0.68 0.15 85)',
    500: 'oklch(0.62 0.17 85)',
    600: 'oklch(0.55 0.16 80)',
    700: 'oklch(0.47 0.14 75)',
    800: 'oklch(0.39 0.11 70)',
    900: 'oklch(0.31 0.08 65)',
  },

  // Danger: Red
  danger: {
    50:  'oklch(0.97 0.015 25)',
    100: 'oklch(0.93 0.035 25)',
    200: 'oklch(0.85 0.075 25)',
    300: 'oklch(0.75 0.12 25)',
    400: 'oklch(0.65 0.16 25)',
    500: 'oklch(0.58 0.20 25)',
    600: 'oklch(0.50 0.18 25)',
    700: 'oklch(0.42 0.15 25)',
    800: 'oklch(0.34 0.12 25)',
    900: 'oklch(0.26 0.09 25)',
  },

  // Info: Sky Blue
  info: {
    50:  'oklch(0.97 0.015 240)',
    100: 'oklch(0.93 0.035 240)',
    200: 'oklch(0.85 0.075 240)',
    300: 'oklch(0.75 0.12 240)',
    400: 'oklch(0.65 0.15 240)',
    500: 'oklch(0.58 0.18 240)',
    600: 'oklch(0.50 0.16 240)',
    700: 'oklch(0.42 0.13 240)',
    800: 'oklch(0.34 0.10 240)',
    900: 'oklch(0.26 0.07 240)',
  },

  // Neutral: Warm Grays (for both themes)
  neutral: {
    50:  'oklch(0.985 0.002 85)',
    100: 'oklch(0.97 0.004 85)',
    200: 'oklch(0.92 0.008 85)',
    300: 'oklch(0.86 0.012 85)',
    400: 'oklch(0.78 0.015 85)',
    500: 'oklch(0.68 0.018 85)',
    600: 'oklch(0.55 0.015 85)',
    700: 'oklch(0.45 0.012 85)',
    800: 'oklch(0.35 0.010 85)',
    900: 'oklch(0.25 0.008 85)',
    950: 'oklch(0.15 0.005 85)',
  },

  // Dark theme surfaces (near-black with warm tint)
  surfaceDark: {
    base:       '#0B0A09',
    soft:       '#0F0D0B',
    raised:     '#12100E',
    elevated:   '#17140F',
    overlay:    '#1D1915',
    highest:    '#211C17',
    hover:      '#2A231D',
    active:     '#322921',
  },

  // Light theme surfaces (warm paper)
  surfaceLight: {
    base:       '#E9E1D3',
    soft:       '#ECE3D3',
    raised:     '#F4EDE1',
    elevated:   '#FAF5EA',
    overlay:    '#FDF9F0',
    highest:    '#FFFFFF',
    hover:      '#EFE6D7',
    active:     '#E6DBC8',
  },
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// SPACING SCALE (4px base, fluid clamped)
// ─────────────────────────────────────────────────────────────────────────────

export const spacing = {
  0:     '0',
  1:     '0.25rem',   // 4px
  2:     '0.5rem',    // 8px
  3:     '0.75rem',   // 12px
  4:     '1rem',      // 16px
  5:     '1.25rem',   // 20px
  6:     '1.5rem',    // 24px
  7:     '1.75rem',   // 28px
  8:     '2rem',      // 32px
  10:    '2.5rem',    // 40px
  12:    '3rem',      // 48px
  16:    '4rem',      // 64px
  20:    '5rem',      // 80px
  24:    '6rem',      // 96px

  // Fluid variants (clamp)
  'fluid-xs':    'clamp(0.25rem, 0.5vw + 0.15rem, 0.5rem)',
  'fluid-sm':    'clamp(0.5rem, 1vw + 0.25rem, 1rem)',
  'fluid-md':    'clamp(1rem, 2vw + 0.5rem, 1.5rem)',
  'fluid-lg':    'clamp(1.5rem, 3vw + 0.75rem, 2.5rem)',
  'fluid-xl':    'clamp(2rem, 4vw + 1rem, 4rem)',
  'fluid-2xl':   'clamp(3rem, 6vw + 1.5rem, 6rem)',
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// TYPOGRAPHY SCALE (Fluid clamped)
// ─────────────────────────────────────────────────────────────────────────────

export const typography = {
  // Font families
  fontSans:      'var(--font-sans)',
  fontDisplay:   'var(--font-display)',
  fontHero:      'var(--font-hero)',
  fontMono:      'var(--font-mono)',
  fontBengali:   '"Hind Siliguri", "Noto Sans Bangla", system-ui, sans-serif',

  // Fluid type scale (clamp(min, preferred, max))
  display: {
    '2xl': 'clamp(2.5rem, 5vw + 1rem, 4.5rem)',   // 40-72px
    'xl':  'clamp(2rem, 4vw + 0.75rem, 3.5rem)',  // 32-56px
    'lg':  'clamp(1.75rem, 3vw + 0.75rem, 2.5rem)', // 28-40px
    'md':  'clamp(1.5rem, 2.5vw + 0.5rem, 2rem)',  // 24-32px
    'sm':  'clamp(1.25rem, 2vw + 0.5rem, 1.75rem)', // 20-28px
  },
  heading: {
    h1: 'clamp(2rem, 4vw + 0.75rem, 3rem)',
    h2: 'clamp(1.5rem, 3vw + 0.5rem, 2.25rem)',
    h3: 'clamp(1.25rem, 2.5vw + 0.5rem, 1.75rem)',
    h4: 'clamp(1.125rem, 2vw + 0.4rem, 1.5rem)',
    h5: 'clamp(1rem, 1.5vw + 0.4rem, 1.25rem)',
    h6: 'clamp(0.875rem, 1vw + 0.4rem, 1rem)',
  },
  body: {
    'xl':   'clamp(1.125rem, 1vw + 0.75rem, 1.25rem)', // 18-20px
    'lg':   'clamp(1rem, 0.8vw + 0.7rem, 1.125rem)',   // 16-18px
    'md':   'clamp(0.9375rem, 0.6vw + 0.7rem, 1rem)',  // 15-16px
    'sm':   'clamp(0.875rem, 0.5vw + 0.6rem, 0.9375rem)', // 14-15px
    'xs':   'clamp(0.8125rem, 0.4vw + 0.55rem, 0.875rem)', // 13-14px
    '2xs':  'clamp(0.75rem, 0.3vw + 0.5rem, 0.8125rem)',   // 12-13px
  },
  mono: {
    'lg': 'clamp(0.9375rem, 0.6vw + 0.7rem, 1rem)',
    'md': 'clamp(0.875rem, 0.5vw + 0.6rem, 0.9375rem)',
    'sm': 'clamp(0.8125rem, 0.4vw + 0.55rem, 0.875rem)',
    'xs': 'clamp(0.75rem, 0.3vw + 0.5rem, 0.8125rem)',
  },

  // Font weights
  weight: {
    normal:  400,
    medium:  500,
    semibold: 600,
    bold:    700,
    extrabold: 800,
  },

  // Line heights
  leading: {
    none:     1,
    tight:    1.1,
    snug:     1.375,
    normal:   1.5,
    relaxed:  1.625,
    loose:    2,
  },

  // Letter spacing
  tracking: {
    tighter: '-0.05em',
    tight:   '-0.025em',
    normal:  '0',
    wide:    '0.025em',
    wider:   '0.05em',
    widest:  '0.1em',
    display: '-0.02em',
  },
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// BORDER RADIUS
// ─────────────────────────────────────────────────────────────────────────────

export const radius = {
  none:     '0',
  sm:       '0.25rem',  // 4px
  md:       '0.375rem', // 6px
  lg:       '0.5rem',   // 8px
  xl:       '0.75rem',  // 12px
  '2xl':    '1rem',     // 16px
  '3xl':    '1.25rem',  // 20px
  '4xl':    '1.5rem',   // 24px
  full:     '9999px',
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// SHADOWS (Elevation system)
// ─────────────────────────────────────────────────────────────────────────────

export const shadows = {
  // Dark theme shadows
  dark: {
    xs:  '0 1px 2px rgb(0 0 0 / 0.4)',
    sm:  '0 1px 3px rgb(0 0 0 / 0.4), 0 1px 2px rgb(0 0 0 / 0.25)',
    md:  '0 4px 6px rgb(0 0 0 / 0.45), 0 2px 4px rgb(0 0 0 / 0.25)',
    lg:  '0 10px 15px rgb(0 0 0 / 0.5), 0 4px 6px rgb(0 0 0 / 0.3)',
    xl:  '0 20px 25px rgb(0 0 0 / 0.55), 0 8px 10px rgb(0 0 0 / 0.3)',
    '2xl': '0 25px 50px rgb(0 0 0 / 0.6)',
    inner: 'inset 0 2px 4px rgb(0 0 0 / 0.3)',
    focus: '0 0 0 3px rgb(255 106 61 / 0.4)',
  },
  // Light theme shadows
  light: {
    xs:  '0 1px 2px rgb(0 0 0 / 0.05)',
    sm:  '0 1px 3px rgb(0 0 0 / 0.08), 0 1px 2px rgb(0 0 0 / 0.04)',
    md:  '0 4px 6px rgb(0 0 0 / 0.07), 0 2px 4px rgb(0 0 0 / 0.04)',
    lg:  '0 10px 15px rgb(0 0 0 / 0.08), 0 4px 6px rgb(0 0 0 / 0.04)',
    xl:  '0 20px 25px rgb(0 0 0 / 0.1), 0 8px 10px rgb(0 0 0 / 0.04)',
    '2xl': '0 25px 50px rgb(0 0 0 / 0.12)',
    inner: 'inset 0 2px 4px rgb(0 0 0 / 0.06)',
    focus: '0 0 0 3px rgb(194 65 12 / 0.3)',
  },
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// MOTION SYSTEM
// ─────────────────────────────────────────────────────────────────────────────

export const motion = {
  // Durations (ms)
  duration: {
    instant: 0,
    fast:    120,
    normal:  200,
    slow:    300,
    cinematic: 500,
  },

  // Easing curves
  easing: {
    linear:       'linear',
    easeIn:       'cubic-bezier(0.4, 0, 1, 1)',
    easeOut:      'cubic-bezier(0, 0, 0.2, 1)',
    easeInOut:    'cubic-bezier(0.4, 0, 0.2, 1)',
    // Custom premium easings
    easeOutExpo:  'cubic-bezier(0.19, 1, 0.22, 1)',
    easeOutCirc:  'cubic-bezier(0.075, 0.82, 0.165, 1)',
    easeSpring:   'cubic-bezier(0.34, 1.56, 0.64, 1)',
    easeBounce:   'cubic-bezier(0.68, -0.55, 0.265, 1.55)',
  },

  // Presets for common patterns
  presets: {
    // Fade + slide up (entrance)
    fadeInUp: {
      initial: { opacity: 0, y: 16 },
      animate: { opacity: 1, y: 0 },
      transition: { duration: 0.22, ease: 'easeOutExpo' },
    },
    // Fade + scale (modal/drawer)
    fadeInScale: {
      initial: { opacity: 0, scale: 0.96 },
      animate: { opacity: 1, scale: 1 },
      transition: { duration: 0.2, ease: 'easeOutExpo' },
    },
    // Slide from left (drawer)
    slideInLeft: {
      initial: { x: -300 },
      animate: { x: 0 },
      transition: { duration: 0.3, ease: 'easeOutExpo' },
    },
    // Slide from bottom (bottom sheet)
    slideInBottom: {
      initial: { y: '100%' },
      animate: { y: 0 },
      transition: { type: 'spring', stiffness: 340, damping: 32 },
    },
    // Micro-interaction (button press)
    tap: {
      whileTap: { scale: 0.98 },
      transition: { duration: 0.08 },
    },
    // Hover lift (cards)
    hoverLift: {
      whileHover: { y: -2, transition: { duration: 0.18, ease: 'easeOutExpo' } },
    },
  },
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// Z-INDEX SCALE
// ─────────────────────────────────────────────────────────────────────────────

export const zIndex = {
  base:       0,
  dropdown:   40,
  sticky:     50,
  overlay:    60,
  modal:      70,
  toast:      80,
  tooltip:    90,
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// BREAKPOINTS
// ─────────────────────────────────────────────────────────────────────────────

export const breakpoints = {
  xs:    '320px',   // Minimum mobile
  sm:    '375px',   // iPhone SE / mini
  md:    '430px',   // iPhone Pro
  lg:    '768px',   // Tablet portrait
  xl:    '1024px',  // Tablet landscape / sidebar shows
  '2xl': '1360px',  // Desktop max content
  '3xl': '1920px',  // Large desktop
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// TOUCH TARGETS
// ─────────────────────────────────────────────────────────────────────────────

export const touchTarget = {
  minimum: '44px',    // WCAG AA minimum
  comfortable: '48px', // Recommended
  generous: '56px',   // Primary actions
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// CONTAINER WIDTHS
// ─────────────────────────────────────────────────────────────────────────────

export const container = {
  sm:   '640px',
  md:   '768px',
  lg:   '1024px',
  xl:   '1280px',
  '2xl': '1360px',  // Dashboard max width
  full: '100%',
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// TRANSITIONS
// ─────────────────────────────────────────────────────────────────────────────

export const transitions = {
  fast:     '120ms ease',
  normal:   '200ms ease',
  slow:     '300ms ease',
  colors:   '150ms ease',
  transform: '180ms ease-out',
  all:      '200ms ease',
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// SEMANTIC TOKEN MAP (CSS variable names)
// ─────────────────────────────────────────────────────────────────────────────

export const semanticTokens = {
  // Surfaces
  'surface-base':       'var(--surface-base)',
  'surface-raised':     'var(--surface-raised)',
  'surface-elevated':   'var(--surface-elevated)',
  'surface-overlay':    'var(--surface-overlay)',
  'surface-muted':      'var(--surface-muted)',
  'surface-hover':      'var(--surface-hover)',
  'surface-active':     'var(--surface-active)',

  // Text
  'text-primary':       'var(--text-primary)',
  'text-secondary':     'var(--text-secondary)',
  'text-muted':         'var(--text-muted)',
  'text-disabled':      'var(--text-disabled)',
  'text-inverse':       'var(--text-inverse)',

  // Borders
  'border-subtle':      'var(--border-subtle)',
  'border-default':     'var(--border-default)',
  'border-strong':      'var(--border-strong)',
  'border-focus':       'var(--border-focus)',

  // Primary
  'primary':            'var(--primary)',
  'primary-hover':      'var(--primary-hover)',
  'primary-active':     'var(--primary-active)',
  'primary-soft':       'var(--primary-soft)',
  'primary-muted':      'var(--primary-muted)',

  // Semantic
  'success':            'var(--success)',
  'success-soft':       'var(--success-soft)',
  'warning':            'var(--warning)',
  'warning-soft':       'var(--warning-soft)',
  'danger':             'var(--danger)',
  'danger-soft':        'var(--danger-soft)',
  'info':               'var(--info)',
  'info-soft':          'var(--info-soft)',

  // Shadows
  'shadow-xs':          'var(--shadow-xs)',
  'shadow-sm':          'var(--shadow-sm)',
  'shadow-md':          'var(--shadow-md)',
  'shadow-lg':          'var(--shadow-lg)',
  'shadow-xl':          'var(--shadow-xl)',

  // Focus
  'focus-ring':         'var(--focus-ring)',
  'focus-ring-offset':  'var(--focus-ring-offset)',

  // Radius
  'radius-sm':          'var(--radius-sm)',
  'radius-md':          'var(--radius-md)',
  'radius-lg':          'var(--radius-lg)',
  'radius-xl':          'var(--radius-xl)',
  'radius-2xl':         'var(--radius-2xl)',

  // Sidebar
  'sidebar-bg':         'var(--sidebar-bg)',
  'sidebar-border':     'var(--sidebar-border)',
  'sidebar-text':       'var(--sidebar-text)',
  'sidebar-text-active': 'var(--sidebar-text-active)',
  'sidebar-bg-active':  'var(--sidebar-bg-active)',

  // Card
  'card-bg':            'var(--card-bg)',
  'card-border':        'var(--card-border)',
  'card-radius':        'var(--card-radius)',

  // Input
  'input-bg':           'var(--input-bg)',
  'input-border':       'var(--input-border)',
  'input-focus':        'var(--input-focus)',
  'input-placeholder':  'var(--input-placeholder)',

  // Disabled
  'disabled-bg':        'var(--disabled-bg)',
  'disabled-text':      'var(--disabled-text)',

  // Chart
  'chart-1':            'var(--chart-1)',
  'chart-2':            'var(--chart-2)',
  'chart-3':            'var(--chart-3)',
  'chart-4':            'var(--chart-4)',
  'chart-grid':         'var(--chart-grid)',
  'chart-axis':         'var(--chart-axis)',
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// TYPE EXPORTS
// ─────────────────────────────────────────────────────────────────────────────

export type ColorScale = typeof colorScales.primary;
export type Spacing = typeof spacing;
export type Typography = typeof typography;
export type Radius = typeof radius;
export type Shadows = typeof shadows;
export type Motion = typeof motion;
export type ZIndex = typeof zIndex;
export type Breakpoints = typeof breakpoints;
export type SemanticTokens = typeof semanticTokens;