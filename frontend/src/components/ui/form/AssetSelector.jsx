import { useCallback, useState } from 'react'
import { Check, RefreshCw, X } from 'lucide-react'

import { TickerAutocomplete } from '../../search/TickerAutocomplete'
import { CompanyLogo } from '../CompanyLogo'
import { Skeleton } from '../../States'
import { useApi } from '../../../hooks/useApi'
import { TTL } from '../../../lib/cache'
import { api } from '../../../lib/api'
import { displayName, equityOrFallback } from '../../../lib/equitySource'
import { fmtMoney, fmtPercent } from '../../../lib/format'
import { normalizeQuote, quoteLabel } from '../../../lib/quotes'

/**
 * Live quote for one symbol, for use inside a form.
 *
 * Shares `quote:{SYMBOL}` with Stock Detail and the dashboard, so opening the
 * Add Position modal for a symbol you were just looking at costs zero requests
 * and shows a price on the first frame.
 */
export function useAssetQuote(symbol) {
  const enabled = Boolean(symbol)
  const fetcher = useCallback(() => api.prices([symbol]), [symbol])
  const { data, loading, error, refetch } = useApi(fetcher, [symbol], {
    key: symbol ? `quote:${symbol}` : null,
    ttl: TTL.QUOTE,
    enabled,
  })

  const raw = data?.quotes?.[symbol] || null
  return {
    raw,
    quote: raw ? normalizeQuote(raw) : null,
    loading: enabled && loading,
    error,
    refetch,
  }
}

/**
 * The selected-company card.
 *
 * This is the piece that makes the flow read as a brokerage rather than a
 * database form: identity (logo, name, exchange, sector) and the live price
 * you are about to transact at, together, before any numbers are entered.
 */
export function AssetCard({ symbol, quote, loading, error, onRetry }) {
  const reference = equityOrFallback(symbol)
  const raw = quote?.raw
  const company = displayName(symbol, raw?.company, reference.name)

  /*
   * Metadata is merged from two sources, resolved only AFTER selection.
   *
   * The local dataset (bundled, free, instant) has sector and industry but no
   * exchange; the quote response has exchange and the provider's own sector.
   * Fetching the quote during typing is what the AssetSelector bug used to do —
   * one request per keystroke — so this deliberately waits for a committed
   * symbol, at which point the quote is being fetched anyway and the exchange
   * comes along for free. No extra request.
   */
  const sector = raw?.sector || reference.sector
  const industry = reference.industry
  const exchange = raw?.exchange

  const view = quote?.quote
  const up = (raw?.change ?? 0) >= 0
  const provenance = view ? quoteLabel(view) : null

  return (
    <div
      className="flex items-center gap-3 rounded-panel px-3.5 py-3"
      style={{ background: 'var(--e1-bg)', border: '1px solid var(--e1-border)' }}
    >
      <CompanyLogo ticker={symbol} name={company} size={38} />

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="num text-[13px] font-semibold text-text-primary">{symbol}</span>
          <span className="truncate text-[12px] text-text-secondary">{company}</span>
        </div>
        <p className="mt-0.5 truncate text-[10.5px] text-text-tertiary">
          {[exchange, sector, industry !== sector ? industry : null]
            .filter(Boolean)
            .join(' · ') || '—'}
        </p>
      </div>

      <div className="shrink-0 text-right">
        {loading && !view ? (
          <Skeleton className="h-5 w-20" />
        ) : error || !view || view.unavailable ? (
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex cursor-pointer items-center gap-1 text-[11px] font-semibold
              text-text-tertiary transition-colors duration-150 hover:text-text-primary"
          >
            <RefreshCw size={11} />
            No price
          </button>
        ) : (
          <>
            <p className="num text-[15px] font-semibold text-text-primary">
              {fmtMoney(view.price)}
            </p>
            <p className={`num text-[11px] font-semibold ${up ? 'text-up' : 'text-down'}`}>
              {fmtPercent(raw?.change_percent)}
            </p>
            {provenance ? (
              <p className="text-[9.5px] text-text-tertiary">{provenance}</p>
            ) : null}
          </>
        )}
      </div>
    </div>
  )
}

/**
 * Search-and-select a company.
 *
 * Wraps `TickerAutocomplete` so every create-flow gets the same two-state
 * behaviour: search until something is chosen, then a confirmed asset card
 * with a "change" affordance. The alternative — leaving a raw text input on
 * screen after selection — is what made the old form feel like a database
 * entry screen rather than a transaction.
 */
export function AssetSelector({
  symbol,
  onChange,
  quote,
  loading,
  error,
  onRetry,
  locked = false,
  label = 'Company',
}) {
  /*
   * DRAFT vs COMMITTED.
   *
   * The bug this fixes: `symbol` was written on every keystroke and the card
   * was shown whenever `symbol` was truthy, so typing one character swapped the
   * search box for an asset card — resolving "A" to Agilent Technologies, firing
   * /prices?tickers=A, and leaving nowhere to type the second character.
   *
   * A committed selection is now an explicit event (choosing a result), not a
   * side effect of typing. `draft` holds what the user is typing; `symbol` only
   * ever holds a company they actually picked.
   */
  const [draft, setDraft] = useState('')

  const commit = (equity) => {
    if (!equity) return
    setDraft('')
    onChange(equity.ticker)
  }

  const clear = () => {
    setDraft('')
    onChange('')
  }

  if (symbol) {
    return (
      <div>
        <div className="mb-2 flex items-center justify-between">
          <span className="label mb-0">{label}</span>
          {!locked ? (
            <button
              type="button"
              onClick={clear}
              className="inline-flex cursor-pointer items-center gap-1 text-[11px] font-semibold
                text-accent transition-opacity duration-150 hover:opacity-80"
            >
              <X size={11} />
              Change
            </button>
          ) : (
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-text-tertiary">
              <Check size={10} />
              Locked
            </span>
          )}
        </div>

        <AssetCard
          symbol={symbol}
          quote={quote}
          loading={loading}
          error={error}
          onRetry={onRetry}
        />
      </div>
    )
  }

  return (
    <TickerAutocomplete
      value={draft}
      onChange={setDraft}
      onSelectEquity={commit}
      label={label}
      // No autoFocus: Modal already moves focus to its first focusable element
      // on open, and a second claim on focus fights it.
      placeholder="Search by company name or ticker"
    />
  )
}
