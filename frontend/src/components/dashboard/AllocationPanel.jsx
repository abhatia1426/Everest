import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import { EmptyState, Skeleton } from '../States'
import { squarify } from '../../lib/treemap'
import { fmtMoney, fmtPercent } from '../../lib/format'

/**
 * Allocation — a squarified treemap where AREA IS WEIGHT.
 *
 * This replaces a set of proportional columns. Columns rank correctly but they
 * encode weight as height alone, so the module spent most of its area on the
 * largest holding and rendered the tail as five near-identical stubs. Area is
 * the encoding the question actually wants: a position that is 3% of the book
 * occupies 3% of the rectangle, and "how concentrated am I" is answerable
 * without reading a single number.
 *
 * PAGE-SPECIFIC ON PURPOSE. Portfolio answers concentration with a horizontal
 * ribbon, because there the ranked ledger beneath it is the subject and the
 * ribbon is an index into it. Here the allocation IS the subject. Two different
 * questions, two different objects — collapsing them into one shared component
 * is exactly the homogenisation this redesign is avoiding.
 *
 * Both dimensions are real:
 *   Positions — market_value per holding, straight from /pnl.positions
 *   Sectors   — the /pnl.allocation the backend already aggregates
 *
 * There is deliberately no third dimension. Everest stores no geography, asset
 * class or market-cap data, and a treemap is a convincing enough object that an
 * invented axis would read as measured fact.
 */

/*
 * A single-hue ramp, not a categorical palette.
 *
 * Category colours would imply the tiles belong to different KINDS of thing;
 * they do not — they are all slices of one number, and the only variable that
 * matters is size. Stepping one blue by lightness keeps adjacent tiles
 * separable while letting area stay the sole quantitative channel. Everest
 * blue is the brand colour and this is a brand surface, not a data series, so
 * green and red stay free to mean direction inside the tiles.
 */
const RAMP = [
  '#1E4BD8',
  '#2F6BFF',
  '#4C82FF',
  '#1B49D6',
  '#6E9BFF',
  '#2A5FE0',
  '#7FA6FF',
  '#5488FF',
  '#8AAFFF',
  '#A6C2FF',
  '#B9CEFF',
  '#C7D8FF',
]

/**
 * Readable ink for a given tile, by contrast rather than by guess.
 *
 * The ramp runs from a deep blue to near-white, so a fixed white label is
 * unreadable on the light end and a fixed dark label is unreadable on the deep
 * end. Computing relative luminance picks the one that actually passes.
 */
function inkOn(hex) {
  const channel = (value) => {
    const c = value / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  const luminance = 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)

  const onWhite = 1.05 / (luminance + 0.05)
  const onDark = (luminance + 0.05) / 0.07
  return onWhite >= onDark ? '#FFFFFF' : '#08132E'
}

