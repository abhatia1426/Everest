import { useMemo, useState } from 'react'
import { ChevronRight, Pin, Search } from 'lucide-react'

import { CompanyLogo } from '../ui/CompanyLogo'
import { EmptyState, Skeleton } from '../States'
import { fmtMoney, fmtPercent, fmtSignedMoney } from '../../lib/format'
import { smoothPath } from '../../lib/portfolio'
import { MOMENTUM } from '../../lib/monitor'

/**
 * The monitor board — dense rows, one per watched symbol.
 *
 * NOT CARDS. The board's job is a sweep: fourteen symbols read top to bottom
 * in one pass, comparing the same figure across rows. That only works when the
 * figures are column-aligned, which is why this is a ledger geometry and why
 * the previous tile grid was replaced — four tiles across put every symbol's
 * price at a different x-position, so comparing them meant reading rather than
 * scanning.
 *
 * The grid and its three responsive steps are the approved file's, verbatim:
 *
 *   >1400   Tracking 96 100 220 130 92 30
 *   ≤1400   drop the 30-day range (the stage still carries it)
 *   ≤1220   restored — the stage has destacked below the board by now, so the
 *           board has the full page width again
 *   ≤940    drop the range and momentum; price and day move stay
 *
 * SELECTING A ROW DOES NOT NAVIGATE. It drives the stage beside the board, so
 * comparing two symbols costs two clicks and no page loads. Leaving the page is
 * an explicit act — "Open detail" on the stage.
 *
 * WHERE A ROW HAS NO HISTORY the geometry is preserved and the cell says so.
 * The sparkline column keeps its height, the range rail keeps its track, and
 * both render an em dash. A flat line across an empty sparkline would assert a
 * month of no movement we never observed.
 */

const GRID = [
  '[grid-template-columns:minmax(160px,1.3fr)_96px_100px_220px_130px_92px_30px]',
  'max-[1400px]:[grid-template-columns:minmax(150px,1.3fr)_96px_100px_176px_92px_30px]',
  'max-[1220px]:[grid-template-columns:minmax(160px,1.3fr)_96px_100px_220px_130px_92px_30px]',
  'max-[940px]:[grid-template-columns:minmax(150px,1.3fr)_96px_100px_176px_30px]',
].join(' ')

/* The 30-day range leaves at 1400, returns at 1220, leaves again at 940. */
const RANGE_CELL = 'max-[1400px]:hidden max-[1220px]:block max-[940px]:hidden'
const MOMENTUM_CELL = 'max-[940px]:hidden'

const HEADS = [
  { key: 'tracking', label: 'Tracking', align: 'text-left', cell: '' },
  { key: 'last', label: 'Last', align: 'text-right', cell: '' },
  { key: 'today', label: 'Today', align: 'text-right', cell: '' },
  { key: 'sessions', label: '30 sessions', align: 'text-left', cell: '' },
  { key: 'range', label: '30d range', align: 'text-left', cell: RANGE_CELL },
  { key: 'momentum', label: 'Momentum', align: 'text-left', cell: MOMENTUM_CELL },
]

const SORTS = [
  { key: 'move', label: 'Move' },
  { key: 'return30', label: '30d' },
  { key: 'price', label: 'Price' },
  { key: 'ticker', label: 'A-Z' },
]

function directionColor(value) {
  if (typeof value !== 'number' || value === 0) return 'var(--text-tertiary)'
  return value > 0 ? 'var(--accent-green)' : 'var(--accent-red)'
}

function momentumTone(label) {
  if (label === MOMENTUM.GAINING) {
    return { color: 'var(--accent-green)', background: 'var(--up-soft)', rotate: 'none' }
  }
  if (label === MOMENTUM.FADING) {
    return { color: 'var(--accent-red)', background: 'var(--down-soft)', rotate: 'rotate(180deg)' }
  }
  return { color: 'var(--text-secondary)', background: 'var(--nested-bg)', rotate: 'rotate(90deg)' }
}

