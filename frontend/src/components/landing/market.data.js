import { DEMO_HOLDINGS, DEMO_WATCHLIST } from './panels'

/**
 * 05 — MARKET, derived.
 *
 * NOTHING HERE IS INVENTED. Every figure this module publishes is either a
 * value the product already carries (`DEMO_HOLDINGS`, `DEMO_WATCHLIST`, the
 * three indices on the product's own `MarketStrip`) or plain arithmetic on
 * those values, computed by ONE rule and stated on the drawing.
 *
 * The previous build of this section synthesised an intraday path for every
 * position — a shape that asserted nothing but still had to be captioned as an
 * "intraday trace" so it did not read as a claim. This section needs no such
 * caption because it plots no invented geometry at all: the section line is cut
 * through values that exist.
 *
 * THE ONE RULE, stated once here and once in the drawing's edge annotation:
 *
 *   Easting  — sector, ordered by the capital held in it (03's rule, carried).
 *   Elevation — percent moved today.
 *   Ground    — only under sectors you hold. A sector's elevation is the
 *               capital-weighted move of the positions held in it.
 *
 * A sector that appears only on the watchlist has no capital in it, so it gets
 * no ground: its names are spot heights over open country. That is exactly the
 * distinction section 03 draws between a survey station and a spot height, and
 * it is what keeps this a picture of the MARKET rather than of the book again.
 */

/* ------------------------------------------------------------- the horizon */

/**
 * THE INDEX BAND.
 *
 * The same three indices the product's `MarketStrip` reports, kept in one
 * object so the landing surface and the app cannot drift apart. Drawn as a
 * band rather than as three separate series because that is how it is actually
 * read: above the top edge you beat every major index, below the bottom edge
 * you lagged all three, and inside it the distinction is noise.
 */
export const INDICES = [
  { label: 'Dow 30', change: 0.27 },
  { label: 'S&P 500', change: 0.61 },
  { label: 'Nasdaq 100', change: 1.17 },
].sort((a, b) => a.change - b.change)

export const BAND = {
  lo: INDICES[0].change,
  hi: INDICES[INDICES.length - 1].change,
}

/* -------------------------------------------------------------- the ground */

const held = new Map()
for (const h of DEMO_HOLDINGS) {
  const s = held.get(h.sector) ?? {
    sector: h.sector,
    weight: 0,
    moment: 0,
    names: [],
    watched: [],
  }
  s.weight += h.weight
  s.moment += h.weight * h.change
  s.names.push(h)
  held.set(h.sector, s)
}

const open = new Map()
for (const w of DEMO_WATCHLIST) {
  /* A watched name in a sector you already hold belongs on that sector's
     easting — it is the same ground, you simply own none of that particular
     company. AMD sitting far below the Semiconductors ridge that NVDA defines
     is the single most informative mark on the drawing. */
  if (held.has(w.sector)) {
    held.get(w.sector).watched.push(w)
    continue
  }
  const s = open.get(w.sector) ?? { sector: w.sector, weight: 0, names: [], watched: [] }
  s.watched.push(w)
  open.set(w.sector, s)
}

/** Sectors with capital in them, ordered by that capital. These carry ground. */
export const GROUND = [...held.values()]
  .map((s) => ({
    sector: s.sector,
    weight: s.weight,
    change: s.moment / s.weight,
    names: [...s.names].sort((a, b) => b.weight - a.weight),
    watched: s.watched,
  }))
  .sort((a, b) => b.weight - a.weight)

/** Sectors you only watch. Marked, but with nothing underneath them. */
export const OPEN = [...open.values()].map((s) => ({
  sector: s.sector,
  weight: 0,
  change: null,
  names: [],
  watched: s.watched,
}))

export const STATIONS = [...GROUND, ...OPEN]

/* --------------------------------------------------------------- the datum */

/** Share of the book these positions account for. */
export const COVERED = DEMO_HOLDINGS.reduce((a, h) => a + h.weight, 0)

/**
 * THE BOOK LINE.
 *
 * The capital-weighted move of the named positions — the one figure that turns
 * a picture of the market into a picture of your place in it. It is computed
 * from the same numbers the ridge is built from, so the line can never disagree
 * with the ground beneath it, and it is labelled with its coverage rather than
 * presented as the whole portfolio's return.
 */
export const BOOK = DEMO_HOLDINGS.reduce((a, h) => a + h.weight * h.change, 0) / COVERED

/** The heaviest position: the one name the drawing lets speak at full volume. */
export const LEAD = DEMO_HOLDINGS.reduce((a, b) => (b.weight > a.weight ? b : a))

/** Every name that appears on the section, in one list, tagged by tenure. */
export const NAMES = [
  ...DEMO_HOLDINGS.map((h) => ({ ...h, held: true })),
  ...DEMO_WATCHLIST.map((w) => ({ ...w, held: false, weight: 0 })),
]

/** Vertical extent actually required by a given set of marks. */
export function extent(changes, padHi, padLo) {
  const all = [...changes, BAND.hi, BAND.lo, 0]
  return { hi: Math.max(...all) + padHi, lo: Math.min(...all) - padLo }
}
