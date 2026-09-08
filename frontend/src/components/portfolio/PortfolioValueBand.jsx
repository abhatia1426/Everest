import { useCallback, useMemo, useState } from 'react'
import { Plus } from 'lucide-react'

import { AnimatedNumber } from '../Motion'
import { Skeleton } from '../States'
import { useApi } from '../../hooks/useApi'
import { TTL } from '../../lib/cache'
import { api } from '../../lib/api'
import { fmtCompact, fmtMoney, fmtPercent, fmtSignedMoney } from '../../lib/format'
import { smoothPath } from '../../lib/portfolio'

/**
 * Band 1 of the approved `Everest Portfolio.dc.html`.
 *
 * Geometry is taken from the source file rather than interpreted:
 *   band     grid `minmax(300px,.82fr) minmax(0,1.55fr)`, gap 12px,
 *            single column at 1140px
 *   field    radius 20px, 150° brand→brand-2, padding `18px 20px 14px`,
 *            min-height 186px
 *   eyebrow  11px/700, .1em, uppercase, 72% white
 *   figure   Archivo 800 clamp(34px,3.3vw,46px), -.05em
 *   ranges   3px track on rgba(0,0,0,.22); items `4px 9px`, 11px/700
 *   day row  pill `5px 10px` on rgba(255,255,255,.16), 13px/700
 *   plot     flex, min-height 38px, bled to the field edges by -20px
 *   caption  11px/600 at 66% white
 *   controls Real/Paper track + as-of + Add position, then a 5-up metric strip
 *            on a 20px panel, cells `15px 20px`, figures Archivo 800 26px
 *
 * WHAT IS NOT THE DESIGN'S, AND WHY:
 *
 * · The series is RECONSTRUCTED — today's holdings priced backwards at today's
 *   quantities — so the caption says so, in those words, on every range. "ALL"
 *   never says "since inception": the series has no inception, it only has as
 *   much provider history as the shortest-lived holding.
 * · When `/portfolio/history` withholds the series because a holding has no
 *   candles, the plot is REPLACED by the reason and the missing symbols, not
 *   drawn short. A partial line here would understate the portfolio by exactly
 *   the positions it silently omitted.
 * · Realized P/L is not fabricated. See `MetricsStrip`.
 */

const RANGES = [
  { key: '1M', period: '1m', word: 'past month' },
  { key: '3M', period: '3m', word: 'past quarter' },
  { key: '1Y', period: '1y', word: 'past year' },
  { key: 'ALL', period: 'all', word: 'all available history' },
]

const PLOT_W = 600
const PLOT_H = 90

/** Compact money with an explicit sign, for the 5-up strip's narrow cells. */
function compactMoney(value, { signed = false } = {}) {
  if (value === null || value === undefined || Number.isNaN(value)) return '—'
  const sign = signed ? (value > 0 ? '+' : value < 0 ? '−' : '') : value < 0 ? '−' : ''
  return `${sign}$${fmtCompact(Math.abs(value))}`
}

function RangeControl({ range, onChange }) {
  return (
    <div
      className="flex shrink-0 gap-0.5"
      style={{ padding: 3, borderRadius: 999, background: 'rgba(0,0,0,.22)' }}
      role="radiogroup"
      aria-label="History range"
    >
      {RANGES.map(({ key }) => {
        const active = key === range
        return (
          <button
            key={key}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(key)}
            className="cursor-pointer rounded-full text-[11px] font-bold tracking-[-0.01em]
              transition-colors duration-150"
            style={{
              padding: '4px 9px',
              background: active ? 'rgba(255,255,255,.92)' : 'transparent',
              color: active ? 'var(--brand-2)' : 'rgba(255,255,255,.74)',
            }}
          >
            {key}
          </button>
        )
      })}
    </div>
  )
}

/**
 * The reconstructed-history plot, or the honest reason there isn't one.
 *
 * Deliberately silent about a series of fewer than two points: a single
 * observation is a dot, not a history, and stretching it across the field
 * would draw a flat line that asserts a month of no movement.
 */
