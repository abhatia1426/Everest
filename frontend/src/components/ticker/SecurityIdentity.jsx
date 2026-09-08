import { Plus, Star } from 'lucide-react'

import { CompanyLogo } from '../ui/CompanyLogo'
import { Skeleton } from '../States'
import { fmtMoney, fmtPercent, fmtSignedMoney } from '../../lib/format'
import { QUOTE_STATE, quoteLabel } from '../../lib/quotes'

/**
 * The security identity bar — logo, name, price, provenance, and the two real
 * actions.
 *
 * PROVENANCE IS READ, NOT DECIDED. The session dot and the line beside it come
 * from `lib/quotes`, the single interpretation of a price in this application.
 * A second freshness rule here could tell the user this quote is live while the
 * Portfolio ledger greys the same figure in the same second.
 *
 * THE PRIMARY ACTION IS "ADD POSITION", NOT "TRADE". The approved mockup says
 * Trade / Manage position; Everest places no orders, holds no account and
 * settles nothing. `Add position` records a holding, which is exactly what the
 * button does, and there is no account number on this page because Everest has
 * none.
 */
/** The venue's name, without the vendor's segment suffix. */
function shortExchange(value) {
  return String(value).split(/\s+-\s+|,/)[0].trim().slice(0, 18)
}

function provenanceLine(view, session) {
  switch (view.state) {
    case QUOTE_STATE.LIVE:
      return 'Live · refreshes every 30 seconds'
    case QUOTE_STATE.DELAYED:
      return session.state === 'closed' ? `At close · ${session.detail}` : `Delayed · ${session.detail}`
    case QUOTE_STATE.CACHED:
      return `${quoteLabel(view)} · not a live price`
    case QUOTE_STATE.COST_BASIS:
      return 'Your cost basis · no market price available'
    default:
      return 'No live quote · last known close'
  }
}

