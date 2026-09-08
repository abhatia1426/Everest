import { useEffect, useRef, useState } from 'react'
import { Plus, Sparkles } from 'lucide-react'

import { fmtPercent, fmtSignedMoney } from '../../lib/format'
import { SPECTRUM_TRACK_WIDTH, layoutSpectrum, spectrumTicks } from '../../lib/monitor'
import { getMarketStatus } from '../../lib/marketStatus'

/**
 * Today's Moves — the Watchlist's signature visualisation, and the reason this
 * page is a monitor rather than a list.
 *
 * ONE DIVERGING PERCENTAGE AXIS. Losers left, gainers right, zero centred and
 * marked with a hatched band. Every symbol on the watchlist is a pill at its
 * REAL day percentage, stemmed back to the axis, packed into four lanes so
 * neighbours do not overlap. The axis rescales to the session's own widest
 * move, so a quiet day is not flattened into the middle and a violent one is
 * not clipped at the edges.
 *
 * The geometry is the approved file's, unchanged wherever the track is wide
 * enough for it: 122px tall, the axis at y=100, four 24px lanes above it, a
 * 22px hatched zero band, and five ticks at ±max, ±half and zero.
 *
 * BELOW A 760px TRACK the axis grows to six lanes and the plot grows with it.
 * That is the one responsive concession the spectrum makes, and it is a
 * measured necessity rather than a preference: pills keep their pixel width
 * while the track shrinks, so at 660px four lanes produced six overlapping
 * pairs. Above that threshold this file lays out exactly as the approved one.
 *
 * NO SCORES ANYWHERE. A pill's position is the day's percentage and nothing
 * else; the hover card states the move, the dollar change and the symbol's own
 * 30-session average day, which is the only context that makes a percentage
 * mean anything. It does not rank, rate or explain why anything moved.
 *
 * A symbol with no current quote is not dropped from the axis — it is still on
 * the watchlist. It sits on zero, hatched and neutral, saying "no quote". That
 * is deliberately NOT the same as sitting on zero because it did not move:
 * hatching is this product's encoding for "not observed", and it survives
 * greyscale.
 */

/**
 * The plot's real width in CSS pixels.
 *
 * The packer needs it because a pill's width is fixed in pixels while its
 * clearance is expressed as a percentage of the track — so the same pill is a
 * far larger fraction of a 596px axis than of an 856px one. Measured rather
 * than inferred from a breakpoint, because the axis also narrows when the
 * stage is beside it rather than under it.
 */
