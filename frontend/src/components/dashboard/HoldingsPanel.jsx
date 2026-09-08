import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus } from 'lucide-react'

import { EmptyState, Skeleton } from '../States'
import { Sparkline } from '../Sparkline'
import { CompanyLogo } from '../ui/CompanyLogo'
import { QuoteDot } from '../ui/QuoteBadge'
import { peek } from '../../lib/cache'
import { equityOrFallback } from '../../lib/equitySource'
import { fmtCompact, fmtMoney, fmtPercent, fmtSignedMoney, pnlColor } from '../../lib/format'
import { normalizeQuote } from '../../lib/quotes'

/**
 * Holdings — the approved Dashboard's ledger.
 *
 * Geometry from `Everest Dashboard v2.dc.html`:
 *   panel   padding `20px 0 8px` (rows carry their own 20px inset)
 *   header  `0 20px 14px`, h2 Archivo 700 19px -0.035em, meta 12px faint
 *   sorts   track 3px pad on --pnl2, items `5px 11px` 12px/700
 *   head    11px/600 faint, 8px bottom pad, hairline under
 *   row     `11px 20px`, hairline under, hover --pnl2
 *   mark    32px circle · ticker 13.5px/700 · name 11.5px faint
 *   figures Archivo 13.5px, sub-lines 11px
 *   weight  44x6 track on --pnl3, brand fill + hatch, label 11px/600 30px wide
 *
 * The design's grid is `minmax(120px,1.3fr) 86px 92px 66px 132px`.
 */
const SORTS = [
  { key: 'value', label: 'Value', of: (p) => p.market_value || 0 },
  {
    key: 'today',
    label: 'Today',
    // A holding with no measured move sinks rather than floats — otherwise
    // missing data would occupy the top slot of a "best today" ordering.
    of: (p) => (p.price_stale ? -Infinity : p.change_percent ?? -Infinity),
  },
  { key: 'return', label: 'Return', of: (p) => p.pnl_percent ?? -Infinity },
]

/*
 * The design's grid, INCLUDING the 66px 30d column.
 *
 * That column was previously dropped and the grid closed up by its width. The
 * reasoning was sound about the provider and wrong about the layout: an
 * unavailable series is a reason for an empty cell, not for a different
 * ledger. `/pnl.positions` genuinely carries no price series, and one
 * `/prices/{t}/history` per holding would exceed the provider's free-tier
 * call budget on page load — so the column is filled from series Everest
 * ALREADY HAS IN HAND, at a cost of zero additional requests:
 *
 *   · the shared watchlist response, which returns a real 30-point sparkline
 *     per entry — free for any holding the user also watches
 *   · the client cache, which holds `history:{TICKER}:1m` for any company
 *     whose detail page has been opened this session
 *
 * Anything else draws an em dash. No sparkline on this page is interpolated,
 * padded or synthesised.
 */
const GRID = 'minmax(120px,1.3fr) 86px 92px 66px 132px'

