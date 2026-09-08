import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, ChevronDown, Trash2 } from 'lucide-react'

import { EmptyState, Skeleton } from '../States'
import { CompanyLogo } from '../ui/CompanyLogo'
import { QuoteBadge } from '../ui/QuoteBadge'
import { fmtMoney, fmtNumber, fmtPercent, fmtSignedMoney } from '../../lib/format'
import { RIBBON_BLUES, smoothPath, totalsOf } from '../../lib/portfolio'
import { normalizeQuote, quoteLabel } from '../../lib/quotes'

/**
 * The portfolio ledger — the page's centrepiece, at the approved geometry.
 *
 * Grid, gaps and the three responsive steps are lifted from
 * `Everest Portfolio.dc.html` verbatim:
 *
 *   >1320  Position 62 88 100 106 118 126 150 124 30
 *   ≤1320  drop Contribution
 *   ≤1140  drop Avg cost and Weight
 *   ≤940   drop Qty and Price
 *
 * Rows are 11px tall inside a 16px inset, hairline-separated, and carry a
 * 2px brand edge on hover or while open. Clicking a row expands it INLINE —
 * not into a drawer — so the reader never loses the column alignment that is
 * the entire reason this page is a ledger rather than a grid of cards.
 *
 * TWO BARS, TWO MEANINGS, DELIBERATELY UNALIKE:
 *
 *   Contribution  a diverging bar on a centred baseline over a hatched track,
 *                 coloured by direction and hatched over its own fill. It
 *                 answers "which way, and how much of the book's total
 *                 movement is this one holding".
 *   Weight        a plain rounded blue bar from the left. It answers "how big
 *                 is this position". It is NEVER green or red, because size
 *                 has no direction.
 *
 * Both are real arithmetic on `/pnl`: contribution is the holding's unrealized
 * P/L over the sum of every holding's absolute unrealized P/L; weight is its
 * market value over the portfolio's.
 */

/* One template string, shared by header, rows and footer so they cannot drift. */
const GRID = [
  '[grid-template-columns:minmax(190px,1.7fr)_62px_88px_100px_106px_118px_126px_150px_124px_30px]',
  'max-[1320px]:[grid-template-columns:minmax(180px,1.7fr)_62px_88px_100px_106px_118px_126px_124px_30px]',
  'max-[1140px]:[grid-template-columns:minmax(170px,1.7fr)_62px_100px_106px_118px_126px_30px]',
  'max-[940px]:[grid-template-columns:minmax(150px,1.7fr)_106px_118px_126px_30px]',
].join(' ')

/* Which columns leave, and when. Applied to the cell in header, row AND foot. */
const HIDE_CONTRIBUTION = 'max-[1320px]:hidden'
const HIDE_AT_1140 = 'max-[1140px]:hidden'
const HIDE_AT_940 = 'max-[940px]:hidden'

const HEADS = [
  { key: 'ticker', label: 'Position', align: 'flex-start', hide: '' },
  { key: 'qty', label: 'Qty', align: 'flex-end', hide: HIDE_AT_940 },
  { key: 'basis', label: 'Avg cost', align: 'flex-end', hide: HIDE_AT_1140 },
  { key: 'price', label: 'Price', align: 'flex-end', hide: HIDE_AT_940 },
  { key: 'day', label: 'Day', align: 'flex-end', hide: '' },
  { key: 'value', label: 'Market value', align: 'flex-end', hide: '' },
  { key: 'unrealized', label: 'Unrealized', align: 'flex-end', hide: '' },
  { key: 'contribution', label: 'Contribution', align: 'flex-start', hide: HIDE_CONTRIBUTION },
  { key: 'weight', label: 'Weight', align: 'flex-start', hide: HIDE_AT_1140 },
]

function directionColor(value) {
  if (value === null || value === undefined || value === 0) return 'var(--text-tertiary)'
  return value > 0 ? 'var(--accent-green)' : 'var(--accent-red)'
}

