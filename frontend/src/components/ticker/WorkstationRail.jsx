import { Link } from 'react-router-dom'
import { BarChart3, ChevronRight, Newspaper, Plus, Sparkles, Trash2 } from 'lucide-react'

import { fmtCompact, fmtMoney, fmtNumber, fmtPercent, fmtSignedMoney } from '../../lib/format'
import { MOMENTUM, momentumWhy } from '../../lib/monitor'

/**
 * The workstation's right rail — what you consult WHILE reading the chart.
 *
 * Four blocks in the approved order: your position (it changes how every other
 * figure reads), today's session, the derived range-and-behaviour facts, and
 * the routes onward. Each is a real measurement or an honest em dash; none of
 * them is a score, a rating or a recommendation.
 */

function directionColor(value) {
  if (typeof value !== 'number' || value === 0) return 'var(--text-tertiary)'
  return value > 0 ? 'var(--accent-green)' : 'var(--accent-red)'
}

function RailSection({ children, edge = true, className = '' }) {
  return (
    <div
      className={`shrink-0 ${className}`}
      style={edge ? { boxShadow: '0 1px 0 var(--border)' } : undefined}
    >
      {children}
    </div>
  )
}

function StatGrid({ stats }) {
  return (
    <div
      data-railgrid
      className="grid grid-cols-3 gap-3 max-[900px]:grid-cols-2"
    >
      {stats.map((stat) => (
        <div key={stat.key}>
          <div className="whitespace-nowrap text-[9.5px] font-semibold uppercase tracking-[0.08em] text-text-tertiary">
            {stat.key}
          </div>
          <div
            className="num mt-[3px] whitespace-nowrap font-display text-[13px] font-bold tracking-[-0.03em]"
            style={{ color: stat.color || 'var(--text-primary)' }}
          >
            {stat.value}
          </div>
        </div>
      ))}
    </div>
  )
}

/**
 * Ownership.
 *
 * BLENDED POSITIONS ONLY. Everest stores one averaged holding per symbol —
 * adding shares re-averages the cost rather than appending a lot — so there is
 * no "Lots" view to link to and the approved mockup's third action is not
 * carried over. An empty lots screen would assert a concept the product does
 * not model.
 *
 * NO SELL BUTTON. There is no sell, reduce or close flow anywhere in Everest,
 * and a button labelled Sell would imply an execution that cannot happen. The
 * real destructive action deletes the tracked holding without booking a trade,
 * so it is labelled for what it does.
 */
