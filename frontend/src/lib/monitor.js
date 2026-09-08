/**
 * The Watchlist monitor's arithmetic, as pure functions.
 *
 * Everything the board and the spectrum assert about a symbol is computed
 * here, deliberately away from React, for two reasons:
 *
 *   1. these are the claims the page makes — "near a 30-day high", "moving
 *      2.4x its normal day", "fading" — and a claim that can be unit-tested is
 *      a claim that can be checked against its own definition;
 *   2. Ticker Detail will need momentum and the 30-day range on the same terms.
 *      A second implementation there would be a second definition, and two
 *      pages could then disagree about whether the same symbol is gaining.
 *
 * THREE RULES HOLD THROUGHOUT:
 *
 *   · Nothing here invents a number. Every function returns `null` when its
 *     inputs cannot support an answer, and the UI renders an em dash rather
 *     than a plausible-looking figure.
 *   · There are no scores. Momentum is a comparison of two real returns;
 *     attention is a set of stated conditions. Neither is weighted, blended or
 *     normalised into a 0-100 number, because such a number would carry an
 *     opinion Everest has not earned.
 *   · A session is a DAY. These functions must be fed daily closes. Handing
 *     them intraday bars would make a "30-day low" a five-day low with a
 *     thirty-day label — see `/prices/sessions` for why that endpoint exists.
 */

/** Minimum sessions before a 30-day statement is a 30-day statement. */
export const SESSION_WINDOW = 30

/**
 * Momentum needs the 30-session window PLUS one prior close to measure the
 * first step of the older leg, so 31 is the real requirement.
 */
export const MOMENTUM_WINDOW = 31

/** Momentum states, in the approved vocabulary. There is no fourth. */
export const MOMENTUM = {
  GAINING: 'Gaining',
  STEADY: 'Steady',
  FADING: 'Fading',
}

/**
 * A daily rate difference below this reads as noise rather than a turn.
 * The approved definition's threshold, carried over unchanged.
 */
const MOMENTUM_EPSILON = 0.05

/** "Unusual" is twice the symbol's own normal day — its own scale, not a global one. */
const UNUSUAL_MULTIPLE = 2

/** How close to an extreme still counts as "near" it. */
const EXTREME_BAND = 0.03

function pct(from, to) {
  if (!from) return null
  return (to / from - 1) * 100
}

/** Finite closes only. A gap in a provider series must not become a zero. */
export function toCloses(candles) {
  if (!Array.isArray(candles)) return []
  const out = []
  for (const candle of candles) {
    const value = typeof candle === 'number' ? candle : candle?.close
    if (typeof value === 'number' && Number.isFinite(value)) out.push(value)
  }
  return out
}

/**
 * Clip a candle series to the requested named period.
 *
 * WHY THIS IS NOT A COSMETIC CONCERN. The history endpoint does not reliably
 * honour its own window: `?period=1m` has been observed returning five months
 * of hourly bars. A "1M" pill above a five-month line is a false statement
 * about what is plotted, and no caption can repair it — the control itself is
 * wrong. So the series is clipped here, on the client, to what the pill says.
 *
 * ANCHORED TO THE NEWEST DATA POINT, NOT `Date.now()`. Anchoring to the wall
 * clock would make the same fixture clip differently tomorrow, so this
 * function could not be tested and a stale series would silently clip to
 * nothing. The newest returned timestamp is the only anchor the data itself
 * supplies.
 *
 * NOTHING IS SYNTHESIZED. This only ever removes points. A period whose window
 * the provider simply did not cover comes back with fewer than two points, and
 * the caller renders an honest unavailable state rather than stretching a
 * shorter shape across a longer label.
 *
 * @param {Array<{time:string, close:number}>} candles oldest first
 * @param {number|null} days  window length; null means "everything returned"
 */
export function clipToPeriod(candles, days) {
  if (!Array.isArray(candles)) return []

  // Only points that carry BOTH a usable timestamp and a usable close: a point
  // we cannot date cannot be placed inside or outside the window.
  const dated = candles
    .map((candle) => {
      const at = new Date(candle?.time).getTime()
      const close = candle?.close
      return Number.isFinite(at) && typeof close === 'number' && Number.isFinite(close)
        ? { ...candle, at }
        : null
    })
    .filter(Boolean)

  if (!days || dated.length === 0) return dated

  const newest = Math.max(...dated.map((point) => point.at))
  const cutoff = newest - days * 86_400_000
  return dated.filter((point) => point.at >= cutoff)
}

