import { useCallback, useDeferredValue, useMemo, useState } from 'react'
import { Briefcase, Plus } from 'lucide-react'

import { StaggerGroup, StaggerItem } from '../../components/Motion'
import { EmptyState, ErrorState, Notice } from '../../components/States'
import { AddPositionModal } from '../../components/portfolio/AddPositionModal'
import { ConcentrationRibbon } from '../../components/portfolio/ConcentrationRibbon'
import { LedgerControls } from '../../components/portfolio/LedgerControls'
import { PortfolioLedger } from '../../components/portfolio/PortfolioLedger'
import { PortfolioValueBand } from '../../components/portfolio/PortfolioValueBand'
import { seriesFor } from '../../components/dashboard/HoldingsPanel'
import { Surface } from '../../components/ui/Surface'
import { useApi } from '../../hooks/useApi'
import { TTL, invalidate } from '../../lib/cache'
import { useMode } from '../../hooks/useMode'
import { useToast } from '../../components/ui/Toast'
import { useWatchlist } from '../../hooks/useWatchlist'
import { api } from '../../lib/api'
import { buildBook, filterHoldings, sortHoldings } from '../../lib/portfolio'

// Re-exported so any existing importer of AddPositionModal keeps working; the
// component itself lives with the other portfolio components.
export { AddPositionModal }

/**
 * Portfolio, composed to the approved `Everest Portfolio.dc.html`.
 *
 * FOUR BANDS, in the design's order and proportions:
 *
 *   1. the blue value field + Real/Paper, as-of, Add position, 5 metrics
 *   2. the concentration ribbon, spanning the page
 *   3. search, sector pills, count
 *   4. the ledger — the centrepiece — ending on a totals row
 *
 * WHY `/pnl` AND NOT `/portfolio`. The two return the same enriched positions,
 * but `/pnl` also returns the book totals and the realized figure the approved
 * metric strip asks for. Fetching `/portfolio` and then re-deriving totals on
 * the client would put two sources of truth for the same numbers one component
 * apart. Position ids are present in both, so Add and Remove are unchanged.
 *
 * WHAT THE DESIGN DRAWS THAT THIS DOES NOT, and why:
 *
 * · Realized P/L is not a number here. Nothing in Everest writes a trade
 *   record — there is no sell, reduce or close — so `/pnl.realized_pnl` is 0.00
 *   for every user, always. "$0.00" would be a measurement claim; the tile
 *   reads "Not recorded" instead. See `PortfolioValueBand`.
 * · The row expansion carries no lots, dividends or tax treatment. They are
 *   not modelled, and an empty heading asserts that they are.
 * · The reconstructed history is all-or-nothing and says so on every range.
 *
 * Everything else — the ribbon, the diverging contribution bar, the weight
 * bar, the inline expansion, the sortable heads, the filtered totals — is the
 * design's, on real data.
 */
