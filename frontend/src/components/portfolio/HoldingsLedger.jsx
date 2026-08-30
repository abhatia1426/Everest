import { Link } from 'react-router-dom'
import { Trash2 } from 'lucide-react'

import { CompanyLogo } from '../ui/CompanyLogo'
import { Surface } from '../ui/Surface'
import { QuoteBadge } from '../ui/QuoteBadge'
import { WeightBar } from '../ui/WeightBar'
import { normalizeQuote } from '../../lib/quotes'
import { Skeleton } from '../States'
import { displayName, equityOrFallback } from '../../lib/equitySource'
import { fmtMoney, fmtNumber, fmtPercent, fmtSignedMoney, pnlColor } from '../../lib/format'

/**
 * The holdings ledger.
 *
 * WHY ROWS, NOT A CARD GRID: the primary task on this page is comparing
 * positions — is my average cost above or below the market, which position is
 * dragging, what is oversized. A three-column grid of boxes makes that
 * impossible, because the same figure lands at a different x-position in every
 * card and the eye has no column to run down. Aligned rows restore comparison.
 *
 * It is still not a bare <table>: rows carry a logo, a weight bar and hover
 * actions, and collapse to a stacked layout on small screens where columns
 * cannot survive. Density where density helps, structure where it doesn't.
 *
 * Semantics are a real table (role="table"/"row"/"cell") so screen readers
 * announce the column relationships that the visual layout implies.
 */

/* Column template, shared by the header and every row so they cannot drift. */
const COLS =
  'lg:grid-cols-[minmax(190px,2fr)_90px_100px_100px_minmax(120px,1.1fr)_130px_112px_40px]'

function HeaderCell({ children, align = 'left' }) {
  return (
    <div className={`t-eyebrow ${align === 'right' ? 'text-right' : ''}`} role="columnheader">
      {children}
    </div>
  )
}

function LedgerHeader() {
  return (
    <div
      role="row"
      className={`hidden border-b px-4 pb-2.5 lg:grid lg:items-center lg:gap-3 ${COLS}`}
      style={{ borderColor: 'var(--border)' }}
    >
      <HeaderCell>Holding</HeaderCell>
      <HeaderCell align="right">Qty</HeaderCell>
      <HeaderCell align="right">Avg cost</HeaderCell>
      <HeaderCell align="right">Price</HeaderCell>
      <HeaderCell align="right">Market value</HeaderCell>
      <HeaderCell align="right">Unrealized</HeaderCell>
      <HeaderCell>Weight</HeaderCell>
      <span />
    </div>
  )
}

