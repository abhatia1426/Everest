/**
 * Company logo service.
 *
 * This module owns EVERYTHING about resolving a ticker to a logo image:
 * provider selection, the ticker→domain map, caching and failure handling.
 * `ui/CompanyLogo` is presentation only — it asks this module for candidate
 * URLs and reports back what happened. Keeping the policy here means swapping
 * providers, adding a CDN or going fully offline is a change to one file.
 *
 * RESOLUTION ORDER
 *   1. cached URL            (memory Map, then localStorage)
 *   2. Logo.dev by DOMAIN    (only for the few verified exceptions below)
 *   3. Logo.dev by TICKER    (the normal path — scales to the whole universe)
 *   4. monogram fallback     (the caller's responsibility — see CompanyLogo)
 *
 * Clearbit was previously tier 3; it has been removed because the host no
 * longer resolves at all. See the note above `logoDevUrl`.
 *
 * WHY <img> ONERROR RATHER THAN fetch(): logo CDNs do not reliably send CORS
 * headers, so a `fetch` probe fails on origins where the <img> itself would
 * have rendered perfectly. Letting the image element attempt the load is both
 * more accurate and one fewer network round trip.
 *
 * WHY THE EQUITY DATASET CARRIES NO `domain` COLUMN. It was considered. The
 * exchange listing files that generate `equities.data.js` publish no domain,
 * so the column would have to be inferred or hand-written for 5,401 rows —
 * exactly the maintenance trap the generated dataset was built to escape.
 * Measurement settled it: of the symbols Logo.dev cannot resolve by ticker,
 * four in five cannot be resolved by their real domain either, because
 * Logo.dev simply has no record of the brand. A domain column would add a
 * large maintenance burden to recover a handful of micro-caps.
 *
 * NEGATIVE CACHING is the reason this module exists at all. Without it a
 * symbol with no logo re-requests on every mount — and a dashboard mounts the
 * same tickers in movers, holdings and the watchlist simultaneously.
 */

const STORAGE_KEY = 'everest.logos.v1'

/** Successful resolutions are stable; re-check monthly in case a brand changes. */
const SUCCESS_TTL = 30 * 24 * 60 * 60 * 1000
/** Misses are re-tried the next day — coverage improves over time. */
const FAILURE_TTL = 24 * 60 * 60 * 1000

/*
 * Vite exposes only VITE_-prefixed variables, and only from ITS OWN project
 * root. The token originally lived in backend/.env, where Vite never looks, so
 * this was `null` and every mark silently fell through to a monogram — a
 * failure with no error to notice. It now lives in frontend/.env.
 *
 * This is a Logo.dev publishable key (pk_), designed for client-side use; it
 * is not a secret like FINNHUB_API_KEY. It is still never logged.
 */
const LOGO_DEV_TOKEN = import.meta.env?.VITE_LOGO_TOKEN || null

/* ------------------------------------------------------------ domains */

/**
 * DOMAIN EXCEPTIONS — deliberately tiny.
 *
 * This used to be a hand-maintained map of ~220 ticker->domain pairs, which
 * covered exactly the ~200 companies the old equity dataset knew about. When
 * that dataset grew to 5,401 listings, every one of the 5,180 new companies
 * fell straight through to a monogram, because a symbol with no entry here
 * produced no candidate URL at all.
 *
 * The fix is NOT a bigger map. Logo.dev resolves a ticker directly
 * (`/ticker/AAPL`), and measurement showed that endpoint returns byte-identical
 * images to the curated domains for 218 of the 219 symbols that were mapped by
 * hand — so the map was pure maintenance burden. It is gone.
 *
 * What remains are the genuine exceptions, each verified individually:
 *
 *   · JMKE / CAP  Logo.dev has no ticker record; the company domain works.
 *   · GOOGL/GOOG  `/ticker` returns Google's mark; the LISTED entity is
 *                 Alphabet, and the original mapping chose abc.xyz on purpose.
 *                 Preserved rather than silently changed.
 *
 * Add to this map only when `/ticker/<SYMBOL>` is verified to 404 or to return
 * the wrong company. It is not a place to pre-empt problems.
 */
const DOMAIN_EXCEPTIONS = {
  JMKE: 'jerseymikes.com',
  CAP: 'capgemini.com',
  GOOGL: 'abc.xyz',
  GOOG: 'abc.xyz',
}

/** The domain we would use for a symbol, or null when the ticker endpoint
 *  handles it (which is the normal case). */
