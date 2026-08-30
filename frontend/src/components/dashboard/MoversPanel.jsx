import { useMemo } from 'react'

import { Skeleton } from '../States'
import { DataRow } from '../ui/DataRow'
import { Panel } from '../ui/Surface'
import { fmtMoney, fmtPercent, pnlColor } from '../../lib/format'

/**
 * Today's movers, across holdings *and* watchlist — "what changed today" is
 * not limited to what you own.
 *
 * v2 split this into two side-by-side sub-lists (Gainers | Losers), which
 * halved the row width and made eight items read as two four-item scraps. One
 * list sorted by absolute move is both denser and truer to the question: the
 * biggest mover is the biggest mover regardless of sign, and the colour already
 * carries direction.
 */
export function MoversPanel({ gainers = [], losers = [], hasData, loading }) {
  const rows = useMemo(
    () =>
      [...gainers, ...losers]
        .filter((row) => typeof row.change_percent === 'number')
        .sort((a, b) => Math.abs(b.change_percent) - Math.abs(a.change_percent))
        .slice(0, 7),
    [gainers, losers],
  )

  return (
    <Panel title="Today's movers">
      {loading ? (
        <div className="space-y-1">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-[46px] w-full rounded-panel" />
          ))}
        </div>
      ) : !hasData || rows.length === 0 ? (
        <p className="px-1 py-10 text-center text-[13px] text-text-secondary">
          Movers appear once live quotes are available for your holdings and watchlist.
        </p>
      ) : (
        <div className="space-y-0.5">
          {rows.map((row) => (
            <DataRow
              key={row.ticker}
              ticker={row.ticker}
              company={row.company}
              to={`/app/ticker/${row.ticker}`}
              primary={fmtMoney(row.price ?? row.current_price)}
              secondary={
                <span className={pnlColor(row.change_percent)}>
                  {fmtPercent(row.change_percent)}
                </span>
              }
            />
          ))}
        </div>
      )}
    </Panel>
  )
}