/**
 * Momentum: the last 10 sessions' pace against the 20 before them.
 *
 * This is the approved definition, literally — a comparison of two REAL
 * returns, each divided by the number of sessions it spans so a 10-day move
 * and a 20-day move are compared per day rather than in total. A symbol up 4%
 * over ten days after being up 4% over the previous twenty is gaining, and
 * that is the whole claim.
 *
 * Returns `null` below 31 closes. Computing it from what happens to be
 * available would silently redefine "20 days" per symbol, so the shorter
 * series gets no momentum at all.
 *
 * @param {Array<number|{close:number}>} series daily closes, oldest first
 */
export function momentumOf(series) {
  const s = toCloses(series)
  if (s.length < MOMENTUM_WINDOW) return null

  const n = s.length
  const recent = pct(s[n - 11], s[n - 1]) // last 10 sessions
  const prior = pct(s[n - 31], s[n - 11]) // the 20 before them
  if (recent === null || prior === null) return null

  const recentRate = recent / 10
  const priorRate = prior / 20

  const label =
    recentRate > priorRate + MOMENTUM_EPSILON
      ? MOMENTUM.GAINING
      : recentRate < priorRate - MOMENTUM_EPSILON
        ? MOMENTUM.FADING
        : MOMENTUM.STEADY

  return { label, recent, prior, recentRate, priorRate }
}

/** The one sentence that explains a momentum state, in its own numbers. */
export function momentumWhy(momentum) {
  if (!momentum) return 'Not enough sessions to compare.'
  const sign = (v) => `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(2)}%`
  return `Last 10 sessions ${sign(momentum.recent)} vs the prior 20 at ${sign(momentum.prior)}`
}

/**
 * Position of a price inside its own 30-session range, 0 (low) to 1 (high).
 * Null when there is no range to sit in.
 */
export function rangePosition(price, low, high) {
  if (typeof price !== 'number' || typeof low !== 'number' || typeof high !== 'number') return null
  if (high === low) return null
  return Math.min(1, Math.max(0, (price - low) / (high - low)))
}

/**
 * The average size of this symbol's daily move over its window — "its normal
 * day". Mean absolute session-over-session change, in percent.
 */
export function averageDailyMove(series) {
  const s = toCloses(series)
  if (s.length < 2) return null
  let sum = 0
  let steps = 0
  for (let i = 1; i < s.length; i += 1) {
    if (!s[i - 1]) continue
    sum += Math.abs(s[i] / s[i - 1] - 1) * 100
    steps += 1
  }
  return steps ? sum / steps : null
}

/**
 * Attention — four STATED conditions, evaluated in order. Never a score.
 *
 * Each returns the literal reason it fired, in the symbol's own numbers, so a
 * badge on the board can always be answered with "because of what?". A symbol
 * meeting none of them is not "low attention"; it is simply not flagged, and
 * `null` says exactly that.
 *
 * Order matters: an unavailable quote outranks everything, because every other
 * condition is a statement about a price we do not have.
 */
export function attentionOf(row) {
  if (!row.hasQuote) {
    return { tag: 'No quote', reason: 'No current quote — showing the last close we hold' }
  }
  if (row.position !== null && row.position >= 1 - EXTREME_BAND) {
    return {
      tag: 'Near 30d high',
      reason: `Within 3% of its 30-session high of ${money(row.high)}`,
    }
  }
  if (row.position !== null && row.position <= EXTREME_BAND) {
    return {
      tag: 'Near 30d low',
      reason: `Within 3% of its 30-session low of ${money(row.low)}`,
    }
  }
  if (
    row.averageDaily &&
    typeof row.changePercent === 'number' &&
    Math.abs(row.changePercent) >= UNUSUAL_MULTIPLE * row.averageDaily
  ) {
    const multiple = Math.abs(row.changePercent) / row.averageDaily
    return {
      tag: 'Unusual move',
      reason: `Moving ${multiple.toFixed(1)}× its normal ${row.averageDaily.toFixed(2)}% day`,
    }
  }
  return null
}

