/**
 * The bundled equity universe.
 *
 * The raw rows live in `equities.data.js`, which is GENERATED from the
 * official Nasdaq / consolidated-tape symbol directories — see
 * `scripts/update-equities.mjs` and refresh with `npm run update-equities`.
 *
 * WHY GENERATED: this list used to be ~200 hand-typed companies, which meant
 * it silently went stale — SoFi, Reddit, Arm, CoreWeave, GE Vernova, Kenvue
 * and Solventum were all missing despite being ordinary large listings. A
 * symbol now appears here only because an exchange publishes it in its own
 * listing file, so "is this company actually public?" is answered by the
 * source rather than by whoever edited the file last.
 *
 * RUNTIME IS STILL PURELY LOCAL. The generator is a development-time script;
 * nothing in the app fetches symbols. Search remains an in-memory scan.
 *
 * `EQUITIES` is the normalised form and `lib/equitySource.js` is the only
 * module UI code talks to.
 *
 * Fields: ticker, name, sector, industry, exchange
 */
import { ROWS } from './equities.data'

export const EQUITIES = ROWS.map(([ticker, name, sector, industry, exchange]) => ({
  ticker,
  name,
  sector,
  industry,
  exchange,
}))

/** Shown in the command palette when the query is empty. */
export const POPULAR_TICKERS = [
  'AAPL',
  'NVDA',
  'MSFT',
  'TSLA',
  'AMZN',
  'GOOGL',
  'META',
  'SPY',
]

/**
 * Initials for the logo fallback: up to two letters from the company name,
 * skipping corporate-form noise so "The Home Depot, Inc." reads "HD".
 */
const NOISE = new Set([
  'the', 'inc', 'inc.', 'corp', 'corp.', 'corporation', 'company', 'co', 'co.',
  'plc', 'group', 'holdings', 'ltd', 'ltd.', 'limited', 'sa', 's.a.', 'trust',
  'etf', '&', 'com', 'incorporated',
])

export function initialsFor(name = '', ticker = '') {
  const words = String(name)
    // Drop share-class suffixes like "(Class A)" before anything else, so
    // "Alphabet Inc. (Class A)" reads AL rather than AC.
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[(),.]/g, ' ')
    .split(/\s+/)
    .filter((w) => w && !NOISE.has(w.toLowerCase()))

  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase()
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return String(ticker).slice(0, 2).toUpperCase()
}
