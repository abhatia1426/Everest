import { Link } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'

import { CompanyLogo } from '../ui/CompanyLogo'
import { Surface } from '../ui/Surface'
import { equityOrFallback } from '../../lib/equitySource'
import { fmtMoneyRounded, fmtPercent } from '../../lib/format'
import { smoothPath } from '../../lib/portfolio'

/**
 * Today's Brief — the measured half of the route.
 *
 * NOTHING HERE IS GENERATED. Every statement, figure and proof bar comes from
 * `lib/brief.js`, which is pure arithmetic over the user's own records. That is
 * why this component takes `items` and not a request state: it cannot fail
 * because the AI failed, and it renders identically whether a provider is
 * configured or not.
 *
 * Each item carries its own proof at the same scale as its claim — a bar whose
 * filled fraction IS the percentage the sentence quotes — so the figure and the
 * picture cannot drift apart.
 */
const TONE_TEXT = {
  up: 'text-up',
  down: 'text-down',
  warn: 'text-warn',
  neutral: 'text-text-primary',
}

const TONE_LABEL = {
  up: 'text-up',
  down: 'text-down',
  warn: 'text-warn',
  neutral: 'text-text-tertiary',
}

const BAR_FILL = {
  up: 'var(--accent-green)',
  down: 'var(--accent-red)',
  warn: 'var(--accent-amber)',
  brand: 'var(--accent-blue)',
}

export function TodaysBrief({ items }) {
  return (
    <Surface as="section" className="overflow-hidden p-0">
      <header className="flex flex-wrap items-center gap-2.5 border-b border-subtle px-4 py-3.5 sm:px-5">
        <h2 className="t-eyebrow">Today’s brief</h2>
        <span className="num rounded-md bg-tint/[0.05] px-1.5 py-0.5 text-[10px] font-bold text-text-secondary">
          {items.length} measurement{items.length === 1 ? '' : 's'}
        </span>
        {/* The provenance claim, stated once, at the top, in the product's
            own words. It is a promise about HOW these numbers were made. */}
        <span className="ml-auto text-[10.5px] text-text-tertiary">
          Calculated directly from your Everest data
        </span>
      </header>

      {items.length === 0 ? (
        <p className="px-4 py-6 text-[12.5px] leading-relaxed text-text-secondary sm:px-5">
          There is nothing Everest can measure yet. Record a holding, track a symbol, or add a
          contract, and the brief fills in from your own records.
        </p>
      ) : (
        <ul>
          {items.map((item, index) => (
            <li
              key={item.id}
              className={index < items.length - 1 ? 'border-b border-subtle' : ''}
            >
              <BriefItem item={item} />
            </li>
          ))}
        </ul>
      )}
    </Surface>
  )
}

function BriefItem({ item }) {
  return (
    <article className="px-4 py-4 sm:px-5">
      <div className="mb-2.5 flex items-center gap-2.5">
        <h3
          className={`t-eyebrow !text-[9px] ${TONE_LABEL[item.labelTone] || TONE_LABEL.neutral}`}
        >
          {item.label}
        </h3>
        <Link
          to={item.route.to}
          className="ml-auto flex shrink-0 items-center gap-1.5 whitespace-nowrap text-[11px]
            font-semibold text-accent transition-colors duration-150 hover:text-text-primary"
        >
          {item.route.label}
          <ChevronRight size={11} />
        </Link>
      </div>

      <div className="flex items-start gap-3">
        {item.ticker ? (
          <CompanyLogo
            ticker={item.ticker}
            name={equityOrFallback(item.ticker).name}
            size={32}
            className="mt-0.5 shrink-0"
          />
        ) : null}
        <p className="min-w-0 flex-1 text-[14px] font-semibold leading-[1.35] tracking-[-0.015em] text-text-primary sm:text-[14.5px]">
          {item.statement}
        </p>
      </div>

      <div className="mt-3 flex flex-wrap items-baseline gap-2.5">
        <span
          className={`num font-display text-[22px] font-extrabold leading-none tracking-[-0.045em] ${
            TONE_TEXT[item.figureTone] || TONE_TEXT.neutral
          }`}
        >
          {formatFigure(item)}
        </span>
        <span className="text-[11px] text-text-tertiary">{noteFor(item)}</span>
      </div>

      {item.proof?.kind === 'bar' ? <ProofBar proof={item.proof} /> : null}
      {item.proof?.kind === 'spark' ? <ProofSpark proof={item.proof} tone={item.figureTone} /> : null}

      <Sources sources={item.sources} />
    </article>
  )
}

/* ------------------------------------------------------------- proofs */

/**
 * A bar whose filled fraction IS the fraction the sentence quotes.
 *
 * The track is hatched, not merely dim: the unfilled remainder is "the rest of
 * a measured whole", which is a different thing from an empty bar, and the
 * hatch is the encoding the rest of the product already uses for that.
 */
