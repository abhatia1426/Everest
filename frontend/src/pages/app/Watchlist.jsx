import { useDeferredValue, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Eye, Plus, Search, Sparkles } from 'lucide-react'

import { PageHeader } from '../../components/AppLayout'
import { Modal } from '../../components/Modal'
import { StaggerGroup, StaggerItem } from '../../components/Motion'
import { AssetSelector, useAssetQuote } from '../../components/ui/form/AssetSelector'
import { FormActions } from '../../components/ui/form/FormShell'
import { EmptyState, ErrorState, InlineLoader, Skeleton } from '../../components/States'
import { MonitorTile } from '../../components/watchlist/MonitorTile'
import { MarketStatus } from '../../components/ui/MarketStatus'
import { Segmented } from '../../components/ui/Segmented'
import { Surface } from '../../components/ui/Surface'
import { Toolbar } from '../../components/ui/Toolbar'
import { useToast } from '../../components/ui/Toast'
import { useFavorites } from '../../hooks/useFavorites'
import { useWatchlist } from '../../hooks/useWatchlist'
import { invalidate } from '../../lib/cache'
import { api } from '../../lib/api'
import { equityOrFallback } from '../../lib/equitySource'
import { fmtPercent, fmtRelative, pnlColor } from '../../lib/format'

const STYLES = [
  { value: 'growth', label: 'Growth' },
  { value: 'value', label: 'Value' },
  { value: 'momentum', label: 'Momentum' },
  { value: 'dividend', label: 'Dividend' },
]

const SORTS = [
  { value: 'change', label: 'Move' },
  { value: 'ticker', label: 'A-Z' },
  { value: 'price', label: 'Price' },
]

const VERDICT_TONE = {
  'Strong fit': 'bg-up/15 text-up',
  Fit: 'bg-accent/15 text-accent',
  Watch: 'bg-warn/15 text-warn',
  Avoid: 'bg-down/15 text-down',
}

/* ------------------------------------------------------------------ modals */

/**
 * Add a company to the watchlist.
 *
 * Same language as Add Position and Add Contract: search, then a confirmed
 * asset card showing what you picked and what it currently trades at. The old
 * version was a bare autocomplete over a submit button, so you could not tell
 * whether you had selected the right company until it appeared in the list.
 */
