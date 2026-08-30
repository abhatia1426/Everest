import { useCallback } from 'react'
import { Link } from 'react-router-dom'

import { MarketStatus } from '../ui/MarketStatus'
import { Skeleton } from '../States'
import { useApi } from '../../hooks/useApi'
import { TTL } from '../../lib/cache'
import { api } from '../../lib/api'
import { fmtNumber, fmtPercent, pnlColor } from '../../lib/format'

/**
 * Market context, above everything.
 *
 * Deliberately NOT a card. A dashboard's first line should orient you — is the
 * market open, and what is it doing — before it tells you about yourself, and
 * giving that a card would make it compete with the portfolio value directly
 * beneath. A hairline strip reads as a status bar, which is the correct weight.
 */
const INDEXES = [
  { ticker: 'SPY', label: 'S&P 500' },
  { ticker: 'QQQ', label: 'Nasdaq 100' },
  { ticker: 'DIA', label: 'Dow 30' },
  { ticker: 'IWM', label: 'Russell 2000' },
]

const SYMBOLS = INDEXES.map((index) => index.ticker)

export function MarketStrip() {
  const fetcher = useCallback(() => api.prices(SYMBOLS), [])
  // Same 30s cadence as the portfolio poll, so the whole page ages together.
  const { data, loading } = useApi(fetcher, [], { key: 'quote:indexes', ttl: TTL.QUOTE, pollMs: 30000 })

  const quotes = data?.quotes || {}

  return (
    <div
      className="flex flex-wrap items-center gap-x-5 gap-y-2 border-b pb-3"
      style={{ borderColor: 'var(--border)' }}
    >
      <MarketStatus />

      <div className="flex flex-1 flex-wrap items-center gap-x-5 gap-y-2">
        {INDEXES.map(({ ticker, label }) => {
          const quote = quotes[ticker]
          const change = quote?.change_percent

          return (
            <Link
              key={ticker}
              to={`/app/ticker/${ticker}`}
              className="group flex items-baseline gap-2 text-[11px] transition-opacity
                duration-150 hover:opacity-80"
            >
              <span className="font-semibold text-text-secondary">{label}</span>

              {loading && !quote ? (
                <Skeleton className="h-3 w-14" />
              ) : (
                <>
                  <span className="num font-semibold text-text-primary">
                    {fmtNumber(quote?.price, 2)}
                  </span>
                  <span className={`num font-bold ${pnlColor(change)}`}>
                    {fmtPercent(change)}
                  </span>
                </>
              )}
            </Link>
          )
        })}
      </div>
    </div>
  )
}