function LedgerHead({ sort, dir, onSort }) {
  return (
    <div
      className={`grid shrink-0 items-center gap-2.5 ${GRID}`}
      style={{ padding: '12px 16px 10px', boxShadow: '0 1px 0 var(--border)' }}
      role="row"
    >
      {HEADS.map((head) => {
        const active = head.key === sort
        return (
          <button
            key={head.key}
            type="button"
            role="columnheader"
            aria-sort={active ? (dir === -1 ? 'descending' : 'ascending') : 'none'}
            onClick={() => onSort(head.key)}
            className={`flex cursor-pointer items-center gap-1 whitespace-nowrap text-[10.5px]
              font-bold uppercase tracking-[0.09em] transition-colors duration-150
              hover:text-text-primary ${head.hide} ${
                active ? 'text-text-primary' : 'text-text-tertiary'
              }`}
            style={{ justifyContent: head.align }}
          >
            {head.label}
            <span
              aria-hidden="true"
              className="inline-block text-[8px]"
              style={{
                opacity: active ? 1 : 0,
                transform: active && dir === -1 ? 'rotate(180deg)' : 'none',
              }}
            >
              ▲
            </span>
          </button>
        )
      })}
      <span />
    </div>
  )
}

/**
 * The inline detail, at the design's three-column geometry.
 *
 * ONLY SUPPORTED DATA. The approved file's expansion carries no lots, no tax
 * treatment, no dividends and no trade history, and neither does this — none
 * of those exist in Everest's model, and an empty "Lots" heading would assert
 * that they do.
 */
