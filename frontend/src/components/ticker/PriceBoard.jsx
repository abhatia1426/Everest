import { CandlestickChart, LineChart } from 'lucide-react'

import { PriceChart } from '../PriceChart'
import { EmptyState, Skeleton } from '../States'
import { CompanyLogo } from '../ui/CompanyLogo'
import { MarketStatus } from '../ui/MarketStatus'
import { Segmented } from '../ui/Segmented'
import { Surface } from '../ui/Surface'
import { QuoteBadge } from '../ui/QuoteBadge'
import { WatchlistButton } from '../ui/WatchlistButton'
import { normalizeQuote } from '../../lib/quotes'
import { fmtCompact, fmtMoney, fmtPercent, fmtSignedMoney } from '../../lib/format'

const RANGES = ['1D', '1W', '1M', '3M', '1Y', 'MAX']
const CHART_TYPES = [
  { value: 'candlestick', label: 'Candles' },
  { value: 'line', label: 'Line' },
]

/**
 * The price board — identity, quote, controls and chart as ONE instrument.
 *
 * v2 split these across two full-width glass cards: a hero header carrying the
 * price, then a separate chart card below it. That put a card boundary between
 * a number and the graph of that same number, which is the one relationship on
 * this page that should never be broken. Reading the move meant crossing a
 * border and re-establishing context.
 *
 * The session figures (open, prev close, volume, day range) sit UNDER the
 * chart rather than beside the price: they are what you check after reading
 * the trend, not before.
 */
export function PriceBoard({
  symbol,
  company,
  sector,
  quote,
  candles,
  range,
  onRangeChange,
  chartType,
  onChartTypeChange,
  historyLoading,
  quoteLoading,
  watchlist,
  onToggleWatch,
}) {
  const up = (quote?.change ?? 0) >= 0
  // Single interpretation, shared with every other surface (see lib/quotes).
  const view = normalizeQuote(quote)
  const priceKnown = !view.unavailable && view.price !== null

  return (
    <Surface className="overflow-hidden">
      {/* ---------------------------------------------------- identity */}
      <div
        className="flex flex-wrap items-start justify-between gap-4 border-b px-5 py-4"
        style={{ borderColor: 'var(--border)' }}
      >
        <div className="flex min-w-0 items-center gap-3">
          <CompanyLogo ticker={symbol} name={company} size={40} />
          <div className="min-w-0">
            <div className="flex flex-wrap items-baseline gap-2">
              <h1 className="t-page-title truncate">{company}</h1>
              <span className="num text-[13px] font-semibold text-text-tertiary">{symbol}</span>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-text-tertiary">
              <MarketStatus />
              {sector ? <span>{sector}</span> : null}
              {quote?.exchange ? <span>· {quote.exchange}</span> : null}
            </div>
          </div>
        </div>

        <WatchlistButton
          ticker={symbol}
          watched={watchlist.isWatched(symbol)}
          busy={watchlist.pending === symbol}
          onToggle={onToggleWatch}
        />
      </div>

      {/* ------------------------------------------------------- quote */}
      <div className="flex flex-wrap items-end justify-between gap-4 px-5 pb-4 pt-5">
        <div>
          {quoteLoading && !quote ? (
            <Skeleton className="h-10 w-44" />
          ) : (
            <div className="flex flex-wrap items-baseline gap-3">
              <span className="num-hero text-[clamp(1.875rem,3.4vw,2.5rem)] text-text-primary">
                {priceKnown ? fmtMoney(view.price) : '—'}
              </span>
              {priceKnown ? (
                <span
                  className={`num text-[15px] font-bold ${up ? 'text-up' : 'text-down'}`}
                >
                  {fmtSignedMoney(quote?.change)}
                  <span className="ml-1.5">{fmtPercent(quote?.change_percent)}</span>
                </span>
              ) : (
                <span className="text-[12px] text-text-tertiary">Live price unavailable</span>
              )}
              <QuoteBadge quote={view} />
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Segmented
            label="Chart type"
            size="sm"
            value={chartType}
            onChange={onChartTypeChange}
            options={CHART_TYPES.map((type) => ({
              value: type.value,
              label: (
                <span className="flex items-center gap-1.5">
                  {type.value === 'candlestick' ? (
                    <CandlestickChart size={12} />
                  ) : (
                    <LineChart size={12} />
                  )}
                  {type.label}
                </span>
              ),
            }))}
          />
          <Segmented
            label="Time range"
            size="sm"
            options={RANGES}
            value={range}
            onChange={onRangeChange}
          />
        </div>
      </div>

      {/* ------------------------------------------------------- chart */}
      <div className="px-2 pb-2">
        {historyLoading && candles.length === 0 ? (
          <Skeleton className="h-[380px] w-full rounded-panel" />
        ) : candles.length < 2 ? (
          <EmptyState
            title="No price history"
            description={`No ${range} data available for ${symbol} right now.`}
          />
        ) : (
          <PriceChart candles={candles} type={chartType} height={380} />
        )}
      </div>

      {/* ----------------------------------------------------- session */}
      <div
        className="grid grid-cols-2 gap-x-6 gap-y-3 border-t px-5 py-4 sm:grid-cols-4"
        style={{ borderColor: 'var(--border)' }}
      >
        {[
          ['Open', fmtMoney(quote?.open)],
          ['Prev close', fmtMoney(quote?.previous_close)],
          ['Volume', fmtCompact(quote?.volume)],
          [
            'Day range',
            quote?.day_low && quote?.day_high
              ? `${fmtMoney(quote.day_low)} – ${fmtMoney(quote.day_high)}`
              : '—',
          ],
        ].map(([label, value]) => (
          <div key={label} className="min-w-0">
            <p className="t-eyebrow">{label}</p>
            <p className="num mt-1 truncate text-[12.5px] font-semibold text-text-primary">
              {value}
            </p>
          </div>
        ))}
      </div>
    </Surface>
  )
}
