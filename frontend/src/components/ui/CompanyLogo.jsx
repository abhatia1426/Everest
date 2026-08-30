import { useMemo, useState } from 'react'

import { initialsFor } from '../../lib/equities'
import { brandColor } from '../../lib/brandColors'
import { logoSources, recordFailure, recordSuccess } from '../../lib/logos'
import { SECTOR_COLORS } from '../../lib/format'

/**
 * Company mark. Presentation only — every decision about *which* URL to try
 * lives in `lib/logos`, so this component never grows provider knowledge.
 *
 * The monogram is not a placeholder, it is the floor. It renders first and
 * stays mounted underneath; a successfully loaded logo fades in on top of it.
 * That ordering is what guarantees the three properties we need on a
 * data-dense screen:
 *
 *   · the box is the same size in every state, so rows never reflow
 *   · a failed load reveals a designed mark, never a broken-image icon
 *   · there is no empty flash while the network is in flight
 */
export function CompanyLogo({ ticker, name, domain = null, size = 36, className = '' }) {
  // Candidate URLs are keyed by symbol; `index` walks them on each error.
  const sources = useMemo(
    () => logoSources(ticker, { domain, size }),
    [ticker, domain, size],
  )
  const [index, setIndex] = useState(0)
  const [loaded, setLoaded] = useState(false)

  // A new symbol (list reuse on re-sort, route change) must restart the walk,
  // or the row inherits the previous company's exhausted state and renders a
  // monogram for a ticker we do have a logo for.
  //
  // Adjusted during render rather than in an effect: React re-runs this
  // component immediately with the corrected state and never commits the stale
  // frame, so there is no flash of the wrong logo. An effect would paint first.
  const identity = `${ticker}|${domain || ''}`
  const [prevIdentity, setPrevIdentity] = useState(identity)
  if (prevIdentity !== identity) {
    setPrevIdentity(identity)
    setIndex(0)
    setLoaded(false)
  }

  const { initials, color, branded } = useMemo(() => {
    const symbol = String(ticker || '')
    const brand = brandColor(symbol)

    if (brand) {
      return { initials: initialsFor(name, ticker), color: brand, branded: true }
    }

    // No mapping: deterministic colour so the same symbol always looks the same.
    let hash = 0
    for (let i = 0; i < symbol.length; i += 1) {
      hash = (hash * 31 + symbol.charCodeAt(i)) >>> 0
    }
    return {
      initials: initialsFor(name, ticker),
      color: SECTOR_COLORS[hash % SECTOR_COLORS.length],
      branded: false,
    }
  }, [ticker, name])

  const src = sources[index] || null
  const radius = Math.max(6, size * 0.26)

  const handleError = () => {
    if (index + 1 < sources.length) {
      setIndex(index + 1)
      return
    }
    // Every provider missed — tell the service so the next mount skips straight
    // to the monogram instead of repeating these requests.
    recordFailure(ticker)
    setIndex(sources.length)
  }

  const handleLoaded = (url) => {
    setLoaded(true)
    recordSuccess(ticker, url)
  }

  /**
   * Ref callback that catches an ALREADY-COMPLETE image.
   *
   * `onLoad` does not fire for an image the browser served from its HTTP cache
   * before React attached the handler — and on a dashboard the same logo is
   * mounted in several panels, so from the second one onward it is always
   * cached. The symptom is brutal to diagnose: the network shows 200s, the
   * element is in the DOM with a real naturalWidth, and it sits at opacity 0
   * forever behind the monogram.
   *
   * `naturalWidth > 0` distinguishes a decoded image from one that completed
   * by failing.
   */
  const attachImage = (node) => {
    if (node && node.complete && node.naturalWidth > 0 && !loaded) {
      handleLoaded(node.currentSrc || node.src)
    }
  }

  return (
    <span
      className={`relative grid shrink-0 place-items-center overflow-hidden font-bold ${className}`}
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        fontSize: Math.max(9, size * 0.36),
        letterSpacing: '-0.03em',
        // Branded marks get a richer fill so they read as identity, not chrome.
        background: branded
          ? `linear-gradient(150deg, ${color}2b, ${color}12)`
          : `${color}1f`,
        color,
        border: `1px solid ${color}${branded ? '3d' : '2b'}`,
      }}
      aria-hidden="true"
    >
      <span className="select-none leading-none">{initials}</span>

      {src ? (
        <img
          ref={attachImage}
          src={src}
          alt=""
          // NOT lazy: these are 28-40px marks inside content the user is
          // already looking at, so deferring them buys nothing and delays the
          // one thing that makes a row feel like a real product.
          decoding="async"
          onLoad={(event) => handleLoaded(event.currentTarget.currentSrc || src)}
          onError={handleError}
          // Absolute so the monogram keeps the box sized while this loads, and
          // opacity (not conditional mounting) so the swap is a fade, not a cut.
          className="absolute inset-0 h-full w-full object-contain transition-opacity duration-300"
          style={{
            opacity: loaded ? 1 : 0,
            // A white pad keeps dark wordmarks legible on a dark card without
            // us needing to know anything about the individual asset.
            background: loaded ? '#fff' : 'transparent',
            padding: Math.round(size * 0.14),
            borderRadius: radius,
          }}
        />
      ) : null}
    </span>
  )
}
