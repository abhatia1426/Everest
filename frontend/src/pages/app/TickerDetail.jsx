import { useCallback, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, ExternalLink, Plus, Sparkles } from 'lucide-react'

import { AddOptionModal } from '../../components/AddOptionModal'
import { ThesisResult } from '../../components/AIResults'
import { SentimentBadge } from '../../components/Controls'
import { EmptyState, ErrorState, InlineLoader, Notice, Skeleton } from '../../components/States'
import { KeyStats, RangeMeter } from '../../components/ticker/KeyStats'
import { AboutCompany, PositionSummary } from '../../components/ticker/PositionSummary'
import { PriceBoard } from '../../components/ticker/PriceBoard'
import { Segmented } from '../../components/ui/Segmented'
import { Panel, Surface } from '../../components/ui/Surface'
import { OptionsTable } from './Options'
import { useApi } from '../../hooks/useApi'
import { TTL, invalidate } from '../../lib/cache'
import { useMode } from '../../hooks/useMode'
import { useToast } from '../../components/ui/Toast'
import { useWatchlist } from '../../hooks/useWatchlist'
import { api } from '../../lib/api'
import { displayName, equityOrFallback } from '../../lib/equitySource'
import { fmtDate } from '../../lib/format'

const RANGE_TO_PERIOD = { '1D': '1d', '1W': '1w', '1M': '1m', '3M': '3m', '1Y': '1y', MAX: 'all' }
const TABS = ['News', 'AI Thesis', 'Options']

/* -------------------------------------------------------------------- news */

