import { Link } from 'react-router-dom'
import { ArrowUpRight, Trash2 } from 'lucide-react'

import { CompanyLogo } from '../ui/CompanyLogo'
import { displayName, equityOrFallback } from '../../lib/equitySource'
import {
  fmtDate,
  fmtMoneyRounded,
  fmtMoney,
  fmtNumber,
  fmtPercent,
} from '../../lib/format'
import {
  CONTRACT_MULTIPLIER,
  ESTIMATE_DISCLOSURE,
  METER_SPAN,
  attentionReasons,
  strikeMeter,
} from '../../lib/options'

/**
 * The selected-contract stage — the approved right column, in the approved
 * order of importance:
 *
 *   1. contract identity
 *   2. estimated value / estimated P/L
 *   3. underlying versus strike and breakeven
 *   4. time remaining
 *   5. factual attention reasons
 *   6. quiet contract details
 *   7. actions
 *
 * THE TWO ACTIONS ARE THE ONLY TWO EVEREST HAS. "Open <ticker>" routes to the
 * underlying's detail page; "Remove" deletes the tracked row. Neither is a
 * trade. The word "Remove" is chosen precisely: `DELETE /options/{id}` removes
 * Everest's record of a contract and does nothing whatsoever in a brokerage
 * account, so calling it Sell, Close, Exit or Exercise would describe an effect
 * that does not happen.
 */

const TONE = {
  warn: 'var(--accent-amber)',
  up: 'var(--accent-green)',
  down: 'var(--accent-red)',
  muted: 'var(--text-tertiary)',
}

function Section({ children, last = false }) {
  return (
    <div
      className="p-[15px_17px_16px]"
      style={{ boxShadow: last ? 'none' : '0 1px 0 var(--border)' }}
    >
      {children}
    </div>
  )
}

function Eyebrow({ children, hint }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="text-[9.5px] font-bold uppercase tracking-[0.11em] text-text-tertiary">
        {children}
      </span>
      {hint ? (
        <span
          title={hint}
          className="flex h-3.5 w-3.5 shrink-0 cursor-help items-center justify-center rounded-full
            text-[9px] font-extrabold text-text-tertiary"
          style={{ border: '1px solid var(--border-strong)' }}
        >
          i
        </span>
      ) : null}
    </span>
  )
}

/**
 * Time remaining, measured against the whole book's horizon so two contracts'
 * bars are comparable. The hatched remainder is time this contract will not
 * see — hatching for "not observed" is the same encoding used everywhere else.
 */
function TimeRemaining({ view, horizon }) {
  const span = Math.max(120, horizon)
  const filled = Math.min(100, Math.max(0, (view.dte / span) * 100))
  const weekMark = (7 / span) * 100
  const near = view.dte <= 7

  return (
    <Section>
      <div className="mb-2.5 flex items-baseline justify-between gap-2.5">
        <span className="text-[9.5px] font-bold uppercase tracking-[0.11em] text-text-primary">
          Time remaining
        </span>
        <span
          className="num font-display text-[19px] font-extrabold leading-none tracking-[-0.045em]"
          style={{ color: near ? 'var(--accent-amber)' : 'var(--text-primary)' }}
        >
          {view.dte < 0
            ? 'Expired'
            : `${view.dte} ${view.dte === 1 ? 'day' : 'days'} left`}
        </span>
      </div>

      <div
        className="relative h-2.5 overflow-hidden rounded-full hatch-dim"
        style={{ backgroundColor: 'var(--nested-bg)' }}
        title={
          `${view.ticker} ${fmtMoney(view.strike)} ${view.type} expires ${fmtDate(view.expiry)}, ` +
          `${view.dte} days from today. The bar spans ${span} days; the amber line marks seven days out.`
        }
      >
        <span
          className="absolute bottom-0 left-0 top-0 rounded-full"
          style={{
            width: `${filled}%`,
            background: near
              ? 'var(--accent-amber)'
              : 'color-mix(in oklab, var(--accent-blue) 72%, transparent)',
          }}
          aria-hidden="true"
        />
        <span
          className="absolute bottom-0 top-0 w-px"
          style={{ left: `${weekMark}%`, background: 'rgb(var(--accent-amber-rgb) / 0.75)' }}
          aria-hidden="true"
        />
      </div>

      <div className="relative mt-1.5 h-[15px]">
        <span
          className="absolute left-0 top-0 text-[10px] text-text-tertiary"
          style={{ opacity: filled < 20 ? 0 : 1 }}
        >
          today
        </span>
        <span
          className="num absolute top-0 whitespace-nowrap text-[10px] font-bold text-text-primary"
          style={{
            left: `${filled}%`,
            transform: `translateX(${filled > 82 ? '-100%' : filled < 14 ? '-6%' : '-50%'})`,
          }}
        >
          {fmtDate(view.expiry)}
        </span>
        {/* The horizon label yields to the expiry date when the two collide —
            the longest-dated contract in the book sits exactly on top of it. */}
        <span
          className="num absolute right-0 top-0 text-[10px] text-text-tertiary"
          style={{ opacity: filled > 78 ? 0 : 1 }}
        >
          {span}d
        </span>
      </div>
    </Section>
  )
}

