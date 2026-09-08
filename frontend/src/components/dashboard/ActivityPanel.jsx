import { useCallback, useMemo } from 'react'

import { Skeleton } from '../States'
import { useApi } from '../../hooks/useApi'
import { TTL } from '../../lib/cache'
import { api } from '../../lib/api'

/**
 * Activity — row 4, left column of the approved Dashboard.
 *
 * Geometry from `Everest Dashboard v2.dc.html`:
 *   panel   padding 20px, module radius, header h2 Archivo 700 19px -0.035em
 *           with an 11.5px faint meta beside it
 *   row     grid `40px minmax(0,1fr) auto`, gap 11px, padding 11px 0, hairline
 *   kind    9.5px/800, +0.05em, centred, 7px radius, tinted background
 *   line    12.5px/700 -0.01em, truncating; sub 11px faint, truncating
 *   right   Archivo 12.5px/700, nowrap
 *
 * WHAT FILLS IT IS NOT WHAT THE MOCKUP DREW, and that is a data decision.
 *
 * The design shows BUY / SELL / DIV / DEP with signed dollar amounts. The real
 * `/activity` endpoint has no such feed: it has no events collection at all,
 * and synthesises a list from the `created_at` already stored on positions,
 * options and watchlist rows. Its own docstring says so. There are no sells,
 * no dividends, no transfers and no transaction amounts anywhere in Everest,
 * so every one of the mockup's five rows would have to be typed in.
 *
 * The module therefore keeps its approved geometry and renders the three event
 * kinds that genuinely exist. The right-hand slot carries the event's real
 * timestamp rather than a dollar figure — an amount there would read as a cash
 * movement, which is exactly the claim we cannot make.
 */

/**
 * The event kinds `/activity` actually emits.
 *
 * Tone is assigned by MEANING, not by variety: adding a position or an option
 * is a book change and takes brand blue; a watchlist add changes nothing about
 * the book and stays neutral. Green and red are reserved for direction and are
 * deliberately unused here — none of these events have a P/L sign.
 */
const KINDS = {
  position_added: {
    label: 'ADD',
    color: 'var(--accent-blue)',
    bg: 'var(--brand-soft)',
    line: (event) => `Added ${event.ticker}`,
  },
  option_added: {
    label: 'OPT',
    color: 'var(--accent-blue)',
    bg: 'var(--brand-soft)',
    line: (event) => `Added ${event.ticker} option`,
  },
  watchlist_added: {
    label: 'WATCH',
    color: 'var(--text-secondary)',
    bg: 'var(--nested-bg)',
    line: (event) => `Watching ${event.ticker}`,
  },
}

/** Describe the record itself — never as a transaction. */
function describe(event) {
  const detail = event.detail || {}

  if (event.type === 'position_added') {
    const qty = typeof detail.qty === 'number' ? detail.qty : null
    const cost = typeof detail.avg_cost === 'number' ? detail.avg_cost : null
    if (qty !== null && cost !== null) {
      return `${qty % 1 === 0 ? qty : qty.toFixed(2)} sh at $${cost.toFixed(2)} average cost`
    }
    return 'position recorded'
  }

  if (event.type === 'option_added') {
    const parts = [detail.type, detail.strike ? `$${detail.strike}` : null, detail.expiry]
    const named = parts.filter(Boolean).join(' · ')
    return named || 'option recorded'
  }

  return 'added to watchlist'
}

/** Short, absolute date. Relative time would go stale in a cached panel. */
function shortDate(iso) {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export function ActivityPanel({ mode }) {
  const fetcher = useCallback(() => api.activity(8), [])
  const { data, loading, error } = useApi(fetcher, [], {
    key: 'activity:8',
    ttl: TTL.QUOTE,
  })

  /*
   * Events carry the mode they were created under (watchlist entries carry
   * null, because the watchlist is shared across both books). Filtering here
   * keeps the panel consistent with every other figure on the page, which is
   * already scoped to the active book.
   */
  const events = useMemo(() => {
    const all = data?.events || []
    return all.filter((event) => event.mode == null || event.mode === mode).slice(0, 5)
  }, [data, mode])

  return (
    <section className="module" style={{ padding: 20 }}>
      <div className="flex items-center gap-2.5">
        <h2 className="font-display text-[19px] font-bold tracking-[-0.035em] text-text-primary">
          Activity
        </h2>
        <span className="text-[11.5px] text-text-tertiary">what you have recorded</span>
      </div>

      {loading && !data ? (
        <div className="mt-1.5 space-y-3 py-2">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-9 w-full" />
          ))}
        </div>
      ) : error || events.length === 0 ? (
        <p className="py-8 text-[13px] leading-relaxed text-text-secondary">
          {error
            ? 'Activity could not be loaded.'
            : 'Nothing recorded yet. Positions, options and watchlist entries appear here as you add them.'}
          <span className="mt-2 block text-[11.5px] text-text-tertiary">
            Everest keeps no transaction ledger — there are no trades, dividends or transfers to
            show.
          </span>
        </p>
      ) : (
        <>
          <div className="mt-1.5">
            {events.map((event) => {
              const kind = KINDS[event.type]
              if (!kind) return null

              return (
                <div
                  key={event.id}
                  className="grid items-center"
                  style={{
                    gridTemplateColumns: '40px minmax(0,1fr) auto',
                    gap: 11,
                    padding: '11px 0',
                    borderBottom: '1px solid var(--border)',
                  }}
                >
                  <span
                    className="text-center text-[9.5px] font-extrabold tracking-[0.05em]"
                    style={{
                      color: kind.color,
                      background: kind.bg,
                      borderRadius: 7,
                      padding: '4px 0',
                    }}
                  >
                    {kind.label}
                  </span>

                  <span className="min-w-0">
                    <span className="block truncate text-[12.5px] font-bold tracking-[-0.01em] text-text-primary">
                      {kind.line(event)}
                    </span>
                    <span className="num block truncate text-[11px] text-text-tertiary">
                      {describe(event)}
                    </span>
                  </span>

                  {/* The design puts a signed amount here. Everest records no
                      cash movement, so the slot carries the one fact the event
                      genuinely has: when it happened. */}
                  <span className="num whitespace-nowrap font-display text-[12.5px] font-bold text-text-secondary">
                    {shortDate(event.at)}
                  </span>
                </div>
              )
            })}
          </div>

          <p className="mt-3.5 text-[11px] leading-relaxed text-text-tertiary">
            Records you created, not a transaction ledger. Everest does not track trades, dividends
            or transfers.
          </p>
        </>
      )}
    </section>
  )
}