function ScopePills({ scope, onScope, counts }) {
  return (
    <div
      className="flex shrink-0 items-center gap-0.5 overflow-x-auto rounded-full scroll-none"
      style={{ padding: 3, background: 'var(--nested-bg)' }}
      role="radiogroup"
      aria-label="Scope"
    >
      {['All', 'Pinned', 'Attention', 'Gainers', 'Losers'].map((key) => {
        const active = key === scope
        return (
          <button
            key={key}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onScope(key)}
            className={`flex shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap
              rounded-full text-[12px] tracking-[-0.01em] transition-colors duration-150
              ${active ? 'font-bold text-text-primary' : 'font-medium text-text-tertiary hover:text-text-secondary'}`}
            style={{
              padding: '6px 12px',
              background: active ? 'var(--panel-bg)' : 'transparent',
              boxShadow: active ? 'var(--shadow-surface)' : 'none',
            }}
          >
            {key}
            <span
              className="num rounded-[5px] text-[10px] font-bold"
              style={{
                padding: '1px 5px',
                background: active ? 'var(--accent-blue)' : 'var(--track-bg)',
                color: active ? 'var(--brand-ink)' : 'var(--text-tertiary)',
              }}
            >
              {counts[key]}
            </span>
          </button>
        )
      })}
    </div>
  )
}

