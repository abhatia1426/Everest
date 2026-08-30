/**
 * One reference statistic. Always renders — an unavailable value shows an em
 * dash rather than disappearing, so the grid stays stable while quotes are
 * missing and the user can see *which* figures are unknown.
 */
export function StatCard({ label, value, hint, tone = 'default' }) {
  const missing = value === null || value === undefined || value === '—'

  const valueTone =
    tone === 'up' ? 'text-up' : tone === 'down' ? 'text-down' : 'text-text-primary'

  return (
    <div className="surface-1 p-4">
      <p className="t-eyebrow">{label}</p>
      <p className={`num mt-1.5 text-lg font-semibold ${missing ? 'text-text-secondary' : valueTone}`}>
        {missing ? '—' : value}
      </p>
      {hint ? <p className="mt-0.5 text-[11px] text-text-tertiary">{hint}</p> : null}
    </div>
  )
}

/**
 * 52-week position bar — where today's price sits in its annual range.
 * Degrades to nothing if any of the three inputs is missing.
 */
export function RangeBar({ low, high, current, label = '52-Week Range' }) {
  const valid = [low, high, current].every((v) => typeof v === 'number' && !Number.isNaN(v))
  const pct = valid && high > low ? ((current - low) / (high - low)) * 100 : null

  return (
    <div className="surface-1 p-4">
      <p className="t-eyebrow">{label}</p>

      {pct === null ? (
        <p className="num mt-1.5 text-lg font-semibold text-text-secondary">—</p>
      ) : (
        <>
          <div className="relative mt-4 h-1.5 rounded-full bg-tint/[0.08]">
            <div
              className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-down/50 to-up/60"
              style={{ width: '100%' }}
            />
            <span
              className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full
                border-2 border-base bg-accent shadow"
              style={{ left: `${Math.min(Math.max(pct, 0), 100)}%` }}
              aria-hidden="true"
            />
          </div>
          <div className="num mt-2.5 flex justify-between text-xs text-text-secondary">
            <span>{low.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}</span>
            <span>{high.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}</span>
          </div>
        </>
      )}
    </div>
  )
}
