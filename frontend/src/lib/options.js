/**
 * Contract analytics derived from data we actually have.
 *
 * WHY NO GREEKS: delta, gamma, theta and vega require an implied-volatility
 * surface and a risk-free rate. The API returns neither — `OptionPosition`
 * carries strike, expiry, type, qty, avg_cost, cost_basis, underlying_price,
 * est_price, est_value, pnl, pnl_percent and dte, and nothing else. Deriving
 * Greeks from assumed inputs would put numbers on screen that look like
 * measurements but are guesses, which on a financial surface is worse than
 * showing nothing.
 *
 * Everything below is arithmetic on values the user or the market supplied, so
 * every figure on the Options page can be traced to a real input.
 */

/**
 * THE ONE DISCLOSURE STRING, reused everywhere an estimated figure appears so
 * the method is never described two different ways.
 *
 * IT DESCRIBES THE REAL ESTIMATOR, NOT THE MOCKUP'S. The approved design's
 * tooltip said the time premium "fades as the underlying moves away from the
 * strike". `services/market.estimate_option_value` does no such thing — it is
 *
 *     intrinsic + max(dte, 0) / 365 * underlying * 0.12
 *
 * which is a flat 12%-a-year charge on the underlying, prorated by days left,
 * with no dependence whatsoever on distance from the strike. The copy was
 * corrected to match the implementation rather than the implementation changed
 * to match the copy: the estimator is deliberately crude, and the honest fix
 * for overstated copy is accurate copy.
 */
export const ESTIMATE_DISCLOSURE =
  'Estimated contract value = intrinsic value (underlying versus strike) plus a simple time ' +
  'premium worth 12% of the underlying price a year, prorated over the days left. The time ' +
  'premium does not vary with how far the underlying sits from the strike. It is not a live ' +
  'option quote, a bid, an ask, a mark or a pricing-model value — Everest has no options price ' +
  'feed, implied volatility or Greeks. Strike, expiry, quantity and premium paid are your own ' +
  'recorded figures; the underlying price is the live quote.'

/** Shares covered by one contract — the same constant the API prices with. */
export const CONTRACT_MULTIPLIER = 100

/** The "at the money" window, in percent either side of the strike. */
const ATM_BAND = 0.5

/** Strike-meter half-span, in percent of the strike. */
export const METER_SPAN = 25

/**
 * Breakeven at expiry for a long contract: the underlying price at which the
 * premium paid is exactly recovered.
 */
export function breakeven(option) {
  if (typeof option.strike !== 'number' || typeof option.avg_cost !== 'number') return null
  return option.type === 'call' ? option.strike + option.avg_cost : option.strike - option.avg_cost
}

/**
 * Moneyness — is this contract in, at, or out of the money right now.
 *
 * `percent` is how far the underlying sits beyond the strike in the direction
 * that helps the holder, so a call 5% above its strike and a put 5% below its
 * strike both read as +5%.
 */
export function moneyness(option) {
  const spot = option.underlying_price
  const { strike } = option
  if (typeof spot !== 'number' || typeof strike !== 'number' || !strike) return null

  const percent = option.type === 'call'
    ? ((spot - strike) / strike) * 100
    : ((strike - spot) / strike) * 100

  const state = percent > ATM_BAND ? 'ITM' : percent < -ATM_BAND ? 'OTM' : 'ATM'

  return { percent, state }
}

/**
 * How far the underlying must travel to reach breakeven, as a percentage of
 * the current price. Negative means breakeven is already passed.
 */
export function distanceToBreakeven(option) {
  const spot = option.underlying_price
  const target = breakeven(option)
  if (typeof spot !== 'number' || target === null || !spot) return null

  return option.type === 'call'
    ? ((target - spot) / spot) * 100
    : ((spot - target) / spot) * 100
}

/**
 * Capital at risk. For a long option the maximum loss is the premium paid, so
 * cost basis IS the risk — which is the single most useful risk figure this
 * dataset supports.
 *
 * The API's `qty > 0` constraint means every stored contract is long; if short
 * positions are ever added this function must change, because a short call's
 * maximum loss is unbounded.
 */
export function capitalAtRisk(options) {
  return options.reduce((sum, option) => sum + (option.cost_basis || 0), 0)
}

/** Buckets used by the expiry warnings, matching the existing `dteTone` bands. */
export function expiryBuckets(options) {
  return options.reduce(
    (acc, option) => {
      const dte = option.dte ?? 0
      if (dte < 0) acc.expired += 1
      else if (dte <= 7) acc.week += 1
      else if (dte <= 30) acc.month += 1
      else acc.later += 1
      return acc
    },
    { expired: 0, week: 0, month: 0, later: 0 },
  )
}

