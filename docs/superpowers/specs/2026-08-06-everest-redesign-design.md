# Everest — product redesign

**Date:** 2026-08-06
**Status:** Phase 1 (foundation + Dashboard flagship) approved for implementation

---

## Goal

Mature Everest from a glass/aurora-dominant interface into a premium investing
platform: Linear/Stripe/Ramp craftsmanship in typography and hierarchy,
Wealthfront clarity in the investing story, Bloomberg precision in the data —
while keeping Everest's own identity (summit mark, blue→violet accent ramp,
landing hero).

Backend, hooks, routes and API contracts are unchanged throughout.

## Approach

Foundation first, then **Dashboard as the flagship reference implementation**.
The design language is reviewed and approved on the Dashboard before it is
applied to the remaining eight surfaces.

---

## Diagnosis of the current Dashboard

Seven full-width bands stack in identical `Panel` chrome. The grid is nominally
asymmetric but every card carries the same 24px radius, glass recipe and
`icon + title` header, so nothing is subordinate to anything — it reads as a
scroll, not a command center.

Specific defects:

- The hero splits its own emphasis: a display-size value competes with three
  `MetricChip` boxes and a `ClimbProgress` bar.
- Four quick-action pills duplicate destinations already in the sidebar nav.
- Movers renders two side-by-side sub-lists, halving row width so an 8-item
  list reads as two 4-item scraps.

---

## Design language changes

| Token | Before | After |
|---|---|---|
| `--radius-card` | 24px | 14px |
| `--radius-panel` | 16px | 10px |
| `--radius-control` | 12px | 8px |
| Aurora mesh | fixed layer behind entire app | scoped to landing hero + auth |
| Card surface | glass blur everywhere | opaque layered surface, hairline border |
| Glass | all cards | chrome only: topbar, command palette, modals, mobile nav |

Blur is retained exactly where it does functional work — surfaces that content
scrolls underneath. Behind numbers it is noise.

Everest identity retained: summit mark, blue→violet accent ramp (now reserved
for interactive and AI states rather than decoration), landing hero.

### Removals from the Dashboard

- **`ClimbProgress`** — decorative bar competing with data in the highest-value
  screen real estate. Component is retained in the codebase for Settings,
  onboarding or Landing.
- **News panel** — showed headlines for one arbitrarily-chosen symbol (largest
  holding). Contextual news belongs on Stock Detail.

Freed space goes to higher-value investor information. Hierarchy contract:
**portfolio first → decisions second → supporting information third.**

---

## Dashboard structure

Twelve-column bento. No row has equal halves; spans run 12 / 8+4 / 7+5 / 5+4+3,
so hierarchy is structural rather than decorative.

| Zone | Span | Content |
|---|---|---|
| A Market strip | 12 | Market status + index chips. Hairline, no card. |
| B Command bar | 12 | Portfolio value (display size, sole anchor), day change, hairline-divided metric group, one primary action. |
| C Performance | 8 | Area chart, segmented range control, vs-SPY toggle. |
| D Allocation | 4 | Donut + sector weight bars. |
| E Holdings | 7 | Dense rows: logo, name, value, day change, sparkline, weight bar. |
| F Movers | 5 | One ranked list, gainers → losers, full row width. |
| G AI insights | 5 | Accent left edge, typographic treatment. |
| H Watchlist | 4 | Five rows with sparklines. |
| I Activity | 3 | Compact timeline, no card chrome. |

Responsive: 12-col → 8-col at tablet (C/D stack, E/F stack, G/H/I → 2+1) →
single column at mobile, with the command bar's metric group wrapping to 2×2.

The command bar fixes the split-emphasis defect: the value is the only
display-size element, and supporting metrics become a hairline-divided
horizontal group — no boxes, chips or nested cards. The four quick-action pills
collapse to one primary button (`+ Add position`).

---

## Component architecture

### New primitives (reused across all later surfaces)

- `lib/logos.js` — the logo **service**. Owns provider selection, ticker→domain
  mapping, caching and fallback. No component contains fetching logic.
- `ui/CompanyLogo.jsx` — presentation only. Props: `ticker`, `name`, optional
  `domain`, `size`. Fades from monogram to real mark on load; identical box
  size in every state so rows never reflow.
- `ui/Surface.jsx` — the new default card (opaque, layered, 14px).
- `ui/Segmented.jsx` — segmented control replacing `PillGroup` for chart ranges.
- `ui/MetricGroup.jsx` — hairline-divided stat row.
- `ui/SectionHeader.jsx` — typographic header (label · rule · action).
- `ui/DataRow.jsx` — dense row shared by Holdings / Movers / Watchlist.
- `ui/WeightBar.jsx` — allocation weight bar.

