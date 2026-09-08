import { useCallback, useMemo, useState } from 'react'
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import { ErrorState, Skeleton } from '../States'
import { useApi } from '../../hooks/useApi'
import { TTL } from '../../lib/cache'
import { api } from '../../lib/api'
import { fmtCompact, fmtMoney, fmtPercent, fmtSignedMoney } from '../../lib/format'

const RANGES = ['1D', '1W', '1M', '3M', 'YTD', '1Y', 'ALL']
const CHART_HEIGHT = 270

/**
 * Range label → the period the API actually understands.
 *
 * `services/market.PERIOD_MAP` supports 1h/1d/1w/1m/3m/6m/1y/all. It has NO
 * year-to-date window, and adding one server-side would mean a new resolution
 * rule and a new cache key for a window whose length changes every day.
 *
 * YTD is therefore served by the `1y` response and clipped to January 1 on the
 * client. That is real historical data, not a synthesised one — the same
 * presentational clipping `withinRange` already performs for every other
 * range, and it cannot invent a point that the provider did not return. The
 * one thing it must not do is silently fall back to a full year under a "YTD"
 * label, which is why `clipToYearStart` returns null rather than the original
 * series when the year is too young to plot.
 */
const RANGE_TO_PERIOD = {
  '1D': '1d',
  '1W': '1w',
  '1M': '1m',
  '3M': '3m',
  YTD: '1y',
  '1Y': '1y',
  ALL: 'all',
}

/** Plain-language window, for the header line. */
const RANGE_WORD = {
  '1D': 'today',
  '1W': 'past week',
  '1M': 'past month',
  '3M': 'past quarter',
  YTD: 'year to date',
  '1Y': 'past year',
  ALL: 'all time',
}

/**
 * Trim the plot to the range the control claims.
 *
 * The provider does not reliably honour the lookback window the backend asks
 * for: a `1m` request came back with 746 hourly candles spanning five months.
 * Plotted raw, the chart drew five months of history under a "1M" label and
 * reported the five-month return as "over 1M" — a headline figure that was
 * simply not the number it said it was.
 *
 * Clipping here is presentational, not a data fix: we plot exactly the window
 * we name, and the surplus candles are ignored rather than relabelled. The
 * provider window itself is a backend concern and is tracked separately.
 */
const RANGE_DAYS = {
  '1D': 1,
  '1W': 7,
  '1M': 31,
  '3M': 92,
  '6M': 183,
  '1Y': 366,
}

/**
 * Clip a series to January 1 of the newest point's own year.
 *
 * Anchored to the DATA, not to `Date.now()`, for the same reason `withinRange`
 * is: a cached or lagging response must still yield the window it names.
 *
 * Returns null — not the original series — when fewer than two points survive.
 * In early January that is the honest answer: there is not yet enough of the
 * year to draw. Falling back to the full response would put twelve months of
 * line under a "YTD" label and report the annual return as the year-to-date
 * one, which is precisely the class of bug `withinRange` exists to prevent.
 */
export function clipToYearStart(points) {
  if (points.length === 0) return null

  const newest = new Date(points[points.length - 1].time).getTime()
  if (Number.isNaN(newest)) return null

  const yearStart = new Date(new Date(newest).getFullYear(), 0, 1).getTime()
  const clipped = points.filter((point) => {
    const t = new Date(point.time).getTime()
    return !Number.isNaN(t) && t >= yearStart
  })

  return clipped.length >= 2 ? clipped : null
}

/**
 * Axis ticks carry only what changes across the window.
 *
 * A month of hourly data labelled with the full date repeats "Aug 12" seven
 * times; a year labelled with day-of-month says nothing. Matching the tick's
 * resolution to the range is the difference between an axis you read and one
 * you decode.
 */
export function formatTick(value, range) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''

  if (range === '1W') {
    return date.toLocaleDateString('en-US', { weekday: 'short' })
  }
  if (range === '1Y' || range === 'ALL') {
    return date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
  }
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

/** The tooltip can afford to be specific where the axis cannot. */
function formatTooltipLabel(value, range) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''

  const withTime = range === '1W' || range === '1M'
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    ...(withTime ? { hour: 'numeric', minute: '2-digit' } : { year: 'numeric' }),
  })
}

export function withinRange(points, range) {
  const days = RANGE_DAYS[range]
  if (!days || points.length === 0) return points

  const newest = new Date(points[points.length - 1].time).getTime()
  if (Number.isNaN(newest)) return points

  const cutoff = newest - days * 24 * 60 * 60 * 1000
  const clipped = points.filter((point) => new Date(point.time).getTime() >= cutoff)

  // Never clip down to an unplottable stub — better the full series than two
  // points and a meaningless slope.
  return clipped.length >= 2 ? clipped : points
}

