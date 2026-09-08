import { useDeferredValue, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Eye, Plus, Sparkles } from 'lucide-react'

import { Modal } from '../../components/Modal'
import { StaggerGroup, StaggerItem } from '../../components/Motion'
import { AddPositionModal } from '../../components/portfolio/AddPositionModal'
import { AssetSelector, useAssetQuote } from '../../components/ui/form/AssetSelector'
import { FormActions } from '../../components/ui/form/FormShell'
import { EmptyState, ErrorState, InlineLoader } from '../../components/States'
import { MonitorBoard } from '../../components/watchlist/MonitorBoard'
import { SelectedSecurity } from '../../components/watchlist/SelectedSecurity'
import { TodaysMoves } from '../../components/watchlist/TodaysMoves'
import { Segmented } from '../../components/ui/Segmented'
import { Surface } from '../../components/ui/Surface'
import { useToast } from '../../components/ui/Toast'
import { useFavorites } from '../../hooks/useFavorites'
import { useSessionHistory } from '../../hooks/useSessionHistory'
import { useWatchlist } from '../../hooks/useWatchlist'
import { invalidate } from '../../lib/cache'
import { api } from '../../lib/api'
import { displayName, equityOrFallback } from '../../lib/equitySource'
import { fmtRelative } from '../../lib/format'
import { buildMonitorRow, withAttention } from '../../lib/monitor'
import { normalizeQuote } from '../../lib/quotes'

const STYLES = [
  { value: 'growth', label: 'Growth' },
  { value: 'value', label: 'Value' },
  { value: 'momentum', label: 'Momentum' },
  { value: 'dividend', label: 'Dividend' },
]

const VERDICT_TONE = {
  'Strong fit': 'bg-up/15 text-up',
  Fit: 'bg-accent/15 text-accent',
  Watch: 'bg-warn/15 text-warn',
  Avoid: 'bg-down/15 text-down',
}

/* ------------------------------------------------------------------ modals */

/**
 * Add a company to the watchlist. Unchanged from the previous page — search,
 * then a confirmed asset card showing what you picked and what it trades at.
 */
