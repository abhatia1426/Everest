import { CompanyLogo } from '../ui/CompanyLogo'
import { EmptyState, Skeleton } from '../States'
import { displayName, equityOrFallback } from '../../lib/equitySource'
import {
  fmtDate,
  fmtMoneyRounded,
  fmtMoney,
  fmtNumber,
  fmtPercent,
} from '../../lib/format'
import { ESTIMATE_DISCLOSURE, METER_SPAN, strikeMeter } from '../../lib/options'

/**
 * The contract workspace — every tracked contract, grouped by the date it
 * stops existing.
 *
 * COHORTS SURVIVE THE SORT. Expiry is the organising fact about a book of
 * decaying instruments, so Value and P/L reorder contracts inside a date and
 * reorder the dates by that same measure — they never dissolve the grouping
 * into a flat ranked list. That is the approved behaviour and it is why the
 * cohort header carries its own value and P/L subtotals.
 *
 * THE ROW'S CENTRE IS THE STRIKE METER, not a number. Underlying, strike and
 * breakeven on one axis answers "how far out of the money am I, and how much
 * further to breakeven" at a glance; three columns of prices leaves the only
 * part that matters — the relationship between them — as arithmetic for the
 * reader.
 *
 * NO HATCHING ON THE METER. Hatching in this product means one thing —
 * derived-or-not-observed, and by extension put-versus-call — so putting it on
 * a meter track would make a measured axis read as an estimate. The meter's
 * profitable side is a flat green tint; the put/call distinction lives in the
 * type tag beside it, where the encoding is already established.
 *
 * NO GREEKS, NO IV, NO CHAIN, NO BID/ASK. The API returns none of them, and a
 * column of zeros would look like a measurement.
 */

/*
 * The approved grid and its responsive steps, verbatim:
 *   >1400   contract | meter | qty | premium | est value | est P/L
 *   ≤1400   drop premium (the stage carries it in full)
 *   ≤960    two-line row: meter drops to its own full-width line, qty goes,
 *           column heads go (they no longer describe the geometry)
 *   ≤760    drop estimated value; P/L is the figure worth the width
 */
const GRID = [
  '[grid-template-columns:196px_minmax(180px,1fr)_62px_104px_104px_120px]',
  'max-[1400px]:[grid-template-columns:196px_minmax(180px,1fr)_62px_104px_120px]',
  'max-[960px]:[grid-template-columns:minmax(0,1fr)_100px_112px]',
  'max-[760px]:[grid-template-columns:minmax(0,1fr)_104px]',
].join(' ')

const PREMIUM_CELL = 'max-[1400px]:hidden'
const QTY_CELL = 'max-[960px]:hidden'
const VALUE_CELL = 'max-[760px]:hidden'
const METER_CELL = 'max-[960px]:col-[1/-1] max-[960px]:row-start-2'

const FILTERS = ['All', 'Calls', 'Puts']
const SORTS = [
  { key: 'Soonest', hint: 'Nearest expiry first' },
  { key: 'Value', hint: 'Largest estimated value first' },
  { key: 'P/L', hint: 'Biggest estimated gain first' },
]

function Pills({ options, value, onChange, label }) {
  return (
    <div
      className="flex shrink-0 items-center gap-0.5 rounded-full"
      style={{ padding: 3, background: 'var(--nested-bg)' }}
      role="radiogroup"
      aria-label={label}
    >
      {options.map((option) => {
        const key = typeof option === 'string' ? option : option.key
        const active = key === value
        return (
          <button
            key={key}
            type="button"
            role="radio"
            aria-checked={active}
            title={typeof option === 'string' ? undefined : option.hint}
            onClick={() => onChange(key)}
            className={`cursor-pointer whitespace-nowrap rounded-full text-[11.5px]
              transition-colors duration-150
              ${active ? 'font-bold text-text-primary' : 'font-medium text-text-tertiary hover:text-text-primary'}`}
            style={{
              padding: '5px 12px',
              background: active ? 'var(--panel-bg)' : 'transparent',
              boxShadow: active ? 'var(--shadow-surface)' : 'none',
            }}
          >
            {key}
          </button>
        )
      })}
    </div>
  )
}

function TypeTag({ isCall }) {
  return (
    <span
      className="whitespace-nowrap rounded-[5px] text-[9.5px] font-extrabold tracking-[0.06em]"
      style={{
        padding: '1.5px 6px',
        backgroundColor: isCall ? 'var(--accent-blue)' : 'var(--track-bg)',
        backgroundImage: isCall ? 'none' : 'var(--hatch-strong)',
        boxShadow: `0 0 0 1px ${isCall ? 'var(--accent-blue)' : 'var(--border-strong)'}`,
        color: isCall ? 'var(--brand-ink)' : 'var(--text-primary)',
      }}
    >
      {isCall ? 'CALL' : 'PUT'}
    </span>
  )
}

