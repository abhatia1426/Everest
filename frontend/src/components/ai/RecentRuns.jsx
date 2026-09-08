import { Surface } from '../ui/Surface'
import { fmtRelative } from '../../lib/format'
import { getTool } from '../../lib/aiTools'

/**
 * Recent runs.
 *
 * These are REAL runs from this browser's history, restored whole — the stored
 * result is re-rendered rather than re-requested, so revisiting one costs no
 * quota and cannot quietly return different prose than the entry claims.
 *
 * The subtitle records the inputs that produced the run, because "Rank my
 * watchlist" twice with different styles is two different answers and the list
 * has to be able to tell them apart.
 */
export function RecentRuns({ history, onRestore, onClear }) {
  return (
    <Surface as="section" className="overflow-hidden p-0">
      <header className="flex items-center gap-2.5 border-b border-subtle px-4 py-3 sm:px-5">
        <h2 className="t-eyebrow !text-text-tertiary">Recent runs</h2>
        {history.length ? (
          <button
            type="button"
            onClick={onClear}
            className="ml-auto cursor-pointer text-[11px] font-semibold text-text-tertiary
              transition-colors duration-150 hover:text-down"
          >
            Clear
          </button>
        ) : null}
      </header>

      {history.length === 0 ? (
        <p className="px-4 py-4 text-[11.5px] leading-relaxed text-text-tertiary sm:px-5">
          Runs appear here so you can revisit them without spending another request.
        </p>
      ) : (
        <ul className="p-2">
          {history.slice(0, 6).map((entry) => {
            const tool = getTool(entry.toolId)
            const Icon = tool?.icon
            return (
              <li key={entry.key}>
                <button
                  type="button"
                  onClick={() => onRestore(entry)}
                  className="flex w-full items-center gap-3 rounded-panel p-2.5 text-left
                    transition-colors duration-150 hover:bg-tint/[0.05]"
                >
                  <span className="grid h-[22px] w-[22px] shrink-0 place-items-center rounded-control bg-tint/[0.06] text-accent">
                    {Icon ? <Icon size={11} /> : null}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12px] font-semibold tracking-[-0.01em] text-text-primary">
                      {tool?.name || entry.toolName}
                    </span>
                    <span className="mt-px block truncate text-[10.5px] text-text-tertiary">
                      {describe(entry)}
                    </span>
                  </span>
                  <span className="shrink-0 whitespace-nowrap text-[10.5px] text-text-tertiary">
                    {fmtRelative(entry.at)}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </Surface>
  )
}

function describe(entry) {
  const values = entry.values || {}
  if (values.ticker) return values.ticker
  if ((values.tickers || []).length) return values.tickers.join(', ')
  if (values.style) return `${values.style} style`
  return 'Portfolio'
}
