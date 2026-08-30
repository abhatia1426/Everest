import { motion } from 'framer-motion'
import { useId } from 'react'

/**
 * Segmented control.
 *
 * Replaces the row-of-pills pattern. The difference is not cosmetic: a track
 * with one sliding thumb reads as a single control with a current value, where
 * N separate pills read as N buttons and force the eye to compare fills to
 * work out which is active.
 *
 * The thumb is a shared `layoutId`, so framer-motion animates it between
 * segments instead of cross-fading two backgrounds.
 */
export function Segmented({ options, value, onChange, label, size = 'md', className = '' }) {
  const groupId = useId()

  const pad = size === 'sm' ? 'px-2 py-1 text-[11px]' : 'px-2.5 py-1.5 text-xs'

  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={`inline-flex items-center gap-0.5 rounded-control p-0.5 ${className}`}
      style={{ background: 'var(--e0-bg)', border: '1px solid var(--e0-border)' }}
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
            onClick={() => onChange(key)}
            className={`relative cursor-pointer select-none rounded-[6px] font-semibold
              transition-colors duration-150 ${pad} ${
                active ? 'text-text-primary' : 'text-text-secondary hover:text-text-primary'
              }`}
          >
            {active ? (
              <motion.span
                layoutId={`segmented-${groupId}`}
                className="absolute inset-0 rounded-[6px]"
                style={{
                  background: 'var(--e2-bg)',
                  border: '1px solid var(--e2-border)',
                  boxShadow: 'var(--shadow-e1)',
                }}
                transition={{ type: 'spring', stiffness: 420, damping: 34 }}
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
 * Two-state toggle sharing the segmented visual language, for on/off overlays
 * (the vs-SPY benchmark) where a full radiogroup would overstate the choice.
 */
export function ToggleChip({ active, onClick, children, className = '' }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`cursor-pointer select-none rounded-control px-2.5 py-1.5 text-xs font-semibold
        transition-colors duration-150 ${
          active
            ? 'bg-accent/12 text-accent'
            : 'text-text-secondary hover:bg-tint/[0.05] hover:text-text-primary'
        } ${className}`}
      style={{ border: `1px solid ${active ? 'rgb(var(--accent-blue-rgb) / 0.3)' : 'transparent'}` }}
    >
      {children}
    </button>
  )
}
