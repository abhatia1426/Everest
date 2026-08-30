/**
 * Hairline-divided metric row.
 *
 * The v2 command centre wrapped each supporting figure in its own bordered
 * chip, which gave four secondary numbers the same visual weight as a card and
 * left the portfolio value competing with its own supporting cast. Dividing
 * rules instead of boxes is the Stripe/Ramp move: the group reads as one
 * object, and the hierarchy between anchor and detail survives.
 *
 * Values render as an em dash rather than disappearing when unavailable, so
 * the row never changes width while quotes are missing and the user can see
 * *which* figure is unknown.
 */
export function MetricGroup({ items, className = '' }) {
  return (
    <dl
      className={`grid grid-cols-2 gap-x-0 gap-y-4 sm:flex sm:flex-wrap sm:gap-y-0 ${className}`}
    >
      {items.map((item, index) => (
        <div
          key={item.label}
          className={`min-w-0 sm:flex-1 ${
            // Rules between, never leading or trailing. On mobile the group
            // wraps to 2x2, so only odd indices take a left rule there.
            index % 2 === 1 ? 'border-l pl-4 sm:pl-5' : 'sm:border-l sm:pl-5'
          } ${index === 0 ? 'sm:border-l-0 sm:pl-0' : ''} ${
            index % 2 === 0 ? 'pr-4' : ''
          }`}
          style={{ borderColor: 'var(--border)' }}
        >
          <dt className="t-eyebrow truncate">{item.label}</dt>
          <dd
            className={`num mt-1.5 text-[15px] font-semibold ${
              item.tone || 'text-text-primary'
            }`}
          >
            {item.value ?? '—'}
          </dd>
          {item.hint ? (
            <dd className="num mt-0.5 truncate text-[11px] text-text-tertiary">{item.hint}</dd>
          ) : null}
        </div>
      ))}
    </dl>
  )
}
