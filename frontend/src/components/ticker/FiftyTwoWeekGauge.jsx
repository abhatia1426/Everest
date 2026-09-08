import { fmtCompact, fmtMoney } from '../../lib/format'
import { PRICE_H } from '../../lib/priceSeries'

/**
 * The 52-week gauge that stands beside the plot.
 *
 * WHAT IT ENCODES, and why the hatching is not decoration: the hatched track is
 * the WHOLE YEAR, drawn against the same vertical band the price occupies, and
 * the lit band inside it is the slice of that year the chart is currently
 * showing. Hatching means "context you are not looking at" here — the same
 * meaning it carries everywhere else in Everest for a derived or secondary
 * state — so zooming from 1Y to 1D visibly shrinks the lit band and the reader
 * can see how small a window they have narrowed to. A solid track would say
 * nothing; a gradient would imply a value ramp that does not exist.
 *
 * The arrow is the current price at its true position in the year.
 */
/*
 * `h-full` is load-bearing: every child here is absolutely positioned, so the
 * element has no intrinsic height and collapsed to zero inside the flex row —
 * the gauge rendered but was invisible at every width. It must take the height
 * of the plot beside it, because its whole meaning is being on the same
 * vertical scale as the price band.
 */
export function FiftyTwoWeekGauge({ frame, price, windowLow, windowHigh, up, periodKey }) {
  if (!frame) {
    return (
      <div
        data-gauge
        className="relative h-full w-[62px] shrink-0 pl-2.5 max-[1060px]:hidden"
        title="No 52-week range available for this security"
      >
        <span
          className="absolute left-2.5 right-0 rounded-[4px] hatch-dim"
          style={{
            top: 0,
            height: `${PRICE_H}%`,
            backgroundColor: 'var(--nested-bg)',
            border: '1px solid var(--border)',
          }}
          aria-hidden="true"
        />
        <span className="absolute left-2.5 right-0 top-1/2 -translate-y-1/2 text-center text-[9px] font-bold leading-tight text-text-tertiary">
          52w
          <br />—
        </span>
      </div>
    )
  }

  const markTop = frame.project(price)
  const windowTop = frame.project(windowHigh)
  const windowBottom = frame.project(windowLow)
  const bandColor = up ? 'var(--up-soft)' : 'var(--down-soft)'
  const bandEdge = up
    ? 'color-mix(in oklab, var(--accent-green) 45%, transparent)'
    : 'color-mix(in oklab, var(--accent-red) 45%, transparent)'

  return (
    <div
      data-gauge
      className="relative h-full w-[62px] shrink-0 cursor-help pl-2.5 max-[1060px]:hidden"
      title={`52-week range: ${fmtMoney(frame.low)} low to ${fmtMoney(frame.high)} high. The arrow is the current price, ${((frame.position ?? 0) * 100).toFixed(0)}% up that range. The hatched track is the full year; the lit band is the slice of it the chart is showing.${
        frame.derived ? ' Computed from the year of daily closes Everest holds — the provider did not report a 52-week range.' : ''
      }`}
    >
      <span
        className="absolute left-2.5 right-0 rounded-[4px] hatch-dim"
        style={{
          top: 0,
          height: `${PRICE_H}%`,
          backgroundColor: 'var(--nested-bg)',
          border: '1px solid var(--border)',
        }}
        aria-hidden="true"
      />

      <span
        title={`The ${periodKey} window drawn in the chart covers ${fmtMoney(windowLow)}–${fmtMoney(windowHigh)} of the 52-week range.`}
        className="absolute left-2.5 right-0 rounded-[3px]"
        style={{
          top: `${windowTop}%`,
          height: `${Math.max(1.6, windowBottom - windowTop)}%`,
          background: bandColor,
          boxShadow: `0 0 0 1px ${bandEdge}`,
        }}
      />

      <span
        className="absolute -right-1 left-[5px]"
        style={{ top: `${markTop}%`, borderTop: '2px solid var(--text-primary)' }}
        aria-hidden="true"
      />
      <span
        className="absolute left-0 h-0 w-0 -translate-y-1/2"
        style={{
          top: `${markTop}%`,
          borderTop: '3.5px solid transparent',
          borderBottom: '3.5px solid transparent',
          borderLeft: '5px solid var(--text-primary)',
        }}
        aria-hidden="true"
      />

      <span
        className="num absolute left-2.5 right-0 -translate-y-full text-center text-[9px] font-bold text-text-tertiary"
        style={{ top: 0 }}
      >
        {fmtCompact(frame.high)} hi
      </span>
      <span
        className="num absolute left-2.5 right-0 text-center text-[9px] font-bold text-text-tertiary"
        style={{ top: `${PRICE_H}%` }}
      >
        {fmtCompact(frame.low)} lo
      </span>
      <span className="absolute bottom-0 left-2.5 right-0 text-center text-[8.5px] font-bold uppercase leading-[1.25] tracking-[0.06em] text-text-tertiary">
        52-week
        <br />
        range
      </span>
    </div>
  )
}