function HoldingRow({ position, weight, fill, series }) {
  const reference = equityOrFallback(position.ticker)
  const name =
    position.company && position.company !== position.ticker ? position.company : reference.name
  const view = normalizeQuote(position, { costBasis: position.avg_cost })
  const measured = typeof position.change_percent === 'number' && !position.price_stale

  return (
    <Link
      to={`/app/ticker/${position.ticker}`}
      className="grid items-center transition-colors duration-150 hover:bg-tint/[0.045]"
      style={{
        gridTemplateColumns: GRID,
        gap: 11,
        padding: '11px 20px',
        borderBottom: '1px solid var(--border)',
      }}
    >
      <div className="flex min-w-0 items-center gap-[11px]">
        <span className="grid h-8 w-8 shrink-0 place-items-center overflow-hidden rounded-full bg-tint/[0.05]">
          <CompanyLogo ticker={position.ticker} name={name} size={32} />
        </span>
        <span className="min-w-0">
          <span className="num block text-[13.5px] font-bold tracking-[-0.02em] text-text-primary">
            {position.ticker}
          </span>
          <span className="block truncate text-[11.5px] text-text-tertiary">{name}</span>
        </span>
      </div>

      <div className="text-right">
        <div className="num flex items-center justify-end gap-1.5 font-display text-[13.5px] font-semibold tracking-[-0.02em] text-text-primary">
          <QuoteDot quote={view} />
          {view.unavailable ? '—' : fmtMoney(view.price)}
        </div>
        <div className="num text-[11px] text-text-tertiary">
          {position.qty % 1 === 0 ? position.qty : position.qty.toFixed(2)} sh
        </div>
      </div>

      {/* A holding with no live quote shows an em dash rather than 0.00% — we
          did not measure a flat day, we measured nothing. */}
      <div className="text-right" style={measured ? { color: undefined } : undefined}>
        {measured ? (
          <>
            <div
              className={`num font-display text-[13.5px] font-bold tracking-[-0.02em] ${pnlColor(
                position.change_percent,
              )}`}
            >
              {fmtPercent(position.change_percent)}
            </div>
            <div
              className={`num text-[11px] font-semibold opacity-[0.72] ${pnlColor(
                position.change_percent,
              )}`}
            >
              {fmtSignedMoney(
                (position.market_value || 0) -
                  (position.market_value || 0) / (1 + position.change_percent / 100),
              )}
            </div>
          </>
        ) : (
          <div className="num text-[13.5px] text-text-tertiary">—</div>
        )}
      </div>

      {/* 66x26, per the design. Direction is coloured by the day's move so the
          column agrees with the one beside it; with no series the cell is an
          em dash rather than a flat line, which would assert no movement. */}
      <div className="flex items-center justify-end">
        {series && series.length > 1 ? (
          <Sparkline
            data={series}
            width={66}
            height={26}
            positive={(position.change_percent ?? 0) >= 0}
          />
        ) : (
          <span className="num w-full text-right text-[12px] text-text-tertiary">—</span>
        )}
      </div>

      <div className="text-right">
        <div className="num font-display text-[13.5px] font-semibold tracking-[-0.02em] text-text-primary">
          {fmtMoney(position.market_value)}
        </div>
        <div className="mt-1 flex items-center justify-end gap-[7px]">
          <span
            className="block overflow-hidden"
            style={{ width: 44, height: 6, borderRadius: 3, background: 'var(--track-bg)' }}
            aria-hidden="true"
          >
            <span
              className="block h-full"
              style={{
                // Scaled to the largest holding, as the design does
                // (`wPct: r.val / maxV`).
                width: `${Math.max(4, Math.min(100, fill))}%`,
                borderRadius: 3,
                background: 'var(--accent-blue)',
                backgroundImage: 'var(--hatch-light)',
              }}
            />
          </span>
          <span
            className="num text-[11px] font-semibold text-text-tertiary"
            style={{ minWidth: 30, textAlign: 'right' }}
          >
            {weight.toFixed(1)}%
          </span>
        </div>
      </div>
    </Link>
  )
}

/**
 * A 30d series for a holding, from data already loaded — never a new request.
 *
 * Two sources, in order of quality:
 *   1. the watchlist payload, whose `sparkline` is a real 30-point close series
 *      the backend fetched in one batched provider call
 *   2. `history:{TICKER}:1m` in the client cache, written by the ticker detail
 *      page; read with `peek` so an expired entry is simply absent rather than
 *      triggering a fetch
 *
 * Returns null when neither has it. Null renders an em dash.
 */
