import { useCallback, useMemo } from 'react'

import { Skeleton } from '../States'
import { useApi } from '../../hooks/useApi'
import { TTL } from '../../lib/cache'
import { api } from '../../lib/api'
import { fmtSignedMoney } from '../../lib/format'

/**
 * Daily net — row 4, centre column of the approved Dashboard.
 *
 * Geometry from `Everest Dashboard v2.dc.html`:
 *   panel   padding 20px, header h2 Archivo 700 19px -0.035em + 11.5px meta
 *   figure  Archivo 800 30px -0.045em, 14px above, with a 12.5px dim caption
 *   dots    `repeat(15,1fr)`, gap 6px, `aspect-ratio:1`, 4px radius, 16px above
 *   legend  16px above, 11px faint, up/down swatches at 10px/3px radius, and
 *           the largest single day pushed right
 *
 * Unlike Activity, this module is fully supported: it is one session-over-
 * session difference of the same reconstructed history the performance field
 * already plots, so it costs no extra request — `useApi` is keyed to the exact
 * cache entry `PerformanceChart` fills for its default 1M range.
 *
 * WHAT A DOT MEANS. The series is hourly inside a month, so a raw point-to-
 * point difference would produce intraday steps, not sessions. Each calendar
 * date is collapsed to its LAST observation before differencing, which is what
 * makes "one dot is one session" true rather than approximately true.
 *
 * The all-or-nothing history contract is inherited, not re-litigated: when the
 * backend withholds the series because a holding has no candles, this module
 * says so and names the symbols rather than differencing a partial book.
 */

/** Collapse an hourly/daily series to one closing value per calendar date. */
export function toSessions(points) {
  const byDate = new Map()

  for (const point of points) {
    const time = new Date(point.time).getTime()
    if (Number.isNaN(time) || typeof point.value !== 'number') continue

    const date = new Date(time)
    const key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
    // Sorted ascending by the backend, so the last write per key is the close.
    byDate.set(key, { key, time, value: point.value })
  }

  return [...byDate.values()].sort((a, b) => a.time - b.time)
}

/** Session-over-session change. n sessions yield n-1 nets. */
export function toNets(sessions) {
  const nets = []
  for (let i = 1; i < sessions.length; i += 1) {
    nets.push({
      time: sessions[i].time,
      delta: sessions[i].value - sessions[i - 1].value,
    })
  }
  return nets
}

/**
 * The unavailable state, built to the module's OWN geometry rather than as a
 * paragraph dropped into an empty panel.
 *
 * The populated module is a stack: a 30px figure at `mt-3.5`, a dot grid at
 * `mt-4`, a legend at `mt-4`. Left as bare centred prose the panel lost all of
 * that structure and read as a large accidental blank — the shape said "broken
 * layout" while the words said "deliberately withheld".
 *
 * So the empty state keeps the same three tiers at the same rhythm:
 *
 *   figure   an em dash at the figure's exact size and tracking, so the eye
 *            lands where it lands in the populated module and finds a value
 *            that is explicitly absent rather than nothing at all
 *   grid     a muted 30-cell lattice at the real dot geometry, holding the
 *            module's height and showing what WOULD be filled. It is inert and
 *            uniform — no colour, no magnitude — so it can never be mistaken
 *            for data, which is precisely why it can be shown at all
 *   reason   the explanation in the legend's slot, naming the symbols
 */
function Unavailable({ missing, holdingsCount }) {
  const named = missing.slice(0, 4).join(', ')
  const overflow = missing.length > 4 ? ` +${missing.length - 4} more` : ''

  return (
    <>
      <div className="mt-3.5 flex items-baseline gap-2.5">
        <span className="num font-display text-[30px] font-extrabold leading-none tracking-[-0.045em] text-text-tertiary">
          —
        </span>
        <span className="text-[12.5px] text-text-secondary">
          {missing.length ? 'sessions withheld' : 'no sessions counted yet'}
        </span>
      </div>

      {/*
        A placeholder lattice, not a chart. Uniform, unsaturated, and drawn
        from a fixed count rather than from any series — there is no reading
        of it that yields a number.
      */}
      <div
        className="mt-4 grid gap-1.5"
        style={{ gridTemplateColumns: 'repeat(15,1fr)' }}
        aria-hidden="true"
      >
        {Array.from({ length: 30 }).map((_, i) => (
          <span
            key={i}
            style={{ aspectRatio: '1', borderRadius: 4, background: 'var(--track-bg)', opacity: 0.5 }}
          />
        ))}
      </div>

      <p className="mt-4 text-[11px] leading-relaxed text-text-tertiary">
        {missing.length ? (
          <>
            No price history for{' '}
            <span className="num font-semibold text-text-secondary">
              {named}
              {overflow}
            </span>
            {holdingsCount ? ` — ${missing.length} of ${holdingsCount} holdings. ` : '. '}
            Differencing the rest would count sessions for a portfolio you do not hold, so none are
            shown.
          </>
        ) : (
          'Two or more priced sessions are needed before daily nets can be counted.'
        )}
      </p>
    </>
  )
}