export function AllocationPanel({ positions = [], loading }) {
  const [hovered, setHovered] = useState(-1)

  const items = useMemo(() => {
    return positions
      .filter((position) => (position.market_value || 0) > 0)
      .map((position) => ({
        key: position.ticker,
        value: position.market_value,
        ticker: position.ticker,
        changePercent: position.change_percent,
      }))
  }, [positions])

  const total = useMemo(() => items.reduce((sum, item) => sum + item.value, 0), [items])

  const tiles = useMemo(() => {
    const laid = squarify(items, 100, 100)
    return laid.map((tile, index) => {
      const fill = RAMP[index % RAMP.length]
      const weight = total ? (tile.value / total) * 100 : 0
      return {
        ...tile,
        weight,
        fill,
        ink: inkOn(fill),
        // Labels are dropped rather than shrunk below legibility. A 6px
        // ticker in a sliver is noise; the tooltip still carries the detail.
        /*
         * Three legibility tiers, keyed to the tile's own geometry.
         *
         * A label is DROPPED rather than shrunk past readability: a 7px ticker
         * in a sliver is noise that makes the treemap look broken, where an
         * unlabelled sliver plus a tooltip looks deliberate. The weight only
         * appears once the tile can carry it at display size, which is what
         * gives the map its two-tier reading — big names shout their share,
         * small ones just hold their area.
         */
        showKey: true,
        showWeight: tile.h > 13 && tile.w > 13,
        keySize: tile.w > 28 && tile.h > 26 ? '15px' : tile.w > 16 ? '12px' : '10.5px',
        weightSize: tile.w > 28 && tile.h > 26 ? '24px' : tile.w > 16 ? '13px' : '11px',
        showPct: tile.h > 26 && tile.w > 22,
      }
    })
  }, [items, total])

  const topThree = useMemo(
    () => tiles.slice(0, 3).reduce((sum, tile) => sum + tile.weight, 0),
    [tiles],
  )

  if (loading) {
    return (
      <section className="module flex flex-col p-5">
        <h2 className="mb-4 font-display text-[19px] font-bold tracking-[-0.035em] text-text-primary">Allocation</h2>
        <Skeleton className="mt-3.5 w-full rounded-[16px]" style={{ height: 248 }} />
      </section>
    )
  }

  if (tiles.length === 0) {
    return (
      <section className="module flex flex-col p-5">
        <h2 className="mb-4 font-display text-[19px] font-bold tracking-[-0.035em] text-text-primary">Allocation</h2>
        <EmptyState
          title="Nothing allocated"
          description="Your allocation appears once you hold positions."
        />
      </section>
    )
  }

  return (
    <section className="module flex flex-col p-5">
      <div className="flex items-center gap-2.5">
        <h2 className="font-display text-[19px] font-bold tracking-[-0.035em] text-text-primary">
          Allocation
        </h2>
        <span className="text-[11.5px] text-text-tertiary">area = weight</span>

      </div>

      <div className="relative mt-3.5 w-full overflow-hidden rounded-[16px]"
        style={{ height: 248 }}>
        {tiles.map((tile, index) => {
          const body = (
            <>
              <span
                className="block font-display font-bold leading-none tracking-[-0.03em]"
                style={{ fontSize: tile.keySize }}
              >
                {tile.key}
              </span>
              {tile.showWeight ? (
                <span
                  className="mt-0.5 block font-display font-bold leading-none tracking-[-0.03em]"
                  style={{ fontSize: tile.weightSize, opacity: 0.92 }}
                >
                  {tile.weight.toFixed(1)}%
                </span>
              ) : null}
              {/* The day move, on tiles large enough to carry a third line —
                  the design's `showPct` tier. Only rendered when the position
                  actually has a measured move. */}
              {tile.showPct && typeof tile.changePercent === 'number' ? (
                <span
                  className="mt-0.5 block text-[11px] font-semibold"
                  style={{ opacity: 0.76 }}
                >
                  {fmtPercent(tile.changePercent)}
                </span>
              ) : null}
            </>
          )

          const style = {
            padding: '9px 10px',
            left: `${tile.x}%`,
            top: `${tile.y}%`,
            width: `${tile.w}%`,
            height: `${tile.h}%`,
            background: tile.fill,
            color: tile.ink,
            // The gap is drawn with the panel colour rather than a gap
            // property, so tiles stay a single continuous rectangle.
            borderRight: '2px solid var(--panel-bg)',
            borderBottom: '2px solid var(--panel-bg)',
            filter: hovered === index ? 'brightness(1.14)' : 'none',
          }

          const title = `${tile.key} · ${tile.weight.toFixed(1)}% · ${fmtMoney(tile.value)}${
            typeof tile.changePercent === 'number'
              ? ` · ${fmtPercent(tile.changePercent)} today`
              : ''
          }`

          // A tile is a link only when it names a security we can route to.
          // A sector has no detail page, so it stays a plain region rather
          // than an affordance that goes nowhere.
          return tile.ticker ? (
            <Link
              key={tile.key}
              to={`/app/ticker/${tile.ticker}`}
              title={title}
              onMouseEnter={() => setHovered(index)}
              onMouseLeave={() => setHovered(-1)}
              onFocus={() => setHovered(index)}
              onBlur={() => setHovered(-1)}
              className="absolute overflow-hidden transition-[filter] duration-150"
              style={style}
            >
              {tile.showKey ? body : null}
            </Link>
          ) : (
            <div
              key={tile.key}
              title={title}
              onMouseEnter={() => setHovered(index)}
              onMouseLeave={() => setHovered(-1)}
              className="absolute overflow-hidden transition-[filter] duration-150"
              style={style}
            >
              {tile.showKey ? body : null}
            </div>
          )
        })}
      </div>

      <p className="mt-3 flex items-baseline gap-2 text-[11.5px] text-text-tertiary">
        <span>Top three</span>
        <span className="num font-bold text-text-primary">{topThree.toFixed(1)}%</span>
        <span>of portfolio</span>
      </p>

      {/*
        NO CASH TILE, AND NO NOTE ABOUT ITS ABSENCE.

        The design's treemap includes a hatched CASH tile. Everest models no
        cash balance, and in a treemap the slot IS the value — a rectangle of
        any size asserts a weight — so there is no honest geometry for it.

        An earlier pass added a caption explaining the omission and scoped the
        percentages to "equity". Both are now gone: with no cash model, the
        positions ARE the portfolio, so these weights are portfolio weights
        with nothing excluded, and a footnote about a missing cash tile only
        reintroduces cash as a concept the reader is invited to look for.
      */}
    </section>
  )
}