export function domainFor(ticker) {
  return DOMAIN_EXCEPTIONS[normalise(ticker)] || null
}

function normalise(ticker) {
  return String(ticker || '').toUpperCase().trim()
}

/* -------------------------------------------------------------- cache */

/**
 * Two tiers. The Map is the hot path — a dashboard renders the same ticker in
 * three panels and must not touch localStorage (a synchronous, main-thread
 * API) once per render. localStorage is the cold start, so a returning user
 * sees logos on first paint with no network at all.
 */
const memory = new Map()
let hydrated = false

function hydrate() {
  if (hydrated) return
  hydrated = true

  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return

    const parsed = JSON.parse(raw)
    const now = Date.now()

    for (const [ticker, entry] of Object.entries(parsed)) {
      if (!entry || typeof entry.at !== 'number') continue
      const ttl = entry.url ? SUCCESS_TTL : FAILURE_TTL
      if (now - entry.at < ttl) memory.set(ticker, entry)
    }
  } catch {
    // Corrupt or unavailable storage (private mode, quota, hostile JSON) must
    // never stop the app rendering — we simply run without a warm cache.
  }
}

/** Debounced so a burst of resolutions on first paint writes once, not N times. */
let persistTimer = null
function persist() {
  if (typeof localStorage === 'undefined') return
  if (persistTimer) clearTimeout(persistTimer)

  persistTimer = setTimeout(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(memory)))
    } catch {
      // Quota exceeded — the in-memory cache still works for this session.
    }
  }, 500)
}

function cached(ticker) {
  hydrate()
  const entry = memory.get(ticker)
  if (!entry) return undefined

  const ttl = entry.url ? SUCCESS_TTL : FAILURE_TTL
  if (Date.now() - entry.at >= ttl) {
    memory.delete(ticker)
    return undefined
  }
  return entry
}

/* ---------------------------------------------------------- providers */

/*
 * `fallback=404` IS THE CORRECTNESS SWITCH, not a performance tweak.
 *
 * By default Logo.dev answers an unknown lookup with 200 and a GENERATED
 * placeholder — a generic letter tile. Rendering that would mean quietly
 * showing a fake logo for thousands of symbols it has no record of, which is
 * worse than a monogram because it looks authoritative. Measured: without this
 * flag `/ticker/JMKE` returns 200 + 409 bytes of placeholder; with it, a clean
 * 404. The 404 drives <img> onError -> monogram, which is the designed floor.
 */
const COMMON = (size) => `token=${LOGO_DEV_TOKEN}&size=${size * 2}&format=png&retina=true&fallback=404`

function logoDevDomainUrl(domain, size) {
  if (!LOGO_DEV_TOKEN) return null
  // `retina` doubles the raster so the mark stays crisp on high-DPI displays.
  return `https://img.logo.dev/${encodeURIComponent(domain)}?${COMMON(size)}`
}

/**
 * Ticker-addressed lookup — how every symbol resolves by default.
 *
 * This is what makes the logo system scale with the equity universe instead of
 * with a hand-written file: a company added by `npm run update-equities` gets
 * its logo automatically, with no entry anywhere in this module.
 */
function logoDevTickerUrl(ticker, size) {
  if (!LOGO_DEV_TOKEN) return null
  return `https://img.logo.dev/ticker/${encodeURIComponent(ticker)}?${COMMON(size)}`
}

/*
 * CLEARBIT HAS BEEN REMOVED as the second tier.
 *
 * `logo.clearbit.com` no longer resolves at all — the request fails at the
 * connection level, not with a 404. Clearbit sunset its free logo API. Keeping
 * it meant every symbol paid a guaranteed-failing network round trip before
 * reaching the monogram, which is strictly worse than going there directly.
 *
 * The monogram fallback is untouched and remains the floor for: no token, an
 * unmapped ticker, and any failed request.
 */

/* ------------------------------------------------------------- public */

/**
 * Ordered candidate URLs for a ticker. The caller tries them in sequence and
 * reports the outcome via `recordSuccess` / `recordFailure`.
 *
 * Returns [] when we already know there is nothing to find — that empty array
 * is what makes the monogram render immediately, with no flicker and no
 * request, for every symbol outside the domain map.
 *
 * @param {string} ticker
 * @param {{ domain?: string|null, size?: number }} options
 *   `domain` lets a caller supply a mapping we don't have; it takes priority.
 */
