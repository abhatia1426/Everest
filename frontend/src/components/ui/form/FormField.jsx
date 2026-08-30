import { useId } from 'react'

/**
 * One labelled input.
 *
 * Exists so the three create-flows (position, contract, watchlist) stop
 * hand-rolling `<label className="label">` + `<input className="input">` +
 * an ad-hoc hint paragraph in three slightly different ways. Label/field
 * association, hint wiring via `aria-describedby`, and error presentation are
 * decided once here.
 *
 * `suffix` renders inside the field box — used for units ("shares", "$") which
 * are the difference between a number and a quantity.
 */
export function FormField({
  label,
  hint,
  error,
  suffix,
  prefix,
  id,
  className = '',
  inputClassName = '',
  ...inputProps
}) {
  const reactId = useId().replace(/:/g, '')
  const fieldId = id || `field-${reactId}`
  const hintId = hint || error ? `${fieldId}-hint` : undefined

  return (
    <div className={className}>
      {label ? (
        <label htmlFor={fieldId} className="label">
          {label}
        </label>
      ) : null}

      <div className="relative">
        {prefix ? (
          <span className="num pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[13px] text-text-tertiary">
            {prefix}
          </span>
        ) : null}

        <input
          id={fieldId}
          aria-describedby={hintId}
          aria-invalid={error ? true : undefined}
          className={`input ${prefix ? 'pl-7' : ''} ${suffix ? 'pr-16' : ''} ${inputClassName}`}
          style={error ? { borderColor: 'rgb(var(--accent-red-rgb) / 0.55)' } : undefined}
          {...inputProps}
        />

        {suffix ? (
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-medium text-text-tertiary">
            {suffix}
          </span>
        ) : null}
      </div>

      {error ? (
        <p id={hintId} className="mt-1.5 text-[11px] font-medium text-down">
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className="mt-1.5 text-[11px] leading-relaxed text-text-tertiary">
          {hint}
        </p>
      ) : null}
    </div>
  )
}

/**
 * A read-only derived figure — the calculated total on a create form.
 *
 * Deliberately NOT an input. The whole point of the redesigned Add Position
 * flow is that the user supplies shares and the cost falls out of the live
 * price; rendering that result in a disabled text box would invite them to try
 * to type in it.
 */
export function DerivedValue({ label, value, hint, tone = 'default' }) {
  return (
    <div
      className="flex items-baseline justify-between gap-3 rounded-panel px-3.5 py-3"
      style={{ background: 'var(--e0-bg)', border: '1px solid var(--e0-border)' }}
    >
      <div className="min-w-0">
        <p className="t-eyebrow">{label}</p>
        {hint ? <p className="mt-0.5 text-[10px] text-text-tertiary">{hint}</p> : null}
      </div>
      <p
        className={`num shrink-0 text-[17px] font-semibold ${
          tone === 'muted' ? 'text-text-tertiary' : 'text-text-primary'
        }`}
      >
        {value}
      </p>
    </div>
  )
}
