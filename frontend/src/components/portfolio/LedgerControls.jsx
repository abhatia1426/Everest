import { Search } from 'lucide-react'

/**
 * Band 3 — search, sector pills, count. The design's exact composition:
 *
 *   search  230px, 999px radius, glass fill + hairline, 32px left inset for
 *           the icon, brand border on focus
 *   pills   `7px 13px`, 12px, transparent on a hairline until selected, then
 *           solid brand with a 18px brand glow
 *   count   11.5px tabular, right-aligned, "N of M" only while narrowed
 *
 * ONLY REAL FILTERS. The design's pill row is the sector list, and the sector
 * list is built from the holdings themselves — there is no taxonomy here that
 * the portfolio does not already contain.
 */
export function LedgerControls({ query, onQueryChange, sector, onSectorChange, sectors, count, total }) {
  const filtered = count !== total

  return (
    <div className="flex items-center gap-[9px]">
      <div className="relative flex shrink-0 items-center">
        <Search
          size={14}
          strokeWidth={1.8}
          className="pointer-events-none absolute left-[11px] text-text-tertiary"
          aria-hidden="true"
        />
        <input
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="Search holdings"
          aria-label="Search holdings"
          className="w-[230px] rounded-full text-[13px] text-text-primary outline-none
            transition-colors duration-150 focus:border-accent max-[660px]:w-[150px]"
          style={{
            padding: '8px 12px 8px 32px',
            background: 'var(--glass-soft)',
            border: '1px solid var(--glass-soft-border)',
            backdropFilter: 'blur(14px)',
            WebkitBackdropFilter: 'blur(14px)',
          }}
        />
      </div>

      <div
        className="flex min-w-0 flex-1 items-center gap-[5px] overflow-x-auto max-[820px]:hidden"
        style={{ scrollbarWidth: 'none' }}
      >
        {[['', 'All sectors'], ...sectors.map((name) => [name, name])].map(([value, label]) => {
          const active = value === sector
          return (
            <button
              key={label}
              type="button"
              aria-pressed={active}
              onClick={() => onSectorChange(value)}
              className={`shrink-0 cursor-pointer whitespace-nowrap rounded-full text-[12px]
                tracking-[-0.01em] transition-colors duration-150 ${
                  active ? 'font-bold' : 'font-medium hover:text-text-primary'
                }`}
              style={{
                padding: '7px 13px',
                background: active ? 'var(--accent-blue)' : 'transparent',
                color: active ? 'var(--brand-ink)' : 'var(--text-tertiary)',
                border: `1px solid ${active ? 'var(--accent-blue)' : 'var(--border)'}`,
                boxShadow: active ? '0 8px 18px -12px var(--accent-blue)' : 'none',
              }}
            >
              {label}
            </button>
          )
        })}
      </div>

      {/* On narrow viewports the pill row is gone, so the count takes the
          space rather than the search input stretching into it. */}
      <div className="hidden flex-1 max-[820px]:block" />

      <span className="num shrink-0 text-[11.5px] text-text-tertiary">
        {filtered ? `${count} of ${total}` : `${total} ${total === 1 ? 'position' : 'positions'}`}
      </span>
    </div>
  )
}
