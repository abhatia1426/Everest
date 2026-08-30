import { useMemo, useState } from 'react'

import { Check } from 'lucide-react'

import { Modal } from '../Modal'
import { ErrorState } from '../States'
import { AssetSelector, useAssetQuote } from '../ui/form/AssetSelector'
import { FormField } from '../ui/form/FormField'
import { AdvancedSection, FieldNote, FormActions } from '../ui/form/FormShell'
import { useMode } from '../../hooks/useMode'
import { api } from '../../lib/api'
import { invalidate } from '../../lib/cache'
import { fmtMoney, fmtNumber } from '../../lib/format'

/** One labelled row inside the order ticket. */
function Line({ label, value, hint, muted = false }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-[11.5px] text-text-secondary">
        {label}
        {hint ? <span className="ml-1.5 text-[10px] text-text-tertiary">{hint}</span> : null}
      </dt>
      <dd className={`num text-[12.5px] ${muted ? 'text-text-tertiary' : 'text-text-primary'}`}>
        {value}
      </dd>
    </div>
  )
}

/** Format-only: 1-5 letters. Resolvability is the server's non-blocking concern. */
const TICKER_PATTERN = /^[A-Za-z]{1,5}$/

/**
 * Add Investment.
 *
 * WHAT CHANGED AND WHY: the old form asked for ticker, quantity and "average
 * cost" as three equal text inputs. That is a database row, not a purchase.
 * "Average cost" in particular implied the user should invent a price, when in
 * the overwhelmingly common case — buying now — the price is simply the market
 * price, and the app already knows it.
 *
 * The flow is now: pick a company, see what it costs, say how many shares.
 * Cost basis defaults to the live quote and the position's value is derived in
 * front of you. Manual entry still exists for importing historical lots, but it
 * has moved into an advanced section and is labelled as what it is, because
 * setting it silently changes every P/L figure the app will ever show for that
 * holding.
 *
 * The API contract is unchanged: this still POSTs {ticker, qty, avg_cost, mode}.
 */
