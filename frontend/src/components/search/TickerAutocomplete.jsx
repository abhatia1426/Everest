import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { Search } from 'lucide-react'

import { SearchResult } from './SearchResult'
import { CompanyLogo } from '../ui/CompanyLogo'
import { useListNavigation } from '../../hooks/useSearch'
import {
  SEARCH_STATUS,
  searchStatusMessage,
  useAssetSearch,
} from '../../hooks/useAssetSearch'
import { getEquity } from '../../lib/equitySource'

const EASE = [0.16, 1, 0.3, 1]
const TICKER_PATTERN = /^[A-Za-z]{1,5}$/

/**
 * Combobox for picking a symbol.
 *
 * Controlled: the parent owns `value` (the raw ticker string) so form
 * submission works exactly as it did with a plain input. Selecting a result
 * simply writes the ticker back — symbols outside the local dataset are always
 * accepted, so the field never blocks a valid trade.
 */
export function TickerAutocomplete({
  value,
  onChange,
  onSelectEquity,
  id,
  label = 'Ticker',
  placeholder = 'Search name or ticker',
  autoFocus = false,
  describedBy,
}) {
  const reactId = useId().replace(/:/g, '')
  const fieldId = id || `ticker-${reactId}`
  const listId = `${fieldId}-listbox`

  const [isOpen, setOpen] = useState(false)
  const [touched, setTouched] = useState(false)
  const containerRef = useRef(null)
  const reduceMotion = useReducedMotion()

  const { results, status, minLength } = useAssetSearch(value, { limit: 6 })
  const selected = getEquity(value)

  const choose = useCallback(
    (equity) => {
      if (!equity) return
      onChange(equity.ticker)
      onSelectEquity?.(equity)
      setOpen(false)
    },
    [onChange, onSelectEquity],
  )

  const { activeIndex, setActiveIndex, onKeyDown } = useListNavigation(results.length, {
    onSelect: (index) => choose(results[index]?.equity),
    enabled: isOpen && results.length > 0,
  })

  // Close on outside click.
  useEffect(() => {
    if (!isOpen) return undefined
    const onPointerDown = (event) => {
      if (!containerRef.current?.contains(event.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [isOpen])

  const handleKeyDown = (event) => {
    if (event.key === 'Escape' && isOpen) {
      // Swallow Escape only while the list is open, so it does not also close
      // the surrounding modal in the same keystroke.
      event.preventDefault()
      event.stopPropagation()
      setOpen(false)
      return
    }
    if (!isOpen && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
      setOpen(true)
      return
    }
    // Enter with nothing highlighted should submit the form, not be swallowed.
    if (event.key === 'Enter' && (!isOpen || results.length === 0)) return
    onKeyDown(event)
  }

  const hasResults = results.length > 0
  const statusMessage = searchStatusMessage(status, { minLength })
  // Open for results, or to explain why there are none. IDLE stays closed —
  // a dropdown that only says "search by name" the moment you focus is noise.
  const showList = isOpen && touched && hasResults
  const showStatus =
    isOpen && touched && !hasResults && status !== SEARCH_STATUS.IDLE && Boolean(statusMessage)
  // Only once the query is long enough to have actually been searched.
  // Below the threshold nothing has been looked up, so claiming the symbol is
  // "not in our directory" contradicts the "type at least N characters"
  // message rendered directly beneath it.
  const showUnknownHint =
    touched &&
    !selected &&
    status !== SEARCH_STATUS.TOO_SHORT &&
    status !== SEARCH_STATUS.PENDING &&
    TICKER_PATTERN.test(value.trim())

  return (
    <div ref={containerRef} className="relative">
      <label htmlFor={fieldId} className="label">
        {label}
      </label>

      <div className="relative">
        <Search
          size={15}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary"
        />
        <input
          id={fieldId}
          value={value}
          onChange={(e) => {
            onChange(e.target.value)
            setTouched(true)
            setOpen(true)
            setActiveIndex(0)
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          role="combobox"
          aria-expanded={showList || showStatus}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={showList ? `${fieldId}-option-${activeIndex}` : undefined}
          aria-describedby={describedBy}
          autoComplete="off"
          spellCheck="false"
          // No maxLength. It used to be 5 (ticker-sized) while the placeholder
          // invited a company name, so "Microsoft" was untypeable.
          placeholder={placeholder}
          // eslint-disable-next-line jsx-a11y/no-autofocus
          autoFocus={autoFocus}
          className="input pl-9"
        />
        {selected ? (
          <span className="absolute right-2.5 top-1/2 -translate-y-1/2">
            <CompanyLogo ticker={selected.ticker} name={selected.name} size={24} />
          </span>
        ) : null}
      </div>

      {/* Resolved company confirmation — reassurance before submitting. */}
      {selected ? (
        <p className="mt-1.5 truncate text-xs text-text-secondary">
          {selected.name}
          {selected.sector ? ` · ${selected.sector}` : ''}
        </p>
      ) : showUnknownHint ? (
        <p className="mt-1.5 text-xs text-text-secondary">
          Not in our directory — {value.trim().toUpperCase()} will still be saved.
        </p>
      ) : null}

      <AnimatePresence>
        {showList ? (
          <motion.ul
            id={listId}
            role="listbox"
            aria-label="Matching stocks"
            initial={reduceMotion ? false : { opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduceMotion ? undefined : { opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.16, ease: EASE }}
            className="absolute left-0 right-0 z-50 mt-2 max-h-64 overflow-y-auto rounded-panel
              border border-glass p-1.5"
            style={{
              background: 'var(--chrome-bg)',
              backdropFilter: 'var(--glass-blur)',
              WebkitBackdropFilter: 'var(--glass-blur)',
              boxShadow: '0 18px 48px rgba(0,0,0,0.30)',
            }}
          >
            {results.map((result, index) => (
              <SearchResult
                key={result.equity.ticker}
                id={`${fieldId}-option-${index}`}
                equity={result.equity}
                tickerRanges={result.tickerRanges}
                nameRanges={result.nameRanges}
                active={index === activeIndex}
                onSelect={choose}
                onHover={() => setActiveIndex(index)}
              />
            ))}
          </motion.ul>
        ) : showStatus ? (
          /* Same surface as the results list, so the field never silently
             shows nothing — it always says which of the four states it is in. */
          <motion.div
            initial={reduceMotion ? false : { opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduceMotion ? undefined : { opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.16, ease: EASE }}
            className="absolute left-0 right-0 z-50 mt-2 rounded-panel border border-glass px-3.5 py-3
              text-[12px] text-text-secondary"
            style={{
              background: 'var(--chrome-bg)',
              backdropFilter: 'var(--glass-blur)',
              WebkitBackdropFilter: 'var(--glass-blur)',
              boxShadow: '0 18px 48px rgba(0,0,0,0.30)',
            }}
            role="status"
          >
            {statusMessage}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  )
}