function OwnershipPanel({ symbol, holding, book, onAddPosition, onRemove, removing }) {
  if (!holding) {
    return (
      <RailSection className="p-[15px_17px_17px]">
        <div className="mb-[13px] text-[10.5px] font-bold uppercase tracking-[0.1em] text-text-tertiary">
          Not held
        </div>
        <div className="flex items-start gap-3">
          <span
            className="grid h-[38px] w-[38px] shrink-0 place-items-center rounded-[12px] text-text-tertiary hatch-dim"
            style={{ backgroundColor: 'var(--nested-bg)', border: '1px solid var(--border)' }}
            aria-hidden="true"
          >
            <Plus size={17} strokeWidth={1.7} />
          </span>
          <span className="min-w-0">
            <span className="block text-[13.5px] font-bold tracking-[-0.02em] text-text-primary">
              You do not hold {symbol}
            </span>
            <span className="mt-[3px] block text-pretty text-[12px] text-text-secondary">
              Position figures appear here once you record shares in this book.
            </span>
          </span>
        </div>
        <button
          type="button"
          onClick={onAddPosition}
          className="mt-3.5 flex w-full cursor-pointer items-center justify-center gap-[7px]
            rounded-full text-[12.5px] font-bold transition-colors duration-150"
          style={{
            padding: '10px 16px',
            background: 'var(--accent-blue)',
            color: 'var(--brand-ink)',
            boxShadow: '0 8px 20px -10px var(--accent-blue)',
          }}
        >
          Add a position
        </button>
      </RailSection>
    )
  }

  const weight = book?.totalValue ? (holding.marketValue / book.totalValue) * 100 : null
  const fill = holding.costBasis
    ? Math.min(100, (holding.costBasis / Math.max(holding.marketValue, holding.costBasis)) * 100)
    : 0

  return (
    <RailSection edge={false} className="p-[17px_18px_19px]">
      <div className="mb-3 flex items-center gap-[9px]">
        <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-text-primary">
          You own it
        </span>
        <div className="flex-1" />
        {weight === null ? null : (
          <span
            className="num whitespace-nowrap rounded-[6px] text-[10px] font-bold"
            style={{
              padding: '2px 7px',
              background: 'color-mix(in oklab, var(--accent-blue) 16%, transparent)',
              color: 'var(--accent-blue)',
            }}
          >
            {weight.toFixed(1)}% of portfolio
          </span>
        )}
      </div>

      <div className="flex flex-wrap items-end gap-[11px]">
        <span className="num font-display text-[31px] font-extrabold leading-none tracking-[-0.045em] text-text-primary">
          {fmtMoney(holding.marketValue)}
        </span>
        <div
          className="num mb-0.5 flex items-center gap-1.5 rounded-full text-[12.5px] font-bold tracking-[-0.02em]"
          style={{
            padding: '4px 10px',
            background: holding.unrealized >= 0 ? 'var(--up-soft)' : 'var(--down-soft)',
            color: directionColor(holding.unrealized),
          }}
        >
          <svg
            width="9"
            height="9"
            viewBox="0 0 12 12"
            fill="currentColor"
            aria-hidden="true"
            style={{ transform: holding.unrealized >= 0 ? 'none' : 'rotate(180deg)' }}
          >
            <path d="M6 1.5l4.4 7.5H1.6z" />
          </svg>
          {holding.pnlPercent === null ? '—' : fmtPercent(holding.pnlPercent)}
          <span className="font-semibold opacity-[0.72]">{fmtSignedMoney(holding.unrealized)}</span>
        </div>
      </div>

      {/* Cost against value, as one bar. The filled part is what was paid; the
          track is what it is worth now. */}
      <div
        className="relative mt-3.5 h-1.5 overflow-hidden rounded-full hatch-dim"
        style={{ backgroundColor: 'var(--nested-bg)' }}
        aria-hidden="true"
      >
        <span
          className="absolute bottom-0 left-0 top-0 rounded-full"
          style={{ width: `${fill}%`, background: directionColor(holding.unrealized), opacity: 0.55 }}
        />
      </div>
      <div className="num mt-1.5 flex justify-between gap-2 text-[10.5px] text-text-tertiary">
        <span>Cost {fmtMoney(holding.costBasis)}</span>
        <span>Now {fmtMoney(holding.marketValue)}</span>
      </div>

      <div className="mt-[15px] pt-[13px]" style={{ boxShadow: '0 -1px 0 var(--border)' }}>
        <StatGrid
          stats={[
            {
              key: 'Shares',
              value: fmtNumber(holding.qty, holding.qty % 1 === 0 ? 0 : 2),
            },
            { key: 'Avg cost', value: fmtMoney(holding.avgCost) },
            {
              // An unmeasured day is an em dash, not a zero: we did not observe
              // a flat session, we observed no session.
              key: 'Today',
              value: holding.measured ? fmtSignedMoney(holding.dayAbs) : '—',
              color: holding.measured ? directionColor(holding.dayAbs) : 'var(--text-tertiary)',
            },
          ]}
        />
      </div>

      {/*
        TWO REAL ACTIONS. The approved mockup offers Buy more / Sell / Lots;
        Everest has no sell flow and stores no lots, so those two are not drawn
        rather than drawn dead. What remains does exactly what it says.
      */}
      <div className="mt-3.5 flex items-center gap-[7px]">
        <button
          type="button"
          onClick={onAddPosition}
          className="flex-1 cursor-pointer rounded-full text-[12.5px] font-semibold text-text-primary
            transition-colors duration-150"
          style={{ padding: '9px 12px', background: 'var(--track-bg)' }}
        >
          Add to position
        </button>
        <button
          type="button"
          disabled={removing}
          onClick={onRemove}
          title={`Stop tracking ${symbol}. This does not record a sale.`}
          className="flex cursor-pointer items-center gap-1.5 rounded-full text-[12.5px]
            font-semibold text-text-secondary transition-colors duration-150 hover:border-down
            hover:bg-down/10 hover:text-down disabled:opacity-50"
          style={{ padding: '9px 12px', border: '1px solid var(--border-strong)' }}
        >
          <Trash2 size={11} strokeWidth={1.8} />
          {removing ? 'Removing…' : 'Stop tracking'}
        </button>
      </div>
    </RailSection>
  )
}

