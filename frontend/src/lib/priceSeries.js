/**
 * Price-series geometry, as pure functions.
 *
 * WHY A SHARED MODULE. Everest draws price history on three surfaces — the
 * Watchlist stage, the Ticker Detail workstation, and the Portfolio row
 * expansion — and each one makes CLAIMS about that history: a period label, a
 * return figure, a range position. If two surfaces computed those separately
 * they could disagree about the same symbol in the same second, which is a
 * correctness problem rather than a styling one. Everything a chart asserts is
 * therefore derived here, away from React, where it can be tested against its
 * own definition.
 *
 * The behavioural statistics — momentum, "normal day", range position — live in
 * `lib/monitor.js` and are NOT duplicated here. This module owns geometry and
 * windowing; that one owns what the numbers mean.
 *
 * TWO RULES:
 *   · Nothing is synthesized. Every function narrows or measures real candles.
 *     A window the provider did not cover yields fewer points, never invented
 *     ones, and the caller renders an honest unavailable state.
 *   · A named period must describe the data actually plotted. See
 *     `clipToPeriod` and `describeWindow`.
 */

import { clipToPeriod } from './monitor'

export { clipToPeriod }

/**
 * The six periods the workstation offers, mapped to what the API really serves.
 *
 * `api` is the backend's `PERIOD_MAP` key; `days` is the window the pill
 * promises and the series is clipped to. The two are deliberately separate:
 * the endpoint's own windows are approximate and it has been observed
 * returning five months of hourly bars for `1m`, so the pill's promise is
 * enforced on the client rather than trusted from the provider.
 *
 * 5Y IS REAL, NOT FAKED. The backend has no five-year window, but `all` is ten
 * years of weekly bars — so a genuine five-year view is that series clipped to
 * 1825 days. It plots real weekly closes; it does not aggregate or interpolate
 * anything. Where the provider holds less than five years, `describeWindow`
 * says how far back the data actually goes.
 */
export const CHART_PERIODS = [
  { key: '1D', api: '1d', days: 1, word: 'today', intraday: true },
  { key: '1W', api: '1w', days: 7, word: 'over the past week', intraday: true },
  { key: '1M', api: '1m', days: 31, word: 'over the past month', intraday: true },
  { key: '3M', api: '3m', days: 92, word: 'over the past quarter' },
  { key: '1Y', api: '1y', days: 366, word: 'over the past year' },
  { key: '5Y', api: 'all', days: 1825, word: 'over the past five years' },
]

export function periodFor(key) {
  return CHART_PERIODS.find((period) => period.key === key) || CHART_PERIODS[2]
}

/** Plot bands as a percentage of plot height: price on top, volume beneath. */
export const PRICE_H = 72
export const VOL_TOP = 82
export const VOL_H = 18

/** Span of a candle series in days, or null. */
export function spanDays(candles) {
  if (!Array.isArray(candles) || candles.length < 2) return null
  const first = new Date(candles[0].time).getTime()
  const last = new Date(candles[candles.length - 1].time).getTime()
  if (!Number.isFinite(first) || !Number.isFinite(last)) return null
  return (last - first) / 86_400_000
}

/**
 * What the figure beside the chart is actually measuring.
 *
 * Clipping guarantees the plotted window is never LONGER than the pill
 * promises. It cannot guarantee the provider held enough history to fill it —
 * a symbol listed two years ago has no five-year series — and "over the past
 * five years" above two years of bars would be a false claim about a real
 * number. So a materially short window states the date the data really starts.
 *
 * The 80% threshold is deliberate slack: a "1Y" view built from trading days
 * legitimately spans slightly less than 366 calendar days, and weekly bars land
 * where they land. Only a genuinely short history trips it.
 */
export function describeWindow(candles, period) {
  if (!Array.isArray(candles) || candles.length < 2) return null

  const span = spanDays(candles)
  if (span === null) return period.word
  // 1D is a session, not a calendar span; it can never be "short" this way.
  if (period.intraday && period.days <= 1) return period.word
  if (span >= period.days * 0.8) return period.word

  const start = new Date(candles[0].time)
  const long = period.days >= 366
  return `since ${start.toLocaleDateString('en-US', long ? { month: 'short', year: 'numeric' } : { month: 'short', day: 'numeric', year: 'numeric' })}`
}

/** Return over the plotted window, in percent. Null when it cannot be measured. */
export function windowReturn(candles) {
  if (!Array.isArray(candles) || candles.length < 2) return null
  const first = candles[0]?.close
  const last = candles[candles.length - 1]?.close
  if (typeof first !== 'number' || typeof last !== 'number' || !first) return null
  return { percent: (last / first - 1) * 100, absolute: last - first }
}

