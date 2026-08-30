/**
 * US equity market session state, derived client-side.
 *
 * The API does not report session state, and deriving it locally means the
 * badge stays correct even while quotes are unavailable — which is exactly
 * when a user most needs to know whether a stale price is expected.
 *
 * Regular hours: 09:30-16:00 America/New_York, Mon-Fri.
 * Holidays are not modelled; the label is orientation, not a trading gate.
 */
const OPEN_MINUTES = 9 * 60 + 30
const CLOSE_MINUTES = 16 * 60
const PRE_MINUTES = 4 * 60
const POST_MINUTES = 20 * 60

function newYorkParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    weekday: 'short',
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
  }).formatToParts(date)

  const lookup = Object.fromEntries(parts.map((p) => [p.type, p.value]))
  return {
    weekday: lookup.weekday,
    minutes: Number(lookup.hour) * 60 + Number(lookup.minute),
  }
}

export function getMarketStatus(date = new Date()) {
  const { weekday, minutes } = newYorkParts(date)

  if (weekday === 'Sat' || weekday === 'Sun') {
    return { state: 'closed', label: 'Closed', detail: 'Weekend' }
  }
  if (minutes >= OPEN_MINUTES && minutes < CLOSE_MINUTES) {
    return { state: 'open', label: 'Open', detail: 'Regular hours' }
  }
  if (minutes >= PRE_MINUTES && minutes < OPEN_MINUTES) {
    return { state: 'pre', label: 'Pre-market', detail: 'Opens 9:30 AM ET' }
  }
  if (minutes >= CLOSE_MINUTES && minutes < POST_MINUTES) {
    return { state: 'post', label: 'After hours', detail: 'Closed 4:00 PM ET' }
  }
  return { state: 'closed', label: 'Closed', detail: 'Opens 9:30 AM ET' }
}