/**
 * Today's session, from the quote's own fields plus the intraday bars.
 *
 * `volume` is absent from this provider's quote payload, so today's traded size
 * is summed from the 1D candles when they are in hand and is an em dash when
 * they are not. It is never inferred from anything else.
 */
function SessionPanel({ quote, session, dayVolume, avgVolume }) {
  const low = quote?.day_low
  const high = quote?.day_high
  const prev = quote?.previous_close
  const price = quote?.price

  const bounds =
    typeof low === 'number' && typeof high === 'number'
      ? { low: Math.min(low, prev ?? low), high: Math.max(high, prev ?? high) }
      : null
  const span = bounds ? bounds.high - bounds.low || 1 : null

  const relative =
    typeof dayVolume === 'number' && typeof avgVolume === 'number' && avgVolume > 0
      ? dayVolume / avgVolume
      : null

  return (
    <RailSection className="p-[14px_18px_15px]">
      <div className="mb-3 flex items-center gap-[9px]">
        <span className="text-[9.5px] font-bold uppercase tracking-[0.11em] text-text-tertiary">
          Today&rsquo;s session
        </span>
        <div className="flex-1" />
        <span className="text-[10.5px] text-text-tertiary">{session.detail}</span>
      </div>

      <div
        className="relative h-2 rounded-full hatch-dim"
        style={{ backgroundColor: 'var(--nested-bg)' }}
        aria-hidden="true"
      >
        {bounds && typeof prev === 'number' ? (
          <span
            className="absolute w-0.5 -translate-x-1/2 rounded-[2px]"
            style={{
              left: `${((prev - bounds.low) / span) * 100}%`,
              top: -3,
              bottom: -3,
              background: 'var(--border-strong)',
            }}
          />
        ) : null}
        {bounds && typeof price === 'number' ? (
          <span
            className="absolute w-[3px] -translate-x-1/2 rounded-[2px]"
            style={{
              left: `${((price - bounds.low) / span) * 100}%`,
              top: -4,
              bottom: -4,
              background: 'var(--text-primary)',
              boxShadow: '0 0 0 3px var(--panel-bg)',
            }}
          />
        ) : null}
      </div>

      <div className="num mt-1.5 flex justify-between gap-2 text-[10.5px] text-text-secondary">
        <span>{bounds ? `${fmtMoney(bounds.low)} low` : '—'}</span>
        <span className="text-text-tertiary">
          {typeof prev === 'number' ? `prev ${fmtMoney(prev)}` : 'prev —'}
        </span>
        <span>{bounds ? `${fmtMoney(bounds.high)} high` : '—'}</span>
      </div>

      <div className="mt-3.5">
        <StatGrid
          stats={[
            { key: 'Open', value: typeof quote?.open === 'number' ? fmtMoney(quote.open) : '—' },
            {
              key: 'Volume',
              value: typeof dayVolume === 'number' && dayVolume > 0 ? fmtCompact(dayVolume) : '—',
              color: relative !== null && relative >= 1.5 ? 'var(--accent-blue)' : undefined,
            },
            {
              key: 'vs avg vol',
              value: relative === null ? '—' : `${relative.toFixed(1)}×`,
              color: 'var(--text-secondary)',
            },
          ]}
        />
      </div>
    </RailSection>
  )
}

/**
 * Range and behaviour — the four derived facts, each with the arithmetic that
 * produced it available on hover.
 *
 * Every one of these comes from `lib/monitor`, the same module the Watchlist
 * board reads, so the two pages cannot state different momentum or a different
 * 30-day position for the same symbol in the same second.
 */