function UnderlyingVsStrike({ view }) {
  const meter = strikeMeter(view)

  if (!meter) {
    return (
      <Section>
        <Eyebrow>Underlying vs strike</Eyebrow>
        <p className="mt-2 text-[12px] text-text-secondary">
          No underlying quote is available for {view.ticker} right now, so the strike position and
          breakeven distance cannot be shown.
        </p>
      </Section>
    )
  }

  const passed = view.toBreakeven <= 0

  return (
    <Section>
      <div className="mb-2.5 flex items-baseline justify-between gap-2.5">
        <span className="text-[9.5px] font-bold uppercase tracking-[0.11em] text-text-primary">
          Underlying vs strike
        </span>
        <span className="text-[10.5px] text-text-secondary">
          {view.moneynessState === 'ITM'
            ? 'in the money'
            : view.moneynessState === 'ATM'
              ? 'at the money'
              : 'out of the money'}
        </span>
      </div>

      <div
        className="relative h-[34px] overflow-hidden rounded-lg"
        style={{ background: 'var(--nested-bg)' }}
        title={
          `Axis is centred on the ${fmtMoney(view.strike)} strike and spans ±${METER_SPAN}%. ` +
          `The blue dot is the underlying at ${fmtMoney(view.spot)}; the dashed line is breakeven at ` +
          `${fmtMoney(view.breakeven)}.`
        }
      >
        <span
          aria-hidden="true"
          className="absolute inset-y-0"
          style={{ ...meter.profitableSide, background: 'rgb(var(--accent-green-rgb) / 0.1)' }}
        />
        <span
          aria-hidden="true"
          className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2"
          style={{ background: 'var(--border-strong)' }}
        />
        {meter.breakeven !== null ? (
          <span
            aria-hidden="true"
            className="absolute inset-y-[3px] w-px -translate-x-1/2"
            style={{
              left: `${meter.breakeven}%`,
              backgroundImage:
                'repeating-linear-gradient(180deg, var(--text-tertiary) 0 3px, transparent 3px 6px)',
            }}
          />
        ) : null}
        <span
          aria-hidden="true"
          className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{
            left: `${meter.spot}%`,
            background: 'var(--accent-blue)',
            boxShadow: '0 0 0 3px var(--panel-bg)',
          }}
        />
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-3">
        <span className="num flex items-center gap-1.5 whitespace-nowrap text-[10px] text-text-secondary">
          <span className="h-2 w-2 rounded-full" style={{ background: 'var(--accent-blue)' }} />
          underlying {fmtMoney(view.spot)}
        </span>
        <span className="num flex items-center gap-1.5 whitespace-nowrap text-[10px] text-text-secondary">
          <span className="h-2.5 w-px" style={{ background: 'var(--border-strong)' }} />
          strike {fmtMoney(view.strike)}
        </span>
        <span className="num flex items-center gap-1.5 whitespace-nowrap text-[10px] text-text-secondary">
          <span
            className="h-2.5 w-px"
            style={{
              backgroundImage:
                'repeating-linear-gradient(180deg, var(--text-tertiary) 0 3px, transparent 3px 6px)',
            }}
          />
          breakeven {fmtMoney(view.breakeven)}
        </span>
      </div>

      <div
        className="mt-3 flex items-center gap-2.5 rounded-xl"
        style={{
          padding: '9px 11px',
          background: passed ? 'var(--up-soft)' : 'var(--nested-bg)',
        }}
      >
        <span
          className="num whitespace-nowrap font-display text-[16px] font-bold tracking-[-0.04em]"
          style={{ color: passed ? 'var(--accent-green)' : 'var(--text-primary)' }}
        >
          {passed ? 'Breakeven passed' : `${view.toBreakeven.toFixed(1)}%`}
        </span>
        <span className="min-w-0 text-[11.5px] text-text-secondary">
          {passed
            ? `the underlying is already beyond breakeven at ${fmtMoney(view.breakeven)}.`
            : `further ${view.isCall ? 'rise' : 'fall'} in ${view.ticker} to reach breakeven at ${fmtMoney(view.breakeven)}.`}
        </span>
      </div>
    </Section>
  )
}

