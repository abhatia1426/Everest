import { useCallback } from 'react'
import { Link } from 'react-router-dom'

import { Skeleton } from './States'
import { MarketStatus } from './ui/MarketStatus'
import { useApi } from '../hooks/useApi'
import { bookStateLabel, useBookState } from '../hooks/useBookState'
import { TTL } from '../lib/cache'
import { api } from '../lib/api'
import { fmtNumber, fmtPercent, pnlColor } from '../lib/format'

/**
 * Tier two of the chrome: where you are, what the market is doing, and how
 * much the figures below can be trusted.
 *
 * Deliberately NOT a second navbar. It is one 11px line on the page
 * background with a hairline under it — no card, no fill, no controls. The
 * previous MarketStrip was the dashboard's first element and spent a full band
 * of vertical space saying the same four numbers; folding it into the chrome
 * buys that space back and makes market context persistent across routes
 * rather than a thing you lose the moment you open a holding.
 */
const INDEXES = [
  { ticker: 'SPY', label: 'S&P' },
  { ticker: 'QQQ', label: 'Nasdaq' },
  { ticker: 'DIA', label: 'Dow' },
  { ticker: 'IWM', label: 'Russell' },
]

const SYMBOLS = INDEXES.map((index) => index.ticker)

/**
 * Book confidence, once, for the whole page.
 *
 * Renders nothing when quotes are live — the same rule QuoteBadge follows, for
 * the same reason: a permanent "everything is fine" chip trains the eye to
 * ignore the spot where the warning will eventually appear.
 */
function BookProvenance() {
  const book = useBookState()
  const label = book ? bookStateLabel(book.state) : null
  if (!label) return null

  const detail =
    book.positionCount > 0
      ? `${label} · ${book.positionCount} holding${book.positionCount === 1 ? '' : 's'}`
      : label

  return (
    <span
      className="inline-flex shrink-0 items-center gap-1.5 text-[11px] font-semibold text-text-tertiary"
      title={`Portfolio figures reflect: ${detail.toLowerCase()}`}
    >
      <span className="inline-block h-[5px] w-[5px] rounded-full bg-warn/70" aria-hidden="true" />
      {label}
    </span>
  )
}

export function MarketRail({ title }) {
  const fetcher = useCallback(() => api.prices(SYMBOLS), [])
  // Same 30s cadence as the portfolio poll, so the whole screen ages together.
  const { data, loading } = useApi(fetcher, [], {
    key: 'quote:indexes',
    ttl: TTL.QUOTE,
    pollMs: 30000,
  })

  const quotes = data?.quotes || {}

  return (
    <div className="scroll-none flex items-center gap-x-4 gap-y-1 overflow-x-auto whitespace-nowrap py-2">
      <h1 className="shrink-0 text-[13px] font-semibold text-text-primary">{title}</h1>

      <span className="hairline h-4 w-px shrink-0" aria-hidden="true" />

      <MarketStatus />

      <div className="flex items-center gap-x-4">
        {INDEXES.map(({ ticker, label }) => {
          const quote = quotes[ticker]

          return (
            <Link
              key={ticker}
              to={`/app/ticker/${ticker}`}
              className="group flex shrink-0 items-baseline gap-1.5 text-[11px]
                transition-opacity duration-150 hover:opacity-75"
            >
              <span className="font-semibold text-text-tertiary">{label}</span>
              {loading && !quote ? (
                <Skeleton className="h-2.5 w-10" />
              ) : (
                <>
                  <span className="num font-semibold text-text-secondary">
                    {fmtNumber(quote?.price, 2)}
                  </span>
                  <span className={`num font-bold ${pnlColor(quote?.change_percent)}`}>
                    {fmtPercent(quote?.change_percent)}
                  </span>
                </>
              )}
            </Link>
          )
        })}
      </div>

      {/* Pushed to the far edge: it annotates the page, not the indexes. */}
      <span className="ml-auto shrink-0 pl-4">
        <BookProvenance />
      </span>
    </div>
  )
}