function HistoryPlot({ data, loading, word }) {
  const path = useMemo(() => {
    const values = (data?.series || []).map((point) => point.value)
    return smoothPath(values, PLOT_W, PLOT_H, 10)
  }, [data])

  if (loading) {
    return <div className="min-h-[38px] flex-1" aria-hidden="true" />
  }

  if (!path) {
    const missing = data?.missing || []
    const named = missing.slice(0, 4).join(', ')
    const overflow = missing.length > 4 ? ` +${missing.length - 4} more` : ''

    return (
      <div className="mt-2.5 flex min-h-[38px] flex-1 items-end">
        <p className="text-[11px] leading-snug" style={{ color: 'rgba(255,255,255,.72)' }}>
          {missing.length ? (
            <>
              History withheld — no price history for{' '}
              <span className="num font-semibold text-white">
                {named}
                {overflow}
              </span>
              {data?.holdings_count ? ` (${missing.length} of ${data.holdings_count} holdings).` : '.'}{' '}
              Plotting the rest would understate the portfolio by exactly those positions.
            </>
          ) : (
            <>No priced history over the {word} yet.</>
          )}
        </p>
      </div>
    )
  }

  return (
    <div className="relative flex min-h-[38px] flex-1 items-end" style={{ margin: '10px -20px 0' }}>
      <svg
        viewBox={`0 0 ${PLOT_W} ${PLOT_H}`}
        preserveAspectRatio="none"
        className="block h-full w-full overflow-visible"
        aria-hidden="true"
      >
        <path d={`${path} L${PLOT_W} ${PLOT_H} L0 ${PLOT_H} Z`} fill="rgba(255,255,255,.14)" />
        <path
          d={path}
          fill="none"
          stroke="rgba(255,255,255,.8)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    </div>
  )
}

function ValueField({ book, mode, loading }) {
  const [range, setRange] = useState('1M')
  const active = RANGES.find((r) => r.key === range) || RANGES[0]

  const fetcher = useCallback(
    () => api.portfolioHistory(mode, active.period),
    [mode, active.period],
  )
  const { data, loading: historyLoading } = useApi(fetcher, [mode, active.period], {
    key: `pfhist:${mode}:${active.period}`,
    ttl: TTL.HISTORY,
  })

  const dayUp = (book.dayAbs ?? 0) >= 0

  return (
    <div
      className="relative flex min-h-[186px] flex-col overflow-hidden"
      style={{
        padding: '18px 20px 14px',
        borderRadius: 'var(--radius-surface)',
        background: 'linear-gradient(150deg, var(--accent-blue) 0%, var(--brand-2) 100%)',
        boxShadow: 'var(--shadow-surface)',
      }}
    >
      <div className="relative flex items-start justify-between gap-2.5">
        <div className="min-w-0">
          <div
            className="text-[11px] font-bold uppercase tracking-[0.1em]"
            style={{ color: 'rgba(255,255,255,.72)' }}
          >
            Portfolio value · {mode === 'paper' ? 'Paper' : 'Real'}
          </div>
          <div
            className="mt-2 font-display font-extrabold text-white"
            style={{
              fontSize: 'clamp(34px, 3.3vw, 46px)',
              letterSpacing: '-0.05em',
              lineHeight: 1.02,
            }}
          >
            {loading ? (
              <Skeleton className="h-10 w-52" />
            ) : (
              <AnimatedNumber value={book.totalValue} format={(v) => fmtMoney(v)} />
            )}
          </div>
        </div>
        <RangeControl range={range} onChange={setRange} />
      </div>

      <div className="relative mt-3 flex flex-wrap items-center gap-2">
        {/*
          NO MEASURED MOVE IS NOT A ZERO MOVE. With every quote missing the
          book's day change is unobserved, and a green "+0.00%" pill would
          assert a flat session we did not see.
        */}
        {book.dayAbs === null ? (
          <span className="text-[12px] font-semibold" style={{ color: 'rgba(255,255,255,.78)' }}>
            {book.rows.length === 0
              ? 'No positions yet'
              : 'No measured move today — awaiting live quotes'}
          </span>
        ) : (
          <>
            <div
              className="num flex items-center gap-1.5 text-[13px] font-bold tracking-[-0.02em] text-white"
              style={{ padding: '5px 10px', borderRadius: 999, background: 'rgba(255,255,255,.16)' }}
            >
              <svg
                width="9"
                height="9"
                viewBox="0 0 12 12"
                fill="currentColor"
                aria-hidden="true"
                style={{ transform: dayUp ? 'none' : 'rotate(180deg)' }}
              >
                <path d="M6 1.5l4.4 7.5H1.6z" />
              </svg>
              {fmtSignedMoney(book.dayAbs)}{' '}
              <span className="font-semibold opacity-[0.72]">{fmtPercent(book.dayPercent)}</span>
            </div>
            <span className="text-[12px] font-semibold" style={{ color: 'rgba(255,255,255,.78)' }}>
              today
            </span>
          </>
        )}

        <span className="h-3.5 w-px" style={{ background: 'rgba(255,255,255,.28)' }} />
        <span className="num text-[12.5px] font-bold text-white">
          {fmtSignedMoney(book.unrealized)}
        </span>
        <span className="text-[12px] font-semibold" style={{ color: 'rgba(255,255,255,.78)' }}>
          {fmtPercent(book.unrealizedPercent)} unrealized
        </span>
      </div>

      <HistoryPlot data={data} loading={historyLoading && !data} word={active.word} />

      {/*
        THE DISCLOSURE, on every range and never optional. This series is
        today's holdings priced backwards; it is not a record of what the
        account was worth, and a chart this prominent reads as one unless it
        says otherwise in its own caption.
      */}
      <div
        className="relative mt-2 text-[11px] font-semibold"
        style={{ color: 'rgba(255,255,255,.66)' }}
      >
        Today&rsquo;s holdings priced back over the {active.word} · not account history
      </div>
    </div>
  )
}