/**
 * Floating glass readout, not a bordered box.
 *
 * The tooltip is the one element that sits directly over the plot, so it is
 * the one place a blurred material genuinely earns its keep: it stays legible
 * over both the filled area and the empty grid without needing an opaque fill
 * that punches a hole in the chart.
 */
function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null

  return (
    /*
     * Keyed to the FIELD, not to the app theme. This floats over Everest blue,
     * which is dark in both themes, so a theme-aware glass surface would turn
     * white in light mode and lose its own text.
     */
    <div
      className="rounded-[12px] px-3.5 py-2.5"
      style={{
        background: 'rgba(12,12,14,0.92)',
        border: '1px solid rgba(255,255,255,0.14)',
        boxShadow: '0 12px 30px -12px rgba(0,0,0,0.9)',
      }}
    >
      {label ? (
        <p className="mb-1.5 text-[11px] font-medium text-white/60">{label}</p>
      ) : null}
      <div className="space-y-1">
        {payload.map((entry) => (
          <p key={entry.dataKey} className="flex items-center gap-3">
            <span className="text-[11.5px] font-medium text-white/65">Portfolio</span>
            <span className="num ml-auto font-display text-[15px] font-bold text-white">
              {fmtMoney(entry.value)}
            </span>
          </p>
        ))}
      </div>
    </div>
  )
}

/**
 * Why the chart is empty, in the user's own terms.
 *
 * The endpoint withholds the entire series when ANY holding lacks history,
 * because summing the rest understates the book by exactly the missing
 * positions with no visual cue. That rule is right. What was wrong was the
 * copy: "Not enough history yet" reads as "your account is too new", when the
 * real cause is that the provider has no candles for specific symbols the user
 * can see in their own holdings list.
 *
 * The backend now names them, so this states the actual reason, the actual
 * symbols, and the reason we withheld rather than plotted a partial line.
 */
export function HistoryUnavailable({ missing = [], holdingsCount = 0 }) {
  const named = missing.slice(0, 6).join(', ')
  const overflow = missing.length > 6 ? ` +${missing.length - 6} more` : ''

  return (
    /* Sits on the blue field, so its type keys off white, not the neutral ramp. */
    <div
      className="flex flex-col items-center justify-center px-6 text-center"
      style={{ minHeight: CHART_HEIGHT }}
    >
      <h3 className="text-[16px] font-semibold text-white">
        {missing.length ? 'History withheld' : 'Not enough history yet'}
      </h3>

      {missing.length ? (
        <>
          <p className="mt-2 max-w-md text-[13px] leading-relaxed text-white/75">
            No price history is available for{' '}
            <span className="num font-semibold text-white">
              {named}
              {overflow}
            </span>
            {holdingsCount ? ` — ${missing.length} of your ${holdingsCount} holdings.` : '.'}
          </p>
          <p className="mt-2 max-w-md text-[12px] leading-relaxed text-white/55">
            Plotting the rest would understate your portfolio by exactly those positions, so the
            chart is withheld rather than shown wrong.
          </p>
        </>
      ) : (
        <p className="mt-2 max-w-sm text-[13px] text-white/75">
          Once your holdings have priced history, performance plots here.
        </p>
      )}
    </div>
  )
}


/**
 * Portfolio performance — the approved Dashboard's dominant object.
 *
 * Geometry is taken directly from `Everest Dashboard v2.dc.html`:
 *   surface   padding 20px 22px 16px, 152° brand→brand-2→near-black gradient
 *             with one radial bloom at 88% 6%
 *   header    "Performance · {word}" 12.5px/600 at 72% white
 *             figure Archivo 800 clamp(28px,2.5vw,38px) -0.045em
 *             pill   5px 10px, rgba(255,255,255,.2), 13px/700
 *   ranges    track 3px pad on rgba(0,0,0,.18); items 6px 12px, 12.5px/700;
 *             active #fff on brand-2 ink
 *   plot      270px tall, 14px above it, 52px reserved at the right for the
 *             value scale, three gridlines at rgba(255,255,255,.16)
 *   line      #fff, 2.4 wide, round caps; area is 45° white hatching faded
 *             downward by a mask
 *
 * The y scale is portfolio VALUE in compact dollars, as the design draws it.
 */
