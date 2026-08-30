import { Link } from 'react-router-dom'
import { Pin, Trash2 } from 'lucide-react'

import { Sparkline } from '../Sparkline'
import { CompanyLogo } from '../ui/CompanyLogo'
import { QuoteBadge } from '../ui/QuoteBadge'
import { normalizeQuote } from '../../lib/quotes'
import { displayName, equityOrFallback } from '../../lib/equitySource'
import { fmtMoney, fmtPercent } from '../../lib/format'

/**
 * A monitor tile.
 *
 * The watchlist's job is scanning — reading twelve symbols for movement in one
 * sweep — not studying one. So the tile is compact enough to fit four across,
 * and inside it the SPARKLINE and the CHANGE carry the weight, because those
 * answer "is anything happening here". The absolute price is subordinate: you
 * rarely scan a watchlist to learn that AAPL costs $178.
 *
 * v2's card was ~270px tall with a 320x56 sparkline and a market-status badge
 * repeated in every tile, so a twelve-symbol list became three screens of
 * scrolling and the session status was stated twelve times. Market status now
 * lives once, in the page header.
 */
export function MonitorTile({ item, pinned, onTogglePin, onRemove, removing }) {
  // Local reference data fills the gaps a quote leaves when it is unavailable.
  const reference = equityOrFallback(item.ticker)
  const company = displayName(item.ticker, item.company, reference.name)
  const sector = item.sector && item.sector !== 'Unknown' ? item.sector : reference.sector

  const view = normalizeQuote(item)
  const priceKnown = !view.unavailable && view.price !== null
  const up = (item.change_percent ?? 0) >= 0

  return (
    <div className="card-interactive group relative h-full overflow-hidden">
      <Link
        to={`/app/ticker/${item.ticker}`}
        className="block p-3.5"
        aria-label={`${company} (${item.ticker})`}
      >
        <div className="flex items-start gap-2.5">
          <CompanyLogo ticker={item.ticker} name={company} size={28} />
          <div className="min-w-0 flex-1 pr-12">
            <p className="num truncate text-[13px] font-semibold text-text-primary">
              {item.ticker}
            </p>
            <p className="truncate text-[11px] text-text-secondary">{company}</p>
          </div>
        </div>

        <div className="mt-3 flex items-baseline gap-2">
          <span className="num text-[19px] font-semibold leading-none text-text-primary">
            {priceKnown ? fmtMoney(view.price) : '—'}
          </span>
          {priceKnown ? (
            <span className={`num text-[12px] font-bold ${up ? 'text-up' : 'text-down'}`}>
              {fmtPercent(item.change_percent)}
            </span>
          ) : (
            <span className="text-[10px] text-text-tertiary">No quote</span>
          )}
        </div>

        {/* Full-bleed to the tile edges: the trend line is the scannable
            element, so it gets the width rather than sharing the padding. */}
        <div className="-mx-3.5 mt-3">
          <Sparkline data={item.sparkline} width={280} height={38} positive={up} />
        </div>

        <div className="mt-2.5 flex items-center justify-between gap-2">
          <p className="truncate text-[10px] text-text-tertiary">{sector || '—'}</p>
          <QuoteBadge quote={view} showIcon={false} />
        </div>
      </Link>

      {/* Actions sit above the link, revealed on hover/focus. Pin stays visible
          when active, because a pinned state must be readable at rest. */}
      <div className="absolute right-1.5 top-1.5 flex gap-0.5">
        <button
          type="button"
          aria-label={pinned ? `Unpin ${item.ticker}` : `Pin ${item.ticker}`}
          aria-pressed={pinned}
          onClick={onTogglePin}
          className={`grid h-8 w-8 cursor-pointer place-items-center rounded-control
            transition-all duration-150 hover:bg-tint/[0.08] focus-visible:opacity-100 ${
              pinned
                ? 'text-accent opacity-100'
                : 'text-text-tertiary opacity-0 group-hover:opacity-100'
            }`}
        >
          <Pin size={13} fill={pinned ? 'currentColor' : 'none'} />
        </button>

        <button
          type="button"
          aria-label={`Remove ${item.ticker} from watchlist`}
          disabled={removing}
          onClick={onRemove}
          className="btn-danger h-8 w-8 cursor-pointer p-0 opacity-0 transition-opacity
            duration-150 focus-visible:opacity-100 group-hover:opacity-100"
        >
          <Trash2 size={13} />
        </button>
      </div>
    </div>
  )
}