export function SelectedContract({ view, horizon, onRemove, removing }) {
  const reference = equityOrFallback(view.ticker)
  const company = displayName(view.ticker, view.company, reference.name)
  const up = (view.pnl ?? 0) >= 0

  const reasons = attentionReasons(view, { formatMoney: fmtMoney, formatDate: fmtDate })

  const moneynessTone =
    view.moneynessState === 'ITM'
      ? { color: 'var(--accent-green)', background: 'var(--up-soft)' }
      : view.moneynessState === 'ATM'
        ? { color: 'var(--accent-amber)', background: 'var(--warn-soft)' }
        : { color: 'var(--text-secondary)', background: 'var(--nested-bg)' }

  const terms = [
    {
      key: 'Contracts',
      value: `${fmtNumber(view.qty, 0)} × ${CONTRACT_MULTIPLIER} shares`,
      hint: `Each contract covers ${CONTRACT_MULTIPLIER} shares, so this is ${(
        view.qty * CONTRACT_MULTIPLIER
      ).toLocaleString('en-US')} shares of exposure.`,
    },
    {
      key: 'Premium paid',
      value: `${fmtMoney(view.avg_cost)} per share`,
      hint: `Your recorded premium. Total debit ${fmtMoney(view.atRisk)} (${fmtNumber(view.qty, 0)} × ${CONTRACT_MULTIPLIER} × ${fmtMoney(view.avg_cost)}).`,
    },
    {
      key: 'Total paid',
      value: fmtMoney(view.atRisk),
      hint: 'Premium paid in full. This contract is long, so it is also the most that can be lost.',
    },
    {
      key: 'Est. value per share',
      value: typeof view.est_price === 'number' ? fmtMoney(view.est_price) : '—',
      hint: ESTIMATE_DISCLOSURE,
    },
    { key: 'Expiry', value: fmtDate(view.expiry) },
  ]

  return (
    <aside
      className="overflow-y-auto
        min-[1321px]:sticky min-[1321px]:top-3.5 min-[1321px]:max-h-[calc(100vh-28px)]"
      style={{
        borderRadius: 'var(--radius-surface)',
        background: 'var(--panel-bg)',
        boxShadow: 'var(--shadow-surface)',
      }}
      aria-label="Selected contract"
    >
      <Section>
        <div className="mb-3 flex items-center gap-2.5">
          <span className="text-[9.5px] font-bold uppercase tracking-[0.11em] text-text-tertiary">
            Selected contract
          </span>
          <div className="flex-1" />
          <Link
            to={`/app/ticker/${view.ticker}`}
            className="whitespace-nowrap text-[11.5px] font-semibold text-accent
              transition-colors duration-150 hover:text-text-primary"
          >
            {view.ticker} detail →
          </Link>
        </div>

        <div className="flex items-center gap-[11px]">
          <CompanyLogo ticker={view.ticker} name={company} size={40} />
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-[7px]">
              <span className="num font-display text-[17px] font-extrabold leading-none tracking-[-0.04em] text-text-primary">
                {view.ticker}
              </span>
              <span
                className="whitespace-nowrap rounded-md text-[10px] font-extrabold tracking-[0.06em]"
                style={{
                  padding: '2px 7px',
                  backgroundColor: view.isCall ? 'var(--accent-blue)' : 'var(--track-bg)',
                  backgroundImage: view.isCall ? 'none' : 'var(--hatch-strong)',
                  boxShadow: `0 0 0 1px ${view.isCall ? 'var(--accent-blue)' : 'var(--border-strong)'}`,
                  color: view.isCall ? 'var(--brand-ink)' : 'var(--text-primary)',
                }}
              >
                {view.isCall ? 'CALL' : 'PUT'}
              </span>
              {view.moneynessState ? (
                <span
                  className="whitespace-nowrap rounded-md text-[10px] font-extrabold tracking-[0.04em]"
                  style={{ padding: '2px 7px', ...moneynessTone }}
                >
                  {view.moneynessState}
                </span>
              ) : null}
            </span>
            <span className="num mt-1 block truncate text-[11.5px] text-text-secondary">
              {fmtMoney(view.strike)} strike · {fmtDate(view.expiry)} · {fmtNumber(view.qty, 0)}{' '}
              {view.qty === 1 ? 'contract' : 'contracts'}
            </span>
          </span>
        </div>

        <div className="mt-4">
          <Eyebrow hint={ESTIMATE_DISCLOSURE}>Estimated contract value</Eyebrow>
        </div>

        <div className="mt-1.5 flex flex-wrap items-end gap-[11px]">
          <span className="num font-display text-[30px] font-extrabold leading-none tracking-[-0.05em] text-text-primary">
            {view.priced ? fmtMoneyRounded(view.value) : '—'}
          </span>
          {view.priced ? (
            <span
              className="num mb-0.5 flex items-center gap-1.5 rounded-full text-[12.5px] font-bold tracking-[-0.02em]"
              style={{
                padding: '4px 10px',
                background: up ? 'var(--up-soft)' : 'var(--down-soft)',
                color: up ? 'var(--accent-green)' : 'var(--accent-red)',
              }}
            >
              <svg
                width="9"
                height="9"
                viewBox="0 0 12 12"
                fill="currentColor"
                aria-hidden="true"
                style={{ transform: up ? 'none' : 'rotate(180deg)' }}
              >
                <path d="M6 1.5l4.4 7.5H1.6z" />
              </svg>
              {fmtPercent(view.pnlPercent)}{' '}
              <span className="font-semibold opacity-[0.72]">
                {fmtMoneyRounded(view.pnl, { signed: true })}
              </span>
            </span>
          ) : (
            <span className="mb-1 text-[12px] font-semibold text-text-tertiary">
              no underlying quote
            </span>
          )}
        </div>

        <div className="mt-1.5 flex justify-between gap-2 text-[10.5px] text-text-tertiary">
          <span className="num">Paid {fmtMoneyRounded(view.atRisk)}</span>
          <span className="num">
            Estimated now {view.priced ? fmtMoneyRounded(view.value) : '—'}
          </span>
        </div>
      </Section>

      <UnderlyingVsStrike view={view} />

      <TimeRemaining view={view} horizon={horizon} />

      <Section>
        <div className="mb-2.5">
          <Eyebrow>Why it needs attention</Eyebrow>
        </div>
        <div className="flex flex-col gap-2">
          {reasons.map((reason) => (
            <div key={reason.text} className="flex items-start gap-2.5">
              <span
                className="mt-1.5 h-[5px] w-[5px] shrink-0 rounded-full"
                style={{ background: TONE[reason.tone] }}
                aria-hidden="true"
              />
              <span className="min-w-0 text-[12px] text-text-primary">{reason.text}</span>
            </div>
          ))}
        </div>
      </Section>

      <Section>
        <div className="mb-2">
          <Eyebrow>Contract details</Eyebrow>
        </div>
        <div className="flex flex-col">
          {terms.map((term) => (
            <div
              key={term.key}
              title={term.hint}
              className="flex items-baseline justify-between gap-3 py-[5px]"
              style={{ cursor: term.hint ? 'help' : 'default' }}
            >
              <span className="text-[11.5px] text-text-secondary">{term.key}</span>
              <span className="num whitespace-nowrap text-[12px] font-semibold text-text-primary">
                {term.value}
              </span>
            </div>
          ))}
        </div>
      </Section>

      <div className="flex items-center gap-2 p-[14px_17px_17px]">
        <Link
          to={`/app/ticker/${view.ticker}`}
          className="flex flex-1 cursor-pointer items-center justify-center gap-[7px] rounded-full
            text-[12.5px] font-semibold text-text-primary transition-colors duration-150"
          style={{ padding: '10px 14px', background: 'var(--track-bg)' }}
        >
          Open {view.ticker}
          <ArrowUpRight size={12} strokeWidth={2} />
        </Link>

        {/*
          "Remove" is literal: it deletes Everest's record of this contract.
          It does not sell, close, exercise or exit anything — Everest places no
          orders and holds no account.
        */}
        <button
          type="button"
          disabled={removing}
          onClick={() => onRemove(view.id, view.ticker)}
          title="Stop tracking this contract in Everest. This does not sell, close or exercise anything."
          className="flex shrink-0 cursor-pointer items-center gap-[7px] rounded-full text-[12.5px]
            font-semibold text-text-secondary transition-colors duration-150
            hover:border-down hover:bg-down/10 hover:text-down disabled:opacity-50"
          style={{ padding: '10px 14px', border: '1px solid var(--border-strong)' }}
        >
          <Trash2 size={12} strokeWidth={1.8} />
          {removing ? 'Removing…' : 'Remove'}
        </button>
      </div>
    </aside>
  )
}