export function DailyNetPanel({ mode }) {
  /*
   * Same key and same period as the performance field's default range, so the
   * two modules share one cache entry and one network request rather than
   * asking the provider for the same month twice.
   */
  const fetcher = useCallback(() => api.portfolioHistory(mode, '1m'), [mode])
  const { data, loading, error } = useApi(fetcher, [mode, '1m'], {
    key: `pfhist:${mode}:1m`,
    ttl: TTL.HISTORY,
  })

  const nets = useMemo(() => toNets(toSessions(data?.series || [])), [data])

  const summary = useMemo(() => {
    if (nets.length === 0) return null
    const up = nets.filter((n) => n.delta >= 0).length
    const biggest = nets.reduce(
      (best, n) => (Math.abs(n.delta) > Math.abs(best.delta) ? n : best),
      nets[0],
    )
    const peak = Math.max(...nets.map((n) => Math.abs(n.delta))) || 1
    return { up, biggest: biggest.delta, peak }
  }, [nets])

  return (
    <section className="module" style={{ padding: 20 }}>
      <div className="flex items-center gap-2.5">
        <h2 className="font-display text-[19px] font-bold tracking-[-0.035em] text-text-primary">
          Daily net
        </h2>
        <span className="text-[11.5px] text-text-tertiary">each dot is one session</span>
      </div>

      {loading && !data ? (
        <div className="mt-3.5">
          <Skeleton className="h-8 w-40" />
          <div className="mt-4 grid gap-1.5" style={{ gridTemplateColumns: 'repeat(15,1fr)' }}>
            {Array.from({ length: 30 }).map((_, i) => (
              <Skeleton key={i} className="rounded" style={{ aspectRatio: '1' }} />
            ))}
          </div>
        </div>
      ) : error || !summary ? (
        <Unavailable
          missing={data?.missing || []}
          holdingsCount={data?.holdings_count || 0}
        />
      ) : (
        <>
          <div className="mt-3.5 flex items-baseline gap-2.5">
            <span className="num font-display text-[30px] font-extrabold leading-none tracking-[-0.045em] text-text-primary">
              {summary.up}
            </span>
            <span className="text-[12.5px] text-text-secondary">
              up {summary.up === 1 ? 'session' : 'sessions'} of {nets.length}
            </span>
          </div>

          <div className="mt-4 grid gap-1.5" style={{ gridTemplateColumns: 'repeat(15,1fr)' }}>
            {nets.map((net) => {
              // Magnitude scales the tint against the neutral track, so the
              // grid encodes SIZE as well as direction — a flat session and a
              // record day are not the same square.
              const magnitude = Math.min(1, Math.abs(net.delta) / summary.peak)
              const base = net.delta >= 0 ? 'var(--accent-green)' : 'var(--accent-red)'
              return (
                <span
                  key={net.time}
                  title={`${new Date(net.time).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                  })} · ${fmtSignedMoney(net.delta)}`}
                  style={{
                    aspectRatio: '1',
                    borderRadius: 4,
                    background: `color-mix(in oklab, ${base} ${Math.round(
                      28 + magnitude * 72,
                    )}%, var(--track-bg))`,
                  }}
                />
              )
            })}
          </div>

          <div className="mt-4 flex items-center gap-3.5 text-[11px] text-text-tertiary">
            <span className="flex items-center gap-1.5">
              <span
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: 3,
                  background: 'var(--accent-green)',
                }}
              />
              up
            </span>
            <span className="flex items-center gap-1.5">
              <span
                style={{ width: 10, height: 10, borderRadius: 3, background: 'var(--accent-red)' }}
              />
              down
            </span>
            <span className="num ml-auto">largest single day {fmtSignedMoney(summary.biggest)}</span>
          </div>

          {/* The same disclosure the performance field carries. These dots are
              today's holdings priced backwards, not sessions the account
              actually lived through. */}
          <p className="mt-3 text-[11px] leading-relaxed text-text-tertiary">
            Today’s holdings priced back over the past month — not account history.
          </p>
        </>
      )}
    </section>
  )
}