/** Group contracts by expiry date, ascending — the runway's data shape. */
export function groupByExpiry(options) {
  const groups = new Map()

  for (const option of options) {
    const key = option.expiry
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(option)
  }

  return [...groups.entries()]
    .map(([expiry, contracts]) => ({
      expiry,
      contracts,
      dte: contracts[0]?.dte ?? 0,
      value: contracts.reduce((sum, c) => sum + (c.est_value || 0), 0),
      pnl: contracts.reduce((sum, c) => sum + (c.pnl || 0), 0),
    }))
    .sort((a, b) => a.dte - b.dte)
}

/* ------------------------------------------------------------------- view */

/**
 * ONE derived view of a contract, shared by the runway, the workspace and the
 * stage so the three cannot disagree about whether a contract is in the money.
 *
 * Nothing here is invented: every field is either a stored figure or pure
 * arithmetic on stored figures. Where the API returned no underlying price,
 * the dependent fields are `null` and the UI renders an em dash rather than a
 * zero — an unpriced contract is unpriced, not worthless.
 */
export function contractView(option) {
  const spot = typeof option.underlying_price === 'number' ? option.underlying_price : null
  const money = moneyness(option)
  const toBreakeven = distanceToBreakeven(option)
  const dte = option.dte ?? 0

  return {
    ...option,
    dte,
    spot,
    priced: typeof option.est_value === 'number',
    isCall: option.type === 'call',
    breakeven: breakeven(option),
    moneyness: money,
    moneynessState: money?.state ?? null,
    moneynessPercent: money?.percent ?? null,
    toBreakeven,
    // Long-only: the premium paid is the maximum loss, so cost basis IS risk.
    atRisk: option.cost_basis ?? null,
    value: option.est_value ?? null,
    pnl: option.pnl ?? null,
    pnlPercent: option.pnl_percent ?? null,
  }
}

/** Book-level figures. Sums skip unpriced contracts rather than counting them as zero. */
export function bookTotals(views) {
  const priced = views.filter((view) => view.priced)

  const value = priced.reduce((sum, view) => sum + view.value, 0)
  const cost = views.reduce((sum, view) => sum + (view.atRisk || 0), 0)
  const pnl = priced.reduce((sum, view) => sum + (view.pnl || 0), 0)
  // Percent is measured against the premium behind the PRICED contracts only,
  // so an unpriced position cannot drag a return it never contributed to.
  const pricedCost = priced.reduce((sum, view) => sum + (view.atRisk || 0), 0)

  const sortedByDte = [...views].sort((a, b) => a.dte - b.dte)

  return {
    value,
    cost,
    pnl,
    pnlPercent: pricedCost ? (pnl / pricedCost) * 100 : null,
    calls: views.filter((view) => view.isCall).length,
    puts: views.filter((view) => !view.isCall).length,
    unpriced: views.length - priced.length,
    nearest: sortedByDte[0] || null,
    urgent: views.filter((view) => view.dte <= 7),
    expiries: new Set(views.map((view) => view.expiry)).size,
  }
}

/* ---------------------------------------------------------------- runway */

/**
 * The expiry runway's horizontal scale.
 *
 * A SQUARE-ROOT AXIS, not linear time. Contracts cluster in the near weeks —
 * that is where decay bites and where two expiries three days apart have to be
 * separable — while a January LEAP sits alone at the far end. On a linear axis
 * the near cluster collapses into a smear against the origin.
 *
 * The distortion is stated rather than hidden: the axis carries a "Spacing is
 * not linear time" note, ticks are labelled with their REAL day counts, and
 * every gate carries its real date. Those labels are the authoritative values;
 * the geometry is only a way of seeing them apart.
 */
export function runwayScale(horizonDays, { linear = false } = {}) {
  // A book that all expires today would divide by zero; one day is the floor.
  const horizon = Math.max(1, horizonDays || 0)

  return (days) => {
    const clamped = Math.min(horizon, Math.max(0, days ?? 0))
    const fraction = linear ? clamped / horizon : Math.sqrt(clamped) / Math.sqrt(horizon)
    // Inset by 2% so a same-day gate is not clipped by the panel edge.
    return 2 + fraction * 0.94 * 100
  }
}

/** Runway tick positions — real day counts, so the compression stays readable. */
export function runwayTicks(horizonDays) {
  const horizon = Math.max(1, horizonDays || 0)
  return [0, 7, 30, 60, 90, horizon].filter(
    (day, index, all) => all.indexOf(day) === index && day <= horizon,
  )
}

/* ------------------------------------------------------------- workspace */

/**
 * Filter, sort, and re-group. EXPIRY COHORTS SURVIVE EVERY SORT: the organising
 * fact about a book of contracts is the date each one stops existing, so sort
 * reorders contracts inside a date, and reorders the dates themselves only by
 * the same measure.
 */