function useTrackWidth() {
  const ref = useRef(null)
  const [width, setWidth] = useState(SPECTRUM_TRACK_WIDTH)

  useEffect(() => {
    const node = ref.current
    if (!node || typeof ResizeObserver === 'undefined') return undefined
    const observer = new ResizeObserver(([entry]) => {
      const next = Math.round(entry.contentRect.width)
      if (next > 0) setWidth(next)
    })
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  return [ref, width]
}

function directionColor(value) {
  if (typeof value !== 'number' || value === 0) return 'var(--text-tertiary)'
  return value > 0 ? 'var(--accent-green)' : 'var(--accent-red)'
}

function softColor(value) {
  return value >= 0 ? 'var(--up-soft)' : 'var(--down-soft)'
}

function SessionPill({ session }) {
  const tone = {
    open: 'var(--accent-green)',
    pre: 'var(--accent-amber)',
    post: 'var(--accent-amber)',
    closed: 'var(--text-tertiary)',
  }[session.state]

  return (
    <div
      className="flex items-center gap-1.5 rounded-full"
      style={{
        padding: '4px 10px 4px 8px',
        background: 'var(--glass-soft)',
        border: '1px solid var(--glass-soft-border)',
        backdropFilter: 'blur(14px)',
        WebkitBackdropFilter: 'blur(14px)',
      }}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${session.state === 'open' ? 'animate-pulse' : ''}`}
        style={{ background: tone }}
        aria-hidden="true"
      />
      <span className="text-[11.5px] font-bold tracking-[-0.01em] text-text-primary">
        {session.label}
      </span>
      <span className="text-[11px] text-text-tertiary">{session.detail}</span>
    </div>
  )
}

function HoverCard({ point, left }) {
  const { row } = point
  const measured = typeof row.changePercent === 'number'

  return (
    <div
      className="pointer-events-none absolute z-30 -translate-x-1/2 whitespace-nowrap rounded-[11px]"
      style={{
        left,
        top: -8,
        padding: '9px 13px',
        background: 'var(--tip-bg)',
        border: '1px solid var(--tip-border)',
        boxShadow: 'var(--shadow-e3)',
      }}
      role="status"
    >
      <div className="text-[12.5px] font-bold tracking-[-0.01em] text-white">
        {row.ticker} · {row.name}
      </div>
      <div className="mt-[3px] flex items-baseline gap-2">
        <span
          className="num font-display text-[15px] font-bold tracking-[-0.03em]"
          style={{ color: measured ? directionColor(row.changePercent) : 'rgba(255,255,255,.62)' }}
        >
          {measured ? fmtPercent(row.changePercent) : 'No quote'}
        </span>
        <span className="num text-[11.5px]" style={{ color: 'rgba(255,255,255,.62)' }}>
          {measured && row.change !== null ? `${fmtSignedMoney(row.change)} today` : ''}
        </span>
      </div>
      {/*
        The baseline, stated rather than implied. "+3.1%" is a different event
        for a symbol whose normal day is 0.6% than for one whose normal day is
        3%, and this is the only line on the card that makes the figure above
        it interpretable.
      */}
      <div className="mt-0.5 text-[11px]" style={{ color: 'rgba(255,255,255,.5)' }}>
        {row.averageDaily
          ? `30-session average day is ${row.averageDaily.toFixed(2)}%`
          : measured
            ? 'No 30-session history to compare against'
            : 'Showing the last close we hold'}
      </div>
    </div>
  )
}

export function TodaysMoves({
  rows,
  selected,
  onSelect,
  onAddTicker,
  onScreen,
  screenDisabled,
}) {
  const [hovered, setHovered] = useState(null)
  const [trackRef, trackWidth] = useTrackWidth()
  const session = getMarketStatus()
  const { points, maxAbs, axisY } = layoutSpectrum(rows, selected, { trackWidth })
  const ticks = spectrumTicks(maxAbs)

  const measured = rows.filter((row) => typeof row.changePercent === 'number')
  const up = measured.filter((row) => row.changePercent > 0).length
  const down = measured.filter((row) => row.changePercent < 0).length
  const widest = measured.reduce(
    (best, row) =>
      !best || Math.abs(row.changePercent) > Math.abs(best.changePercent) ? row : best,
    null,
  )

  const hoveredPoint = points.find((point) => point.ticker === hovered) || null

  return (
    <section
      className="relative shrink-0"
      style={{
        padding: '15px 20px 12px',
        borderRadius: 'var(--radius-surface)',
        background: 'var(--panel-bg)',
        boxShadow: 'var(--shadow-surface)',
      }}
      aria-label="Today's moves"
    >
      <div className="mb-1.5 flex flex-wrap items-center gap-3">
        <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-text-tertiary">
          Today&rsquo;s moves
        </span>

        <SessionPill session={session} />

        {/* Counts are of MEASURED moves only. A symbol with no quote is
            neither up nor down, and folding it into either count would make
            the sentence a guess. */}
        <span className="text-[12px] text-text-secondary">
          {measured.length === 0 ? (
            'No measured moves yet today'
          ) : (
            <>
              <strong className="font-bold text-up">{up} up</strong> ·{' '}
              <strong className="font-bold text-down">{down} down</strong>
              {widest ? (
                <>
                  {' '}
                  · widest move is{' '}
                  <strong className="num font-bold text-text-primary">
                    {widest.ticker} {fmtPercent(widest.changePercent)}
                  </strong>
                </>
              ) : null}
            </>
          )}
        </span>

        <div className="flex-1" />

        <button
          type="button"
          onClick={onScreen}
          disabled={screenDisabled}
          className="flex shrink-0 cursor-pointer items-center gap-1.5 rounded-full text-[12px]
            font-semibold text-text-tertiary transition-colors duration-150
            hover:text-text-secondary disabled:cursor-default disabled:opacity-50"
          style={{ padding: '7px 4px' }}
        >
          <Sparkles size={13} strokeWidth={1.6} />
          <span className="max-[560px]:hidden">Screen with AI</span>
        </button>

        <button
          type="button"
          onClick={onAddTicker}
          className="flex shrink-0 cursor-pointer items-center gap-[7px] rounded-full text-[13px]
            font-bold tracking-[-0.01em] transition-colors duration-150"
          style={{
            padding: '8px 15px',
            background: 'var(--accent-blue)',
            color: 'var(--brand-ink)',
            boxShadow: '0 8px 20px -10px var(--accent-blue)',
          }}
        >
          <Plus size={13} strokeWidth={2.4} />
          <span className="max-[420px]:hidden">Add ticker</span>
        </button>
      </div>

      {/* Height follows the lane count: the axis must clear the lanes above
          it, and a narrow track uses two more of them. */}
      <div ref={trackRef} className="relative mx-1.5" style={{ height: axisY + 22 }}>
        {/* The axis itself. */}
        <span
          className="absolute left-0 right-0 h-px"
          style={{ top: axisY, background: 'var(--border-strong)' }}
          aria-hidden="true"
        />

        {/* The zero band — hatched, because "flat" is a region on this axis,
            not a line, and the pills nearest it are the ones the reader must
            not misread as movers. */}
        <span
          className="absolute -translate-x-1/2 hatch-dim"
          style={{
            left: '50%',
            top: 0,
            bottom: 18,
            width: 22,
            borderLeft: '1px solid var(--border-strong)',
            borderRight: '1px solid var(--border-strong)',
          }}
          aria-hidden="true"
        />

        {ticks.map((tick) => (
          <span key={tick.fraction}>
            <span
              className="absolute w-px -translate-x-1/2"
              style={{ left: tick.left, top: axisY, height: 5, background: 'var(--border-strong)' }}
              aria-hidden="true"
            />
            <span
              className="num absolute bottom-0 -translate-x-1/2 whitespace-nowrap font-display
                text-[10px] tracking-[-0.01em]"
              style={{
                left: tick.left,
                fontWeight: tick.fraction === 0 ? 800 : 600,
                color: tick.fraction === 0 ? 'var(--text-secondary)' : 'var(--text-tertiary)',
              }}
            >
              {tick.label}
            </span>
          </span>
        ))}

        {points.map((point) => {
          const { row } = point
          const on = point.selected
          const hover = point.ticker === hovered
          const measuredRow = point.measured
          const color = measuredRow ? directionColor(row.changePercent) : 'var(--text-tertiary)'

          return (
            <span key={row.ticker}>
              <span
                className="absolute w-px -translate-x-1/2"
                style={{
                  left: point.left,
                  top: point.stemTop,
                  height: point.stemHeight,
                  background: on ? 'var(--accent-blue)' : color,
                  opacity: on ? 0.9 : point.showPercent ? 0.5 : 0.22,
                  zIndex: 2,
                }}
                aria-hidden="true"
              />
              <button
                type="button"
                onClick={() => onSelect(row.ticker)}
                onMouseEnter={() => setHovered(row.ticker)}
                onMouseLeave={() => setHovered(null)}
                onFocus={() => setHovered(row.ticker)}
                onBlur={() => setHovered(null)}
                aria-pressed={on}
                title={
                  measuredRow
                    ? `${row.ticker} ${fmtPercent(row.changePercent)} today`
                    : `${row.ticker} — no current quote`
                }
                className={`absolute flex -translate-x-1/2 cursor-pointer items-center gap-[5px]
                  rounded-full transition-[filter] duration-150 hover:brightness-125 ${
                    measuredRow ? '' : 'hatch-dim'
                  }`}
                style={{
                  left: point.left,
                  top: point.top,
                  padding: '3px 9px',
                  zIndex: on ? 20 : hover ? 18 : 6 + point.lane,
                  backgroundColor: on
                    ? 'var(--accent-blue)'
                    : measuredRow
                      ? softColor(row.changePercent)
                      : 'var(--nested-bg)',
                  border: `1px solid ${
                    on
                      ? 'var(--accent-blue)'
                      : measuredRow
                        ? 'transparent'
                        : 'var(--border-strong)'
                  }`,
                  boxShadow: on ? '0 8px 18px -8px var(--accent-blue)' : 'none',
                }}
              >
                <span
                  className="num whitespace-nowrap font-display text-[11px] tracking-[-0.02em]"
                  style={{
                    fontWeight: point.showPercent ? 800 : 700,
                    color: on ? 'var(--brand-ink)' : color,
                  }}
                >
                  {row.ticker}
                </span>
                {point.showPercent ? (
                  <span
                    className="num whitespace-nowrap text-[10px] font-bold"
                    style={{ color: on ? 'rgba(255,255,255,.82)' : color }}
                  >
                    {fmtPercent(row.changePercent)}
                  </span>
                ) : null}
              </button>
            </span>
          )
        })}

        {hoveredPoint ? <HoverCard point={hoveredPoint} left={hoveredPoint.left} /> : null}
      </div>
    </section>
  )
}
