import { Link } from 'react-router-dom'
import { Trash2 } from 'lucide-react'

import { CompanyLogo } from '../ui/CompanyLogo'
import { displayName, equityOrFallback } from '../../lib/equitySource'
import {
  dteTone,
  fmtDate,
  fmtMoney,
  fmtNumber,
  fmtPercent,
  fmtSignedMoney,
  pnlColor,
} from '../../lib/format'
import { breakeven, distanceToBreakeven, moneyness } from '../../lib/options'

const MONEYNESS_TONE = {
  ITM: 'bg-up/12 text-up',
  ATM: 'bg-warn/12 text-warn',
  OTM: 'bg-tint/[0.06] text-text-secondary',
}

/**
 * The strike meter — where the underlying sits relative to strike and breakeven.
 *
 * This is the risk picture the page exists to show. A table gave you strike and
 * underlying as two separate numbers in two separate columns and left the
 * relationship between them (the only part that matters) as an exercise for
 * the reader. Here the three prices share one axis, so "how far out of the
 * money am I, and how much further to breakeven" is a glance.
 *
 * The axis is centred on the strike and spans ±25%, which comfortably contains
 * a typical breakeven; values beyond that clamp to the ends rather than
 * rescaling, so the meter's geometry means the same thing on every card.
 */
function StrikeMeter({ option }) {
  const spot = option.underlying_price
  const { strike } = option
  const target = breakeven(option)

  if (typeof spot !== 'number' || typeof strike !== 'number' || !strike) {
    return (
      <p className="text-[11px] text-text-tertiary">
        Underlying price unavailable — strike position cannot be shown.
      </p>
    )
  }

  const SPAN = 25
  const toPct = (price) => {
    const offset = ((price - strike) / strike) * 100
    return Math.min(Math.max(((offset + SPAN) / (SPAN * 2)) * 100, 0), 100)
  }

  const spotPos = toPct(spot)
  const bePos = target === null ? null : toPct(target)

  // Shade the side of the strike that is profitable for this contract type.
  const profitable = option.type === 'call'
    ? { left: '50%', right: 0 }
    : { left: 0, right: '50%' }

  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between">
        <span className="t-eyebrow">Strike position</span>
        <span className="num text-[10px] text-text-tertiary">
          spot {fmtMoney(spot)}
        </span>
      </div>

      <div
        className="relative h-6 overflow-hidden rounded-panel"
        style={{ background: 'var(--e0-bg)' }}
      >
        <span
          aria-hidden="true"
          className="absolute inset-y-0"
          style={{
            ...profitable,
            background: 'rgb(var(--accent-green-rgb) / 0.07)',
          }}
        />

        {/* Strike — the fixed reference, dead centre. */}
        <span
          aria-hidden="true"
          className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2"
          style={{ background: 'var(--border-strong)' }}
        />

        {/* Breakeven — dashed, because it is a threshold not a price you pay. */}
        {bePos !== null ? (
          <span
            aria-hidden="true"
            className="absolute inset-y-1 w-px -translate-x-1/2"
            style={{
              left: `${bePos}%`,
              background:
                'repeating-linear-gradient(180deg, var(--text-tertiary) 0 3px, transparent 3px 6px)',
            }}
          />
        ) : null}

        {/* Spot — the live value, so it is the only solid marker. */}
        <span
          aria-hidden="true"
          className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent"
          style={{ left: `${spotPos}%`, boxShadow: '0 0 0 3px var(--e2-bg)' }}
        />
      </div>

      <div className="mt-1.5 flex justify-between text-[10px] text-text-tertiary">
        <span className="num">strike {fmtMoney(strike)}</span>
        {target !== null ? <span className="num">breakeven {fmtMoney(target)}</span> : null}
      </div>
    </div>
  )
}

