import { useCallback, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, Layers, Plus, Trash2 } from 'lucide-react'

import { PageHeader } from '../../components/AppLayout'
import { AddOptionModal } from '../../components/AddOptionModal'
import { StaggerGroup, StaggerItem } from '../../components/Motion'
import { EmptyState, ErrorState, Skeleton } from '../../components/States'
import { ContractCard } from '../../components/options/ContractCard'
import { ExpirationTimeline } from '../../components/options/ExpirationTimeline'
import { MetricGroup } from '../../components/ui/MetricGroup'
import { Surface } from '../../components/ui/Surface'
import { useApi } from '../../hooks/useApi'
import { TTL, invalidate } from '../../lib/cache'
import { useMode } from '../../hooks/useMode'
import { useToast } from '../../components/ui/Toast'
import { api } from '../../lib/api'
import {
  dteTone,
  fmtDate,
  fmtMoney,
  fmtNumber,
  fmtPercent,
  fmtSignedMoney,
  pnlColor,
} from '../../lib/format'
import { capitalAtRisk, expiryBuckets } from '../../lib/options'

/* --------------------------------------------------------------- table */

const COLUMNS = [
  { key: 'ticker', label: 'Ticker', align: 'left' },
  { key: 'type', label: 'Type', align: 'left' },
  { key: 'strike', label: 'Strike', align: 'right' },
  { key: 'expiry', label: 'Expiry', align: 'right' },
  { key: 'qty', label: 'Qty', align: 'right' },
  { key: 'avg_cost', label: 'Avg cost', align: 'right' },
  { key: 'est_value', label: 'Est. value', align: 'right' },
  { key: 'pnl', label: 'P&L', align: 'right' },
  { key: 'dte', label: 'DTE', align: 'right' },
  { key: 'actions', label: '', align: 'right' },
]

/**
 * Compact contract table.
 *
 * Retained — and still a table — because Stock Detail embeds it in a narrow
 * tab where three or four contracts on ONE underlying need to be compared
 * line by line. That is exactly the case where density beats composition.
 * The standalone Options page uses cards instead, for the reasons there.
 */
