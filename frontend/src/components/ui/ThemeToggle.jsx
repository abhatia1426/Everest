import { motion, useReducedMotion } from 'framer-motion'

import { useTheme } from '../../hooks/useTheme'

const TRACK_W = 56
const TRACK_H = 28
const KNOB = 22
const PAD = 3

/** Peak + stars — the dark-mode glyph, sitting on the left of the track. */
function NightGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <circle cx="2.2" cy="2.4" r="0.7" fill="#ffffff" opacity="0.85" />
      <circle cx="6" cy="1.4" r="0.5" fill="#ffffff" opacity="0.6" />
      <circle cx="11.4" cy="3" r="0.6" fill="#ffffff" opacity="0.75" />
      <path d="M1 12.4 L5 5.6 L7.4 9.6 L9 7 L13 12.4 Z" fill="#ffffff" opacity="0.9" />
    </svg>
  )
}

/**
 * Moon — the dark-mode accent.
 *
 * This slot used to hold a GREEN CANDLE. Under the approved semantic system
 * green means one thing only — financial direction — so spending it on a
 * theme switch made the chrome argue with the data. A moon says "dark mode"
 * without borrowing a colour that has a job.
 */
function MoonGlyph() {
  return (
    <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path
        d="M11.6 8.6A5.2 5.2 0 0 1 5.4 2.4 5.2 5.2 0 1 0 11.6 8.6Z"
        fill="currentColor"
        opacity="0.85"
      />
    </svg>
  )
}

/** Snow-capped peak — the light-mode glyph, on the right of the track. */
function SnowPeakGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path
        d="M1 12.4 L5 5.6 L7.4 9.6 L9 7 L13 12.4 Z"
        fill="var(--accent-blue)"
        opacity="0.8"
      />
      <path d="M5 5.6 L6.6 8.3 L5.8 7.7 L5 8.5 L4.2 7.7 Z" fill="#ffffff" />
      <path d="M9 7 L10.2 8.7 L9.6 8.3 L9 8.9 L8.4 8.3 Z" fill="#ffffff" />
    </svg>
  )
}

/** Sun — the light-mode accent. Amber, from the token, without the glow. */
function SunGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <circle cx="7" cy="7" r="3" fill="var(--accent-amber)" />
      {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => {
        const rad = (deg * Math.PI) / 180
        return (
          <line
            key={deg}
            x1={7 + Math.cos(rad) * 4.4}
            y1={7 + Math.sin(rad) * 4.4}
            x2={7 + Math.cos(rad) * 5.9}
            y2={7 + Math.sin(rad) * 5.9}
            stroke="var(--accent-amber)"
            strokeWidth="1.1"
            strokeLinecap="round"
          />
        )
      })}
    </svg>
  )
}

/**
 * Custom 56x28 theme pill.
 *
 * The two glyphs sit inside the track and cross-fade; the knob slides between
 * them on a spring. Both states are always rendered (opacity-swapped) so the
 * transition has something to fade between.
 */
export function ThemeToggle({ showLabel = true, className = '' }) {
  const { theme, toggleTheme, isDark } = useTheme()
  const reduceMotion = useReducedMotion()

  const spring = reduceMotion
    ? { duration: 0 }
    : { type: 'spring', stiffness: 400, damping: 30 }

  return (
    <div className={`flex flex-col items-center gap-1 ${className}`}>
      <button
        type="button"
        onClick={toggleTheme}
        role="switch"
        aria-checked={!isDark}
        aria-label={`Switch to ${isDark ? 'light' : 'dark'} mode`}
        title={`Switch to ${isDark ? 'light' : 'dark'} mode`}
        className="group relative cursor-pointer rounded-full transition-transform duration-150
          hover:scale-105 focus-visible:outline-2"
        /*
         * Track, knob and border now read from tokens instead of the hardcoded
         * navy gradient (#0d1730 → #16203f) this control shipped with. That
         * gradient is the LANDING's blue-hour palette; inside the product's
         * neutral graphite shell it was the one control still tinted blue-black
         * and it read as a foreign object in the top bar.
         */
        style={{
          width: TRACK_W,
          height: TRACK_H,
          background: 'var(--panel-bg)',
          border: '1px solid var(--border-strong)',
          boxShadow: 'none',
        }}
      >
        {/* Left slot */}
        <span
          className="pointer-events-none absolute inset-y-0 left-0 grid place-items-center transition-opacity duration-300"
          style={{ width: TRACK_H, opacity: isDark ? 1 : 0 }}
        >
          <NightGlyph />
        </span>
        <span
          className="pointer-events-none absolute inset-y-0 left-0 grid place-items-center transition-opacity duration-300"
          style={{ width: TRACK_H, opacity: isDark ? 0 : 1 }}
        >
          <SunGlyph />
        </span>

        {/* Right slot */}
        <span
          className="pointer-events-none absolute inset-y-0 right-0 grid place-items-center text-text-secondary transition-opacity duration-300"
          style={{ width: TRACK_H, opacity: isDark ? 1 : 0 }}
        >
          <MoonGlyph />
        </span>
        <span
          className="pointer-events-none absolute inset-y-0 right-0 grid place-items-center transition-opacity duration-300"
          style={{ width: TRACK_H, opacity: isDark ? 0 : 1 }}
        >
          <SnowPeakGlyph />
        </span>

        {/* Sliding indicator */}
        <motion.span
          className="absolute top-1/2 rounded-full"
          initial={false}
          animate={{ x: isDark ? PAD : TRACK_W - KNOB - PAD }}
          transition={spring}
          style={{
            width: KNOB,
            height: KNOB,
            y: '-50%',
            left: 0,
            background: 'var(--text-primary)',
            boxShadow: '0 2px 6px rgb(0 0 0 / 0.28)',
          }}
        />
      </button>

      {showLabel ? (
        <span className="relative h-3.5 w-9 text-[10px] font-semibold text-text-secondary">
          <span
            className="absolute inset-0 grid place-items-center transition-opacity duration-300"
            style={{ opacity: isDark ? 1 : 0 }}
          >
            Dark
          </span>
          <span
            className="absolute inset-0 grid place-items-center transition-opacity duration-300"
            style={{ opacity: isDark ? 0 : 1 }}
          >
            Light
          </span>
        </span>
      ) : null}
      <span className="sr-only">Current theme: {theme}</span>
    </div>
  )
}
