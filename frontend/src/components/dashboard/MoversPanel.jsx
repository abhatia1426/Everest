import { useMemo } from 'react'
import { Link } from 'react-router-dom'

import { Skeleton } from '../States'
import { fmtPercent, fmtSignedMoney, pnlColor } from '../../lib/format'

const LIMIT = 6

/**
 * Movers, ranked by DOLLAR IMPACT rather than by percentage.
 *
 * This is the substantive change from the previous version, and it is a
 * correctness argument rather than a stylistic one. A 9% move on a $300
 * position and a 0.6% move on a $60,000 position are not comparable events, but
 * a percentage ranking puts the $300 name on top and buries the one that
 * actually moved the book. On a portfolio dashboard the question is "what moved
 * my money", so the encoding has to be money.
 *
 * Impact is `market_value × change_percent / 100` — arithmetic on two figures
 * the API already returns, not a model.
 *
 * Bars diverge from a centre line so sign is carried by DIRECTION as well as by
 * colour, which keeps the ranking readable without relying on red/green alone.
 * Bar length is scaled to the largest absolute impact in the set.
 *
 * WATCHLIST ROWS ARE EXCLUDED, deliberately: a symbol you do not own has no
 * dollar impact on your portfolio, and inventing one by assuming a position
 * would be fabrication. Watchlist movement is carried by the tape directly
 * above this module, where percentage is the correct unit.
 */
export function MoversPanel({ positions = [], loading }) {
  const rows = useMemo(() => {
    const withImpact = positions
      .filter(
        (position) =>
          typeof position.change_percent === 'number' &&
          typeof position.market_value === 'number' &&
          // A holding priced at cost basis has no measured day move; showing
          // it as a $0 mover would imply we know it did not move.
          !position.price_stale,
      )
      .map((position) => ({
        ticker: position.ticker,
        changePercent: position.change_percent,
        // Yesterday's value is value / (1 + pct), so impact is the difference.
        impact:
          position.market_value -
          position.market_value / (1 + position.change_percent / 100),
      }))
      .filter((row) => Number.isFinite(row.impact))
      .sort((a, b) => Math.abs(b.impact) - Math.abs(a.impact))
      .slice(0, LIMIT)

    const peak = Math.max(...withImpact.map((row) => Math.abs(row.impact)), 0)
    return withImpact.map((row) => ({
      ...row,
      // 44% of the track each side, per the design — mirror images about the
      // centre line.
      width: peak ? (Math.abs(row.impact) / peak) * 44 : 0,
    }))
  }, [positions])

  return (
    <section className="module" style={{ padding: 20 }}>
      <div className="flex items-center gap-2.5">
        <h2 className="font-display text-[19px] font-bold tracking-[-0.035em] text-text-primary">Movers</h2>
        <span className="text-[11.5px] text-text-tertiary">by dollar impact</span>
      </div>

      {loading ? (
        <div className="mt-3 space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-[30px] w-full rounded-panel" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <p className="py-8 text-[13px] leading-relaxed text-text-secondary">
          Movers appear once your holdings have live quotes. A position carried at cost basis has
          no measured move for the day.
        </p>
      ) : (
        <div className="mt-3">
          {rows.map((row) => {
            const up = row.impact >= 0
            const color = up ? 'var(--accent-green)' : 'var(--accent-red)'

            return (
              <Link
                key={row.ticker}
                to={`/app/ticker/${row.ticker}`}
                className="grid items-center transition-colors duration-150 hover:opacity-80"
                style={{ gridTemplateColumns: '52px minmax(0,1fr) 74px', gap: 10, padding: '7px 0' }}
              >
                <span className="num truncate text-[12.5px] font-bold tracking-[-0.015em] text-text-primary">
                  {row.ticker}
                </span>

                <span className="relative block h-4" aria-hidden="true">
                  <span
                    className="absolute inset-y-0 left-1/2 w-px"
                    style={{ background: 'var(--border-strong)' }}
                  />
                  <span
                    className="absolute top-[3px] h-[10px] rounded-full"
                    style={{
                      left: up ? '50%' : `${50 - row.width}%`,
                      width: `${row.width}%`,
                      background: color,
                      // Hatching earns its place here: it distinguishes the
                      // bar from a solid fill at a glance and survives
                      // greyscale, so direction is never colour-only.
                      backgroundImage: 'var(--hatch-light)',
                    }}
                  />
                </span>

                <span className="text-right">
                  <span
                    className={`num block font-display text-[12.5px] font-bold ${pnlColor(
                      row.impact,
                    )}`}
                  >
                    {fmtSignedMoney(row.impact)}
                  </span>
                  <span className="num block text-[10.5px] font-semibold text-text-tertiary">
                    {fmtPercent(row.changePercent)}
                  </span>
                </span>
              </Link>
            )
          })}
        </div>
      )}
    </section>
  )
}
