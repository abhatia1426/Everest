import { memo } from 'react'

import { CompanyLogo } from '../ui/CompanyLogo'
import { highlightSegments } from '../../lib/fuzzy'

/** Renders text with matched characters emphasised. */
function Highlighted({ text, ranges }) {
  const segments = highlightSegments(text, ranges)

  return (
    <>
      {segments.map((segment, index) =>
        segment.match ? (
          <mark key={index} className="bg-transparent font-bold text-accent">
            {segment.text}
          </mark>
        ) : (
          <span key={index}>{segment.text}</span>
        ),
      )}
    </>
  )
}

/**
 * One row in any search surface — palette or autocomplete.
 *
 * Memoised because the palette re-renders the whole list on every arrow key;
 * only the two rows whose `active` flips should actually repaint.
 */
export const SearchResult = memo(function SearchResult({
  equity,
  tickerRanges = [],
  nameRanges = [],
  active = false,
  id,
  onSelect,
  onHover,
  trailing = null,
}) {
  return (
    // Keyboard interaction lives on the combobox input, which drives selection
    // via aria-activedescendant (WAI-ARIA combobox pattern). Focus deliberately
    // never moves to these options, so a key handler here would be unreachable.
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events
    <li
      id={id}
      role="option"
      aria-selected={active}
      onClick={() => onSelect?.(equity)}
      onMouseMove={onHover}
      className={`flex cursor-pointer items-center gap-3 rounded-control px-3 py-2.5
        transition-colors duration-200 ${active ? 'bg-accent/14' : 'hover:bg-tint/[0.05]'}`}
    >
      <CompanyLogo ticker={equity.ticker} name={equity.name} size={34} />

      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-2">
          <span className="truncate text-sm font-semibold text-text-primary">
            <Highlighted text={equity.name} ranges={nameRanges} />
          </span>
        </span>
        <span className="mt-0.5 flex items-center gap-1.5 text-xs text-text-secondary">
          <span className="num font-semibold">
            <Highlighted text={equity.ticker} ranges={tickerRanges} />
          </span>
          {/*
            NOTE: the local dataset carries ticker, name, sector and industry —
            there is no exchange field, and fetching one per result would mean a
            quote request per keystroke. Industry is shown instead: it is
            available, and it is more specific than sector.
          */}
          {equity.sector ? (
            <>
              <span aria-hidden="true">·</span>
              <span className="truncate">{equity.sector}</span>
            </>
          ) : null}
          {equity.industry && equity.industry !== equity.sector ? (
            <>
              <span aria-hidden="true" className="text-text-tertiary">·</span>
              <span className="truncate text-text-tertiary">{equity.industry}</span>
            </>
          ) : null}
        </span>
      </span>

      {trailing}
    </li>
  )
})