/**
 * Copy for each backend news `status`.
 *
 * The backend returns a vendor-neutral status rather than an error, so the
 * panel can say something accurate without a red failure banner sitting over
 * a page whose price, chart and holdings are all working. Previously a news
 * outage surfaced the provider's own words — "NewsAPI rejected the configured
 * key" — which named a vendor the user has no relationship with and described
 * a problem only an operator can fix.
 *
 * Same components, same layout; only the words change.
 */
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
  const { data, loading, error, refetch } = useApi(fetcher, [symbol], { key: `news:${symbol}`, ttl: TTL.NEWS })

  if (loading) return <InlineLoader />
  // A transport-level failure still uses ErrorState; the backend's own
  // normalised statuses arrive as HTTP 200 and are handled below.
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

      {/*
        A divided list, not a stack of cards. Headlines are a feed you scan;
        giving each one a bordered surface makes ten articles read as ten
        separate objects competing for the same attention.
      */}
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
                <h3 className="text-[13.5px] font-semibold leading-snug text-text-primary
                  transition-colors duration-150 group-hover:text-accent">
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
  const { data, loading, error, refetch } = useApi(fetcher, [mode, symbol], { key: `options:${mode}:${symbol}`, ttl: TTL.PORTFOLIO })
  const [modalOpen, setModalOpen] = useState(false)

  const options = data?.options || []

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[13px] text-text-secondary">
          {mode === 'paper' ? 'Paper' : 'Real'} contracts on {symbol}
        </p>
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className="btn-ghost cursor-pointer"
        >
          <Plus size={15} />
          Add contract
        </button>
      </div>

      {loading ? (
        <InlineLoader />
      ) : error ? (
        <ErrorState error={error} onRetry={refetch} />
      ) : options.length === 0 ? (
        <EmptyState
          title="No contracts here"
          description={`You have no ${mode} options on ${symbol}.`}
        />
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

/* -------------------------------------------------------------------- page */

/**
 * Stock detail — the equity research page.
 *
 * Primary task: form a view on ONE company. The composition follows:
 *
 *   MAIN COLUMN   the instrument — identity, price, chart, session figures as
 *                 a single unbroken object, then the narrative tabs (news,
 *                 thesis, options) beneath it
 *   RIGHT RAIL    reference you consult WHILE reading the main column — your
 *                 own position first (it changes how everything else reads),
 *                 then statistics, ranges and the company description
 *
 * The rail is sticky, so the statistics stay available as the main column
 * scrolls. That is the whole point of a research layout: two things legible at
 * once, rather than a stack that forces you to hold figures in memory.
 */
export default function TickerDetail() {
  const { symbol: raw } = useParams()
  const symbol = (raw || '').toUpperCase()

  const [range, setRange] = useState('1M')
  const [chartType, setChartType] = useState('candlestick')
  const [tab, setTab] = useState('News')

  const { mode } = useMode()
  const watchlist = useWatchlist()
  const toast = useToast()

  const toggleWatch = async () => {
    const wasWatched = watchlist.isWatched(symbol)
    await watchlist.toggle(symbol)
    toast.success(wasWatched ? `${symbol} removed from watchlist` : `${symbol} added to watchlist`)
  }

  const quoteFetcher = useCallback(() => api.prices([symbol]), [symbol])
  const {
    data: quoteData,
    loading: quoteLoading,
    error: quoteError,
    refetch,
  } = useApi(quoteFetcher, [symbol], { key: `quote:${symbol}`, ttl: TTL.QUOTE, pollMs: 30000 })

  const profileFetcher = useCallback(() => api.profile(symbol), [symbol])
  const { data: profile } = useApi(profileFetcher, [symbol], { key: `profile:${symbol}`, ttl: TTL.PROFILE })

  const period = RANGE_TO_PERIOD[range]
  const historyFetcher = useCallback(() => api.history(symbol, period), [symbol, period])
  const { data: historyData, loading: historyLoading } = useApi(historyFetcher, [symbol, period], { key: `history:${symbol}:${period}`, ttl: TTL.HISTORY })

  // Your own holding in this name. Reuses the existing portfolio endpoint —
  // no new API surface.
  const portfolioFetcher = useCallback(() => api.portfolio(mode), [mode])
  const { data: portfolioData } = useApi(portfolioFetcher, [mode], { key: `portfolio:${mode}`, ttl: TTL.PORTFOLIO })

  const quote = quoteData?.quotes?.[symbol]
  const candles = useMemo(() => historyData?.candles || [], [historyData])
  const priceUnavailable = quote && (quote.price === null || quote.price === undefined)

  const position = useMemo(
    () => (portfolioData?.positions || []).find((p) => p.ticker === symbol) || null,
    [portfolioData, symbol],
  )

  // equitySource is the single metadata layer — it always returns something
  // renderable, so an off-dataset symbol still gets a name and a logo.
  const reference = equityOrFallback(symbol)
  const company = displayName(symbol, quote?.company, profile?.company, reference.name)
  const sector = quote?.sector || profile?.sector || reference.sector
  const industry = quote?.industry || profile?.industry || reference.industry

  if (quoteError) return <ErrorState error={quoteError} onRetry={refetch} />

  return (
    <div className="mx-auto max-w-[1440px]">
      <Link
        to="/app"
        className="mb-3 inline-flex cursor-pointer items-center gap-1.5 text-[12px]
          text-text-secondary transition-colors duration-150 hover:text-text-primary"
      >
        <ArrowLeft size={14} />
        Back to dashboard
      </Link>

      {priceUnavailable ? (
        <div className="mb-4">
          <Notice tone="warn">
            Live market data for {symbol} is temporarily unavailable. Reference details still
            apply; prices and charts fill in once quotes return.
          </Notice>
        </div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px] xl:items-start">
        {/* ------------------------------------------------ main column */}
        <div className="min-w-0 space-y-4">
          <PriceBoard
            symbol={symbol}
            company={company}
            sector={sector}
            quote={quote}
            candles={candles}
            range={range}
            onRangeChange={setRange}
            chartType={chartType}
            onChartTypeChange={setChartType}
            historyLoading={historyLoading}
            quoteLoading={quoteLoading}
            watchlist={watchlist}
            onToggleWatch={toggleWatch}
          />

          <Surface as="section" className="overflow-hidden">
            <div
              role="tablist"
              aria-label="Research sections"
              className="flex gap-1 overflow-x-auto border-b px-3"
              style={{ borderColor: 'var(--border)' }}
            >
              {TABS.map((name) => {
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
        </div>

        {/* -------------------------------------------------- right rail */}
        <aside className="space-y-4 xl:sticky xl:top-[84px]">
          <PositionSummary position={position} mode={mode} />

          <KeyStats quote={quote} loading={quoteLoading && !quoteData} />

          <Panel title="Ranges" bodyClassName="space-y-5">
            {quoteLoading && !quoteData ? (
              <>
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </>
            ) : (
              <>
                <RangeMeter
                  label="52-week range"
                  low={quote?.fifty_two_week_low}
                  high={quote?.fifty_two_week_high}
                  current={quote?.price}
                />
                <RangeMeter
                  label="Day range"
                  low={quote?.day_low}
                  high={quote?.day_high}
                  current={quote?.price}
                />
              </>
            )}
          </Panel>

          <AboutCompany
            company={company}
            summary={profile?.summary}
            sector={sector}
            industry={industry}
            exchange={quote?.exchange}
          />
        </aside>
      </div>
    </div>
  )
}
