/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    "./app/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
    "./pages/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Dark theme base colors
        'zinc-950': '#0f172a',
        'slate-900': '#1e293b',
        // Emerald accent colors
        'emerald-500': '#10B981',
        'emerald-50': '#F0FDF4',
        'emerald-100': '#D1F2EB',
        // Terminal specific colors
        'terminal-bg': '#0f172a',
        'terminal-text': '#e2e8f0',
        'terminal-border': '#10B981/20',
        // Glassmorphism
        'glass-bg': 'rgba(15, 23, 42, 0.7)',
        'glass-border': 'rgba(16, 185, 129, 0.15)',
      },
      fontFamily: {
        // Primary UI fonts
        sans: ['Inter', 'Hind Siliguri', 'system-ui', 'sans-serif'],
        // Monospace fonts for terminal elements
        mono: ['JetBrains Mono', 'Fira Code', 'Menlo', 'Consolas', 'monospace'],
      },
      borderRadius: {
        // Rounded terminal controls
        'terminal-square': '4px',
        'terminal-rounded': '8px',
      },
      boxShadow: {
        // Neon glow effects
        'neon-glow': '0 0 15px rgba(16,185,129,0.15)',
      },
      fontSize: {
        // Terminal UI typography
        'terminal-header': '1.125rem',
        'terminal-subtext': '0.875rem',
        'terminal-badge': '0.75rem',
      },
    },
  },
  plugins: [],
}