function money(value) {
  if (typeof value !== 'number' || Number.isNaN(value)) return '—'
  return `$${value.toFixed(2)}`
}

/**
 * Fold a watchlist row and its daily closes into everything the board states.
 *
 * `quote` is the already-normalised view-model from `lib/quotes` — this
 * function never re-decides what a price means, it only reads the verdict.
 */
export function buildMonitorRow(item, candles, quote) {
  const closes = toCloses(candles)
  const window = closes.slice(-SESSION_WINDOW)
  const hasHistory = window.length >= 2

  const low = hasHistory ? Math.min(...window) : null
  const high = hasHistory ? Math.max(...window) : null

  // The price the range is read against: a market price when we have one,
  // otherwise the newest close we hold. Never a cost basis — this symbol may
  // not be owned at all.
  const hasQuote = quote.isMarketPrice || quote.state === 'cached'
  const price = hasQuote ? quote.price : (window[window.length - 1] ?? null)

  const changePercent = hasQuote ? quote.changePercent : null
  const change = hasQuote ? quote.change : null

  return {
    id: item.id,
    ticker: item.ticker,
    name: item.company || item.ticker,
    sector: item.sector && item.sector !== 'Unknown' ? item.sector : null,
    quote,
    hasQuote,
    price,
    change: typeof change === 'number' ? change : null,
    changePercent: typeof changePercent === 'number' ? changePercent : null,
    series: hasHistory ? window : null,
    low,
    high,
    position: rangePosition(price, low, high),
    averageDaily: hasHistory ? averageDailyMove(window) : null,
    return30: hasHistory ? pct(window[0], window[window.length - 1]) : null,
    momentum: momentumOf(closes),
  }
}

/** Attach the attention verdict once, so board and stage cannot disagree. */
export function withAttention(row) {
  return { ...row, attention: attentionOf(row) }
}

/* --------------------------------------------------------------- spectrum */

/*
 * Lane packing for Today's Moves.
 *
 * The approved layout gives the axis four lanes and places each pill at its
 * real percentage, which means collisions are the normal case rather than the
 * exception: a watchlist is usually clustered near zero. Lanes therefore store
 * an occupied RIGHT EDGE in track-percent, and a pill only takes a lane whose
 * edge its own left edge clears.
 *
 * When nothing clears, the pill first sheds its % figure — shrinking it — and
 * only then takes the roomiest lane. Overlap is the last resort, not the first
 * fallback.
 *
 * PILL WIDTH IS MEASURED IN PIXELS AND CONVERTED, not carried as a fixed
 * percentage. The approved file hard-codes 6.6% / 11%, which are those pills'
 * widths as a fraction of the DESKTOP track. A pill does not get narrower when
 * the window does — so on a 596px track those same pills are ~9.4% / ~15.6%,
 * the packer underestimates every one of them, and real overlaps appear. That
 * was measured: six colliding pairs at 660px. Width is therefore derived from
 * the ticker's own length and the track's real width.
 */
export const SPECTRUM_LANE_HEIGHT = 24
export const SPECTRUM_PILL_HEIGHT = 20

/**
 * The desktop track, used for the first paint before the plot has been
 * measured. Chosen so a full-width desktop render never starts on the narrow
 * lane count and then reflows.
 */
export const SPECTRUM_TRACK_WIDTH = 1436
export const SPECTRUM_LANES = 4

/**
 * Lane count by track width.
 *
 * A pill keeps its pixel width as the window narrows, so the SAME watchlist
 * needs more lanes on a smaller axis to stay collision-free — this is arithmetic,
 * not taste. The tiers were fitted to a real sixteen-symbol board: four lanes
 * hold it above ~1000px, six down to ~700px, eight below that. Above 1000px the
 * layout is bit-for-bit the approved desktop one.
 */
export const SPECTRUM_LANE_TIERS = [
  { minTrack: 1000, lanes: 4 },
  { minTrack: 700, lanes: 6 },
  { minTrack: 0, lanes: 8 },
]

/** Pill geometry in CSS pixels: 9px padding each side, ~7.6px per character. */
const PILL_PAD_X = 20
const PILL_CHAR_W = 7.6
const PILL_PCT_W = 44
const PILL_GAP_PX = 6
/** Half-width of the plotted band either side of zero, in percent of the track. */
const HALF_SPAN = 44

