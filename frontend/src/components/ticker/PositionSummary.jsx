import { Link } from 'react-router-dom'

import { Panel } from '../ui/Surface'
import { QuoteBadge } from '../ui/QuoteBadge'
import { normalizeQuote } from '../../lib/quotes'
import { fmtMoney, fmtNumber, fmtPercent, fmtSignedMoney } from '../../lib/format'

/**
 * Your stake in the company being researched.
 *
 * This did not exist in v2, and its absence was the page's biggest gap: a
 * research page that cannot tell you whether you already own the stock — and
 * at what cost — is missing the single fact that most changes how you read
 * everything else on it.
 *
 * Renders nothing when there is no position. An empty "you own none of this"
 * card would be decoration occupying the rail's most valuable slot.
 */
export function PositionSummary({ position, mode }) {
  if (!position) return null

  const up = (position.unrealized_pnl ?? 0) >= 0
  // Same normaliser as every other price surface, so this panel cannot
  // disagree with the ledger about the same holding.
  const view = normalizeQuote(position, { costBasis: position.avg_cost })

  return (
    <Panel
      title={`Your position · ${mode}`}
      action={
        <Link
          to="/app/portfolio"
          className="cursor-pointer text-[11px] font-semibold text-accent transition-opacity
            duration-150 hover:opacity-80"
        >
          Manage
        </Link>
      }
    >
      <div className="flex items-baseline justify-between gap-3">
        <span className="num-hero text-[26px] text-text-primary">
          {fmtMoney(position.market_value)}
        </span>
        <span className={`num text-right text-[13px] font-bold ${up ? 'text-up' : 'text-down'}`}>
          {fmtSignedMoney(position.unrealized_pnl)}
          <span className="block text-[11px] font-semibold">
            {fmtPercent(position.pnl_percent)}
          </span>
        </span>
      </div>

      <dl
        className="mt-4 space-y-2 border-t pt-3"
        style={{ borderColor: 'var(--border)' }}
      >
        {[
          ['Shares', fmtNumber(position.qty, position.qty % 1 === 0 ? 0 : 2)],
          ['Average cost', fmtMoney(position.avg_cost)],
          ['Cost basis', fmtMoney(position.cost_basis)],
        ].map(([label, value]) => (
          <div key={label} className="flex items-baseline justify-between gap-3">
            <dt className="text-[11.5px] text-text-secondary">{label}</dt>
            <dd className="num text-[12.5px] font-semibold text-text-primary">{value}</dd>
          </div>
        ))}
      </dl>

      <QuoteBadge quote={view} className="mt-3" />
    </Panel>
  )
}

/** Company description. Lives in the rail rather than the main column: it is
 *  reference material you consult, not the thing you came to read. */
export function AboutCompany({ company, summary, sector, industry, exchange }) {
  return (
    <Panel title={`About ${company}`}>
      {summary ? (
        <p className="text-[12.5px] leading-relaxed text-text-secondary">{summary}</p>
      ) : (
        <p className="text-[12.5px] text-text-tertiary">No company description available.</p>
      )}

      <dl className="mt-4 space-y-2 border-t pt-3" style={{ borderColor: 'var(--border)' }}>
        {[
          ['Sector', sector],
          ['Industry', industry],
          ['Exchange', exchange],
        ].map(([label, value]) => (
          <div key={label} className="flex items-baseline justify-between gap-3">
            <dt className="shrink-0 text-[11.5px] text-text-secondary">{label}</dt>
            <dd className="truncate text-right text-[12px] font-medium text-text-primary">
              {value || '—'}
            </dd>
          </div>
        ))}
      </dl>
    </Panel>
  )
}
