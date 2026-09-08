import { motion } from 'framer-motion'
import { useId } from 'react'

import { useMotionSafe } from '../Motion'

/**
 * Segmented control — iOS capsule.
 *
 * A track with ONE sliding thumb, not a row of pills. The difference is not
 * cosmetic: a single control with a current value reads instantly, where N
 * filled pills force the eye to compare backgrounds to work out which is on.
 *
 * The track is a recessed, blurred well and the thumb is the only lit object
 * in it — inner shadow on the track, inner highlight on the thumb. That pair
 * is what makes the control feel pressed into the surface rather than drawn on
 * top of it, and it is why inactive segments can stay genuinely low-contrast:
 * the thumb does not have to shout to win.
 *
 * `layoutId` slides one physical object between segments instead of
 * cross-fading two backgrounds.
 */
const SIZES = {
  sm: 'px-2.5 py-[5px] text-[11px]',
  md: 'px-3.5 py-1.5 text-[12.5px]',
}

export function Segmented({
  options,
  value,
  onChange,
  label,
  size = 'md',
  tone = 'neutral',
  className = '',
}) {
  const groupId = useId()
  const animateOn = useMotionSafe()

  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={`pill-track ${className}`}
    >
      {options.map((option) => {
        const key = typeof option === 'string' ? option : option.value
        const text = typeof option === 'string' ? option : option.label
        const active = key === value

        return (
          <button
            key={key}
            type="button"
            role="radio"
            aria-checked={active}
            data-selected={active}
            onClick={() => onChange(key)}
            className={`pill-item ${SIZES[size] || SIZES.md}`}
          >
            {active ? (
              <motion.span
                layoutId={animateOn ? `segmented-${groupId}` : undefined}
                className={`pill-thumb ${tone === 'accent' ? 'pill-thumb-accent' : ''}`}
                transition={{ type: 'spring', stiffness: 480, damping: 38 }}
              />
            ) : null}
            <span className="relative">{text}</span>
          </button>
        )
      })}
    </div>
  )
}

/**
 * Two-state toggle sharing the capsule language, for on/off overlays (the
 * vs-SPY benchmark) where a full radiogroup would overstate the choice.
 *
 * Selected uses Everest blue because this one genuinely adds a series to the
 * chart; unselected stays neutral glass so it reads as available, not off.
 */
export function ToggleChip({ active, onClick, children, className = '' }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`glass-button px-3 py-[6px] text-[11.5px] font-semibold ${
        active ? '!text-white' : ''
      } ${className}`}
      style={
        active
          ? {
              background: 'var(--accent-blue)',
              borderColor: 'transparent',
              boxShadow:
                'inset 0 1px 0 rgb(255 255 255 / 0.22), 0 3px 12px -4px rgb(var(--accent-blue-rgb) / 0.7)',
            }
          : undefined
      }
    >
      {children}
    </button>
  )
}
