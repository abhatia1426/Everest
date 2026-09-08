import { useCallback, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Layers, Plus, Trash2 } from 'lucide-react'

import { AddOptionModal } from '../../components/AddOptionModal'
import { StaggerGroup, StaggerItem } from '../../components/Motion'
import { EmptyState, ErrorState } from '../../components/States'
import { ContractWorkspace } from '../../components/options/ContractWorkspace'
import { OptionsBand } from '../../components/options/OptionsBand'
import { SelectedContract } from '../../components/options/SelectedContract'
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
import { ESTIMATE_DISCLOSURE, bookTotals, contractView, workspaceCohorts } from '../../lib/options'

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
 * The standalone Options page is an expiry runway and contract workspace
 * instead, for the reasons documented on the page below.
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


/* --------------------------------------------------------------- page head */

/**
 * The design's page head, minus the parts the app shell already draws.
 *
 * The shell's chrome carries the route title ("Options"), the nav, the account
 * chip and the theme toggle — redrawing an <h1>Options</h1> here would put the
 * same word on the screen twice. What IS page-level, and is therefore drawn:
 * the status language, the count, the estimator disclosure and Add contract.
 */
function OptionsHead({ count, expiries, onAdd }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2.5">
          <span
            className="rounded-full text-[10.5px] font-bold uppercase tracking-[0.05em] text-accent"
            style={{ padding: '3px 9px', background: 'rgb(var(--accent-blue-rgb) / 0.14)' }}
          >
            Tracked positions
          </span>
          <span
            className="num rounded-full text-[11px] font-semibold text-text-secondary"
            style={{ padding: '3px 9px', background: 'var(--nested-bg)' }}
          >
            {count} open {count === 1 ? 'contract' : 'contracts'} ·{' '}
            {expiries} {expiries === 1 ? 'expiry' : 'expiries'}
          </span>
        </div>

        {/*
          THE DISCLOSURE IS NOT OPTIONAL AND NOT A TOOLTIP-ONLY. Every money
          figure on this page is an estimate produced by a deliberately crude
          formula; a page that shows contract values without saying so reads as
          a broker's position screen.
        */}
        <p className="mt-1.5 flex max-w-[760px] items-center gap-[7px] text-[12.5px] text-text-tertiary">
          Contracts you track yourself. Every value here is an estimate, not a live option quote.
          <span
            title={ESTIMATE_DISCLOSURE}
            className="flex h-[15px] w-[15px] shrink-0 cursor-help items-center justify-center
              rounded-full text-[9.5px] font-extrabold text-text-secondary"
            style={{ border: '1px solid var(--border-strong)' }}
          >
            i
          </span>
        </p>
      </div>

      <button
        type="button"
        onClick={onAdd}
        className="flex shrink-0 cursor-pointer items-center gap-[7px] rounded-full text-[13px]
          font-bold tracking-[-0.01em] transition-colors duration-150"
        style={{
          padding: '10px 18px',
          background: 'var(--accent-blue)',
          color: 'var(--brand-ink)',
          boxShadow: '0 8px 20px -10px var(--accent-blue)',
        }}
      >
        <Plus size={13} strokeWidth={2.4} />
        <span className="max-[420px]:hidden">Add contract</span>
      </button>
    </div>
  )
}

/* -------------------------------------------------------------------- page */

/**
 * Options, composed to the approved `Everest Options.dc.html`.
 *
 * THE PAGE IS AN EXPIRY RUNWAY AND A TRACKED-CONTRACT WORKSPACE. It is not an
 * options chain, not a trading terminal, not a strategy builder and not a
 * Greeks dashboard. Everest stores long-only contracts the user typed in and
 * prices them with a crude estimator; the page is built to be exactly that,
 * truthfully, rather than to resemble a brokerage screen it cannot back.
 *
 * THREE BANDS, in the design's order:
 *
 *   1. book totals beside the expiry runway — value, estimated P/L, capital at
 *      risk, calls/puts, nearest expiry, and every contract on one time axis
 *   2. the contract workspace — filters, sorts, and rows grouped into expiry
 *      cohorts, each row centred on a strike/breakeven meter
 *   3. the selected-contract stage
 *
 * WHAT THE DESIGN DRAWS THAT THIS DOES NOT, and why:
 *
 * · The mockup's estimator tooltip claims the time premium "fades as the
 *   underlying moves away from the strike". The real estimator
 *   (`services/market.estimate_option_value`) is intrinsic value plus a flat
 *   12%-a-year charge on the underlying prorated by days left, with NO
 *   dependence on distance from the strike. The copy was corrected to describe
 *   the code; the code was not changed to flatter the copy. See
 *   `ESTIMATE_DISCLOSURE`.
 * · The mockup's nav, account chip, theme toggle and page title belong to the
 *   app shell, which already draws them.
 * · No Greeks, no implied volatility, no bid/ask, no open interest, no chain,
 *   no probability of profit, no assignment probability. The API returns none
 *   of them and rendering zeros would look like measurement.
 *
 * A CONTRACT WITH NO UNDERLYING QUOTE is not valued at zero. `est_value` comes
 * back null, the row and the stage say so, and it is excluded from the book's
 * estimated total rather than dragging it down by its own absence.
 */