export function workspaceCohorts(views, { filter = 'All', sort = 'Soonest' } = {}) {
  const filtered = views.filter((view) => {
    if (filter === 'Calls') return view.isCall
    if (filter === 'Puts') return !view.isCall
    return true
  })

  const measure = (rows) =>
    rows.reduce((sum, row) => sum + ((sort === 'Value' ? row.value : row.pnl) || 0), 0)

  const within = (a, b) => {
    if (sort === 'Value') return (b.value ?? -Infinity) - (a.value ?? -Infinity)
    if (sort === 'P/L') return (b.pnl ?? -Infinity) - (a.pnl ?? -Infinity)
    return a.dte - b.dte
  }

  const byExpiry = new Map()
  for (const view of [...filtered].sort(within)) {
    if (!byExpiry.has(view.expiry)) byExpiry.set(view.expiry, [])
    byExpiry.get(view.expiry).push(view)
  }

  const cohorts = [...byExpiry.entries()].map(([expiry, rows]) => ({
    expiry,
    rows,
    dte: rows[0].dte,
    value: rows.reduce((sum, row) => sum + (row.value || 0), 0),
    pnl: rows.reduce((sum, row) => sum + (row.pnl || 0), 0),
  }))

  cohorts.sort((a, b) =>
    sort === 'Soonest' ? a.dte - b.dte : measure(b.rows) - measure(a.rows),
  )

  return { cohorts, count: filtered.length }
}

/* ------------------------------------------------------------ meter/time */

/**
 * Where the underlying and breakeven sit on an axis centred on the strike.
 *
 * The span is fixed at ±25% on every contract, so the meter's geometry means
 * the same thing everywhere; values beyond that clamp to the ends rather than
 * rescaling. The tinted half is the side of the strike that pays for this
 * contract type — a direction, not a recommendation.
 */
export function strikeMeter(view) {
  if (view.spot === null || typeof view.strike !== 'number' || !view.strike) return null

  const toPercent = (price) => {
    const offset = ((price - view.strike) / view.strike) * 100
    return Math.min(Math.max(((offset + METER_SPAN) / (METER_SPAN * 2)) * 100, 0), 100)
  }

  return {
    spot: toPercent(view.spot),
    breakeven: view.breakeven === null ? null : toPercent(view.breakeven),
    profitableSide: view.isCall ? { left: '50%', right: 0 } : { left: 0, right: '50%' },
  }
}

/**
 * Factual reasons this contract is worth a look.
 *
 * EVERY ENTRY IS AN OBSERVATION. There is no urgency score, no assignment
 * probability, no probability of profit and no recommendation — Everest has no
 * model that could produce one. "Expires in 2 days" is a fact about the
 * calendar; "you should close this" would be advice we cannot support.
 */
export function attentionReasons(view, { formatMoney, formatDate }) {
  const reasons = []

  if (view.dte < 0) {
    reasons.push({
      text: `Expired on ${formatDate(view.expiry)} — Everest is still tracking it.`,
      tone: 'warn',
    })
  } else if (view.dte <= 7) {
    reasons.push({
      text: `Expires in ${view.dte} ${view.dte === 1 ? 'day' : 'days'} — on ${formatDate(view.expiry)}.`,
      tone: 'warn',
    })
  }

  if (view.spot === null) {
    reasons.push({
      text: 'No underlying quote right now, so no value can be estimated for this contract.',
      tone: 'muted',
    })
    return reasons
  }

  const away = Math.abs(view.moneynessPercent ?? 0).toFixed(1)
  const side = view.isCall
    ? view.moneynessState === 'ITM' ? 'above' : 'below'
    : view.moneynessState === 'ITM' ? 'below' : 'above'

  reasons.push({
    text:
      view.moneynessState === 'ATM'
        ? `Underlying ${formatMoney(view.spot)} is sitting on the ${formatMoney(view.strike)} strike.`
        : `Underlying ${formatMoney(view.spot)} is ${away}% ${side} the ${formatMoney(view.strike)} strike.`,
    tone: view.moneynessState === 'ITM' ? 'up' : 'muted',
  })

  if (view.toBreakeven !== null && view.toBreakeven <= 0) {
    reasons.push({
      text: `Past breakeven — the underlying has covered the ${formatMoney(view.avg_cost)} premium.`,
      tone: 'up',
    })
  }

  if (typeof view.pnlPercent === 'number' && view.pnlPercent <= -40) {
    reasons.push({
      text: `Estimated value is down ${Math.abs(view.pnlPercent).toFixed(0)}% on the ${formatMoney(view.atRisk)} of premium paid.`,
      tone: 'down',
    })
  } else if (typeof view.pnlPercent === 'number' && view.pnlPercent >= 40) {
    reasons.push({
      text: `Estimated value is up ${view.pnlPercent.toFixed(0)}% on the ${formatMoney(view.atRisk)} of premium paid.`,
      tone: 'up',
    })
  }

  return reasons
}
