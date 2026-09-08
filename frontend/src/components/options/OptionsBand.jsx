import { ChevronRight } from 'lucide-react'

import { ExpiryRunway } from './ExpiryRunway'
import { Skeleton } from '../States'
import {
  fmtDate,
  fmtMoneyRounded,
  fmtMoney,
  fmtPercent,
} from '../../lib/format'
import { ESTIMATE_DISCLOSURE } from '../../lib/options'

/**
 * Band 1 of the approved `Everest Options.dc.html`: the book totals beside the
 * expiry runway, on one 20px surface split `272px | 1fr`.
 *
 * THE FOUR STATS ARE THE DESIGN'S, and every one is a sum of stored figures:
 * estimated P/L, capital at risk, calls/puts, nearest expiry. There is no
 * exposure model, no notional, no delta-adjusted anything — Everest tracks
 * long-only contracts the user typed in, and the premium paid IS the maximum
 * loss, which is what makes "capital at risk" a real number rather than a
 * modelled one.
 */

function Stat({ label, value, tone, hint }) {
  return (
    <div title={hint} style={{ cursor: hint ? 'help' : 'default' }}>
      <div className="whitespace-nowrap text-[9.5px] font-semibold uppercase tracking-[0.08em] text-text-tertiary">
        {label}
      </div>
      <div
        className={`num mt-[3px] whitespace-nowrap font-display text-[15px] font-bold tracking-[-0.035em] ${tone}`}
      >
        {value}
      </div>
    </div>
  )
}

function BookTotals({ totals, count, loading, onFocusUrgent }) {
  if (loading) {
    return (
      <div className="p-[16px_18px_17px]">
        <Skeleton className="h-2.5 w-40" />
        <Skeleton className="mt-3 h-9 w-48" />
        <div className="mt-5 grid grid-cols-2 gap-3">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-9 w-full" />
          ))}
        </div>
      </div>
    )
  }

  const up = (totals.pnl ?? 0) >= 0
  const urgent = totals.urgent.length

  return (
    <div className="p-[16px_18px_17px]">
      <div className="flex items-center gap-1.5">
        <span className="text-[9.5px] font-bold uppercase tracking-[0.11em] text-text-tertiary">
          Estimated contract value
        </span>
        <span
          title={ESTIMATE_DISCLOSURE}
          className="flex h-3.5 w-3.5 shrink-0 cursor-help items-center justify-center rounded-full
            text-[9px] font-extrabold text-text-tertiary"
          style={{ border: '1px solid var(--border-strong)' }}
        >
          i
        </span>
      </div>

      <div className="mt-[7px] flex flex-wrap items-end gap-2.5">
        <span
          className="num font-display font-extrabold leading-[0.92] tracking-[-0.05em] text-text-primary"
          style={{ fontSize: 'clamp(30px, 3vw, 38px)' }}
        >
          {totals.value === 0 && totals.unpriced === count ? '—' : fmtMoneyRounded(totals.value)}
        </span>

        {totals.pnlPercent === null ? (
          <span className="mb-1 text-[12px] font-semibold text-text-tertiary">
            no estimate available
          </span>
        ) : (
          <span
            className="num mb-[3px] flex items-center gap-1.5 rounded-full text-[12.5px] font-bold tracking-[-0.02em]"
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
            {fmtPercent(totals.pnlPercent)}
          </span>
        )}
      </div>

      <div
        /*
          Two up while the totals sit in their 272px column, four up ONLY once
          the band has stacked at 960 and this column has the full page width,
          two up again when that width runs out. Going four-up any earlier
          crushed four labels into a 272px row.
        */
        className="mt-4 grid grid-cols-2 gap-x-3.5 gap-y-3 pt-3.5
          max-[960px]:grid-cols-4 max-[760px]:grid-cols-2"
        style={{ boxShadow: '0 -1px 0 var(--border)' }}
      >
        <Stat
          label="Estimated P/L"
          value={totals.pnlPercent === null ? '—' : fmtMoneyRounded(totals.pnl, { signed: true })}
          tone={
            totals.pnlPercent === null
              ? 'text-text-tertiary'
              : totals.pnl >= 0
                ? 'text-up'
                : 'text-down'
          }
          hint={`Estimated value ${fmtMoney(totals.value)} less the ${fmtMoney(totals.cost)} of premium paid. ${ESTIMATE_DISCLOSURE}`}
        />
        <Stat
          label="Capital at risk"
          value={fmtMoneyRounded(totals.cost)}
          tone="text-text-primary"
          hint="Total premium paid. Every contract Everest tracks is long, so the premium is the most that can be lost. Everest does not support short options."
        />
        <Stat
          label="Calls / puts"
          value={`${totals.calls} / ${totals.puts}`}
          tone="text-text-primary"
        />
        <Stat
          label="Nearest expiry"
          value={totals.nearest ? `${totals.nearest.dte}d` : '—'}
          tone={totals.nearest && totals.nearest.dte <= 7 ? 'text-warn' : 'text-text-primary'}
          hint={
            totals.nearest
              ? `${fmtDate(totals.nearest.expiry)} — ${totals.nearest.ticker} ${fmtMoney(totals.nearest.strike)} ${totals.nearest.type}.`
              : undefined
          }
        />
      </div>

      {/*
        A COUNT AND A DATE, not an alarm. It says how many contracts expire
        inside seven days and takes you to the soonest one; it does not score,
        rank or advise. Everest has no assignment model to have an opinion.
      */}
      {urgent > 0 ? (
        <button
          type="button"
          onClick={onFocusUrgent}
          className="mt-[15px] flex w-full cursor-pointer items-center gap-2 rounded-[11px]
            text-left transition-colors duration-150"
          style={{
            padding: '8px 11px',
            background: 'var(--warn-soft)',
            border: '1px solid rgb(var(--accent-amber-rgb) / 0.32)',
          }}
        >
          <span
            className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full"
            style={{ background: 'var(--accent-amber)' }}
            aria-hidden="true"
          />
          <span className="min-w-0 flex-1 text-[11.5px] font-bold tracking-[-0.01em] text-warn">
            {urgent} {urgent === 1 ? 'contract expires' : 'contracts expire'} within 7 days
          </span>
          <ChevronRight size={11} strokeWidth={2} className="shrink-0 text-warn" />
        </button>
      ) : null}
    </div>
  )
}

export function OptionsBand({ views, totals, selectedId, onSelect, loading }) {
  return (
    <div
      className="grid overflow-hidden
        [grid-template-columns:272px_minmax(0,1fr)]
        max-[960px]:[grid-template-columns:minmax(0,1fr)]"
      style={{
        borderRadius: 'var(--radius-surface)',
        background: 'var(--panel-bg)',
        boxShadow: 'var(--shadow-surface)',
      }}
    >
      <div
        className="max-[960px]:[border-right:0] max-[960px]:[box-shadow:0_1px_0_var(--border)]"
        style={{ borderRight: '1px solid var(--border)' }}
      >
        <BookTotals
          totals={totals}
          count={views.length}
          loading={loading}
          onFocusUrgent={() => totals.urgent[0] && onSelect(totals.urgent[0].id)}
        />
      </div>

      {loading ? (
        <div className="p-[16px_20px]">
          <Skeleton className="h-[150px] w-full rounded-nested" />
        </div>
      ) : (
        <ExpiryRunway views={views} selectedId={selectedId} onSelect={onSelect} />
      )}
    </div>
  )
}
