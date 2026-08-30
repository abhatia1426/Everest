/**
 * Contract analytics derived from data we actually have.
 *
 * WHY NO GREEKS: delta, gamma, theta and vega require an implied-volatility
 * surface and a risk-free rate. The API returns neither — `OptionPosition`
 * carries strike, expiry, type, qty, avg_cost, underlying_price, est_value,
 * pnl and dte, and nothing else. Deriving Greeks from assumed inputs would put
 * numbers on screen that look like measurements but are guesses, which on a
 * financial surface is worse than showing nothing.
 *
 * Everything below is arithmetic on values the user or the market supplied, so
 * every figure on the Options page can be traced to a real input.
 */

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

  // A 0.5% band around the strike is the conventional "at the money" window.
  const state = percent > 0.5 ? 'ITM' : percent < -0.5 ? 'OTM' : 'ATM'

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

/** Group contracts by expiry date, ascending — the timeline's data shape. */
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
    }))
    .sort((a, b) => a.dte - b.dte)
}