function RowDetail({ row, book, series, onOpenAdd, onRemove, removing }) {
  const quote = normalizeQuote(row.raw, { costBasis: row.avgCost })
  const sectorWeight = book.totalValue
    ? ((book.sectors.get(row.sector) || 0) / book.totalValue) * 100
    : 0
  const contribution = (row.unrealized / book.sumAbsUnrealized) * 100
  const weight = book.totalValue ? (row.marketValue / book.totalValue) * 100 : 0
  const vsBasis = row.priceStale || !row.avgCost ? null : (row.price / row.avgCost - 1) * 100
  const spark = useMemo(() => smoothPath(series || [], 220, 44, 3), [series])

  return (
    <div
      className="grid gap-[18px] [grid-template-columns:minmax(0,1.15fr)_minmax(0,1fr)_minmax(0,0.95fr)]
        max-[940px]:[grid-template-columns:minmax(0,1fr)]"
      style={{
        padding: '16px 16px 18px 59px',
        background: 'var(--nested-bg)',
        boxShadow: '0 1px 0 var(--border)',
      }}
    >
      <div>
        <div className="mb-[9px] text-[10.5px] font-bold uppercase tracking-[0.09em] text-text-tertiary">
          Cost basis
        </div>
        <div className="flex flex-wrap items-baseline gap-[7px] text-[13px] text-text-secondary">
          <span className="num font-display text-[15px] font-bold tracking-[-0.03em] text-text-primary">
            {fmtNumber(row.qty, row.qty % 1 === 0 ? 0 : 2)}
          </span>
          <span>sh ×</span>
          <span className="num font-display text-[15px] font-bold tracking-[-0.03em] text-text-primary">
            {fmtMoney(row.avgCost)}
          </span>
          <span>=</span>
          <span className="num font-display text-[15px] font-bold tracking-[-0.03em] text-text-primary">
            {fmtMoney(row.costBasis)}
          </span>
        </div>

        <div className="mt-2 flex items-center gap-[7px] text-[12.5px] text-text-secondary">
          <ArrowRight size={12} className="text-text-tertiary" strokeWidth={1.8} />
          now worth{' '}
          <strong className="num font-bold text-text-primary">{fmtMoney(row.marketValue)}</strong>
          <span className="num font-bold" style={{ color: directionColor(row.unrealized) }}>
            {fmtSignedMoney(row.unrealized)}
          </span>
        </div>

        <div className="mt-2.5 text-[12px] text-text-tertiary">
          {vsBasis === null ? (
            <>Break-even at {fmtMoney(row.avgCost)} · no quote, so the market comparison is unavailable</>
          ) : (
            <>
              Break-even at {fmtMoney(row.avgCost)} · market is {fmtPercent(vsBasis)}{' '}
              {vsBasis >= 0 ? 'above' : 'below'} that
            </>
          )}
        </div>

        {/* Provenance, because the two figures above are only as good as the
            price they were struck at. Renders nothing for a live quote. */}
        <QuoteBadge quote={quote} className="mt-2.5" />
      </div>

      <div className="grid content-start gap-x-[18px] gap-y-3.5 [grid-template-columns:1fr_1fr]">
        {[
          {
            label: 'Day P/L',
            value: row.measured ? fmtSignedMoney(row.dayAbs) : '—',
            color: row.measured ? directionColor(row.dayAbs) : 'var(--text-tertiary)',
          },
          { label: 'Share of portfolio', value: `${weight.toFixed(1)}%`, color: 'var(--text-primary)' },
          {
            label: 'Share of P/L',
            value: `${contribution >= 0 ? '+' : '−'}${Math.abs(contribution).toFixed(1)}%`,
            color: directionColor(row.unrealized),
          },
          {
            label: 'Sector weight',
            value: `${sectorWeight.toFixed(1)}%`,
            color: 'var(--text-primary)',
          },
        ].map((cell) => (
          <div key={cell.label}>
            <div className="text-[10.5px] font-bold uppercase tracking-[0.09em] text-text-tertiary">
              {cell.label}
            </div>
            <div
              className="num mt-1 font-display text-[17px] font-bold tracking-[-0.035em]"
              style={{ color: cell.color }}
            >
              {cell.value}
            </div>
          </div>
        ))}
      </div>

      <div className="flex min-w-0 flex-col gap-2.5">
        {/*
          A REAL 30-day series or nothing. This comes from data already in
          hand — the shared watchlist payload, or a history entry the ticker
          page cached — never a new request and never an interpolation.
        */}
        {spark ? (
          <svg
            viewBox="0 0 220 44"
            preserveAspectRatio="none"
            className="h-11 w-full overflow-visible"
            aria-hidden="true"
          >
            <path
              d={spark}
              fill="none"
              stroke={directionColor(row.unrealized)}
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        ) : (
          <p className="text-[11.5px] text-text-tertiary">
            No 30-day series in hand for {row.ticker}. Open the ticker to load its history.
          </p>
        )}

        <div className="flex flex-wrap items-center gap-[7px]">
          <Link
            to={`/app/ticker/${row.ticker}`}
            className="flex cursor-pointer items-center gap-1.5 rounded-full text-[12px] font-bold
              tracking-[-0.01em] transition-colors duration-150"
            style={{ padding: '7px 13px', background: 'var(--accent-blue)', color: 'var(--brand-ink)' }}
          >
            Open {row.ticker}
          </Link>

          {/*
            "Add to position" is REAL: the backend blends a new lot into the
            existing one and re-averages the cost. It opens the same ticket the
            page's own Add position button does, prefilled.
          */}
          <button
            type="button"
            onClick={() => onOpenAdd(row.ticker)}
            className="cursor-pointer rounded-full text-[12px] font-semibold text-text-primary
              transition-colors duration-150"
            style={{ padding: '7px 13px', background: 'var(--track-bg)' }}
          >
            Add to position
          </button>

          {/*
            REMOVE, NOT SELL. There is no sell, reduce or close flow in
            Everest, and dressing a delete as one would book a trade that never
            happened. The label and the title say exactly what the endpoint
            does: stop tracking the holding.
          */}
          <button
            type="button"
            disabled={removing}
            title={`Stop tracking ${row.ticker}. This does not record a sale.`}
            onClick={() => onRemove(row.id, row.ticker)}
            className="flex cursor-pointer items-center gap-1.5 rounded-full text-[12px]
              font-semibold text-text-secondary transition-colors duration-150
              hover:border-down hover:bg-down/10 hover:text-down disabled:opacity-50"
            style={{ padding: '7px 11px', border: '1px solid var(--border-strong)' }}
          >
            <Trash2 size={11} strokeWidth={1.8} />
            {removing ? 'Removing…' : 'Remove'}
          </button>
        </div>
      </div>
    </div>
  )
}

