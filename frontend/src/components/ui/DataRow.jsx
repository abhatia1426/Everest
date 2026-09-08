import { Link } from 'react-router-dom'

import { CompanyLogo } from './CompanyLogo'
import { QuoteDot } from './QuoteBadge'
import { normalizeQuote } from '../../lib/quotes'
import { equityOrFallback } from '../../lib/equitySource'
import { fmtMoney, fmtPercent, pnlColor } from '../../lib/format'

/**
 * The dense company row — the single most repeated object in the product.
 *
 * Holdings, movers and the watchlist preview all rendered near-identical
 * markup in v2, and had drifted apart: different logo sizes, different label
 * order, different truncation. One primitive means a symbol looks the same
 * everywhere, which is what makes a dense screen scannable rather than busy.
 *
 * `trailing` is a slot rather than a fixed column so a caller can supply a
 * sparkline, a weight bar or nothing without the row changing shape.
 */
export function DataRow({
  ticker,
  company,
  price,
  changePercent,
  primary,
  secondary,
  trailing,
  meta,
  quote,
  logoSize = 30,
  to,
  className = '',
}) {
  const reference = equityOrFallback(ticker)
  const name = company && company !== ticker ? company : reference.name
  // Sector turns a row from an identifier into a holding you can place. It is
  // the cheapest context available and it is already in the reference data.
  const sector = reference.sector

  /*
   * Every row goes through the canonical normaliser. Movers and the watchlist
   * preview previously rendered a bare price with no provenance, so the same
   * ticker could look live here and be labelled "Cached 4m ago" on Stock
   * Detail — the exact inconsistency lib/quotes exists to remove.
   *
   * Callers that already computed a display value still pass `primary`.
   */
  const view = normalizeQuote(quote || { ticker, price, change_percent: changePercent })
  const primaryValue = primary ?? (view.unavailable ? '—' : fmtMoney(view.price))
  const secondaryValue =
    secondary ?? (
      <span className={pnlColor(changePercent)}>{fmtPercent(changePercent)}</span>
    )

  const content = (
    <>
      <CompanyLogo ticker={ticker} name={name} size={logoSize} />

      <span className="min-w-0 flex-1">
        <span className="num block truncate text-[13px] font-semibold text-text-primary">
          {ticker}
        </span>
        <span className="block truncate text-[11px] text-text-secondary">
          {meta || name}
          {!meta && sector ? (
            <span className="text-text-tertiary"> · {sector}</span>
          ) : null}
        </span>
      </span>

      {trailing ? <span className="hidden shrink-0 sm:block">{trailing}</span> : null}

      <span className="shrink-0 text-right">
        <span className="num flex items-center justify-end gap-1.5 text-[13px] font-semibold text-text-primary">
          {/*
            Provenance rides beside the price as a dot rather than a line of
            text beneath it. In a list the label form repeated once per row and
            dominated the column it was annotating; the dot keeps the sentence
            in its tooltip and accessible name, and renders nothing at all when
            the quote is live.
          */}
          <QuoteDot quote={view} />
          {primaryValue}
        </span>
        <span className="num block text-[11px] font-semibold">{secondaryValue}</span>
      </span>
    </>
  )

  const shared = `flex items-center gap-3 rounded-panel px-2 py-2 transition-colors
    duration-150 hover:bg-tint/[0.04] ${className}`

  if (!to) return <div className={shared}>{content}</div>

  return (
    <Link to={to} className={shared}>
      {content}
    </Link>
  )
}