`GlassCard` is retained but demoted to chrome-only usage.

### New dashboard modules (`components/dashboard/`)

`MarketStrip`, `CommandBar`, `PerformancePanel`, `AllocationPanel`,
`HoldingsPanel`, `MoversPanel`, `InsightRail`, `ActivityFeed` — replacing the
single 383-line `Panels.jsx`.

### Rewritten

`styles/tokens.css`, `index.css` (card recipe, type scale, tabular numerics),
`pages/app/Dashboard.jsx` (composition only).

### Untouched

Every hook (`useApi`, `useMode`, `useWatchlist`, `useAuth`), `lib/api.js`, all
routes, the entire backend. Polling intervals, paper/real mode and the
stale-price fallback keep their current behaviour.

---

## Logo system

Layered resolution, owned entirely by `lib/logos.js`:

1. Cached URL (memory `Map`, then `localStorage`)
2. Logo.dev, when `VITE_LOGO_TOKEN` is present
3. Clearbit (`logo.clearbit.com/{domain}`), no key required
4. Everest monogram fallback

Requirements:

- Successful URLs persist in `localStorage`; failures are **negatively cached
  with a TTL** so a 404 is not re-requested on every render.
- A failed or broken image never surfaces a broken-image icon — the monogram
  is always the floor.
- The monogram is a first-class design element: proper initials, brand-derived
  colour from `lib/brandColors.js`, consistent sizing.
- Integrated everywhere a company appears: Dashboard movers and holdings,
  Portfolio, Watchlist, search/autocomplete, Stock Detail, AI reports.

## Loading and empty states

Skeletons match final layout geometry exactly, so nothing reflows when data
lands. Each panel gets a purposeful empty state rather than a generic centered
sentence.

---

## Phase 2 — remaining surfaces (approved 2026-08-07)

The Dashboard is the reference for the design **language**, not a layout
template. Each surface gets a composition matched to its primary task.

| Surface | Primary task | Composition |
|---|---|---|
| Portfolio | compare and manage positions | book summary + toolbar + aligned **holdings ledger**. Rows, not a card grid: comparison needs columns. |
| Watchlist | sweep many symbols for movement | scan strip + toolbar + compact **monitor tiles**, 4-up, sorted by absolute move, pins first. |
| Stock Detail | form a view on one company | two-column research layout: unified price/chart instrument + narrative tabs, sticky reference rail (your position → statistics → ranges → about). |
| AI Workspace | ask a tool about your book | existing three-column architecture retained (it was already right); language, tool rail and report canvas restyled. |
| Options | understand exposure and time pressure | risk band + **expiration timeline** + contract cards built around a **strike meter** (spot/strike/breakeven on one axis). |
| Landing | brand and product storytelling | asymmetric feature bento, accent restrained to the hero. |
| Auth | minimal entry | split brand/form layout retained; aurora re-scoped via `.ambient`. |
| Settings | utility | grouped sections; decorative aurora crown removed. |

### Options and Greeks

The API returns no delta/gamma/theta/vega and no implied volatility or
risk-free rate to derive them from. **No Greeks are displayed.** Deriving them
from assumed inputs would put guesses on screen in the shape of measurements.

`lib/options.js` provides what the data honestly supports: breakeven,
moneyness, distance to breakeven, capital at risk (for long options the premium
paid *is* the maximum loss), and expiry buckets.

### Landing page social proof

The v2 strip claimed "4.9 from 800+ reviews", "2,000+ traders" and "$2M+ in
portfolios". No reviews table, user counter or AUM figure exists anywhere in
the codebase — these were fabricated. Replaced with a capability strip whose
every figure is verifiable from source (six AI tools, two books, 30s refresh).
Real metrics can be substituted whenever they exist.

### Other integrity fixes

- AI tool "prompts" rendered as pill-shaped spans with no click handler — an
  affordance the interface could not honour. Restated as prose.
- `RangeBar` drew a red→green gradient across its whole track, implying a low
  price is bad and a high price good. Track is now neutral.
- The option expiry field hardcoded `[color-scheme:dark]`, rendering a dark
  native picker on a white form. `color-scheme` now comes from the theme.

### Client-side additions (no backend change)

- `hooks/useFavorites` — watchlist pinning in `localStorage`. The watchlist API
  has no favourite field, and adding one is a schema change outside a redesign.