function LedgerRow({ row, book, open, onToggle, series, onOpenAdd, onRemove, removing }) {
  const quote = normalizeQuote(row.raw, { costBasis: row.avgCost })
  const weight = book.totalValue ? (row.marketValue / book.totalValue) * 100 : 0
  const weightBar = (row.marketValue / book.maxValue) * 100
  const contribution = (row.unrealized / book.sumAbsUnrealized) * 100
  // Half the track, so +100% of the book's movement fills exactly one side.
  const contributionWidth = (Math.abs(row.unrealized) / book.maxAbsUnrealized) * 49
  const rank = book.rankByTicker.get(row.ticker) || 0
  const retColor = directionColor(row.unrealized)

  return (
    <div style={{ background: open ? 'var(--nested-bg)' : 'transparent' }}>
      <div
        role="row"
        tabIndex={0}
        aria-expanded={open}
        onClick={onToggle}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            onToggle()
          }
        }}
        className={`group grid cursor-pointer items-center gap-2.5 transition-colors duration-150
          hover:bg-tint/[0.045] ${GRID}`}
        style={{
          padding: '11px 16px',
          boxShadow: open
            ? 'inset 2px 0 0 var(--accent-blue), 0 1px 0 var(--border)'
            : '0 1px 0 var(--border)',
        }}
      >
        <div className="flex min-w-0 items-center gap-[11px]">
          <span className="grid h-8 w-8 shrink-0 place-items-center overflow-hidden rounded-[9px] bg-tint/[0.05]">
            <CompanyLogo ticker={row.ticker} name={row.name} size={32} />
          </span>
          <span className="min-w-0">
            <span className="flex items-center gap-1.5">
              <span className="num font-display text-[13.5px] font-bold tracking-[-0.02em] text-text-primary">
                {row.ticker}
              </span>
              {/*
                THE APPROVED "AT COST" STATE. The backend substitutes the
                user's own average cost when no quote arrives, so this row's
                price is not a market price and the badge says so — hatched,
                because hatching is this product's encoding for "derived, not
                observed", and it survives greyscale.
              */}
              {row.priceStale ? (
                <span
                  className="shrink-0 rounded-[5px] text-[9.5px] font-bold uppercase tracking-[0.04em]
                    text-text-secondary hatch-dim"
                  style={{ padding: '1px 6px', backgroundColor: 'var(--track-bg)' }}
                  title="No quote — this holding is valued at your cost basis"
                >
                  At cost
                </span>
              ) : null}
            </span>
            <span className="block truncate text-[11.5px] text-text-secondary">
              {row.name} <span className="text-text-tertiary">· {row.sector}</span>
            </span>
          </span>
        </div>

        <div className={`num text-right text-[12.5px] text-text-secondary ${HIDE_AT_940}`}>
          {fmtNumber(row.qty, row.qty % 1 === 0 ? 0 : 2)}
        </div>

        <div className={`num text-right text-[12.5px] text-text-secondary ${HIDE_AT_1140}`}>
          {fmtMoney(row.avgCost)}
        </div>

        <div className={`text-right ${HIDE_AT_940}`}>
          <div
            className={`num text-[12.5px] font-semibold ${
              quote.isMarketPrice ? 'text-text-primary' : 'text-text-tertiary'
            }`}
          >
            {quote.price === null ? '—' : fmtMoney(quote.price)}
          </div>
          {/* The design's sub-line is the previous close. It is derived from
              the day's own percentage, so it exists only where that does. */}
          <div className="num text-[10.5px] text-text-tertiary">
            {row.priceStale
              ? 'no quote'
              : row.measured
                ? `prev ${fmtMoney(row.price / (1 + row.changePercent / 100))}`
                : (quoteLabel(quote) || '')}
          </div>
        </div>

        {/* An unmeasured day is an em dash. We did not observe a flat session. */}
        <div className="text-right">
          <div className="num text-[12.5px] font-bold" style={{ color: row.measured ? directionColor(row.dayAbs) : 'var(--text-tertiary)' }}>
            {row.measured ? fmtPercent(row.changePercent) : '—'}
          </div>
          <div
            className="num text-[10.5px] opacity-[0.72]"
            style={{ color: row.measured ? directionColor(row.dayAbs) : 'var(--text-tertiary)' }}
          >
            {row.measured ? fmtSignedMoney(row.dayAbs) : '—'}
          </div>
        </div>

        <div className="num text-right font-display text-[14px] font-bold tracking-[-0.03em] text-text-primary">
          {fmtMoney(row.marketValue)}
        </div>

        <div className="text-right">
          <div
            className="num font-display text-[14px] font-bold tracking-[-0.03em]"
            style={{ color: retColor }}
          >
            {fmtSignedMoney(row.unrealized)}
          </div>
          <div className="num text-[10.5px] font-semibold opacity-[0.72]" style={{ color: retColor }}>
            {fmtPercent(row.pnlPercent)}
          </div>
        </div>

        {/* Contribution — diverging from a centred baseline, over a hatched
            track, hatched again over its own fill. */}
        <div className={`flex items-center gap-2 ${HIDE_CONTRIBUTION}`}>
          <div
            className="relative h-[17px] flex-1 hatch-dim"
            style={{ backgroundColor: 'var(--nested-bg)' }}
            aria-hidden="true"
          >
            <span
              className="absolute left-1/2 -top-0.5 -bottom-0.5 w-px"
              style={{ background: 'var(--border-strong)' }}
            />
            <span
              className="absolute top-0.5 bottom-0.5 hatch-light"
              style={{
                left: `${row.unrealized >= 0 ? 50 : 50 - contributionWidth}%`,
                width: `${contributionWidth}%`,
                backgroundColor: retColor,
              }}
            />
          </div>
          <span
            className="num w-11 shrink-0 text-right text-[11px] font-bold"
            style={{ color: retColor }}
          >
            {contribution >= 0 ? '+' : '−'}
            {Math.abs(contribution).toFixed(1)}%
          </span>
        </div>

        {/* Weight — one clean blue bar from the left. Never green or red. */}
        <div className={`flex items-center gap-2 ${HIDE_AT_1140}`}>
          <div
            className="h-[7px] flex-1 overflow-hidden rounded-full"
            style={{ background: 'var(--track-bg)' }}
            aria-hidden="true"
          >
            <span
              className="block h-full rounded-full"
              style={{
                width: `${Math.max(2, Math.min(100, weightBar))}%`,
                background: RIBBON_BLUES[rank % RIBBON_BLUES.length],
              }}
            />
          </div>
          <span className="num w-10 shrink-0 text-right text-[11.5px] font-semibold text-text-secondary">
            {weight.toFixed(1)}%
          </span>
        </div>

        <div
          className={`flex items-center justify-center transition-colors duration-150 ${
            open ? 'text-text-primary' : 'text-text-tertiary group-hover:text-text-primary'
          }`}
        >
          <ChevronDown
            size={12}
            strokeWidth={2}
            style={{
              transform: open ? 'rotate(180deg)' : 'none',
              transition: 'transform .22s cubic-bezier(.2,.7,.2,1)',
            }}
          />
        </div>
      </div>

      {open ? (
        <RowDetail
          row={row}
          book={book}
          series={series}
          onOpenAdd={onOpenAdd}
          onRemove={onRemove}
          removing={removing}
        />
      ) : null}
    </div>
  )
}

