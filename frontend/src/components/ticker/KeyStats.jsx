import { Panel } from '../ui/Surface'
import { Skeleton } from '../States'
import { fmtCompact, fmtMoney, fmtNumber } from '../../lib/format'

/**
 * Key statistics.
 *
 * v2 rendered these as eight bordered `StatCard` boxes in a 4-up grid. That
 * gave every figure identical weight, spent a border and 16px of padding on
 * each one, and — worse — implied no relationship between them, when in fact
 * P/E and EPS belong together and volume belongs with average volume.
 *
 * Here they are a grouped definition list: label left, value right, hairline
 * between rows, a small heading per group. It is denser, it reads top-to-bottom
 * like a factsheet, and the grouping is itself information.
 */
function StatRow({ label, value, hint }) {
  const missing = value === null || value === undefined || value === '—'

  return (
    <div
      className="flex items-baseline justify-between gap-3 border-b py-2 last:border-b-0"
      style={{ borderColor: 'var(--border)' }}
    >
      <dt className="text-[11.5px] text-text-secondary">{label}</dt>
      <dd
        className={`num text-[12.5px] font-semibold ${
          missing ? 'text-text-tertiary' : 'text-text-primary'
        }`}
      >
        {missing ? '—' : value}
        {hint && !missing ? (
          <span className="ml-1.5 text-[10px] font-medium text-text-tertiary">{hint}</span>
        ) : null}
      </dd>
    </div>
  )
}

function StatGroup({ title, children }) {
  return (
    <div>
      <h3 className="t-eyebrow mb-1">{title}</h3>
      <dl>{children}</dl>
    </div>
  )
}

/** Dividend yield arrives as a fraction for some symbols and a percentage for
 *  others, so anything under 1 is normalised before display. */
function dividendYield(value) {
  if (value === null || value === undefined) return null
  return `${(value < 1 ? value * 100 : value).toFixed(2)}%`
}

export function KeyStats({ quote, loading }) {
  if (loading) {
    return (
      <Panel title="Key statistics">
        <div className="space-y-2.5">
          {Array.from({ length: 9 }).map((_, i) => (
            <Skeleton key={i} className="h-4 w-full" />
          ))}
        </div>
      </Panel>
    )
  }

  return (
    <Panel title="Key statistics" bodyClassName="space-y-5">
      <StatGroup title="Valuation">
        <StatRow label="Market cap" value={fmtCompact(quote?.market_cap)} />
        <StatRow label="P/E ratio" value={fmtNumber(quote?.pe_ratio, 2)} />
        <StatRow label="EPS" value={fmtNumber(quote?.eps, 2)} hint="TTM" />
        <StatRow label="Beta" value={fmtNumber(quote?.beta, 2)} />
      </StatGroup>

      <StatGroup title="Trading">
        <StatRow label="Previous close" value={fmtMoney(quote?.previous_close)} />
        <StatRow label="Open" value={fmtMoney(quote?.open)} />
        <StatRow label="Volume" value={fmtCompact(quote?.volume)} />
        <StatRow label="Avg volume" value={fmtCompact(quote?.avg_volume)} hint="3m" />
      </StatGroup>

      <StatGroup title="Income">
        <StatRow label="Dividend yield" value={dividendYield(quote?.dividend_yield)} />
      </StatGroup>
    </Panel>
  )
}

/**
 * Where today's price sits inside a range.
 *
 * Rewritten from the v2 `RangeBar`: the old one drew a red→green gradient
 * across the whole track, which implied that a low price is bad and a high
 * price is good — a value judgement the data does not support. The track is
 * now neutral and only the marker carries meaning.
 */
export function RangeMeter({ label, low, high, current }) {
  const valid = [low, high, current].every((v) => typeof v === 'number' && !Number.isNaN(v))
  const pct = valid && high > low ? ((current - low) / (high - low)) * 100 : null

  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between">
        <span className="t-eyebrow">{label}</span>
        {pct === null ? null : (
          <span className="num text-[10px] text-text-tertiary">{pct.toFixed(0)}% of range</span>
        )}
      </div>

      {pct === null ? (
        <p className="num text-[12.5px] text-text-tertiary">—</p>
      ) : (
        <>
          <div
            className="relative h-1.5 rounded-full"
            style={{ background: 'rgb(var(--tint) / 0.08)' }}
          >
            <span
              className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2
                rounded-full bg-accent"
              style={{
                left: `${Math.min(Math.max(pct, 0), 100)}%`,
                boxShadow: '0 0 0 3px var(--e2-bg)',
              }}
              aria-hidden="true"
            />
          </div>
          <div className="num mt-2 flex justify-between text-[11px] text-text-tertiary">
            <span>{fmtMoney(low)}</span>
            <span>{fmtMoney(high)}</span>
          </div>
        </>
      )}
    </div>
  )
}