function BehaviourPanel({ frame, row, quote }) {
  const momentum = row?.momentum
  const momentumColor =
    momentum?.label === MOMENTUM.GAINING
      ? 'var(--accent-green)'
      : momentum?.label === MOMENTUM.FADING
        ? 'var(--accent-red)'
        : 'var(--text-secondary)'

  const dayPercent = typeof quote?.change_percent === 'number' ? quote.change_percent : null
  const vsNormal =
    dayPercent !== null && row?.averageDaily ? Math.abs(dayPercent) / row.averageDaily : null

  const facts = [
    {
      key: 'In 52-week range',
      value: frame?.position === null || !frame ? '—' : `${(frame.position * 100).toFixed(0)}%`,
      note: frame ? `${fmtMoney(frame.low)} low to ${fmtMoney(frame.high)} high` : 'No 52-week range available',
      tip: frame
        ? `Where ${fmtMoney(quote?.price)} sits between the 52-week low ${fmtMoney(frame.low)} and high ${fmtMoney(frame.high)}. 0% is at the low, 100% at the high.${frame.derived ? ' Computed from the year of daily closes Everest holds.' : ''}`
        : undefined,
    },
    {
      key: 'In 30-day range',
      value: row?.position === null || !row ? '—' : `${(row.position * 100).toFixed(0)}%`,
      note:
        row?.low === null || !row
          ? 'No 30-session history'
          : `${fmtMoney(row.low)} to ${fmtMoney(row.high)} on closes`,
      tip:
        row?.low === null || !row
          ? undefined
          : `The same measure over the last 30 closing prices: low ${fmtMoney(row.low)}, high ${fmtMoney(row.high)}.`,
    },
    {
      key: 'Today vs normal day',
      value: vsNormal === null ? '—' : `${vsNormal.toFixed(1)}×`,
      note: row?.averageDaily
        ? `Normal day is ${row.averageDaily.toFixed(2)}% over 30 sessions`
        : 'No 30-session history to compare against',
      tip:
        vsNormal === null
          ? undefined
          : `Today's move is ${Math.abs(dayPercent).toFixed(2)}%. The average day-to-day move over the last 30 sessions is ${row.averageDaily.toFixed(2)}%. ${vsNormal.toFixed(1)}× means today is that many times the usual size — direction is not part of it.`,
    },
    {
      key: 'Momentum',
      value: momentum?.label || '—',
      color: momentum ? momentumColor : 'var(--text-tertiary)',
      note: momentumWhy(momentum),
      tip: momentum
        ? `Return per day over the last 10 sessions (${momentum.recentRate.toFixed(2)}%/day) compared with the 20 sessions before them (${momentum.priorRate.toFixed(2)}%/day). Faster now reads Gaining, slower reads Fading, within 0.05%/day reads Steady. Not a score or a forecast.`
        : undefined,
      last: true,
    },
  ]

  return (
    <RailSection className="p-[14px_18px_15px]">
      <div className="mb-2.5 text-[9.5px] font-bold uppercase tracking-[0.11em] text-text-tertiary">
        Range and behaviour
      </div>
      <div className="flex flex-col">
        {facts.map((fact) => (
          <div
            key={fact.key}
            title={fact.tip}
            className="flex items-baseline justify-between gap-3 py-2 transition-colors duration-150 hover:bg-tint/[0.03]"
            style={{ boxShadow: fact.last ? 'none' : '0 1px 0 var(--border)', cursor: fact.tip ? 'help' : 'default' }}
          >
            <span className="min-w-0">
              <span className="block text-[11.5px] font-semibold tracking-[-0.01em] text-text-secondary">
                {fact.key}
              </span>
              <span className="mt-0.5 block text-pretty text-[10.5px] text-text-tertiary">
                {fact.note}
              </span>
            </span>
            <span
              className="num shrink-0 font-display text-[13.5px] font-bold tracking-[-0.035em]"
              style={{ color: fact.color || 'var(--text-primary)' }}
            >
              {fact.value}
            </span>
          </div>
        ))}
      </div>
    </RailSection>
  )
}

/**
 * Inspect next — the routes onward.
 *
 * These are the page's REAL research capabilities, kept subordinate to the
 * workstation exactly as the approved composition asks: News, the AI thesis and
 * the options chain live in a band beneath the chart, and these are the way in.
 * The last entry leaves the page entirely.
 */
