# 04 — Portfolio: the field book, opened

Date: 2026-08-18
Status: approved, implementing
Scope: `frontend/src/components/landing/Portfolio.jsx` and `portfolio.data.js` **only**.

## Why this replaces the core column

The previous 04 was a drilled core sample — a 420px column whose segment heights
were portfolio weights. It was a good drawing, but it was the *third survey plate
in a row*: 03 plan view, 04 core, 05 section. Three orthogonal projections of one
survey read as one long act of measuring. The page never stops surveying long
enough to let the reader arrive.

The arc is now:

```
03 — Survey the portfolio
04 — Open the portfolio      <- register change
05 — Understand the market
```

A surveyor works three artifacts: the terrain, the **field book** they record
readings in, and the section they draw from it. 03 and 05 own the drawings. The
field book is the one Everest-native object left, it is literally "the book," and
it is not a plate. That is 04.

## The object

One spread inside a `max-w-[1240px]` container:

- **Left — the register.** The named positions, one entry each, plus the unnamed
  remainder.
- **A hairline fold** between the two columns. One pixel of `--border`. Not a
  panel edge, not a container.
- **Right — the reading.** Marginalia. No card, no background, no radius, no
  border box, in any state.

The datum runs full-bleed beneath the spread, outside the container.

## The register: allocation is the page's rhythm

The column's one honest idea was *geometry equals capital*. That idea survives;
the column does not.

**Each entry's vertical extent is its weight, mathematically.** `height = (weight
/ 100) × R`, no scaling factor, no exaggeration, no minimum that would break
proportionality for a visible row. NVDA's entry is physically about twice AMZN's
because it is about twice the capital. Reading down the page you feel the
concentration in the spacing of the rules.

Entry content is **top-aligned**, hanging from its own rule. The whitespace below
an entry is not padding — it is the capital that position occupies. This is what
makes a 149px NVDA row read as a book entry rather than a mis-centred table row.

`R` (register height) is chosen so the smallest named position clears the entry's
own content height:

| Position | Weight | Row @ R=620 |
|---|---|---|
| NVDA | 24.1% | 149px |
| AAPL | 21.0% | 130px |
| MSFT | 18.1% | 112px |
| LLY  | 14.6% |  91px |
| AMZN | 12.3% |  76px |
| 9 unnamed | 9.9% | 61px |

The unnamed remainder is present and hatched, never omitted. A register of five
entries that silently summed to 90.1% would be the book lying about its own size.

### Carried from 03, and nothing more

Only what establishes continuity:

- the **2% graduation** in the left margin — 03's contour interval, every fifth
  rung heavier, labelled every 20% where there is room for lettering
- the **triangulation mark** (✛) at each entry's leading edge
- the **datum**
- **ambient `MassifContours`** at `opacity-[0.13]`, unchanged — 05 picks these up
  at exactly this weight and collapses them onto its datum
- restrained drafting rules (hairlines between entries)

No added grids, coordinates, neatlines, title blocks, or technical decoration.

## The reading: a margin that is never empty

Nothing the section needs to say is gated behind an interaction the reader may
never attempt. At rest the margin reads the whole book:

```
THE BOOK
$179,386.40
+1.36% today
─────────────────────
14 positions
5 named · 90.1% of capital

Top three hold 63.2% of capital.
```

Reach for an entry and the margin is rewritten as that position's reading:

```
SEMICONDUCTORS
◎ NVDA
NVIDIA Corporation
─────────────────────
$43,222.00      24.1% of book
+1.65%          +$701.53 today
─────────────────────
1st of 14 by capital
1st of 5 named by today's move

Your largest position, and today's
largest mover.
```

### The payload

Weight — all the column ever showed — cannot tell you what actually moved you.

| | by capital | by today's move |
|---|---|---|
| NVDA | 1 | 1 |
| AAPL | 2 | **4** |
| MSFT | 3 | 3 |
| LLY  | 4 | **2** |
| AMZN | 5 | 5 |

AAPL is the second largest holding and fourth of five by what it moved. LLY is
fourth by capital and second by move. That divergence is the understanding this
section exists to deliver, and it is pure arithmetic on `value` and `change`.

## Honesty constraints

Data is `DEMO_HOLDINGS` / `DEMO_WATCHLIST` from `landing/panels` — the same array
03 contours and 05 cuts. Real `CompanyLogo`. No figure is invented.

- **Day's dollar move** is derived: `value − value / (1 + change/100)`. `value` is
  the current value, so the prior close must be divided out, not multiplied.
- **No book-level dollar move is ever printed.** `portfolio.data.js` already
  documents why: the five named positions move ~$1,100 between them, against an
  implied ~$2,407 for the book, because the unnamed 9.9% also moved. Printing
  both invites an addition that does not close. Book level is percentage only.
- **Rank denominators are stated, not blurred.** Rank by capital is "of 14" —
  valid because the unnamed 9 share 9.9%, averaging 1.1% each, so all five named
  positions outrank all nine. Rank by move is "of the 5 named," because the other
  nine positions' moves are unknown.
- The derived remark is generated from the two ranks, never authored per ticker.

## Interaction: tactile, optional, not a control

- Reach for an entry — **hover or keyboard focus** — and the margin becomes that
  position; siblings recede to ~0.4; the reached entry holds full weight and its
  triangulation mark goes accent.
- **Click latches**, so touch works. Click again, `Esc`, mouse-leave, or blur
  returns the margin to the book.
- Each entry is a real `<button>` with `aria-pressed`. The margin is
  `aria-live="polite"`. The remainder row is not interactive — there is nothing
  to read behind it.
- **Motion communicates focus, not decoration**: a 260ms opacity fall on
  siblings, a ~0.28s crossfade with a 6px rise on the margin. No springs, no
  overshoot, no idle loops.

### Narrow (<820px)

The margin cannot sit beside anything. It does what a field book actually does —
the reading writes itself **beneath the entry you opened**, with an animated
height. Proportional rows are intact at rest; opening deliberately disturbs the
page, which is the gesture, not jank. One entry open at a time.

### Reduced motion

The spread is complete and readable with no interaction and no animation. Every
register figure is on screen at rest, and the margin's default state is a
finished statement about the book. Reveal transforms resolve to their end state.

## Scroll

Paces the reading, never gates it: heading masks in, the crown rule draws across
the top of the register, entries resolve heaviest-first, the book's figures rise,
and **the datum runs out to both edges last**.

## The seam to 05 — unchanged

05 is frozen and depends on two things 04 hands it:

1. `MassifContours count={7} stroke="var(--text-tertiary)"` at `opacity-[0.13]`
2. a full-bleed datum whose label is `e-label` "Datum" at
   `absolute left-[var(--space-page)] -translate-y-full pb-1`

Both are preserved exactly. 05 opens on the same line, in the same place, with
the same word.

## Copy

> **04 — PORTFOLIO**
> ## The book behind the map.
> Every position at the weight it carries — and what each one actually did today.

## Out of scope

Hero, Nav, Ascent (02), Terrain (03), Market (05), story.jsx, panels.jsx,
everest.jsx, tokens. No new dependencies — Motion is installed; Bklit UI and
Kokonut UI are used as *reference* for the focus-recede and margin crossfade
patterns, ported into Everest's tokens rather than added to the build.

## Verification

Desktop, tablet, mobile; dark and light; reduced motion; keyboard focus; hover
and click; the 04→05 seam. Lint, frontend and backend tests, production build,
horizontal overflow, console.
