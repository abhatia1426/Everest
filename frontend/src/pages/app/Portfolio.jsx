import { useCallback, useDeferredValue, useMemo, useState } from 'react'
import { Briefcase, Plus } from 'lucide-react'

import { PageHeader } from '../../components/AppLayout'
import { EmptyState, ErrorState, Notice } from '../../components/States'
import { AddPositionModal } from '../../components/portfolio/AddPositionModal'
import { BookSummary } from '../../components/portfolio/BookSummary'
import { HoldingsLedger } from '../../components/portfolio/HoldingsLedger'
import { Surface } from '../../components/ui/Surface'
import { Toolbar } from '../../components/ui/Toolbar'
import { useApi } from '../../hooks/useApi'
import { TTL, invalidate } from '../../lib/cache'
import { useMode } from '../../hooks/useMode'
import { useToast } from '../../components/ui/Toast'
import { api } from '../../lib/api'
import { equityOrFallback } from '../../lib/equitySource'

// Re-exported so any existing importer of AddPositionModal keeps working; the
// component itself now lives with the other portfolio components.
export { AddPositionModal }

const SORTS = [
  { value: 'value', label: 'Value' },
  { value: 'pnl', label: 'P&L' },
  { value: 'ticker', label: 'A-Z' },
]

/**
 * Portfolio — the asset-management workspace.
 *
 * Primary task: compare and manage positions, not admire them. That single
 * answer drives the whole composition:
 *   · a summary band that states the book's totals and composition once
 *   · a toolbar, because a book of thirty positions needs narrowing
 *   · an aligned ledger, because comparison requires columns
 *
 * The v2 page rendered a three-column grid of asset cards, which looked
 * considerable but made the primary task impossible — the same figure landed
 * at a different position in every card, so nothing could be scanned down.
 */
export default function Portfolio() {
  const { mode } = useMode()
  const fetcher = useCallback(() => api.portfolio(mode), [mode])
  const { data, loading, error, refetch } = useApi(fetcher, [mode], { key: `portfolio:${mode}`, ttl: TTL.PORTFOLIO, pollMs: 30000 })

  const [modalOpen, setModalOpen] = useState(false)
  const [deleting, setDeleting] = useState(null)
  const [staleNotice, setStaleNotice] = useState(null)
  const [query, setQuery] = useState('')
  const [sector, setSector] = useState('')
  const [sort, setSort] = useState('value')
  const toast = useToast()

  const deferredQuery = useDeferredValue(query)

  const handleAdded = (saved) => {
    // Stale saves keep the inline notice — it is contextual and persistent.
    // Clean saves get a toast, which is transient by nature.
    if (saved?.price_stale) {
      setStaleNotice(saved.ticker)
    } else {
      setStaleNotice(null)
      toast.success(`${saved?.ticker} added`, 'Your position is now being tracked.')
    }
    // The book changed, so every derived view of it is now wrong. Clearing by
    // prefix covers real/paper and any params variant without the call site
    // needing to know the exact keys.
    invalidate('portfolio')
    invalidate('pnl')
    invalidate('activity')
    refetch({ silent: true, force: true })
  }

  const positions = useMemo(() => data?.positions || [], [data])

  const totals = useMemo(
    () =>
      positions.reduce(
        (acc, p) => ({
          marketValue: acc.marketValue + (p.market_value || 0),
          costBasis: acc.costBasis + (p.cost_basis || 0),
          pnl: acc.pnl + (p.unrealized_pnl || 0),
        }),
        { marketValue: 0, costBasis: 0, pnl: 0 },
      ),
    [positions],
  )

  const sectors = useMemo(() => {
    const found = new Set()
    for (const position of positions) {
      const reference = equityOrFallback(position.ticker)
      const name =
        position.sector && position.sector !== 'Unknown' ? position.sector : reference.sector
      if (name) found.add(name)
    }
    return [...found].sort()
  }, [positions])

  const visible = useMemo(() => {
    const needle = deferredQuery.trim().toLowerCase()

    const filtered = positions.filter((position) => {
      const reference = equityOrFallback(position.ticker)
      const name = position.company || reference.name
      const positionSector =
        position.sector && position.sector !== 'Unknown' ? position.sector : reference.sector

      if (sector && positionSector !== sector) return false
      if (!needle) return true

      return (
        position.ticker.toLowerCase().includes(needle) ||
        String(name).toLowerCase().includes(needle) ||
        String(positionSector || '').toLowerCase().includes(needle)
      )
    })

    // Copy before sorting — never mutate the fetched array.
    return [...filtered].sort((a, b) => {
      if (sort === 'pnl') return (b.unrealized_pnl ?? 0) - (a.unrealized_pnl ?? 0)
      if (sort === 'ticker') return a.ticker.localeCompare(b.ticker)
      return (b.market_value ?? 0) - (a.market_value ?? 0)
    })
  }, [positions, deferredQuery, sector, sort])

  const remove = async (id, ticker) => {
    setDeleting(id)
    try {
      await api.deletePosition(id)
      invalidate('portfolio')
      invalidate('pnl')
      invalidate('activity')
      await refetch({ silent: true, force: true })
      toast.success(`${ticker} removed`)
    } catch (err) {
      toast.error('Could not remove position', err.message)
    } finally {
      setDeleting(null)
    }
  }

  const initialLoad = loading && !data
  const isEmpty = !initialLoad && positions.length === 0

  return (
    <div className="mx-auto max-w-[1440px]">
      {/* Title and Real/Paper live in the topbar — not repeated here. */}
      <PageHeader
        subtitle="Every open position across your real and paper books."
        actions={
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="btn-primary cursor-pointer"
          >
            <Plus size={15} />
            <span className="hidden sm:inline">Add position</span>
          </button>
        }
      />

      {staleNotice ? (
        <div className="mb-4">
          <Notice tone="warn" onDismiss={() => setStaleNotice(null)}>
            Live prices temporarily unavailable. Your {staleNotice} position was saved
            successfully and is valued at your cost basis until quotes return.
          </Notice>
        </div>
      ) : null}

      {error && !data ? (
        <ErrorState error={error} onRetry={refetch} />
      ) : isEmpty ? (
        <Surface>
          <EmptyState
            icon={Briefcase}
            title={`No ${mode} positions`}
            description="Add your first holding and Everest will track live P&L, cost basis and allocation for you."
            action={
              <button
                type="button"
                onClick={() => setModalOpen(true)}
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
          <BookSummary
            positions={positions}
            totals={totals}
            mode={mode}
            loading={initialLoad}
          />

          {/* Only worth showing once there is enough to narrow. */}
          {positions.length > 4 ? (
            <Toolbar
              query={query}
              onQueryChange={setQuery}
              placeholder="Search holdings"
              sorts={SORTS}
              sort={sort}
              onSortChange={setSort}
              filters={sectors}
              filter={sector}
              onFilterChange={setSector}
              filterLabel="All sectors"
              count={visible.length}
              total={positions.length}
            />
          ) : null}

          {!initialLoad && visible.length === 0 ? (
            <Surface>
              <EmptyState
                title="No holdings match those filters"
                description="Try a different search term or clear the sector filter."
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
            <HoldingsLedger
              positions={visible}
              totalValue={totals.marketValue}
              onRemove={remove}
              removingId={deleting}
              loading={initialLoad}
            />
          )}
        </>
      )}

      <AddPositionModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onAdded={handleAdded}
      />
    </div>
  )
}
