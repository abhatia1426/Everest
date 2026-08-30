import { Search, X } from 'lucide-react'

import { Segmented } from './Segmented'

/**
 * The workspace toolbar — search, filter, sort, count.
 *
 * Shared by Portfolio, Watchlist and Options because those three pages ask the
 * same question in the same order ("narrow this list, then order it"), and a
 * user who learns the control once should not have to relearn it per page.
 *
 * Sits on the page rather than inside a card: it acts on the collection below
 * it, and wrapping it in its own surface would imply it were another data
 * panel competing with the content.
 */
export function Toolbar({
  query,
  onQueryChange,
  placeholder = 'Search',
  sorts,
  sort,
  onSortChange,
  filters,
  filter,
  onFilterChange,
  filterLabel = 'All',
  count,
  total,
  children,
}) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2.5">
      <div className="relative min-w-[200px] flex-1 sm:max-w-[280px]">
        <Search
          size={14}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary"
        />
        <input
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder={placeholder}
          aria-label={placeholder}
          className="input py-1.5 pl-9 pr-8 text-[13px]"
        />
        {query ? (
          <button
            type="button"
            onClick={() => onQueryChange('')}
            aria-label="Clear search"
            className="absolute right-2 top-1/2 grid h-6 w-6 -translate-y-1/2 cursor-pointer
              place-items-center rounded text-text-tertiary transition-colors duration-150
              hover:text-text-primary"
          >
            <X size={13} />
          </button>
        ) : null}
      </div>

      {filters?.length ? (
        <select
          value={filter}
          onChange={(event) => onFilterChange(event.target.value)}
          aria-label="Filter"
          className="input w-auto cursor-pointer py-1.5 pr-7 text-[13px]"
        >
          <option value="">{filterLabel}</option>
          {filters.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      ) : null}

      {sorts?.length ? (
        <Segmented label="Sort by" options={sorts} value={sort} onChange={onSortChange} size="sm" />
      ) : null}

      {children}

      {typeof count === 'number' ? (
        <span className="num ml-auto shrink-0 text-[11px] text-text-tertiary">
          {count === total ? `${total}` : `${count} of ${total}`}
        </span>
      ) : null}
    </div>
  )
}
