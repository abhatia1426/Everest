/**
 * Everest brand system.
 *
 * THE MARK
 * A single summit built from one path with `fill-rule: evenodd`, so the
 * snowline is TRUE negative space rather than a shape filled with the
 * background colour. That is what lets it sit on any surface — a dark
 * terminal, a white deck, a favicon, an app icon — without a variant per
 * background.
 *
 * It is monochrome and driven entirely by `currentColor`. No gradients, no
 * two-tone treatment. The previous wordmark split "Ever" (accent blue) from
 * "est" (foreground), which reads as a consumer app and breaks the moment it
 * appears in a single-colour context: print, embroidery, a monochrome favicon,
 * an investor deck in greyscale.
 *
 * The geometry is deliberately austere — two straight ridges and a chevron
 * notch. Read quickly it is a peak; read slowly the notch is an upward step.
 * Elevation and ascent, which is the whole positioning, without a single
 * literal "adventure" cue.
 */

/**
 * The Everest mark.
 *
 * @param {number}  size    px. Tested down to 16.
 * @param {boolean} ridge   adds a secondary back ridge for depth. Off by
 *                          default because below ~24px it turns to mud.
 */
export function EverestMark({ size = 24, className = '', ridge = false, style }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      style={style}
      role="img"
      aria-label="Everest"
    >
      {ridge ? (
        // Back ridge. Purely atmospheric, and the first thing to go at small
        // sizes — it exists to give the large hero mark depth.
        <path
          d="M12.4 20.5 L17.2 11.4 L22.8 20.5 Z"
          fill="currentColor"
          opacity="0.28"
        />
      ) : null}

      {/*
        One path, two subpaths, evenodd: the outer summit and the chevron that
        punches through it. The notch sits just below the apex, at the
        proportion a snowline actually falls, which is what stops the mark
        reading as a generic triangle.
      */}
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M1.2 20.5 L9.6 4.2 L18 20.5 Z
           M9.6 9.6 L12.9 16.1 L9.6 14.2 L6.3 16.1 Z"
        fill="currentColor"
      />
    </svg>
  )
}

/**
 * The wordmark.
 *
 * Uppercase, wide tracking, single weight, one colour. Set in the product's
 * own sans so the brand and the interface are visibly the same system.
 * Tracking tightens as size grows — at hero scale the letter-spacing that
 * makes 14px legible reads as gaps.
 */
export function Wordmark({ className = '', size = 'text-[15px]', tracking = '0.2em' }) {
  return (
    <span
      className={`font-semibold uppercase ${size} ${className}`}
      style={{ letterSpacing: tracking }}
    >
      Everest
    </span>
  )
}

/**
 * Mark + wordmark, correctly aligned.
 *
 * The optical relationship between the two is fixed here so every surface —
 * nav, footer, auth, the app sidebar — uses the same lockup rather than each
 * re-deciding the gap and the relative sizes.
 */
export function Logo({ size = 20, className = '', wordmarkSize, tracking, showWordmark = true }) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <EverestMark size={size} />
      {showWordmark ? (
        <Wordmark
          size={wordmarkSize || (size >= 28 ? 'text-[19px]' : 'text-[14px]')}
          tracking={tracking}
        />
      ) : null}
    </span>
  )
}

/* ------------------------------------------------------------- legacy API */

/**
 * `PeakIcon` and `MountainPeak` are retained as thin aliases so the
 * authenticated app, auth pages and empty states keep working without a
 * sweeping edit. Both now render the new mark, so replacing the identity in
 * one file replaced it everywhere.
 */
export function PeakIcon({ size = 20, className = '', style }) {
  return <EverestMark size={size} className={className} style={style} />
}

export function MountainPeak({ size = 200, className = '', style }) {
  return <EverestMark size={size} className={className} style={style} ridge />
}
