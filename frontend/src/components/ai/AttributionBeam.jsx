import { useMemo } from 'react'

import { Surface } from '../ui/Surface'
import { beamLabels, layoutBeam } from '../../lib/attribution'
import { fmtMoney, fmtMoneyRounded, fmtPercent } from '../../lib/format'

/**
 * The attribution beam — the route's signature visualization.
 *
 * WHAT IT ENCODES, and nothing else:
 *
 *   · a previous-close anchor, drawn as a solid rule
 *   · detractors stacking LEFT of it, contributors stacking RIGHT
 *   · WIDTH = dollars, on one scale shared by both sides
 *   · green / red = the direction of a financial contribution
 *   · a dashed marker at the net
 *
 * Width is dollars, NOT portfolio weight. A 4%-weight holding that moved hard
 * is wider here than a 30%-weight holding that did not, and that inversion is
 * the entire point of the chart — it answers "what moved the number", which a
 * weight chart cannot.
 *
 * The tooltip on every segment shows the arithmetic in full — shares, both
 * prices, the product — so a bar can always be checked rather than believed.
 */
export function AttributionBeam({ attribution, quoteNote }) {
  const layout = useMemo(() => layoutBeam(attribution), [attribution])
  const labels = useMemo(() => beamLabels(layout), [layout])

  const { contributors, detractors, gainSum, lossSum, net, unmeasured, hasData } = attribution
  const netUp = net >= 0

  return (
    <Surface className="overflow-hidden p-0">
      <div className="grid grid-cols-1 min-[960px]:grid-cols-[296px_minmax(0,1fr)]">
        {/* ------------------------------------------------------- net */}
        <div className="border-b border-subtle p-4 min-[960px]:border-b-0 min-[960px]:border-r sm:p-5">
          <p className="t-eyebrow !text-text-tertiary">What is driving today</p>

          <div className="mt-2 flex flex-wrap items-end gap-2.5">
            <span
              className={`num font-display text-[34px] font-extrabold leading-[0.92] tracking-[-0.05em] sm:text-[38px] ${
                netUp ? 'text-up' : 'text-down'
              }`}
            >
              {hasData ? fmtMoneyRounded(net, { signed: true }) : '—'}
            </span>
            {hasData ? (
              <span
                className={`mb-1 flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12.5px]
                  font-bold tracking-[-0.02em] ${
                    netUp ? 'bg-up/[0.16] text-up' : 'bg-down/[0.16] text-down'
                  }`}
              >
                <svg width="9" height="9" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true">
                  <path d={netUp ? 'M6 1.5l4.4 7.5H1.6z' : 'M6 10.5L1.6 3h8.8z'} />
                </svg>
                {fmtPercent(percentOf(net, attribution.coveredValue))}
              </span>
            ) : null}
          </div>

          <p className="mt-2 text-[11.5px] text-text-secondary">
            {hasData
              ? `Net change in ${countLabel(attribution.measured.length, 'holding')} since yesterday's close, on ${fmtMoneyRounded(attribution.coveredValue)} of market value.`
              : 'No holding has both a live price and a previous close, so today’s move cannot be attributed.'}
          </p>

          <dl className="mt-4 grid grid-cols-2 gap-x-3.5 gap-y-3 border-t border-subtle pt-3.5">
            <Stat
              label="Contributors"
              value={`${contributors.length} · ${fmtMoneyRounded(gainSum)}`}
              tone="up"
              title={
                contributors.length
                  ? contributors
                      .map((r) => `${r.ticker} ${fmtMoneyRounded(r.contribution, { signed: true })}`)
                      .join(', ')
                  : 'No holding rose today.'
              }
            />
            <Stat
              label="Detractors"
              value={`${detractors.length} · ${fmtMoneyRounded(lossSum)}`}
              tone="down"
              title={
                detractors.length
                  ? detractors
                      .map((r) => `${r.ticker} ${fmtMoneyRounded(r.contribution, { signed: true })}`)
                      .join(', ')
                  : 'No holding fell today.'
              }
            />
          </dl>
        </div>

        {/* -------------------------------------------------- the beam */}
        <div className="min-w-0 p-4 sm:p-5">
          <div className="mb-3 flex flex-wrap items-baseline gap-2.5">
            <h2 className="t-eyebrow">Attribution</h2>
            <p className="text-[11px] text-text-tertiary">
              Every holding’s share of today’s move — width is dollars, not weight
            </p>
            <span className="ml-auto whitespace-nowrap text-[10px] text-text-tertiary">
              shares × change since prev close
            </span>
          </div>

          {hasData && layout.hasSpan ? (
            <>
              {/* Labels sit above the track and alternate rows so two
                  neighbouring names never overlap. Hidden on narrow
                  viewports, where the track itself is the only thing that
                  fits — the tooltips still name every segment. */}
              <div className="relative hidden h-[34px] sm:block" aria-hidden="true">
                {labels.map((label) => (
                  <span
                    key={label.key}
                    className="absolute flex -translate-x-1/2 items-baseline gap-1.5 whitespace-nowrap"
                    style={{ left: `${label.x}%`, top: label.row ? 0 : 16 }}
                  >
                    <span className="font-display text-[10.5px] font-bold tracking-[-0.03em] text-text-primary">
                      {label.ticker}
                    </span>
                    <span
                      className={`num text-[9.5px] font-bold ${
                        label.side === 'contributor' ? 'text-up' : 'text-down'
                      }`}
                    >
                      {fmtMoneyRounded(label.contribution, { signed: true })}
                    </span>
                  </span>
                ))}
              </div>

              <div
                className="track hatch-dim relative h-11 overflow-hidden rounded-panel"
                role="img"
                aria-label={beamSummary(attribution)}
              >
                {layout.segments.map((segment) => (
                  <span
                    key={segment.key}
                    title={segmentTip(segment)}
                    className="absolute inset-y-0 animate-grow-x"
                    style={{
                      left: `${segment.x}%`,
                      width: `${segment.width}%`,
                      background: `color-mix(in oklab, var(--accent-${
                        segment.side === 'contributor' ? 'green' : 'red'
                      }) ${segment.mix}%, var(--track-bg))`,
                      transformOrigin: segment.side === 'contributor' ? 'left' : 'right',
                      animationDelay: `${segment.delay}ms`,
                      boxShadow:
                        segment.side === 'contributor'
                          ? 'inset 1px 0 0 var(--e2-bg)'
                          : 'inset -1px 0 0 var(--e2-bg)',
                    }}
                  />
                ))}

                {/* Previous close — the anchor everything is measured from. */}
                <span
                  aria-hidden="true"
                  className="absolute -inset-y-0.5 w-0.5 -translate-x-1/2 bg-text-primary"
                  style={{ left: `${layout.zeroX}%` }}
                />
                {/* Net — dashed, because it is a derived position on the
                    track rather than a measured boundary between segments. */}
                <span
                  aria-hidden="true"
                  className="absolute inset-y-0 w-px -translate-x-1/2"
                  style={{
                    left: `${layout.netX}%`,
                    backgroundImage:
                      'repeating-linear-gradient(180deg, var(--text-primary) 0 4px, transparent 4px 8px)',
                  }}
                />
              </div>

              {/*
                The two totals are edge-anchored and always shown. The
                prev-close and net captions are POSITIONAL — they sit under
                their rules — so on a lopsided book (one $200 gain against
                $6,000 of losses) the anchor slides to the edge and they would
                print on top of the totals. They are dropped when there is no
                room rather than overlapped: both are still drawn on the track
                itself, and the net is already stated at display size to the
                left, so nothing measurable is lost.
              */}
              <div className="relative mt-1.5 h-[18px] text-[10px]">
                <span
                  className="num absolute left-0 top-0 font-bold text-down"
                  title={sideTip(detractors, 'fell', lossSum)}
                >
                  {fmtMoneyRounded(-lossSum)} detractors
                </span>
                {hasRoom(layout.zeroX) ? (
                  <span
                    className="absolute top-0 hidden -translate-x-1/2 font-semibold text-text-tertiary sm:block"
                    style={{ left: `${layout.zeroX}%` }}
                  >
                    prev close
                  </span>
                ) : null}
                {hasRoom(layout.netX) && Math.abs(layout.netX - layout.zeroX) > 14 ? (
                  <span
                    className={`num absolute top-0 hidden -translate-x-1/2 whitespace-nowrap
                      font-bold sm:block ${netUp ? 'text-up' : 'text-down'}`}
                    style={{ left: `${layout.netX}%` }}
                  >
                    net {fmtMoneyRounded(net, { signed: true })}
                  </span>
                ) : null}
                <span
                  className="num absolute right-0 top-0 font-bold text-up"
                  title={sideTip(contributors, 'rose', gainSum)}
                >
                  {fmtMoneyRounded(gainSum)} contributors
                </span>
              </div>
            </>
          ) : (
            <div className="track hatch-dim grid h-11 place-items-center rounded-panel px-4">
              <p className="text-[11.5px] text-text-secondary">
                {hasData
                  ? 'Every priced holding closed level with its previous close.'
                  : 'Attribution needs a live price and a previous close.'}
              </p>
            </div>
          )}

          {/* Incompleteness is stated HERE, next to the chart that is
              incomplete — not in a footnote the reader has to find. */}
          {unmeasured.length > 0 ? (
            <p className="mt-3 border-t border-subtle pt-2.5 text-[11px] leading-relaxed text-warn">
              {countLabel(unmeasured.length, 'holding')} ({unmeasured.map((r) => r.ticker).join(', ')}){' '}
              {unmeasured.length === 1 ? 'has' : 'have'} no live price or no previous close, so{' '}
              {unmeasured.length === 1 ? 'it is' : 'they are'} absent from this beam rather than
              shown at zero. The totals above do not include{' '}
              {unmeasured.length === 1 ? 'it' : 'them'}.
            </p>
          ) : null}

          {quoteNote ? (
            <p className="mt-2 text-[11px] leading-relaxed text-text-tertiary">{quoteNote}</p>
          ) : null}
        </div>
      </div>
    </Surface>
  )
}