export function ContractCard({ option, onRemove, removing }) {
  const reference = equityOrFallback(option.ticker)
  const company = displayName(option.ticker, option.company, reference.name)
  const isCall = option.type === 'call'

  const money = moneyness(option)
  const toBreakeven = distanceToBreakeven(option)

  return (
    <div className="card group relative flex h-full flex-col overflow-hidden">
      {/* -------------------------------------------------------- header */}
      <div
        className="flex items-start gap-3 border-b px-4 py-3.5"
        style={{ borderColor: 'var(--border)' }}
      >
        <CompanyLogo ticker={option.ticker} name={company} size={32} />

        <div className="min-w-0 flex-1 pr-8">
          <div className="flex flex-wrap items-center gap-1.5">
            <Link
              to={`/app/ticker/${option.ticker}`}
              className="num cursor-pointer text-[13px] font-semibold text-text-primary
                transition-colors duration-150 hover:text-accent"
            >
              {option.ticker}
            </Link>
            <span
              className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${
                isCall ? 'bg-up/12 text-up' : 'bg-down/12 text-down'
              }`}
            >
              {option.type}
            </span>
            {money ? (
              <span
                className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                  MONEYNESS_TONE[money.state]
                }`}
                title={`${money.percent >= 0 ? '+' : ''}${money.percent.toFixed(1)}% vs strike`}
              >
                {money.state}
              </span>
            ) : null}
          </div>
          <p className="num mt-0.5 truncate text-[11px] text-text-tertiary">
            {fmtMoney(option.strike)} ·{' '}
            {fmtDate(option.expiry, { month: 'short', day: 'numeric', year: '2-digit' })} ·{' '}
            {fmtNumber(option.qty, 0)}x
          </p>
        </div>

        <button
          type="button"
          aria-label={`Remove ${option.ticker} ${option.type}`}
          disabled={removing}
          onClick={() => onRemove(option.id, option.ticker)}
          className="btn-danger absolute right-1.5 top-1.5 h-8 w-8 cursor-pointer p-0 opacity-0
            transition-opacity duration-150 focus-visible:opacity-100 group-hover:opacity-100"
        >
          <Trash2 size={13} />
        </button>
      </div>

      {/* --------------------------------------------------------- value */}
      <div className="flex items-end justify-between gap-3 px-4 pt-4">
        <div>
          <p className="t-eyebrow">Est. value</p>
          <p className="num-hero mt-1 text-[22px] text-text-primary">
            {fmtMoney(option.est_value)}
          </p>
        </div>
        <div className="text-right">
          <p className={`num text-[13px] font-bold ${pnlColor(option.pnl)}`}>
            {fmtSignedMoney(option.pnl)}
          </p>
          <p className={`num text-[11px] font-semibold ${pnlColor(option.pnl_percent)}`}>
            {fmtPercent(option.pnl_percent)}
          </p>
        </div>
      </div>

      <div className="mt-4 px-4">
        <StrikeMeter option={option} />
      </div>

      {/* --------------------------------------------------------- facts */}
      <dl
        className="mt-auto grid grid-cols-3 gap-2 border-t px-4 py-3"
        style={{ borderColor: 'var(--border)' }}
      >
        <div>
          <dt className="t-eyebrow">Expires</dt>
          <dd className="mt-1">
            <span
              className={`num rounded px-1.5 py-0.5 text-[11px] font-bold ${dteTone(option.dte)}`}
            >
              {option.dte < 0 ? 'expired' : `${option.dte}d`}
            </span>
          </dd>
        </div>
        <div>
          <dt className="t-eyebrow">At risk</dt>
          {/* Long options only: max loss is the premium paid. */}
          <dd className="num mt-1.5 text-[11.5px] font-semibold text-text-primary">
            {fmtMoney(option.cost_basis)}
          </dd>
        </div>
        <div>
          <dt className="t-eyebrow">To breakeven</dt>
          <dd
            className={`num mt-1.5 text-[11.5px] font-semibold ${
              toBreakeven === null
                ? 'text-text-tertiary'
                : toBreakeven <= 0
                  ? 'text-up'
                  : 'text-text-primary'
            }`}
          >
            {toBreakeven === null
              ? '—'
              : toBreakeven <= 0
                ? 'passed'
                : `${toBreakeven.toFixed(1)}%`}
          </dd>
        </div>
      </dl>
    </div>
  )
}