function InspectNext({ symbol, onJump, held }) {
  const items = [
    {
      key: 'Recent coverage',
      note: `Headlines and sentiment for ${symbol}`,
      icon: Newspaper,
      onClick: () => onJump('News'),
    },
    {
      key: 'AI thesis',
      note: 'A bull and bear case, grounded in live data',
      icon: Sparkles,
      onClick: () => onJump('AI Thesis'),
    },
    {
      key: 'Options chain',
      note: held ? `Contracts you hold on ${symbol}` : `Strikes and expiries for ${symbol}`,
      icon: BarChart3,
      onClick: () => onJump('Options'),
    },
  ]

  return (
    <RailSection edge={false} className="p-[14px_18px_18px]">
      <div className="mb-2.5 text-[9.5px] font-bold uppercase tracking-[0.11em] text-text-tertiary">
        Inspect next
      </div>
      <div className="flex flex-col gap-[7px]">
        {items.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={item.onClick}
            className="flex cursor-pointer items-center gap-2.5 rounded-[12px] text-left
              transition-colors duration-150 hover:bg-tint/[0.05]"
            style={{ padding: '10px 12px', background: 'var(--nested-bg)' }}
          >
            <span
              className="grid h-[26px] w-[26px] shrink-0 place-items-center rounded-[8px] text-accent"
              style={{ background: 'var(--track-bg)' }}
              aria-hidden="true"
            >
              <item.icon size={13} strokeWidth={1.8} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[12.5px] font-semibold tracking-[-0.01em] text-text-primary">
                {item.key}
              </span>
              <span className="mt-px block truncate text-[10.5px] text-text-tertiary">
                {item.note}
              </span>
            </span>
            <ChevronRight size={11} strokeWidth={2} className="shrink-0 text-text-tertiary" />
          </button>
        ))}

        <Link
          to="/app/watchlist"
          className="flex items-center gap-2.5 rounded-[12px] transition-colors duration-150 hover:bg-tint/[0.05]"
          style={{ padding: '10px 12px', background: 'var(--nested-bg)' }}
        >
          <span
            className="grid h-[26px] w-[26px] shrink-0 place-items-center rounded-[8px] text-accent"
            style={{ background: 'var(--track-bg)' }}
            aria-hidden="true"
          >
            <ChevronRight size={13} strokeWidth={1.8} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[12.5px] font-semibold tracking-[-0.01em] text-text-primary">
              Compare on watchlist
            </span>
            <span className="mt-px block truncate text-[10.5px] text-text-tertiary">
              Against the rest of the board
            </span>
          </span>
          <ChevronRight size={11} strokeWidth={2} className="shrink-0 text-text-tertiary" />
        </Link>
      </div>
    </RailSection>
  )
}

export function WorkstationRail({
  symbol,
  holding,
  book,
  quote,
  session,
  frame,
  row,
  dayVolume,
  avgVolume,
  onAddPosition,
  onRemovePosition,
  removing,
  onJump,
}) {
  return (
    <div
      data-rail
      className="flex min-w-0 flex-col overflow-y-auto max-[1260px]:max-h-none"
      style={{
        maxHeight: '100%',
        borderRadius: 'var(--radius-surface)',
        background: 'var(--panel-bg)',
        boxShadow: 'var(--shadow-surface)',
      }}
    >
      <OwnershipPanel
        symbol={symbol}
        holding={holding}
        book={book}
        onAddPosition={onAddPosition}
        onRemove={onRemovePosition}
        removing={removing}
      />

      {/* The design's 10px canvas seam between ownership and the reference
          blocks below it — the rail is one surface carrying two registers. */}
      <div
        className="h-2.5 shrink-0"
        style={{
          background: 'var(--bg-base)',
          boxShadow: 'inset 0 1px 0 var(--border), inset 0 -1px 0 var(--border)',
        }}
        aria-hidden="true"
      />

      <SessionPanel
        quote={quote}
        session={session}
        dayVolume={dayVolume}
        avgVolume={avgVolume}
      />
      <BehaviourPanel frame={frame} row={row} quote={quote} />
      <InspectNext symbol={symbol} onJump={onJump} held={Boolean(holding)} />
    </div>
  )
}