/**
 * Does this series carry real OHLC, or only closes wearing an OHLC shape?
 *
 * The backend fills `open`/`high`/`low` with the close when the provider omits
 * them, so a degenerate series is structurally indistinguishable from a real
 * one without this check. Drawing candles from it would render a column of
 * dashes and imply a session that never had a range — so candle mode is
 * offered only where the bars genuinely have one.
 */
export function hasRealOhlc(candles) {
  if (!Array.isArray(candles) || candles.length < 2) return false
  let withRange = 0
  for (const candle of candles) {
    if (
      typeof candle?.high === 'number' &&
      typeof candle?.low === 'number' &&
      candle.high > candle.low
    ) {
      withRange += 1
    }
  }
  // A handful of flat bars is normal (a halted or thin session); a series that
  // is almost entirely flat is not OHLC data.
  return withRange >= candles.length * 0.5
}

/** Does this series carry real traded volume? Zeroes are not volume. */
export function hasVolume(candles) {
  if (!Array.isArray(candles)) return false
  return candles.some((candle) => typeof candle?.volume === 'number' && candle.volume > 0)
}

/**
 * The price domain the chart is drawn against.
 *
 * SPANS ONLY WHAT IS PLOTTED. When candles are shown the wicks are included;
 * when they are not, the closes alone. The cost basis is deliberately NOT a
 * factor: a basis far below the session — the ordinary case for a profitable
 * holding — would stretch the axis and squeeze every bar into a strip at the
 * top. Out-of-domain cost is reported by `costOverlay` instead.
 */
export function priceDomain(candles, { candleMode = false, padding = 0.08 } = {}) {
  if (!Array.isArray(candles) || candles.length === 0) return null

  const lows = []
  const highs = []
  for (const candle of candles) {
    if (typeof candle?.close !== 'number') continue
    lows.push(candleMode && typeof candle.low === 'number' ? candle.low : candle.close)
    highs.push(candleMode && typeof candle.high === 'number' ? candle.high : candle.close)
  }
  if (lows.length === 0) return null

  const rawMin = Math.min(...lows)
  const rawMax = Math.max(...highs)
  // A perfectly flat series still needs a domain to sit in the middle of.
  const pad = (rawMax - rawMin || Math.abs(rawMax) * 0.02 || 1) * padding

  const min = rawMin - pad
  const max = rawMax + pad
  return {
    min,
    max,
    span: max - min || 1,
    // The un-padded extremes: what the window genuinely reached, used by the
    // 52-week gauge and by the cost badge's distance figure.
    dataMin: rawMin,
    dataMax: rawMax,
  }
}

/** Vertical position of a price, in percent of the plot's price band. */
export function yFor(value, domain) {
  if (!domain || typeof value !== 'number') return null
  return (1 - (value - domain.min) / domain.span) * PRICE_H
}

/**
 * Where the cost-basis overlay goes — or why there isn't one.
 *
 * THREE OUTCOMES, and the distinction is the point:
 *
 *   inside   the basis is within the plotted domain, so a real horizontal line
 *            is drawn at its true coordinate
 *   outside  the basis is above or below the plotted domain. NO line is drawn.
 *            A dashed rule pinned to the boundary would read as "cost is at
 *            this price", which is false, and stretching the domain to reach it
 *            would wreck the scale of the data the user asked to see. A caret
 *            badge states the direction and the distance instead.
 *   null     there is no basis to draw (the security is not held)
 */
export function costOverlay(avgCost, domain) {
  if (typeof avgCost !== 'number' || !Number.isFinite(avgCost) || !domain) return null

  const y = yFor(avgCost, domain)
  if (y >= 0 && y <= PRICE_H) return { inside: true, y, avgCost }

  const below = y > PRICE_H
  const edge = below ? domain.dataMin : domain.dataMax
  return {
    inside: false,
    below,
    avgCost,
    distance: Math.abs(edge - avgCost),
    rangeLow: domain.dataMin,
    rangeHigh: domain.dataMax,
  }
}

/**
 * Bar geometry for every candle, in percent — the same slot arithmetic whether
 * the chart is drawing candles or only their volume, so the two can never
 * disagree about where a bar sits.
 */