export function OptionsTable({ options, onDeleted, dense = false }) {
  const toast = useToast()
  const [deleting, setDeleting] = useState(null)

  const remove = async (id, ticker) => {
    setDeleting(id)
    try {
      await api.deleteOption(id)
      invalidate('options')
      await onDeleted?.()
      toast.success(`${ticker} contract removed`)
    } catch (err) {
      toast.error('Could not remove contract', err.message)
    } finally {
      setDeleting(null)
    }
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[820px] text-[13px]">
        <thead>
          <tr className="border-b" style={{ borderColor: 'var(--border)' }}>
            {COLUMNS.map((column) => (
              <th
                key={column.key}
                scope="col"
                className={`t-eyebrow px-3 py-2.5 ${
                  column.align === 'right' ? 'text-right' : 'text-left'
                }`}
              >
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {options.map((option) => (
            <tr
              key={option.id}
              className="group border-b transition-colors duration-150 last:border-0
                hover:bg-tint/[0.03]"
              style={{ borderColor: 'var(--border)' }}
            >
              <td className="num px-3 py-2.5 font-semibold">
                {dense ? (
                  option.ticker
                ) : (
                  <Link
                    to={`/app/ticker/${option.ticker}`}
                    className="cursor-pointer hover:text-accent"
                  >
                    {option.ticker}
                  </Link>
                )}
              </td>
              <td className="px-3 py-2.5">
                <span
                  className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${
                    option.type === 'call' ? 'bg-up/12 text-up' : 'bg-down/12 text-down'
                  }`}
                >
                  {option.type}
                </span>
              </td>
              <td className="num px-3 py-2.5 text-right">{fmtMoney(option.strike)}</td>
              <td className="num px-3 py-2.5 text-right text-text-secondary">
                {fmtDate(option.expiry, { month: 'short', day: 'numeric', year: '2-digit' })}
              </td>
              <td className="num px-3 py-2.5 text-right">{fmtNumber(option.qty, 0)}</td>
              <td className="num px-3 py-2.5 text-right">{fmtMoney(option.avg_cost)}</td>
              <td className="num px-3 py-2.5 text-right font-semibold">
                {fmtMoney(option.est_value)}
              </td>
              <td className={`num px-3 py-2.5 text-right font-semibold ${pnlColor(option.pnl)}`}>
                {fmtSignedMoney(option.pnl)}
                <span className="ml-1.5 text-[11px] opacity-70">
                  {fmtPercent(option.pnl_percent)}
                </span>
              </td>
              <td className="px-3 py-2.5 text-right">
                <span
                  className={`num rounded px-1.5 py-0.5 text-[10px] font-bold ${dteTone(option.dte)}`}
                >
                  {option.dte < 0 ? 'exp' : `${option.dte}d`}
                </span>
              </td>
              <td className="px-2 py-2.5 text-right">
                <button
                  type="button"
                  aria-label={`Remove ${option.ticker} ${option.type}`}
                  disabled={deleting === option.id}
                  onClick={() => remove(option.id, option.ticker)}
                  className="btn-danger h-9 w-9 cursor-pointer p-0 opacity-0 transition-opacity
                    duration-150 focus-visible:opacity-100 group-hover:opacity-100"
                >
                  <Trash2 size={14} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/* ------------------------------------------------------------ risk band */

function RiskSummary({ options, loading }) {
  const stats = useMemo(() => {
    const estValue = options.reduce((sum, o) => sum + (o.est_value || 0), 0)
    const pnl = options.reduce((sum, o) => sum + (o.pnl || 0), 0)
    const risk = capitalAtRisk(options)
    return { estValue, pnl, risk, buckets: expiryBuckets(options) }
  }, [options])

  if (loading) {
    return (
      <Surface className="mb-4 p-5 sm:p-6">
        <Skeleton className="h-2.5 w-32" />
        <Skeleton className="mt-3 h-10 w-56" />
        <Skeleton className="mt-6 h-12 w-full" />
      </Surface>
    )
  }

  const urgent = stats.buckets.week + stats.buckets.expired

  return (
    <Surface className="mb-4 p-5 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
        <div>
          <p className="t-eyebrow">Estimated value</p>
          <p className="num-hero mt-2 text-[clamp(1.75rem,3.4vw,2.5rem)] text-text-primary">
            {fmtMoney(stats.estValue)}
          </p>
        </div>

        <div className="min-w-[260px] flex-1">
          <MetricGroup
            items={[
              {
                label: 'Estimated P&L',
                value: fmtSignedMoney(stats.pnl),
                tone: pnlColor(stats.pnl),
              },
              // For long options the premium paid IS the maximum loss, which
              // makes cost basis the honest headline risk figure.
              { label: 'Capital at risk', value: fmtMoney(stats.risk), hint: 'max loss' },
              { label: 'Open contracts', value: options.length },
            ]}
          />
        </div>
      </div>

      {urgent > 0 ? (
        <p className="mt-5 inline-flex items-center gap-2 rounded-control bg-warn/10 px-3 py-1.5
          text-[11.5px] font-semibold text-warn">
          <AlertTriangle size={13} />
          {urgent} {urgent === 1 ? 'contract expires' : 'contracts expire'} within 7 days
        </p>
      ) : null}
    </Surface>
  )
}

/* -------------------------------------------------------------------- page */

/**
 * Options — the trading and risk workspace.
 *
 * Primary task: understand exposure and time pressure. Two questions dominate,
 * and neither is answered by a grid of numbers: "how much can I lose" and
 * "when does this stop existing".
 *
 * So the page leads with a risk band (value, P&L, capital at risk, expiry
 * warning), then an expiration timeline, then contract cards whose central
 * element is a strike meter — spot, strike and breakeven on one axis.
 *
 * NOTE ON GREEKS: the API returns no delta/gamma/theta/vega and no implied
 * volatility to derive them from, so none are shown. See lib/options.js.
 */
export default function Options() {
  const { mode } = useMode()
  const toast = useToast()
  const [deleting, setDeleting] = useState(null)
  const fetcher = useCallback(() => api.options({ mode }), [mode])
  const { data, loading, error, refetch } = useApi(fetcher, [mode], { key: `options:${mode}`, ttl: TTL.PORTFOLIO, pollMs: 60000 })
  const [modalOpen, setModalOpen] = useState(false)

  const options = useMemo(() => data?.options || [], [data])

  // Soonest expiry first: urgency is the natural reading order for a book of
  // decaying instruments.
  const sorted = useMemo(
    () => [...options].sort((a, b) => (a.dte ?? 0) - (b.dte ?? 0)),
    [options],
  )

  const remove = async (id, ticker) => {
    setDeleting(id)
    try {
      await api.deleteOption(id)
      invalidate('options')
      await refetch({ silent: true, force: true })
      toast.success(`${ticker} contract removed`)
    } catch (err) {
      toast.error('Could not remove contract', err.message)
    } finally {
      setDeleting(null)
    }
  }

  const initialLoad = loading && !data

  return (
    <div className="mx-auto max-w-[1440px]">
      <PageHeader
        subtitle="Estimated values use intrinsic value plus a simple time premium — not an options pricing model."
        actions={
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="btn-primary cursor-pointer"
          >
            <Plus size={15} />
            <span className="hidden sm:inline">Add contract</span>
          </button>
        }
      />

      {error && !data ? (
        <ErrorState error={error} onRetry={refetch} />
      ) : !initialLoad && options.length === 0 ? (
        <Surface>
          <EmptyState
            icon={Layers}
            title={`No ${mode} contracts`}
            description="Track calls and puts with breakeven, moneyness and days-to-expiry warnings."
            action={
              <button
                type="button"
                onClick={() => setModalOpen(true)}
                className="btn-primary cursor-pointer"
              >
                <Plus size={15} />
                Add a contract
              </button>
            }
          />
        </Surface>
      ) : (
        <>
          <RiskSummary options={options} loading={initialLoad} />

          {initialLoad ? (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-[290px] w-full rounded-card" />
              ))}
            </div>
          ) : (
            <>
              {options.length > 1 ? (
                <div className="mb-4">
                  <ExpirationTimeline options={options} />
                </div>
              ) : null}

              <StaggerGroup
                className="grid gap-4 md:grid-cols-2 xl:grid-cols-3"
                stagger={0.04}
              >
                {sorted.map((option) => (
                  <StaggerItem key={option.id}>
                    <ContractCard
                      option={option}
                      onRemove={remove}
                      removing={deleting === option.id}
                    />
                  </StaggerItem>
                ))}
              </StaggerGroup>
            </>
          )}
        </>
      )}

      <AddOptionModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onAdded={() => refetch({ silent: true })}
      />
    </div>
  )
}