export default function Options() {
  const { mode } = useMode()
  const toast = useToast()
  const fetcher = useCallback(() => api.options({ mode }), [mode])
  const { data, loading, error, refetch } = useApi(fetcher, [mode], {
    key: `options:${mode}`,
    ttl: TTL.PORTFOLIO,
    pollMs: 60000,
  })

  const [modalOpen, setModalOpen] = useState(false)
  const [deleting, setDeleting] = useState(null)
  const [filter, setFilter] = useState('All')
  const [sort, setSort] = useState('Soonest')
  const [chosen, setChosen] = useState(null)

  const options = useMemo(() => data?.options || [], [data])

  /** One derived view per contract, shared by all three bands. */
  const views = useMemo(() => options.map(contractView), [options])
  const totals = useMemo(() => bookTotals(views), [views])

  const { cohorts, count: shown } = useMemo(
    () => workspaceCohorts(views, { filter, sort }),
    [views, filter, sort],
  )

  const horizon = useMemo(
    () => (views.length ? Math.max(...views.map((view) => Math.max(view.dte, 0))) : 0),
    [views],
  )

  /**
   * The selected contract. `chosen` is only a preference: if the contract is
   * removed, or filtered out, the stage falls back to the first visible row
   * rather than emptying — the stage is never blank while the book has rows.
   */
  const selected = useMemo(() => {
    const visible = cohorts.flatMap((cohort) => cohort.rows)
    const preferred = views.find((view) => view.id === chosen)
    if (preferred && visible.some((view) => view.id === chosen)) return preferred
    return visible[0] || views[0] || null
  }, [cohorts, views, chosen])

  const remove = async (id, ticker) => {
    setDeleting(id)
    try {
      await api.deleteOption(id)
      invalidate('options')
      await refetch({ silent: true, force: true })
      if (chosen === id) setChosen(null)
      toast.success(`${ticker} contract removed`, 'Everest has stopped tracking it.')
    } catch (err) {
      toast.error('Could not remove contract', err.message)
    } finally {
      setDeleting(null)
    }
  }

  const initialLoad = loading && !data

  if (error && !data) return <ErrorState error={error} onRetry={refetch} />

  if (!initialLoad && options.length === 0) {
    return (
      <>
        <Surface>
          <EmptyState
            icon={Layers}
            title={`No ${mode} contracts`}
            description="Track calls and puts you already hold. Everest shows each one's expiry runway, strike and breakeven distance, and an estimated value — it does not place trades or quote options."
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
        <AddOptionModal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          onAdded={() => refetch({ silent: true, force: true })}
        />
      </>
    )
  }

  return (
    <StaggerGroup className="flex flex-col gap-3">
      <StaggerItem>
        <OptionsHead
          count={options.length}
          expiries={totals.expiries}
          onAdd={() => setModalOpen(true)}
        />
      </StaggerItem>

      <StaggerItem>
        <OptionsBand
          views={views}
          totals={totals}
          selectedId={selected?.id}
          onSelect={setChosen}
          loading={initialLoad}
        />
      </StaggerItem>

      {/*
        The approved lower grid: workspace beside a 356px stage, single column
        at 1320px where the stage also stops being sticky. `min-w-0` on the
        workspace keeps a wide row from widening the page instead of scrolling
        inside its own panel.
      */}
      <StaggerItem
        className="grid items-start gap-3
          [grid-template-columns:minmax(0,1fr)_356px]
          max-[1320px]:[grid-template-columns:minmax(0,1fr)]"
      >
        <ContractWorkspace
          cohorts={cohorts}
          shown={shown}
          total={views.length}
          filter={filter}
          onFilter={setFilter}
          sort={sort}
          onSort={setSort}
          selectedId={selected?.id}
          onSelect={setChosen}
          loading={initialLoad}
        />

        {selected ? (
          <SelectedContract
            view={selected}
            horizon={horizon}
            onRemove={remove}
            removing={deleting === selected.id}
          />
        ) : null}
      </StaggerItem>

      <AddOptionModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onAdded={() => refetch({ silent: true, force: true })}
      />
    </StaggerGroup>
  )
}