function ProofBar({ proof }) {
  // Offsets are resolved BEFORE the JSX rather than accumulated inside the
  // map: mutating a closure variable during render is not safe under
  // re-invocation, and this is a pure layout fold anyway.
  const placed = []
  proof.segments.reduce((offset, segment) => {
    const width = clamp(segment.fraction) * 100
    placed.push({ ...segment, left: offset, width })
    return offset + width
  }, 0)

  return (
    <>
      <div
        title={proof.tip}
        className="track hatch-dim relative mt-3 h-2.5 cursor-help overflow-hidden rounded-md"
      >
        {placed.map((segment, index) => {
          return (
            <span
              key={index}
              className="absolute inset-y-0 origin-left animate-grow-x"
              style={{
                left: `${segment.left}%`,
                width: `${segment.width}%`,
                background: BAR_FILL[segment.tone] || BAR_FILL.brand,
                // Successive brand segments step down so a three-sector bar
                // reads as three sectors rather than one long block.
                opacity: segment.tone === 'brand' ? 1 - index * 0.26 : 1,
                animationDelay: `${120 + index * 60}ms`,
                boxShadow: 'inset -1px 0 0 var(--e2-bg)',
              }}
            />
          )
        })}
        {typeof proof.markFraction === 'number' ? (
          <span
            aria-hidden="true"
            className="absolute -inset-y-0.5 w-0.5 -translate-x-1/2 bg-text-primary"
            style={{ left: `${clamp(proof.markFraction) * 100}%` }}
          />
        ) : null}
      </div>
      <div className="mt-1.5 flex items-baseline justify-between gap-3 text-[10px] text-text-tertiary">
        <span className="min-w-0 truncate">{proof.axisLeft}</span>
        <span className="shrink-0">{axisRight(proof)}</span>
      </div>
    </>
  )
}

/**
 * Portfolio against the benchmark, both drawn on their OWN vertical scale.
 *
 * The two lines answer "which shape rose more", and the figure beside them
 * carries the actual difference. Sharing one y-axis would make a $2M book and a
 * $600 index look like a comparison of magnitudes, which is not the claim.
 */
function ProofSpark({ proof, tone }) {
  const stroke = tone === 'down' ? 'var(--accent-red)' : 'var(--accent-green)'

  return (
    <>
      <div className="relative mt-3 h-[46px]" title={proof.tip}>
        <svg
          viewBox="0 0 300 40"
          preserveAspectRatio="none"
          className="absolute inset-0 h-full w-full overflow-visible"
          aria-hidden="true"
        >
          <path
            d={smoothPath(proof.bench, 300, 40)}
            fill="none"
            stroke="var(--text-tertiary)"
            strokeWidth="1.6"
            strokeDasharray="3 3"
            vectorEffect="non-scaling-stroke"
          />
          <path
            d={smoothPath(proof.mine, 300, 40)}
            fill="none"
            stroke={stroke}
            strokeWidth="2.2"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      </div>
      <div className="mt-1.5 flex flex-wrap items-baseline gap-3 text-[10px] text-text-secondary">
        <span className="flex items-center gap-1.5">
          <span className="h-0.5 w-3" style={{ background: stroke }} />
          your portfolio {fmtPercent(proof.mineReturn)}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 border-t-2 border-dashed border-text-tertiary" />
          {proof.benchmark} {fmtPercent(proof.benchReturn)}
        </span>
      </div>
    </>
  )
}

/**
 * Which data produced this item.
 *
 * FRIENDLY NAMES ONLY — "Quotes", not `/prices`. The tooltip says what that
 * source supplied. No payload, endpoint or tool-call log is ever shown.
 */
function Sources({ sources }) {
  return (
    <div className="mt-3 flex flex-wrap items-center gap-1.5">
      <span className="text-[9.5px] text-text-tertiary">from</span>
      {sources.map((source) => (
        <span
          key={source.name}
          title={source.detail}
          className="flex cursor-help items-center gap-1.5 whitespace-nowrap rounded-full border
            border-subtle bg-tint/[0.03] px-2 py-0.5 text-[10px] font-semibold text-text-secondary"
        >
          <span className="h-1 w-1 rounded-full bg-accent" />
          {source.name}
        </span>
      ))}
    </div>
  )
}

/* ------------------------------------------------------------ helpers */

function clamp(fraction) {
  if (typeof fraction !== 'number' || Number.isNaN(fraction)) return 0
  return Math.min(1, Math.max(0, fraction))
}

function formatFigure(item) {
  if (item.figureKind === 'money') return fmtMoneyRounded(item.figure, { signed: true })
  if (item.figureKind === 'percent') {
    return item.id === 'concentration'
      ? `${item.figure.toFixed(1)}%`
      : fmtPercent(item.figure)
  }
  if (item.figureKind === 'days') return `${item.figure} day${item.figure === 1 ? '' : 's'}`
  return String(item.figure)
}

function noteFor(item) {
  if (item.figureNoteKind === 'money-pair') {
    const [part, whole] = item.figureNoteValues
    return `${fmtMoneyRounded(part)} of ${fmtMoneyRounded(whole)} market value`
  }
  return item.figureNote
}

function axisRight(proof) {
  if (typeof proof.axisRightMoney === 'number') {
    return `${fmtMoneyRounded(proof.axisRightMoney)} ${proof.axisRightSuffix}`
  }
  return proof.axisRight
}
