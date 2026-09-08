import { useCallback, useMemo, useRef, useState } from 'react'

import { fmtCompact, fmtMoney, fmtPercent, fmtSignedMoney } from '../../lib/format'
import { smoothPath } from '../../lib/portfolio'
import {
  PRICE_H,
  VOL_TOP,
  axisLabels,
  costOverlay,
  formatStamp,
  gridLines,
  hasVolume,
  layoutBars,
  priceDomain,
  yFor,
} from '../../lib/priceSeries'

/**
 * The security chart — one implementation, two configurations.
 *
 * TICKER DETAIL IS THE SUPERSET: candles or line, a volume sub-band, a scrub
 * crosshair with an OHLC/volume/vs-cost readout, the cost-basis overlay, a
 * current-price marker and a sparse labelled grid. The compact configuration —
 * `variant="compact"` — is the same geometry with the extras switched off, so
 * a line drawn here and a line drawn on a preview surface cannot disagree about
 * where a price sits.
 *
 * WHY NOT `lightweight-charts`, which the previous page used. Three of this
 * page's approved requirements are not expressible in it: the cost-basis line
 * has to sit in the price domain WITHOUT widening that domain, the volume band
 * has to occupy an exact 18% of the plot so the 52-week gauge beside it aligns
 * to the price band, and out-of-domain cost has to become a caret badge rather
 * than a clamped line. Those are correctness behaviours, not decoration, and
 * fighting a canvas library for them would cost more than owning ~250 lines of
 * positioned DOM. The library is still the right tool for a zoomable,
 * pannable, multi-pane terminal; this page is neither.
 *
 * ALL GEOMETRY IS DELEGATED to `lib/priceSeries`, which is pure and tested.
 * This component positions elements and handles the pointer; it decides
 * nothing about what the data means.
 */

const EMPTY = []

function directionColor(value) {
  if (typeof value !== 'number' || value === 0) return 'var(--text-tertiary)'
  return value > 0 ? 'var(--accent-green)' : 'var(--accent-red)'
}

/**
 * The scrub readout. Everything in it is read off the hovered candle — no
 * interpolation between bars, because a price that was never printed should not
 * be quoted back to the reader.
 */
function ScrubCard({ bar, period, first, avgCost, shift, showOhlc, volumeAvailable }) {
  const { candle } = bar
  const change = first ? (candle.close / first - 1) * 100 : null
  const vsCost = typeof avgCost === 'number' && avgCost ? (candle.close / avgCost - 1) * 100 : null

  const rows = showOhlc
    ? [
        ['Open', fmtMoney(candle.open)],
        ['High', fmtMoney(candle.high)],
        ['Low', fmtMoney(candle.low)],
        ['Close', fmtMoney(candle.close)],
      ]
    : []

  return (
    <div
      className="pointer-events-none absolute z-20 min-w-[152px] rounded-[12px]"
      style={{
        left: `${bar.mid}%`,
        top: 4,
        transform: `translateX(${shift})`,
        padding: '10px 13px',
        background: 'var(--tip-bg)',
        border: '1px solid var(--tip-border)',
        boxShadow: 'var(--shadow-e3)',
      }}
      role="status"
    >
      <div className="flex items-center justify-between gap-3">
        <span className="whitespace-nowrap text-[11px]" style={{ color: 'rgba(247,247,249,.56)' }}>
          {formatStamp(new Date(candle.time), period, { long: true })}
        </span>
        {change === null ? null : (
          <span
            className="num whitespace-nowrap text-[11px] font-bold"
            style={{ color: directionColor(change) }}
          >
            {fmtPercent(change)}
          </span>
        )}
      </div>

      <div className="num mt-1 font-display text-[17px] font-bold tracking-[-0.035em] text-white">
        {fmtMoney(candle.close)}
      </div>

      {rows.length ? (
        <div
          className="mt-2 grid grid-cols-[auto_auto] gap-x-3.5 gap-y-[3px] pt-2"
          style={{ borderTop: '1px solid rgba(255,255,255,.1)' }}
        >
          {rows.map(([key, value]) => (
            <span key={key} className="contents">
              <span
                className="text-[10px] uppercase tracking-[0.06em]"
                style={{ color: 'rgba(247,247,249,.44)' }}
              >
                {key}
              </span>
              <span
                className="num text-right text-[11px] font-bold"
                style={{ color: 'rgba(247,247,249,.9)' }}
              >
                {value}
              </span>
            </span>
          ))}
        </div>
      ) : null}

      {/* Volume is stated only where the bar carries it. An em dash here is
          the honest answer for a provider that does not report per-bar size. */}
      <div className="mt-[7px] flex items-center justify-between gap-3.5">
        <span
          className="text-[10px] uppercase tracking-[0.06em]"
          style={{ color: 'rgba(247,247,249,.44)' }}
        >
          Vol
        </span>
        <span className="num text-[11px] font-bold" style={{ color: 'rgba(247,247,249,.9)' }}>
          {volumeAvailable && bar.volume > 0 ? fmtCompact(bar.volume) : '—'}
        </span>
      </div>

      {vsCost === null ? null : (
        <div className="mt-[3px] flex items-center justify-between gap-3.5">
          <span
            className="text-[10px] uppercase tracking-[0.06em]"
            style={{ color: 'rgba(247,247,249,.44)' }}
          >
            vs cost
          </span>
          <span className="num text-[11px] font-bold" style={{ color: directionColor(vsCost) }}>
            {fmtPercent(vsCost)}
          </span>
        </div>
      )}
    </div>
  )
}