/** The design's footer: one figure per column, following the active filter. */
function LedgerFoot({ rows, book, filtered }) {
  const totals = totalsOf(rows, book)

  return (
    <div
      className={`grid shrink-0 items-center gap-2.5 ${GRID}`}
      style={{
        padding: '12px 16px',
        background: 'var(--nested-bg)',
        boxShadow: '0 -1px 0 var(--border)',
      }}
      role="row"
    >
      <div className="text-[11px] font-bold uppercase tracking-[0.09em] text-text-secondary">
        {filtered ? 'Filtered total' : 'Portfolio total'}
      </div>
      <div className={`text-right text-[12px] text-text-tertiary ${HIDE_AT_940}`}>—</div>
      <div className={`text-right text-[12px] text-text-tertiary ${HIDE_AT_1140}`}>—</div>
      <div className={`text-right text-[12px] text-text-tertiary ${HIDE_AT_940}`}>—</div>
      <div
        className="num text-right text-[12.5px] font-bold"
        style={{ color: totals.day === null ? 'var(--text-tertiary)' : directionColor(totals.day) }}
      >
        {totals.day === null ? '—' : fmtSignedMoney(totals.day)}
      </div>
      <div className="num text-right font-display text-[15px] font-extrabold tracking-[-0.035em] text-text-primary">
        {fmtMoney(totals.value)}
      </div>
      <div
        className="num text-right font-display text-[15px] font-extrabold tracking-[-0.035em]"
        style={{ color: directionColor(totals.unrealized) }}
      >
        {fmtSignedMoney(totals.unrealized)}
      </div>
      <div
        className={`num flex items-center justify-end text-[11px] font-bold text-text-tertiary ${HIDE_CONTRIBUTION}`}
      >
        {totals.contribution === null
          ? '—'
          : `${totals.contribution >= 0 ? '+' : '−'}${Math.abs(totals.contribution).toFixed(1)}%`}
      </div>
      <div
        className={`num flex items-center justify-end text-[11.5px] font-bold text-text-secondary ${HIDE_AT_1140}`}
      >
        {totals.weight.toFixed(1)}%
      </div>
      <span />
    </div>
  )
}

