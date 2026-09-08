import { useCallback, useEffect, useMemo } from 'react'

import { StaggerGroup, StaggerItem } from '../../components/Motion'
import { ErrorState } from '../../components/States'
import { ActivityPanel } from '../../components/dashboard/ActivityPanel'
import { AllocationPanel } from '../../components/dashboard/AllocationPanel'
import { DailyNetPanel } from '../../components/dashboard/DailyNetPanel'
import { HoldingsPanel } from '../../components/dashboard/HoldingsPanel'
import { InsightRail } from '../../components/dashboard/InsightRail'
import { MoversPanel } from '../../components/dashboard/MoversPanel'
import { NewsroomPanel } from '../../components/dashboard/NewsroomPanel'
import { PortfolioInstrument } from '../../components/dashboard/PortfolioInstrument'
import { TickerStrip } from '../../components/dashboard/TickerStrip'
import { useApi } from '../../hooks/useApi'
import { TTL } from '../../lib/cache'
import { useBookStatePublisher } from '../../hooks/useBookState'
import { useMode } from '../../hooks/useMode'
import { useWatchlist } from '../../hooks/useWatchlist'
import { api } from '../../lib/api'
import { deriveInsights } from '../../lib/insights'
import { QUOTE_STATE, aggregateQuoteState, normalizeQuote } from '../../lib/quotes'

/**
 * The Dashboard, composed to the approved `Everest Dashboard v2` design.
 *
 * FOUR BANDS, asymmetric, full-bleed:
 *
 *   1. the value panel + the blue performance field   (0.86fr / 1.9fr)
 *   2. the watchlist tape                             (full width)
 *   3. holdings / allocation / [movers + needs a look] (1.62 / 0.82 / 0.72)
 *   4. activity / daily net / newsroom                 (1 / 1.05 / 0.9)
 *
 * The lopsided ratios are the point. Three equal columns is the generic SaaS
 * grid this redesign exists to leave behind; unequal ones say which object is
 * the subject of each band before a single label is read.
 *
 * ROW 4 IS PRESENT, AND THAT IS A CORRECTION.
 *
 * An earlier pass deleted all three of its modules because the mockup's
 * contents were unsupported — a BUY/SELL/DIV/DEP ledger with amounts, a cash
 * weight, and invented headlines. Deleting the modules was the wrong remedy
 * for the right observation. Unsupported CONTENT is a reason for an honest
 * unavailable state; it is not a reason to change the page's silhouette. Each
 * module now keeps its approved geometry and carries only what Everest can
 * actually measure:
 *
 *   · Activity   — the three creation events /activity genuinely emits, dated
 *                  rather than priced. No trades, dividends or transfers.
 *   · Daily net  — real session-over-session differences of the same
 *                  reconstructed history the performance field plots, sharing
 *                  its cache entry so it costs no extra request.
 *   · Newsroom   — real provider headlines for the largest holding, not the
 *                  mockup's placeholder bars.
 *
 * CASH IS GONE FROM THIS PAGE ENTIRELY — metric tile, ledger row, treemap tile
 * and cash-weight observation.
 *
 * Everest models no cash balance anywhere: not on the user, not in /portfolio,
 * not in /pnl. An earlier pass kept the design's cash slots and filled them
 * with em dashes, which was the wrong read of "preserve the region": an empty
 * placeholder still asserts that cash is a supported concept which merely
 * failed to load. It is not unavailable, it does not exist, and the honest
 * rendering of a concept the product does not have is its absence.
 *
 * Consequently the positions ARE the portfolio here, so allocation weights are
 * portfolio weights with nothing silently excluded, and the 2x2 reads
 * Cost basis / Holdings over Total return / Best today at the approved
 * geometry. This is a DATA-REQUIRED deviation from Dashboard v2.
 *
 * Data fetching is unchanged: same endpoints, same 30s poll, same paper/real
 * mode, same stale-price fallback, same all-or-nothing history contract.
 */
