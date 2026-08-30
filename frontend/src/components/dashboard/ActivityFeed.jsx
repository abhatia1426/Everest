import { Link } from 'react-router-dom'
import { Briefcase, Eye, Layers } from 'lucide-react'

import { Skeleton } from '../States'
import { Panel } from '../ui/Surface'
import { fmtMoney, fmtNumber, fmtRelative } from '../../lib/format'

const META = {
  position_added: { icon: Briefcase, verb: 'Added position' },
  option_added: { icon: Layers, verb: 'Added contract' },
  watchlist_added: { icon: Eye, verb: 'Watchlisted' },
}

/**
 * Recent activity as a timeline rather than a list of rows.
 *
 * The connecting rule and small dot cost less ink than v2's 36px bordered icon
 * tile per event, and they encode something the tile did not: that these
 * entries are sequential. In the narrowest column on the page, that trade is
 * worth making.
 */
function eventDetail(event) {
  if (event.type === 'position_added' && event.detail?.qty) {
    return `${fmtNumber(event.detail.qty, 2)} @ ${fmtMoney(event.detail.avg_cost)}`
  }
  if (event.type === 'option_added' && event.detail?.strike) {
    return `${event.detail.type} $${event.detail.strike} · ${event.detail.expiry}`
  }
  return null
}

export function ActivityFeed({ events = [], loading }) {
  return (
    <Panel title="Activity">
      {loading ? (
        <div className="space-y-3">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-9 w-full rounded-panel" />
          ))}
        </div>
      ) : events.length === 0 ? (
        <p className="px-1 py-10 text-center text-[13px] text-text-secondary">
          Your activity appears here as you add positions, contracts and watchlist tickers.
        </p>
      ) : (
        <ul className="relative space-y-4">
          {/* The spine. Inset to align with the dot centres. */}
          <span
            aria-hidden="true"
            className="absolute bottom-2 left-[3px] top-2 w-px"
            style={{ background: 'var(--border)' }}
          />

          {events.slice(0, 6).map((event) => {
            const meta = META[event.type] || META.position_added
            const Icon = meta.icon
            const detail = eventDetail(event)

            return (
              <li key={`${event.type}-${event.id}`} className="relative pl-5">
                <span
                  aria-hidden="true"
                  className="absolute left-0 top-1.5 h-[7px] w-[7px] rounded-full"
                  style={{
                    background: 'var(--e2-bg)',
                    border: '1.5px solid var(--text-tertiary)',
                  }}
                />

                <Link
                  to={`/app/ticker/${event.ticker}`}
                  className="block transition-opacity duration-150 hover:opacity-80"
                >
                  <div className="flex items-baseline gap-1.5">
                    <Icon size={11} className="shrink-0 translate-y-px text-text-tertiary" />
                    <span className="num text-[12px] font-semibold text-text-primary">
                      {event.ticker}
                    </span>
                    {event.mode === 'paper' ? (
                      <span className="rounded bg-warn/12 px-1 py-px text-[9px] font-bold text-warn">
                        PAPER
                      </span>
                    ) : null}
                    <span className="ml-auto shrink-0 text-[10px] text-text-tertiary">
                      {fmtRelative(event.at)}
                    </span>
                  </div>

                  <p className="mt-0.5 truncate text-[11px] text-text-secondary">
                    {meta.verb}
                    {detail ? <span className="num"> · {detail}</span> : null}
                  </p>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </Panel>
  )
}
