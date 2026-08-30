/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // Theme-driven. Channels (not hex) so Tailwind can apply opacity
        // modifiers — `bg-accent/10` compiles to rgb(79 142 255 / 0.1).
        // The literal --accent-blue etc. still exist for hand-written CSS.
        base: 'rgb(var(--bg-base-rgb) / <alpha-value>)',
        surface: 'rgb(var(--bg-surface-rgb) / <alpha-value>)',
        card: 'rgb(var(--bg-card-rgb) / <alpha-value>)',
        'card-hover': 'rgb(var(--bg-card-hover-rgb) / <alpha-value>)',
        accent: 'rgb(var(--accent-blue-rgb) / <alpha-value>)',
        up: 'rgb(var(--accent-green-rgb) / <alpha-value>)',
        down: 'rgb(var(--accent-red-rgb) / <alpha-value>)',
        warn: 'rgb(var(--accent-amber-rgb) / <alpha-value>)',
        violet: 'rgb(var(--accent-violet-rgb) / <alpha-value>)',
        'text-primary': 'rgb(var(--text-primary-rgb) / <alpha-value>)',
        'text-secondary': 'rgb(var(--text-secondary-rgb) / <alpha-value>)',
        'text-tertiary': 'var(--text-tertiary)',
        // Foreground-neutral that flips with the theme (white on dark, ink on
        // light) — replaces bare white/N% overlays that only worked in dark.
        tint: 'rgb(var(--tint) / <alpha-value>)',

      },
      borderRadius: {
        // Semantic radius scale. card > panel > control > pill.
        card: 'var(--radius-card)',
        panel: 'var(--radius-panel)',
        control: 'var(--radius-control)',
      },
      borderColor: {
        subtle: 'var(--border)',
        glass: 'var(--glass-border)',
      },
      backgroundColor: {
        glass: 'var(--glass-bg)',
      },
      backdropBlur: {
        glass: '20px',
      },
      boxShadow: {
        glass: 'var(--shadow-card)',
      },
      fontSize: {
        // Landing page display scale: 72px hero, 48px section headers, 18px body
        'display-xl': ['clamp(2.75rem, 7vw, 4.5rem)', { lineHeight: '1.04', letterSpacing: '-0.03em' }],
        'display-lg': ['clamp(2rem, 4.5vw, 3rem)', { lineHeight: '1.1', letterSpacing: '-0.025em' }],
        'body-lg': ['1.125rem', { lineHeight: '1.65' }],
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      transitionDuration: {
        DEFAULT: '150ms',
      },
      keyframes: {
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(12px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'scale-in': {
          '0%': { opacity: '0', transform: 'scale(0.96)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        'pulse-soft': {
          '0%, 100%': { opacity: '0.55', transform: 'translateY(0)' },
          '50%': { opacity: '1', transform: 'translateY(-3px)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-500px 0' },
          '100%': { backgroundPosition: '500px 0' },
        },
      },
      animation: {
        'fade-up': 'fade-up 0.4s cubic-bezier(0.16, 1, 0.3, 1) both',
        'fade-in': 'fade-in 0.3s ease both',
        'scale-in': 'scale-in 0.2s cubic-bezier(0.16, 1, 0.3, 1) both',
        'pulse-soft': 'pulse-soft 2.4s ease-in-out infinite',
        shimmer: 'shimmer 1.6s linear infinite',
      },
    },
  },
  plugins: [],
}
