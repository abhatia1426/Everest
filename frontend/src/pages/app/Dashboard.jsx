import { useCallback, useMemo } from 'react'

import { StaggerGroup, StaggerItem } from '../../components/Motion'
import { ErrorState } from '../../components/States'
import { ActivityFeed } from '../../components/dashboard/ActivityFeed'
import { AllocationPanel } from '../../components/dashboard/AllocationPanel'
import { CommandBar } from '../../components/dashboard/CommandBar'
import { HoldingsPanel } from '../../components/dashboard/HoldingsPanel'
import { InsightRail } from '../../components/dashboard/InsightRail'
import { MarketStrip } from '../../components/dashboard/MarketStrip'
import { MoversPanel } from '../../components/dashboard/MoversPanel'
import { PerformancePanel } from '../../components/dashboard/PerformancePanel'
import { WatchlistPanel } from '../../components/dashboard/WatchlistPanel'
import { useApi } from '../../hooks/useApi'
import { TTL } from '../../lib/cache'
import { useMode } from '../../hooks/useMode'
import { useWatchlist } from '../../hooks/useWatchlist'
import { api } from '../../lib/api'
import { deriveInsights, splitMovers } from '../../lib/insights'
import { QUOTE_STATE, aggregateQuoteState, normalizeQuote } from '../../lib/quotes'

/**
 * The command center.
 *
 * COMPOSITION, not decoration. v2 stacked seven full-width bands in identical
 * card chrome, so nothing was subordinate to anything and the page read as a
 * scroll. Here a twelve-column bento gives every row an unequal split —
 * 12 / 8+4 / 7+5 / 5+4+3 — and hierarchy comes from *span*, which survives a
 * theme change in a way that borders and shadows do not.
 *
 * The reading order is a deliberate argument:
 *   1. market context   — what is the world doing (strip, not a card)
 *   2. portfolio value  — what am I worth (the single hero-size element)
 *   3. performance      — how did I get here
 *   4. holdings/movers  — what do I own, what moved
 *   5. insights/watch   — what deserves attention next
 *
 * Data fetching is unchanged from v2: same endpoints, same 30s poll, same
 * paper/real mode, same stale-price fallback.
 */
export default function Dashboard() {
  const { mode } = useMode()

  // One shared watchlist for the whole shell — no second poll from here.
  const { items: watchlistItems, loading: watchlistLoading } = useWatchlist()

  const pnlFetcher = useCallback(() => api.pnl(mode), [mode])
  const { data: pnl, loading, error, refetch } = useApi(pnlFetcher, [mode], { key: `pnl:${mode}`, ttl: TTL.QUOTE, pollMs: 30000 })

  const { data: activityData, loading: activityLoading } = useApi(() => api.activity(8), [], { key: 'activity:8', ttl: TTL.ACTIVITY })

  const positions = useMemo(() => pnl?.positions || [], [pnl])

  /*
   * Book-level quote confidence, via the canonical normaliser rather than a
   * bespoke `every(p => p.price_stale)`. A total is only as trustworthy as its
   * least trustworthy component, which is exactly what aggregateQuoteState
   * encodes — and it means the hero figure can never claim more confidence
   * than the ledger rows it is the sum of.
   */
  const bookQuoteState = useMemo(
    () =>
      aggregateQuoteState(
        positions.map((p) => normalizeQuote(p, { costBasis: p.avg_cost })),
      ),
    [positions],
  )
  const pricesStale =
    positions.length > 0 &&
    (bookQuoteState === QUOTE_STATE.COST_BASIS || bookQuoteState === QUOTE_STATE.UNAVAILABLE)

  // Movers span holdings *and* watchlist — "what changed today" is not limited
  // to what you own.
  const movers = useMemo(() => {
    const combined = [
      ...positions.map((p) => ({ ...p, price: p.current_price })),
      ...watchlistItems,
    ]
    const seen = new Set()
    const unique = combined.filter((row) => {
      if (seen.has(row.ticker)) return false
      seen.add(row.ticker)
      return true
    })
    return splitMovers(unique)
  }, [positions, watchlistItems])

  const insights = useMemo(
    () => deriveInsights({ pnl, watchlist: watchlistItems }),
    [pnl, watchlistItems],
  )

  if (error && !pnl) return <ErrorState error={error} onRetry={refetch} />

  const initialLoad = loading && !pnl

  return (
    <div className="mx-auto max-w-[1440px]">
      <MarketStrip />

      <StaggerGroup className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-8 xl:grid-cols-12">
        {/* --- 1. What am I worth -------------------------------------- */}
        <StaggerItem className="md:col-span-8 xl:col-span-12">
          <CommandBar pnl={pnl} loading={initialLoad} pricesStale={pricesStale} />
        </StaggerItem>

        {/* --- 2. How did I get here ----------------------------------- */}
        <StaggerItem className="md:col-span-8 xl:col-span-8">
          <PerformancePanel mode={mode} />
        </StaggerItem>

        <StaggerItem className="md:col-span-8 xl:col-span-4">
          <AllocationPanel allocation={pnl?.allocation} loading={initialLoad} />
        </StaggerItem>

        {/* --- 3. What do I own, and what moved ------------------------ */}
        <StaggerItem className="md:col-span-8 xl:col-span-7">
          <HoldingsPanel
            positions={positions}
            totalValue={pnl?.total_value || 0}
            loading={initialLoad}
          />
        </StaggerItem>

        <StaggerItem className="md:col-span-8 xl:col-span-5">
          <MoversPanel {...movers} loading={initialLoad} />
        </StaggerItem>

        {/* --- 4. What deserves attention next ------------------------- */}
        <StaggerItem className="md:col-span-5 xl:col-span-5">
          <InsightRail insights={insights} loading={initialLoad} />
        </StaggerItem>

        <StaggerItem className="md:col-span-3 xl:col-span-4">
          <WatchlistPanel items={watchlistItems} loading={watchlistLoading} />
        </StaggerItem>

        <StaggerItem className="md:col-span-8 xl:col-span-3">
          <ActivityFeed events={activityData?.events || []} loading={activityLoading} />
        </StaggerItem>
      </StaggerGroup>
    </div>
  )
}
