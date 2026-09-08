import { useCallback, useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { ExternalLink, Plus, Sparkles } from 'lucide-react'

import { AddOptionModal } from '../../components/AddOptionModal'
import { ThesisResult } from '../../components/AIResults'
import { SentimentBadge } from '../../components/Controls'
import { EmptyState, ErrorState, InlineLoader, Notice, Skeleton } from '../../components/States'
import { SecurityChart } from '../../components/chart/SecurityChart'
import { AddPositionModal } from '../../components/portfolio/AddPositionModal'
import { FiftyTwoWeekGauge } from '../../components/ticker/FiftyTwoWeekGauge'
import { KeyStats } from '../../components/ticker/KeyStats'
import { AboutCompany } from '../../components/ticker/PositionSummary'
import { SecurityIdentity } from '../../components/ticker/SecurityIdentity'
import { TickerRail } from '../../components/ticker/TickerRail'
import { WorkstationRail } from '../../components/ticker/WorkstationRail'
import { Segmented } from '../../components/ui/Segmented'
import { Surface } from '../../components/ui/Surface'
import { OptionsTable } from './Options'
import { useApi } from '../../hooks/useApi'
import { TTL, invalidate, peek } from '../../lib/cache'
import { useMode } from '../../hooks/useMode'
import { useSessionHistory } from '../../hooks/useSessionHistory'
import { useToast } from '../../components/ui/Toast'
import { useWatchlist } from '../../hooks/useWatchlist'
import { api } from '../../lib/api'
import { displayName, equityOrFallback } from '../../lib/equitySource'
import { fmtDate, fmtMoney, fmtPercent, fmtSignedMoney } from '../../lib/format'
import { getMarketStatus } from '../../lib/marketStatus'
import { buildMonitorRow, withAttention } from '../../lib/monitor'
import { buildBook } from '../../lib/portfolio'
import {
  CHART_PERIODS,
  clipToPeriod,
  describeWindow,
  fiftyTwoWeekFrame,
  hasRealOhlc,
  periodFor,
  priceDomain,
  windowReturn,
} from '../../lib/priceSeries'
import { normalizeQuote } from '../../lib/quotes'

const RESEARCH_TABS = ['News', 'AI Thesis', 'Options']

/* -------------------------------------------------------------------- news */

const NEWS_EMPTY_COPY = {
  no_articles: (symbol) => ({
    title: 'No recent coverage',
    description: `Nothing published about ${symbol} right now.`,
  }),
  provider_unavailable: () => ({
    title: 'News unavailable',
    description: 'Unable to retrieve company news right now.',
  }),
  not_configured: () => ({
    title: 'News unavailable',
    description: 'Unable to retrieve company news right now.',
  }),
}

function NewsTab({ symbol }) {
  const fetcher = useCallback(() => api.news(symbol), [symbol])
  const { data, loading, error, refetch } = useApi(fetcher, [symbol], {
    key: `news:${symbol}`,
    ttl: TTL.NEWS,
  })

  if (loading) return <InlineLoader />
  if (error) return <ErrorState error={error} onRetry={refetch} />

  const articles = data?.articles || []
  if (articles.length === 0) {
    const copy = (NEWS_EMPTY_COPY[data?.status] || NEWS_EMPTY_COPY.no_articles)(symbol)
    return <EmptyState title={copy.title} description={copy.description} />
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2 text-[11px] text-text-secondary">
        <span>Sentiment across {articles.length} articles</span>
        <SentimentBadge sentiment="positive" />
        <span className="num font-semibold">{data.counts.positive}</span>
        <SentimentBadge sentiment="neutral" />
        <span className="num font-semibold">{data.counts.neutral}</span>
        <SentimentBadge sentiment="negative" />
        <span className="num font-semibold">{data.counts.negative}</span>
      </div>

      <ul className="divide-y" style={{ borderColor: 'var(--border)' }}>
        {articles.map((article, index) => (
          <li key={article.url || index}>
            <a
              href={article.url}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex gap-4 py-3.5 transition-opacity duration-150 hover:opacity-85"
            >
              <div className="min-w-0 flex-1">
                <div className="mb-1.5 flex flex-wrap items-center gap-2 text-[11px] text-text-tertiary">
                  <SentimentBadge sentiment={article.sentiment} />
                  <span>{article.source}</span>
                  <span>· {fmtDate(article.published_at)}</span>
                </div>
                <h3
                  className="text-[13.5px] font-semibold leading-snug text-text-primary
                    transition-colors duration-150 group-hover:text-accent"
                >
                  {article.title}
                </h3>
                {article.description ? (
                  <p className="mt-1 line-clamp-2 text-[12px] leading-relaxed text-text-secondary">
                    {article.description}
                  </p>
                ) : null}
              </div>
              <ExternalLink
                size={14}
                className="mt-1 shrink-0 text-text-tertiary transition-colors duration-150
                  group-hover:text-accent"
              />
            </a>
          </li>
        ))}
      </ul>
    </div>
  )
}

/* ------------------------------------------------------------------ thesis */

function ThesisTab({ symbol }) {
  const [direction, setDirection] = useState('long')
  const [target, setTarget] = useState('')
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  const generate = async () => {
    setError(null)
    setLoading(true)
    setResult(null)
    try {
      setResult(
        await api.aiThesis({
          ticker: symbol,
          direction,
          price_target: target ? Number(target) : null,
          include_news: true,
        }),
      )
    } catch (err) {
      setError(err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end gap-4">
        <div>
          <span className="label">Direction</span>
          <Segmented
            label="Thesis direction"
            options={[
              { value: 'long', label: 'Long' },
              { value: 'short', label: 'Short' },
            ]}
            value={direction}
            onChange={setDirection}
          />
        </div>
        <div className="w-36">
          <label htmlFor="thesis-target" className="label">
            Price target
          </label>
          <input
            id="thesis-target"
            type="number"
            step="any"
            min="0"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            placeholder="Optional"
            className="input"
          />
        </div>
        <button
          type="button"
          onClick={generate}
          disabled={loading}
          className="btn-primary cursor-pointer"
        >
          <Sparkles size={15} />
          {loading ? 'Climbing the data...' : 'Generate thesis'}
        </button>
      </div>

      {error ? <ErrorState error={error} compact /> : null}
      {loading ? <InlineLoader variant="ai" /> : null}
      {result ? <ThesisResult result={result} /> : null}
      {!loading && !result && !error ? (
        <EmptyState
          icon={Sparkles}
          title="No thesis yet"
          description={`Generate a Gemini-backed bull and bear case for ${symbol}, grounded in live quotes and recent headlines.`}
        />
      ) : null}
    </div>
  )
}

/* ----------------------------------------------------------------- options */

function OptionsTab({ symbol }) {
  const { mode } = useMode()
  const fetcher = useCallback(() => api.options({ mode, ticker: symbol }), [mode, symbol])
  const { data, loading, error, refetch } = useApi(fetcher, [mode, symbol], {
    key: `options:${mode}:${symbol}`,
    ttl: TTL.PORTFOLIO,
  })
  const [modalOpen, setModalOpen] = useState(false)

  const options = data?.options || []

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[13px] text-text-secondary">
          {mode === 'paper' ? 'Paper' : 'Real'} contracts on {symbol}
        </p>
        <button type="button" onClick={() => setModalOpen(true)} className="btn-ghost cursor-pointer">
          <Plus size={15} />
          Add contract
        </button>
      </div>

      {loading ? (
        <InlineLoader />
      ) : error ? (
        <ErrorState error={error} onRetry={refetch} />
      ) : options.length === 0 ? (
        <EmptyState title="No contracts here" description={`You have no ${mode} options on ${symbol}.`} />
      ) : (
        <div className="overflow-hidden rounded-panel border" style={{ borderColor: 'var(--border)' }}>
          <OptionsTable options={options} onDeleted={() => refetch({ silent: true })} dense />
        </div>
      )}

      <AddOptionModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onAdded={() => {
          invalidate('options')
          refetch({ silent: true, force: true })
        }}
        lockedTicker={symbol}
      />
    </div>
  )
}

/* --------------------------------------------------------------- workstation */

/**
 * The chart panel — the page's dominant object.
 *
 * Toolbar, plot, 52-week gauge, axis, and a return strip across the horizons.
 * Everything it states is measured from the SAME clipped series the plot draws,
 * so the pill, the line, the percentage, the caption and the axis labels cannot
 * describe different windows.
 */
function ChartWorkstation({
  symbol,
  candles,
  period,
  periodKey,
  onPeriod,
  mode,
  onMode,
  candlesSupported,
  price,
  avgCost,
  showCost,
  onToggleCost,
  held,
  frame,
  loading,
  horizons,
}) {
  const change = useMemo(() => windowReturn(candles), [candles])
  const caption = useMemo(() => describeWindow(candles, period), [candles, period])
  const domain = useMemo(
    () => priceDomain(candles, { candleMode: mode === 'candle' }),
    [candles, mode],
  )

  const up = (change?.percent ?? 0) >= 0
  const changeColor =
    change === null
      ? 'var(--text-tertiary)'
      : up
        ? 'var(--accent-green)'
        : 'var(--accent-red)'

  return (
    <div
      data-chartpanel
      className="flex min-h-[560px] min-w-0 flex-col overflow-hidden max-[760px]:min-h-0"
      style={{
        padding: '14px 16px',
        borderRadius: 'var(--radius-surface)',
        background: 'var(--panel-bg)',
        boxShadow: 'var(--shadow-surface)',
      }}
    >
      <div data-toolbar className="mb-3 flex shrink-0 items-center gap-2.5 max-[760px]:flex-wrap">
        <div className="flex shrink-0 items-baseline gap-[9px]">
          <span
            className="num font-display text-[18px] font-bold tracking-[-0.04em]"
            style={{ color: changeColor }}
          >
            {change === null ? '—' : fmtPercent(change.percent)}
          </span>
          {change === null ? null : (
            <span
              className="num text-[11.5px] font-semibold opacity-80"
              style={{ color: changeColor }}
            >
              {fmtSignedMoney(change.absolute)}
            </span>
          )}
          <span className="text-[11.5px] text-text-tertiary">
            {caption || 'no history for this range'}
          </span>
        </div>

        <div className="flex-1" />

        {/* The cost overlay toggle exists only where there is a cost to show. */}
        {held && typeof avgCost === 'number' ? (
          <button
            type="button"
            onClick={onToggleCost}
            aria-pressed={showCost}
            className="flex shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-full
              text-[11px] font-bold transition-colors duration-150"
            style={{
              padding: '5px 10px',
              background: showCost
                ? 'color-mix(in oklab, var(--accent-blue) 16%, transparent)'
                : 'transparent',
              border: `1px solid ${showCost ? 'var(--accent-blue)' : 'var(--border-strong)'}`,
              color: showCost ? 'var(--accent-blue)' : 'var(--text-tertiary)',
            }}
          >
            <span className="w-3" style={{ borderTop: '2px dashed currentColor' }} aria-hidden="true" />
            My cost {fmtMoney(avgCost)}
          </button>
        ) : null}

        <div
          className="flex shrink-0 items-center gap-0.5 rounded-full"
          style={{ padding: 3, background: 'var(--nested-bg)' }}
          role="radiogroup"
          aria-label="Chart style"
        >
          {[
            ['candle', 'Candles'],
            ['line', 'Line'],
          ].map(([key, label]) => {
            // Candle mode is offered only where the bars genuinely carry a
            // range — see `hasRealOhlc`. Drawing candles from close-only data
            // would render a column of dashes implying flat sessions.
            const supported = key === 'line' || candlesSupported
            const on = supported && mode === key
            return (
              <button
                key={key}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => supported && onMode(key)}
                title={supported ? `Show ${label.toLowerCase()}` : 'These bars carry closes only'}
                className={`cursor-pointer rounded-full text-[11px] transition-colors duration-150
                  ${on ? 'font-bold text-text-primary' : 'font-medium text-text-tertiary hover:text-text-primary'}`}
                style={{
                  padding: '5px 10px',
                  background: on ? 'var(--panel-bg)' : 'transparent',
                  opacity: supported ? 1 : 0.4,
                }}
              >
                {label}
              </button>
            )
          })}
        </div>

        <div
          className="flex shrink-0 items-center gap-0.5 rounded-full"
          style={{ padding: 3, background: 'var(--nested-bg)' }}
          role="radiogroup"
          aria-label="Time range"
        >
          {CHART_PERIODS.map((option) => {
            const on = option.key === periodKey
            return (
              <button
                key={option.key}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => onPeriod(option.key)}
                className={`cursor-pointer rounded-full text-[11.5px] transition-colors duration-150
                  ${on ? 'font-bold text-text-primary' : 'font-medium text-text-tertiary hover:text-text-primary'}`}
                style={{ padding: '5px 11px', background: on ? 'var(--panel-bg)' : 'transparent' }}
              >
                {option.key}
              </button>
            )
          })}
        </div>
      </div>

      <div
        data-plotrow
        className="flex min-h-[400px] flex-1 items-stretch gap-2.5 max-[760px]:min-h-[320px]"
      >
        {loading && candles.length === 0 ? (
          <Skeleton className="h-full min-h-[300px] w-full rounded-nested" />
        ) : (
          <SecurityChart
            candles={candles}
            period={period}
            mode={mode}
            price={price}
            avgCost={avgCost}
            showCost={showCost && held}
            minHeight={300}
          />
        )}

        {/* The gauge drops below 1060px, where 62px of it would cost the plot
            more than the context is worth on that width. */}
        <FiftyTwoWeekGauge
          frame={frame}
          price={price}
          windowLow={domain?.dataMin ?? price}
          windowHigh={domain?.dataMax ?? price}
          up={up}
          periodKey={periodKey}
        />
      </div>

      <div
        className="mt-[11px] flex shrink-0 flex-wrap items-center gap-3.5 pt-[11px]"
        style={{ boxShadow: '0 -1px 0 var(--border)' }}
      >
        <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-text-tertiary">
          Return
        </span>
        {horizons.map((horizon) => {
          const on = horizon.key === periodKey
          return (
            <button
              key={horizon.key}
              type="button"
              onClick={() => onPeriod(horizon.key)}
              className="flex cursor-pointer items-baseline gap-1.5 rounded-[8px] transition-colors duration-150 hover:bg-tint/[0.045]"
              style={{
                padding: '4px 9px',
                background: on ? 'var(--nested-bg)' : 'transparent',
                boxShadow: on ? 'inset 0 0 0 1px var(--border-strong)' : 'none',
              }}
            >
              <span
                className="text-[10.5px] font-bold"
                style={{ color: on ? 'var(--text-primary)' : 'var(--text-tertiary)' }}
              >
                {horizon.key}
              </span>
              {/* Only horizons whose series is already in hand carry a figure.
                  A blank one is not zero — it is unfetched. */}
              <span
                className="num font-display text-[12px] font-bold tracking-[-0.03em]"
                style={{
                  color:
                    horizon.percent === null
                      ? 'var(--text-tertiary)'
                      : horizon.percent >= 0
                        ? 'var(--accent-green)'
                        : 'var(--accent-red)',
                }}
              >
                {horizon.percent === null ? '—' : fmtPercent(horizon.percent)}
              </span>
            </button>
          )
        })}

        <div className="flex-1" />

        <span
          data-gaugelegend
          className="flex items-center gap-1.5 whitespace-nowrap text-[10.5px] text-text-tertiary max-[1340px]:hidden"
        >
          <span
            className="h-[9px] w-[9px] rounded-[2px]"
            style={{
              background: up ? 'var(--up-soft)' : 'var(--down-soft)',
              boxShadow: `0 0 0 1px ${up ? 'color-mix(in oklab, var(--accent-green) 45%, transparent)' : 'color-mix(in oklab, var(--accent-red) 45%, transparent)'}`,
            }}
            aria-hidden="true"
          />
          Lit band on the 52-week gauge is the period shown
        </span>

        <span className="text-[10.5px] text-text-tertiary">
          {mode === 'candle' ? `${symbol} open, high, low, close` : `${symbol} closes`}
        </span>
      </div>
    </div>
  )
}