export function PerformanceChart({ mode }) {
  const [range, setRange] = useState('1M')

  const period = RANGE_TO_PERIOD[range] || range.toLowerCase()
  const fetcher = useCallback(() => api.portfolioHistory(mode, period), [mode, period])
  const { data, loading, error, refetch } = useApi(fetcher, [mode, period], {
    key: `pfhist:${mode}:${period}`,
    ttl: TTL.HISTORY,
  })

  const series = useMemo(() => {
    const raw = data?.series || []
    // YTD is a calendar window, so it clips by date rather than by lookback.
    const points = range === 'YTD' ? clipToYearStart(raw) : withinRange(raw, range)
    if (!points || points.length < 2) return []

    /*
     * A real timestamp on a NUMERIC time axis.
     *
     * A formatted date string on a category axis broke intraday data badly:
     * 162 hourly points share only ~24 distinct "Aug 12" labels, so recharts
     * collapsed them onto 24 slots and drew the whole month compressed into
     * the first fifth of the plot. Spacing by elapsed time also makes weekend
     * and holiday gaps read correctly instead of being closed up.
     */
    return points.map((point) => ({
      t: new Date(point.time).getTime(),
      value: point.value,
    }))
  }, [data, range])

  const first = series.length > 1 ? series[0].value : null
  const last = series.length > 1 ? series[series.length - 1].value : null
  const rangeChange = first !== null ? last - first : null
  const rangePct = first ? ((last - first) / first) * 100 : null

  // Five evenly-spaced ticks across the plotted window, as the design draws.
  const xTicks = useMemo(() => {
    if (series.length < 2) return []
    const a = series[0].t
    const b = series[series.length - 1].t
    return [0, 1, 2, 3, 4].map((i) => a + ((b - a) * i) / 4)
  }, [series])

  /*
   * Three explicit gridlines at max / mid / min — the design's
   * `[mx, mn + sp*0.5, mn]`.
   *
   * Left to recharts' own tick generation the axis produced two lines at the
   * data extremes and no midline, so the plot lost the horizontal rhythm the
   * field is built around.
   */
  const yTicks = useMemo(() => {
    if (series.length < 2) return []
    const values = series.map((p) => p.value)
    const min = Math.min(...values)
    const max = Math.max(...values)
    return min === max ? [min] : [min, min + (max - min) / 2, max]
  }, [series])

  return (
    <div
      className="relative flex h-full flex-col overflow-hidden"
      style={{
        padding: '20px 22px 16px',
        borderRadius: 'var(--radius-surface)',
        background:
          'linear-gradient(152deg, var(--accent-blue) 0%, var(--brand-2) 62%, color-mix(in oklab, var(--brand-2) 78%, #000) 100%)',
        boxShadow: 'var(--shadow-surface)',
      }}
    >
      {/* The bloom is its own layer, as in the design, so it sits over the
          body gradient rather than being blended into it. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(70% 90% at 88% 6%, rgba(255,255,255,.26), transparent 60%)',
        }}
      />

      <div className="relative flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <span className="text-[12.5px] font-semibold" style={{ color: 'rgba(255,255,255,.72)' }}>
            Performance · {RANGE_WORD[range] || range}
          </span>
          {series.length > 1 ? (
            <>
              <div className="mt-1 flex flex-wrap items-baseline gap-x-[11px] gap-y-1">
                <span
                  className="font-display font-extrabold text-white"
                  style={{
                    fontSize: 'clamp(28px, 2.5vw, 38px)',
                    letterSpacing: '-0.045em',
                    lineHeight: 1,
                  }}
                >
                  {fmtSignedMoney(rangeChange)}
                </span>
                <span
                  className="num inline-flex items-center rounded-full text-[13px] font-bold text-white"
                  style={{ padding: '5px 10px', background: 'rgba(255,255,255,.2)' }}
                >
                  {fmtPercent(rangePct)}
                </span>
              </div>
              {/*
                NOT IN THE MOCKUP, and required.

                This series is RECONSTRUCTED — today's holdings priced backwards
                at today's quantities. It is not account history, and a chart
                this dominant reads as a statement of record unless it says
                otherwise.
              */}
              <p className="mt-1.5 text-[11px] leading-snug" style={{ color: 'rgba(255,255,255,.55)' }}>
                Today&rsquo;s holdings priced back over the {RANGE_WORD[range] || range} — not
                account history
              </p>
            </>
          ) : null}
        </div>

        <div
          className="on-color flex shrink-0 gap-0.5"
          style={{
            padding: 3,
            borderRadius: 999,
            background: 'rgba(0,0,0,.18)',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
          }}
          role="radiogroup"
          aria-label="Chart range"
        >
          {RANGES.map((key) => {
            const active = key === range
            return (
              <button
                key={key}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setRange(key)}
                className="cursor-pointer whitespace-nowrap rounded-full text-[12.5px] font-bold
                  transition-colors duration-200"
                style={{
                  padding: '6px 12px',
                  background: active ? '#fff' : 'transparent',
                  color: active ? 'var(--brand-2)' : 'rgba(255,255,255,.72)',
                }}
              >
                {key}
              </button>
            )
          })}
        </div>
      </div>

      <div className="relative mt-3.5 flex-1" style={{ minHeight: CHART_HEIGHT }}>
        {loading && !data ? (
          <Skeleton className="w-full rounded-panel" style={{ height: CHART_HEIGHT }} />
        ) : error ? (
          <ErrorState error={error} onRetry={refetch} />
        ) : series.length < 2 ? (
          /*
           * Distinguish "the year is too young" from "we withheld the series".
           * The all-or-nothing rule fires when a holding has no candles at all;
           * a short YTD window is a different, benign fact and must not be
           * reported as a provider failure.
           */
          range === 'YTD' && (data?.series || []).length >= 2 && !data?.incomplete ? (
            <div
              className="flex flex-col items-center justify-center px-6 text-center"
              style={{ minHeight: CHART_HEIGHT }}
            >
              <h3 className="text-[16px] font-semibold text-white">Not enough of this year yet</h3>
              <p className="mt-2 max-w-sm text-[13px] leading-relaxed text-white/75">
                Year to date needs at least two sessions since January 1. Pick a longer range to
                see the history that does exist.
              </p>
            </div>
          ) : (
            <HistoryUnavailable
              missing={data?.missing || []}
              holdingsCount={data?.holdings_count || 0}
            />
          )
        ) : (
          <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
            <AreaChart data={series} margin={{ top: 8, right: 0, left: 0, bottom: 8 }}>
              <defs>
                {/*
                  A HATCHED area, as the design draws it: 45° white lines faded
                  downward by a mask. A solid or gradient white fill would
                  flatten the blue field into two blocks of colour; hatching
                  lets the field read continuously through the fill.
                */}
                <pattern
                  id="perf-hatch"
                  width="7"
                  height="7"
                  patternUnits="userSpaceOnUse"
                  patternTransform="rotate(45)"
                >
                  <line
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="7"
                    stroke="#fff"
                    strokeOpacity="0.42"
                    strokeWidth="1.7"
                  />
                </pattern>
                <linearGradient id="perf-mask-grad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#fff" stopOpacity="0.95" />
                  <stop offset="100%" stopColor="#fff" stopOpacity="0.1" />
                </linearGradient>
                <mask
                  id="perf-mask"
                  maskUnits="userSpaceOnUse"
                  x="0"
                  y="0"
                  width="4000"
                  height={CHART_HEIGHT}
                >
                  <rect x="0" y="0" width="4000" height={CHART_HEIGHT} fill="url(#perf-mask-grad)" />
                </mask>
              </defs>

              <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.16)" strokeDasharray="0" />
              <XAxis
                dataKey="t"
                type="number"
                scale="time"
                domain={['dataMin', 'dataMax']}
                ticks={xTicks}
                tickFormatter={(value) => formatTick(value, range)}
                tick={{ fill: 'rgba(255,255,255,0.6)', fontSize: 11, fontWeight: 500 }}
                axisLine={false}
                tickLine={false}
                tickMargin={10}
              />
              {/* Value scale on the right, 52px reserved — the design's plot is
                  inset `right:52px` and labels sit in that gutter. */}
              <YAxis
                orientation="right"
                tick={{ fill: 'rgba(255,255,255,0.66)', fontSize: 11, fontWeight: 600 }}
                axisLine={false}
                tickLine={false}
                width={52}
                ticks={yTicks}
                tickFormatter={(v) => `$${fmtCompact(v)}`}
                domain={['dataMin', 'dataMax']}
              />
              <Tooltip
                content={<ChartTooltip />}
                labelFormatter={(value) => formatTooltipLabel(value, range)}
                cursor={{ stroke: 'rgba(255,255,255,0.14)', strokeWidth: 28 }}
              />
              {/*
                isAnimationActive={false} — deliberately. Recharts animates an
                area in by tweening a clip rect in JS, and inside a
                ResponsiveContainer that animation is regularly orphaned by the
                container's own initial resize, leaving the plot stuck at a 2%
                stub that looks exactly like "no data".
              */}
              <Area
                type="monotone"
                dataKey="value"
                stroke="#ffffff"
                strokeWidth={2.4}
                strokeLinejoin="round"
                strokeLinecap="round"
                fill="url(#perf-hatch)"
                mask="url(#perf-mask)"
                isAnimationActive={false}
                dot={false}
                activeDot={{ r: 5.5, fill: '#ffffff', stroke: 'var(--brand-2)', strokeWidth: 2.5 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}
