import { useId, useState } from 'react'
import { ChevronDown, Loader2 } from 'lucide-react'

/**
 * Shared chrome for every create-flow, so Add Position, Add Contract and Add
 * Ticker read as one product rather than three forms written on three days.
 */

/**
 * Collapsible advanced section.
 *
 * The point of the redesigned Add Position flow is that the common case — buy
 * at the current market price — needs one input. Everything that serves the
 * uncommon case (importing a historical lot at its original price) lives here,
 * closed by default, so it is available without being in the way.
 */
export function AdvancedSection({ label = 'Advanced', children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen)
  const reactId = useId().replace(/:/g, '')
  const panelId = `advanced-${reactId}`

  return (
    <div className="border-t pt-3" style={{ borderColor: 'var(--border)' }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={panelId}
        className="flex w-full cursor-pointer items-center gap-1.5 text-[11.5px] font-semibold
          text-text-secondary transition-colors duration-150 hover:text-text-primary"
      >
        <ChevronDown
          size={13}
          className="transition-transform duration-200"
          style={{ transform: open ? 'rotate(0deg)' : 'rotate(-90deg)' }}
        />
        {label}
      </button>

      {open ? (
        <div id={panelId} className="mt-3.5 space-y-3.5">
          {children}
        </div>
      ) : null}
    </div>
  )
}

/**
 * Cancel / primary footer.
 *
 * `disabledReason` is rendered above the buttons rather than hidden in a
 * tooltip: a disabled submit with no stated cause is the single most common
 * dead end in a form.
 */
export function FormActions({
  onCancel,
  submitLabel,
  loadingLabel = 'Working…',
  loading = false,
  disabled = false,
  disabledReason = null,
}) {
  return (
    <div className="pt-1">
      {disabledReason && !loading ? (
        <p className="mb-2.5 text-[11px] text-text-tertiary">{disabledReason}</p>
      ) : null}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="btn-ghost flex-1 cursor-pointer"
          disabled={loading}
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={loading || disabled}
          className="btn-primary flex-[1.4] cursor-pointer"
        >
          {loading ? (
            <>
              <Loader2 size={14} className="animate-spin" />
              {loadingLabel}
            </>
          ) : (
            submitLabel
          )}
        </button>
      </div>
    </div>
  )
}

/**
 * A short explanatory note attached to a control — used where a choice changes
 * how figures elsewhere are computed, which the user cannot infer.
 */
export function FieldNote({ tone = 'info', children }) {
  const tones = {
    info: { color: 'var(--text-tertiary)', bg: 'transparent' },
    warn: { color: 'var(--accent-amber)', bg: 'rgb(var(--accent-amber-rgb) / 0.09)' },
  }
  const style = tones[tone] || tones.info

  return (
    <p
      className="rounded-control px-2.5 py-2 text-[11px] leading-relaxed"
      style={{ color: style.color, background: style.bg }}
    >
      {children}
    </p>
  )
}
