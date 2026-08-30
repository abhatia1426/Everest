import { Link } from 'react-router-dom'

import { Sparkline } from '../Sparkline'
import { EmptyState, Skeleton } from '../States'
import { DataRow } from '../ui/DataRow'
import { Panel } from '../ui/Surface'
import { fmtMoney, fmtPercent, pnlColor } from '../../lib/format'

const PREVIEW = 5

/** Watchlist preview. Shares `DataRow` with movers and search so a symbol
 *  looks identical wherever it appears in the product. */
export function WatchlistPanel({ items = [], loading }) {
  const preview = items.slice(0, PREVIEW)

  return (
    <Panel
      title="Watchlist"
      action={
        preview.length ? (
          <Link
            to="/app/watchlist"
            className="cursor-pointer text-[11px] font-semibold text-accent transition-opacity
              duration-150 hover:opacity-80"
          >
            View all
          </Link>
        ) : null
      }
    >
      {loading && items.length === 0 ? (
        <div className="space-y-1">
          {Array.from({ length: PREVIEW }).map((_, i) => (
            <Skeleton key={i} className="h-[46px] w-full rounded-panel" />
          ))}
        </div>
      ) : preview.length === 0 ? (
        <EmptyState
          title="Nothing tracked yet"
          description="Add companies you are researching to follow them here."
          action={
            <Link to="/app/watchlist" className="btn-ghost cursor-pointer">
              Open watchlist
            </Link>
          }
        />
      ) : (
        <div className="space-y-0.5">
          {preview.map((item) => {
            const up = (item.change_percent ?? 0) >= 0

            return (
              <DataRow
                key={item.id}
                ticker={item.ticker}
                company={item.company}
                to={`/app/ticker/${item.ticker}`}
                trailing={<Sparkline data={item.sparkline} width={56} height={20} positive={up} />}
                primary={
                  item.price === null || item.price === undefined ? '—' : fmtMoney(item.price)
                }
                secondary={
                  <span className={pnlColor(item.change_percent)}>
                    {fmtPercent(item.change_percent)}
                  </span>
                }
              />
            )
          })}
        </div>
      )}
    </Panel>
  )
}