function AddTickerModal({ open, onClose, onAdded }) {
  const toast = useToast()
  const [symbol, setSymbol] = useState('')
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  const { raw, quote, loading: quoteLoading, error: quoteError, refetch } = useAssetQuote(
    symbol || null,
  )

  const [wasOpen, setWasOpen] = useState(open)
  if (wasOpen !== open) {
    setWasOpen(open)
    if (open) {
      setSymbol('')
      setError(null)
    }
  }

  const blockedReason = !symbol
    ? 'Choose a company to continue.'
    : !/^[A-Za-z]{1,5}$/.test(symbol)
      ? 'Ticker must be 1-5 letters.'
      : null

  const submit = async (event) => {
    event.preventDefault()
    setError(null)
    if (blockedReason) return

    setLoading(true)
    try {
      const upper = symbol.trim().toUpperCase()
      await api.addWatchlist(upper)
      invalidate('watchlist')
      setSymbol('')
      toast.success(`${upper} added to watchlist`)
      onAdded?.(upper)
      onClose()
    } catch (err) {
      setError(err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add to watchlist"
      description="Track a company's price and daily movement."
    >
      <form onSubmit={submit} className="space-y-4">
        {error ? <ErrorState error={error} compact /> : null}

        <AssetSelector
          symbol={symbol}
          onChange={setSymbol}
          quote={{ raw, quote }}
          loading={quoteLoading}
          error={quoteError}
          onRetry={refetch}
        />

        <FormActions
          onCancel={onClose}
          submitLabel="Add to watchlist"
          loadingLabel="Adding…"
          loading={loading}
          disabled={Boolean(blockedReason)}
          disabledReason={symbol ? blockedReason : null}
        />
      </form>
    </Modal>
  )
}

/**
 * The AI screener — the real `/ai/screener` capability, kept subordinate.
 *
 * It ranks the symbols already on the watchlist against a named investing
 * style, and it lives behind a quiet ghost button rather than on the page. It
 * is not a recommendation engine and nothing on the board is scored by it.
 */
function ScreenerModal({ open, onClose, tickers }) {
  const [style, setStyle] = useState('growth')
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  const run = async () => {
    setError(null)
    setLoading(true)
    setResult(null)
    try {
      setResult(await api.aiScreener({ tickers, style }))
    } catch (err) {
      setError(err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      width="max-w-2xl"
      title="Screen with AI"
      description={`Rank your ${tickers.length} watchlist tickers against an investing style.`}
    >
      <div className="space-y-4">
        <div>
          <span className="label">Investing style</span>
          <Segmented label="Investing style" options={STYLES} value={style} onChange={setStyle} />
        </div>

        <button
          type="button"
          onClick={run}
          disabled={loading}
          className="btn-primary w-full cursor-pointer"
        >
          <Sparkles size={15} />
          {loading ? 'Reaching new heights...' : 'Run screener'}
        </button>

        {error ? <ErrorState error={error} compact /> : null}
        {loading ? <InlineLoader variant="ai" /> : null}

        {result ? (
          <div className="max-h-[52vh] animate-fade-up space-y-2.5 overflow-y-auto pr-1">
            <p className="surface-1 p-3 text-[13px] leading-relaxed text-text-secondary">
              {result.summary}
            </p>
            {(result.ranked || []).map((row, index) => (
              <article
                key={row.ticker}
                style={{
                  animationDelay: `${index * 50}ms`,
                  borderColor: index === 0 ? 'var(--accent-blue)' : 'var(--border)',
                }}
                className="animate-fade-up border-l-2 pl-3.5"
              >
                <div className="flex items-center gap-2.5">
                  <span className="num text-[11px] font-bold text-text-tertiary">
                    {String(row.rank).padStart(2, '0')}
                  </span>
                  <Link
                    to={`/app/ticker/${row.ticker}`}
                    onClick={onClose}
                    className="num cursor-pointer text-[13px] font-semibold text-text-primary
                      transition-colors duration-150 hover:text-accent"
                  >
                    {row.ticker}
                  </Link>
                  <span
                    className={`rounded-control px-2 py-0.5 text-[10px] font-semibold ${
                      VERDICT_TONE[row.verdict] || 'bg-tint/[0.05] text-text-secondary'
                    }`}
                  >
                    {row.verdict}
                  </span>
                  <span className="num ml-auto text-[11px] font-semibold text-text-secondary">
                    {Math.round(row.score)}/100
                  </span>
                </div>
                <p className="mt-1.5 text-[13px] leading-relaxed text-text-secondary">
                  {row.rationale}
                </p>
              </article>
            ))}
            {result.ran_at ? (
              <p className="text-[11px] text-text-tertiary">Run {fmtRelative(result.ran_at)}</p>
            ) : null}
          </div>
        ) : null}
      </div>
    </Modal>
  )
}

/* -------------------------------------------------------------------- page */

/**
 * Watchlist, composed to the approved `Everest Watchlist.dc.html`.
 *
 * THE PAGE IS A MARKET MONITOR WITH A SELECTED-SECURITY STAGE. Not a
 * portfolio, not a ledger, not a grid of cards, and not a small Ticker Detail.
 * Three bands say so:
 *
 *   1. Today's Moves — one diverging percentage axis carrying every watched
 *      symbol at its real day move. The page's signature object.
 *   2. The monitor board — dense, column-aligned rows built for sweeping.
 *   3. The stage — the selected symbol, answered in enough depth to decide
 *      whether to open it properly.
 *
 * Bands 2 and 3 sit side by side at 1.55fr / 1fr and stack at 1220px, which is
 * the approved geometry.
 *
 * WHY SELECTION AND NOT NAVIGATION. Comparing two symbols on a monitor is the
 * core act, and it has to cost a click rather than a page load. Rows therefore
 * drive the stage; "Open detail" is the explicit route to
 * `/app/ticker/:symbol`.
 *
 * THE 30 SESSIONS BEHIND EVERYTHING. The sparkline, the range rail, momentum,
 * the "normal day" baseline and two of the four attention conditions are all
 * statements about daily sessions. They come from one batched, cached request
 * for the whole board (`useSessionHistory`) — never one request per symbol,
 * which would exhaust the provider's per-minute budget on first paint. Where a
 * symbol's history could not be loaded, its row keeps its geometry and every
 * dependent cell renders an em dash. Nothing is interpolated.
 *
 * WHAT THE DESIGN DRAWS THAT THIS DOES NOT:
 *
 * · The mockup's fourth period stop is 5Y. Everest's history endpoint has no
 *   five-year window; ALL is the honest nearest and is what the control says.
 * · The mockup's account chip, nav and theme toggle belong to the app shell,
 *   which already draws them. They are not redrawn here.
 * · There are no alerts. Everest has no alert system, so the page offers none.
 */
export default function Watchlist() {
  const { items, loading, error, refetch, remove, pending } = useWatchlist()
  const { toggle, isPinned } = useFavorites()
  const toast = useToast()

  const [addOpen, setAddOpen] = useState(false)
  const [screenerOpen, setScreenerOpen] = useState(false)
  const [positionFor, setPositionFor] = useState(null)
  const [query, setQuery] = useState('')
  const [scope, setScope] = useState('All')
  const [sort, setSort] = useState('move')
  const [period, setPeriod] = useState('1M')
  const [chosen, setChosen] = useState(null)

  const deferredQuery = useDeferredValue(query)

  const tickers = useMemo(() => items.map((item) => item.ticker), [items])
  const { candlesFor, loading: historyLoading } = useSessionHistory(tickers)

  /**
   * Every symbol, with its measurements. Built once and shared by the
   * spectrum, the board and the stage so the three cannot disagree about
   * whether a symbol is near its high.
   */
  const rows = useMemo(
    () =>
      items.map((item) => {
        const reference = equityOrFallback(item.ticker)
        const enriched = {
          ...item,
          // The API echoes the bare ticker back as `company` when no quote
          // arrived; the local reference name must outrank that placeholder.
          company: displayName(item.ticker, item.company),
          sector:
            item.sector && item.sector !== 'Unknown' ? item.sector : reference.sector || null,
        }
        // No cost basis: a watched symbol need not be owned, so there is no
        // cost to fall back to and `unavailable` is the correct floor.
        const quote = normalizeQuote(item)
        return withAttention(buildMonitorRow(enriched, candlesFor(item.ticker), quote))
      }),
    [items, candlesFor],
  )

  const byTicker = useMemo(() => new Map(rows.map((row) => [row.ticker, row])), [rows])

  const counts = useMemo(
    () => ({
      All: rows.length,
      Pinned: rows.filter((row) => isPinned(row.ticker)).length,
      Attention: rows.filter((row) => row.attention).length,
      Gainers: rows.filter((row) => row.hasQuote && row.changePercent > 0).length,
      Losers: rows.filter((row) => row.hasQuote && row.changePercent < 0).length,
    }),
    [rows, isPinned],
  )

  const visible = useMemo(() => {
    const needle = deferredQuery.trim().toLowerCase()

    const filtered = rows.filter((row) => {
      if (scope === 'Pinned' && !isPinned(row.ticker)) return false
      if (scope === 'Attention' && !row.attention) return false
      if (scope === 'Gainers' && !(row.hasQuote && row.changePercent > 0)) return false
      if (scope === 'Losers' && !(row.hasQuote && row.changePercent < 0)) return false
      if (!needle) return true
      return (
        row.ticker.toLowerCase().includes(needle) ||
        row.name.toLowerCase().includes(needle) ||
        String(row.sector || '').toLowerCase().includes(needle)
      )
    })

    const sorted = [...filtered].sort((a, b) => {
      if (sort === 'move') {
        // Absolute: a 4% fall is as newsworthy as a 4% rise.
        return Math.abs(b.changePercent ?? 0) - Math.abs(a.changePercent ?? 0)
      }
      if (sort === 'return30') return (b.return30 ?? -Infinity) - (a.return30 ?? -Infinity)
      if (sort === 'price') return (b.price ?? -Infinity) - (a.price ?? -Infinity)
      return a.ticker.localeCompare(b.ticker)
    })

    // Pins win over the chosen sort, always.
    return sorted.sort((a, b) => Number(isPinned(b.ticker)) - Number(isPinned(a.ticker)))
  }, [rows, deferredQuery, scope, sort, isPinned])

  /**
   * The selected symbol. `chosen` is only a preference — if it leaves the
   * watchlist or drops out of the current filter the stage falls back to the
   * first visible row rather than emptying, so the stage is never blank while
   * the board has content.
   */
  const selected = useMemo(() => {
    if (chosen && byTicker.has(chosen) && visible.some((row) => row.ticker === chosen)) {
      return byTicker.get(chosen)
    }
    if (chosen && byTicker.has(chosen) && visible.length === 0) return byTicker.get(chosen)
    return visible[0] || rows[0] || null
  }, [chosen, byTicker, visible, rows])

  const initialLoad = loading && items.length === 0

  const clearFilters = () => {
    setQuery('')
    setScope('All')
  }

  const removeFromWatchlist = async (row) => {
    await remove(row.id)
    if (chosen === row.ticker) setChosen(null)
    toast.success(`${row.ticker} removed from watchlist`)
  }

  if (error && items.length === 0) return <ErrorState error={error} onRetry={refetch} />

  if (!initialLoad && items.length === 0) {
    return (
      <>
        <Surface>
          <EmptyState
            icon={Eye}
            title="Nothing on your watchlist yet"
            description="Track the companies you are researching — prices, daily moves, 30-session trends and where each one sits in its own monthly range."
            action={
              <button
                type="button"
                onClick={() => setAddOpen(true)}
                className="btn-primary cursor-pointer"
              >
                <Plus size={15} />
                Add your first ticker
              </button>
            }
          />
        </Surface>
        <AddTickerModal
          open={addOpen}
          onClose={() => setAddOpen(false)}
          onAdded={(symbol) => {
            setChosen(symbol)
            refetch({ silent: true, force: true })
          }}
        />
      </>
    )
  }

  return (
    <StaggerGroup className="flex flex-col gap-3">
      <StaggerItem>
        <TodaysMoves
          rows={rows}
          selected={selected?.ticker}
          onSelect={setChosen}
          onAddTicker={() => setAddOpen(true)}
          onScreen={() => setScreenerOpen(true)}
          screenDisabled={items.length === 0}
        />
      </StaggerItem>

      {/*
        1.55fr / 1fr, single column at 1220px — the approved main grid. The
        board keeps `min-w-0` so its own horizontal scroll never widens the
        page; nothing here may overflow the viewport.
      */}
      {/*
        A DEFINITE height at desktop, not a minimum. The design's main band is
        660px and the board scrolls inside it; with `min-height` the board would
        instead grow to its row count and drag the stage's chart — a grid
        sibling — to the same height. Below 1220px the columns stack and each
        takes its natural height, which is what the approved file does too.
      */}
      <StaggerItem
        className="grid gap-3 min-[1221px]:h-[660px]
          [grid-template-columns:minmax(0,1.55fr)_minmax(340px,1fr)]
          max-[1220px]:[grid-template-columns:minmax(0,1fr)]"
      >
        <MonitorBoard
          rows={visible}
          selected={selected?.ticker}
          onSelect={setChosen}
          isPinned={isPinned}
          scope={scope}
          onScope={setScope}
          counts={counts}
          query={query}
          onQuery={setQuery}
          sort={sort}
          onSort={setSort}
          loading={initialLoad || (historyLoading && rows.length === 0)}
          onClearFilters={clearFilters}
        />

        {selected ? (
          <SelectedSecurity
            row={selected}
            pinned={isPinned(selected.ticker)}
            onTogglePin={() => toggle(selected.ticker)}
            onAddPosition={setPositionFor}
            onRemove={removeFromWatchlist}
            removing={pending === selected.id}
            period={period}
            onPeriod={setPeriod}
          />
        ) : null}
      </StaggerItem>

      <AddTickerModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onAdded={(symbol) => {
          setChosen(symbol)
          refetch({ silent: true, force: true })
        }}
      />
      <ScreenerModal open={screenerOpen} onClose={() => setScreenerOpen(false)} tickers={tickers} />
      <AddPositionModal
        key={positionFor || 'blank'}
        open={Boolean(positionFor)}
        defaultTicker={positionFor || ''}
        onClose={() => setPositionFor(null)}
        onAdded={(saved) => {
          invalidate('portfolio')
          invalidate('pnl')
          invalidate('pfhist')
          invalidate('activity')
          toast.success(`${saved?.ticker} added`, 'Your position is now being tracked.')
          setPositionFor(null)
        }}
      />
    </StaggerGroup>
  )
}
