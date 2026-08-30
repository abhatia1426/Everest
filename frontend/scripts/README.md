# Development scripts

## `npm run update-equities`

Rebuilds the bundled equity universe used by every search surface in Everest
(command palette, Add Position, watchlist).

```bash
cd frontend
npm run update-equities
```

Writes `src/lib/equities.data.js`, which is **committed to the repo**. Review
the diff, run `npm test`, then commit.

### Why this exists

The dataset was previously ~200 hand-typed companies. It silently went stale:
SoFi, Reddit, Arm, CoreWeave, Kenvue, GE Vernova, Solventum and Veralto were
all missing despite being ordinary large listings, Block still appeared under
its retired `SQ` ticker, and `BRK` was present as a ticker that has never
existed.

### Source

The official exchange symbol directories:

- <https://www.nasdaqtrader.com/dynamic/symdir/nasdaqlisted.txt>
- <https://www.nasdaqtrader.com/dynamic/symdir/otherlisted.txt>

No key, no auth, no rate limit. These are the exchanges' own listing files, so
**a symbol's presence is itself the evidence that it is publicly traded** — a
private company cannot leak into search, and a delisted one drops out on the
next rebuild.

### Runtime is local — this is not negotiable

This script is **development-time only**. The app never fetches symbols.
Autocomplete is an in-memory scan of the bundled dataset (~1.5 ms per query at
5.4k records), which is what keeps typing free of network traffic. If you ever
find yourself adding a runtime symbol API, that is a different change and needs
the debounce / cancellation / cache guarantees in `useAssetSearch` revisited.

### What gets filtered out

Kept: common stock, ordinary shares, ADRs, REIT shares of beneficial interest,
and the handful of broad-market ETFs in `equities.etfs.json`.

Dropped: warrants, units, rights, preferred shares, ETNs, closed-end funds,
SPAC acquisition vehicles, test issues, coupon-bearing instruments, and the
~4,000 other ETFs (they would bury real companies in a stock search).

Sector/industry are not published in these files. Curated values for the
original ~200 companies are merged back in from `equities.curated.json`;
everything else is `null`, which the UI already handles — richer metadata
arrives with the quote response after a symbol is selected.

### Files

| File | Committed | Purpose |
| --- | --- | --- |
| `update-equities.mjs` | yes | the generator |
| `equities.curated.json` | yes | hand-curated sector/industry, merged by ticker |
| `equities.etfs.json` | yes | the short allowlist of ETFs kept in search |
| `../src/lib/equities.data.js` | yes | **generated** — do not edit by hand |