/**
 * The five approved metrics.
 *
 * REALIZED IS NOT FABRICATED, AND IT IS NOT $0.00 EITHER.
 *
 * `/pnl` sums `realized_pnl` over a `trades` collection that nothing in this
 * product ever writes to: there is no sell, reduce or close flow, and removing
 * a position deletes the row without booking a trade. The endpoint therefore
 * returns 0.00 for every user, always — not because their closed trades netted
 * out, but because closed trades are not recorded at all. Printing "$0.00" in
 * green would be a measurement claim we cannot support, so the tile says what
 * is true and the sub-line says why.
 */
function MetricsStrip({ book, realized, loading }) {
  const metrics = [
    {
      key: 'Day P/L',
      value: book.dayAbs === null ? '—' : compactMoney(book.dayAbs, { signed: true }),
      sub:
        book.dayAbs === null
          ? 'no measured moves today'
          : `${fmtPercent(book.dayPercent)} on the portfolio`,
      tone:
        book.dayAbs === null
          ? 'text-text-tertiary'
          : book.dayAbs >= 0
            ? 'text-up'
            : 'text-down',
    },
    {
      key: 'Unrealized',
      value: compactMoney(book.unrealized, { signed: true }),
      sub: `${fmtPercent(book.unrealizedPercent)} all time`,
      tone: book.unrealized >= 0 ? 'text-up' : 'text-down',
    },
    {
      key: 'Cost basis',
      value: compactMoney(book.totalCost),
      sub: 'invested capital',
      tone: 'text-text-primary',
    },
    {
      key: 'Realized',
      // `realized` is read but never trusted to mean "we measured zero" —
      // only a non-zero figure could only have come from a real trade record.
      value: realized ? compactMoney(realized, { signed: true }) : 'Not recorded',
      sub: realized ? 'closed trades' : 'Everest records no closed trades',
      tone: realized ? (realized >= 0 ? 'text-up' : 'text-down') : 'text-text-tertiary',
    },
    {
      key: 'Positions',
      value: String(book.rows.length),
      sub: `${book.sectors.size} ${book.sectors.size === 1 ? 'sector' : 'sectors'}`,
      tone: 'text-text-primary',
    },
  ]

  return (
    <div
      className="grid flex-1 overflow-hidden
        [grid-template-columns:repeat(5,minmax(0,1fr))]
        max-[940px]:[grid-template-columns:repeat(3,minmax(0,1fr))]
        max-[560px]:[grid-template-columns:repeat(2,minmax(0,1fr))]"
      style={{
        borderRadius: 'var(--radius-surface)',
        background: 'var(--panel-bg)',
        boxShadow: 'var(--shadow-surface)',
      }}
    >
      {metrics.map((metric, index) => (
        <div
          key={metric.key}
          className="relative flex flex-col justify-center gap-1.5 p-[15px_20px] max-[660px]:p-4"
        >
          {index > 0 ? (
            <span
              aria-hidden="true"
              className="absolute left-0 top-[26%] bottom-[26%] w-px"
              style={{
                background:
                  'linear-gradient(to bottom, transparent, var(--border-strong), transparent)',
              }}
            />
          ) : null}
          <div className="truncate text-[10px] font-semibold uppercase tracking-[0.11em] text-text-tertiary">
            {metric.key}
          </div>
          {loading ? (
            <Skeleton className="h-6 w-20" />
          ) : (
            <div
              className={`truncate font-display text-[26px] font-extrabold leading-none tracking-[-0.045em] ${metric.tone}`}
            >
              {metric.value}
            </div>
          )}
          <div className="truncate text-[11px] text-text-secondary">{metric.sub}</div>
        </div>
      ))}
    </div>
  )
}