/** Underlying, strike and breakeven on one axis centred on the strike. */
function RowMeter({ view }) {
  const meter = strikeMeter(view)

  if (!meter) {
    return (
      <div className="text-[10.5px] text-text-tertiary">
        No underlying quote — strike position cannot be shown.
      </div>
    )
  }

  const passed = view.toBreakeven !== null && view.toBreakeven <= 0
  const moneynessColor =
    view.moneynessState === 'ITM'
      ? 'var(--accent-green)'
      : view.moneynessState === 'ATM'
        ? 'var(--accent-amber)'
        : 'var(--text-tertiary)'

  return (
    <div className="min-w-0">
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <span className="flex min-w-0 items-baseline gap-1.5">
          <span
            className="num whitespace-nowrap text-[10px] font-bold"
            style={{ color: moneynessColor }}
          >
            {view.moneynessState} {fmtPercent(view.moneynessPercent)}
          </span>
          <span className="num truncate text-[10px] text-text-tertiary">
            · {view.ticker} at {fmtMoney(view.spot)}
          </span>
        </span>
        <span
          className="whitespace-nowrap text-[10px]"
          style={{
            fontWeight: passed ? 700 : 400,
            color: passed ? 'var(--accent-green)' : 'var(--text-tertiary)',
          }}
        >
          {view.toBreakeven === null
            ? '—'
            : passed
              ? 'breakeven passed'
              : `needs ${view.toBreakeven.toFixed(1)}% ${view.isCall ? 'rise' : 'fall'} to breakeven`}
        </span>
      </div>

      <div
        className="relative h-[9px] overflow-hidden rounded-[5px]"
        /*
          `--track-bg`, not `--nested-bg`. The selected row IS `--nested-bg`, so
          a track painted in it vanished on exactly the row the reader is
          looking at — the meter's left half simply disappeared. The track
          elevation reads against both the panel and the selected row.
        */
        style={{ background: 'var(--track-bg)' }}
        title={
          `Axis is centred on the ${fmtMoney(view.strike)} strike and spans ±${METER_SPAN}%. ` +
          `The blue dot is the underlying at ${fmtMoney(view.spot)}; the dashed line is breakeven at ` +
          `${fmtMoney(view.breakeven)} (strike ${view.isCall ? 'plus' : 'minus'} the ${fmtMoney(view.avg_cost)} premium). ` +
          `The tinted half is the side of the strike that pays for a ${view.type}.`
        }
      >
        <span
          aria-hidden="true"
          className="absolute inset-y-0"
          style={{
            ...meter.profitableSide,
            background: 'rgb(var(--accent-green-rgb) / 0.1)',
          }}
        />
        <span
          aria-hidden="true"
          className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2"
          style={{ background: 'var(--border-strong)' }}
        />
        {meter.breakeven !== null ? (
          <span
            aria-hidden="true"
            className="absolute inset-y-px w-px -translate-x-1/2"
            style={{
              left: `${meter.breakeven}%`,
              backgroundImage:
                'repeating-linear-gradient(180deg, var(--text-tertiary) 0 2px, transparent 2px 4px)',
            }}
          />
        ) : null}
        <span
          aria-hidden="true"
          className="absolute top-1/2 h-[9px] w-[9px] -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{
            left: `${meter.spot}%`,
            background: 'var(--accent-blue)',
            boxShadow: '0 0 0 2px var(--panel-bg)',
          }}
        />
      </div>
    </div>
  )
}

