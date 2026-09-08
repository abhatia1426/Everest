import { useCallback, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { ArrowUpRight, Info, Pin, Trash2 } from 'lucide-react'

import { CompanyLogo } from '../ui/CompanyLogo'
import { useApi } from '../../hooks/useApi'
import { TTL } from '../../lib/cache'
import { api } from '../../lib/api'
import { fmtMoney, fmtPercent, fmtSignedMoney } from '../../lib/format'
import { smoothPath } from '../../lib/portfolio'
import { clipToPeriod, momentumWhy } from '../../lib/monitor'
import { QUOTE_STATE, quoteLabel } from '../../lib/quotes'
import { getMarketStatus } from '../../lib/marketStatus'

/**
 * The selected-security stage.
 *
 * This is the board's answer, not a second Ticker Detail. It exists so that
 * selecting a row on the monitor tells you enough to decide whether to open
 * the symbol properly — price, today's move, where it sits in its own month,
 * how it has been trending, and why it was flagged. Everything past that
 * decision belongs on Ticker Detail, and "Open detail" is the route there.
 *
 * WHAT IS DELIBERATELY ABSENT, because it belongs to Ticker Detail:
 * candlesticks, volume, indicators, overlays, drawing tools, news, options,
 * fundamentals. The approved stage chart is a CLOSES-ONLY LINE and this is a
 * closes-only line.
 *
 * WHAT IS ABSENT BECAUSE EVEREST DOES NOT HAVE IT: alerts. There is no alert
 * system, no thresholds and no notifications anywhere in this product, so
 * there is no "Set alert" button pretending otherwise.
 */

/*
 * Periods are the four the backend actually serves, and they are the same four
 * the approved Portfolio band uses. The mockup's fourth stop is 5Y; Everest's
 * history endpoint has no five-year window — its longest is `all`, ten years of
 * weekly bars — so labelling a button "5Y" would name a range the data cannot
 * honour. ALL says what it plots.
 */
const PERIODS = [
  { key: '1M', period: '1m', word: 'over the past month', days: 31 },
  { key: '3M', period: '3m', word: 'over the past quarter', days: 92 },
  { key: '1Y', period: '1y', word: 'over the past year', days: 366 },
  // ALL is the only period that does not clip: it plots whatever the provider
  // returned, and says exactly that rather than naming a span.
  { key: 'ALL', period: 'all', word: 'over all available history', days: null },
]

const PLOT_W = 480
const PLOT_H = 160
const PLOT_PAD = 8

function directionColor(value) {
  if (typeof value !== 'number' || value === 0) return 'var(--text-tertiary)'
  return value > 0 ? 'var(--accent-green)' : 'var(--accent-red)'
}

/**
 * Provenance, in the stage's own words.
 *
 * Read off `lib/quotes` — the single interpretation of a price in this app —
 * rather than re-decided here. A second freshness rule on this page could
 * disagree with the badge the ledger draws for the same symbol.
 */
function freshnessLine(quote, session) {
  switch (quote.state) {
    case QUOTE_STATE.LIVE:
      return 'Live · refreshes every 30 seconds'
    case QUOTE_STATE.DELAYED:
      return session.state === 'closed'
        ? `At close · ${session.detail}`
        : `Delayed · ${session.detail}`
    case QUOTE_STATE.CACHED:
      return `${quoteLabel(quote)} · not a live price`
    default:
      return 'No current quote · showing the last close we hold'
  }
}

/**
 * The stage plot, as a hook rather than a component.
 *
 * The period figure above the chart and the chart itself are the same
 * measurement of the same closes, so they are derived together — a separate
 * component would mean computing the series twice and risking a header that
 * disagrees with the line under it.
 */
function useStageChart({ candles, loading, color }) {
  const closes = useMemo(
    () =>
      (candles || [])
        .map((candle) => candle?.close)
        .filter((value) => typeof value === 'number' && Number.isFinite(value)),
    [candles],
  )

  const path = useMemo(() => smoothPath(closes, PLOT_W, PLOT_H, PLOT_PAD), [closes])
  const periodPercent = closes.length > 1 && closes[0] ? (closes[closes.length - 1] / closes[0] - 1) * 100 : null

  if (loading && !path) {
    return {
      periodPercent: null,
      element: (
        <div
          className="min-h-[208px] flex-1 max-[1220px]:h-[208px] max-[1220px]:flex-none"
          aria-hidden="true"
        />
      ),
    }
  }

  if (!path) {
    return {
      periodPercent: null,
      element: (
        <div className="flex min-h-[208px] flex-1 items-center justify-center max-[1220px]:h-[208px] max-[1220px]:flex-none">
          {/*
            No line at all rather than a short one. A partial series drawn to
            the full width would put a two-week shape under a "past year" label.
          */}
          <p className="max-w-[260px] text-center text-[12px] text-text-tertiary">
            No price history available for this range.
          </p>
        </div>
      ),
    }
  }

  const min = Math.min(...closes)
  const max = Math.max(...closes)
  const span = max - min || 1
  const gridY = [max, min + span * 0.5, min].map(
    (value) => (PLOT_PAD + (1 - (value - min) / span) * (PLOT_H - PLOT_PAD * 2)).toFixed(1),
  )

  /*
   * Below 1220px the stage sits UNDER the board rather than beside it, so
   * nothing bounds its height and `flex-1` let the plot absorb whatever the
   * column had spare — measured at 385px against the authored 208px. Pinned to
   * 208px there, the chart keeps the approved proportion at every width.
   */
  return {
    periodPercent,
    element: (
      <div
        className="relative min-h-[208px] flex-1 max-[1220px]:h-[208px] max-[1220px]:flex-none"
        style={{ margin: '0 -4px' }}
      >
        <svg
          viewBox={`0 0 ${PLOT_W} ${PLOT_H}`}
          preserveAspectRatio="none"
          className="block h-full w-full overflow-visible"
          aria-hidden="true"
        >
          {gridY.map((y) => (
            <line
              key={y}
              x1="0"
              y1={y}
              x2={PLOT_W}
              y2={y}
              stroke="var(--border)"
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
            />
          ))}
          <path
            d={`${path} L${PLOT_W} ${PLOT_H} L0 ${PLOT_H} Z`}
            fill={periodPercent >= 0 ? 'var(--up-soft)' : 'var(--down-soft)'}
          />
          <path
            d={path}
            fill="none"
            stroke={color}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      </div>
    ),
  }
}

export function SelectedSecurity({
  row,
  pinned,
  onTogglePin,
  onAddPosition,
  onRemove,
  removing,
  period,
  onPeriod,
}) {
  const active = PERIODS.find((p) => p.key === period) || PERIODS[0]
  const session = getMarketStatus()

  const fetcher = useCallback(
    () => api.history(row.ticker, active.period),
    [row.ticker, active.period],
  )
  // The SAME cache key Ticker Detail uses for the same symbol and period, so
  // opening the symbol after previewing it here costs no second request.
  const { data, loading } = useApi(fetcher, [row.ticker, active.period], {
    key: `history:${row.ticker}:${active.period}`,
    ttl: TTL.HISTORY,
  })

  /*
   * CLIP TO THE PILL. The endpoint does not reliably honour its own window —
   * `?period=1m` has been observed returning five months of hourly bars — and a
   * "1M" pill above a five-month line is false regardless of what the caption
   * says. The series is therefore cut to the requested window against its own
   * newest timestamp before anything is drawn or measured from it, so the pill,
   * the line, the percentage, the caption and the axis labels all describe the
   * same period. Clipping only ever removes points; it never invents one.
   */
  const candles = useMemo(
    () => clipToPeriod(data?.candles, active.days),
    [data, active.days],
  )

  const chart = useStageChart({
    candles,
    loading,
    color: directionColor(
      candles.length > 1 ? candles[candles.length - 1].close - candles[0].close : 0,
    ),
  })

  const xLabels = useMemo(() => {
    if (candles.length < 2) return []
    const long = active.key === '1Y' || active.key === 'ALL'
    return [0, 1, 2, 3].map((i) => {
      const candle = candles[Math.round((candles.length - 1) * (i / 3))]
      const date = new Date(candle.time)
      if (Number.isNaN(date.getTime())) return ''
      return date.toLocaleDateString('en-US', long ? { month: 'short', year: '2-digit' } : { month: 'short', day: 'numeric' })
    })
  }, [candles, active.key])

  const dayColor = row.hasQuote ? row.changePercent >= 0 : true
  const momentum = row.momentum
  const stats = [
    {
      key: '30d change',
      value: row.return30 === null ? '—' : fmtPercent(row.return30),
      color: row.return30 === null ? 'var(--text-tertiary)' : directionColor(row.return30),
    },
    {
      key: 'Normal day',
      value: row.averageDaily === null ? '—' : `${row.averageDaily.toFixed(2)}%`,
      color: 'var(--text-secondary)',
    },
    {
      key: 'Today vs normal',
      value:
        row.averageDaily && row.hasQuote
          ? `${(Math.abs(row.changePercent) / row.averageDaily).toFixed(1)}×`
          : '—',
      color: 'var(--text-secondary)',
    },
    {
      key: 'In 30d range',
      value: row.position === null ? '—' : `${(row.position * 100).toFixed(0)}%`,
      color: 'var(--text-secondary)',
    },
  ]

  return (
    <div className="flex min-h-[620px] flex-col gap-3 max-[1220px]:min-h-0">
      {/* The blue stage head — brand as SELECTION, which is the one thing this
          page uses brand for besides the primary action. */}
      <div
        className="relative shrink-0 overflow-hidden"
        style={{
          padding: '16px 18px 15px',
          borderRadius: 'var(--radius-surface)',
          background: 'linear-gradient(150deg, var(--accent-blue) 0%, var(--brand-2) 100%)',
          boxShadow: 'var(--shadow-surface)',
        }}
      >
        <div className="flex items-start gap-[11px]">
          <CompanyLogo ticker={row.ticker} name={row.name} size={38} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-[7px]">
              <span className="num font-display text-[19px] font-extrabold tracking-[-0.035em] text-white">
                {row.ticker}
              </span>
              {row.sector ? (
                <span
                  className="whitespace-nowrap rounded-[6px] text-[10px] font-bold uppercase tracking-[0.04em]"
                  style={{ padding: '2px 7px', background: 'rgba(0,0,0,.2)', color: 'rgba(255,255,255,.86)' }}
                >
                  {row.sector}
                </span>
              ) : null}
            </div>
            <div className="mt-0.5 truncate text-[12px]" style={{ color: 'rgba(255,255,255,.8)' }}>
              {row.name}
            </div>
          </div>
          {/*
            Pin is the existing per-device preference, not a new backend
            concept — the same `useFavorites` store the board's pin marks read.
          */}
          <button
            type="button"
            onClick={onTogglePin}
            aria-pressed={pinned}
            title={pinned ? `Unpin ${row.ticker}` : `Pin ${row.ticker} to the top`}
            className="grid h-[30px] w-[30px] shrink-0 cursor-pointer place-items-center rounded-full
              transition-colors duration-150 hover:bg-white/25"
            style={{ background: pinned ? 'rgba(255,255,255,.28)' : 'rgba(255,255,255,.14)' }}
          >
            <Pin
              size={13}
              className="text-white"
              fill={pinned ? 'currentColor' : 'none'}
              strokeWidth={1.6}
            />
          </button>
        </div>

        <div className="mt-3.5 flex flex-wrap items-end gap-2.5">
          <span
            className="num font-display font-extrabold leading-none text-white
              max-[660px]:text-[34px]"
            style={{ fontSize: 40, letterSpacing: '-0.05em' }}
          >
            {row.price === null ? '—' : fmtMoney(row.price)}
          </span>
          <div
            className="num mb-[3px] flex items-center gap-1.5 rounded-full text-[13px] font-bold
              tracking-[-0.02em] text-white"
            style={{ padding: '5px 10px', background: 'rgba(255,255,255,.17)' }}
          >
            <svg
              width="9"
              height="9"
              viewBox="0 0 12 12"
              fill="currentColor"
              aria-hidden="true"
              style={{ transform: !row.hasQuote ? 'rotate(90deg)' : dayColor ? 'none' : 'rotate(180deg)' }}
            >
              <path d="M6 1.5l4.4 7.5H1.6z" />
            </svg>
            {row.hasQuote ? fmtPercent(row.changePercent) : 'No quote'}
            {row.hasQuote && row.change !== null ? (
              <span className="font-semibold opacity-[0.74]">{fmtSignedMoney(row.change)}</span>
            ) : null}
          </div>
        </div>

        <div
          className="mt-2 flex items-center gap-[7px] text-[11.5px]"
          style={{ color: 'rgba(255,255,255,.72)' }}
        >
          <span
            className={`h-[5px] w-[5px] rounded-full bg-white ${
              session.state === 'open' ? 'animate-pulse' : ''
            }`}
            aria-hidden="true"
          />
          {freshnessLine(row.quote, session)}
        </div>
      </div>

      {/* Price history + the quiet derived figures. */}
      <div
        className="flex flex-1 flex-col"
        style={{
          padding: '15px 18px 16px',
          borderRadius: 'var(--radius-surface)',
          background: 'var(--panel-bg)',
          boxShadow: 'var(--shadow-surface)',
        }}
      >
        <div className="mb-2.5 flex shrink-0 items-center gap-2.5">
          <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-text-tertiary">
            Price history
          </span>
          <div className="flex-1" />
          <div
            className="flex shrink-0 items-center gap-0.5 rounded-full"
            style={{ padding: 3, background: 'var(--nested-bg)' }}
            role="radiogroup"
            aria-label="History period"
          >
            {PERIODS.map((option) => {
              const on = option.key === active.key
              return (
                <button
                  key={option.key}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => onPeriod(option.key)}
                  className={`cursor-pointer rounded-full text-[11px] transition-colors duration-150
                    ${on ? 'font-bold text-text-primary' : 'font-medium text-text-tertiary hover:text-text-primary'}`}
                  style={{ padding: '4px 10px', background: on ? 'var(--panel-bg)' : 'transparent' }}
                >
                  {option.key}
                </button>
              )
            })}
          </div>
        </div>

        <div className="mb-2 flex shrink-0 items-baseline gap-2">
          <span
            className="num font-display text-[17px] font-bold tracking-[-0.035em]"
            style={{
              color:
                chart.periodPercent === null
                  ? 'var(--text-tertiary)'
                  : directionColor(chart.periodPercent),
            }}
          >
            {chart.periodPercent === null ? '—' : fmtPercent(chart.periodPercent)}
          </span>
          <span className="text-[11.5px] text-text-secondary">
            {chart.periodPercent === null && !loading ? 'no history for this range' : active.word}
          </span>
        </div>

        {chart.element}

        {xLabels.length ? (
          <div className="num mt-1.5 flex shrink-0 justify-between gap-2 text-[10px] text-text-tertiary">
            {xLabels.map((label, index) => (
              <span key={`${label}-${index}`}>{label}</span>
            ))}
          </div>
        ) : null}

        {/* The 30-session range rail — the same measurement the board's rail
            draws, at the stage's scale. */}
        <div className="mt-3.5 shrink-0">
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <span className="text-[10.5px] font-semibold uppercase tracking-[0.09em] text-text-tertiary">
              30-day range
            </span>
            <span className="num text-[11px] font-bold text-text-secondary">
              {row.position === null ? 'Unavailable' : `${(row.position * 100).toFixed(0)}% of range`}
            </span>
          </div>
          <div
            className="relative h-2 rounded-full hatch-dim"
            style={{ backgroundColor: 'var(--nested-bg)' }}
            aria-hidden="true"
          >
            {row.position !== null ? (
              <span
                className="absolute w-[3px] -translate-x-1/2 rounded-[2px]"
                style={{
                  left: `${(row.position * 100).toFixed(1)}%`,
                  top: -4,
                  bottom: -4,
                  background: 'var(--text-primary)',
                  boxShadow: '0 0 0 3px var(--panel-bg)',
                }}
              />
            ) : null}
          </div>
          <div className="num mt-[5px] flex justify-between gap-2 text-[11px] text-text-secondary">
            <span>{row.low === null ? '—' : `${fmtMoney(row.low)} low`}</span>
            <span>{row.high === null ? '—' : `${fmtMoney(row.high)} high`}</span>
          </div>
        </div>

        {/* Momentum, with the two returns it is made of. Never a black box. */}
        <div className="mt-3.5 flex shrink-0 items-center gap-2.5">
          {momentum ? (
            <div
              className="inline-flex shrink-0 items-center gap-1.5 rounded-full"
              style={{
                padding: '4px 10px',
                background:
                  momentum.label === 'Gaining'
                    ? 'var(--up-soft)'
                    : momentum.label === 'Fading'
                      ? 'var(--down-soft)'
                      : 'var(--nested-bg)',
              }}
            >
              <svg
                width="9"
                height="9"
                viewBox="0 0 12 12"
                aria-hidden="true"
                fill={
                  momentum.label === 'Gaining'
                    ? 'var(--accent-green)'
                    : momentum.label === 'Fading'
                      ? 'var(--accent-red)'
                      : 'var(--text-secondary)'
                }
                style={{
                  transform:
                    momentum.label === 'Fading'
                      ? 'rotate(180deg)'
                      : momentum.label === 'Steady'
                        ? 'rotate(90deg)'
                        : 'none',
                }}
              >
                <path d="M6 1.5l4.4 7.5H1.6z" />
              </svg>
              <span
                className="whitespace-nowrap text-[11.5px] font-bold"
                style={{
                  color:
                    momentum.label === 'Gaining'
                      ? 'var(--accent-green)'
                      : momentum.label === 'Fading'
                        ? 'var(--accent-red)'
                        : 'var(--text-secondary)',
                }}
              >
                {momentum.label}
              </span>
            </div>
          ) : null}
          <span className="text-pretty text-[11px] text-text-secondary">
            {momentumWhy(momentum)}
          </span>
        </div>

        {/* The attention reason, verbatim, where one fired. */}
        {row.attention ? (
          <div
            className="mt-2.5 flex shrink-0 items-start gap-2"
            style={{
              padding: '9px 11px',
              borderRadius: 'var(--radius-nested)',
              background: 'var(--nested-bg)',
              boxShadow: 'inset 2px 0 0 var(--accent-blue)',
            }}
          >
            <Info size={12} strokeWidth={1.8} className="mt-px shrink-0 text-accent" />
            <span className="text-pretty text-[11.5px] text-text-secondary">
              {row.attention.reason}
            </span>
          </div>
        ) : null}

        <div
          className="mt-3.5 grid shrink-0 gap-2.5 pt-3
            [grid-template-columns:repeat(4,minmax(0,1fr))]
            max-[940px]:[grid-template-columns:repeat(2,minmax(0,1fr))]"
          style={{ boxShadow: '0 -1px 0 var(--border)' }}
        >
          {stats.map((stat) => (
            <div key={stat.key}>
              <div className="truncate text-[9.5px] font-semibold uppercase tracking-[0.08em] text-text-tertiary">
                {stat.key}
              </div>
              <div
                className="num mt-[3px] whitespace-nowrap font-display text-[13px] font-bold tracking-[-0.03em]"
                style={{ color: stat.color }}
              >
                {stat.value}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-4 flex shrink-0 flex-wrap items-center gap-[7px]">
          <Link
            to={`/app/ticker/${row.ticker}`}
            className="flex min-w-[130px] flex-1 cursor-pointer items-center justify-center gap-1.5
              rounded-full text-[12.5px] font-bold tracking-[-0.01em] transition-colors duration-150"
            style={{
              padding: '9px 14px',
              background: 'var(--accent-blue)',
              color: 'var(--brand-ink)',
              boxShadow: '0 8px 20px -10px var(--accent-blue)',
            }}
          >
            Open {row.ticker} detail
            <ArrowUpRight size={11} strokeWidth={2} />
          </Link>

          {/* The real Add Position ticket, prefilled. It records a holding in
              Everest; it does not place an order anywhere. */}
          <button
            type="button"
            onClick={() => onAddPosition(row.ticker)}
            className="shrink-0 cursor-pointer rounded-full text-[12.5px] font-semibold text-text-primary
              transition-colors duration-150"
            style={{ padding: '9px 14px', background: 'var(--track-bg)' }}
          >
            Add position
          </button>

          <button
            type="button"
            disabled={removing}
            onClick={() => onRemove(row)}
            title={`Stop watching ${row.ticker}`}
            className="grid h-9 w-9 shrink-0 cursor-pointer place-items-center rounded-full
              text-text-tertiary transition-colors duration-150 hover:border-down hover:bg-down/10
              hover:text-down disabled:opacity-50"
            style={{ background: 'transparent', border: '1px solid var(--border-strong)' }}
          >
            <Trash2 size={13} strokeWidth={1.8} />
          </button>
        </div>
      </div>
    </div>
  )
}