export default function Portfolio() {
  const { mode, setMode } = useMode()
  const fetcher = useCallback(() => api.pnl(mode), [mode])
  const { data, loading, error, refetch } = useApi(fetcher, [mode], {
    key: `pnl:${mode}`,
    ttl: TTL.QUOTE,
    pollMs: 30000,
  })

  // The watchlist is already loaded once for the whole shell, so any holding
  // the user also watches gets a real 30-day series in its expansion at no
  // additional request. Anything else simply has none.
  const { items: watchlistItems } = useWatchlist()

  const [modalOpen, setModalOpen] = useState(false)
  const [prefill, setPrefill] = useState('')
  const [deleting, setDeleting] = useState(null)
  const [staleNotice, setStaleNotice] = useState(null)
  const [query, setQuery] = useState('')
  const [sector, setSector] = useState('')
  const [sort, setSort] = useState('value')
  const [dir, setDir] = useState(-1)
  const toast = useToast()

  const deferredQuery = useDeferredValue(query)

  // "Updated 1:41 PM" is a claim about when EVEREST last had these figures,
  // which is exactly what this measures — it re-stamps on each new payload
  // from the 30s poll. It is not a provider timestamp and does not pretend to
  // be one.
  const updatedAt = useMemo(() => (data ? new Date() : null), [data])

  const positions = useMemo(() => data?.positions || [], [data])
  const book = useMemo(() => buildBook(positions), [positions])

  const sectors = useMemo(
    () => [...book.sectors.keys()].sort((a, b) => a.localeCompare(b)),
    [book],
  )

  const visible = useMemo(() => {
    const narrowed = filterHoldings(book.rows, { query: deferredQuery, sector })
    return sortHoldings(narrowed, sort, dir)
  }, [book, deferredQuery, sector, sort, dir])

  const handleSort = useCallback(
    (key) => {
      if (key === sort) setDir((current) => current * -1)
      else {
        setSort(key)
        setDir(key === 'ticker' ? 1 : -1)
      }
    },
    [sort],
  )

  const clearFilters = useCallback(() => {
    setQuery('')
    setSector('')
  }, [])

  const openAdd = useCallback((ticker = '') => {
    setPrefill(ticker)
    setModalOpen(true)
  }, [])

  const handleAdded = (saved) => {
    // Stale saves keep the inline notice — it is contextual and persistent.
    // Clean saves get a toast, which is transient by nature.
    if (saved?.price_stale) {
      setStaleNotice(saved.ticker)
    } else {
      setStaleNotice(null)
      toast.success(`${saved?.ticker} added`, 'Your position is now being tracked.')
    }
    invalidate('portfolio')
    invalidate('pnl')
    invalidate('pfhist')
    invalidate('activity')
    refetch({ silent: true, force: true })
  }

  const remove = async (id, ticker) => {
    setDeleting(id)
    try {
      await api.deletePosition(id)
      invalidate('portfolio')
      invalidate('pnl')
      invalidate('pfhist')
      invalidate('activity')
      await refetch({ silent: true, force: true })
      toast.success(`${ticker} removed`, 'Everest has stopped tracking this holding.')
    } catch (err) {
      toast.error('Could not remove position', err.message)
    } finally {
      setDeleting(null)
    }
  }

  const initialLoad = loading && !data
  const isEmpty = !initialLoad && positions.length === 0
  const filtered = visible.length !== book.rows.length

  if (error && !data) return <ErrorState error={error} onRetry={refetch} />

  return (
    <StaggerGroup className="flex flex-col gap-3">
      {staleNotice ? (
        <StaggerItem>
          <Notice tone="warn" onDismiss={() => setStaleNotice(null)}>
            Live prices temporarily unavailable. Your {staleNotice} position was saved
            successfully and is valued at your cost basis until quotes return.
          </Notice>
        </StaggerItem>
      ) : null}

      {isEmpty ? (
        <Surface>
          <EmptyState
            icon={Briefcase}
            title={`No ${mode} positions`}
            description="Add your first holding and Everest will track live P&L, cost basis, concentration and allocation for you."
            action={
              <button
                type="button"
                onClick={() => openAdd()}
                className="btn-primary cursor-pointer"
              >
                <Plus size={15} />
                Add a position
              </button>
            }
          />
        </Surface>
      ) : (
        <>
          <StaggerItem>
            <PortfolioValueBand
              book={book}
              mode={mode}
              setMode={setMode}
              realized={data?.realized_pnl || 0}
              loading={initialLoad}
              onAddPosition={() => openAdd()}
              updatedAt={updatedAt}
            />
          </StaggerItem>

          {!initialLoad ? (
            <StaggerItem>
              <ConcentrationRibbon
                book={book}
                query={query}
                sector={sector}
                onSelectTicker={setQuery}
                onSelectSector={setSector}
                onClear={clearFilters}
              />
            </StaggerItem>
          ) : null}

          <StaggerItem>
            <LedgerControls
              query={query}
              onQueryChange={setQuery}
              sector={sector}
              onSectorChange={setSector}
              sectors={sectors}
              count={visible.length}
              total={book.rows.length}
            />
          </StaggerItem>

          <StaggerItem className="flex min-w-0 flex-col">
            <PortfolioLedger
              rows={visible}
              book={book}
              loading={initialLoad}
              sort={sort}
              dir={dir}
              onSort={handleSort}
              filtered={filtered}
              onClearFilters={clearFilters}
              seriesFor={(ticker) => seriesFor(ticker, watchlistItems)}
              onOpenAdd={openAdd}
              onRemove={remove}
              removingId={deleting}
            />
          </StaggerItem>
        </>
      )}

      <AddPositionModal
        // Remounted per prefill so a ticket opened from a row's "Add to
        // position" starts on that ticker rather than on the previous one.
        key={prefill || 'blank'}
        open={modalOpen}
        defaultTicker={prefill}
        onClose={() => setModalOpen(false)}
        onAdded={handleAdded}
      />
    </StaggerGroup>
  )
}