export default function Dashboard() {
  const { mode } = useMode()
  const { publish, clear } = useBookStatePublisher()

  // One shared watchlist for the whole shell — no second poll from here.
  const { items: watchlistItems, loading: watchlistLoading } = useWatchlist()

  const pnlFetcher = useCallback(() => api.pnl(mode), [mode])
  const { data: pnl, loading, error, refetch } = useApi(pnlFetcher, [mode], {
    key: `pnl:${mode}`,
    ttl: TTL.QUOTE,
    pollMs: 30000,
  })

  const positions = useMemo(() => pnl?.positions || [], [pnl])

  /*
   * Book-level quote confidence, via the canonical normaliser rather than a
   * bespoke `every(p => p.price_stale)`. A total is only as trustworthy as its
   * least trustworthy component, which is exactly what aggregateQuoteState
   * encodes — and it means the hero figure can never claim more confidence
   * than the ledger rows it is the sum of.
   */
  const bookQuoteState = useMemo(
    () => aggregateQuoteState(positions.map((p) => normalizeQuote(p, { costBasis: p.avg_cost }))),
    [positions],
  )
  /*
   * Two signals, one conclusion — and the second one is NOT a competing quote
   * system.
   *
   * `aggregateQuoteState` remains the authority on quote confidence. But the
   * backend's cost-basis fallback is invisible to it: `_enrich` substitutes
   * `avg_cost` INTO `current_price` and raises `price_stale`, so
   * `normalizeQuote` sees a present price plus a stale flag and correctly
   * classifies it CACHED — never COST_BASIS, which only fires when no price
   * arrives at all. The book therefore rendered under "Total portfolio" while
   * every figure in it was actually cost basis.
   *
   * `price_stale` is the backend's own contract for "this row is valued at
   * cost", so it is read here for exactly that, once, alongside the canonical
   * state rather than instead of it.
   */
  const allAtCost = positions.length > 0 && positions.every((p) => p.price_stale)
  const pricesStale =
    positions.length > 0 &&
    (bookQuoteState === QUOTE_STATE.COST_BASIS ||
      bookQuoteState === QUOTE_STATE.UNAVAILABLE ||
      allAtCost)

  /*
   * Publish the aggregate to the chrome, which renders it once for the whole
   * page. Cleared on unmount so the indicator does not linger over a route
   * that has no book.
   */
  useEffect(() => {
    if (positions.length === 0) {
      clear()
      return undefined
    }
    publish({ state: bookQuoteState, positionCount: positions.length })
    return () => clear()
  }, [bookQuoteState, positions.length, publish, clear])

  const insights = useMemo(
    () => deriveInsights({ pnl, watchlist: watchlistItems }),
    [pnl, watchlistItems],
  )

  if (error && !pnl) return <ErrorState error={error} onRetry={refetch} />

  const initialLoad = loading && !pnl

  return (
    <StaggerGroup className="flex flex-col gap-3.5">
      {/* --- 1. Value + performance field ----------------------------- */}
      <StaggerItem>
        <PortfolioInstrument
          pnl={pnl}
          positions={positions}
          loading={initialLoad}
          pricesStale={pricesStale}
          mode={mode}
        />
      </StaggerItem>

      {/* --- 2. The tape ---------------------------------------------- */}
      <StaggerItem>
        <TickerStrip items={watchlistItems} loading={watchlistLoading} />
      </StaggerItem>

      {/* --- 3. The analysis ------------------------------------------ */}
      {/* Design row 3: `minmax(0,1.62fr) minmax(280px,.82fr) minmax(260px,.72fr)`,
          collapsing at the shell's own 1240px breakpoint rather than at `xl`. */}
      <div className="grid grid-cols-1 gap-3.5 min-[1241px]:grid-cols-[minmax(0,1.62fr)_minmax(280px,0.82fr)_minmax(260px,0.72fr)] min-[1241px]:items-start">
        <StaggerItem className="min-w-0">
          {/* The watchlist is already loaded for the tape above; passing it
              down lets the 30d column show a real series for any holding the
              user also watches, at no additional request. */}
          <HoldingsPanel
            positions={positions}
            totalValue={pnl?.total_value || 0}
            loading={initialLoad}
            watchlistItems={watchlistItems}
          />
        </StaggerItem>

        <StaggerItem className="min-w-0">
          <AllocationPanel positions={positions} loading={initialLoad} />
        </StaggerItem>

        {/* The narrow column carries two short modules rather than one tall
            one — it is the only place in the composition where stacking
            reads as intentional. */}
        <StaggerItem className="flex min-w-0 flex-col gap-3.5">
          <MoversPanel positions={positions} loading={initialLoad} />
          <InsightRail insights={insights} loading={initialLoad} />
        </StaggerItem>
      </div>

      {/* --- 4. The record ------------------------------------------- */}
      {/* Design row 4: `minmax(0,1fr) minmax(0,1.05fr) minmax(0,.9fr)`, and
          the same 1240px collapse to a single column as rows 1 and 3. */}
      <div className="grid grid-cols-1 gap-3.5 min-[1241px]:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)_minmax(0,0.9fr)] min-[1241px]:items-start">
        <StaggerItem className="min-w-0">
          <ActivityPanel mode={mode} />
        </StaggerItem>

        <StaggerItem className="min-w-0">
          <DailyNetPanel mode={mode} />
        </StaggerItem>

        <StaggerItem className="min-w-0">
          <NewsroomPanel positions={positions} loading={initialLoad} />
        </StaggerItem>
      </div>
    </StaggerGroup>
  )
}