export function PortfolioLedger({
  rows,
  book,
  loading,
  sort,
  dir,
  onSort,
  filtered,
  onClearFilters,
  seriesFor,
  onOpenAdd,
  onRemove,
  removingId,
}) {
  const [openId, setOpenId] = useState(null)

  return (
    <section
      className="flex min-h-[340px] flex-1 flex-col overflow-hidden"
      style={{
        borderRadius: 'var(--radius-surface)',
        background: 'var(--panel-bg)',
        boxShadow: 'var(--shadow-surface)',
      }}
      aria-label="Holdings"
    >
      <div className="overflow-x-auto">
        <div className="min-w-[570px]">
          <LedgerHead sort={sort} dir={dir} onSort={onSort} />

          <div>
            {loading ? (
              <div className="space-y-2 p-4">
                {Array.from({ length: 8 }).map((_, index) => (
                  <Skeleton key={index} className="h-[54px] w-full rounded-nested" />
                ))}
              </div>
            ) : rows.length === 0 ? (
              <div className="px-5 py-10">
                <EmptyState
                  title="No holdings match those filters"
                  description="Try a different search term, or clear the sector filter to see the whole portfolio."
                  action={
                    <button
                      type="button"
                      onClick={onClearFilters}
                      className="btn-ghost cursor-pointer"
                    >
                      Clear filters
                    </button>
                  }
                />
              </div>
            ) : (
              rows.map((row) => (
                <LedgerRow
                  key={row.id || row.ticker}
                  row={row}
                  book={book}
                  open={openId === (row.id || row.ticker)}
                  onToggle={() =>
                    setOpenId(openId === (row.id || row.ticker) ? null : row.id || row.ticker)
                  }
                  series={seriesFor(row.ticker)}
                  onOpenAdd={onOpenAdd}
                  onRemove={onRemove}
                  removing={removingId === row.id}
                />
              ))
            )}
          </div>

          {!loading && rows.length > 0 ? (
            <LedgerFoot rows={rows} book={book} filtered={filtered} />
          ) : null}
        </div>
      </div>
    </section>
  )
}