export function logoSources(ticker, { domain = null, size = 40 } = {}) {
  const symbol = normalise(ticker)
  if (!symbol) return []

  const entry = cached(symbol)
  if (entry) return entry.url ? [entry.url] : []

  if (!LOGO_DEV_TOKEN) {
    debugLogo(symbol, 'no VITE_LOGO_TOKEN configured — using monogram')
    return []
  }

  // An explicit `domain` from the caller, then a verified exception, then the
  // ticker endpoint. Exactly ONE candidate is returned in every case: the
  // alternatives are known to 404 for these symbols, and a guaranteed-failing
  // request before the monogram is the exact cost that removing Clearbit was
  // meant to eliminate.
  const host = domain || DOMAIN_EXCEPTIONS[symbol]
  if (host) {
    debugLogo(symbol, `domain exception -> ${host}`)
    return [logoDevDomainUrl(host, size)]
  }

  debugLogo(symbol, 'ticker endpoint')
  return [logoDevTickerUrl(symbol, size)]
}

/* -------------------------------------------------------------- debug */

/**
 * Developer-facing diagnostics, opt-in via `localStorage.everestLogoDebug = 1`.
 *
 * Off by default so a working app stays quiet. Messages never include the URL
 * or the token — only the symbol, the domain, and what happened — because the
 * token rides in the query string and console output gets pasted into issues.
 */
function debugEnabled() {
  try {
    return localStorage.getItem('everestLogoDebug') === '1'
  } catch {
    return false
  }
}

function debugLogo(symbol, message) {
  if (!debugEnabled()) return
  // eslint-disable-next-line no-console
  console.info(`[logos] ${symbol}: ${message}`)
}

/**
 * One-line health summary for the console. Reports whether a token is present
 * WITHOUT printing it, which is the question a developer actually has when
 * logos are not appearing.
 *
 *   import('/src/lib/logos.js').then(m => m.logoDiagnostics())
 */
export function logoDiagnostics() {
  hydrate()

  const cached_ = [...memory.entries()]
  const report = {
    tokenConfigured: Boolean(LOGO_DEV_TOKEN),
    tokenLooksValid: Boolean(LOGO_DEV_TOKEN && LOGO_DEV_TOKEN.startsWith('pk_')),
    provider: LOGO_DEV_TOKEN ? 'logo.dev' : 'monogram only',
    strategy: 'ticker endpoint, with a verified domain-exception map',
    domainExceptions: Object.keys(DOMAIN_EXCEPTIONS).length,
    cachedResolved: cached_.filter(([, e]) => e.url).length,
    cachedMisses: cached_.filter(([, e]) => !e.url).length,
  }

  if (!report.tokenConfigured) {
    report.fix =
      'Set VITE_LOGO_TOKEN in frontend/.env (NOT backend/.env — Vite only ' +
      'reads its own project root) and restart the dev server.'
  }
  return report
}

/**
 * Per-symbol resolution report for development.
 *
 *   import('/src/lib/logos.js').then(m => console.table(
 *     ['AAPL','SPCX','JMKE'].map(m.logoResolution)))
 *
 * Returns the DECISION, never the URL — the token rides in the query string
 * and this output is meant to be pasteable into a bug report.
 */
export function logoResolution(ticker) {
  const symbol = normalise(ticker)
  const entry = cached(symbol)
  const exception = DOMAIN_EXCEPTIONS[symbol] || null

  return {
    symbol,
    source: !LOGO_DEV_TOKEN
      ? 'monogram (no token)'
      : entry && !entry.url
        ? 'monogram (cached miss)'
        : entry
          ? 'cache'
          : exception
            ? 'logo.dev/domain'
            : 'logo.dev/ticker',
    domain: exception,
    cached: Boolean(entry),
    resolved: entry ? Boolean(entry.url) : null,
  }
}

/** Called once an image element has actually rendered the URL. */
export function recordSuccess(ticker, url) {
  const symbol = normalise(ticker)
  if (!symbol || !url) return

  hydrate()
  memory.set(symbol, { url, at: Date.now() })
  persist()
}

/** Called when every candidate has failed. Suppresses retries for FAILURE_TTL. */
export function recordFailure(ticker) {
  const symbol = normalise(ticker)
  if (!symbol) return

  hydrate()
  memory.set(symbol, { url: null, at: Date.now() })
  persist()
}

/** Test/debug affordance — clears both tiers. */
export function clearLogoCache() {
  memory.clear()
  hydrated = false
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Nothing to do; the memory tier is already cleared.
  }
}