export function PortfolioValueBand({ book, mode, setMode, realized, loading, onAddPosition, updatedAt }) {
  return (
    <div
      className="grid gap-3
        [grid-template-columns:minmax(300px,0.82fr)_minmax(0,1.55fr)]
        max-[1140px]:[grid-template-columns:minmax(0,1fr)]"
    >
      <ValueField book={book} mode={mode} loading={loading} />

      <div className="flex min-w-0 flex-col gap-3">
        <div className="flex items-center gap-2.5">
          {/*
            The SAME Real/Paper state the chrome carries, not a second one:
            both read and write `useMode`. The design puts the control beside
            the book it qualifies, and switching from either place moves the
            whole app together.
          */}
          <div
            className="flex shrink-0 gap-0.5"
            style={{
              padding: 3,
              borderRadius: 999,
              background: 'var(--panel-bg)',
              boxShadow: 'var(--shadow-surface)',
            }}
            role="radiogroup"
            aria-label="Book"
          >
            {['real', 'paper'].map((key) => {
              const activeMode = key === mode
              return (
                <button
                  key={key}
                  type="button"
                  role="radio"
                  aria-checked={activeMode}
                  onClick={() => setMode(key)}
                  className={`cursor-pointer rounded-full text-[12.5px] tracking-[-0.01em]
                    transition-colors duration-150 ${activeMode ? 'font-bold' : 'font-medium'}`}
                  style={{
                    padding: '6px 14px',
                    background: activeMode ? 'var(--accent-blue)' : 'transparent',
                    color: activeMode ? 'var(--brand-ink)' : 'var(--text-tertiary)',
                  }}
                >
                  {key === 'real' ? 'Real' : 'Paper'}
                </button>
              )
            })}
          </div>

          <span className="truncate text-[12px] text-text-tertiary">
            {updatedAt
              ? `Updated ${updatedAt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`
              : 'Updating…'}
          </span>

          <div className="flex-1" />

          <button
            type="button"
            onClick={onAddPosition}
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
            <span className="max-[420px]:hidden">Add position</span>
          </button>
        </div>

        <MetricsStrip book={book} realized={realized} loading={loading} />
      </div>
    </div>
  )
}