export function AddPositionModal({ open, onClose, onAdded, defaultTicker = '' }) {
  const { mode } = useMode()

  const [symbol, setSymbol] = useState(defaultTicker)
  const [shares, setShares] = useState('')
  const [override, setOverride] = useState('')
  const [error, setError] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  const { raw, quote, loading, error: quoteError, refetch } = useAssetQuote(symbol || null)

  // Reset whenever the dialog transitions closed->open, so reopening never
  // shows a stale company and a previous share count.
  //
  // Adjusted during render rather than in an effect: React re-runs this
  // component immediately with the corrected state and never commits the
  // stale frame, so the previous entry cannot flash on open.
  const [wasOpen, setWasOpen] = useState(open)
  if (wasOpen !== open) {
    setWasOpen(open)
    if (open) {
      setSymbol(defaultTicker)
      setShares('')
      setOverride('')
      setError(null)
    }
  }

  const marketPrice = quote && !quote.unavailable ? quote.price : null
  const overrideValue = override.trim() === '' ? null : Number(override)
  const usingOverride = overrideValue !== null && Number.isFinite(overrideValue) && overrideValue > 0

  const costBasis = usingOverride ? overrideValue : marketPrice
  const shareCount = shares.trim() === '' ? null : Number(shares)
  const validShares = shareCount !== null && Number.isFinite(shareCount) && shareCount > 0

  const positionValue = validShares && costBasis ? shareCount * costBasis : null

  // What actually blocks submission, stated rather than implied.
  const blockedReason = useMemo(() => {
    if (!symbol) return 'Choose a company to continue.'
    if (!TICKER_PATTERN.test(symbol)) return 'Ticker must be 1-5 letters.'
    if (!validShares) return 'Enter how many shares you hold.'
    if (!costBasis) {
      return usingOverride
        ? 'Enter a valid purchase price.'
        : 'No market price available — set a purchase price under Advanced to continue.'
    }
    return null
  }, [symbol, validShares, costBasis, usingOverride])

  const submit = async (event) => {
    event.preventDefault()
    setError(null)
    if (blockedReason) return

    setSubmitting(true)
    try {
      const saved = await api.addPosition({
        ticker: symbol.trim().toUpperCase(),
        qty: shareCount,
        avg_cost: costBasis,
        mode,
        type: 'stock',
      })
      // The book changed; every derived view of it is now stale.
      invalidate('portfolio')
      invalidate('pnl')
      invalidate('activity')
      onAdded?.(saved)
      onClose()
    } catch (err) {
      setError(err)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add investment"
      description={`Adding to your ${mode} book. Repeat buys average into the existing lot.`}
    >
      <form onSubmit={submit} className="space-y-4">
        {error ? <ErrorState error={error} compact /> : null}

        <AssetSelector
          symbol={symbol}
          onChange={setSymbol}
          quote={{ raw, quote }}
          loading={loading}
          error={quoteError}
          onRetry={refetch}
        />

        {symbol ? (
          <>
            <FormField
              label="Shares"
              type="number"
              step="any"
              min="0.0001"
              inputMode="decimal"
              value={shares}
              onChange={(e) => setShares(e.target.value)}
              placeholder="10"
              suffix="shares"
            />

            {/*
              The order ticket. Shown rather than described: the user supplies
              one number and watches the cost fall out of a price they can read
              directly above it.

              `usingOverride` deliberately restates the whole line, because a
              historical import and a market buy produce identical-looking
              numbers and only the labels distinguish them.
            */}
            <div
              className="rounded-panel"
              style={{ background: 'var(--e0-bg)', border: '1px solid var(--e0-border)' }}
            >
              <div className="flex items-center justify-between gap-3 px-3.5 pt-3">
                <span className="t-eyebrow">
                  {usingOverride ? 'Historical import' : 'Buy at current market price'}
                </span>
                {!usingOverride ? (
                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-up">
                    <Check size={10} />
                    Default
                  </span>
                ) : null}
              </div>

              <dl className="space-y-1.5 px-3.5 py-3">
                <Line label="Shares" value={validShares ? fmtNumber(shareCount, shareCount % 1 === 0 ? 0 : 4) : '—'} />
                <Line
                  label={usingOverride ? 'Your price' : 'Market price'}
                  value={costBasis ? fmtMoney(costBasis) : '—'}
                />
                {/* Placeholder line: Everest does not execute trades, so there
                    is no brokerage fee to charge. Stated rather than omitted so
                    the total cannot be mistaken for a net-of-fees figure. */}
                <Line label="Estimated commission" value="$0.00" muted hint="Everest does not execute trades" />
              </dl>

              <div
                className="flex items-baseline justify-between gap-3 border-t px-3.5 py-3"
                style={{ borderColor: 'var(--border)' }}
              >
                <span className="text-[12px] font-semibold text-text-primary">
                  {usingOverride ? 'Cost basis' : 'Position value'}
                </span>
                <span className="num text-[17px] font-semibold text-text-primary">
                  {positionValue === null ? '—' : fmtMoney(positionValue)}
                </span>
              </div>
            </div>

            <AdvancedSection label="Advanced">
              <FormField
                label="Override purchase price"
                type="number"
                step="any"
                min="0"
                inputMode="decimal"
                value={override}
                onChange={(e) => setOverride(e.target.value)}
                placeholder={marketPrice ? fmtMoney(marketPrice).replace('$', '') : 'Optional'}
                prefix="$"
                hint="Used only for historical imports. Leave empty to buy at the current market price."
              />

              {usingOverride ? (
                <FieldNote tone="warn">
                  Using your own purchase price of {fmtMoney(overrideValue)} per share instead of
                  the market price. This becomes the cost basis, so all profit and loss for this
                  holding is measured against it.
                </FieldNote>
              ) : null}
            </AdvancedSection>
          </>
        ) : null}

        <FormActions
          onCancel={onClose}
          submitLabel="Add position"
          loadingLabel="Adding…"
          loading={submitting}
          disabled={Boolean(blockedReason)}
          disabledReason={symbol ? blockedReason : null}
        />
      </form>
    </Modal>
  )
}