export function seriesFor(ticker, watchlistItems) {
  const symbol = (ticker || '').toUpperCase()

  const watched = watchlistItems.find((item) => (item.ticker || '').toUpperCase() === symbol)
  if (watched?.sparkline?.length > 1) return watched.sparkline

  const candles = peek(`history:${symbol}:1m`)?.data?.candles
  if (Array.isArray(candles) && candles.length > 1) {
    const closes = candles.map((candle) => candle?.close).filter((v) => typeof v === 'number')
    if (closes.length > 1) return closes
  }

  return null
}

export function HoldingsPanel({ positions = [], totalValue = 0, loading, watchlistItems = [] }) {
  const [sort, setSort] = useState('value')

  const rows = useMemo(() => {
    const key = SORTS.find((s) => s.key === sort) || SORTS[0]
    return [...positions].sort((a, b) => key.of(b) - key.of(a))
  }, [positions, sort])

  const peak = useMemo(
    () => Math.max(...positions.map((p) => p.market_value || 0), 0),
    [positions],
  )

  return (
    <section className="module" style={{ padding: '20px 0 8px' }}>
      <div className="flex items-center gap-3" style={{ padding: '0 20px 14px' }}>
        <h2 className="font-display text-[19px] font-bold tracking-[-0.035em] text-text-primary">
          Holdings
        </h2>
        <span className="truncate text-[12px] text-text-tertiary">
          {positions.length} {positions.length === 1 ? 'position' : 'positions'} ·{' '}
          {`$${fmtCompact(totalValue)}`}
        </span>
        <div className="flex-1" />
        <div
          className="flex shrink-0 gap-0.5"
          style={{ padding: 3, borderRadius: 999, background: 'var(--nested-bg)' }}
        >
          {SORTS.map((option) => {
            const active = option.key === sort
            return (
              <button
                key={option.key}
                type="button"
                aria-pressed={active}
                onClick={() => setSort(option.key)}
                className="cursor-pointer rounded-full text-[12px] font-bold transition-colors duration-200"
                style={{
                  padding: '5px 11px',
                  background: active ? 'var(--panel-bg)' : 'transparent',
                  color: active ? 'var(--text-primary)' : 'var(--text-tertiary)',
                }}
              >
                {option.label}
              </button>
            )
          })}
        </div>
      </div>

      {loading ? (
        <div className="space-y-2 px-5">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-[54px] w-full rounded-panel" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="px-5 pb-4">
          <EmptyState
            title="No positions yet"
            description="Add your first holding to start tracking value, allocation and return."
            action={
              <Link to="/app/portfolio" className="btn-primary cursor-pointer !rounded-full">
                <Plus size={15} />
                Add a position
              </Link>
            }
          />
        </div>
      ) : (
        <div className="overflow-x-auto">
          {/* 520 + the restored 66px column and its 11px gap. */}
          <div style={{ minWidth: 600 }}>
            <div
              className="grid text-[11px] font-semibold text-text-tertiary"
              style={{
                gridTemplateColumns: GRID,
                gap: 11,
                padding: '0 20px 8px',
                borderBottom: '1px solid var(--border)',
              }}
            >
              <span>Position</span>
              <span className="text-right">Last</span>
              <span className="text-right">Today</span>
              <span className="text-right">30d</span>
              <span className="text-right">Value · weight</span>
            </div>

            {rows.map((position) => (
              <HoldingRow
                key={position.id || position.ticker}
                position={position}
                weight={totalValue ? ((position.market_value || 0) / totalValue) * 100 : 0}
                fill={peak ? ((position.market_value || 0) / peak) * 100 : 0}
                series={seriesFor(position.ticker, watchlistItems)}
              />
            ))}

            {/*
              THE DESIGN'S LEDGER ENDS ON A CASH ROW. This one does not.

              Everest models no cash balance anywhere, and a row reading
              "Cash —" asserts that cash is a tracked concept which merely
              happens to be empty. It is not tracked at all, so the row is
              removed rather than emptied. The ledger ends on the last real
              holding; the panel's 8px bottom padding closes it.
            */}
          </div>
        </div>
      )}
    </section>
  )
}