function BoardControls({ scope, onScope, counts, query, onQuery, sort, onSort }) {
  return (
    <div
      className="flex shrink-0 flex-wrap items-center gap-[9px]"
      style={{ padding: '13px 16px', boxShadow: '0 1px 0 var(--border)' }}
    >
      <ScopePills scope={scope} onScope={onScope} counts={counts} />

      <div className="relative flex shrink-0 items-center">
        <Search
          size={14}
          strokeWidth={1.8}
          className="pointer-events-none absolute left-[11px] text-text-tertiary"
          aria-hidden="true"
        />
        <input
          value={query}
          onChange={(event) => onQuery(event.target.value)}
          placeholder="Search watchlist"
          aria-label="Search watchlist"
          className="w-[186px] rounded-full text-[12.5px] text-text-primary outline-none
            transition-colors duration-150 focus:border-accent max-[660px]:w-[132px]"
          style={{
            padding: '7px 12px 7px 32px',
            background: 'var(--glass-soft)',
            border: '1px solid var(--glass-soft-border)',
            backdropFilter: 'blur(14px)',
            WebkitBackdropFilter: 'blur(14px)',
          }}
        />
      </div>

      <div className="flex-1" />

      <div className="flex shrink-0 items-center gap-2">
        <span className="shrink-0 text-[11px] font-semibold uppercase tracking-[0.06em] text-text-tertiary max-[560px]:hidden">
          Sort
        </span>
        <div
          className="flex shrink-0 items-center gap-0.5 rounded-full"
          style={{ padding: 3, background: 'var(--nested-bg)' }}
          role="radiogroup"
          aria-label="Sort"
        >
          {SORTS.map((option) => {
            const active = option.key === sort
            return (
              <button
                key={option.key}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => onSort(option.key)}
                className={`cursor-pointer rounded-full text-[11.5px] transition-colors duration-150
                  ${active ? 'font-bold text-text-primary' : 'font-medium text-text-tertiary hover:text-text-primary'}`}
                style={{
                  padding: '5px 11px',
                  background: active ? 'var(--panel-bg)' : 'transparent',
                }}
              >
                {option.label}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function BoardHead() {
  return (
    <div
      className={`grid shrink-0 items-center gap-2.5 ${GRID}`}
      style={{ padding: '9px 16px 8px', boxShadow: '0 1px 0 var(--border)' }}
      role="row"
    >
      {HEADS.map((head) => (
        <span
          key={head.key}
          role="columnheader"
          className={`text-[10px] font-semibold uppercase tracking-[0.11em] text-text-tertiary
            ${head.align} ${head.cell}`}
        >
          {head.label}
        </span>
      ))}
      <span />
    </div>
  )
}

/**
 * One row.
 *
 * The sub-line carries the company and sector at rest, and SWAPS to the
 * attention reason while the row is hovered or selected. That is the approved
 * behaviour and it is the reason attention can be a three-word badge: the
 * badge names the condition, the sub-line states it in the symbol's own
 * numbers, and neither is a score.
 */
function BoardRow({ row, selected, pinned, onSelect }) {
  const [hovered, setHovered] = useState(false)
  const spark = useMemo(() => smoothPath(row.series || [], 220, 34, 3), [row.series])
  const sparkEndY = useMemo(() => {
    if (!row.series || row.series.length < 2) return null
    const min = Math.min(...row.series)
    const max = Math.max(...row.series)
    const span = max - min || 1
    return (3 + (1 - (row.series[row.series.length - 1] - min) / span) * 28).toFixed(1)
  }, [row.series])

  const dayColor = row.hasQuote ? directionColor(row.changePercent) : 'var(--text-tertiary)'
  const trendColor = row.hasQuote
    ? directionColor(row.return30)
    : 'var(--text-tertiary)'
  const momentum = row.momentum ? momentumTone(row.momentum.label) : null
  const reason = row.attention?.reason || null
  // The sub-line swaps to the attention reason on hover OR selection — the
  // approved behaviour, and the reason a three-word badge is enough: the badge
  // names the condition, this states it in the symbol's own numbers.
  const showReason = selected || hovered

  return (
    <div
      role="row"
      tabIndex={0}
      aria-selected={selected}
      onClick={() => onSelect(row.ticker)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setHovered(true)}
      onBlur={() => setHovered(false)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onSelect(row.ticker)
        }
      }}
      className={`group grid cursor-pointer items-center gap-3 outline-none transition-colors
        duration-150 ${GRID} ${selected ? '' : 'hover:bg-tint/[0.045]'}`}
      style={{
        padding: '14px 16px',
        background: selected
          ? 'color-mix(in oklab, var(--accent-blue) 9%, var(--nested-bg))'
          : 'transparent',
        boxShadow: selected
          ? 'inset 3px 0 0 var(--accent-blue), 0 1px 0 var(--border)'
          : '0 1px 0 var(--border)',
      }}
    >
      <div className="flex min-w-0 items-center gap-3">
        <span
          className="shrink-0 rounded-[10px] transition-shadow duration-150"
          style={{ boxShadow: selected ? '0 0 0 1px var(--accent-blue)' : 'none' }}
        >
          <CompanyLogo ticker={row.ticker} name={row.name} size={34} />
        </span>
        <span className="min-w-0">
          <span className="flex items-center gap-1.5">
            <span className="num font-display text-[14px] font-bold tracking-[-0.025em] text-text-primary">
              {row.ticker}
            </span>
            {pinned ? (
              <Pin size={10} className="shrink-0 text-accent" fill="currentColor" strokeWidth={0} />
            ) : null}
            {/*
              The badge names a CONDITION that fired, never a rating. "No
              quote" is excluded here because the price column already says it
              and a brand-blue badge would make a missing quote look like an
              event worth acting on.
            */}
            {row.attention && row.attention.tag !== 'No quote' ? (
              <span
                className="shrink-0 whitespace-nowrap rounded-[5px] text-[9px] font-extrabold
                  uppercase tracking-[0.05em]"
                style={{
                  padding: '1px 5px',
                  background: 'var(--accent-blue)',
                  color: 'var(--brand-ink)',
                }}
                title={row.attention.reason}
              >
                {row.attention.tag}
              </span>
            ) : null}
          </span>
          <span
            className="block truncate text-[11.5px] transition-colors duration-150"
            style={{
              color: reason && showReason ? 'var(--accent-blue)' : 'var(--text-secondary)',
            }}
          >
            {reason && showReason ? reason : `${row.name}${row.sector ? ` · ${row.sector}` : ''}`}
          </span>
        </span>
      </div>

      <div className="text-right">
        <div
          className="num font-display text-[14.5px] font-bold tracking-[-0.03em]"
          style={{ color: row.price === null ? 'var(--text-tertiary)' : 'var(--text-primary)' }}
        >
          {row.price === null ? '—' : fmtMoney(row.price)}
        </div>
        <div className="text-[10px] text-text-tertiary">
          {row.hasQuote ? '' : row.price === null ? 'no price' : 'last close'}
        </div>
      </div>

      <div className="text-right">
        <div
          className="num font-display text-[14.5px] font-bold tracking-[-0.03em]"
          style={{ color: dayColor }}
        >
          {row.hasQuote ? fmtPercent(row.changePercent) : '—'}
        </div>
        <div
          className="num text-[10.5px] font-semibold opacity-[0.66]"
          style={{ color: dayColor }}
        >
          {row.hasQuote && row.change !== null ? fmtSignedMoney(row.change) : '—'}
        </div>
      </div>

      {/* Geometry is preserved with or without a series — a row must not
          change height because its provider call was deferred. */}
      <div
        className="flex h-[34px] items-center"
        title={spark ? undefined : 'No 30-session history available for this symbol yet'}
      >
        {spark ? (
          <svg
            viewBox="0 0 220 34"
            preserveAspectRatio="none"
            className="block h-[34px] w-full overflow-visible"
            aria-hidden="true"
          >
            <path
              d={`${spark} L220 34 L0 34 Z`}
              fill={row.return30 >= 0 ? 'var(--up-soft)' : 'var(--down-soft)'}
            />
            <path
              d={spark}
              fill="none"
              stroke={trendColor}
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
            <circle cx="220" cy={sparkEndY} r="2.2" fill={trendColor} />
          </svg>
        ) : (
          <span className="text-[11px] text-text-tertiary">—</span>
        )}
      </div>

      <div className={RANGE_CELL}>
        <div
          className="relative h-[5px] rounded-full hatch-dim"
          style={{ backgroundColor: 'var(--nested-bg)' }}
          aria-hidden="true"
        >
          {row.position !== null ? (
            <span
              className="absolute w-[3px] -translate-x-1/2 rounded-[2px]"
              style={{
                left: `${(row.position * 100).toFixed(1)}%`,
                top: -3.5,
                bottom: -3.5,
                background: 'var(--text-primary)',
              }}
            />
          ) : null}
        </div>
        <div className="num mt-[5px] flex justify-between gap-1.5 text-[9.5px] text-text-tertiary">
          <span>{row.low === null ? '—' : fmtMoney(row.low)}</span>
          <span>{row.high === null ? '—' : fmtMoney(row.high)}</span>
        </div>
      </div>

      <div className={MOMENTUM_CELL} title={row.momentum ? undefined : 'Needs 31 sessions'}>
        {momentum ? (
          <div
            className="inline-flex items-center gap-1.5 rounded-full"
            style={{ padding: '4px 9px', background: momentum.background }}
          >
            <svg
              width="9"
              height="9"
              viewBox="0 0 12 12"
              fill={momentum.color}
              style={{ transform: momentum.rotate }}
              aria-hidden="true"
            >
              <path d="M6 1.5l4.4 7.5H1.6z" />
            </svg>
            <span
              className="whitespace-nowrap text-[11px] font-bold"
              style={{ color: momentum.color }}
            >
              {row.momentum.label}
            </span>
          </div>
        ) : (
          <span className="text-[11px] text-text-tertiary">—</span>
        )}
      </div>

      <div
        className="flex items-center justify-center transition-all duration-150"
        style={{
          color: selected ? 'var(--accent-blue)' : 'var(--text-tertiary)',
          transform: selected ? 'translateX(2px)' : 'none',
        }}
      >
        <ChevronRight size={12} strokeWidth={2} className="group-hover:text-text-primary" />
      </div>
    </div>
  )
}

export function MonitorBoard({
  rows,
  selected,
  onSelect,
  isPinned,
  scope,
  onScope,
  counts,
  query,
  onQuery,
  sort,
  onSort,
  loading,
  onClearFilters,
}) {
  return (
    <section
      className="flex h-full min-h-[380px] flex-col overflow-hidden"
      style={{
        borderRadius: 'var(--radius-surface)',
        background: 'var(--panel-bg)',
        boxShadow: 'var(--shadow-surface)',
      }}
      aria-label="Watchlist monitor"
    >
      <BoardControls
        scope={scope}
        onScope={onScope}
        counts={counts}
        query={query}
        onQuery={onQuery}
        sort={sort}
        onSort={onSort}
      />

      {/*
        ONE scroll container for both axes, because the board must scroll
        INSIDE its panel rather than growing the page. A sixteen-symbol
        watchlist would otherwise make this column 1,300px tall, and the stage
        beside it — a grid sibling — would stretch to match, turning a 208px
        chart into a full-viewport one. The head is sticky so the columns stay
        labelled through the scroll.
      */}
      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-auto">
        <div className="min-w-[520px]">
          <div className="sticky top-0 z-10" style={{ background: 'var(--panel-bg)' }}>
            <BoardHead />
          </div>

          <div>
            {loading ? (
              <div className="space-y-2 p-4">
                {Array.from({ length: 8 }).map((_, index) => (
                  <Skeleton key={index} className="h-[62px] w-full rounded-nested" />
                ))}
              </div>
            ) : rows.length === 0 ? (
              <div className="px-5 py-10">
                <EmptyState
                  title="Nothing matches"
                  description={
                    scope === 'Attention'
                      ? 'Nothing on your watchlist is at a 30-session extreme or moving unusually against its own normal day right now.'
                      : 'Try a different company name, ticker or sector.'
                  }
                  action={
                    <button
                      type="button"
                      onClick={onClearFilters}
                      className="btn-ghost cursor-pointer"
                    >
                      Show everything
                    </button>
                  }
                />
              </div>
            ) : (
              rows.map((row) => (
                <BoardRow
                  key={row.id || row.ticker}
                  row={row}
                  selected={row.ticker === selected}
                  pinned={isPinned(row.ticker)}
                  onSelect={onSelect}
                />
              ))
            )}
          </div>
        </div>
      </div>
    </section>
  )
}