export function layoutBars(candles, domain, { volumeMax = null } = {}) {
  if (!Array.isArray(candles) || candles.length === 0 || !domain) return []

  const slot = 100 / candles.length
  const peak =
    volumeMax ??
    Math.max(...candles.map((candle) => (typeof candle?.volume === 'number' ? candle.volume : 0)), 0)

  return candles.map((candle, index) => {
    const open = typeof candle.open === 'number' ? candle.open : candle.close
    const high = typeof candle.high === 'number' ? candle.high : candle.close
    const low = typeof candle.low === 'number' ? candle.low : candle.close
    const up = candle.close >= open

    const bodyTop = yFor(Math.max(open, candle.close), domain)
    const bodyBottom = yFor(Math.min(open, candle.close), domain)
    const wickTop = yFor(high, domain)
    const wickBottom = yFor(low, domain)

    const volume = typeof candle.volume === 'number' ? candle.volume : 0
    const volumeHeight = peak > 0 ? Math.max(1.4, (volume / peak) * VOL_H) : 0

    return {
      index,
      candle,
      up,
      left: index * slot + slot * 0.16,
      width: slot * 0.68,
      mid: index * slot + slot * 0.5,
      wickTop,
      wickHeight: Math.max(0.4, wickBottom - wickTop),
      bodyTop,
      bodyHeight: Math.max(0.35, bodyBottom - bodyTop),
      volume,
      volumeTop: VOL_TOP + VOL_H - volumeHeight,
      volumeHeight,
    }
  })
}

/**
 * Sparse editorial grid: five lines, labelled, with any label that would collide
 * with the current-price tag yielding to it. Two overlapping figures in the
 * same six pixels is worse than one missing gridline label.
 */
export function gridLines(domain, lastPriceY) {
  if (!domain) return []
  return [0, 0.25, 0.5, 0.75, 1].map((fraction) => {
    const y = fraction * PRICE_H
    const value = domain.min + domain.span * (1 - fraction)
    return {
      y,
      value,
      hidden: typeof lastPriceY === 'number' && Math.abs(y - lastPriceY) < 3.4,
    }
  })
}

/** Evenly spaced x-axis stops, taken from real candle timestamps. */
export function axisLabels(candles, period, count = 5) {
  if (!Array.isArray(candles) || candles.length < 2) return []

  return Array.from({ length: count }, (_, i) => {
    const index = Math.round(((candles.length - 1) * i) / (count - 1))
    const date = new Date(candles[index]?.time)
    if (Number.isNaN(date.getTime())) return { label: '', align: 'center' }
    return {
      label: formatStamp(date, period),
      align: i === 0 ? 'left' : i === count - 1 ? 'right' : 'center',
    }
  })
}

/** A timestamp in the register the period calls for. */
export function formatStamp(date, period, { long = false } = {}) {
  if (period?.key === '1D') {
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  }
  if (period?.days >= 366) {
    return long
      ? date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
      : date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
  }
  if (period?.intraday && long) {
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    })
  }
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

/**
 * The 52-week frame.
 *
 * PROVIDER FIGURES FIRST. Finnhub reports real 52-week high and low as
 * fundamentals, and those are the authoritative numbers. Where they are
 * missing, the same measure is COMPUTED from a year of candles we actually
 * hold — that is a direct measurement of the definition, not an invention — and
 * the result is marked `derived` so the UI can say where it came from.
 *
 * Returns null when neither source can support the claim, and the gauge then
 * renders its unavailable state rather than a range with no basis.
 */
export function fiftyTwoWeekFrame({ quoteHigh, quoteLow, yearCandles, price }) {
  let high = typeof quoteHigh === 'number' && Number.isFinite(quoteHigh) ? quoteHigh : null
  let low = typeof quoteLow === 'number' && Number.isFinite(quoteLow) ? quoteLow : null
  let derived = false

  if (high === null || low === null) {
    const closes = (yearCandles || [])
      .map((candle) => candle?.close)
      .filter((value) => typeof value === 'number' && Number.isFinite(value))
    // A year's worth of history, or nothing. Computing "52-week" from three
    // months and labelling it as a year is the failure this guard prevents.
    const span = spanDays(yearCandles)
    if (closes.length >= 2 && span !== null && span >= 300) {
      high = Math.max(...closes)
      low = Math.min(...closes)
      derived = true
    }
  }

  if (high === null || low === null || high <= low) return null

  // The year must contain the price sitting inside it: a quote that has just
  // printed a new high is real, and clamping it would state a false position.
  const boundedHigh = typeof price === 'number' ? Math.max(high, price) : high
  const boundedLow = typeof price === 'number' ? Math.min(low, price) : low
  const span = boundedHigh - boundedLow || 1

  return {
    low: boundedLow,
    high: boundedHigh,
    span,
    derived,
    position: typeof price === 'number' ? (price - boundedLow) / span : null,
    /** Map any price onto the gauge's own vertical band, clamped to it. */
    project: (value) =>
      (1 - (Math.min(boundedHigh, Math.max(boundedLow, value)) - boundedLow) / span) * PRICE_H,
  }
}