/** How many lanes a track of this width should use. */
export function spectrumLanesFor(trackWidth = SPECTRUM_TRACK_WIDTH) {
  return (SPECTRUM_LANE_TIERS.find((tier) => trackWidth >= tier.minTrack) || SPECTRUM_LANE_TIERS[0])
    .lanes
}

/** Where the axis sits, in px from the top of the plot, for a lane count. */
export function spectrumAxisY(lanes = SPECTRUM_LANES) {
  return (lanes - 1) * SPECTRUM_LANE_HEIGHT + SPECTRUM_PILL_HEIGHT + 8
}

/**
 * Lay the spectrum out.
 *
 * @param {Array} rows      monitor rows, any order
 * @param {string} selected currently selected ticker
 * @param {{trackWidth?: number, lanes?: number}} options measured plot geometry
 * @returns {{ points: Array, maxAbs: number, lanes: number, axisY: number }}
 */
export function layoutSpectrum(rows, selected, options = {}) {
  const trackWidth = options.trackWidth || SPECTRUM_TRACK_WIDTH
  const laneCount = options.lanes || spectrumLanesFor(trackWidth)
  const axisY = spectrumAxisY(laneCount)

  const measured = rows.filter((row) => typeof row.changePercent === 'number')
  const maxAbs = Math.max(...measured.map((row) => Math.abs(row.changePercent)), 0) || 1

  // Left to right, so lane occupancy only ever grows rightward and a single
  // pass is enough.
  const ordered = [...rows].sort(
    (a, b) => (a.changePercent ?? 0) - (b.changePercent ?? 0),
  )

  const toPct = (px) => (px / trackWidth) * 100
  const clearance = toPct(PILL_GAP_PX)
  const laneRight = new Array(laneCount).fill(-Infinity)

  const points = ordered.map((row) => {
    const measuredRow = typeof row.changePercent === 'number'
    // An unmeasured symbol sits ON the zero axis rather than being dropped:
    // it is still on the watchlist, and its pill says "no quote".
    const x = 50 + (measuredRow ? (row.changePercent / maxAbs) * HALF_SPAN : 0)

    // The figure is shown only for the session's genuine outliers, which is
    // what keeps the axis readable when a watchlist is fourteen symbols wide.
    let showPercent = measuredRow && Math.abs(row.changePercent) >= maxAbs * 0.72

    const fit = (withPercent) => {
      const widthPx =
        PILL_PAD_X + row.ticker.length * PILL_CHAR_W + (withPercent ? PILL_PCT_W : 0)
      const half = toPct(widthPx) / 2
      let best = 0
      let bestSlack = -Infinity
      for (let lane = 0; lane < laneCount; lane += 1) {
        const slack = x - half - laneRight[lane]
        if (slack > bestSlack) {
          bestSlack = slack
          best = lane
        }
        if (slack >= clearance) return { lane, half, ok: true }
      }
      return { lane: best, half, ok: false }
    }

    let placement = fit(showPercent)
    if (!placement.ok && showPercent) {
      const bare = fit(false)
      if (bare.ok) {
        showPercent = false
        placement = bare
      }
    }
    laneRight[placement.lane] = x + placement.half

    const top = placement.lane * SPECTRUM_LANE_HEIGHT
    return {
      row,
      ticker: row.ticker,
      selected: row.ticker === selected,
      measured: measuredRow,
      showPercent,
      left: `${x.toFixed(2)}%`,
      top: `${top}px`,
      lane: placement.lane,
      stemTop: `${top + SPECTRUM_PILL_HEIGHT}px`,
      stemHeight: `${axisY - (top + SPECTRUM_PILL_HEIGHT)}px`,
    }
  })

  return { points, maxAbs, lanes: laneCount, axisY }
}

/** The five axis ticks, at the same fractions the approved axis uses. */
export function spectrumTicks(maxAbs) {
  return [-1, -0.5, 0, 0.5, 1].map((fraction) => ({
    fraction,
    left: `${(50 + fraction * HALF_SPAN).toFixed(1)}%`,
    label:
      fraction === 0
        ? '0%'
        : `${fraction < 0 ? '−' : '+'}${Math.abs(fraction * maxAbs).toFixed(1)}%`,
  }))
}