/* -------------------------------------------------------------------- page */

/**
 * Ticker Detail, composed to the approved `Everest Ticker Detail.dc.html`.
 *
 * A SECURITY WORKSTATION, not a profile page. The composition says so:
 *
 *   1. a contextual ticker rail for security-to-security movement
 *   2. the identity bar — who, what price, how fresh, and the two real actions
 *   3. the work grid: the chart panel at `minmax(0,1fr)` against a
 *      `minmax(316px,.34fr)` reference rail, stacking at 1260px
 *   4. beneath it, subordinate: the research the product already does
 *
 * The chart is deliberately the largest object on the page and the only one
 * that grows with the viewport.
 *
 * WHAT THIS PAGE WILL NOT DO. No alerts — Everest has no alert system. No sell,
 * no lots, no trade execution: positions are blended and nothing here places an
 * order. No indicators, ratings, targets or earnings markers, because none of
 * them are backed by data the product holds. Where a figure cannot be measured
 * the geometry stays and the value is an em dash.
 */
export default function TickerDetail() {
  const { symbol: raw } = useParams()
  const symbol = (raw || '').toUpperCase()

  const [periodKey, setPeriodKey] = useState('1M')
  const [mode, setMode] = useState('candle')
  const [showCost, setShowCost] = useState(true)
  const [tab, setTab] = useState('News')
  const [addOpen, setAddOpen] = useState(false)
  const [removing, setRemoving] = useState(false)

  const period = periodFor(periodKey)
  const { mode: book } = useMode()
  const watchlist = useWatchlist()
  const toast = useToast()
  const researchRef = useRef(null)
  const session = getMarketStatus()

  /* ------------------------------------------------------------- fetching */

  const quoteFetcher = useCallback(() => api.prices([symbol]), [symbol])
  const {
    data: quoteData,
    loading: quoteLoading,
    error: quoteError,
    refetch,
  } = useApi(quoteFetcher, [symbol], { key: `quote:${symbol}`, ttl: TTL.QUOTE, pollMs: 30000 })

  const profileFetcher = useCallback(() => api.profile(symbol), [symbol])
  const { data: profile } = useApi(profileFetcher, [symbol], {
    key: `profile:${symbol}`,
    ttl: TTL.PROFILE,
  })

  // The selected window. Cached per symbol+period, and the SAME key the
  // Watchlist stage uses, so arriving here from a preview costs no refetch.
  const historyFetcher = useCallback(() => api.history(symbol, period.api), [symbol, period.api])
  const { data: historyData, loading: historyLoading } = useApi(
    historyFetcher,
    [symbol, period.api],
    { key: `history:${symbol}:${period.api}`, ttl: TTL.HISTORY },
  )

  // Today's bars, for the session's traded volume. This provider's quote
  // payload carries no volume field, so it is summed from real 5-minute bars
  // or left unavailable — never inferred.
  const dayFetcher = useCallback(() => api.history(symbol, '1d'), [symbol])
  const { data: dayData } = useApi(dayFetcher, [symbol], {
    key: `history:${symbol}:1d`,
    ttl: TTL.HISTORY,
  })

  // A year of daily bars: the fallback basis for the 52-week frame when the
  // provider does not report one as a fundamental.
  const yearFetcher = useCallback(() => api.history(symbol, '1y'), [symbol])
  const { data: yearData } = useApi(yearFetcher, [symbol], {
    key: `history:${symbol}:1y`,
    ttl: TTL.HISTORY,
  })

  const pnlFetcher = useCallback(() => api.pnl(book), [book])
  const { data: pnlData } = useApi(pnlFetcher, [book], {
    key: `pnl:${book}`,
    ttl: TTL.QUOTE,
    pollMs: 30000,
  })

  // The 30-session daily closes behind momentum, the normal day and the 30-day
  // range — through the same batched, cached loader the Watchlist board uses,
  // so the two pages cannot state different behaviour for this symbol.
  const sessionSymbols = useMemo(() => [symbol], [symbol])
  const { candlesFor } = useSessionHistory(sessionSymbols)

  /* -------------------------------------------------------------- derived */

  const quote = quoteData?.quotes?.[symbol]
  const view = useMemo(() => normalizeQuote(quote), [quote])

  const reference = equityOrFallback(symbol)
  const company = displayName(symbol, quote?.company, profile?.company, reference.name)
  // "Unknown" is the backend's placeholder for a sector it could not resolve —
  // rendering it as a chip would assert a classification that does not exist.
  const rawSector = quote?.sector || profile?.sector || reference.sector
  const sector = rawSector && rawSector !== 'Unknown' ? rawSector : null
  const industry = quote?.industry || profile?.industry || reference.industry
  const exchange = quote?.exchange || profile?.exchange || null

  /*
   * CLIP TO THE PILL. The history endpoint does not reliably honour its own
   * window — `?period=1m` has been observed returning five months of hourly
   * bars — and a "1M" pill above a five-month line is false regardless of what
   * the caption says. The series is cut to the requested window against its own
   * newest timestamp before anything is drawn or measured from it.
   */
  const candles = useMemo(
    () => clipToPeriod(historyData?.candles, period.days),
    [historyData, period.days],
  )

  const candlesSupported = useMemo(() => hasRealOhlc(candles), [candles])
  const effectiveMode = candlesSupported && mode === 'candle' ? 'candle' : 'line'

  const bookState = useMemo(() => buildBook(pnlData?.positions || []), [pnlData])
  const holding = useMemo(
    () => bookState.rows.find((row) => row.ticker === symbol) || null,
    [bookState, symbol],
  )

  const frame = useMemo(
    () =>
      fiftyTwoWeekFrame({
        quoteHigh: quote?.fifty_two_week_high,
        quoteLow: quote?.fifty_two_week_low,
        yearCandles: clipToPeriod(yearData?.candles, 366),
        price: view.price,
      }),
    [quote, yearData, view.price],
  )

  // The behavioural row, from the shared monitor definitions.
  const row = useMemo(
    () =>
      withAttention(
        buildMonitorRow(
          { id: symbol, ticker: symbol, company, sector },
          candlesFor(symbol),
          view,
        ),
      ),
    [symbol, company, sector, candlesFor, view],
  )

  const dayVolume = useMemo(() => {
    const bars = clipToPeriod(dayData?.candles, 1)
    if (bars.length === 0) return null
    const total = bars.reduce(
      (sum, bar) => sum + (typeof bar.volume === 'number' ? bar.volume : 0),
      0,
    )
    return total > 0 ? total : null
  }, [dayData])

  /*
   * Return by horizon.
   *
   * Each figure is measured over its OWN window and is never re-scaled from
   * another one. The series is taken, in order, from the cache entry that
   * horizon actually plots — so selecting it shows the identical number — and
   * otherwise from the year of daily closes already fetched for the 52-week
   * frame, clipped to the horizon. Both are real measurements of real closes;
   * neither costs an additional provider call.
   *
   * 5Y can only come from the ten-year series, which is fetched when the user
   * asks for it. Until then it is an em dash: unfetched, not zero.
   */
  const yearCandles = useMemo(() => yearData?.candles || [], [yearData])

  const horizons = useMemo(
    () =>
      CHART_PERIODS.filter((option) => option.key !== '1D').map((option) => {
        if (option.key === periodKey) {
          return { key: option.key, percent: windowReturn(candles)?.percent ?? null }
        }

        const cached = peek(`history:${symbol}:${option.api}`)?.data?.candles
        const source = cached && cached.length > 1 ? cached : yearCandles
        // The year cannot answer a five-year question; only its own series can.
        if (source === yearCandles && option.days > 366) return { key: option.key, percent: null }

        const clipped = clipToPeriod(source, option.days)
        return { key: option.key, percent: windowReturn(clipped)?.percent ?? null }
      }),
    [periodKey, candles, symbol, yearCandles],
  )

  /* -------------------------------------------------------------- actions */

  const toggleWatch = async () => {
    const wasWatched = watchlist.isWatched(symbol)
    await watchlist.toggle(symbol)
    toast.success(wasWatched ? `${symbol} removed from watchlist` : `${symbol} added to watchlist`)
  }

  const removePosition = async () => {
    if (!holding) return
    setRemoving(true)
    try {
      await api.deletePosition(holding.id)
      invalidate('portfolio')
      invalidate('pnl')
      invalidate('pfhist')
      invalidate('activity')
      toast.success(`${symbol} removed`, 'Everest has stopped tracking this holding.')
    } catch (err) {
      toast.error('Could not remove position', err.message)
    } finally {
      setRemoving(false)
    }
  }

  const jumpToResearch = useCallback((name) => {
    setTab(name)
    researchRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [])

  // The rail always carries the symbol being viewed, watched or not.
  const railItems = useMemo(() => {
    const items = watchlist.items || []
    if (items.some((item) => item.ticker === symbol)) return items
    return [{ ticker: symbol, change_percent: quote?.change_percent ?? null }, ...items]
  }, [watchlist.items, symbol, quote])

  // A new symbol is a new security: start it on the default window rather than
  // inheriting the last one's. Adjusted during render rather than in an effect
  // — React re-runs this component immediately with the corrected state and
  // never commits the stale frame, so there is no flash of the previous
  // symbol's period. An effect would paint first.
  const [lastSymbol, setLastSymbol] = useState(symbol)
  if (lastSymbol !== symbol) {
    setLastSymbol(symbol)
    setPeriodKey('1M')
    setTab('News')
  }

  if (quoteError && !quoteData) return <ErrorState error={quoteError} onRetry={refetch} />

  return (
    <div className="-mx-[18px] flex min-h-0 flex-col max-[760px]:-mx-3.5">
      <TickerRail symbol={symbol} items={railItems} />

      <SecurityIdentity
        symbol={symbol}
        company={company}
        sector={sector}
        exchange={exchange}
        quote={quote}
        view={view}
        session={session}
        loading={quoteLoading && !quoteData}
        watched={watchlist.isWatched(symbol)}
        watchBusy={watchlist.pending === symbol}
        onToggleWatch={toggleWatch}
        onAddPosition={() => setAddOpen(true)}
        held={Boolean(holding)}
      />

      {view.unavailable ? (
        <div className="px-[18px] pt-3 max-[760px]:px-3.5">
          <Notice tone="warn">
            Live market data for {symbol} is temporarily unavailable. Reference details still apply;
            prices and charts fill in once quotes return.
          </Notice>
        </div>
      ) : null}

      {/* The work grid — the approved proportions, stacking at 1260px. */}
      <div
        data-work
        className="grid gap-3 p-[12px_18px_18px] min-[1261px]:h-[760px]
          [grid-template-columns:minmax(0,1fr)_minmax(316px,0.34fr)]
          max-[1260px]:[grid-template-columns:minmax(0,1fr)]
          max-[760px]:p-[0_14px_14px]"
      >
        <ChartWorkstation
          symbol={symbol}
          candles={candles}
          period={period}
          periodKey={periodKey}
          onPeriod={setPeriodKey}
          mode={effectiveMode}
          onMode={setMode}
          candlesSupported={candlesSupported}
          price={view.price}
          avgCost={holding?.avgCost ?? null}
          showCost={showCost}
          onToggleCost={() => setShowCost((current) => !current)}
          held={Boolean(holding)}
          frame={frame}
          loading={historyLoading}
          horizons={horizons}
        />

        <WorkstationRail
          symbol={symbol}
          holding={holding}
          book={bookState}
          quote={quote}
          session={session}
          frame={frame}
          row={row}
          dayVolume={dayVolume}
          avgVolume={quote?.avg_volume ?? null}
          onAddPosition={() => setAddOpen(true)}
          onRemovePosition={removePosition}
          removing={removing}
          onJump={jumpToResearch}
        />
      </div>

      {/*
        RESEARCH, SUBORDINATE. News, the AI thesis and the options chain are
        real, working capabilities and they are kept — but beneath the
        workstation and behind one set of tabs, so the chart stays the page's
        subject. `Inspect next` in the rail is the way in.
      */}
      <div ref={researchRef} className="px-[18px] pb-[18px] max-[760px]:px-3.5">
        <Surface as="section" className="overflow-hidden">
          <div
            role="tablist"
            aria-label="Research sections"
            className="flex gap-1 overflow-x-auto border-b px-3"
            style={{ borderColor: 'var(--border)' }}
          >
            {RESEARCH_TABS.map((name) => {
              const active = tab === name
              return (
                <button
                  key={name}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setTab(name)}
                  className={`relative shrink-0 cursor-pointer px-3 py-3 text-[13px] font-semibold
                    transition-colors duration-150 ${
                      active ? 'text-text-primary' : 'text-text-secondary hover:text-text-primary'
                    }`}
                >
                  {name}
                  {active ? (
                    <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-accent" />
                  ) : null}
                </button>
              )
            })}
          </div>

          <div role="tabpanel" className="p-5">
            {tab === 'News' ? <NewsTab symbol={symbol} /> : null}
            {tab === 'AI Thesis' ? <ThesisTab symbol={symbol} /> : null}
            {tab === 'Options' ? <OptionsTab symbol={symbol} /> : null}
          </div>
        </Surface>

        {/*
          Fundamentals and the company description. Not in the approved
          composition, and kept anyway: they are real provider data the previous
          page showed, and dropping them to match a mockup would delete working
          information. They sit last, where reference belongs.
        */}
        <div className="mt-3 grid gap-3 [grid-template-columns:minmax(0,1fr)_minmax(0,1fr)] max-[900px]:[grid-template-columns:minmax(0,1fr)]">
          <KeyStats quote={quote} loading={quoteLoading && !quoteData} />
          <AboutCompany
            company={company}
            summary={profile?.summary}
            sector={sector}
            industry={industry}
            exchange={exchange}
          />
        </div>
      </div>

      <AddPositionModal
        key={symbol}
        open={addOpen}
        defaultTicker={symbol}
        onClose={() => setAddOpen(false)}
        onAdded={(saved) => {
          invalidate('portfolio')
          invalidate('pnl')
          invalidate('pfhist')
          invalidate('activity')
          toast.success(`${saved?.ticker || symbol} added`, 'Your position is now being tracked.')
          setAddOpen(false)
        }}
      />
    </div>
  )
}