/* ------------------------------------------------------------- helpers */

function Stat({ label, value, tone, title }) {
  return (
    <div title={title} className="cursor-help">
      <dt className="t-eyebrow !text-[9.5px] !text-text-tertiary">{label}</dt>
      <dd
        className={`num mt-1 whitespace-nowrap font-display text-[15px] font-bold tracking-[-0.035em] ${
          tone === 'up' ? 'text-up' : 'text-down'
        }`}
      >
        {value}
      </dd>
    </div>
  )
}

/** Clear of both edge-anchored totals, which run ~22% of the track each. */
function hasRoom(x) {
  return x > 24 && x < 76
}

function percentOf(net, coveredValue) {
  const opening = coveredValue - net
  return opening ? (net / opening) * 100 : null
}

function countLabel(n, noun) {
  return `${n} ${noun}${n === 1 ? '' : 's'}`
}

/** The full arithmetic, so a bar can be checked rather than believed. */
function segmentTip(segment) {
  const { row, side, shareOfSide } = segment
  const verb = side === 'contributor' ? 'added' : 'took off'
  return [
    `${row.ticker} · ${row.company}`,
    `${verb} ${fmtMoneyRounded(Math.abs(row.contribution))} today.`,
    `${row.shares} shares × (${fmtMoney(row.price)} − ${fmtMoney(row.prevClose)} prev close)`,
    `= ${fmtMoney(row.contribution)}, a ${fmtPercent(row.dayPercent)} move.`,
    `${Math.round(shareOfSide * 100)}% of today's ${side === 'contributor' ? 'gains' : 'losses'}.`,
  ].join(' ')
}

function sideTip(rows, verb, total) {
  if (rows.length === 0) return `No holding ${verb} today.`
  return `${countLabel(rows.length, 'holding')} ${verb} today, totalling ${fmtMoney(total)}: ${rows
    .map((r) => `${r.ticker} ${fmtMoneyRounded(r.contribution, { signed: true })}`)
    .join(', ')}.`
}

function beamSummary(attribution) {
  return `Attribution of today's ${fmtMoneyRounded(attribution.net, {
    signed: true,
  })} move: ${attribution.contributors.length} holdings contributed ${fmtMoneyRounded(
    attribution.gainSum,
  )} and ${attribution.detractors.length} detracted ${fmtMoneyRounded(attribution.lossSum)}.`
}