function ContractRow({ view, selected, onSelect }) {
  const reference = equityOrFallback(view.ticker)
  const company = displayName(view.ticker, view.company, reference.name)
  const pnlTone =
    !view.priced ? 'text-text-tertiary' : view.pnl >= 0 ? 'text-up' : 'text-down'

  return (
    <div
      role="row"
      tabIndex={0}
      aria-selected={selected}
      aria-label={
        `${view.ticker} ${fmtMoney(view.strike)} ${view.type} expiring ${fmtDate(view.expiry)}, ` +
        `${fmtNumber(view.qty, 0)} contracts, ` +
        `${view.priced ? `estimated value ${fmtMoney(view.value)}, estimated profit or loss ${fmtMoney(view.pnl)}` : 'no estimated value'}`
      }
      onClick={() => onSelect(view.id)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onSelect(view.id)
        }
      }}
      className={`grid cursor-pointer items-center gap-3 outline-none transition-colors duration-150
        max-[960px]:gap-y-[11px] ${GRID} ${selected ? '' : 'hover:bg-tint/[0.045]'}`}
      style={{
        padding: '12px 16px',
        background: selected ? 'var(--nested-bg)' : 'transparent',
        boxShadow: selected
          ? 'inset 2px 0 0 var(--accent-blue), 0 1px 0 var(--border)'
          : '0 1px 0 var(--border)',
      }}
    >
      <div className="flex min-w-0 items-center gap-[9px]">
        <CompanyLogo ticker={view.ticker} name={company} size={28} />
        <span className="min-w-0">
          <span className="flex items-center gap-1.5">
            <span className="num font-display text-[13px] font-bold tracking-[-0.035em] text-text-primary">
              {view.ticker}
            </span>
            <TypeTag isCall={view.isCall} />
          </span>
          <span className="num mt-0.5 block truncate text-[11px] text-text-secondary">
            {fmtMoney(view.strike)} strike
          </span>
        </span>
      </div>

      <div className={METER_CELL}>
        <RowMeter view={view} />
      </div>

      <div
        className={`num font-display text-[13px] font-bold tracking-[-0.03em] text-text-primary
          ${QTY_CELL} text-right`}
      >
        {fmtNumber(view.qty, 0)}x
      </div>

      <div className={`min-w-0 text-right ${PREMIUM_CELL}`}>
        <div className="num whitespace-nowrap font-display text-[13px] font-bold tracking-[-0.03em] text-text-primary">
          {fmtMoney(view.avg_cost)}
        </div>
        <div className="num mt-0.5 whitespace-nowrap text-[10px] text-text-tertiary">
          {fmtMoneyRounded(view.atRisk)} paid
        </div>
      </div>

      <div
        className={`num whitespace-nowrap text-right font-display text-[14.5px] font-bold
          tracking-[-0.035em] text-text-primary ${VALUE_CELL}`}
      >
        {view.priced ? fmtMoneyRounded(view.value) : '—'}
      </div>

      <div className="min-w-0 text-right">
        <div
          className={`num whitespace-nowrap font-display text-[14.5px] font-bold tracking-[-0.035em] ${pnlTone}`}
        >
          {view.priced ? fmtMoneyRounded(view.pnl, { signed: true }) : '—'}
        </div>
        <div className={`num mt-0.5 whitespace-nowrap text-[10.5px] font-semibold opacity-[0.75] ${pnlTone}`}>
          {view.priced ? fmtPercent(view.pnlPercent) : 'no quote'}
        </div>
      </div>
    </div>
  )
}

function CohortHeader({ cohort }) {
  const near = cohort.dte <= 7
  const priced = cohort.rows.some((row) => row.priced)

  return (
    <div
      className="flex items-center gap-2.5"
      style={{
        padding: '10px 16px 9px',
        background: near ? 'var(--warn-soft)' : 'var(--nested-bg)',
        boxShadow: '0 1px 0 var(--border)',
      }}
    >
      <span className="num shrink-0 whitespace-nowrap font-display text-[13px] font-bold tracking-[-0.035em] text-text-primary">
        {fmtDate(cohort.expiry)}
      </span>
      <span
        className="num shrink-0 whitespace-nowrap rounded-full text-[10px] font-bold"
        style={{
          padding: '2px 8px',
          background: near ? 'rgb(var(--accent-amber-rgb) / 0.16)' : 'var(--track-bg)',
          color: near ? 'var(--accent-amber)' : 'var(--text-secondary)',
        }}
      >
        {cohort.dte < 0
          ? 'Expired'
          : cohort.dte <= 7
            ? `Expires in ${cohort.dte} ${cohort.dte === 1 ? 'day' : 'days'}`
            : `${cohort.dte} days`}
      </span>
      <span className="shrink-0 whitespace-nowrap text-[11px] text-text-tertiary">
        {cohort.rows.length} {cohort.rows.length === 1 ? 'contract' : 'contracts'}
      </span>

      <div className="h-px min-w-[12px] flex-1" style={{ background: 'var(--border)' }} />

      <span className="num shrink-0 whitespace-nowrap text-[11px] text-text-secondary max-[560px]:hidden">
        {priced ? `${fmtMoneyRounded(cohort.value)} est. value` : 'no estimate'}
      </span>
      <span
        className={`num shrink-0 whitespace-nowrap font-display text-[12px] font-bold tracking-[-0.03em] ${
          !priced ? 'text-text-tertiary' : cohort.pnl >= 0 ? 'text-up' : 'text-down'
        }`}
      >
        {priced ? fmtMoneyRounded(cohort.pnl, { signed: true }) : '—'}
      </span>
    </div>
  )
}

