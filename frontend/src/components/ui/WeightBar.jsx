/**
 * Proportion bar for allocation and position sizing.
 *
 * Deliberately unlabelled and 3px tall: it answers "how big is this relative to
 * the rest" pre-attentively, so the eye can rank ten rows without reading ten
 * percentages. The number stays available beside it for anyone who needs the
 * exact figure — the bar is a second encoding of the same value, not a
 * replacement for it.
 */
export function WeightBar({ value, color, height = 3, className = '' }) {
  const pct = Number.isFinite(value) ? Math.min(Math.max(value, 0), 100) : 0

  return (
    <span
      className={`block w-full overflow-hidden rounded-full ${className}`}
      style={{ height, background: 'rgb(var(--tint) / 0.07)' }}
      role="presentation"
    >
      <span
        className="block h-full rounded-full transition-[width] duration-500 ease-out"
        style={{ width: `${pct}%`, background: color || 'var(--accent-blue)' }}
      />
    </span>
  )
}