export function SecurityIdentity({
  symbol,
  company,
  sector,
  exchange,
  quote,
  view,
  session,
  loading,
  watched,
  watchBusy,
  onToggleWatch,
  onAddPosition,
  held,
}) {
  const priceKnown = !view.unavailable && view.price !== null
  const measured = priceKnown && typeof quote?.change_percent === 'number'
  const up = (quote?.change_percent ?? 0) >= 0

  const sessionTone = {
    open: 'var(--accent-green)',
    pre: 'var(--accent-amber)',
    post: 'var(--accent-amber)',
    closed: 'var(--text-tertiary)',
  }[session.state]

  return (
    <div
      data-idbar
      className="flex shrink-0 items-end gap-[26px] px-5 pb-4
        max-[900px]:flex-col max-[900px]:items-start max-[900px]:gap-3.5
        max-[760px]:px-3.5"
      style={{ boxShadow: '0 1px 0 var(--border)' }}
    >
      <div
        data-idprice
        className="flex min-w-0 flex-1 flex-wrap items-end gap-[22px] max-[1400px]:gap-3.5"
      >
        <div className="flex shrink-0 items-center gap-[13px]">
          {/* The real logo service, with the established monogram only as its
              floor — never a placeholder in its own right. */}
          <span
            className="shrink-0 rounded-[14px]"
            style={{ boxShadow: '0 0 0 1px var(--accent-blue)' }}
          >
            <CompanyLogo ticker={symbol} name={company} size={48} />
          </span>
          <span className="min-w-0">
            <span className="flex flex-wrap items-center gap-2">
              <span className="num font-display text-[27px] font-extrabold leading-none tracking-[-0.045em] text-text-primary">
                {symbol}
              </span>
              {sector ? (
                <span
                  className="whitespace-nowrap rounded-[6px] text-[10px] font-bold uppercase tracking-[0.05em] text-text-secondary"
                  style={{ padding: '2px 7px', background: 'var(--nested-bg)' }}
                >
                  {sector}
                </span>
              ) : null}
              {exchange ? (
                /* The provider reports the venue in full — "NASDAQ NMS -
                   GLOBAL MARKET". The chip shows the exchange it names and
                   carries the full string in its tooltip: shortening a label
                   is presentation, but dropping the value would lose it. */
                <span
                  title={exchange}
                  className="whitespace-nowrap rounded-[6px] text-[10px] font-bold uppercase tracking-[0.05em] text-text-tertiary"
                  style={{ padding: '2px 7px', border: '1px solid var(--border-strong)' }}
                >
                  {shortExchange(exchange)}
                </span>
              ) : null}
            </span>
            <span className="mt-1 block truncate text-[13px] text-text-secondary">{company}</span>
          </span>
        </div>

        <div className="flex shrink-0 items-end gap-[13px]">
          {loading ? (
            <Skeleton className="h-12 w-52" />
          ) : (
            /* Sized by class, not by inline style: an inline `fontSize` wins
               over every media query, so the approved 40px step at 760px
               silently never applied. */
            <span
              data-bignum
              className="num font-display text-[50px] font-extrabold leading-[0.9] tracking-[-0.05em]
                text-text-primary max-[760px]:text-[40px]"
            >
              {priceKnown ? fmtMoney(view.price) : '—'}
            </span>
          )}

          <div className="mb-[3px] flex flex-col gap-[5px]">
            <div
              className="num flex items-center gap-[7px] rounded-full text-[14px] font-bold tracking-[-0.02em]"
              style={{
                padding: '5px 11px',
                background: measured
                  ? up
                    ? 'var(--up-soft)'
                    : 'var(--down-soft)'
                  : 'var(--nested-bg)',
                color: measured
                  ? up
                    ? 'var(--accent-green)'
                    : 'var(--accent-red)'
                  : 'var(--text-tertiary)',
              }}
            >
              <svg
                width="10"
                height="10"
                viewBox="0 0 12 12"
                fill="currentColor"
                aria-hidden="true"
                style={{ transform: !measured ? 'rotate(90deg)' : up ? 'none' : 'rotate(180deg)' }}
              >
                <path d="M6 1.5l4.4 7.5H1.6z" />
              </svg>
              {measured ? fmtPercent(quote.change_percent) : 'No quote'}
              {measured ? (
                <span className="font-semibold opacity-[0.72]">{fmtSignedMoney(quote.change)}</span>
              ) : null}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span
                className="flex items-center gap-1.5 text-[11px] font-bold tracking-[-0.01em]"
                style={{ color: sessionTone }}
              >
                <span
                  className={`h-[5px] w-[5px] rounded-full ${session.state === 'open' ? 'animate-pulse' : ''}`}
                  style={{ background: sessionTone }}
                  aria-hidden="true"
                />
                {session.label}
              </span>
              <span className="text-[11px] text-text-tertiary">
                {provenanceLine(view, session)}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div
        data-idact
        className="flex shrink-0 flex-wrap items-center justify-end gap-2 max-[900px]:w-full max-[900px]:justify-start"
      >
        {/*
          The SAME watchlist state the Watchlist page owns — one provider, one
          poll, one truth. A second local flag here could disagree with the
          rail above it.
        */}
        <button
          type="button"
          onClick={onToggleWatch}
          disabled={watchBusy}
          aria-pressed={watched}
          className="flex shrink-0 cursor-pointer items-center gap-[7px] rounded-full text-[12.5px]
            font-semibold transition-colors duration-150 disabled:opacity-60"
          style={{
            padding: '9px 14px',
            background: watched
              ? 'color-mix(in oklab, var(--accent-blue) 16%, transparent)'
              : 'transparent',
            border: `1px solid ${watched ? 'var(--accent-blue)' : 'var(--border-strong)'}`,
            color: watched ? 'var(--accent-blue)' : 'var(--text-secondary)',
          }}
        >
          <Star size={12} fill={watched ? 'currentColor' : 'none'} strokeWidth={1.6} />
          {watchBusy ? 'Saving…' : watched ? 'On watchlist' : 'Watch'}
        </button>

        <button
          type="button"
          onClick={onAddPosition}
          className="flex shrink-0 cursor-pointer items-center gap-[7px] rounded-full text-[13px]
            font-bold tracking-[-0.01em] transition-colors duration-150"
          style={{
            padding: '9px 19px',
            background: 'var(--accent-blue)',
            color: 'var(--brand-ink)',
            boxShadow: '0 8px 20px -10px var(--accent-blue)',
          }}
        >
          <Plus size={12} strokeWidth={2.4} />
          {held ? 'Add to position' : 'Add position'}
        </button>
      </div>
    </div>
  )
}
