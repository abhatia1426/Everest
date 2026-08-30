import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { Clock, CornerDownLeft, Search, TrendingUp, X } from 'lucide-react'

import { SearchResult } from './SearchResult'
import { useListNavigation, useSearchContext } from '../../hooks/useSearch'
import {
  SEARCH_STATUS,
  searchStatusMessage,
  useAssetSearch,
} from '../../hooks/useAssetSearch'

const EASE = [0.16, 1, 0.3, 1]

function SectionLabel({ icon: Icon, children, action }) {
  return (
    <div className="flex items-center justify-between px-3 pb-1.5 pt-3">
      <span className="t-eyebrow flex items-center gap-1.5">
        <Icon size={12} />
        {children}
      </span>
      {action}
    </div>
  )
}

function Kbd({ children }) {
  return (
    <kbd
      className="surface-1 !rounded px-1.5 py-0.5 font-sans text-[10px] font-semibold text-text-tertiary"
    >
      {children}
    </kbd>
  )
}

/**
 * Spotlight-style global stock search.
 *
 * Mounted once inside the authenticated shell. Opening is owned by
 * SearchProvider (Cmd/Ctrl+K), so any screen can trigger it without wiring.
 */
export function CommandPalette() {
  const { isOpen, close } = useSearchContext()
  const reduceMotion = useReducedMotion()

  return createPortal(
    <AnimatePresence>
      {isOpen ? (
        <div className="fixed inset-0 z-[60] flex items-start justify-center px-4 pt-[12vh]">
          <motion.div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            initial={reduceMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={reduceMotion ? undefined : { opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={close}
            aria-hidden="true"
          />
          {/* Body mounts only while open, so query and selection reset by
              unmounting rather than by a synchronising effect. */}
          <PaletteBody reduceMotion={reduceMotion} />
        </div>
      ) : null}
    </AnimatePresence>,
    document.body,
  )
}

function PaletteBody({ reduceMotion }) {
  const { close, recents, popular, addRecent, clearRecents } = useSearchContext()
  const navigate = useNavigate()

  const [query, setQuery] = useState('')
  const inputRef = useRef(null)
  const listRef = useRef(null)

  const { results: matches, status, minLength } = useAssetSearch(query, { limit: 8 })

  // With no query the palette is a launcher: recents first, then popular.
  const isBrowsing = query.trim().length === 0
  const browseItems = useMemo(() => {
    const seen = new Set(recents.map((e) => e.ticker))
    return [
      ...recents.map((equity) => ({ equity, group: 'recent' })),
      ...popular.filter((e) => !seen.has(e.ticker)).map((equity) => ({ equity, group: 'popular' })),
    ]
  }, [recents, popular])

  const items = isBrowsing
    ? browseItems
    : matches.map((m) => ({
        equity: m.equity,
        tickerRanges: m.tickerRanges,
        nameRanges: m.nameRanges,
      }))

  const select = useCallback(
    (equity) => {
      if (!equity) return
      addRecent(equity.ticker)
      close()
      navigate(`/app/ticker/${equity.ticker}`)
    },
    [addRecent, close, navigate],
  )

  const { activeIndex, setActiveIndex, onKeyDown } = useListNavigation(items.length, {
    onSelect: (index) => select(items[index]?.equity),
  })

  // Focus after the entrance frame so the caret does not jump.
  useEffect(() => {
    const frame = requestAnimationFrame(() => inputRef.current?.focus())
    return () => cancelAnimationFrame(frame)
  }, [])

  // Scroll lock for as long as the body is mounted.
  useEffect(() => {
    const { overflow } = document.body.style
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = overflow
    }
  }, [])

  // Keep the active row in view during keyboard traversal.
  useEffect(() => {
    listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex, items.length])

  const handleKeyDown = (event) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      close()
      return
    }
    onKeyDown(event)
  }

  // Free-text fallback: any 1-5 letter entry is navigable even off-dataset.
  const rawSymbol = query.trim().toUpperCase()
  const canUseRaw =
    /^[A-Z]{1,5}$/.test(rawSymbol) && !items.some((i) => i.equity.ticker === rawSymbol)

  return (
    <motion.div
      role="dialog"
      aria-modal="true"
      aria-label="Search stocks"
      initial={reduceMotion ? false : { opacity: 0, scale: 0.97, y: -8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={reduceMotion ? undefined : { opacity: 0, scale: 0.97, y: -8 }}
      transition={{ duration: 0.18, ease: EASE }}
      onKeyDown={handleKeyDown}
      className="relative w-full max-w-xl overflow-hidden rounded-card border border-glass"
      style={{
        background: 'var(--chrome-bg)',
        backdropFilter: 'var(--glass-blur)',
        WebkitBackdropFilter: 'var(--glass-blur)',
        boxShadow: '0 24px 64px rgba(0,0,0,0.35), 0 0 0 1px var(--glass-border)',
      }}
    >
      {/* Input */}
      <div className="flex items-center gap-3 border-b border-subtle px-4">
        <Search size={17} className="shrink-0 text-text-secondary" />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search stocks by name or ticker"
          aria-label="Search stocks by name or ticker"
          role="combobox"
          aria-expanded="true"
          aria-controls="palette-results"
          aria-activedescendant={items.length ? `palette-option-${activeIndex}` : undefined}
          autoComplete="off"
          spellCheck="false"
          className="w-full bg-transparent py-4 text-[15px] text-text-primary
                  placeholder:text-text-secondary focus:outline-none"
        />
        <button
          type="button"
          onClick={close}
          aria-label="Close search"
          className="grid h-8 w-8 shrink-0 cursor-pointer place-items-center rounded-lg
                  text-text-secondary transition-colors duration-150 hover:bg-tint/[0.06]
                  hover:text-text-primary"
        >
          <X size={15} />
        </button>
      </div>

      {/* Results */}
      <div ref={listRef} className="max-h-[52vh] overflow-y-auto p-1.5">
        {isBrowsing && recents.length > 0 ? (
          <SectionLabel
            icon={Clock}
            action={
              <button
                type="button"
                onClick={clearRecents}
                className="cursor-pointer text-[11px] font-semibold text-text-secondary
                        transition-colors duration-150 hover:text-text-primary"
              >
                Clear
              </button>
            }
          >
            Recent
          </SectionLabel>
        ) : null}

        <ul id="palette-results" role="listbox" aria-label="Search results">
          {items.map((item, index) => (
            <div key={item.equity.ticker}>
              {isBrowsing && index === recents.length && recents.length >= 0 ? (
                <SectionLabel icon={TrendingUp}>Popular</SectionLabel>
              ) : null}
              <SearchResult
                id={`palette-option-${index}`}
                equity={item.equity}
                tickerRanges={item.tickerRanges}
                nameRanges={item.nameRanges}
                active={index === activeIndex}
                onSelect={select}
                onHover={() => setActiveIndex(index)}
                trailing={
                  index === activeIndex ? (
                    <CornerDownLeft size={14} className="shrink-0 text-text-secondary" />
                  ) : null
                }
              />
            </div>
          ))}
        </ul>

        {!isBrowsing && items.length === 0 ? (
          <div className="px-4 py-10 text-center">
            <p className="text-sm font-semibold text-text-primary">
              {status === SEARCH_STATUS.EMPTY
                ? `No matches for “${query.trim()}”`
                : searchStatusMessage(status, { minLength })}
            </p>
            <p className="mt-1.5 text-xs text-text-secondary">
              {status === SEARCH_STATUS.TOO_SHORT
                ? 'Company names and tickers are matched from two characters.'
                : status === SEARCH_STATUS.PENDING
                  ? '\u00a0'
                  : canUseRaw
                    ? 'Not in our directory — you can still open it directly.'
                    : 'Try a company name or a 1-5 letter ticker.'}
            </p>
            {canUseRaw && status === SEARCH_STATUS.EMPTY ? (
              <button
                type="button"
                onClick={() => select({ ticker: rawSymbol, name: rawSymbol })}
                className="btn-ghost mt-4 cursor-pointer"
              >
                Open {rawSymbol}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      {/* Footer hints */}
      <div className="flex items-center justify-between border-t border-subtle px-4 py-2.5">
        <span className="flex items-center gap-3 text-[11px] text-text-secondary">
          <span className="flex items-center gap-1">
            <Kbd>↑</Kbd>
            <Kbd>↓</Kbd> navigate
          </span>
          <span className="flex items-center gap-1">
            <Kbd>↵</Kbd> open
          </span>
          <span className="flex items-center gap-1">
            <Kbd>esc</Kbd> close
          </span>
        </span>
        <span className="text-[11px] text-text-secondary">
          {items.length} result{items.length === 1 ? '' : 's'}
        </span>
      </div>
    </motion.div>
  )
}