function LedgerRow({ position, weight, onRemove, removing }) {
  const reference = equityOrFallback(position.ticker)
  const company = displayName(position.ticker, position.company, reference.name)
  const sector =
    position.sector && position.sector !== 'Unknown' ? position.sector : reference.sector
  // Same normaliser as Watchlist and Stock Detail, so a stale AAPL is labelled
  // identically wherever it appears.
  const view = normalizeQuote(position, { costBasis: position.avg_cost })

  return (
    <div
      role="row"
      className={`group relative grid grid-cols-2 items-center gap-x-3 gap-y-2 px-4 py-3
        transition-colors duration-150 hover:bg-tint/[0.03] lg:gap-y-0 ${COLS}`}
    >
      {/* Identity. The whole cell is the link target so the row is one hit area
          for the common action (open the ticker) without swallowing Delete. */}
      <div className="col-span-2 min-w-0 lg:col-span-1" role="cell">
        <Link
          to={`/app/ticker/${position.ticker}`}
          className="flex min-w-0 items-center gap-3 rounded-panel transition-opacity duration-150
            hover:opacity-80"
        >
          <CompanyLogo ticker={position.ticker} name={company} size={32} />
          <span className="min-w-0">
            <span className="num block truncate text-[13px] font-semibold text-text-primary">
              {position.ticker}
            </span>
            <span className="block truncate text-[11px] text-text-secondary">
              {company}
              {sector ? <span className="text-text-tertiary"> · {sector}</span> : null}
            </span>
          </span>
        </Link>
      </div>

      {/* On mobile each figure carries its own label, because the column header
          is gone and an unlabelled number is not information. */}
      <Cell label="Qty">{fmtNumber(position.qty, position.qty % 1 === 0 ? 0 : 2)}</Cell>
      <Cell label="Avg cost">{fmtMoney(position.avg_cost)}</Cell>
      <div className="text-right" role="cell">
        <span className="t-eyebrow mb-0.5 block lg:hidden">Price</span>
        <span
          className={`num block text-[13px] ${
            view.isMarketPrice ? 'text-text-primary' : 'text-text-tertiary'
          }`}
        >
          {view.price === null ? '—' : fmtMoney(view.price)}
        </span>
        <QuoteBadge quote={view} showIcon={false} className="justify-end" />
      </div>
      <Cell label="Market value" strong>
        {fmtMoney(position.market_value)}
      </Cell>

      <div className="text-right" role="cell">
        <span className="t-eyebrow mb-0.5 block lg:hidden">Unrealized</span>
        <span className={`num block text-[13px] font-semibold ${pnlColor(position.unrealized_pnl)}`}>
          {fmtSignedMoney(position.unrealized_pnl)}
        </span>
        <span className={`num block text-[11px] ${pnlColor(position.pnl_percent)}`}>
          {fmtPercent(position.pnl_percent)}
        </span>
      </div>

      <div className="col-span-2 lg:col-span-1" role="cell">
        <div className="mb-1 flex items-baseline justify-between gap-2">
          <span className="t-eyebrow lg:hidden">Weight</span>
          <span className="num ml-auto text-[11px] text-text-tertiary">{weight.toFixed(1)}%</span>
        </div>
        <WeightBar value={weight} height={3} />

      </div>

      <div className="absolute right-2 top-2 lg:static lg:justify-self-end" role="cell">
        <button
          type="button"
          aria-label={`Remove ${position.ticker}`}
          disabled={removing}
          onClick={() => onRemove(position.id, position.ticker)}
          className="btn-danger h-9 w-9 cursor-pointer p-0 opacity-0 transition-opacity
            duration-150 focus-visible:opacity-100 group-hover:opacity-100"
        >
          <Trash2 size={14} />
        </button>
      </div>


    </div>
  )
}

function Cell({ label, children, strong = false, muted = false }) {
  return (
    <div className="text-right" role="cell">
      <span className="t-eyebrow mb-0.5 block lg:hidden">{label}</span>
      <span
        className={`num block text-[13px] ${strong ? 'font-semibold' : ''} ${
          muted ? 'text-text-tertiary' : 'text-text-primary'
        }`}
      >
        {children}
      </span>
    </div>
  )
}

export function HoldingsLedger({ positions, totalValue, onRemove, removingId, loading }) {
  if (loading) {
    return (
      <Surface className="overflow-hidden py-2">
        <LedgerHeader />
        <div className="space-y-1 px-4 py-2">
          {Array.from({ length: 6 }).map((_, i) => (
            // Matches the real row height so the page does not jump on load.
            <Skeleton key={i} className="h-[52px] w-full rounded-panel" />
          ))}
        </div>
      </Surface>
    )
  }

  return (
    <Surface role="table" aria-label="Holdings" className="overflow-hidden py-2">
      <LedgerHeader />
      <div role="rowgroup" className="divide-y" style={{ borderColor: 'var(--border)' }}>
        {positions.map((position) => (
          <LedgerRow
            key={position.id}
            position={position}
            weight={totalValue ? ((position.market_value || 0) / totalValue) * 100 : 0}
            onRemove={onRemove}
            removing={removingId === position.id}
          />
        ))}
      </div>
    </Surface>
  )
}