export function ContractWorkspace({
  cohorts,
  shown,
  total,
  filter,
  onFilter,
  sort,
  onSort,
  selectedId,
  onSelect,
  loading,
}) {
  return (
    <section
      className="flex min-w-0 flex-col overflow-hidden"
      style={{
        borderRadius: 'var(--radius-surface)',
        background: 'var(--panel-bg)',
        boxShadow: 'var(--shadow-surface)',
      }}
      aria-label="Tracked contracts"
    >
      <div
        className="flex flex-wrap items-center gap-2.5"
        style={{ padding: '13px 16px', boxShadow: '0 1px 0 var(--border)' }}
      >
        <Pills options={FILTERS} value={filter} onChange={onFilter} label="Contract type" />
        <Pills options={SORTS} value={sort} onChange={onSort} label="Sort" />
        <div className="flex-1" />
        <span className="whitespace-nowrap text-[11px] text-text-tertiary">
          {shown === total ? `All ${total} contracts` : `${shown} of ${total} contracts`}
        </span>
      </div>

      {/*
        Column heads go at 960px, where the row becomes two lines and the
        columns stop describing the geometry. A head that no longer sits above
        its cell is worse than no head.
      */}
      <div
        className={`grid items-center gap-3 max-[960px]:hidden ${GRID}`}
        style={{ padding: '9px 16px', background: 'var(--nested-bg)', boxShadow: '0 1px 0 var(--border)' }}
        role="row"
      >
        <span className="text-[9px] font-bold uppercase tracking-[0.1em] text-text-tertiary">
          Contract
        </span>
        <span className="flex flex-wrap items-center gap-2.5">
          <span className="text-[9px] font-bold uppercase tracking-[0.1em] text-text-tertiary">
            Underlying vs strike
          </span>
          <span className="flex items-center gap-[9px] text-[9px] text-text-tertiary max-[1180px]:hidden">
            <span className="flex items-center gap-1">
              <span className="h-[7px] w-[7px] rounded-full" style={{ background: 'var(--accent-blue)' }} />
              underlying
            </span>
            <span className="flex items-center gap-1">
              <span className="h-[9px] w-px" style={{ background: 'var(--border-strong)' }} />
              strike
            </span>
            <span className="flex items-center gap-1">
              <span
                className="h-[9px] w-px"
                style={{
                  backgroundImage:
                    'repeating-linear-gradient(180deg, var(--text-tertiary) 0 2px, transparent 2px 4px)',
                }}
              />
              breakeven
            </span>
          </span>
        </span>
        <span className={`text-right text-[9px] font-bold uppercase tracking-[0.1em] text-text-tertiary ${QTY_CELL}`}>
          Qty
        </span>
        <span className={`text-right text-[9px] font-bold uppercase tracking-[0.1em] text-text-tertiary ${PREMIUM_CELL}`}>
          Premium
        </span>
        <span
          title={ESTIMATE_DISCLOSURE}
          className={`cursor-help text-right text-[9px] font-bold uppercase tracking-[0.1em] text-text-tertiary ${VALUE_CELL}`}
        >
          Est. contract value
        </span>
        <span
          title={ESTIMATE_DISCLOSURE}
          className="cursor-help text-right text-[9px] font-bold uppercase tracking-[0.1em] text-text-tertiary"
        >
          Est. unrealized P/L
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto max-[1320px]:max-h-none min-[1321px]:max-h-[520px]">
        {loading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 6 }).map((_, index) => (
              <Skeleton key={index} className="h-[58px] w-full rounded-nested" />
            ))}
          </div>
        ) : cohorts.length === 0 ? (
          <div className="px-5 py-9">
            <EmptyState
              title={`No ${filter === 'Calls' ? 'calls' : 'puts'} tracked`}
              description="Switch the filter, or add a contract to track it here."
              action={
                <button type="button" onClick={() => onFilter('All')} className="btn-ghost cursor-pointer">
                  Show all contracts
                </button>
              }
            />
          </div>
        ) : (
          cohorts.map((cohort) => (
            <div key={cohort.expiry}>
              <CohortHeader cohort={cohort} />
              {cohort.rows.map((view) => (
                <ContractRow
                  key={view.id}
                  view={view}
                  selected={view.id === selectedId}
                  onSelect={onSelect}
                />
              ))}
            </div>
          ))
        )}
      </div>
    </section>
  )
}
