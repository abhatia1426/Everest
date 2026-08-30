import { useMemo } from 'react'

import { MetricGroup } from '../ui/MetricGroup'
import { Surface } from '../ui/Surface'
import { Skeleton } from '../States'
import { useThemeTokens } from '../../hooks/useThemeTokens'
import { equityOrFallback } from '../../lib/equitySource'
import { fmtMoney, fmtPercent, fmtSignedMoney, pnlColor } from '../../lib/format'

/**
 * Book summary.
 *
 * Deliberately NOT the dashboard's command bar. The dashboard answers "what am
 * I worth"; this page answers "how is this book composed", so the value is set
 * a step down from hero size and the space it gives back goes to a stacked
 * sector strip — a single horizontal bar carrying the whole allocation.
 *
 * A stacked bar rather than the dashboard's donut: a donut reads share-of-whole
 * well but ranks poorly, and on a page whose job is comparison the reader needs
 * to see order and relative size at once, in the width the page already has.
 */
function sectorBreakdown(positions, tokens) {
  const totals = new Map()

  for (const position of positions) {
    const reference = equityOrFallback(position.ticker)
    const sector =
      position.sector && position.sector !== 'Unknown'
        ? position.sector
        : reference.sector || 'Unclassified'
    totals.set(sector, (totals.get(sector) || 0) + (position.market_value || 0))
  }

  const sum = [...totals.values()].reduce((acc, value) => acc + value, 0)
  const palette = tokens.chart || []

  return [...totals.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([sector, value], index) => ({
      sector,
      value,
      weight: sum ? (value / sum) * 100 : 0,
      color: palette[index % palette.length] || 'var(--accent-blue)',
    }))
}

export function BookSummary({ positions = [], totals, mode, loading }) {
  const tokens = useThemeTokens()
  const sectors = useMemo(() => sectorBreakdown(positions, tokens), [positions, tokens])

  if (loading) {
    return (
      <Surface className="mb-4 p-5 sm:p-6">
        <Skeleton className="h-2.5 w-28" />
        <Skeleton className="mt-3 h-10 w-64" />
        <Skeleton className="mt-6 h-2 w-full rounded-full" />
        <Skeleton className="mt-6 h-12 w-full" />
      </Surface>
    )
  }

  const returnPercent = totals.costBasis ? (totals.pnl / totals.costBasis) * 100 : 0

  return (
    <Surface className="mb-4 p-5 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
        <div>
          <p className="t-eyebrow">Book value · {mode}</p>
          <p className="num-hero mt-2 text-[clamp(1.75rem,3.4vw,2.5rem)] text-text-primary">
            {fmtMoney(totals.marketValue)}
          </p>
        </div>

        <div className="min-w-[240px] flex-1">
          <MetricGroup
            items={[
              {
                label: 'Unrealized',
                value: fmtSignedMoney(totals.pnl),
                tone: pnlColor(totals.pnl),
                hint: fmtPercent(returnPercent),
              },
              { label: 'Cost basis', value: fmtMoney(totals.costBasis) },
              { label: 'Positions', value: positions.length },
            ]}
          />
        </div>
      </div>

      {sectors.length ? (
        <div className="mt-6">
          {/* One bar, segments in rank order. */}
          <div
            className="flex h-2 w-full overflow-hidden rounded-full"
            role="img"
            aria-label={`Sector allocation: ${sectors
              .map((s) => `${s.sector} ${s.weight.toFixed(0)}%`)
              .join(', ')}`}
          >
            {sectors.map((slice) => (
              <span
                key={slice.sector}
                className="h-full transition-[width] duration-500 ease-out"
                style={{ width: `${slice.weight}%`, background: slice.color }}
                title={`${slice.sector} — ${slice.weight.toFixed(1)}%`}
              />
            ))}
          </div>

          <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5">
            {sectors.slice(0, 6).map((slice) => (
              <li key={slice.sector} className="flex items-center gap-1.5 text-[11px]">
                <span
                  className="h-2 w-2 shrink-0 rounded-[3px]"
                  style={{ background: slice.color }}
                  aria-hidden="true"
                />
                <span className="text-text-secondary">{slice.sector}</span>
                <span className="num font-semibold text-text-primary">
                  {slice.weight.toFixed(1)}%
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </Surface>
  )
}
