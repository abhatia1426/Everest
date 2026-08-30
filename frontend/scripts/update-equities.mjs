#!/usr/bin/env node
/**
 * Rebuilds the bundled local equity universe.
 *
 *   npm run update-equities
 *
 * DEVELOPMENT-TIME ONLY. This script talks to the network; the app never does
 * for symbol search. It writes `src/lib/equities.data.js`, which is committed
 * and bundled, so autocomplete stays a pure in-memory lookup at runtime.
 *
 * SOURCE — the official exchange symbol directories published by Nasdaq for
 * itself and, via the consolidated tape, for NYSE / NYSE American / Cboe:
 *
 *   https://www.nasdaqtrader.com/dynamic/symdir/nasdaqlisted.txt
 *   https://www.nasdaqtrader.com/dynamic/symdir/otherlisted.txt
 *
 * These are the authoritative listing files — a symbol appearing here IS a
 * security currently listed on a US exchange. That is the whole reason to use
 * them rather than a scraped list: inclusion is itself the verification that a
 * company is publicly traded, so no private company can leak into the search.
 * They carry no auth, no key and no rate limit.
 *
 * WHAT THEY DO NOT CARRY: sector and industry. Rather than invent it or add a
 * second API dependency, curated sector/industry from the previous dataset is
 * merged in by ticker and everything else is left null. `equityOrFallback`
 * already returns null for both, the scorer never reads them, and the AssetCard
 * gets richer metadata from the quote response after selection.
 */

import { writeFileSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const OUT = join(HERE, '..', 'src', 'lib', 'equities.data.js')
const CURATED = join(HERE, 'equities.curated.json')

const SOURCES = {
  nasdaq: 'https://www.nasdaqtrader.com/dynamic/symdir/nasdaqlisted.txt',
  other: 'https://www.nasdaqtrader.com/dynamic/symdir/otherlisted.txt',
}

/**
 * Security-name patterns that mean "not ordinary equity".
 *
 * Filtering on the NAME rather than on ticker suffixes is deliberate: suffix
 * conventions differ between Nasdaq (5th letter) and the CQS tape (dotted
 * suffix), but every venue spells out the instrument type in the name.
 */
const NOT_EQUITY =
  /\b(warrant|warrants|right|rights|unit|units|preferred|debenture|note|notes|bond|subordinated|contingent value|liquidating|escrow|when distributed|structured|index-linked|trust certificate|etn|etns)\b/i

/**
 * Closed-end funds and similar pooled vehicles. They are NOT flagged as ETFs
 * in the directories, so without this they leak in and bury real companies
 * ("Ares Dynamic Credit Allocation Fund" outranking Reddit for "red").
 */
const IS_FUND =
  /\b(fund|closed[- ]end|term trust|income trust|royalty trust|portfolio|acquisition corp|dividend opp|municipal income|senior income|credit allocation)\b/i

/** Coupon-bearing instruments: "6.25% Series B ...". */
const HAS_COUPON = /\d+(\.\d+)?\s*%/

/*
 * NOTE — this is a DENYLIST, not an allowlist.
 *
 * An allowlist requiring "Common Stock" in the name looked safer but silently
 * dropped two whole categories: ADRs ("... American Depositary Shares"), and
 * securities the tape names with no instrument descriptor at all — the row for
 * TSM is literally "Taiwan Semiconductor Manufacturing Company Ltd.". Both are
 * ordinary shares a retail investor buys on a US exchange, so the filter keeps
 * everything that is not positively identified as a non-equity instrument.
 */

/** Dotted suffixes on the consolidated tape that are never ordinary equity. */
const BAD_SUFFIX = /\.(WS|WT|U|RT|R|P[A-Z]?|CL|EC|CV)$/i

async function fetchText(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Everest equity-universe builder (contact: repo owner)' },
  })
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`)
  return res.text()
}

/** Parse a pipe-delimited symbol directory, dropping its trailing footer. */
function parsePipe(text) {
  const lines = text.trim().split('\n')
  const header = lines[0].split('|')
  return lines
    .slice(1)
    .filter((line) => !line.startsWith('File Creation Time'))
    .map((line) => {
      const cells = line.split('|')
      return Object.fromEntries(header.map((h, i) => [h.trim(), (cells[i] ?? '').trim()]))
    })
}

/**
 * "SoFi Technologies, Inc.  - Common Stock" -> "SoFi Technologies, Inc."
 * "Alphabet Inc. Class A Common Stock"      -> "Alphabet Inc. (Class A)"
 *
 * Share class is preserved in parentheses because it is the one piece of the
 * instrument description a user actually needs to tell two listings apart.
 */
function cleanName(raw, symbol = '') {
  let name = raw.replace(/\s+/g, ' ').trim()

  // The tape sometimes repeats the issuer inside the security name
  // ("Brookfield Renewable Corporation Brookfield Renewable Corporation ...").
  const half = Math.floor(name.length / 2)
  for (let cut = half; cut > 8; cut -= 1) {
    const head = name.slice(0, cut).trim()
    if (head && name.slice(cut).trim().startsWith(head)) {
      name = `${head} ${name.slice(cut).trim().slice(head.length).trim()}`.trim()
      break
    }
  }

  const klass = name.match(/\bClass ([A-Z])\b/)
  name = name
    .replace(/\s*-\s*(Common Stock|Common Shares|Ordinary Shares).*$/i, '')
    .replace(/\bClass [A-Z]\b/g, '')
    .replace(
      /\s*[-,]?\s*((Global |American )?Deposit[ao]ry (Shares?|Receipts?)|New York Registry Shares?|(Subordinate |Non-)?Voting (Common )?Shares?|Non-Voting|Common Stock|Common Shares|Ordinary Shares?|Shares of Beneficial Interest|When-Issued|When Issued|\(?each representing.*\)?).*$/i,
      '',
    )
    .replace(/\s*[-,]\s*$/, '')
    .replace(/\s+/g, ' ')
    .trim()

  if (klass) return `${name} (Class ${klass[1]})`

  /*
   * The tape often omits the share class from the NAME and encodes it only in
   * the dotted ticker (HEI vs HEI.A are both "Heico Corporation Common
   * Stock"). Recover it so two classes of one company are distinguishable in
   * a results list instead of appearing as duplicate rows.
   */
  const suffix = symbol.match(/\.([A-Z])$/)
  if (suffix) return `${name} (Class ${suffix[1]})`
  return name
}

function keep(row) {
  const name = row.name
  if (!name) return false
  if (row.testIssue === 'Y') return false
  if (row.etf === 'Y') return false
  if (row.nextShares === 'Y') return false
  if (BAD_SUFFIX.test(row.symbol)) return false
  if (!/^[A-Z][A-Z.]{0,7}$/.test(row.symbol)) return false
  if (NOT_EQUITY.test(name)) return false
  if (IS_FUND.test(name)) return false
  if (HAS_COUPON.test(name)) return false
  return true
}

async function main() {
  console.log('Fetching official exchange symbol directories…')
  const [nasdaqRaw, otherRaw] = await Promise.all([
    fetchText(SOURCES.nasdaq),
    fetchText(SOURCES.other),
  ])

  const stamp = (nasdaqRaw.match(/File Creation Time:\s*([0-9:]+)/) || [])[1] || 'unknown'

  const nasdaq = parsePipe(nasdaqRaw).map((r) => ({
    symbol: r.Symbol,
    name: r['Security Name'],
    exchange: 'NASDAQ',
    etf: r.ETF,
    testIssue: r['Test Issue'],
    nextShares: r.NextShares,
  }))

  // Consolidated-tape exchange codes.
  const VENUE = { A: 'NYSE American', N: 'NYSE', P: 'NYSE Arca', Z: 'Cboe BZX', V: 'IEX' }
  const other = parsePipe(otherRaw).map((r) => ({
    symbol: r['ACT Symbol'],
    name: r['Security Name'],
    exchange: VENUE[r.Exchange] || r.Exchange,
    etf: r.ETF,
    testIssue: r['Test Issue'],
    nextShares: 'N',
  }))

  const raw = [...nasdaq, ...other]
  const kept = raw.filter(keep)

  // De-duplicate by ticker; a symbol dual-listed on the tape keeps its first
  // (Nasdaq-primary) record.
  const byTicker = new Map()
  for (const row of kept) if (!byTicker.has(row.symbol)) byTicker.set(row.symbol, row)

  // Merge curated sector/industry from the previous hand-built dataset.
  let curated = {}
  try {
    curated = JSON.parse(readFileSync(CURATED, 'utf8'))
  } catch {
    console.warn('! no curated sector map found — sectors will be null')
  }

  /*
   * ETFs: the directories carry ~4,000 of them and dumping those into a stock
   * search would bury real companies under leveraged and thematic products.
   * They are excluded wholesale by the `etf === 'Y'` filter above — EXCEPT a
   * short curated list of broad-market funds people genuinely search for by
   * name (SPY is already in POPULAR_TICKERS). Curated in, everything else out.
   */
  let curatedEtfs = []
  try {
    curatedEtfs = JSON.parse(readFileSync(join(HERE, 'equities.etfs.json'), 'utf8'))
  } catch {
    /* optional */
  }
  const etfExchange = new Map(raw.filter((r) => r.etf === 'Y').map((r) => [r.symbol, r.exchange]))
  const etfRows = curatedEtfs
    .filter(([ticker]) => etfExchange.has(ticker)) // still listed today
    .map(([ticker, name, sector, industry]) => [
      ticker,
      name,
      sector,
      industry,
      etfExchange.get(ticker),
    ])
  const droppedEtfs = curatedEtfs.filter(([t]) => !etfExchange.has(t)).map(([t]) => t)
  if (droppedEtfs.length) console.warn(`! curated ETFs no longer listed: ${droppedEtfs.join(', ')}`)

  const rows = [...byTicker.values()]
    .map((r) => {
      const meta = curated[r.symbol] || {}
      return [r.symbol, cleanName(r.name, r.symbol), meta.sector ?? null, meta.industry ?? null, r.exchange]
    })
    .concat(etfRows)
    .filter(([, name]) => name && name.length > 1)
    .sort((a, b) => a[0].localeCompare(b[0]))

  const withSector = rows.filter((r) => r[2]).length
  const lit = (v) => (v === null ? 'null' : `'${String(v).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`)

  const body = `/**
 * GENERATED FILE — DO NOT EDIT BY HAND.
 *
 * Rebuild with:  npm run update-equities
 *
 * Source: official Nasdaq / consolidated-tape symbol directories
 *   nasdaqlisted.txt + otherlisted.txt  (file creation time ${stamp})
 *
 * A symbol is present here only because it appears in an exchange's own
 * listing file, which is what makes this list a verified universe of publicly
 * traded securities rather than a scraped guess.
 *
 * Tuple: [ticker, name, sector, industry, exchange]
 * sector/industry are null where the exchange files carry no such data.
 */
export const GENERATED_AT = '${new Date().toISOString()}'
export const SOURCE_STAMP = '${stamp}'

export const ROWS = [
${rows.map((r) => `  [${r.map(lit).join(', ')}],`).join('\n')}
]
`

  writeFileSync(OUT, body)

  console.log(`  source rows          ${raw.length}`)
  console.log(`  after quality filter ${kept.length}`)
  console.log(`  unique tickers       ${rows.length}`)
  console.log(`  with curated sector  ${withSector}`)
  console.log(`  written -> ${OUT}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