function AddTickerModal({ open, onClose, onAdded }) {
  const toast = useToast()
  const [symbol, setSymbol] = useState('')
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  const { raw, quote, loading: quoteLoading, error: quoteError, refetch } = useAssetQuote(
    symbol || null,
  )

  // Reset on open — see AddPositionModal for why this is a render-time
  // adjustment rather than an effect.
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
      onAdded?.()
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
                // An accent edge conveys rank order without giving every row
                // its own bordered box — twelve boxes inside one modal is what
                // made the v2 result read as a wall.
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

/* ----------------------------------------------------------------- movers */

/**
 * The scan strip: biggest absolute moves across the whole list, stated once
 * above the board. On a monitoring surface this is the answer to the question
 * the user actually arrived with — it saves reading twelve tiles to find the
 * two that moved.
 */
function ScanStrip({ items }) {
  const movers = useMemo(
    () =>
      items
        .filter((item) => typeof item.change_percent === 'number')
        .sort((a, b) => Math.abs(b.change_percent) - Math.abs(a.change_percent))
        .slice(0, 5),
    [items],
  )

  if (movers.length < 2) return null

  return (
    <div
      className="mb-4 flex flex-wrap items-center gap-x-5 gap-y-2 border-b pb-3"
      style={{ borderColor: 'var(--border)' }}
    >
      <span className="t-eyebrow">Biggest moves</span>
      {movers.map((item) => (
        <Link
          key={item.id}
          to={`/app/ticker/${item.ticker}`}
          className="flex items-baseline gap-1.5 text-[11px] transition-opacity duration-150
            hover:opacity-80"
        >
          <span className="num font-semibold text-text-primary">{item.ticker}</span>
          <span className={`num font-bold ${pnlColor(item.change_percent)}`}>
            {fmtPercent(item.change_percent)}
          </span>
        </Link>
      ))}
    </div>
  )
}

/* -------------------------------------------------------------------- page */

/**
 * Watchlist — the monitoring workspace.
 *
 * Primary task: sweep many symbols for movement. Everything follows from that.
 * Tiles are compact so four fit across and a twelve-symbol list is one screen;
 * the default sort is by move rather than alphabetical, because "what changed"
 * outranks "what starts with A"; and pinned symbols float to the top so the
 * handful you actually care about never scroll away.
 */
export default function Watchlist() {
  const { items, loading, error, refetch, remove, pending } = useWatchlist()
  const { toggle, isPinned } = useFavorites()
  const toast = useToast()

  const [addOpen, setAddOpen] = useState(false)
  const [screenerOpen, setScreenerOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [sector, setSector] = useState('')
  const [sort, setSort] = useState('change')

  const deferredQuery = useDeferredValue(query)

  const sectors = useMemo(() => {
    const found = new Set()
    for (const item of items) {
      const reference = equityOrFallback(item.ticker)
      const name = item.sector && item.sector !== 'Unknown' ? item.sector : reference.sector
      if (name) found.add(name)
    }
    return [...found].sort()
  }, [items])

  const visible = useMemo(() => {
    const needle = deferredQuery.trim().toLowerCase()

    const filtered = items.filter((item) => {
      const reference = equityOrFallback(item.ticker)
      const itemSector =
        item.sector && item.sector !== 'Unknown' ? item.sector : reference.sector

      if (sector && itemSector !== sector) return false
      if (!needle) return true

      return (
        item.ticker.toLowerCase().includes(needle) ||
        (item.company || '').toLowerCase().includes(needle) ||
        reference.name.toLowerCase().includes(needle) ||
        String(itemSector || '').toLowerCase().includes(needle)
      )
    })

    // Copy before sorting — never mutate the hook's array.
    const sorted = [...filtered].sort((a, b) => {
      if (sort === 'change') {
        // By absolute move: a 4% fall is as newsworthy as a 4% rise.
        return Math.abs(b.change_percent ?? 0) - Math.abs(a.change_percent ?? 0)
      }
      if (sort === 'price') return (b.price ?? -Infinity) - (a.price ?? -Infinity)
      return a.ticker.localeCompare(b.ticker)
    })

    // Pins win over the chosen sort, always.
    return sorted.sort((a, b) => Number(isPinned(b.ticker)) - Number(isPinned(a.ticker)))
  }, [items, deferredQuery, sector, sort, isPinned])

  const tickers = useMemo(() => items.map((i) => i.ticker), [items])
  const initialLoad = loading && items.length === 0

  return (
    <div className="mx-auto max-w-[1440px]">
      <PageHeader
        subtitle="Live prices refresh every 30 seconds."
        actions={
          <>
            {/* Stated once for the whole board, not repeated in every tile. */}
            <MarketStatus />
            <button
              type="button"
              onClick={() => setScreenerOpen(true)}
              disabled={items.length === 0}
              className="btn-ghost cursor-pointer"
            >
              <Sparkles size={15} />
              <span className="hidden sm:inline">Screen with AI</span>
            </button>
            <button
              type="button"
              onClick={() => setAddOpen(true)}
              className="btn-primary cursor-pointer"
            >
              <Plus size={15} />
              <span className="hidden sm:inline">Add ticker</span>
            </button>
          </>
        }
      />

      {initialLoad ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            // Matches the tile's real height so the board does not reflow.
            <Skeleton key={i} className="h-[186px] w-full rounded-card" />
          ))}
        </div>
      ) : error && items.length === 0 ? (
        <ErrorState error={error} onRetry={refetch} />
      ) : items.length === 0 ? (
        <Surface>
          <EmptyState
            icon={Eye}
            title="Nothing on your watchlist yet"
            description="Track the companies you are researching — prices, daily moves and 7-day trends in one view."
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
      ) : (
        <>
          <ScanStrip items={items} />

          {items.length > 4 ? (
            <Toolbar
              query={query}
              onQueryChange={setQuery}
              placeholder="Search watchlist"
              sorts={SORTS}
              sort={sort}
              onSortChange={setSort}
              filters={sectors}
              filter={sector}
              onFilterChange={setSector}
              filterLabel="All sectors"
              count={visible.length}
              total={items.length}
            />
          ) : null}

          {visible.length === 0 ? (
            <Surface>
              <EmptyState
                icon={Search}
                title="No matches"
                description="Try a different company name, ticker or sector."
                action={
                  <button
                    type="button"
                    onClick={() => {
                      setQuery('')
                      setSector('')
                    }}
                    className="btn-ghost cursor-pointer"
                  >
                    Clear filters
                  </button>
                }
              />
            </Surface>
          ) : (
            <StaggerGroup
              className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
              stagger={0.03}
            >
              {visible.map((item) => (
                <StaggerItem key={item.id}>
                  <MonitorTile
                    item={item}
                    pinned={isPinned(item.ticker)}
                    onTogglePin={() => toggle(item.ticker)}
                    removing={pending === item.id}
                    onRemove={async () => {
                      await remove(item.id)
                      toast.success(`${item.ticker} removed from watchlist`)
                    }}
                  />
                </StaggerItem>
              ))}
            </StaggerGroup>
          )}
        </>
      )}

      <AddTickerModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onAdded={() => refetch({ silent: true })}
      />
      <ScreenerModal open={screenerOpen} onClose={() => setScreenerOpen(false)} tickers={tickers} />
    </div>
  )
}
