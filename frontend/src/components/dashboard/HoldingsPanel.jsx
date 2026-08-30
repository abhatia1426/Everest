import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Plus } from 'lucide-react'

import { EmptyState, Skeleton } from '../States'
import { CompanyLogo } from '../ui/CompanyLogo'
import { Panel } from '../ui/Surface'
import { WeightBar } from '../ui/WeightBar'
import { equityOrFallback } from '../../lib/equitySource'
import { fmtMoney, fmtNumber, fmtPercent, pnlColor } from '../../lib/format'

const PREVIEW_COUNT = 6

/**
 * Top holdings by market value.
 *
 * v2's dashboard never showed what you actually own — you had to leave for the
 * Portfolio page to answer the second-most-obvious question on a portfolio
 * screen. This is the densest object on the page and intentionally so: logo,
 * symbol, name, value, day change, total return and weight, in one 44px row.
 *
 * The weight bar spans the full row width beneath the content rather than
 * sitting in a column, so six bars form a single readable ranking down the
 * left edge.
 */
function HoldingRow({ position, weight }) {
  const reference = equityOrFallback(position.ticker)
  const name =
    position.company && position.company !== position.ticker
      ? position.company
      : reference.name

  return (
    <li>
      <Link
        to={`/app/ticker/${position.ticker}`}
        className="block rounded-panel px-2 py-2 transition-colors duration-150 hover:bg-tint/[0.04]"
      >
        <div className="flex items-center gap-3">
          <CompanyLogo ticker={position.ticker} name={name} size={30} />

          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2">
              <span className="num text-[13px] font-semibold text-text-primary">
                {position.ticker}
              </span>
              <span className="num text-[11px] text-text-tertiary">
                {fmtNumber(position.qty, position.qty % 1 === 0 ? 0 : 2)} sh
              </span>
            </div>
            <span className="block truncate text-[11px] text-text-secondary">{name}</span>
          </div>

          <div className="shrink-0 text-right">
            <span className="num block text-[13px] font-semibold text-text-primary">
              {fmtMoney(position.market_value)}
            </span>
            <span className={`num block text-[11px] font-semibold ${pnlColor(position.unrealized_pnl)}`}>
              {fmtPercent(position.pnl_percent)}
            </span>
          </div>
        </div>

        <div className="mt-2 flex items-center gap-2 pl-[42px]">
          <WeightBar value={weight} height={2} />
          <span className="num w-10 shrink-0 text-right text-[10px] text-text-tertiary">
            {weight.toFixed(1)}%
          </span>
        </div>
      </Link>
    </li>
  )
}

export function HoldingsPanel({ positions = [], totalValue = 0, loading }) {
  const top = useMemo(
    () =>
      [...positions]
        .sort((a, b) => (b.market_value || 0) - (a.market_value || 0))
        .slice(0, PREVIEW_COUNT),
    [positions],
  )

  return (
    <Panel
      title="Holdings"
      action={
        positions.length > PREVIEW_COUNT ? (
          <Link
            to="/app/portfolio"
            className="cursor-pointer text-[11px] font-semibold text-accent transition-opacity
              duration-150 hover:opacity-80"
          >
            All {positions.length}
          </Link>
        ) : null
      }
    >
      {loading ? (
        <ul className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <li key={i}>
              {/* Matches the real row's 54px height so nothing shifts on load. */}
              <Skeleton className="h-[54px] w-full rounded-panel" />
            </li>
          ))}
        </ul>
      ) : top.length === 0 ? (
        <EmptyState
          title="No positions yet"
          description="Add your first holding to start tracking value, allocation and return."
          action={
            <Link to="/app/portfolio" className="btn-primary cursor-pointer">
              <Plus size={15} />
              Add a position
            </Link>
          }
        />
      ) : (
        <ul className="space-y-1">
          {top.map((position) => (
            <HoldingRow
              key={position.id || position.ticker}
              position={position}
              weight={totalValue ? ((position.market_value || 0) / totalValue) * 100 : 0}
            />
          ))}
        </ul>
      )}
    </Panel>
  )
}