export function SecurityChart({
  candles = EMPTY,
  period,
  mode = 'line',
  price = null,
  avgCost = null,
  showCost = true,
  variant = 'full',
  minHeight = 300,
  onScrubChange,
}) {
  const plotRef = useRef(null)
  const [scrubIndex, setScrubIndex] = useState(-1)

  const full = variant === 'full'
  const candleMode = mode === 'candle'

  const domain = useMemo(() => priceDomain(candles, { candleMode }), [candles, candleMode])
  const volumeAvailable = useMemo(() => hasVolume(candles), [candles])
  const bars = useMemo(() => layoutBars(candles, domain), [candles, domain])

  const closes = useMemo(
    () => candles.map((candle) => candle?.close).filter((v) => typeof v === 'number'),
    [candles],
  )
  // The line is drawn in a 1000-wide viewBox scaled to the price band only, so
  // it shares the vertical scale with the candles and the cost overlay.
  const linePath = useMemo(() => smoothPath(closes, 1000, PRICE_H * 10, 0), [closes])

  const changePercent =
    closes.length > 1 && closes[0] ? (closes[closes.length - 1] / closes[0] - 1) * 100 : null
  const seriesColor = directionColor(changePercent)

  const lastPrice = typeof price === 'number' ? price : closes[closes.length - 1]
  const lastY = yFor(lastPrice, domain)
  const grid = useMemo(() => gridLines(domain, lastY), [domain, lastY])
  const labels = useMemo(() => axisLabels(candles, period), [candles, period])

  const cost = useMemo(
    () => (showCost ? costOverlay(avgCost, domain) : null),
    [showCost, avgCost, domain],
  )

  const handleMove = useCallback(
    (event) => {
      const node = plotRef.current
      if (!node || bars.length === 0) return
      const rect = node.getBoundingClientRect()
      if (!rect.width) return
      const fraction = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width))
      const index = Math.min(bars.length - 1, Math.floor(fraction * bars.length))
      if (index !== scrubIndex) {
        setScrubIndex(index)
        onScrubChange?.(bars[index])
      }
    },
    [bars, scrubIndex, onScrubChange],
  )

  const handleLeave = useCallback(() => {
    setScrubIndex(-1)
    onScrubChange?.(null)
  }, [onScrubChange])

  if (!domain || candles.length < 2) {
    return (
      <div
        className="flex items-center justify-center"
        style={{ minHeight }}
        data-chart-empty="true"
      >
        {/*
          No line at all rather than a short one. A partial series stretched to
          the full width would put a two-week shape under a "past year" label.
        */}
        <p className="max-w-[280px] text-center text-[12px] text-text-tertiary">
          No price history available for this range.
        </p>
      </div>
    )
  }

  const scrubBar = scrubIndex >= 0 ? bars[scrubIndex] : null
  const scrubShift =
    scrubIndex < bars.length * 0.16
      ? '-6px'
      : scrubIndex > bars.length * 0.84
        ? 'calc(-100% + 6px)'
        : '-50%'

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <div
        ref={plotRef}
        onMouseMove={full ? handleMove : undefined}
        onMouseLeave={full ? handleLeave : undefined}
        className={`relative min-w-0 flex-1 ${full ? 'cursor-crosshair' : ''}`}
        style={{ minHeight }}
        data-plot="true"
      >
        {/* Sparse editorial grid — five lines, labelled on the right. */}
        {grid.map((line) => (
          <span key={line.y}>
            <span
              className="pointer-events-none absolute left-0 right-0 h-px"
              style={{ top: `${line.y}%`, background: 'var(--border)' }}
              aria-hidden="true"
            />
            {full ? (
              <span
                className="num pointer-events-none absolute right-0 -translate-y-1/2 pl-2 text-[10px] text-text-tertiary"
                style={{
                  top: `${line.y}%`,
                  background: 'var(--panel-bg)',
                  opacity: line.hidden ? 0 : 1,
                }}
                aria-hidden="true"
              >
                {fmtMoney(line.value)}
              </span>
            ) : null}
          </span>
        ))}

        {candleMode ? (
          bars.map((bar) => (
            <span key={bar.index}>
              <span
                className="pointer-events-none absolute w-px -translate-x-1/2"
                style={{
                  left: `${bar.mid}%`,
                  top: `${bar.wickTop}%`,
                  height: `${bar.wickHeight}%`,
                  background: bar.up ? 'var(--accent-green)' : 'var(--accent-red)',
                  opacity: 0.7,
                }}
                aria-hidden="true"
              />
              <span
                className="pointer-events-none absolute min-w-px rounded-[1px]"
                style={{
                  left: `${bar.left}%`,
                  width: `${bar.width}%`,
                  top: `${bar.bodyTop}%`,
                  height: `${bar.bodyHeight}%`,
                  background: bar.up ? 'var(--up-soft)' : 'var(--accent-red)',
                  border: `1px solid ${bar.up ? 'var(--accent-green)' : 'var(--accent-red)'}`,
                }}
                aria-hidden="true"
              />
            </span>
          ))
        ) : (
          <svg
            viewBox={`0 0 1000 ${PRICE_H * 10}`}
            preserveAspectRatio="none"
            className="pointer-events-none absolute inset-0 h-full w-full overflow-visible"
            aria-hidden="true"
            style={{ height: `${PRICE_H}%` }}
          >
            <path
              d={`${linePath} L1000 ${PRICE_H * 10} L0 ${PRICE_H * 10} Z`}
              fill={changePercent >= 0 ? 'var(--up-soft)' : 'var(--down-soft)'}
            />
            <path
              d={linePath}
              fill="none"
              stroke={seriesColor}
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
        )}

        {/*
          VOLUME, in both modes — it is a property of the bar, not of the
          rendering style. Where the provider reports none, the band keeps its
          geometry and says so rather than drawing a flat row of stubs that
          would read as "no shares traded".
        */}
        {volumeAvailable ? (
          bars.map((bar) => (
            <span
              key={`v${bar.index}`}
              className="pointer-events-none absolute min-w-px rounded-t-[1px]"
              style={{
                left: `${bar.left}%`,
                width: `${bar.width}%`,
                top: `${bar.volumeTop}%`,
                height: `${bar.volumeHeight}%`,
                background: bar.up ? 'var(--up-soft)' : 'var(--down-soft)',
              }}
              aria-hidden="true"
            />
          ))
        ) : (
          <span
            className="pointer-events-none absolute left-0 right-0 flex items-end text-[10px] text-text-tertiary"
            style={{ top: `${VOL_TOP}%`, bottom: 0 }}
          >
            Volume not reported for these bars
          </span>
        )}

        {full ? (
          <span
            className="pointer-events-none absolute left-0 text-[9px] font-semibold uppercase tracking-[0.1em] text-text-tertiary"
            style={{ top: `${VOL_TOP - 6}%` }}
          >
            Volume
          </span>
        ) : null}

        {/* The cost-basis line — drawn ONLY at its true coordinate. */}
        {cost?.inside ? (
          <span>
            <span
              className="pointer-events-none absolute left-0 right-0"
              style={{ top: `${cost.y}%`, borderTop: '1px dashed var(--accent-blue)', opacity: 0.8 }}
              aria-hidden="true"
            />
            <span
              className="num pointer-events-none absolute left-0 -translate-y-1/2 whitespace-nowrap rounded-[6px] text-[9.5px] font-extrabold uppercase tracking-[0.03em]"
              style={{
                top: `${cost.y}%`,
                padding: '2px 7px',
                background: 'var(--accent-blue)',
                color: 'var(--brand-ink)',
              }}
            >
              My cost {fmtMoney(cost.avgCost)}
            </span>
          </span>
        ) : null}

        {/*
          Out of domain: a caret badge, never a line clamped to the edge. A
          dashed rule at the boundary asserts "cost is at this price", which is
          false, and widening the domain to reach a basis far below the session
          would squeeze every bar into a strip.
        */}
        {cost && !cost.inside ? (
          <span
            title={`Average cost ${fmtMoney(cost.avgCost)} is ${cost.below ? 'below' : 'above'} the price range shown (${fmtMoney(cost.rangeLow)}–${fmtMoney(cost.rangeHigh)}), by ${fmtMoney(cost.distance)}. The chart scale is not stretched to reach it.`}
            className="num pointer-events-none absolute left-0 flex items-center gap-1.5 whitespace-nowrap rounded-[8px] text-[9.5px] font-extrabold uppercase tracking-[0.03em]"
            style={{
              top: cost.below ? `${PRICE_H}%` : '0%',
              transform: cost.below ? 'translateY(-100%) translateY(-4px)' : 'translateY(4px)',
              padding: '3px 8px',
              background: 'var(--nested-bg)',
              border: '1px dashed var(--accent-blue)',
              color: 'var(--accent-blue)',
            }}
          >
            <span className="text-[11px] leading-none">{cost.below ? '↓' : '↑'}</span>
            My cost {fmtMoney(cost.avgCost)}
            <span className="font-bold tracking-[0.02em] opacity-[0.72]">
              {cost.below ? 'below range' : 'above range'}
            </span>
          </span>
        ) : null}

        {/* Current price marker. */}
        {full && typeof lastY === 'number' ? (
          <span>
            <span
              className="pointer-events-none absolute left-0 right-0"
              style={{ top: `${lastY}%`, borderTop: '1px dashed var(--border-strong)' }}
              aria-hidden="true"
            />
            <span
              className="num pointer-events-none absolute right-0 -translate-y-1/2 whitespace-nowrap rounded-[6px] font-display text-[10.5px] font-bold tracking-[-0.02em]"
              style={{ top: `${lastY}%`, padding: '2px 7px', background: seriesColor, color: '#08080A' }}
            >
              {fmtMoney(lastPrice)}
            </span>
          </span>
        ) : null}

        {scrubBar ? (
          <span>
            <span
              className="pointer-events-none absolute top-0 bottom-0 w-px"
              style={{ left: `${scrubBar.mid}%`, background: 'var(--border-strong)' }}
              aria-hidden="true"
            />
            <span
              className="pointer-events-none absolute h-[9px] w-[9px] -translate-x-1/2 -translate-y-1/2 rounded-full"
              style={{
                left: `${scrubBar.mid}%`,
                top: `${yFor(scrubBar.candle.close, domain)}%`,
                background: seriesColor,
                boxShadow: '0 0 0 3px var(--panel-bg)',
              }}
              aria-hidden="true"
            />
            <ScrubCard
              bar={scrubBar}
              period={period}
              first={closes[0]}
              avgCost={avgCost}
              shift={scrubShift}
              showOhlc={candleMode}
              volumeAvailable={volumeAvailable}
            />
          </span>
        ) : null}
      </div>

      {full ? (
        <div className="mt-[9px] flex shrink-0 items-center gap-2.5">
          {labels.map((label, index) => (
            <span
              key={`${label.label}-${index}`}
              className="num flex-1 whitespace-nowrap text-[10px] text-text-tertiary"
              style={{ textAlign: label.align }}
            >
              {label.label}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  )
}

/** The absolute return over the plotted window, for callers that show it. */
export function windowChange(candles) {
  const closes = (candles || []).map((c) => c?.close).filter((v) => typeof v === 'number')
  if (closes.length < 2 || !closes[0]) return null
  return {
    percent: (closes[closes.length - 1] / closes[0] - 1) * 100,
    absolute: closes[closes.length - 1] - closes[0],
    text: fmtSignedMoney(closes[closes.length - 1] - closes[0]),
  }
}
