import { useState } from 'react'

import { Modal } from './Modal'
import { Segmented } from './ui/Segmented'
import { ErrorState } from './States'
import { AssetSelector, useAssetQuote } from './ui/form/AssetSelector'
import { FormField } from './ui/form/FormField'
import { FormActions } from './ui/form/FormShell'
import { useMode } from '../hooks/useMode'
import { useToast } from './ui/Toast'
import { api } from '../lib/api'
import { invalidate } from '../lib/cache'
import { fmtDate, fmtMoney } from '../lib/format'

/** 100 shares per contract — the standard US equity option multiplier. */
const CONTRACT_MULTIPLIER = 100

/** One labelled row inside the contract ticket. Mirrors Add Position. */
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

const CONTRACT_TYPES = [
  { value: 'call', label: 'Call' },
  { value: 'put', label: 'Put' },
]

const EMPTY = { ticker: '', strike: '', expiry: '', qty: '', avg_cost: '' }

/** Shared by /app/options and the Options tab on ticker detail. */
/**
 * Add an options contract.
 *
 * Shares the Add Position language: search-and-confirm the underlying with a
 * live price, then the contract terms, then a derived total. Premium is per
 * SHARE and a contract covers 100 — the most common way to record a contract
 * wrongly — so the total premium is calculated on screen rather than left as
 * arithmetic the user does in their head.
 */
export function AddOptionModal({ open, onClose, onAdded, lockedTicker }) {
  const { mode } = useMode()
  const toast = useToast()
  const [form, setForm] = useState({ ...EMPTY, ticker: lockedTicker || '' })
  const [type, setType] = useState('call')
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  const symbol = (lockedTicker || form.ticker || '').toUpperCase()
  const { raw, quote, loading: quoteLoading, error: quoteError, refetch } = useAssetQuote(
    symbol || null,
  )

  // Reset on open — see AddPositionModal for why this is a render-time
  // adjustment rather than an effect.
  const [wasOpen, setWasOpen] = useState(open)
  if (wasOpen !== open) {
    setWasOpen(open)
    if (open) {
      setForm({ ...EMPTY, ticker: lockedTicker || '' })
      setType('call')
      setError(null)
    }
  }

  const update = (key) => (e) => setForm((prev) => ({ ...prev, [key]: e.target.value }))

  const contracts = form.qty.trim() === '' ? null : Number(form.qty)
  const premium = form.avg_cost.trim() === '' ? null : Number(form.avg_cost)
  const validContracts = Number.isFinite(contracts) && contracts > 0
  const validPremium = Number.isFinite(premium) && premium >= 0

  const totalPremium =
    validContracts && validPremium ? contracts * premium * CONTRACT_MULTIPLIER : null

  const blockedReason = (() => {
    if (!symbol) return 'Choose an underlying to continue.'
    if (!form.strike.trim() || Number(form.strike) <= 0) return 'Enter a strike price.'
    if (!form.expiry) return 'Choose an expiry date.'
    if (!validContracts) return 'Enter how many contracts you hold.'
    if (!validPremium) return 'Enter the premium paid per share.'
    return null
  })()

  const submit = async (event) => {
    event.preventDefault()
    setError(null)
    if (blockedReason) return

    setLoading(true)
    try {
      await api.addOption({
        ticker: symbol,
        strike: Number(form.strike),
        expiry: form.expiry,
        type,
        qty: contracts,
        avg_cost: premium,
        mode,
      })
      invalidate('options')
      setForm({ ...EMPTY, ticker: lockedTicker || '' })
      toast.success('Contract added')
      onAdded?.()
      onClose()
    } catch (err) {
      setError(err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add contract"
      description={`Adding to your ${mode} book.`}
    >
      <form onSubmit={submit} className="space-y-4">
        {error ? <ErrorState error={error} compact /> : null}

        <AssetSelector
          symbol={symbol}
          onChange={(value) => setForm((prev) => ({ ...prev, ticker: value }))}
          quote={{ raw, quote }}
          loading={quoteLoading}
          error={quoteError}
          onRetry={refetch}
          locked={Boolean(lockedTicker)}
          label="Underlying"
        />

        {symbol ? (
          <>
            <div>
              <span className="label">Contract type</span>
              <Segmented
                label="Contract type"
                options={CONTRACT_TYPES}
                value={type}
                onChange={setType}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <FormField
                label="Strike"
                type="number"
                step="any"
                min="0.01"
                inputMode="decimal"
                value={form.strike}
                onChange={update('strike')}
                placeholder="200"
                prefix="$"
              />
              <FormField
                label="Expiry"
                type="date"
                value={form.expiry}
                onChange={update('expiry')}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <FormField
                label="Contracts"
                type="number"
                step="1"
                min="1"
                inputMode="numeric"
                value={form.qty}
                onChange={update('qty')}
                placeholder="2"
              />
              <FormField
                label="Premium"
                type="number"
                step="any"
                min="0"
                inputMode="decimal"
                value={form.avg_cost}
                onChange={update('avg_cost')}
                placeholder="4.35"
                prefix="$"
                hint="Per share"
              />
            </div>

            {/*
              The contract ticket, mirroring Add Position line for line.
              The multiplier is spelled out because premium is quoted PER SHARE
              while a contract covers 100 — the single most common way to
              record an options position wrongly by two orders of magnitude.
            */}
            <div
              className="rounded-panel"
              style={{ background: 'var(--e0-bg)', border: '1px solid var(--e0-border)' }}
            >
              <div className="px-3.5 pt-3">
                <span className="t-eyebrow">
                  {type === 'call' ? 'Long call' : 'Long put'} · debit
                </span>
              </div>

              <dl className="space-y-1.5 px-3.5 py-3">
                <Line label="Underlying" value={symbol || '—'} />
                <Line label="Strike" value={form.strike ? fmtMoney(Number(form.strike)) : '—'} />
                <Line
                  label="Expiration"
                  value={form.expiry ? fmtDate(form.expiry, { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                />
                <Line label="Contracts" value={validContracts ? contracts : '—'} />
                <Line label="Premium" value={validPremium ? fmtMoney(premium) : '—'} hint="per share" />
                <Line label="Contract multiplier" value={`× ${CONTRACT_MULTIPLIER}`} muted />
              </dl>

              <div
                className="flex items-baseline justify-between gap-3 border-t px-3.5 py-3"
                style={{ borderColor: 'var(--border)' }}
              >
                <span className="text-[12px] font-semibold text-text-primary">Total debit</span>
                <span className="num text-[17px] font-semibold text-text-primary">
                  {totalPremium === null ? '—' : fmtMoney(totalPremium)}
                </span>
              </div>
            </div>
          </>
        ) : null}

        <FormActions
          onCancel={onClose}
          submitLabel="Add contract"
          loadingLabel="Adding…"
          loading={loading}
          disabled={Boolean(blockedReason)}
          disabledReason={symbol ? blockedReason : null}
        />
      </form>
    </Modal>
  )
}
